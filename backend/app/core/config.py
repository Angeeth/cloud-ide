import os
from typing import List, Union
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AnyHttpUrl, validator, field_validator

class Settings(BaseSettings):
    PROJECT_NAME: str = "Mirage IDE"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    SECRET_KEY: str = "mirage_super_secret_jwt_key_dev_mode_only_2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # Database
    POSTGRES_USER: str = "mirage_user"
    POSTGRES_PASSWORD: str = "mirage_password"
    POSTGRES_DB: str = "mirage_db"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    DATABASE_URL: str = "postgresql://mirage_user:mirage_password@localhost:5432/mirage_db"

    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_URL: str = "redis://localhost:6379/0"

    # S3 / Cloud Storage
    AWS_ACCESS_KEY_ID: str = "mock_access_key"
    AWS_SECRET_ACCESS_KEY: str = "mock_secret_key"
    AWS_REGION: str = "us-east-1"
    S3_BUCKET_NAME: str = "mirage-ide-projects-bucket"
    USE_LOCAL_STORAGE: bool = True
    LOCAL_STORAGE_PATH: str = "./storage"

    # Docker Code Execution
    EXECUTION_TIMEOUT_SECONDS: int = 10
    EXECUTION_MAX_MEMORY: str = "128m"
    EXECUTION_MAX_CPU: float = 0.5
    EXECUTION_MAX_OUTPUT_BYTES: int = 65536

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
