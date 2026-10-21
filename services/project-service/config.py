from shared.common.config import BaseServiceSettings

class Settings(BaseServiceSettings):
    SERVICE_NAME: str = "project-service"
    PORT: int = 8002

settings = Settings()
