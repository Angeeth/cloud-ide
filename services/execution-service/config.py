from shared.common.config import BaseServiceSettings

class Settings(BaseServiceSettings):
    SERVICE_NAME: str = "execution-service"
    PORT: int = 8005

settings = Settings()
