from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database.session import get_db
from schemas.execution import ExecutionRequest, ExecutionResponse
from services.execution_service import ExecutionService
from shared.common.auth import get_current_user_claims, UserClaims

router = APIRouter(tags=["Code Execution"])

@router.post("/execute", response_model=ExecutionResponse)
def execute_code(
    req: ExecutionRequest,
    db: Session = Depends(get_db),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    return ExecutionService.execute_project(db, req.project_id, current_user)

@router.get("/projects/{project_id}/executions", response_model=List[ExecutionResponse])
def get_executions(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    return ExecutionService.get_execution_history(db, project_id, current_user)
