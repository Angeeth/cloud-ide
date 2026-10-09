from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.file import FileCreate, FileContentSave, FileResponse
from app.services.file_service import FileService

router = APIRouter(tags=["Files"])

@router.get("/projects/{project_id}/files")
def get_project_files(project_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return FileService.get_project_files_tree(db, project_id, current_user)

@router.post("/projects/{project_id}/files", status_code=status.HTTP_201_CREATED)
def create_file(project_id: str, file_in: FileCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return FileService.create_file(
        db=db,
        project_id=project_id,
        name=file_in.name,
        path=file_in.path,
        type_=file_in.type,
        parent_id=file_in.parent_id,
        content=file_in.content or "",
        current_user=current_user
    )

@router.get("/files/{file_id}")
def get_file(file_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return FileService.get_file_by_id(db, file_id, current_user)

@router.put("/files/{file_id}")
def save_file(file_id: str, save_in: FileContentSave, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # First get file to verify project_id
    file_info = FileService.get_file_by_id(db, file_id, current_user)
    return FileService.save_file_content(db, file_info["project_id"], file_id, save_in.content, current_user)

@router.delete("/files/{file_id}")
def delete_file(file_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    FileService.delete_file(db, file_id, current_user)
    return {"status": "success", "message": "File deleted"}
