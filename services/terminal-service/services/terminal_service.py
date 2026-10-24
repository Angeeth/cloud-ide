import os
import shutil
import subprocess
import tempfile
import httpx
from typing import Dict, Any, Optional
from fastapi import HTTPException, status
from config import settings
from shared.common.auth import UserClaims

class TerminalService:
    # In-memory dictionary tracking current working directory per project session
    # key: f"{project_id}:{user_id}" -> relative cwd path (e.g., "" for root, "test2" for test2)
    _cwds: Dict[str, str] = {}
    _old_cwds: Dict[str, str] = {}

    @classmethod
    def _format_display_path(cls, rel_cwd: str) -> str:
        if not rel_cwd or rel_cwd == ".":
            return "~/workspace"
        clean = rel_cwd.replace("\\", "/").strip("/")
        return f"~/workspace/{clean}"

    @classmethod
    def _get_effective_cwd(cls, project_id: str, user_id: str, requested_cwd: Optional[str]) -> str:
        session_key = f"{project_id}:{user_id}"
        if requested_cwd is not None:
            clean = requested_cwd.strip().replace("\\", "/").strip("/")
            if clean.startswith("..") or clean == ".":
                clean = ""
            cls._cwds[session_key] = clean
            return clean
        return cls._cwds.get(session_key, "")

    @staticmethod
    def _verify_permission(project_id: str, current_user: UserClaims) -> str:
        role = "OWNER"
        try:
            with httpx.Client(timeout=5.0) as client:
                res = client.get(f"{settings.PROJECT_SERVICE_URL}/projects/{project_id}/role?user_id={current_user.id}")
                if res.status_code == 200:
                    role = res.json().get("role")
                    if not role:
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this project")
                    if role == "VIEWER":
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="VIEWER role cannot execute terminal commands")
        except HTTPException:
            raise
        except Exception:
            pass
        return role

    @staticmethod
    def _sync_workspace_to_file_service(project_id: str, workspace_dir: str):
        items = []
        ignored_names = {".git", "__pycache__", ".pytest_cache", ".cache", "node_modules", ".venv", "venv", ".mirage"}
        for root, dirs, files_list in os.walk(workspace_dir):
            dirs[:] = [d for d in dirs if d not in ignored_names and not d.startswith(".")]
            rel_root = os.path.relpath(root, workspace_dir).replace("\\", "/")
            if rel_root == ".":
                rel_root = ""

            for d in dirs:
                f_path = f"{rel_root}/{d}".lstrip("/")
                items.append({"path": f_path, "type": "folder", "content": ""})

            for f in files_list:
                if f.startswith(".") or f in ignored_names:
                    continue
                fl_path = f"{rel_root}/{f}".lstrip("/")
                full_path = os.path.join(root, f)
                content = ""
                try:
                    if os.path.isfile(full_path) and os.path.getsize(full_path) < 2 * 1024 * 1024:
                        with open(full_path, "r", encoding="utf-8", errors="replace") as fl:
                            content = fl.read()
                except Exception:
                    pass
                items.append({"path": fl_path, "type": "file", "content": content})

        try:
            with httpx.Client(timeout=10.0) as client:
                client.post(
                    f"{settings.FILE_SERVICE_URL}/projects/{project_id}/sync-fs",
                    json={"items": items}
                )
        except Exception as e:
            print(f"Warning: could not sync workspace back to file-service: {e}")

    @classmethod
    def execute_command(
        cls,
        project_id: str,
        command: str,
        current_user: UserClaims,
        cwd: Optional[str] = None
    ) -> Dict[str, Any]:
        role = cls._verify_permission(project_id, current_user)
        cmd = command.strip()
        session_key = f"{project_id}:{current_user.id}"

        # Setup persistent workspace directory on disk
        workspace_base = os.path.join(tempfile.gettempdir(), "mirage_workspaces")
        os.makedirs(workspace_base, exist_ok=True)
        workspace_dir = os.path.join(workspace_base, project_id)
        os.makedirs(workspace_dir, exist_ok=True)

        # Sync files from file-service into workspace
        try:
            with httpx.Client(timeout=10.0) as client:
                res = client.get(f"{settings.FILE_SERVICE_URL}/projects/{project_id}/files/raw")
                if res.status_code == 200:
                    files_dict = res.json()
                    for rel_p, content in files_dict.items():
                        clean_rel = rel_p.lstrip("/\\")
                        full_p = os.path.join(workspace_dir, clean_rel.replace("/", os.sep))
                        os.makedirs(os.path.dirname(full_p), exist_ok=True)
                        with open(full_p, "w", encoding="utf-8") as f:
                            f.write(content or "")

                expected_files = {rel_p.lstrip("/\\").replace("/", os.sep) for rel_p in files_dict.keys()}
                expected_folders = set()
                # Also sync folders from file-service
                folders_res = client.get(f"{settings.FILE_SERVICE_URL}/projects/{project_id}/folders/raw")
                if folders_res.status_code == 200:
                    for rel_f in folders_res.json():
                        clean_f = rel_f.lstrip("/\\")
                        clean_norm = clean_f.replace("/", os.sep)
                        expected_folders.add(clean_norm)
                        f_full = os.path.join(workspace_dir, clean_norm)
                        os.makedirs(f_full, exist_ok=True)

                # Prune orphan folders on disk so terminal matches database tree
                for root, dirs, files_on_disk in os.walk(workspace_dir, topdown=False):
                    rel = os.path.relpath(root, workspace_dir)
                    if rel != "." and not any(p.startswith(".") for p in rel.split(os.sep)):
                        if rel not in expected_folders and not any(ef.startswith(rel + os.sep) for ef in expected_files):
                            try:
                                if not os.listdir(root):
                                    os.rmdir(root)
                            except Exception:
                                pass
        except Exception as e:
            print(f"Warning: could not sync files from file-service: {e}")

        # Determine effective working directory
        current_rel_cwd = cls._get_effective_cwd(project_id, current_user.id, cwd)
        effective_cwd = os.path.normpath(os.path.join(workspace_dir, current_rel_cwd.replace("/", os.sep)))

        # Boundary check: ensure effective_cwd does not escape workspace_dir
        try:
            if not effective_cwd.startswith(workspace_dir):
                effective_cwd = workspace_dir
                current_rel_cwd = ""
                cls._cwds[session_key] = ""
        except Exception:
            effective_cwd = workspace_dir
            current_rel_cwd = ""
            cls._cwds[session_key] = ""

        # If effective_cwd doesn't exist on disk, fallback to workspace_dir
        if not os.path.exists(effective_cwd) or not os.path.isdir(effective_cwd):
            effective_cwd = workspace_dir
            current_rel_cwd = ""
            cls._cwds[session_key] = ""

        display_cwd = cls._format_display_path(current_rel_cwd)

        if not cmd:
            return {"output": "", "exit_code": 0, "cwd": current_rel_cwd, "display_cwd": display_cwd}

        # Fast built-ins
        if cmd == "clear":
            return {"output": "", "clear": True, "exit_code": 0, "cwd": current_rel_cwd, "display_cwd": display_cwd}

        if cmd == "whoami":
            return {
                "output": f"{current_user.name or current_user.id} ({current_user.email or ''}) - [{role}]",
                "exit_code": 0,
                "cwd": current_rel_cwd,
                "display_cwd": display_cwd
            }

        if cmd == "pwd":
            pwd_out = "/workspace" if not current_rel_cwd else f"/workspace/{current_rel_cwd}"
            return {
                "output": pwd_out,
                "exit_code": 0,
                "cwd": current_rel_cwd,
                "display_cwd": display_cwd
            }

        if cmd == "help":
            help_text = (
                "Mirage Linux Terminal v1.1\n"
                "Supported Commands: cd <dir>, pwd, ls [-la], cat <file>, touch <file>, mkdir <dir>, rm [-rf] <file/dir>, python <file>, node <file>, gcc <file>, whoami, clear\n"
                "Full Linux directory navigation and persistence with real-time file-service sync."
            )
            return {
                "output": help_text,
                "exit_code": 0,
                "cwd": current_rel_cwd,
                "display_cwd": display_cwd
            }

        # ==========================================
        # LINUX 'cd' COMMAND HANDLER
        # ==========================================
        if cmd == "cd" or cmd.startswith("cd ") or cmd.startswith("cd\t"):
            target = cmd[2:].strip().strip("\"'")
            old_rel = current_rel_cwd

            # cd without arguments, or ~, or ~/workspace, or /workspace moves to root
            if not target or target in ("~", "~/", "~/workspace", "/workspace", "/workspace/", "/"):
                new_rel = ""
                cls._old_cwds[session_key] = old_rel
                cls._cwds[session_key] = new_rel
                return {
                    "output": "",
                    "exit_code": 0,
                    "cwd": new_rel,
                    "display_cwd": cls._format_display_path(new_rel)
                }

            # cd - switches back to previous directory (like bash)
            if target == "-":
                prev_rel = cls._old_cwds.get(session_key, "")
                prev_path = os.path.normpath(os.path.join(workspace_dir, prev_rel.replace("/", os.sep)))
                if not os.path.exists(prev_path) or not os.path.isdir(prev_path):
                    prev_rel = ""
                cls._old_cwds[session_key] = old_rel
                cls._cwds[session_key] = prev_rel
                disp = cls._format_display_path(prev_rel)
                return {
                    "output": disp,
                    "exit_code": 0,
                    "cwd": prev_rel,
                    "display_cwd": disp
                }

            # Normalize target path
            if target.startswith("~/workspace/"):
                target_rel = target[len("~/workspace/"):].lstrip("/")
                base_dir = workspace_dir
            elif target.startswith("/workspace/"):
                target_rel = target[len("/workspace/"):].lstrip("/")
                base_dir = workspace_dir
            elif target.startswith("~/"):
                target_rel = target[2:].lstrip("/")
                base_dir = workspace_dir
            elif target.startswith("/"):
                target_rel = target.lstrip("/")
                base_dir = workspace_dir
            else:
                target_rel = target
                base_dir = effective_cwd

            candidate_path = os.path.normpath(os.path.join(base_dir, target_rel.replace("/", os.sep)))

            # Sandboxing: Ensure path does not escape workspace_dir
            try:
                common = os.path.commonpath([workspace_dir, candidate_path])
                if common != workspace_dir:
                    candidate_path = workspace_dir
            except Exception:
                candidate_path = workspace_dir

            # If not found directly, try case-insensitive match on directory name
            if not os.path.exists(candidate_path):
                parent = os.path.dirname(candidate_path)
                base_name = os.path.basename(candidate_path).lower()
                if os.path.exists(parent) and os.path.isdir(parent):
                    for entry in os.listdir(parent):
                        if entry.lower() == base_name:
                            candidate_path = os.path.join(parent, entry)
                            break

            # Error cases matching standard Linux bash
            if not os.path.exists(candidate_path):
                return {
                    "output": f"cd: {target}: No such file or directory",
                    "exit_code": 1,
                    "cwd": current_rel_cwd,
                    "display_cwd": display_cwd
                }

            if not os.path.isdir(candidate_path):
                return {
                    "output": f"cd: {target}: Not a directory",
                    "exit_code": 1,
                    "cwd": current_rel_cwd,
                    "display_cwd": display_cwd
                }

            # Successfully resolved directory
            new_rel = os.path.relpath(candidate_path, workspace_dir).replace("\\", "/")
            if new_rel == ".":
                new_rel = ""

            cls._old_cwds[session_key] = old_rel
            cls._cwds[session_key] = new_rel

            return {
                "output": "",
                "exit_code": 0,
                "cwd": new_rel,
                "display_cwd": cls._format_display_path(new_rel)
            }

        # ==========================================
        # LINUX 'ls' / 'dir' HANDLER
        # ==========================================
        cmd_tokens = cmd.split()
        if cmd_tokens and cmd_tokens[0] in ("ls", "dir"):
            args = cmd_tokens[1:]
            show_all = any("-a" in a for a in args) or any("-la" in a or "-al" in a for a in args)

            target_list_dir = effective_cwd
            path_args = [a for a in args if not a.startswith("-")]
            if path_args:
                p_arg = path_args[0].strip("\"'")
                c_path = os.path.normpath(os.path.join(effective_cwd, p_arg.replace("/", os.sep)))
                if os.path.exists(c_path) and os.path.isdir(c_path):
                    target_list_dir = c_path
                elif not os.path.exists(c_path):
                    return {
                        "output": f"ls: cannot access '{p_arg}': No such file or directory",
                        "exit_code": 2,
                        "cwd": current_rel_cwd,
                        "display_cwd": display_cwd
                    }

            # On Linux container with real ls binary:
            if shutil.which("ls"):
                try:
                    proc_cmd = cmd if any(a.startswith("-") for a in args) else "ls -F --color=never"
                    proc = subprocess.Popen(
                        proc_cmd,
                        shell=True,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                        cwd=target_list_dir
                    )
                    stdout, stderr = proc.communicate(timeout=settings.COMMAND_TIMEOUT_SECONDS)
                    out = stdout or ""
                    if stderr:
                        out += ("\n" + stderr if out else stderr)
                    return {
                        "output": out.rstrip(),
                        "exit_code": proc.returncode,
                        "cwd": current_rel_cwd,
                        "display_cwd": display_cwd
                    }
                except Exception:
                    pass

            # Python fallback: format entries with directories followed by '/'
            try:
                entries = sorted(os.scandir(target_list_dir), key=lambda e: (not e.is_dir(), e.name.lower()))
                items = []
                for e in entries:
                    if not show_all and e.name.startswith("."):
                        continue
                    items.append(f"{e.name}/" if e.is_dir() else e.name)
                return {
                    "output": "  ".join(items) if items else "",
                    "exit_code": 0,
                    "cwd": current_rel_cwd,
                    "display_cwd": display_cwd
                }
            except Exception as e:
                return {
                    "output": f"ls: {str(e)}",
                    "exit_code": 1,
                    "cwd": current_rel_cwd,
                    "display_cwd": display_cwd
                }

        # ==========================================
        # LINUX 'touch' HANDLER (with Windows host fallback)
        # ==========================================
        if cmd.startswith("touch "):
            target_file = cmd[6:].strip().strip("\"'")
            if not shutil.which("touch"):
                target_path = os.path.normpath(os.path.join(effective_cwd, target_file.replace("/", os.sep)))
                try:
                    common = os.path.commonpath([workspace_dir, target_path])
                    if common == workspace_dir:
                        os.makedirs(os.path.dirname(target_path), exist_ok=True)
                        open(target_path, "a", encoding="utf-8").close()
                        cls._sync_workspace_to_file_service(project_id, workspace_dir)
                        return {
                            "output": "",
                            "exit_code": 0,
                            "cwd": current_rel_cwd,
                            "display_cwd": display_cwd
                        }
                except Exception as e:
                    return {
                        "output": f"touch: cannot touch '{target_file}': {str(e)}",
                        "exit_code": 1,
                        "cwd": current_rel_cwd,
                        "display_cwd": display_cwd
                    }

        # ==========================================
        # LINUX 'cat' HANDLER
        # ==========================================
        if cmd.startswith("cat "):
            target = cmd[4:].strip().strip("\"'")
            target_path = os.path.normpath(os.path.join(effective_cwd, target.replace("/", os.sep)))
            if not os.path.exists(target_path):
                root_path = os.path.normpath(os.path.join(workspace_dir, target.replace("/", os.sep)))
                if os.path.exists(root_path):
                    target_path = root_path

            if os.path.exists(target_path) and os.path.isfile(target_path):
                try:
                    with open(target_path, "r", encoding="utf-8", errors="replace") as f:
                        return {
                            "output": f.read(),
                            "exit_code": 0,
                            "cwd": current_rel_cwd,
                            "display_cwd": display_cwd
                        }
                except Exception as e:
                    return {
                        "output": f"cat: {target}: {str(e)}",
                        "exit_code": 1,
                        "cwd": current_rel_cwd,
                        "display_cwd": display_cwd
                    }
            return {
                "output": f"cat: {target}: No such file or directory",
                "exit_code": 1,
                "cwd": current_rel_cwd,
                "display_cwd": display_cwd
            }

        # ==========================================
        # SCRIPT RUNNER RESOLUTION (python, node, etc.)
        # ==========================================
        cmd_parts = cmd.split(maxsplit=1)
        if len(cmd_parts) == 2:
            runner, arg = cmd_parts[0], cmd_parts[1].strip().strip("\"'")
            if runner in ("python", "python3", "node", "gcc", "g++", "javac", "java"):
                arg_path = os.path.join(effective_cwd, arg.replace("/", os.sep))
                if not os.path.exists(arg_path):
                    try:
                        matched = False
                        for f in os.listdir(effective_cwd):
                            if f.lower() == arg.lower():
                                cmd = f"{runner} {f}"
                                matched = True
                                break
                        if not matched and effective_cwd != workspace_dir:
                            root_arg_path = os.path.join(workspace_dir, arg.replace("/", os.sep))
                            if os.path.exists(root_arg_path):
                                cmd = f"{runner} {root_arg_path}"
                    except Exception:
                        pass

        # ==========================================
        # GENERAL SUBPROCESS EXECUTION IN CWD
        # ==========================================
        try:
            proc = subprocess.Popen(
                cmd,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=effective_cwd
            )
            stdout, stderr = proc.communicate(timeout=settings.COMMAND_TIMEOUT_SECONDS)
            output = stdout or ""
            if stderr:
                output += ("\n" + stderr if output else stderr)

            # Sync workspace disk changes back to file-service
            cls._sync_workspace_to_file_service(project_id, workspace_dir)

            return {
                "output": output or "",
                "exit_code": proc.returncode,
                "cwd": current_rel_cwd,
                "display_cwd": display_cwd
            }
        except subprocess.TimeoutExpired:
            proc.kill()
            return {
                "output": f"Command execution timed out after {settings.COMMAND_TIMEOUT_SECONDS}s.",
                "exit_code": 124,
                "cwd": current_rel_cwd,
                "display_cwd": display_cwd
            }
        except Exception as e:
            return {
                "output": f"Terminal error: {str(e)}",
                "exit_code": 1,
                "cwd": current_rel_cwd,
                "display_cwd": display_cwd
            }
