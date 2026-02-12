from pydantic import BaseModel
from typing import Optional


class ChecklistItemCreate(BaseModel):
    order: int
    name: str
    required: bool = True
    checked: bool = False
    notes: Optional[str] = None


class ChecklistItemUpdate(BaseModel):
    order: Optional[int] = None
    name: Optional[str] = None
    required: Optional[bool] = None
    checked: Optional[bool] = None
    notes: Optional[str] = None


class ChecklistItemResponse(BaseModel):
    id: int
    checklist_id: int
    order: int
    name: str
    required: bool
    checked: bool
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


class ChecklistCreate(BaseModel):
    name: str
    category: Optional[str] = None
    items: list[ChecklistItemCreate] = []


class ChecklistUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    items: Optional[list[ChecklistItemCreate]] = None


class ChecklistListItem(BaseModel):
    id: int
    name: str
    category: Optional[str] = None
    total_items: int = 0
    checked_items: int = 0


class ChecklistResponse(BaseModel):
    id: int
    name: str
    category: Optional[str] = None
    items: list[ChecklistItemResponse] = []

    model_config = {"from_attributes": True}
