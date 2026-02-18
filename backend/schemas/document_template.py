from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class DocumentTemplateResponse(BaseModel):
    id: int
    name: str
    category: str
    file_path: Optional[str] = ""
    builder_name: Optional[str] = None
    description: Optional[str] = ""
    variables: Optional[str] = "[]"
    custom_data: Optional[str] = "{}"
    workflow_step_label: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
