import os
import shutil
import zipfile
import urllib.request
import subprocess
import tempfile
import httpx
from typing import List, Optional, Dict
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from config import settings
from models.project import Project
from models.project_member import ProjectMember, RoleEnum
from schemas.project import ProjectCreate, ProjectUpdate, ProjectMemberAdd, UserResponse
from shared.common.auth import UserClaims

STARTER_TEMPLATES = {
    "python": {
        "main_file": "main.py",
        "code": "def main():\n    print('Welcome to Mirage IDE')\n\nif __name__ == '__main__':\n    main()\n"
    },
    "javascript": {
        "main_file": "index.js",
        "code": "function main() {\n    console.log('Welcome to Mirage IDE');\n}\n\nmain();\n"
    },
    "java": {
        "main_file": "Main.java",
        "code": "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Welcome to Mirage IDE\");\n    }\n}\n"
    },
    "c": {
        "main_file": "main.c",
        "code": "#include <stdio.h>\n\nint main() {\n    printf(\"Welcome to Mirage IDE\\n\");\n    return 0;\n}\n"
    },
    "cpp": {
        "main_file": "main.cpp",
        "code": "#include <iostream>\n\nint main() {\n    std::cout << \"Welcome to Mirage IDE\" << std::endl;\n    return 0;\n}\n"
    }
}

class ProjectService:
    @staticmethod
    def _fetch_user_details(user_id: str) -> Optional[UserResponse]:
        """Fetch user profile details from auth-service."""
        try:
            with httpx.Client(timeout=5.0) as client:
                res = client.get(f"{settings.AUTH_SERVICE_URL}/users/{user_id}")
                if res.status_code == 200:
                    data = res.json()
                    return UserResponse(
                        id=data["id"],
                        email=data["email"],
                        name=data["name"]
                    )
        except Exception:
            pass
        return UserResponse(id=user_id, email=f"{user_id[:8]}@mirage.dev", name=f"User {user_id[:8]}")

    @staticmethod
    def _notify_file_service_init(project_id: str, language: str, project_name: str, description: Optional[str]):
        """Notify File Service to create starter files for new project."""
        try:
            with httpx.Client(timeout=10.0) as client:
                client.post(
                    f"{settings.FILE_SERVICE_URL}/projects/{project_id}/starter",
                    json={
                        "language": language,
                        "project_name": project_name,
                        "description": description or ""
                    }
                )
        except Exception as e:
            print(f"Warning: Failed to notify file-service to initialize starter files: {e}")

    @staticmethod
    def _notify_file_service_delete(project_id: str):
        """Notify File Service to delete all project files."""
        try:
            with httpx.Client(timeout=10.0) as client:
                client.delete(f"{settings.FILE_SERVICE_URL}/projects/{project_id}/files-all")
        except Exception as e:
            print(f"Warning: Failed to notify file-service to delete project files: {e}")

    @staticmethod
    def create_project(db: Session, project_in: ProjectCreate, current_user: UserClaims) -> Project:
        lang = project_in.language.lower()
        if lang not in STARTER_TEMPLATES:
            lang = "python"

        project = Project(
            name=project_in.name,
            description=project_in.description,
            language=lang,
            owner_id=current_user.id
        )
        db.add(project)
        db.commit()
        db.refresh(project)

        owner_member = ProjectMember(
            project_id=project.id,
            user_id=current_user.id,
            role=RoleEnum.OWNER.value
        )
        db.add(owner_member)
        db.commit()

        # Initialize starter files via file-service
        ProjectService._notify_file_service_init(
            project_id=project.id,
            language=lang,
            project_name=project.name,
            description=project.description
        )

        db.refresh(project)
        project.user_role = RoleEnum.OWNER.value
        project.owner = UserResponse(id=current_user.id, email=current_user.email or "", name=current_user.name or "")
        return project

    @staticmethod
    def clone_github_repo(db: Session, repo_url: str, custom_name: Optional[str], current_user: UserClaims) -> Project:
        url = repo_url.strip()
        if not url:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Repository URL is required")

        if url.endswith("/"):
            url = url[:-1]

        repo_name = url.split("/")[-1].replace(".git", "")
        project_name = (custom_name and custom_name.strip()) or repo_name or "Cloned-Project"
        git_target_url = url if url.endswith(".git") else f"{url}.git"

        with tempfile.TemporaryDirectory() as temp_dir:
            success = False

            # Strategy 1: Fast Zipball HTTP Download
            parts = url.rstrip("/").split("/")
            if len(parts) >= 5 and "github.com" in parts[2]:
                gh_owner, gh_repo = parts[3], parts[4].replace(".git", "")
                for branch in ("main", "master"):
                    try:
                        zip_url = f"https://github.com/{gh_owner}/{gh_repo}/archive/refs/heads/{branch}.zip"
                        zip_path = os.path.join(temp_dir, "repo.zip")
                        req = urllib.request.Request(zip_url, headers={"User-Agent": "Mozilla/5.0"})
                        with urllib.request.urlopen(req, timeout=30) as resp, open(zip_path, "wb") as out:
                            out.write(resp.read())

                        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                            zip_ref.extractall(temp_dir)

                        os.remove(zip_path)

                        subfolders = [os.path.join(temp_dir, d) for d in os.listdir(temp_dir) if os.path.isdir(os.path.join(temp_dir, d))]
                        if len(subfolders) == 1:
                            top_sub = subfolders[0]
                            for item in os.listdir(top_sub):
                                shutil.move(os.path.join(top_sub, item), os.path.join(temp_dir, item))
                            os.rmdir(top_sub)

                        success = True
                        break
                    except Exception:
                        pass

            # Strategy 2: Git Clone
            if not success:
                try:
                    clone_env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
                    res = subprocess.run(
                        ["git", "clone", "--depth", "1", git_target_url, temp_dir],
                        capture_output=True,
                        text=True,
                        env=clone_env,
                        timeout=180
                    )
                    if res.returncode != 0:
                        err_msg = res.stderr or res.stdout or "Failed to clone GitHub repository."
                        if "Authentication failed" in err_msg or "Repository not found" in err_msg:
                            err_msg = "Repository not found or is private. Please make sure the repository is public."
                        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Git Clone Error: {err_msg.strip()}")
                except subprocess.TimeoutExpired:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Git clone request timed out. The repository might be too large or network is slow.")
                except Exception as e:
                    if isinstance(e, HTTPException):
                        raise e
                    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Clone error: {str(e)}")

            # Detect primary language
            lang_counts = {"python": 0, "javascript": 0, "java": 0, "c": 0}
            for root, _, files in os.walk(temp_dir):
                if ".git" in root.split(os.sep):
                    continue
                for f in files:
                    ext = f.split(".")[-1].lower()
                    if ext in ("py", "ipynb"): lang_counts["python"] += 1
                    elif ext in ("js", "ts", "jsx", "tsx"): lang_counts["javascript"] += 1
                    elif ext == "java": lang_counts["java"] += 1
                    elif ext in ("c", "cpp", "h", "hpp"): lang_counts["c"] += 1

            primary_lang = max(lang_counts, key=lang_counts.get) if any(lang_counts.values()) else "python"

            project = Project(
                name=project_name,
                description=f"Cloned from {repo_url}",
                language=primary_lang,
                owner_id=current_user.id
            )
            db.add(project)
            db.commit()
            db.refresh(project)

            owner_member = ProjectMember(
                project_id=project.id,
                user_id=current_user.id,
                role=RoleEnum.OWNER.value
            )
            db.add(owner_member)
            db.commit()

            # Upload directory tree into file-service
            files_payload = []
            for root, dirs, files in os.walk(temp_dir):
                rel_root = os.path.relpath(root, temp_dir).replace("\\", "/")
                if rel_root == ".":
                    rel_root = ""

                parts = rel_root.split("/") if rel_root else []
                if ".git" in parts or "node_modules" in parts or ".venv" in parts or "__pycache__" in parts:
                    continue

                for f in files:
                    if f.startswith(".git") or f.endswith(".pyc"):
                        continue
                    file_rel_path = f"{rel_root}/{f}" if rel_root else f
                    file_full_path = os.path.join(root, f)

                    try:
                        if os.path.getsize(file_full_path) > 5 * 1024 * 1024:
                            continue
                        with open(file_full_path, "r", encoding="utf-8", errors="ignore") as file_in:
                            content = file_in.read()
                        files_payload.append({"path": file_rel_path, "content": content})
                    except Exception as err:
                        print(f"Skipped file {file_rel_path}: {err}")

            try:
                with httpx.Client(timeout=60.0) as client:
                    client.post(
                        f"{settings.FILE_SERVICE_URL}/projects/{project.id}/batch-import",
                        json={"files": files_payload}
                    )
            except Exception as e:
                print(f"Failed to batch import cloned files into file-service: {e}")

            db.refresh(project)
            project.user_role = RoleEnum.OWNER.value
            project.owner = UserResponse(id=current_user.id, email=current_user.email or "", name=current_user.name or "")
            return project

    @staticmethod
    def get_user_projects(db: Session, current_user: UserClaims) -> List[Project]:
        memberships = db.query(ProjectMember).filter(ProjectMember.user_id == current_user.id).all()
        project_ids = [m.project_id for m in memberships]
        projects = db.query(Project).filter(Project.id.in_(project_ids)).order_by(Project.updated_at.desc()).all()

        role_map = {m.project_id: m.role for m in memberships}
        user_cache: Dict[str, UserResponse] = {
            current_user.id: UserResponse(id=current_user.id, email=current_user.email or "", name=current_user.name or "")
        }

        for p in projects:
            p.user_role = role_map.get(p.id, RoleEnum.VIEWER.value)
            if p.owner_id not in user_cache:
                user_cache[p.owner_id] = ProjectService._fetch_user_details(p.owner_id)
            p.owner = user_cache[p.owner_id]

            # Hydrate members
            for m in p.members:
                if m.user_id not in user_cache:
                    user_cache[m.user_id] = ProjectService._fetch_user_details(m.user_id)
                m.user = user_cache[m.user_id]

        return projects

    @staticmethod
    def get_project_by_id(db: Session, project_id: str, current_user: UserClaims) -> Project:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        member = db.query(ProjectMember).filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == current_user.id
        ).first()

        if not member:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this project")

        project.user_role = member.role
        project.owner = ProjectService._fetch_user_details(project.owner_id)
        for m in project.members:
            m.user = ProjectService._fetch_user_details(m.user_id)

        return project

    @staticmethod
    def get_member_role(db: Session, project_id: str, user_id: str) -> Optional[str]:
        member = db.query(ProjectMember).filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id
        ).first()
        return member.role if member else None

    @staticmethod
    def update_project(db: Session, project_id: str, project_in: ProjectUpdate, current_user: UserClaims) -> Project:
        role = ProjectService.get_member_role(db, project_id, current_user.id)
        if role != RoleEnum.OWNER.value:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the project OWNER can update project settings")

        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        if project_in.name is not None:
            project.name = project_in.name
        if project_in.description is not None:
            project.description = project_in.description

        db.commit()
        db.refresh(project)
        project.user_role = role
        project.owner = ProjectService._fetch_user_details(project.owner_id)
        return project

    @staticmethod
    def delete_project(db: Session, project_id: str, current_user: UserClaims):
        role = ProjectService.get_member_role(db, project_id, current_user.id)
        if role != RoleEnum.OWNER.value:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the project OWNER can delete this project")

        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        db.delete(project)
        db.commit()
        ProjectService._notify_file_service_delete(project_id)

    @staticmethod
    def add_member(db: Session, project_id: str, member_in: ProjectMemberAdd, current_user: UserClaims) -> ProjectMember:
        role = ProjectService.get_member_role(db, project_id, current_user.id)
        if role != RoleEnum.OWNER.value:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the project OWNER can invite new members")

        # Query auth-service for user by email
        target_user = None
        try:
            with httpx.Client(timeout=5.0) as client:
                res = client.get(f"{settings.AUTH_SERVICE_URL}/users/by-email/{member_in.email.lower()}")
                if res.status_code == 200:
                    data = res.json()
                    target_user = UserResponse(id=data["id"], email=data["email"], name=data["name"])
        except Exception:
            pass

        if not target_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No user found with specified email")

        existing_member = db.query(ProjectMember).filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == target_user.id
        ).first()
        if existing_member:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already a member of this project")

        new_member = ProjectMember(
            project_id=project_id,
            user_id=target_user.id,
            role=member_in.role.value
        )
        db.add(new_member)
        db.commit()
        db.refresh(new_member)
        new_member.user = target_user
        return new_member

    @staticmethod
    def update_member_role(db: Session, project_id: str, target_user_id: str, new_role: RoleEnum, current_user: UserClaims) -> ProjectMember:
        role = ProjectService.get_member_role(db, project_id, current_user.id)
        if role != RoleEnum.OWNER.value:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the project OWNER can manage member roles")

        member = db.query(ProjectMember).filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == target_user_id
        ).first()
        if not member:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

        if member.role == RoleEnum.OWNER.value and target_user_id == current_user.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change owner role directly")

        member.role = new_role.value
        db.commit()
        db.refresh(member)
        member.user = ProjectService._fetch_user_details(target_user_id)
        return member

    @staticmethod
    def remove_member(db: Session, project_id: str, target_user_id: str, current_user: UserClaims):
        role = ProjectService.get_member_role(db, project_id, current_user.id)
        if role != RoleEnum.OWNER.value and target_user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the project OWNER can remove members")

        member = db.query(ProjectMember).filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == target_user_id
        ).first()
        if not member:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

        if member.role == RoleEnum.OWNER.value:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove owner from project")

        db.delete(member)
        db.commit()
