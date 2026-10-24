import json
import httpx
from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from config import settings
from models.project_version import ProjectVersion
from schemas.history import UserResponse
from core.s3 import storage_manager
from shared.common.auth import UserClaims

class HistoryService:
    @staticmethod
    def _fetch_user_details(user_id: str) -> Optional[UserResponse]:
        try:
            with httpx.Client(timeout=5.0) as client:
                res = client.get(f"{settings.AUTH_SERVICE_URL}/users/{user_id}")
                if res.status_code == 200:
                    data = res.json()
                    return UserResponse(id=data["id"], email=data["email"], name=data["name"])
        except Exception:
            pass
        return UserResponse(id=user_id, email=f"{user_id[:8]}@mirage.dev", name=f"User {user_id[:8]}")

    @staticmethod
    def _verify_role(project_id: str, user_id: str, allowed_roles: List[str]):
        try:
            with httpx.Client(timeout=5.0) as client:
                res = client.get(f"{settings.PROJECT_SERVICE_URL}/projects/{project_id}/role?user_id={user_id}")
                if res.status_code == 200:
                    role = res.json().get("role")
                    if not role:
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this project")
                    if role not in allowed_roles:
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Role '{role}' is not authorized for this operation")
        except HTTPException:
            raise
        except Exception:
            pass

    @staticmethod
    def create_version_snapshot(db: Session, project_id: str, description: str, current_user: UserClaims) -> ProjectVersion:
        HistoryService._verify_role(project_id, current_user.id, ["OWNER", "EDITOR"])

        # Next version number
        latest_version = db.query(ProjectVersion).filter(
            ProjectVersion.project_id == project_id
        ).order_by(ProjectVersion.version_number.desc()).first()
        next_ver_num = (latest_version.version_number + 1) if latest_version else 1

        # Fetch files and folders from file-service
        files_dict = {}
        folders_list = []
        try:
            with httpx.Client(timeout=10.0) as client:
                res = client.get(f"{settings.FILE_SERVICE_URL}/projects/{project_id}/files/raw")
                if res.status_code == 200:
                    files_dict = res.json()
                res_folders = client.get(f"{settings.FILE_SERVICE_URL}/projects/{project_id}/folders/raw")
                if res_folders.status_code == 200:
                    folders_list = res_folders.json()
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to fetch files from file-service: {e}")

        snapshot_payload = {
            "files": files_dict,
            "folders": folders_list
        }
        snapshot_key = f"snapshots/{project_id}/v{next_ver_num}.json"
        storage_manager.save_file(snapshot_key, json.dumps(snapshot_payload, indent=2))

        version_obj = ProjectVersion(
            project_id=project_id,
            created_by=current_user.id,
            version_number=next_ver_num,
            description=description,
            s3_snapshot_key=snapshot_key
        )
        db.add(version_obj)
        db.commit()
        db.refresh(version_obj)
        version_obj.creator = UserResponse(id=current_user.id, email=current_user.email or "", name=current_user.name or "")
        return version_obj

    @staticmethod
    def get_project_history(db: Session, project_id: str, current_user: UserClaims) -> List[ProjectVersion]:
        HistoryService._verify_role(project_id, current_user.id, ["OWNER", "EDITOR", "VIEWER"])

        versions = db.query(ProjectVersion).filter(
            ProjectVersion.project_id == project_id
        ).order_by(ProjectVersion.version_number.desc()).all()

        user_cache = {}
        for v in versions:
            if v.created_by not in user_cache:
                user_cache[v.created_by] = HistoryService._fetch_user_details(v.created_by)
            v.creator = user_cache[v.created_by]

        return versions

    @staticmethod
    def restore_version(db: Session, project_id: str, version_id: str, current_user: UserClaims):
        HistoryService._verify_role(project_id, current_user.id, ["OWNER", "EDITOR"])

        version_obj = db.query(ProjectVersion).filter(
            ProjectVersion.id == version_id,
            ProjectVersion.project_id == project_id
        ).first()
        if not version_obj or not version_obj.s3_snapshot_key:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot version not found")

        snapshot_json = storage_manager.get_file(version_obj.s3_snapshot_key)
        if not snapshot_json:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to load snapshot payload")

        raw_payload = json.loads(snapshot_json)
        if isinstance(raw_payload, dict) and "files" in raw_payload:
            files_dict = raw_payload.get("files", {})
            folders_list = raw_payload.get("folders", [])
        else:
            files_dict = raw_payload
            folders_list = []

        # Prepare items for full filesystem sync (both files and folders)
        sync_items = []
        for f_path in folders_list:
            sync_items.append({"path": f_path, "type": "folder", "content": ""})
        for f_path, content in files_dict.items():
            sync_items.append({"path": f_path, "type": "file", "content": content})

        # 1. Clear existing files and sync full snapshot tree (files + folders) into file-service
        try:
            with httpx.Client(timeout=15.0) as client:
                client.delete(f"{settings.FILE_SERVICE_URL}/projects/{project_id}/files-all")
                client.post(
                    f"{settings.FILE_SERVICE_URL}/projects/{project_id}/sync-fs",
                    json={"items": sync_items}
                )
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to restore files via file-service: {e}")

        return {"status": "success", "message": f"Successfully restored project to version {version_obj.version_number}"}
