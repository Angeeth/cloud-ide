from shared.common.config import BaseServiceSettings

class Settings(BaseServiceSettings):
    SERVICE_NAME: str = "import-service"
    PORT: int = 8004
    MAX_FILE_SIZE_BYTES: int = 15 * 1024 * 1024  # 15MB max per file
    MAX_TOTAL_ZIP_SIZE_BYTES: int = 50 * 1024 * 1024  # 50MB max zip upload

settings = Settings()
