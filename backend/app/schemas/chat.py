from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.schemas.user import UserResponse

class ChatMessageResponse(BaseModel):
    id: str
    project_id: str
    user_id: str
    user: UserResponse
    message: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
