import os
import boto3
from config import settings
from shared.common.logging import setup_logging

logger = setup_logging(settings.SERVICE_NAME, settings.LOG_LEVEL)

class StorageManager:
    def __init__(self):
        self.use_local = settings.USE_LOCAL_STORAGE or settings.AWS_ACCESS_KEY_ID.startswith("mock")
        self.local_base_dir = os.path.abspath(settings.LOCAL_STORAGE_PATH)
        
        if self.use_local:
            os.makedirs(self.local_base_dir, exist_ok=True)
            logger.info(f"StorageManager initialized using LOCAL DISK STORAGE at {self.local_base_dir}")
        else:
            try:
                self.s3_client = boto3.client(
                    "s3",
                    aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                    aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                    region_name=settings.AWS_REGION
                )
                logger.info(f"StorageManager initialized using AWS S3 Bucket: {settings.S3_BUCKET_NAME}")
            except Exception as e:
                logger.warning(f"Failed to initialize AWS S3 client ({e}). Falling back to local disk storage.")
                self.use_local = True
                os.makedirs(self.local_base_dir, exist_ok=True)

    def save_file(self, s3_key: str, content: str) -> str:
        if self.use_local:
            target_path = os.path.join(self.local_base_dir, s3_key.replace("/", os.sep))
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            with open(target_path, "w", encoding="utf-8") as f:
                f.write(content)
            return s3_key
        else:
            try:
                self.s3_client.put_object(
                    Bucket=settings.S3_BUCKET_NAME,
                    Key=s3_key,
                    Body=content.encode("utf-8")
                )
                return s3_key
            except Exception as e:
                logger.error(f"S3 PutObject error for key {s3_key}: {e}")
                raise e

    def get_file(self, s3_key: str) -> str:
        if self.use_local:
            target_path = os.path.join(self.local_base_dir, s3_key.replace("/", os.sep))
            if not os.path.exists(target_path):
                return ""
            with open(target_path, "r", encoding="utf-8", errors="replace") as f:
                return f.read()
        else:
            try:
                response = self.s3_client.get_object(
                    Bucket=settings.S3_BUCKET_NAME,
                    Key=s3_key
                )
                return response["Body"].read().decode("utf-8")
            except Exception as e:
                logger.error(f"S3 GetObject error for key {s3_key}: {e}")
                return ""

storage_manager = StorageManager()
