from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict

class FileCreate(BaseModel):
    name: str
    path: str
    type: str  # 'file' or 'folder'
    parent_id: Optional[str] = None
    content: Optional[str] = ""

class FileUpdate(BaseModel):
    name: Optional[str] = None

class FileContentSave(BaseModel):
    content: str

class FileResponse(BaseModel):
    id: str
    project_id: str
    parent_id: Optional[str] = None
    name: str
    path: str
    type: str
    s3_key: Optional[str] = None
    size_bytes: int = 0
    created_at: datetime
    updated_at: datetime
    content: Optional[str] = None
    children: Optional[List["FileResponse"]] = []

    model_config = ConfigDict(from_attributes=True)
