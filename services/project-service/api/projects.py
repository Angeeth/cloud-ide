from typing import List, Optional
from fastapi import APIRouter, Depends, status, Query, HTTPException
from sqlalchemy.orm import Session
from database.session import get_db
from schemas.project import ProjectCreate, ProjectCloneGithub, ProjectUpdate, ProjectResponse
from models.project import Project
from services.project_service import ProjectService
from shared.common.auth import get_current_user_claims, get_optional_user_claims, UserClaims

router = APIRouter(prefix="/projects", tags=["Projects"])

@router.get("", response_model=List[ProjectResponse])
def get_user_projects(
    db: Session = Depends(get_db),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    return ProjectService.get_user_projects(db, current_user)

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    project_in: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    return ProjectService.create_project(db, project_in, current_user)

@router.post("/clone-github", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def clone_github_project(
    clone_in: ProjectCloneGithub,
    db: Session = Depends(get_db),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    return ProjectService.clone_github_repo(db, clone_in.repo_url, clone_in.name, current_user)

@router.get("/{project_id}/role")
def get_project_member_role(
    project_id: str,
    user_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: Optional[UserClaims] = Depends(get_optional_user_claims)
):
    target_uid = user_id or (current_user.id if current_user else None)
    if not target_uid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_id query param or valid Bearer token required")
    role = ProjectService.get_member_role(db, project_id, target_uid)
    project = db.query(Project).filter(Project.id == project_id).first()
    return {
        "project_id": project_id,
        "user_id": target_uid,
        "role": role,
        "language": project.language if project else "python"
    }

@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    return ProjectService.get_project_by_id(db, project_id, current_user)

@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: str,
    project_in: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    return ProjectService.update_project(db, project_id, project_in, current_user)

@router.delete("/{project_id}", status_code=status.HTTP_200_OK)
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    ProjectService.delete_project(db, project_id, current_user)
    return {"status": "success", "message": "Project deleted"}
