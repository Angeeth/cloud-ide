import os
import subprocess
import tempfile
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.file import File
from app.models.project import Project
from app.models.project_member import RoleEnum
from app.services.project_service import ProjectService
from app.core.s3 import storage_manager

router = APIRouter(prefix="/projects/{project_id}/terminal", tags=["Terminal"])

class TerminalCommandRequest(BaseModel):
    command: str

@router.post("")
def execute_terminal_command(
    project_id: str,
    req: TerminalCommandRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    role = ProjectService.get_member_role(db, project_id, current_user.id)
    if role == RoleEnum.VIEWER.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="VIEWER role cannot execute terminal commands")

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    cmd = req.command.strip()
    if not cmd:
        return {"output": "", "exit_code": 0}

    # Handle built-in fast commands
    if cmd == "clear":
        return {"output": "", "clear": True, "exit_code": 0}
    if cmd == "whoami":
        return {"output": f"{current_user.name} ({current_user.email}) - [{role}]", "exit_code": 0}
    if cmd == "pwd":
        return {"output": f"/workspace/{project.name}", "exit_code": 0}
    if cmd == "help":
        help_text = (
            "Mirage Terminal v1.0\n"
            "Supported Commands: ls, cd, cat <file>, python <file>, node <file>, gcc <file>, mkdir, touch, pwd, whoami, clear\n"
            "Note: Project files are organized in the 'src/' directory (e.g. 'python src/main.py')."
        )
        return {"output": help_text, "exit_code": 0}

    # Setup persistent workspace directory for project
    workspace_base = os.path.join(tempfile.gettempdir(), "mirage_workspaces")
    os.makedirs(workspace_base, exist_ok=True)
    workspace_dir = os.path.join(workspace_base, project_id)
    os.makedirs(workspace_dir, exist_ok=True)

    # Sync DB project files into persistent workspace directory
    all_files = db.query(File).filter(File.project_id == project_id, File.type == "file").all()
    for f in all_files:
        full_p = os.path.join(workspace_dir, f.path.replace("/", os.sep))
        os.makedirs(os.path.dirname(full_p), exist_ok=True)
        # Always write file if missing or fetch content from S3/DB
        if f.s3_key:
            try:
                content = storage_manager.get_file(f.s3_key)
                with open(full_p, "w", encoding="utf-8") as file_out:
                    file_out.write(content)
            except Exception:
                pass

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
        # Show top-level items cleanly
        top_items = set()
        for item in items:
            parts = item.split('/')
            if len(parts) > 1 and parts[0]:
                top_items.add(f"{parts[0]}/")
            elif parts[0]:
                top_items.add(parts[0])
        return {"output": "  ".join(sorted(top_items)) if top_items else "[Empty Directory]", "exit_code": 0}

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

    # Smart path auto-resolution for file execution commands (e.g. 'python main.py' -> 'python src/main.py')
    cmd_parts = cmd.split(maxsplit=1)
    if len(cmd_parts) == 2:
        runner, arg = cmd_parts[0], cmd_parts[1].strip()
        if runner in ("python", "python3", "node", "gcc", "g++"):
            arg_path = os.path.join(workspace_dir, arg.replace("/", os.sep))
            if not os.path.exists(arg_path):
                arg_src_path = os.path.join(workspace_dir, "src", arg.replace("/", os.sep))
                if os.path.exists(arg_src_path):
                    cmd = f"{runner} src/{arg}"

    # Run shell command inside persistent workspace
    try:
        proc = subprocess.Popen(
            cmd,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=workspace_dir
        )
        stdout, stderr = proc.communicate(timeout=10)
        output = stdout
        if stderr:
            output += ("\n" + stderr if output else stderr)
        return {"output": output or "[Command executed with no output]", "exit_code": proc.returncode}
    except subprocess.TimeoutExpired:
        proc.kill()
        return {"output": "Command execution timed out after 10s.", "exit_code": 124}
    except Exception as e:
        return {"output": f"Terminal error: {str(e)}", "exit_code": 1}
