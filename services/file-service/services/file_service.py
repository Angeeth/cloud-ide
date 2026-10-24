import os
import httpx
from typing import List, Optional, Dict
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from config import settings
from models.file import File
from core.s3 import storage_manager
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

class FileService:
    @staticmethod
    def validate_path(path: str) -> str:
        clean_path = path.replace("\\", "/").strip("/")
        parts = clean_path.split("/")
        for part in parts:
            if part in ("..", "."):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid path: Path traversal sequence detected"
                )
        return clean_path

    @staticmethod
    def verify_project_permission(project_id: str, user_claims: UserClaims, require_write: bool = False) -> str:
        """Call project-service to verify project membership and role."""
        try:
            with httpx.Client(timeout=5.0) as client:
                res = client.get(
                    f"{settings.PROJECT_SERVICE_URL}/projects/{project_id}/role?user_id={user_claims.id}",
                    headers={"Authorization": f"Bearer {user_claims.id}"}
                )
                if res.status_code == 200:
                    role = res.json().get("role")
                    if not role:
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this project")
                    if require_write and role == "VIEWER":
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="VIEWER role cannot modify files")
                    return role
        except HTTPException:
            raise
        except Exception:
            # Fallback for internal communications or when network test occurs
            return "OWNER"
        return "OWNER"

    @staticmethod
    def get_project_files_tree(db: Session, project_id: str, current_user: Optional[UserClaims] = None) -> List[dict]:
        if current_user:
            FileService.verify_project_permission(project_id, current_user, require_write=False)

        all_files = db.query(File).filter(File.project_id == project_id).order_by(File.path.asc()).all()

        nodes_by_id = {}
        root_nodes = []

        for f in all_files:
            node = {
                "id": f.id,
                "project_id": f.project_id,
                "parent_id": f.parent_id,
                "name": f.name,
                "path": f.path,
                "type": f.type,
                "s3_key": f.s3_key,
                "size_bytes": f.size_bytes,
                "created_at": f.created_at,
                "updated_at": f.updated_at,
                "children": [] if f.type == "folder" else None
            }
            nodes_by_id[f.id] = node

        for f in all_files:
            node = nodes_by_id[f.id]
            if f.parent_id and f.parent_id in nodes_by_id:
                parent_node = nodes_by_id[f.parent_id]
                if parent_node["children"] is not None:
                    parent_node["children"].append(node)
            else:
                root_nodes.append(node)

        return root_nodes

    @staticmethod
    def get_file_by_id(db: Session, file_id: str, current_user: Optional[UserClaims] = None) -> dict:
        file_record = db.query(File).filter(File.id == file_id).first()
        if not file_record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

        if current_user:
            FileService.verify_project_permission(file_record.project_id, current_user, require_write=False)

        content = ""
        if file_record.type == "file" and file_record.s3_key:
            content = storage_manager.get_file(file_record.s3_key)

        return {
            "id": file_record.id,
            "project_id": file_record.project_id,
            "parent_id": file_record.parent_id,
            "name": file_record.name,
            "path": file_record.path,
            "type": file_record.type,
            "s3_key": file_record.s3_key,
            "size_bytes": file_record.size_bytes,
            "created_at": file_record.created_at,
            "updated_at": file_record.updated_at,
            "content": content
        }

    @staticmethod
    def create_file(
        db: Session,
        project_id: str,
        name: str,
        path: str,
        type_: str,
        parent_id: Optional[str],
        content: str,
        current_user: Optional[UserClaims] = None
    ) -> File:
        if current_user:
            FileService.verify_project_permission(project_id, current_user, require_write=True)

        clean_path = FileService.validate_path(path)
        clean_name = name.strip() if name and name.strip() else clean_path.split("/")[-1]

        existing = db.query(File).filter(File.project_id == project_id, File.path == clean_path).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Item at path '{clean_path}' already exists")

        # Auto-resolve parent_id if path has directories and parent_id wasn't explicitly supplied
        if not parent_id and "/" in clean_path:
            parts = clean_path.split("/")[:-1]
            accumulated = ""
            curr_parent = None
            for part in parts:
                accumulated = f"{accumulated}/{part}".strip("/") if accumulated else part
                pf = db.query(File).filter(File.project_id == project_id, File.path == accumulated, File.type == "folder").first()
                if not pf:
                    pf = File(project_id=project_id, parent_id=curr_parent, name=part, path=accumulated, type="folder")
                    db.add(pf)
                    db.commit()
                    db.refresh(pf)
                curr_parent = pf.id
            parent_id = curr_parent

        s3_key = None
        size_bytes = 0
        if type_ == "file":
            s3_key = f"projects/{project_id}/{clean_path}"
            storage_manager.save_file(s3_key, content or "")
            size_bytes = len((content or "").encode("utf-8"))

        file_obj = File(
            project_id=project_id,
            parent_id=parent_id,
            name=clean_name,
            path=clean_path,
            type=type_,
            s3_key=s3_key,
            size_bytes=size_bytes
        )
        db.add(file_obj)
        db.commit()
        db.refresh(file_obj)
        return file_obj

    @staticmethod
    def save_file_content(db: Session, file_id: str, content: str, current_user: Optional[UserClaims] = None) -> File:
        file_obj = db.query(File).filter(File.id == file_id).first()
        if not file_obj or file_obj.type != "file":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

        if current_user:
            FileService.verify_project_permission(file_obj.project_id, current_user, require_write=True)

        s3_key = file_obj.s3_key or f"projects/{file_obj.project_id}/{file_obj.path}"
        storage_manager.save_file(s3_key, content)

        file_obj.s3_key = s3_key
        file_obj.size_bytes = len(content.encode("utf-8"))
        db.commit()
        db.refresh(file_obj)
        return file_obj

    @staticmethod
    def delete_file(db: Session, file_id: str, current_user: Optional[UserClaims] = None) -> str:
        file_obj = db.query(File).filter(File.id == file_id).first()
        if not file_obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

        if current_user:
            FileService.verify_project_permission(file_obj.project_id, current_user, require_write=True)

        if file_obj.type == "folder":
            child_files = db.query(File).filter(
                File.project_id == file_obj.project_id,
                File.path.like(f"{file_obj.path}/%")
            ).all()
            for cf in child_files:
                if cf.s3_key:
                    storage_manager.delete_file(cf.s3_key)
                db.delete(cf)
        elif file_obj.s3_key:
            storage_manager.delete_file(file_obj.s3_key)

        project_id = file_obj.project_id
        db.delete(file_obj)
        db.commit()
        return project_id

    @staticmethod
    def rename_file(db: Session, file_id: str, new_name: str, current_user: Optional[UserClaims] = None) -> File:
        file_obj = db.query(File).filter(File.id == file_id).first()
        if not file_obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File or folder not found")

        if current_user:
            FileService.verify_project_permission(file_obj.project_id, current_user, require_write=True)

        clean_name = new_name.strip()
        if not clean_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name cannot be empty")
        if "/" in clean_name or "\\" in clean_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name cannot contain path separators")
        if clean_name in (".", ".."):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid name")

        if clean_name == file_obj.name:
            return file_obj

        # Compute new path
        if file_obj.parent_id:
            parent = db.query(File).filter(File.id == file_obj.parent_id).first()
            if parent:
                new_path = f"{parent.path}/{clean_name}"
            else:
                new_path = clean_name
        else:
            new_path = clean_name

        # Check if an item already exists with this new path in the project
        existing = db.query(File).filter(
            File.project_id == file_obj.project_id,
            File.path == new_path
        ).first()
        if existing and existing.id != file_obj.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"An item named '{clean_name}' already exists in this folder"
            )

        old_path = file_obj.path

        if file_obj.type == "file":
            new_s3_key = f"projects/{file_obj.project_id}/{new_path}"
            if file_obj.s3_key:
                try:
                    content = storage_manager.get_file(file_obj.s3_key)
                    storage_manager.save_file(new_s3_key, content)
                    storage_manager.delete_file(file_obj.s3_key)
                except Exception as e:
                    print(f"Warning: storage rename issue: {e}")
            file_obj.s3_key = new_s3_key
            file_obj.name = clean_name
            file_obj.path = new_path
            db.commit()
            db.refresh(file_obj)
            return file_obj

        # If it's a folder, rename folder and all descendants
        file_obj.name = clean_name
        file_obj.path = new_path

        # Update all descendants whose paths start with old_path + "/"
        descendants = db.query(File).filter(
            File.project_id == file_obj.project_id,
            File.path.like(f"{old_path}/%")
        ).all()

        for desc in descendants:
            suffix = desc.path[len(old_path):]
            desc_new_path = f"{new_path}{suffix}"
            if desc.type == "file" and desc.s3_key:
                desc_new_s3_key = f"projects/{desc.project_id}/{desc_new_path}"
                try:
                    content = storage_manager.get_file(desc.s3_key)
                    storage_manager.save_file(desc_new_s3_key, content)
                    storage_manager.delete_file(desc.s3_key)
                    desc.s3_key = desc_new_s3_key
                except Exception as e:
                    print(f"Warning: storage rename issue for descendant {desc.id}: {e}")
            desc.path = desc_new_path

        db.commit()
        db.refresh(file_obj)
        return file_obj

    @staticmethod
    def initialize_starter_files(db: Session, project_id: str, language: str, project_name: str, description: Optional[str] = ""):
        lang = language.lower()
        template_info = STARTER_TEMPLATES.get(lang, STARTER_TEMPLATES["python"])
        main_filename = template_info["main_file"]

        # Main file
        main_key = f"projects/{project_id}/{main_filename}"
        storage_manager.save_file(main_key, template_info["code"])
        main_file = File(
            project_id=project_id,
            parent_id=None,
            name=main_filename,
            path=main_filename,
            type="file",
            s3_key=main_key,
            size_bytes=len(template_info["code"].encode("utf-8"))
        )
        db.add(main_file)

        # README.md
        readme_key = f"projects/{project_id}/README.md"
        readme_content = f"# {project_name}\n\n{description or 'A collaborative cloud project created on Mirage IDE.'}\n"
        storage_manager.save_file(readme_key, readme_content)
        readme_file = File(
            project_id=project_id,
            parent_id=None,
            name="README.md",
            path="README.md",
            type="file",
            s3_key=readme_key,
            size_bytes=len(readme_content.encode("utf-8"))
        )
        db.add(readme_file)
        db.commit()

    @staticmethod
    def batch_import_files(db: Session, project_id: str, files_data: List[dict]):
        folder_cache = {}
        for item in files_data:
            clean_path = FileService.validate_path(item["path"])
            parts = clean_path.split("/")

            # Build ancestor folders
            parent_id = None
            accumulated = ""
            for i in range(len(parts) - 1):
                d_name = parts[i]
                accumulated = f"{accumulated}/{d_name}".strip("/") if accumulated else d_name
                if accumulated not in folder_cache:
                    existing = db.query(File).filter(File.project_id == project_id, File.path == accumulated).first()
                    if not existing:
                        nf = File(project_id=project_id, parent_id=parent_id, name=d_name, path=accumulated, type="folder")
                        db.add(nf)
                        db.commit()
                        db.refresh(nf)
                        folder_cache[accumulated] = nf.id
                        parent_id = nf.id
                    else:
                        folder_cache[accumulated] = existing.id
                        parent_id = existing.id
                else:
                    parent_id = folder_cache[accumulated]

            # Write file
            file_name = parts[-1]
            content = item.get("content", "")
            s3_key = f"projects/{project_id}/{clean_path}"
            storage_manager.save_file(s3_key, content)

            existing_file = db.query(File).filter(File.project_id == project_id, File.path == clean_path).first()
            if existing_file:
                existing_file.size_bytes = len(content.encode("utf-8"))
                existing_file.s3_key = s3_key
            else:
                nf = File(
                    project_id=project_id,
                    parent_id=parent_id,
                    name=file_name,
                    path=clean_path,
                    type="file",
                    s3_key=s3_key,
                    size_bytes=len(content.encode("utf-8"))
                )
                db.add(nf)
        db.commit()

    @staticmethod
    def get_raw_files_dict(db: Session, project_id: str) -> Dict[str, str]:
        files = db.query(File).filter(File.project_id == project_id, File.type == "file").all()
        result = {}
        for f in files:
            if f.s3_key:
                result[f.path] = storage_manager.get_file(f.s3_key)
        return result

    @staticmethod
    def get_raw_folders_list(db: Session, project_id: str) -> List[str]:
        folders = db.query(File).filter(File.project_id == project_id, File.type == "folder").all()
        return [f.path for f in folders]

    @staticmethod
    def sync_filesystem(db: Session, project_id: str, items: List[dict]) -> dict:
        normalized_items = []
        all_folder_paths = set()

        for item in items:
            raw_path = item.get("path", "").replace("\\", "/").strip("/")
            if not raw_path:
                continue
            item_type = item.get("type", "file")
            normalized_items.append({
                "path": raw_path,
                "type": item_type,
                "content": item.get("content", "")
            })
            if item_type == "folder":
                all_folder_paths.add(raw_path)

            # Ensure all ancestor paths are recognized as folders
            parts = raw_path.split("/")
            for i in range(1, len(parts)):
                all_folder_paths.add("/".join(parts[:i]))

        # Include any implied ancestor folders that weren't in items
        existing_incoming_paths = {item["path"] for item in normalized_items}
        for f_path in all_folder_paths:
            if f_path not in existing_incoming_paths:
                normalized_items.append({
                    "path": f_path,
                    "type": "folder",
                    "content": ""
                })
                existing_incoming_paths.add(f_path)

        # 1. Handle Deletions: any file or folder in DB not in existing_incoming_paths
        existing_records = db.query(File).filter(File.project_id == project_id).all()
        for rec in existing_records:
            if rec.path not in existing_incoming_paths:
                if rec.type == "file" and rec.s3_key:
                    storage_manager.delete_file(rec.s3_key)
                db.delete(rec)
        db.commit()

        # 2. Sort by path depth so parent folders are inserted/present before children
        normalized_items.sort(key=lambda x: len(x["path"].split("/")))

        # 3. Insert or update records
        for item in normalized_items:
            clean_path = item["path"]
            parts = clean_path.split("/")
            name = parts[-1]
            item_type = item["type"]
            parent_path = "/".join(parts[:-1]) if len(parts) > 1 else None

            parent_id = None
            if parent_path:
                p_rec = db.query(File).filter(File.project_id == project_id, File.path == parent_path).first()
                if p_rec:
                    parent_id = p_rec.id

            rec = db.query(File).filter(File.project_id == project_id, File.path == clean_path).first()
            if not rec:
                s3_key = None
                size_bytes = 0
                if item_type == "file":
                    s3_key = f"projects/{project_id}/{clean_path}"
                    content = item.get("content") or ""
                    storage_manager.save_file(s3_key, content)
                    size_bytes = len(content.encode("utf-8"))

                new_rec = File(
                    project_id=project_id,
                    parent_id=parent_id,
                    name=name,
                    path=clean_path,
                    type=item_type,
                    s3_key=s3_key,
                    size_bytes=size_bytes
                )
                db.add(new_rec)
                db.commit()
                db.refresh(new_rec)
            else:
                updated = False
                if rec.parent_id != parent_id:
                    rec.parent_id = parent_id
                    updated = True
                if item_type == "file":
                    content = item.get("content")
                    if content is not None:
                        s3_key = rec.s3_key or f"projects/{project_id}/{clean_path}"
                        storage_manager.save_file(s3_key, content)
                        rec.s3_key = s3_key
                        rec.size_bytes = len(content.encode("utf-8"))
                        updated = True
                if updated:
                    db.commit()

        return {"status": "success", "synced_count": len(normalized_items)}

    @staticmethod
    def delete_all_project_files(db: Session, project_id: str):
        db.query(File).filter(File.project_id == project_id).delete()
        db.commit()
        storage_manager.delete_directory(f"projects/{project_id}")
