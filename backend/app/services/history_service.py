import json
from typing import List
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.file import File
from app.models.project import Project
from app.models.project_version import ProjectVersion
from app.models.project_member import RoleEnum
from app.services.project_service import ProjectService
from app.core.s3 import storage_manager

class HistoryService:
    @staticmethod
    def create_version_snapshot(db: Session, project_id: str, description: str, current_user) -> ProjectVersion:
        role = ProjectService.get_member_role(db, project_id, current_user.id)
        if role == RoleEnum.VIEWER.value:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="VIEWER role cannot create version snapshots")

        # Determine next version number
        latest_version = db.query(ProjectVersion).filter(
            ProjectVersion.project_id == project_id
        ).order_by(ProjectVersion.version_number.desc()).first()

        next_ver_num = (latest_version.version_number + 1) if latest_version else 1

        # Fetch all files metadata and content
        files = db.query(File).filter(File.project_id == project_id).all()
        snapshot_data = []

        for f in files:
            content = ""
            if f.type == "file" and f.s3_key:
                content = storage_manager.get_file(f.s3_key)

            snapshot_data.append({
                "id": f.id,
                "parent_id": f.parent_id,
                "name": f.name,
                "path": f.path,
                "type": f.type,
                "size_bytes": f.size_bytes,
                "content": content
            })

        snapshot_key = f"snapshots/{project_id}/v{next_ver_num}.json"
        storage_manager.save_file(snapshot_key, json.dumps(snapshot_data, indent=2))

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
        return version_obj

    @staticmethod
    def get_project_history(db: Session, project_id: str, current_user) -> List[ProjectVersion]:
        ProjectService.get_project_by_id(db, project_id, current_user)
        return db.query(ProjectVersion).filter(
            ProjectVersion.project_id == project_id
        ).order_by(ProjectVersion.version_number.desc()).all()

    @staticmethod
    def restore_version(db: Session, project_id: str, version_id: str, current_user):
        role = ProjectService.get_member_role(db, project_id, current_user.id)
        if role != RoleEnum.OWNER.value and role != RoleEnum.EDITOR.value:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only OWNER or EDITOR can restore project versions")

        version_obj = db.query(ProjectVersion).filter(
            ProjectVersion.id == version_id,
            ProjectVersion.project_id == project_id
        ).first()
        if not version_obj or not version_obj.s3_snapshot_key:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot version not found")

        snapshot_json = storage_manager.get_file(version_obj.s3_snapshot_key)
        if not snapshot_json:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to load snapshot payload")

        snapshot_data = json.loads(snapshot_json)

        # Remove existing files for project
        existing_files = db.query(File).filter(File.project_id == project_id).all()
        for ef in existing_files:
            if ef.s3_key:
                storage_manager.delete_file(ef.s3_key)
            db.delete(ef)
        db.commit()

        # Re-create files from snapshot
        id_mapping = {}
        # First create folders
        folders = [item for item in snapshot_data if item["type"] == "folder"]
        files = [item for item in snapshot_data if item["type"] == "file"]

        for item in folders:
            nf = File(
                project_id=project_id,
                parent_id=None,
                name=item["name"],
                path=item["path"],
                type="folder"
            )
            db.add(nf)
            db.commit()
            db.refresh(nf)
            id_mapping[item["id"]] = nf.id

        # Second pass to update folder parent_ids
        for item in folders:
            if item.get("parent_id") and item["parent_id"] in id_mapping:
                f_obj = db.query(File).filter(File.id == id_mapping[item["id"]]).first()
                if f_obj:
                    f_obj.parent_id = id_mapping[item["parent_id"]]
        db.commit()

        # Create files
        for item in files:
            parent_id = id_mapping.get(item.get("parent_id")) if item.get("parent_id") else None
            s3_key = f"projects/{project_id}/{item['path']}"
            storage_manager.save_file(s3_key, item.get("content", ""))

            nf = File(
                project_id=project_id,
                parent_id=parent_id,
                name=item["name"],
                path=item["path"],
                type="file",
                s3_key=s3_key,
                size_bytes=len(item.get("content", "").encode("utf-8"))
            )
            db.add(nf)
        db.commit()

        return {"status": "success", "message": f"Successfully restored project to version {version_obj.version_number}"}
