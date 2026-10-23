import httpx
from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from config import settings
from models.execution_history import ExecutionHistory
from schemas.execution import UserResponse
from core.docker_runner import execution_engine
from shared.common.auth import UserClaims, create_access_token

class ExecutionService:
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
    def execute_project(
        db: Session,
        project_id: str,
        current_user: UserClaims,
        req_language: Optional[str] = None,
        req_entry_point: Optional[str] = None
    ) -> ExecutionHistory:
        language = (req_language and req_language.strip().lower()) or ""

        # 1. Verify user has permission (OWNER or EDITOR) and retrieve project language
        try:
            with httpx.Client(timeout=5.0) as client:
                role_res = client.get(f"{settings.PROJECT_SERVICE_URL}/projects/{project_id}/role?user_id={current_user.id}")
                if role_res.status_code == 200:
                    role_data = role_res.json()
                    role = role_data.get("role")
                    if not role:
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this project")
                    if role == "VIEWER":
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="VIEWER role cannot run code")
                    if not language and role_data.get("language"):
                        language = role_data.get("language").strip().lower()

                # Also try fetching project details using a signed internal JWT token
                if not language:
                    try:
                        token = create_access_token(
                            subject=current_user.id,
                            email=current_user.email,
                            name=current_user.name
                        )
                        proj_res = client.get(
                            f"{settings.PROJECT_SERVICE_URL}/projects/{project_id}",
                            headers={"Authorization": f"Bearer {token}"}
                        )
                        if proj_res.status_code == 200:
                            proj_lang = proj_res.json().get("language")
                            if proj_lang:
                                language = proj_lang.strip().lower()
                    except Exception:
                        pass
        except HTTPException:
            raise
        except Exception as e:
            print(f"Error checking project role / language: {e}")

        # 2. Fetch raw project files from file-service
        files_dict = {}
        try:
            with httpx.Client(timeout=10.0) as client:
                files_res = client.get(f"{settings.FILE_SERVICE_URL}/projects/{project_id}/files/raw")
                if files_res.status_code == 200:
                    files_dict = files_res.json()
        except Exception as e:
            print(f"Error fetching files from file-service: {e}")

        # 3. Intelligent fallback language detection from workspace files
        norm_keys = [k.lstrip("/\\").replace("\\", "/") for k in files_dict.keys()]
        has_py = any(k.endswith(".py") for k in norm_keys)
        has_js = any(k.endswith((".js", ".jsx", ".mjs", ".ts", ".tsx")) or k == "package.json" for k in norm_keys)
        has_c = any(k.endswith((".c", ".cpp", ".cc", ".h", ".hpp")) for k in norm_keys)
        has_java = any(k.endswith(".java") for k in norm_keys)

        if not language or language == "python":
            if has_js and not has_py:
                language = "javascript"
            elif has_c and not has_py:
                language = "c"
            elif has_java and not has_py:
                language = "java"
            elif not language:
                language = "python"

        # 4. Resolve entry point
        resolved_entry = req_entry_point
        if resolved_entry:
            clean_entry = resolved_entry.lstrip("/\\").replace("\\", "/")
            if clean_entry not in norm_keys:
                resolved_entry = None

        # 5. Run code via sandbox
        stdout, stderr, exit_code, duration_ms, status_str = execution_engine.run_code(
            language=language,
            files_dict=files_dict,
            entry_point=resolved_entry
        )

        # 6. Save execution history
        record = ExecutionHistory(
            project_id=project_id,
            user_id=current_user.id,
            language=language,
            status=status_str,
            execution_time_ms=duration_ms,
            exit_code=exit_code,
            stdout=stdout,
            stderr=stderr
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        record.user = UserResponse(id=current_user.id, email=current_user.email or "", name=current_user.name or "")
        return record

    @staticmethod
    def get_execution_history(db: Session, project_id: str, current_user: UserClaims) -> List[ExecutionHistory]:
        records = db.query(ExecutionHistory).filter(
            ExecutionHistory.project_id == project_id
        ).order_by(ExecutionHistory.created_at.desc()).all()

        user_cache = {}
        for r in records:
            if r.user_id not in user_cache:
                user_cache[r.user_id] = ExecutionService._fetch_user_details(r.user_id)
            r.user = user_cache[r.user_id]

        return records
