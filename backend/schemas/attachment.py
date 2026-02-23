from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AttachmentResponse(BaseModel):
    id: int
    filename: str
    original_filename: str
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    created_at: Optional[datetime] = None
    url: str

    model_config = {"from_attributes": True}


class AttachmentLinkUpdate(BaseModel):
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
