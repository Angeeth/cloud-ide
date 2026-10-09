from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from app.database.session import SessionLocal
from app.core.security import decode_access_token
from app.models.user import User
from app.models.chat_message import ChatMessage
from app.services.project_service import ProjectService
from app.websocket.connection_manager import manager

router = APIRouter(tags=["WebSockets"])

@router.websocket("/ws/projects/{project_id}/chat")
async def chat_websocket(
    websocket: WebSocket,
    project_id: str,
    token: str = Query(...)
):
    user_id = decode_access_token(token)
    if not user_id:
        await websocket.close(code=4001)
        return

    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            await websocket.close(code=4002)
            return

        role = ProjectService.get_member_role(db, project_id, user.id)
        if not role:
            await websocket.close(code=4003)
            return

        await manager.connect_chat(websocket, project_id, user.id, user.name)

        while True:
            data = await websocket.receive_json()
            message_text = data.get("message", "").strip()

            if message_text:
                # Save chat message to PostgreSQL
                chat_msg = ChatMessage(
                    project_id=project_id,
                    user_id=user.id,
                    message=message_text
                )
                db.add(chat_msg)
                db.commit()
                db.refresh(chat_msg)

                # Broadcast message to all connected project members
                payload = {
                    "type": "chat_message",
                    "id": chat_msg.id,
                    "project_id": project_id,
                    "user_id": user.id,
                    "user_name": user.name,
                    "message": chat_msg.message,
                    "created_at": chat_msg.created_at.isoformat()
                }
                await manager.broadcast_chat_message(project_id, payload)

    except WebSocketDisconnect:
        manager.disconnect_chat(websocket, project_id)
    except Exception as e:
        manager.disconnect_chat(websocket, project_id)
    finally:
        db.close()
