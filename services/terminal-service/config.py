from shared.common.config import BaseServiceSettings

class Settings(BaseServiceSettings):
    SERVICE_NAME: str = "terminal-service"
    PORT: int = 8006
    COMMAND_TIMEOUT_SECONDS: int = 15

settings = Settings()
