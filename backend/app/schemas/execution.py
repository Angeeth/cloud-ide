from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.schemas.user import UserResponse

class ExecutionRequest(BaseModel):
    project_id: str

class ExecutionResponse(BaseModel):
    id: str
    project_id: str
    user_id: str
    language: str
    status: str  # SUCCESS, ERROR, TIMEOUT
    execution_time_ms: float
    exit_code: int
    stdout: str
    stderr: str
    created_at: datetime
    user: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)
