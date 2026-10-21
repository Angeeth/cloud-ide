from typing import Dict, List
from fastapi import WebSocket
from config import settings
from shared.common.logging import setup_logging
from websocket.redis_pubsub import redis_pubsub_manager

logger = setup_logging(settings.SERVICE_NAME, settings.LOG_LEVEL)

class ConnectionManager:
    def __init__(self):
        self.chat_sockets: Dict[str, List[Dict]] = {}

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
