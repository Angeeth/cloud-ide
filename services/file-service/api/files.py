from typing import List, Dict
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from database.session import get_db
from schemas.file import (
    FileCreate,
    FileContentSave,
    FileResponse,
    StarterInitRequest,
    BatchImportRequest,
    SyncFSRequest
)
from services.file_service import FileService
from shared.common.auth import get_current_user_claims, UserClaims

router = APIRouter(tags=["Files"])

@router.get("/projects/{project_id}/files")
def get_project_files(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    return FileService.get_project_files_tree(db, project_id, current_user)

@router.post("/projects/{project_id}/files", status_code=status.HTTP_201_CREATED)
def create_file(
    project_id: str,
    file_in: FileCreate,
    db: Session = Depends(get_db),
    current_user: UserClaims = Depends(get_current_user_claims)
):
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
def get_file(
    file_id: str,
    db: Session = Depends(get_db),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    return FileService.get_file_by_id(db, file_id, current_user)

@router.put("/files/{file_id}")
def save_file(
    file_id: str,
    save_in: FileContentSave,
    db: Session = Depends(get_db),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    return FileService.save_file_content(db, file_id, save_in.content, current_user)

@router.delete("/files/{file_id}")
def delete_file(
    file_id: str,
    db: Session = Depends(get_db),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    FileService.delete_file(db, file_id, current_user)
    return {"status": "success", "message": "File deleted"}

# --- Internal Service Endpoints ---

@router.post("/projects/{project_id}/starter")
def initialize_starter(
    project_id: str,
    req: StarterInitRequest,
    db: Session = Depends(get_db)
):
    FileService.initialize_starter_files(
        db=db,
        project_id=project_id,
        language=req.language,
        project_name=req.project_name,
        description=req.description
    )
    return {"status": "success", "message": "Starter files initialized"}

@router.post("/projects/{project_id}/batch-import")
def batch_import(
    project_id: str,
    req: BatchImportRequest,
    db: Session = Depends(get_db)
):
    FileService.batch_import_files(
        db=db,
        project_id=project_id,
        files_data=[{"path": f.path, "content": f.content} for f in req.files]
    )
    return {"status": "success", "imported_count": len(req.files)}

@router.get("/projects/{project_id}/files/raw")
def get_raw_files(
    project_id: str,
    db: Session = Depends(get_db)
) -> Dict[str, str]:
    return FileService.get_raw_files_dict(db, project_id)

@router.get("/projects/{project_id}/folders/raw")
def get_raw_folders(
    project_id: str,
    db: Session = Depends(get_db)
) -> List[str]:
    return FileService.get_raw_folders_list(db, project_id)

@router.post("/projects/{project_id}/sync-fs")
def sync_fs(
    project_id: str,
    req: SyncFSRequest,
    db: Session = Depends(get_db)
):
    items_data = [item.model_dump() for item in req.items]
    return FileService.sync_filesystem(db, project_id, items_data)

@router.delete("/projects/{project_id}/files-all")
def delete_all_files(
    project_id: str,
    db: Session = Depends(get_db)
):
    FileService.delete_all_project_files(db, project_id)
    return {"status": "success", "message": "All project files deleted"}
