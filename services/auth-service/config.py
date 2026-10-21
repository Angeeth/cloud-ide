from shared.common.config import BaseServiceSettings

class Settings(BaseServiceSettings):
    SERVICE_NAME: str = "auth-service"
    PORT: int = 8001

settings = Settings()
