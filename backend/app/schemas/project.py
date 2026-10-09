from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, EmailStr
from app.schemas.user import UserResponse
from app.models.project_member import RoleEnum

class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    language: str = "python"

class ProjectCreate(ProjectBase):
    pass

class ProjectCloneGithub(BaseModel):
    repo_url: str
    name: Optional[str] = None
    description: Optional[str] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class ProjectMemberAdd(BaseModel):
    email: EmailStr
    role: RoleEnum = RoleEnum.EDITOR

class ProjectMemberUpdate(BaseModel):
    role: RoleEnum

class ProjectMemberResponse(BaseModel):
    id: str
    user_id: str
    role: RoleEnum
    user: UserResponse
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ProjectResponse(ProjectBase):
    id: str
    owner_id: str
    owner: UserResponse
    created_at: datetime
    updated_at: datetime
    members: List[ProjectMemberResponse] = []
    user_role: Optional[RoleEnum] = None

    model_config = ConfigDict(from_attributes=True)
