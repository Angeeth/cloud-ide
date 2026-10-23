import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from config import settings
from shared.common.auth import decode_access_token
from websocket.connection_manager import manager

router = APIRouter(tags=["WebSockets"])

@router.websocket("/ws/projects/{project_id}/collaboration")
async def collaboration_websocket(
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

    # Check project role via project-service
    role = "EDITOR"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(f"{settings.PROJECT_SERVICE_URL}/projects/{project_id}/role?user_id={user_id}")
            if res.status_code == 200:
                fetched_role = res.json().get("role")
                if not fetched_role:
                    await websocket.close(code=4003)
                    return
                role = fetched_role
    except Exception:
        pass

    await manager.connect_collaboration(
        websocket=websocket,
        project_id=project_id,
        user_id=user_id,
        user_name=user_name,
        role=role
    )

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "file_change":
                # Broadcast real-time code change to other editors
                broadcast_data = {
                    "type": "file_change",
                    "file_id": data.get("file_id"),
                    "content": data.get("content"),
                    "sender_id": user_id,
                    "sender_name": user_name
                }
                await manager.broadcast_to_project_collaboration(project_id, broadcast_data, sender_socket=websocket)

            elif msg_type == "cursor_position":
                # Broadcast user cursor & selection in Monaco editor
                broadcast_data = {
                    "type": "cursor_position",
                    "file_id": data.get("file_id"),
                    "position": data.get("position"),
                    "selection": data.get("selection"),
                    "sender_id": user_id,
                    "sender_name": user_name
                }
                await manager.broadcast_to_project_collaboration(project_id, broadcast_data, sender_socket=websocket)

            elif msg_type == "active_file":
                # Update user active open tab
                if project_id in manager.presence and user_id in manager.presence[project_id]:
                    manager.presence[project_id][user_id]["active_file"] = data.get("file_id")
                await manager.broadcast_presence(project_id)

            elif msg_type == "tree_update":
                # Broadcast real-time file/folder tree modification to all collaborators
                broadcast_data = {
                    "type": "tree_update",
                    "sender_id": user_id,
                    "sender_name": user_name
                }
                await manager.broadcast_to_project_collaboration(project_id, broadcast_data, sender_socket=websocket)

            elif msg_type == "history_update":
                # Broadcast real-time snapshot/history list update to all collaborators
                broadcast_data = {
                    "type": "history_update",
                    "sender_id": user_id,
                    "sender_name": user_name
                }
                await manager.broadcast_to_project_collaboration(project_id, broadcast_data, sender_socket=websocket)

            elif msg_type == "version_restored":
                # Broadcast real-time version restoration to all collaborators
                broadcast_data = {
                    "type": "version_restored",
                    "version_number": data.get("version_number"),
                    "sender_id": user_id,
                    "sender_name": user_name
                }
                await manager.broadcast_to_project_collaboration(project_id, broadcast_data, sender_socket=websocket)

    except WebSocketDisconnect:
        manager.disconnect_collaboration(websocket, project_id, user_id)
        await manager.broadcast_presence(project_id)
    except Exception:
        manager.disconnect_collaboration(websocket, project_id, user_id)
        await manager.broadcast_presence(project_id)
