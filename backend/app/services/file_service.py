import os
from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.file import File
from app.models.project_member import RoleEnum
from app.services.project_service import ProjectService
from app.core.s3 import storage_manager

class FileService:
    @staticmethod
    def validate_path(path: str) -> str:
        # Sanitize path to prevent path traversal security issues
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
    def get_project_files_tree(db: Session, project_id: str, current_user) -> List[dict]:
        # Ensure membership
        ProjectService.get_project_by_id(db, project_id, current_user)
        
        all_files = db.query(File).filter(File.project_id == project_id).order_by(File.path.asc()).all()
        
        # Build hierarchy tree
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
    def get_file_by_id(db: Session, file_id: str, current_user) -> dict:
        file_record = db.query(File).filter(File.id == file_id).first()
        if not file_record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
        
        ProjectService.get_project_by_id(db, file_record.project_id, current_user)
        
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
    def create_file(db: Session, project_id: str, name: str, path: str, type_: str, parent_id: Optional[str], content: str, current_user) -> File:
        role = ProjectService.get_member_role(db, project_id, current_user.id)
        if role == RoleEnum.VIEWER.value:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="VIEWER role cannot create files or folders")

        clean_path = FileService.validate_path(path)
        
        existing = db.query(File).filter(File.project_id == project_id, File.path == clean_path).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Item at path '{clean_path}' already exists")

        s3_key = None
        size_bytes = 0
        if type_ == "file":
            s3_key = f"projects/{project_id}/{clean_path}"
            storage_manager.save_file(s3_key, content or "")
            size_bytes = len((content or "").encode("utf-8"))

        file_obj = File(
            project_id=project_id,
            parent_id=parent_id,
            name=name,
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
    def save_file_content(db: Session, project_id: str, file_id: str, content: str, current_user=None) -> File:
        if current_user:
            role = ProjectService.get_member_role(db, project_id, current_user.id)
            if role == RoleEnum.VIEWER.value:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="VIEWER role cannot edit files")

        file_obj = db.query(File).filter(File.id == file_id, File.project_id == project_id).first()
        if not file_obj or file_obj.type != "file":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

        s3_key = file_obj.s3_key or f"projects/{project_id}/{file_obj.path}"
        storage_manager.save_file(s3_key, content)
        
        file_obj.s3_key = s3_key
        file_obj.size_bytes = len(content.encode("utf-8"))
        db.commit()
        db.refresh(file_obj)
        return file_obj

    @staticmethod
    def delete_file(db: Session, file_id: str, current_user) -> str:
        file_obj = db.query(File).filter(File.id == file_id).first()
        if not file_obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

        role = ProjectService.get_member_role(db, file_obj.project_id, current_user.id)
        if role == RoleEnum.VIEWER.value:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="VIEWER role cannot delete files")

        # If folder, remove all child files from storage
        if file_obj.type == "folder":
            child_files = db.query(File).filter(File.project_id == file_obj.project_id, File.path.like(f"{file_obj.path}/%")).all()
            for cf in child_files:
                if cf.s3_key:
                    storage_manager.delete_file(cf.s3_key)
        elif file_obj.s3_key:
            storage_manager.delete_file(file_obj.s3_key)

        project_id = file_obj.project_id
        db.delete(file_obj)
        db.commit()
        return project_id
