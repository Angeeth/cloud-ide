from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from database.session import get_db
from schemas.project import ProjectMemberAdd, ProjectMemberUpdate, ProjectMemberResponse
from services.project_service import ProjectService
from shared.common.auth import get_current_user_claims, UserClaims

router = APIRouter(prefix="/projects/{project_id}/members", tags=["Project Members"])

@router.post("", response_model=ProjectMemberResponse, status_code=status.HTTP_201_CREATED)
def add_member(
    project_id: str,
    member_in: ProjectMemberAdd,
    db: Session = Depends(get_db),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    return ProjectService.add_member(db, project_id, member_in, current_user)

@router.put("/{target_user_id}", response_model=ProjectMemberResponse)
def update_member_role(
    project_id: str,
    target_user_id: str,
    member_in: ProjectMemberUpdate,
    db: Session = Depends(get_db),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    return ProjectService.update_member_role(db, project_id, target_user_id, member_in.role, current_user)

@router.delete("/{target_user_id}")
def remove_member(
    project_id: str,
    target_user_id: str,
    db: Session = Depends(get_db),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    ProjectService.remove_member(db, project_id, target_user_id, current_user)
    return {"status": "success", "message": "Member removed from project"}
