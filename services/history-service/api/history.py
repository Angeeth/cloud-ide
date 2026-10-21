from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from database.session import get_db
from schemas.history import VersionCreate, VersionRestoreRequest, VersionResponse
from services.history_service import HistoryService
from shared.common.auth import get_current_user_claims, UserClaims

router = APIRouter(prefix="/projects/{project_id}/history", tags=["History & Versions"])

@router.get("", response_model=List[VersionResponse])
def get_history(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    return HistoryService.get_project_history(db, project_id, current_user)

@router.post("", response_model=VersionResponse, status_code=status.HTTP_201_CREATED)
def create_version(
    project_id: str,
    version_in: VersionCreate,
    db: Session = Depends(get_db),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    return HistoryService.create_version_snapshot(db, project_id, version_in.description, current_user)

@router.post("/restore")
def restore_version(
    project_id: str,
    req: VersionRestoreRequest,
    db: Session = Depends(get_db),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    return HistoryService.restore_version(db, project_id, req.version_id, current_user)
