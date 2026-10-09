import os
import subprocess
import tempfile
from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.project import Project
from app.models.project_member import ProjectMember, RoleEnum
from app.models.user import User
from app.models.file import File
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectMemberAdd

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
    def create_project(db: Session, project_in: ProjectCreate, owner: User) -> Project:
        lang = project_in.language.lower()
        if lang not in STARTER_TEMPLATES:
            lang = "python"

        project = Project(
            name=project_in.name,
            description=project_in.description,
            language=lang,
            owner_id=owner.id
        )
        db.add(project)
        db.commit()
        db.refresh(project)

        # Automatically add owner as OWNER role
        owner_member = ProjectMember(
            project_id=project.id,
            user_id=owner.id,
            role=RoleEnum.OWNER.value
        )
        db.add(owner_member)

        # Create starter files directly in root (no forced src/ folder)
        template_info = STARTER_TEMPLATES.get(lang, STARTER_TEMPLATES["python"])
        main_filename = template_info["main_file"]
        
        main_file = File(
            project_id=project.id,
            parent_id=None,
            name=main_filename,
            path=main_filename,
            type="file"
        )
        db.add(main_file)

        readme_file = File(
            project_id=project.id,
            parent_id=None,
            name="README.md",
            path="README.md",
            type="file"
        )
        db.add(readme_file)
        db.commit()

        # Save default starter code into file storage
        from app.services.file_service import FileService
        FileService.save_file_content(db, project.id, main_file.id, template_info["code"])
        FileService.save_file_content(db, project.id, readme_file.id, f"# {project.name}\n\n{project.description or 'A collaborative cloud project created on Mirage IDE.'}\n")

        db.refresh(project)
        return project

    @staticmethod
    def clone_github_repo(db: Session, repo_url: str, custom_name: Optional[str], owner: User) -> Project:
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

            # Strategy 1: Fast Zipball HTTP Download (10x faster for large repos)
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

            # Strategy 2: Git Clone with prompt disabled & extended 180s timeout
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
                owner_id=owner.id
            )
            db.add(project)
            db.commit()
            db.refresh(project)

            owner_member = ProjectMember(
                project_id=project.id,
                user_id=owner.id,
                role=RoleEnum.OWNER.value
            )
            db.add(owner_member)
            db.commit()

            from app.services.file_service import FileService
            dir_node_map = {}

            for root, dirs, files in os.walk(temp_dir):
                rel_root = os.path.relpath(root, temp_dir).replace("\\", "/")
                if rel_root == ".":
                    rel_root = ""

                parts = rel_root.split("/") if rel_root else []
                if ".git" in parts or "node_modules" in parts or ".venv" in parts or "__pycache__" in parts:
                    continue

                parent_id = None
                if rel_root:
                    parent_folder = dir_node_map.get(rel_root)
                    if parent_folder:
                        parent_id = parent_folder.id

                for d in dirs:
                    if d in (".git", "node_modules", ".venv", "__pycache__"):
                        continue
                    dir_rel_path = f"{rel_root}/{d}" if rel_root else d
                    dir_file = File(
                        project_id=project.id,
                        parent_id=parent_id,
                        name=d,
                        path=dir_rel_path,
                        type="folder"
                    )
                    db.add(dir_file)
                    db.commit()
                    db.refresh(dir_file)
                    dir_node_map[dir_rel_path] = dir_file

                for f in files:
                    if f.startswith(".git") or f.endswith(".pyc"):
                        continue
                    file_rel_path = f"{rel_root}/{f}" if rel_root else f
                    file_full_path = os.path.join(root, f)

                    try:
                        if os.path.getsize(file_full_path) > 5 * 1024 * 1024:
                            continue

                        file_record = File(
                            project_id=project.id,
                            parent_id=parent_id,
                            name=f,
                            path=file_rel_path,
                            type="file"
                        )
                        db.add(file_record)
                        db.commit()
                        db.refresh(file_record)

                        with open(file_full_path, "r", encoding="utf-8", errors="ignore") as file_in:
                            content = file_in.read()
                        FileService.save_file_content(db, project.id, file_record.id, content)
                    except Exception as err:
                        print(f"Skipped file {file_rel_path}: {err}")

            db.refresh(project)
            return project

    @staticmethod
    def get_user_projects(db: Session, user: User) -> List[Project]:
        memberships = db.query(ProjectMember).filter(ProjectMember.user_id == user.id).all()
        project_ids = [m.project_id for m in memberships]
        projects = db.query(Project).filter(Project.id.in_(project_ids)).order_by(Project.updated_at.desc()).all()
        
        role_map = {m.project_id: m.role for m in memberships}
        for p in projects:
            p.user_role = role_map.get(p.id, RoleEnum.VIEWER.value)
        return projects

    @staticmethod
    def get_project_by_id(db: Session, project_id: str, current_user: User) -> Project:
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
        return project

    @staticmethod
    def get_member_role(db: Session, project_id: str, user_id: str) -> Optional[str]:
        member = db.query(ProjectMember).filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id
        ).first()
        return member.role if member else None

    @staticmethod
    def update_project(db: Session, project_id: str, project_in: ProjectUpdate, current_user: User) -> Project:
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
        return project

    @staticmethod
    def delete_project(db: Session, project_id: str, current_user: User):
        role = ProjectService.get_member_role(db, project_id, current_user.id)
        if role != RoleEnum.OWNER.value:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the project OWNER can delete this project")
        
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        
        db.delete(project)
        db.commit()

    @staticmethod
    def add_member(db: Session, project_id: str, member_in: ProjectMemberAdd, current_user: User) -> ProjectMember:
        role = ProjectService.get_member_role(db, project_id, current_user.id)
        if role != RoleEnum.OWNER.value:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the project OWNER can invite new members")

        target_user = db.query(User).filter(User.email == member_in.email.lower()).first()
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
        return new_member

    @staticmethod
    def update_member_role(db: Session, project_id: str, target_user_id: str, new_role: RoleEnum, current_user: User) -> ProjectMember:
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
        return member

    @staticmethod
    def remove_member(db: Session, project_id: str, target_user_id: str, current_user: User):
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
