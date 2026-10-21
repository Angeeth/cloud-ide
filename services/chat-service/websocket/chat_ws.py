import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from database.session import SessionLocal
from config import settings
from shared.common.auth import decode_access_token
from models.chat_message import ChatMessage
from websocket.connection_manager import manager

router = APIRouter(tags=["WebSockets"])

@router.websocket("/ws/projects/{project_id}/chat")
async def chat_websocket(
    websocket: WebSocket,
    project_id: str,
    token: str = Query(...)
):
    payload = decode_access_token(token)
    if not payload:
        await websocket.close(code=4001)
        return

    user_id = payload.get("sub")
    user_name = payload.get("name") or f"User {user_id[:6]}"

    # Verify project access
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(f"{settings.PROJECT_SERVICE_URL}/projects/{project_id}/role?user_id={user_id}")
            if res.status_code == 200:
                role = res.json().get("role")
                if not role:
                    await websocket.close(code=4003)
                    return
    except Exception:
        pass

    await manager.connect_chat(websocket, project_id, user_id, user_name)

    db: Session = SessionLocal()
    try:
        while True:
            data = await websocket.receive_json()
            message_text = data.get("message", "").strip()

            if message_text:
                chat_msg = ChatMessage(
                    project_id=project_id,
                    user_id=user_id,
                    message=message_text
                )
                db.add(chat_msg)
                db.commit()
                db.refresh(chat_msg)

                broadcast_payload = {
                    "type": "chat_message",
                    "id": chat_msg.id,
                    "project_id": project_id,
                    "user_id": user_id,
                    "user_name": user_name,
                    "message": chat_msg.message,
                    "created_at": chat_msg.created_at.isoformat()
                }
                await manager.broadcast_chat_message(project_id, broadcast_payload)

    except WebSocketDisconnect:
        manager.disconnect_chat(websocket, project_id)
    except Exception:
        manager.disconnect_chat(websocket, project_id)
    finally:
        db.close()
