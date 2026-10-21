from shared.common.config import BaseServiceSettings

class Settings(BaseServiceSettings):
    SERVICE_NAME: str = "file-service"
    PORT: int = 8003

settings = Settings()
