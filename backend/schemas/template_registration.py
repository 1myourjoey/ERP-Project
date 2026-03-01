from __future__ import annotations

from pydantic import BaseModel, Field


class MarkerCandidate(BaseModel):
    text: str = ""
    marker: str
    source: str = "manual"
    confidence: float = 0.5
    existing: bool = False


class AnalyzeTemplateResponse(BaseModel):
    extracted_text: str
    identified_markers: list[MarkerCandidate] = Field(default_factory=list)
    existing_markers: list[str] = Field(default_factory=list)


class TemplateVariableInput(BaseModel):
    marker_name: str
    display_label: str | None = None
    source_type: str | None = None
    source_field: str | None = None
    default_value: str | None = None
    is_required: bool = True
    display_order: int = 0
    text: str | None = None


class RegisterTemplateResponse(BaseModel):
    template_id: int
    name: str
    document_type: str
    variable_count: int
    file_path: str


class TestGenerateRequest(BaseModel):
    template_id: int = Field(ge=1)
    fund_id: int = Field(ge=1)
    lp_id: int | None = Field(default=None, ge=1)
    investment_id: int | None = Field(default=None, ge=1)
    manual_vars: dict[str, str] = Field(default_factory=dict)


class InputCacheResponse(BaseModel):
    fund_id: int
    template_id: int
    inputs: dict[str, str] = Field(default_factory=dict)
