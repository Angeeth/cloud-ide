from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.chat_message import ChatMessage
from app.schemas.chat import ChatMessageResponse
from app.services.project_service import ProjectService

router = APIRouter(prefix="/projects/{project_id}/messages", tags=["Chat"])

@router.get("", response_model=List[ChatMessageResponse])
def get_chat_messages(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify membership
    ProjectService.get_project_by_id(db, project_id, current_user)
    
    messages = db.query(ChatMessage).filter(
        ChatMessage.project_id == project_id
    ).order_by(ChatMessage.created_at.asc()).all()
    
    return messages
