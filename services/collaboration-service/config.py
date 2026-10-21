from shared.common.config import BaseServiceSettings

class Settings(BaseServiceSettings):
    SERVICE_NAME: str = "collaboration-service"
    PORT: int = 8007

settings = Settings()
