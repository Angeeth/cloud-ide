from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, Form, status
from services.upload_service import UploadService
from shared.common.auth import get_current_user_claims, UserClaims

router = APIRouter(prefix="/projects/{project_id}/upload", tags=["Project Import"])

@router.post("")
def upload_files(
    project_id: str,
    files: List[UploadFile] = File(...),
    relative_paths: List[str] = Form(...),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    count = UploadService.process_folder_upload(project_id, files, relative_paths, current_user)
    return {
        "status": "success",
        "message": f"Successfully imported {count} files into project",
        "uploaded_files_count": count
    }

@router.post("/zip")
def upload_zip(
    project_id: str,
    zip_file: UploadFile = File(...),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    count = UploadService.process_zip_upload(project_id, zip_file, current_user)
    return {
        "status": "success",
        "message": f"Successfully imported zip project archive ({count} files)",
        "uploaded_files_count": count
    }
