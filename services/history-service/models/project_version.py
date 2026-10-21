import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Text, DateTime
from database.base import Base

class ProjectVersion(Base):
    __tablename__ = "project_versions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), nullable=False, index=True)
    created_by = Column(String(36), nullable=False)
    version_number = Column(Integer, nullable=False)
    description = Column(Text, nullable=True)
    s3_snapshot_key = Column(String(1024), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
