import os
from typing import List
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class BaseServiceSettings(BaseSettings):
    """Base settings class shared by all Mirage IDE microservices."""
    PROJECT_NAME: str = "Mirage IDE"
    SERVICE_NAME: str = "service"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    # Security & JWT
    SECRET_KEY: str = "mirage_super_secret_jwt_key_dev_mode_only_2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # PostgreSQL Database
    POSTGRES_USER: str = "mirage_user"
    POSTGRES_PASSWORD: str = "mirage_password"
    POSTGRES_DB: str = "mirage_db"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    DATABASE_URL: str = "postgresql+psycopg2://mirage_user:mirage_password@localhost:5432/mirage_db"

    @field_validator("DATABASE_URL", mode="before")
    def normalize_database_url(cls, v: str) -> str:
        if isinstance(v, str) and v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+psycopg2://", 1)
        return v

    # Redis Pub/Sub & Cache
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_URL: str = "redis://localhost:6379/0"

    # S3 / Cloud / Local Disk Storage
    USE_LOCAL_STORAGE: bool = True
    LOCAL_STORAGE_PATH: str = "./storage"
    AWS_ACCESS_KEY_ID: str = "mock_access_key"
    AWS_SECRET_ACCESS_KEY: str = "mock_secret_key"
    AWS_REGION: str = "us-east-1"
    S3_BUCKET_NAME: str = "mirage-ide-projects-bucket"

    # Docker Code Execution Engine
    EXECUTION_TIMEOUT_SECONDS: int = 10
    EXECUTION_MAX_MEMORY: str = "128m"
    EXECUTION_MAX_CPU: float = 0.5
    EXECUTION_MAX_OUTPUT_BYTES: int = 65536

    # Microservice Internal Communication Endpoints
    API_GATEWAY_URL: str = "http://localhost:8000"
    AUTH_SERVICE_URL: str = "http://localhost:8001"
    PROJECT_SERVICE_URL: str = "http://localhost:8002"
    FILE_SERVICE_URL: str = "http://localhost:8003"
    IMPORT_SERVICE_URL: str = "http://localhost:8004"
    EXECUTION_SERVICE_URL: str = "http://localhost:8005"
    TERMINAL_SERVICE_URL: str = "http://localhost:8006"
    COLLABORATION_SERVICE_URL: str = "http://localhost:8007"
    COLLABORATION_SERVICE_WS_URL: str = "ws://localhost:8007"
    CHAT_SERVICE_URL: str = "http://localhost:8008"
    CHAT_SERVICE_WS_URL: str = "ws://localhost:8008"
    HISTORY_SERVICE_URL: str = "http://localhost:8009"

    # CORS Allowed Origins
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )
