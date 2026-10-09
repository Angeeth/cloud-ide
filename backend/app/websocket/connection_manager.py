import json
from typing import Dict, List, Set
from fastapi import WebSocket
from app.core.logging import logger
from app.websocket.redis_pubsub import redis_pubsub_manager

class ConnectionManager:
    def __init__(self):
        # project_id -> list of active WebSockets
        self.collaboration_sockets: Dict[str, List[Dict]] = {}
        self.chat_sockets: Dict[str, List[Dict]] = {}
        # project_id -> user_id -> user_info
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

        # Broadcast updated presence to all connected project members
        await self.broadcast_presence(project_id)

    def disconnect_collaboration(self, websocket: WebSocket, project_id: str, user_id: str):
        if project_id in self.collaboration_sockets:
            self.collaboration_sockets[project_id] = [
                s for s in self.collaboration_sockets[project_id] if s["socket"] != websocket
            ]
            # If no remaining sockets for this user in project
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

            # Cleanup dead sockets
            for ds in dead_sockets:
                self.collaboration_sockets[project_id] = [
                    s for s in self.collaboration_sockets[project_id] if s["socket"] != ds
                ]

        # Also publish to Redis for multi-instance sync
        channel = f"project:{project_id}:collaboration"
        await redis_pubsub_manager.publish(channel, data)

    async def connect_chat(self, websocket: WebSocket, project_id: str, user_id: str, user_name: str):
        await websocket.accept()
        if project_id not in self.chat_sockets:
            self.chat_sockets[project_id] = []
        
        socket_info = {
            "socket": websocket,
            "user_id": user_id,
            "user_name": user_name
        }
        self.chat_sockets[project_id].append(socket_info)

    def disconnect_chat(self, websocket: WebSocket, project_id: str):
        if project_id in self.chat_sockets:
            self.chat_sockets[project_id] = [
                s for s in self.chat_sockets[project_id] if s["socket"] != websocket
            ]

    async def broadcast_chat_message(self, project_id: str, data: dict):
        if project_id in self.chat_sockets:
            dead_sockets = []
            for item in self.chat_sockets[project_id]:
                ws = item["socket"]
                try:
                    await ws.send_json(data)
                except Exception as e:
                    logger.error(f"Error broadcasting chat message: {e}")
                    dead_sockets.append(ws)

            for ds in dead_sockets:
                self.chat_sockets[project_id] = [
                    s for s in self.chat_sockets[project_id] if s["socket"] != ds
                ]

        channel = f"project:{project_id}:chat"
        await redis_pubsub_manager.publish(channel, data)

manager = ConnectionManager()
