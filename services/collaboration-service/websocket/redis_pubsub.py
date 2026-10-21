import json
import redis.asyncio as aioredis
from config import settings
from shared.common.logging import setup_logging

logger = setup_logging(settings.SERVICE_NAME, settings.LOG_LEVEL)

class RedisPubSubManager:
    def __init__(self):
        self.redis: aioredis.Redis = None
        self.is_connected = False

    async def connect(self):
        try:
            self.redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            await self.redis.ping()
            self.is_connected = True
            logger.info(f"Connected to Redis Pub/Sub at {settings.REDIS_URL}")
        except Exception as e:
            logger.warning(f"Could not connect to Redis ({e}). Running WebSockets in single-instance memory mode.")
            self.is_connected = False

    async def publish(self, channel: str, message: dict):
        if self.is_connected and self.redis:
            try:
                await self.redis.publish(channel, json.dumps(message))
            except Exception as e:
                logger.error(f"Error publishing message to Redis channel {channel}: {e}")

redis_pubsub_manager = RedisPubSubManager()
