import os
import zipfile
import io
from typing import List, Dict, Tuple
from sqlalchemy.orm import Session
from fastapi import HTTPException, status, UploadFile
from app.models.file import File
from app.models.project import Project
from app.models.project_member import RoleEnum
from app.services.project_service import ProjectService
from app.services.file_service import FileService
from app.core.s3 import storage_manager

class UploadService:
    @staticmethod
    def process_folder_upload(
        db: Session,
        project_id: str,
        files: List[UploadFile],
        relative_paths: List[str],
        current_user
    ) -> int:
        role = ProjectService.get_member_role(db, project_id, current_user.id)
        if role == RoleEnum.VIEWER.value:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="VIEWER role cannot import files")

        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        uploaded_count = 0
        folder_cache: Dict[str, str] = {}  # path -> file_id

        # First pass: collect all unique folder paths needed
        for upload_file, rel_path in zip(files, relative_paths):
            clean_rel = FileService.validate_path(rel_path)
            parts = clean_rel.split("/")
            
            # Ensure parent directories exist
            accumulated_path = ""
            parent_id = None
            
            for i in range(len(parts) - 1):
                dir_name = parts[i]
                accumulated_path = f"{accumulated_path}/{dir_name}".strip("/") if accumulated_path else dir_name
                
                if accumulated_path not in folder_cache:
                    existing_folder = db.query(File).filter(
                        File.project_id == project_id,
                        File.path == accumulated_path
                    ).first()
                    
                    if not existing_folder:
                        new_folder = File(
                            project_id=project_id,
                            parent_id=parent_id,
                            name=dir_name,
                            path=accumulated_path,
                            type="folder"
                        )
                        db.add(new_folder)
                        db.commit()
                        db.refresh(new_folder)
                        folder_cache[accumulated_path] = new_folder.id
                        parent_id = new_folder.id
                    else:
                        folder_cache[accumulated_path] = existing_folder.id
                        parent_id = existing_folder.id
                else:
                    parent_id = folder_cache[accumulated_path]

            # Process actual file
            file_name = parts[-1]
            content_bytes = upload_file.file.read()
            try:
                content_str = content_bytes.decode("utf-8")
            except UnicodeDecodeError:
                content_str = content_bytes.decode("latin1", errors="replace")

            existing_file = db.query(File).filter(
                File.project_id == project_id,
                File.path == clean_rel
            ).first()

            s3_key = f"projects/{project_id}/{clean_rel}"
            storage_manager.save_file(s3_key, content_str)

            if existing_file:
                existing_file.size_bytes = len(content_bytes)
                existing_file.s3_key = s3_key
            else:
                new_file = File(
                    project_id=project_id,
                    parent_id=parent_id,
                    name=file_name,
                    path=clean_rel,
                    type="file",
                    s3_key=s3_key,
                    size_bytes=len(content_bytes)
                )
                db.add(new_file)
            
            uploaded_count += 1

        db.commit()
        return uploaded_count

    @staticmethod
    def process_zip_upload(
        db: Session,
        project_id: str,
        zip_file: UploadFile,
        current_user
    ) -> int:
        role = ProjectService.get_member_role(db, project_id, current_user.id)
        if role == RoleEnum.VIEWER.value:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="VIEWER role cannot import zip project")

        content_bytes = zip_file.file.read()
        try:
            z = zipfile.ZipFile(io.BytesIO(content_bytes))
        except zipfile.BadZipFile:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid zip file")

        folder_cache: Dict[str, str] = {}
        uploaded_count = 0

        for member_name in z.namelist():
            # Skip hidden git files or OS metadata
            if member_name.startswith("__MACOSX") or "/." in member_name or member_name.startswith("."):
                continue

            clean_rel = FileService.validate_path(member_name)
            if not clean_rel:
                continue

            if member_name.endswith("/"):
                # Folder record
                parts = clean_rel.split("/")
                accumulated_path = ""
                parent_id = None
                for dir_name in parts:
                    accumulated_path = f"{accumulated_path}/{dir_name}".strip("/") if accumulated_path else dir_name
                    if accumulated_path not in folder_cache:
                        existing = db.query(File).filter(File.project_id == project_id, File.path == accumulated_path).first()
                        if not existing:
                            nf = File(project_id=project_id, parent_id=parent_id, name=dir_name, path=accumulated_path, type="folder")
                            db.add(nf)
                            db.commit()
                            db.refresh(nf)
                            folder_cache[accumulated_path] = nf.id
                            parent_id = nf.id
                        else:
                            folder_cache[accumulated_path] = existing.id
                            parent_id = existing.id
                    else:
                        parent_id = folder_cache[accumulated_path]
            else:
                # File record
                parts = clean_rel.split("/")
                parent_id = None
                if len(parts) > 1:
                    dir_path = "/".join(parts[:-1])
                    if dir_path in folder_cache:
                        parent_id = folder_cache[dir_path]

                file_name = parts[-1]
                file_bytes = z.read(member_name)
                try:
                    content_str = file_bytes.decode("utf-8")
                except UnicodeDecodeError:
                    content_str = file_bytes.decode("latin1", errors="replace")

                s3_key = f"projects/{project_id}/{clean_rel}"
                storage_manager.save_file(s3_key, content_str)

                existing_file = db.query(File).filter(File.project_id == project_id, File.path == clean_rel).first()
                if existing_file:
                    existing_file.size_bytes = len(file_bytes)
                    existing_file.s3_key = s3_key
                else:
                    nf = File(
                        project_id=project_id,
                        parent_id=parent_id,
                        name=file_name,
                        path=clean_rel,
                        type="file",
                        s3_key=s3_key,
                        size_bytes=len(file_bytes)
                    )
                    db.add(nf)
                uploaded_count += 1

        db.commit()
        return uploaded_count
