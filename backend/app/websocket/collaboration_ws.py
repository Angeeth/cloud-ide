from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from app.database.session import SessionLocal
from app.core.security import decode_access_token
from app.models.user import User
from app.services.project_service import ProjectService
from app.websocket.connection_manager import manager

router = APIRouter(tags=["WebSockets"])

@router.websocket("/ws/projects/{project_id}/collaboration")
async def collaboration_websocket(
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

        await manager.connect_collaboration(
            websocket=websocket,
            project_id=project_id,
            user_id=user.id,
            user_name=user.name,
            role=role
        )

        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "file_change":
                # Broadcast real-time code change to other editors
                payload = {
                    "type": "file_change",
                    "file_id": data.get("file_id"),
                    "content": data.get("content"),
                    "sender_id": user.id,
                    "sender_name": user.name
                }
                await manager.broadcast_to_project_collaboration(project_id, payload, sender_socket=websocket)

            elif msg_type == "cursor_position":
                # Broadcast user cursor & selection in Monaco editor
                payload = {
                    "type": "cursor_position",
                    "file_id": data.get("file_id"),
                    "position": data.get("position"),
                    "selection": data.get("selection"),
                    "sender_id": user.id,
                    "sender_name": user.name
                }
                await manager.broadcast_to_project_collaboration(project_id, payload, sender_socket=websocket)

            elif msg_type == "active_file":
                # Update user active open tab
                if project_id in manager.presence and user.id in manager.presence[project_id]:
                    manager.presence[project_id][user.id]["active_file"] = data.get("file_id")
                await manager.broadcast_presence(project_id)

    except WebSocketDisconnect:
        manager.disconnect_collaboration(websocket, project_id, user_id)
        await manager.broadcast_presence(project_id)
    except Exception as e:
        manager.disconnect_collaboration(websocket, project_id, user_id)
    finally:
        db.close()
