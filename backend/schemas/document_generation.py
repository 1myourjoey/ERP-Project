from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

GenerationStatus = Literal["pending", "processing", "completed", "failed"]


class MarkerInfo(BaseModel):
    key: str
    label: str
    description: str
    section: str
    required: bool = False
    default_value: str = ""


class DocumentVariableCreate(BaseModel):
    fund_id: int = Field(ge=1)
    name: str
    variables: dict[str, str] = Field(default_factory=dict)
    is_default: bool = False

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("name must not be empty")
        return name


class DocumentVariableUpdate(BaseModel):
    name: str | None = None
    variables: dict[str, str] | None = None
    is_default: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        name = value.strip()
        if not name:
            raise ValueError("name must not be empty")
        return name


class DocumentVariableResponse(BaseModel):
    id: int
    fund_id: int
    name: str
    variables: dict[str, str]
    is_default: bool
    created_at: datetime
    updated_at: datetime


class DocumentGenerateRequest(BaseModel):
    fund_id: int = Field(ge=1)
    variables: dict[str, str] = Field(default_factory=dict)
    stages: list[int] | None = None
    save_preset: bool = False
    preset_name: str | None = None

    @field_validator("stages")
    @classmethod
    def validate_stages(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return None
        if not value:
            raise ValueError("stages must not be empty when provided")
        normalized = sorted(set(value))
        if any(stage < 1 or stage > 5 for stage in normalized):
            raise ValueError("stages must contain values between 1 and 5")
        return normalized


class DocumentGenerateResponse(BaseModel):
    generation_id: int
    status: GenerationStatus
    total_files: int = 0
    success_count: int = 0
    failed_count: int = 0
    warnings: list[str] = Field(default_factory=list)
    download_url: str | None = None


class DocumentGenerationStatusResponse(BaseModel):
    id: int
    fund_id: int
    status: GenerationStatus
    total_files: int = 0
    success_count: int = 0
    failed_count: int = 0
    warnings: list[str] = Field(default_factory=list)
    error_message: str | None = None
    download_url: str | None = None
    progress_current: int | None = None
    progress_total: int | None = None
    progress_message: str | None = None


class DocumentGenerationHistoryItem(BaseModel):
    id: int
    fund_id: int
    created_by: int
    created_at: datetime
    status: GenerationStatus
    stages: list[int] | None = None
    total_files: int = 0
    success_count: int = 0
    failed_count: int = 0
    warnings: list[str] = Field(default_factory=list)
    error_message: str | None = None
    download_url: str | None = None


class TemplateFileInfo(BaseModel):
    stage: int
    stage_name: str
    file_name: str
    file_type: str
    relative_path: str


class TemplateStageInfo(BaseModel):
    stage: int
    stage_name: str
    files: list[TemplateFileInfo] = Field(default_factory=list)


class TemplateStructure(BaseModel):
    stages: list[TemplateStageInfo] = Field(default_factory=list)
    total_templates: int = 0
    markers: list[str] = Field(default_factory=list)


class AutoFillResponse(BaseModel):
    fund_id: int
    variables: dict[str, str]
    mapped_keys: list[str] = Field(default_factory=list)


class SimpleOkResponse(BaseModel):
    ok: bool


class GenerationProgressState(BaseModel):
    current: int
    total: int
    message: str
    updated_at: datetime


class GenerationProgressSnapshot(BaseModel):
    generation_id: int
    state: GenerationProgressState | None = None
    meta: dict[str, Any] = Field(default_factory=dict)
