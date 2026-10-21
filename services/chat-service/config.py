from shared.common.config import BaseServiceSettings

class Settings(BaseServiceSettings):
    SERVICE_NAME: str = "chat-service"
    PORT: int = 8008

settings = Settings()
