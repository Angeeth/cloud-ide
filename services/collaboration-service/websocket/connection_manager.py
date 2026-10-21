from typing import Dict, List
from fastapi import WebSocket
from config import settings
from shared.common.logging import setup_logging
from websocket.redis_pubsub import redis_pubsub_manager

logger = setup_logging(settings.SERVICE_NAME, settings.LOG_LEVEL)

class ConnectionManager:
    def __init__(self):
        self.collaboration_sockets: Dict[str, List[Dict]] = {}
        self.presence: Dict[str, Dict[str, Dict]] = {}

    async def connect_collaboration(self, websocket: WebSocket, project_id: str, user_id: str, user_name: str, role: str):
        await websocket.accept()
        if project_id not in self.collaboration_sockets:
            self.collaboration_sockets[project_id] = []
        if project_id not in self.presence:
            self.presence[project_id] = {}

        socket_info = {
            "socket": websocket,
            "user_id": user_id,
            "user_name": user_name,
            "role": role
        }
        self.collaboration_sockets[project_id].append(socket_info)

        self.presence[project_id][user_id] = {
            "user_id": user_id,
            "user_name": user_name,
            "role": role,
            "status": "online",
            "active_file": None
        }

        await self.broadcast_presence(project_id)

    def disconnect_collaboration(self, websocket: WebSocket, project_id: str, user_id: str):
        if project_id in self.collaboration_sockets:
            self.collaboration_sockets[project_id] = [
                s for s in self.collaboration_sockets[project_id] if s["socket"] != websocket
            ]
            remaining = [s for s in self.collaboration_sockets[project_id] if s["user_id"] == user_id]
            if not remaining and project_id in self.presence:
                self.presence[project_id].pop(user_id, None)

    async def broadcast_presence(self, project_id: str):
        users_list = list(self.presence.get(project_id, {}).values())
        payload = {
            "type": "presence_update",
            "project_id": project_id,
            "users": users_list
        }
        await self.broadcast_to_project_collaboration(project_id, payload)

    async def broadcast_to_project_collaboration(self, project_id: str, data: dict, sender_socket: WebSocket = None):
        if project_id in self.collaboration_sockets:
            dead_sockets = []
            for item in self.collaboration_sockets[project_id]:
                ws = item["socket"]
                if ws != sender_socket:
                    try:
                        await ws.send_json(data)
                    except Exception as e:
                        logger.error(f"Error sending WebSocket message: {e}")
                        dead_sockets.append(ws)

            for ds in dead_sockets:
                self.collaboration_sockets[project_id] = [
                    s for s in self.collaboration_sockets[project_id] if s["socket"] != ds
                ]

        channel = f"project:{project_id}:collaboration"
        await redis_pubsub_manager.publish(channel, data)

manager = ConnectionManager()
