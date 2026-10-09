import uuid
from datetime import datetime
from sqlalchemy import Column, String, BigInteger, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database.session import Base

class File(Base):
    __tablename__ = "files"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    parent_id = Column(String(36), ForeignKey("files.id", ondelete="CASCADE"), nullable=True)
    name = Column(String(255), nullable=False)
    path = Column(String(1024), nullable=False)
    type = Column(String(10), nullable=False)  # 'file' or 'folder'
    s3_key = Column(String(1024), nullable=True)
    size_bytes = Column(BigInteger, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="files")
    parent = relationship("File", remote_side=[id], backref="children")

    __table_args__ = (
        UniqueConstraint("project_id", "path", name="uix_project_file_path"),
    )
