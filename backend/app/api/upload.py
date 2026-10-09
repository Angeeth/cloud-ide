from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.services.upload_service import UploadService

router = APIRouter(prefix="/projects/{project_id}/upload", tags=["Project Import"])

@router.post("")
def upload_files(
    project_id: str,
    files: List[UploadFile] = File(...),
    relative_paths: List[str] = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    count = UploadService.process_folder_upload(db, project_id, files, relative_paths, current_user)
    return {
        "status": "success",
        "message": f"Successfully imported {count} files into project",
        "uploaded_files_count": count
    }

@router.post("/zip")
def upload_zip(
    project_id: str,
    zip_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    count = UploadService.process_zip_upload(db, project_id, zip_file, current_user)
    return {
        "status": "success",
        "message": f"Successfully imported zip project archive ({count} files)",
        "uploaded_files_count": count
    }
