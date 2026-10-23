import os
import subprocess
import tempfile
import httpx
from typing import Dict, Any
from fastapi import HTTPException, status
from config import settings
from shared.common.auth import UserClaims

class TerminalService:
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

    @staticmethod
    def execute_command(project_id: str, command: str, current_user: UserClaims) -> Dict[str, Any]:
        role = TerminalService._verify_permission(project_id, current_user)
        cmd = command.strip()

        if not cmd:
            return {"output": "", "exit_code": 0}

        # Fast built-ins
        if cmd == "clear":
            return {"output": "", "clear": True, "exit_code": 0}
        if cmd == "whoami":
            return {"output": f"{current_user.name or current_user.id} ({current_user.email or ''}) - [{role}]", "exit_code": 0}
        if cmd == "pwd":
            return {"output": f"/workspace/{project_id}", "exit_code": 0}
        if cmd == "help":
            help_text = (
                "Mirage Terminal v1.0 (Microservices Architecture)\n"
                "Supported Commands: ls, cd, cat <file>, python <file>, node <file>, gcc <file>, mkdir, touch, pwd, whoami, clear\n"
                "Persistent Project Directory synced with File Service."
            )
            return {"output": help_text, "exit_code": 0}

        # Setup persistent workspace directory
        workspace_base = os.path.join(tempfile.gettempdir(), "mirage_workspaces")
        os.makedirs(workspace_base, exist_ok=True)
        workspace_dir = os.path.join(workspace_base, project_id)
        os.makedirs(workspace_dir, exist_ok=True)

        # Sync files from file-service
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

                # Also sync folders from file-service
                folders_res = client.get(f"{settings.FILE_SERVICE_URL}/projects/{project_id}/folders/raw")
                if folders_res.status_code == 200:
                    for rel_f in folders_res.json():
                        clean_f = rel_f.lstrip("/\\")
                        f_full = os.path.join(workspace_dir, clean_f.replace("/", os.sep))
                        os.makedirs(f_full, exist_ok=True)
        except Exception as e:
            print(f"Warning: could not sync files from file-service: {e}")

        # Handle 'ls' or 'dir'
        if cmd in ("ls", "dir", "ls -l", "ls -a"):
            items = []
            for root, dirs, files_list in os.walk(workspace_dir):
                rel_root = os.path.relpath(root, workspace_dir)
                if rel_root == ".":
                    rel_root = ""
                for d in dirs:
                    path_str = os.path.join(rel_root, d).replace("\\", "/")
                    if not rel_root:
                        items.append(f"{path_str}/")
                for fl in files_list:
                    path_str = os.path.join(rel_root, fl).replace("\\", "/")
                    items.append(path_str)
            top_items = set()
            for item in items:
                parts = item.split('/')
                if len(parts) > 1 and parts[0]:
                    top_items.add(f"{parts[0]}/")
                elif parts[0]:
                    top_items.add(parts[0])
            return {"output": "  ".join(sorted(top_items)) if top_items else "", "exit_code": 0}

        # Handle 'cat <filename>'
        if cmd.startswith("cat "):
            target = cmd[4:].strip()
            target_path = os.path.join(workspace_dir, target.replace("/", os.sep))
            if not os.path.exists(target_path):
                target_src = os.path.join(workspace_dir, "src", target.replace("/", os.sep))
                if os.path.exists(target_src):
                    target_path = target_src

            if os.path.exists(target_path) and os.path.isfile(target_path):
                with open(target_path, "r", encoding="utf-8", errors="replace") as f:
                    return {"output": f.read(), "exit_code": 0}
            return {"output": f"cat: {target}: No such file or directory", "exit_code": 1}

        # Auto-path resolution for script commands
        cmd_parts = cmd.split(maxsplit=1)
        if len(cmd_parts) == 2:
            runner, arg = cmd_parts[0], cmd_parts[1].strip()
            if runner in ("python", "python3", "node", "gcc", "g++"):
                arg_path = os.path.join(workspace_dir, arg.replace("/", os.sep))
                if not os.path.exists(arg_path):
                    arg_src_path = os.path.join(workspace_dir, "src", arg.replace("/", os.sep))
                    if os.path.exists(arg_src_path):
                        cmd = f"{runner} src/{arg}"

        # Run command in workspace
        try:
            proc = subprocess.Popen(
                cmd,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=workspace_dir
            )
            stdout, stderr = proc.communicate(timeout=settings.COMMAND_TIMEOUT_SECONDS)
            output = stdout
            if stderr:
                output += ("\n" + stderr if output else stderr)

            # Sync workspace disk changes (folders, files) back to file-service
            TerminalService._sync_workspace_to_file_service(project_id, workspace_dir)

            return {"output": output or "", "exit_code": proc.returncode}
        except subprocess.TimeoutExpired:
            proc.kill()
            return {"output": f"Command execution timed out after {settings.COMMAND_TIMEOUT_SECONDS}s.", "exit_code": 124}
        except Exception as e:
            return {"output": f"Terminal error: {str(e)}", "exit_code": 1}
