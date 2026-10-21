from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class UserResponse(BaseModel):
    id: str
    email: str
    name: str

    model_config = ConfigDict(from_attributes=True)

class ChatMessageResponse(BaseModel):
    id: str
    project_id: str
    user_id: str
    user: Optional[UserResponse] = None
    message: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
