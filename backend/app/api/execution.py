from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.execution import ExecutionRequest, ExecutionResponse
from app.services.execution_service import ExecutionService

router = APIRouter(tags=["Code Execution"])

@router.post("/execute", response_model=ExecutionResponse)
def execute_code(
    req: ExecutionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return ExecutionService.execute_project(db, req.project_id, current_user)

@router.get("/projects/{project_id}/executions", response_model=List[ExecutionResponse])
def get_executions(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return ExecutionService.get_execution_history(db, project_id, current_user)
