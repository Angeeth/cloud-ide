from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.schemas.user import UserResponse

class VersionCreate(BaseModel):
    description: Optional[str] = "Manual Project Snapshot"

class VersionRestoreRequest(BaseModel):
    version_id: str

class VersionResponse(BaseModel):
    id: str
    project_id: str
    created_by: str
    version_number: int
    description: Optional[str] = None
    created_at: datetime
    creator: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)
