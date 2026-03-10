from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


class ErpSubjectResponse(BaseModel):
    id: int
    subject_type: str
    native_id: int
    display_name: str | None = None
    state_code: str | None = None
    lifecycle_stage: str
    fund_id: int | None = None
    gp_entity_id: int | None = None
    company_id: int | None = None
    investment_id: int | None = None
    lp_id: int | None = None
    task_id: int | None = None
    workflow_instance_id: int | None = None
    obligation_id: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ErpRelationResponse(BaseModel):
    id: int
    parent_subject_id: int
    child_subject_id: int
    relation_type: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ErpEventResponse(BaseModel):
    id: int
    subject_id: int
    event_type: str
    actor_user_id: int | None = None
    correlation_key: str | None = None
    origin_model: str | None = None
    origin_id: int | None = None
    fund_id: int | None = None
    investment_id: int | None = None
    occurred_at: datetime
    before: dict[str, Any] | None = None
    after: dict[str, Any] | None = None
    payload: dict[str, Any] | None = None


class DocumentRecordResponse(BaseModel):
    id: int
    document_role: str
    origin_model: str
    origin_id: int
    origin_key: str
    title: str
    document_type: str | None = None
    status_code: str
    lifecycle_stage: str
    template_id: int | None = None
    attachment_id: int | None = None
    due_date: date | None = None
    requested_at: datetime | None = None
    received_at: datetime | None = None
    verified_at: datetime | None = None
    note: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    linked_subject_ids: list[int] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ErpEntityContextResponse(BaseModel):
    subject: ErpSubjectResponse
    related_subjects: list[ErpSubjectResponse] = Field(default_factory=list)
    relations: list[ErpRelationResponse] = Field(default_factory=list)
    documents: list[DocumentRecordResponse] = Field(default_factory=list)
    events: list[ErpEventResponse] = Field(default_factory=list)


class ErpTimelineResponse(BaseModel):
    subject: ErpSubjectResponse
    events: list[ErpEventResponse] = Field(default_factory=list)
