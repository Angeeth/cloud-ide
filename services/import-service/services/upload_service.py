import os
import zipfile
import io
import httpx
from typing import List, Dict
from fastapi import HTTPException, status, UploadFile
from config import settings
from shared.common.auth import UserClaims

class UploadService:
    @staticmethod
    def validate_path(path: str) -> str:
        """Sanitize relative path and prevent path traversal / Zip Slip vulnerabilities."""
        clean_path = path.replace("\\", "/").strip("/")
        parts = clean_path.split("/")
        for part in parts:
            if part in ("..", "."):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid path: Path traversal sequence detected"
                )
        return clean_path

    @staticmethod
    def verify_upload_permission(project_id: str, current_user: UserClaims):
        """Verify user is owner or editor via project-service."""
        try:
            with httpx.Client(timeout=5.0) as client:
                res = client.get(
                    f"{settings.PROJECT_SERVICE_URL}/projects/{project_id}/role?user_id={current_user.id}"
                )
                if res.status_code == 200:
                    role = res.json().get("role")
                    if not role:
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this project")
                    if role == "VIEWER":
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="VIEWER role cannot import files")
                    return
        except HTTPException:
            raise
        except Exception:
            pass

    @staticmethod
    def _send_to_file_service(project_id: str, files_payload: List[Dict[str, str]]):
        """Forward files to file-service batch import endpoint."""
        try:
            with httpx.Client(timeout=60.0) as client:
                res = client.post(
                    f"{settings.FILE_SERVICE_URL}/projects/{project_id}/batch-import",
                    json={"files": files_payload}
                )
                if res.status_code not in (200, 201):
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to persist files in file-service"
                    )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Communication error with file-service: {str(e)}"
            )

    @staticmethod
    def process_folder_upload(
        project_id: str,
        files: List[UploadFile],
        relative_paths: List[str],
        current_user: UserClaims
    ) -> int:
        UploadService.verify_upload_permission(project_id, current_user)

        files_payload = []
        for upload_file, rel_path in zip(files, relative_paths):
            clean_rel = UploadService.validate_path(rel_path)
            content_bytes = upload_file.file.read()

            if len(content_bytes) > settings.MAX_FILE_SIZE_BYTES:
                continue

            try:
                content_str = content_bytes.decode("utf-8")
            except UnicodeDecodeError:
                content_str = content_bytes.decode("latin1", errors="replace")

            files_payload.append({
                "path": clean_rel,
                "content": content_str
            })

        if files_payload:
            UploadService._send_to_file_service(project_id, files_payload)

        return len(files_payload)

    @staticmethod
    def process_zip_upload(
        project_id: str,
        zip_file: UploadFile,
        current_user: UserClaims
    ) -> int:
        UploadService.verify_upload_permission(project_id, current_user)

        content_bytes = zip_file.file.read()
        if len(content_bytes) > settings.MAX_TOTAL_ZIP_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Zip archive exceeds maximum allowed size ({settings.MAX_TOTAL_ZIP_SIZE_BYTES // (1024*1024)}MB)"
            )

        try:
            z = zipfile.ZipFile(io.BytesIO(content_bytes))
        except zipfile.BadZipFile:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid zip file archive")

        files_payload = []
        for member_name in z.namelist():
            # Skip hidden git files or OS metadata
            if member_name.startswith("__MACOSX") or "/." in member_name or member_name.startswith("."):
                continue

            clean_rel = UploadService.validate_path(member_name)
            if not clean_rel or member_name.endswith("/"):
                continue

            file_bytes = z.read(member_name)
            if len(file_bytes) > settings.MAX_FILE_SIZE_BYTES:
                continue

            try:
                content_str = file_bytes.decode("utf-8")
            except UnicodeDecodeError:
                content_str = file_bytes.decode("latin1", errors="replace")

            files_payload.append({
                "path": clean_rel,
                "content": content_str
            })

        if files_payload:
            UploadService._send_to_file_service(project_id, files_payload)

        return len(files_payload)
