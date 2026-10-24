import os
import shutil
from config import settings
from shared.common.logging import setup_logging

logger = setup_logging(settings.SERVICE_NAME, settings.LOG_LEVEL)

# Optional cloud storage clients
try:
    from google.cloud import storage as gcs_storage
    HAS_GCS = True
except ImportError:
    HAS_GCS = False

try:
    import boto3
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False

class StorageManager:
    """
    Multi-cloud storage manager supporting:
    1. Local disk storage (default for local development)
    2. Google Cloud Storage (GCS) for GCP production deployment
    3. AWS S3 for AWS deployment
    """
    def __init__(self):
        backend = getattr(settings, "STORAGE_BACKEND", "local").lower()
        use_local_flag = getattr(settings, "USE_LOCAL_STORAGE", True)
        self.local_base_dir = os.path.abspath(settings.LOCAL_STORAGE_PATH)

        self.gcs_client = None
        self.gcs_bucket = None
        self.s3_client = None
        self.use_local = True

        # Check if Google Cloud Storage is explicitly configured or requested
        gcs_bucket_name = getattr(settings, "GCS_BUCKET_NAME", None)
        if not use_local_flag and (backend == "gcs" or gcs_bucket_name):
            if HAS_GCS:
                try:
                    self.gcs_client = gcs_storage.Client(project=getattr(settings, "GCP_PROJECT_ID", None) or None)
                    self.gcs_bucket = self.gcs_client.bucket(gcs_bucket_name or "mirage-version-history")
                    self.use_local = False
                    logger.info(f"StorageManager initialized using GOOGLE CLOUD STORAGE Bucket: {self.gcs_bucket.name}")
                    return
                except Exception as e:
                    logger.warning(f"Failed to initialize GCS client ({e}). Falling back to local disk storage.")
            else:
                logger.warning("google-cloud-storage package not available. Falling back to local disk storage.")

        # Check if AWS S3 is explicitly configured
        aws_key = getattr(settings, "AWS_ACCESS_KEY_ID", "mock")
        if not use_local_flag and backend == "s3" and not aws_key.startswith("mock") and HAS_BOTO3:
            try:
                self.s3_client = boto3.client(
                    "s3",
                    aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                    aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                    region_name=settings.AWS_REGION
                )
                self.use_local = False
                logger.info(f"StorageManager initialized using AWS S3 Bucket: {settings.S3_BUCKET_NAME}")
                return
            except Exception as e:
                logger.warning(f"Failed to initialize S3 client ({e}). Falling back to local disk storage.")

        # Default fallback: Local disk storage
        self.use_local = True
        os.makedirs(self.local_base_dir, exist_ok=True)
        logger.info(f"StorageManager initialized using LOCAL DISK STORAGE at {self.local_base_dir}")

    def save_file(self, s3_key: str, content: str) -> str:
        clean_key = s3_key.replace("\\", "/").lstrip("/")
        if self.gcs_bucket:
            try:
                blob = self.gcs_bucket.blob(clean_key)
                blob.upload_from_string(content.encode("utf-8"), content_type="text/plain")
                return clean_key
            except Exception as e:
                logger.error(f"GCS Upload error for key {clean_key}: {e}")
                raise e

        if self.s3_client:
            try:
                self.s3_client.put_object(
                    Bucket=settings.S3_BUCKET_NAME,
                    Key=clean_key,
                    Body=content.encode("utf-8")
                )
                return clean_key
            except Exception as e:
                logger.error(f"S3 PutObject error for key {clean_key}: {e}")
                raise e

        # Local disk storage
        target_path = os.path.join(self.local_base_dir, clean_key.replace("/", os.sep))
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        with open(target_path, "w", encoding="utf-8") as f:
            f.write(content)
        return clean_key

    def get_file(self, s3_key: str) -> str:
        clean_key = s3_key.replace("\\", "/").lstrip("/")
        if self.gcs_bucket:
            try:
                blob = self.gcs_bucket.blob(clean_key)
                if not blob.exists():
                    return ""
                return blob.download_as_text(encoding="utf-8")
            except Exception as e:
                logger.error(f"GCS Download error for key {clean_key}: {e}")
                return ""

        if self.s3_client:
            try:
                response = self.s3_client.get_object(
                    Bucket=settings.S3_BUCKET_NAME,
                    Key=clean_key
                )
                return response["Body"].read().decode("utf-8")
            except Exception as e:
                logger.error(f"S3 GetObject error for key {clean_key}: {e}")
                return ""

        # Local disk storage
        target_path = os.path.join(self.local_base_dir, clean_key.replace("/", os.sep))
        if not os.path.exists(target_path):
            return ""
        with open(target_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()

    def delete_file(self, s3_key: str):
        clean_key = s3_key.replace("\\", "/").lstrip("/")
        if self.gcs_bucket:
            try:
                blob = self.gcs_bucket.blob(clean_key)
                if blob.exists():
                    blob.delete()
            except Exception as e:
                logger.error(f"GCS Delete error for key {clean_key}: {e}")
            return

        if self.s3_client:
            try:
                self.s3_client.delete_object(
                    Bucket=settings.S3_BUCKET_NAME,
                    Key=clean_key
                )
            except Exception as e:
                logger.error(f"S3 DeleteObject error for key {clean_key}: {e}")
            return

        # Local disk storage
        target_path = os.path.join(self.local_base_dir, clean_key.replace("/", os.sep))
        if os.path.exists(target_path):
            try:
                os.remove(target_path)
            except Exception:
                pass

    def delete_directory(self, prefix: str):
        clean_prefix = prefix.replace("\\", "/").strip("/") + "/"
        if self.gcs_bucket:
            try:
                blobs = self.gcs_bucket.list_blobs(prefix=clean_prefix)
                for blob in blobs:
                    blob.delete()
            except Exception as e:
                logger.error(f"GCS Delete Directory error for prefix {clean_prefix}: {e}")
            return

        if self.s3_client:
            try:
                paginator = self.s3_client.get_paginator('list_objects_v2')
                for page in paginator.paginate(Bucket=settings.S3_BUCKET_NAME, Prefix=clean_prefix):
                    if 'Contents' in page:
                        delete_keys = [{'Key': obj['Key']} for obj in page['Contents']]
                        self.s3_client.delete_objects(Bucket=settings.S3_BUCKET_NAME, Delete={'Objects': delete_keys})
            except Exception as e:
                logger.error(f"S3 Delete Directory error for prefix {clean_prefix}: {e}")
            return

        # Local disk storage
        target_path = os.path.join(self.local_base_dir, prefix.replace("/", os.sep))
        if os.path.exists(target_path) and os.path.isdir(target_path):
            try:
                shutil.rmtree(target_path)
            except Exception:
                pass

storage_manager = StorageManager()
