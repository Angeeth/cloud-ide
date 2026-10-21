import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Text, DateTime
from database.base import Base

class ExecutionHistory(Base):
    __tablename__ = "execution_history"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), nullable=False, index=True)
    user_id = Column(String(36), nullable=False)
    language = Column(String(50), nullable=False)
    status = Column(String(50), nullable=False)  # SUCCESS, ERROR, TIMEOUT
    execution_time_ms = Column(Float, nullable=True)
    exit_code = Column(Integer, nullable=True)
    stdout = Column(Text, nullable=True)
    stderr = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
