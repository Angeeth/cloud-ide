from typing import List
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.file import File
from app.models.project import Project
from app.models.execution_history import ExecutionHistory
from app.models.project_member import RoleEnum
from app.services.project_service import ProjectService
from app.core.s3 import storage_manager
from app.core.docker_runner import execution_engine

class ExecutionService:
    @staticmethod
    def execute_project(db: Session, project_id: str, current_user) -> ExecutionHistory:
        role = ProjectService.get_member_role(db, project_id, current_user.id)
        if role == RoleEnum.VIEWER.value:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="VIEWER role cannot run code")

        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        # Fetch all project files from DB & storage
        all_files = db.query(File).filter(File.project_id == project_id, File.type == "file").all()
        
        files_dict = {}
        for f in all_files:
            if f.s3_key:
                content = storage_manager.get_file(f.s3_key)
                files_dict[f.path] = content

        # Run code via execution engine
        stdout, stderr, exit_code, duration_ms, status_str = execution_engine.run_code(
            language=project.language,
            files_dict=files_dict
        )

        # Record execution history in DB
        execution_record = ExecutionHistory(
            project_id=project_id,
            user_id=current_user.id,
            language=project.language,
            status=status_str,
            execution_time_ms=duration_ms,
            exit_code=exit_code,
            stdout=stdout,
            stderr=stderr
        )
        db.add(execution_record)
        db.commit()
        db.refresh(execution_record)
        return execution_record

    @staticmethod
    def get_execution_history(db: Session, project_id: str, current_user) -> List[ExecutionHistory]:
        ProjectService.get_project_by_id(db, project_id, current_user)
        return db.query(ExecutionHistory).filter(
            ExecutionHistory.project_id == project_id
        ).order_by(ExecutionHistory.created_at.desc()).all()
