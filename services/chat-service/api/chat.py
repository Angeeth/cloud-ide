import httpx
from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database.session import get_db
from config import settings
from models.chat_message import ChatMessage
from schemas.chat import ChatMessageResponse, UserResponse
from shared.common.auth import get_current_user_claims, UserClaims

router = APIRouter(prefix="/projects/{project_id}/messages", tags=["Chat"])

def fetch_user_details(user_id: str) -> Optional[UserResponse]:
    try:
        with httpx.Client(timeout=5.0) as client:
            res = client.get(f"{settings.AUTH_SERVICE_URL}/users/{user_id}")
            if res.status_code == 200:
                data = res.json()
                return UserResponse(id=data["id"], email=data["email"], name=data["name"])
    except Exception:
        pass
    return UserResponse(id=user_id, email=f"{user_id[:8]}@mirage.dev", name=f"User {user_id[:8]}")

@router.get("", response_model=List[ChatMessageResponse])
def get_chat_messages(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: UserClaims = Depends(get_current_user_claims)
):
    messages = db.query(ChatMessage).filter(
        ChatMessage.project_id == project_id
    ).order_by(ChatMessage.created_at.asc()).all()

    user_cache = {}
    for m in messages:
        if m.user_id not in user_cache:
            user_cache[m.user_id] = fetch_user_details(m.user_id)
        m.user = user_cache[m.user_id]

    return messages
