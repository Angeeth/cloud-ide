from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectCloneGithub, ProjectUpdate, ProjectResponse
from app.services.project_service import ProjectService

router = APIRouter(prefix="/projects", tags=["Projects"])

@router.get("", response_model=List[ProjectResponse])
def get_user_projects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return ProjectService.get_user_projects(db, current_user)

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(project_in: ProjectCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return ProjectService.create_project(db, project_in, current_user)

@router.post("/clone-github", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def clone_github_project(
    clone_in: ProjectCloneGithub,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return ProjectService.clone_github_repo(db, clone_in.repo_url, clone_in.name, current_user)

@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return ProjectService.get_project_by_id(db, project_id, current_user)

@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: str, project_in: ProjectUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return ProjectService.update_project(db, project_id, project_in, current_user)

@router.delete("/{project_id}", status_code=status.HTTP_200_OK)
def delete_project(project_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ProjectService.delete_project(db, project_id, current_user)
    return {"status": "success", "message": "Project deleted"}
