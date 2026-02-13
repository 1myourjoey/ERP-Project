from pydantic import BaseModel
from datetime import date, datetime
from typing import Literal, Optional


# --- Template schemas ---

class WorkflowStepCreate(BaseModel):
    order: int
    name: str
    timing: str
    timing_offset_days: int
    estimated_time: Optional[str] = None
    quadrant: str = "Q1"
    memo: Optional[str] = None


class WorkflowDocumentCreate(BaseModel):
    name: str
    required: bool = True
    timing: Optional[str] = None
    notes: Optional[str] = None


class WorkflowWarningCreate(BaseModel):
    content: str
    category: Optional[Literal["warning", "lesson", "tip"]] = "warning"


class WorkflowCreateRequest(BaseModel):
    name: str
    trigger_description: Optional[str] = None
    category: Optional[str] = None
    total_duration: Optional[str] = None
    steps: list[WorkflowStepCreate] = []
    documents: list[WorkflowDocumentCreate] = []
    warnings: list[WorkflowWarningCreate] = []


class WorkflowUpdateRequest(BaseModel):
    name: str
    trigger_description: Optional[str] = None
    category: Optional[str] = None
    total_duration: Optional[str] = None
    steps: list[WorkflowStepCreate] = []
    documents: list[WorkflowDocumentCreate] = []
    warnings: list[WorkflowWarningCreate] = []


class WorkflowStepResponse(BaseModel):
    id: int
    order: int
    name: str
    timing: str
    timing_offset_days: int
    estimated_time: Optional[str] = None
    quadrant: str
    memo: Optional[str] = None
    model_config = {"from_attributes": True}


class WorkflowDocumentResponse(BaseModel):
    id: int
    name: str
    required: bool
    timing: Optional[str] = None
    notes: Optional[str] = None
    model_config = {"from_attributes": True}


class WorkflowWarningResponse(BaseModel):
    id: int
    content: str
    category: str = "warning"
    model_config = {"from_attributes": True}


class WorkflowResponse(BaseModel):
    id: int
    name: str
    trigger_description: Optional[str] = None
    category: Optional[str] = None
    total_duration: Optional[str] = None
    steps: list[WorkflowStepResponse] = []
    documents: list[WorkflowDocumentResponse] = []
    warnings: list[WorkflowWarningResponse] = []
    model_config = {"from_attributes": True}


class WorkflowListItem(BaseModel):
    id: int
    name: str
    trigger_description: Optional[str] = None
    category: Optional[str] = None
    total_duration: Optional[str] = None
    step_count: int = 0
    model_config = {"from_attributes": True}


# --- Instance schemas ---

class WorkflowInstantiateRequest(BaseModel):
    name: str
    trigger_date: date
    memo: Optional[str] = None


class WorkflowStepInstanceResponse(BaseModel):
    id: int
    workflow_step_id: int
    step_name: str = ""
    step_timing: str = ""
    calculated_date: date
    status: str
    completed_at: Optional[datetime] = None
    actual_time: Optional[str] = None
    notes: Optional[str] = None
    task_id: Optional[int] = None
    estimated_time: Optional[str] = None
    memo: Optional[str] = None
    model_config = {"from_attributes": True}


class WorkflowInstanceResponse(BaseModel):
    id: int
    workflow_id: int
    workflow_name: str = ""
    name: str
    trigger_date: date
    status: str
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    memo: Optional[str] = None
    step_instances: list[WorkflowStepInstanceResponse] = []
    progress: str = ""  # e.g. "3/7"
    model_config = {"from_attributes": True}


class WorkflowStepCompleteRequest(BaseModel):
    actual_time: Optional[str] = None
    notes: Optional[str] = None
