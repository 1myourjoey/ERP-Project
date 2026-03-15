from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


class ProposalTemplateCreate(BaseModel):
    code: str = Field(min_length=2, max_length=60)
    name: str = Field(min_length=1, max_length=200)
    institution_type: str | None = Field(default=None, max_length=30)
    legacy_template_type: str | None = Field(default=None, max_length=30)
    description: str | None = None
    output_format: str = Field(default="xlsx", max_length=20)
    source_family: str = Field(default="excel", max_length=30)
    is_active: bool = True


class ProposalTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    institution_type: str | None = Field(default=None, max_length=30)
    legacy_template_type: str | None = Field(default=None, max_length=30)
    description: str | None = None
    output_format: str | None = Field(default=None, max_length=20)
    source_family: str | None = Field(default=None, max_length=30)
    is_active: bool | None = None


class ProposalTemplateSummary(BaseModel):
    id: int
    code: str
    name: str
    institution_type: str | None = None
    legacy_template_type: str | None = None
    description: str | None = None
    output_format: str
    source_family: str
    is_active: bool
    version_count: int = 0
    active_version_id: int | None = None
    active_version_label: str | None = None
    created_at: datetime
    updated_at: datetime


class ProposalTemplateSheetInput(BaseModel):
    sheet_code: str | None = Field(default=None, max_length=80)
    sheet_name: str = Field(min_length=1, max_length=120)
    sheet_kind: str = Field(default="table", max_length=20)
    display_order: int = Field(default=0, ge=0)
    is_required: bool = True
    notes: str | None = None


class ProposalTemplateFieldMappingInput(BaseModel):
    sheet_code: str = Field(min_length=1, max_length=80)
    field_key: str = Field(min_length=1, max_length=120)
    target_cell: str = Field(min_length=1, max_length=40)
    value_source: str | None = Field(default=None, max_length=255)
    transform_rule: str | None = Field(default=None, max_length=255)
    default_value: Any = None
    source_note_hint: str | None = Field(default=None, max_length=255)
    is_required: bool = False
    display_order: int = Field(default=0, ge=0)


class ProposalTemplateTableColumnInput(BaseModel):
    field_key: str = Field(min_length=1, max_length=120)
    target_column: str | None = Field(default=None, max_length=20)
    header_label: str | None = Field(default=None, max_length=200)
    value_source: str | None = Field(default=None, max_length=255)
    transform_rule: str | None = Field(default=None, max_length=255)


class ProposalTemplateTableMappingInput(BaseModel):
    sheet_code: str = Field(min_length=1, max_length=80)
    table_key: str = Field(min_length=1, max_length=120)
    start_cell: str = Field(min_length=1, max_length=40)
    row_source: str = Field(min_length=1, max_length=255)
    columns: list[ProposalTemplateTableColumnInput] = Field(default_factory=list)
    row_key_field: str | None = Field(default=None, max_length=120)
    append_mode: str = Field(default="insert", max_length=20)
    max_rows: int | None = Field(default=None, ge=1)
    notes: str | None = None


class ProposalTemplateValidationRuleInput(BaseModel):
    sheet_code: str | None = Field(default=None, max_length=80)
    rule_code: str = Field(min_length=1, max_length=120)
    rule_type: str = Field(min_length=1, max_length=40)
    severity: str = Field(default="error", max_length=20)
    target_ref: str | None = Field(default=None, max_length=120)
    rule_payload: dict[str, Any] = Field(default_factory=dict)
    message: str = Field(min_length=1, max_length=255)


class ProposalTemplateVersionCreate(BaseModel):
    version_label: str = Field(min_length=1, max_length=60)
    status: str = Field(default="draft", max_length=20)
    source_path: str | None = Field(default=None, max_length=500)
    effective_from: date | None = None
    effective_to: date | None = None
    notes: str | None = None
    import_workbook_sheets: bool = True
    sheets: list[ProposalTemplateSheetInput] = Field(default_factory=list)
    field_mappings: list[ProposalTemplateFieldMappingInput] = Field(default_factory=list)
    table_mappings: list[ProposalTemplateTableMappingInput] = Field(default_factory=list)
    validation_rules: list[ProposalTemplateValidationRuleInput] = Field(default_factory=list)


class ProposalTemplateVersionHeaderUpdate(BaseModel):
    version_label: str | None = Field(default=None, min_length=1, max_length=60)
    status: str | None = Field(default=None, max_length=20)
    source_path: str | None = Field(default=None, max_length=500)
    effective_from: date | None = None
    effective_to: date | None = None
    notes: str | None = None


class ProposalTemplateVersionCloneRequest(BaseModel):
    version_label: str = Field(min_length=1, max_length=60)
    status: str = Field(default="draft", max_length=20)
    source_path: str | None = Field(default=None, max_length=500)
    effective_from: date | None = None
    effective_to: date | None = None
    notes: str | None = None


class ProposalTemplateVersionRegistryUpdate(BaseModel):
    sheets: list[ProposalTemplateSheetInput] = Field(default_factory=list)
    field_mappings: list[ProposalTemplateFieldMappingInput] = Field(default_factory=list)
    table_mappings: list[ProposalTemplateTableMappingInput] = Field(default_factory=list)
    validation_rules: list[ProposalTemplateValidationRuleInput] = Field(default_factory=list)


class ProposalTemplateSheetResponse(BaseModel):
    id: int
    sheet_code: str
    sheet_name: str
    sheet_kind: str
    display_order: int
    is_required: bool
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class ProposalTemplateFieldMappingResponse(BaseModel):
    id: int
    sheet_code: str
    field_key: str
    target_cell: str
    value_source: str | None = None
    transform_rule: str | None = None
    default_value: Any = None
    source_note_hint: str | None = None
    is_required: bool
    display_order: int
    created_at: datetime
    updated_at: datetime


class ProposalTemplateTableMappingResponse(BaseModel):
    id: int
    sheet_code: str
    table_key: str
    start_cell: str
    row_source: str
    columns: list[dict[str, Any]] = Field(default_factory=list)
    row_key_field: str | None = None
    append_mode: str
    max_rows: int | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class ProposalTemplateValidationRuleResponse(BaseModel):
    id: int
    sheet_code: str | None = None
    rule_code: str
    rule_type: str
    severity: str
    target_ref: str | None = None
    rule_payload: dict[str, Any] = Field(default_factory=dict)
    message: str
    created_at: datetime
    updated_at: datetime


class ProposalTemplateVersionSummary(BaseModel):
    id: int
    template_id: int
    version_label: str
    status: str
    source_path: str | None = None
    source_filename: str | None = None
    effective_from: date | None = None
    effective_to: date | None = None
    notes: str | None = None
    sheet_count: int = 0
    field_mapping_count: int = 0
    table_mapping_count: int = 0
    validation_rule_count: int = 0
    created_at: datetime
    updated_at: datetime


class ProposalTemplateDetailResponse(ProposalTemplateSummary):
    versions: list[ProposalTemplateVersionSummary] = Field(default_factory=list)


class ProposalTemplateVersionDetailResponse(ProposalTemplateVersionSummary):
    template_code: str
    template_name: str
    sheets: list[ProposalTemplateSheetResponse] = Field(default_factory=list)
    field_mappings: list[ProposalTemplateFieldMappingResponse] = Field(default_factory=list)
    table_mappings: list[ProposalTemplateTableMappingResponse] = Field(default_factory=list)
    validation_rules: list[ProposalTemplateValidationRuleResponse] = Field(default_factory=list)


class ProposalTemplateVersionDiffItem(BaseModel):
    key: str
    sheet_code: str | None = None
    change_type: str
    changed_fields: list[str] = Field(default_factory=list)
    before: dict[str, Any] | None = None
    after: dict[str, Any] | None = None


class ProposalTemplateVersionDiffResponse(BaseModel):
    base_version_id: int
    base_version_label: str
    target_version_id: int
    target_version_label: str
    sheet_changes: list[ProposalTemplateVersionDiffItem] = Field(default_factory=list)
    field_mapping_changes: list[ProposalTemplateVersionDiffItem] = Field(default_factory=list)
    table_mapping_changes: list[ProposalTemplateVersionDiffItem] = Field(default_factory=list)
    validation_rule_changes: list[ProposalTemplateVersionDiffItem] = Field(default_factory=list)
    changed_sheet_codes: list[str] = Field(default_factory=list)
