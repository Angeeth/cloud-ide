from shared.common.config import BaseServiceSettings

class Settings(BaseServiceSettings):
    SERVICE_NAME: str = "api-gateway"
    PORT: int = 8000

settings = Settings()
