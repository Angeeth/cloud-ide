from pydantic import BaseModel
from fastapi import APIRouter, Depends
from services.terminal_service import TerminalService
from shared.common.auth import get_current_user_claims, UserClaims

router = APIRouter(prefix="/projects/{project_id}/terminal", tags=["Terminal"])

class TerminalCommandRequest(BaseModel):
    command: str

@router.post("")
def execute_terminal_command(
    project_id: str,
    req: TerminalCommandRequest,
    current_user: UserClaims = Depends(get_current_user_claims)
):
    return TerminalService.execute_command(project_id, req.command, current_user)
