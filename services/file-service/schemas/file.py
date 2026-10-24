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

class FileRenameRequest(BaseModel):
    name: str

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
    children: Optional[List["FileResponse"]] = None

    model_config = ConfigDict(from_attributes=True)

class StarterInitRequest(BaseModel):
    language: str
    project_name: str
    description: Optional[str] = ""

class BatchImportItem(BaseModel):
    path: str
    content: str

class BatchImportRequest(BaseModel):
    files: List[BatchImportItem]

class SyncFSItem(BaseModel):
    path: str
    type: str = "file"  # 'file' or 'folder'
    content: Optional[str] = ""

class SyncFSRequest(BaseModel):
    items: List[SyncFSItem]
