from shared.common.config import BaseServiceSettings

class Settings(BaseServiceSettings):
    SERVICE_NAME: str = "history-service"
    PORT: int = 8009

settings = Settings()
