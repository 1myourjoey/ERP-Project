from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import Literal, Optional


# --- Template schemas ---

class WorkflowStepDocumentInput(BaseModel):
    name: str
    required: bool = True
    timing: Optional[str] = None
    notes: Optional[str] = None
    document_template_id: Optional[int] = None


class WorkflowStepCreate(BaseModel):
    order: int
    name: str
    timing: str
    timing_offset_days: int
    estimated_time: Optional[str] = None
    quadrant: str = "Q1"
    memo: Optional[str] = None
    is_notice: bool = False
    is_report: bool = False
    step_documents: list[WorkflowStepDocumentInput] = []


class WorkflowDocumentCreate(BaseModel):
    name: str
    required: bool = True
    timing: Optional[str] = None
    notes: Optional[str] = None


class WorkflowDocumentInput(BaseModel):
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


class WorkflowStepDocumentResponse(BaseModel):
    id: int
    workflow_step_id: int
    document_template_id: Optional[int] = None
    name: str
    required: bool = True
    timing: Optional[str] = None
    notes: Optional[str] = None
    template_name: Optional[str] = None
    template_category: Optional[str] = None
    model_config = {"from_attributes": True}


class WorkflowStepResponse(BaseModel):
    id: int
    workflow_id: int
    order: int
    name: str
    timing: str
    timing_offset_days: int
    estimated_time: Optional[str] = None
    quadrant: str
    memo: Optional[str] = None
    is_notice: bool = False
    is_report: bool = False
    step_documents: list[WorkflowStepDocumentResponse] = []
    model_config = {"from_attributes": True}


class WorkflowDocumentResponse(BaseModel):
    id: int
    workflow_id: int
    name: str
    required: bool
    timing: Optional[str] = None
    notes: Optional[str] = None
    model_config = {"from_attributes": True}


class WorkflowWarningResponse(BaseModel):
    id: int
    workflow_id: int
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
    investment_id: Optional[int] = None
    company_id: Optional[int] = None
    fund_id: Optional[int] = None
    gp_entity_id: Optional[int] = None


class WorkflowInstanceUpdateRequest(BaseModel):
    name: str
    trigger_date: date
    memo: Optional[str] = None


class WorkflowInstanceSwapTemplateRequest(BaseModel):
    template_id: int = Field(ge=1)


class WorkflowStepInstanceResponse(BaseModel):
    id: int
    instance_id: int
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
    investment_id: Optional[int] = None
    company_id: Optional[int] = None
    fund_id: Optional[int] = None
    gp_entity_id: Optional[int] = None
    investment_name: Optional[str] = None
    company_name: Optional[str] = None
    fund_name: Optional[str] = None
    gp_entity_name: Optional[str] = None
    step_instances: list[WorkflowStepInstanceResponse] = []
    progress: str = ""  # e.g. "3/7"
    model_config = {"from_attributes": True}


class WorkflowStepLPPaidInInput(BaseModel):
    lp_id: int
    paid_in: float = Field(ge=0)


class WorkflowStepCompleteRequest(BaseModel):
    actual_time: Optional[str] = None
    notes: Optional[str] = None
    lp_paid_in_updates: list[WorkflowStepLPPaidInInput] = []
