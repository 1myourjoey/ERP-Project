from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


OperatorLiteral = Literal[
    "eq",
    "neq",
    "contains",
    "starts_with",
    "in",
    "gt",
    "gte",
    "lt",
    "lte",
    "between",
    "on",
    "before",
    "after",
    "relative_range",
    "is_true",
    "is_false",
    "is_empty",
    "is_not_empty",
]

AggregateLiteral = Literal["sum", "avg", "min", "max", "count", "distinct_count"]
ModeLiteral = Literal["pivot", "table"]


class AnalyticsFieldMeta(BaseModel):
    key: str
    label: str
    kind: Literal["dimension", "measure"]
    data_type: Literal["string", "number", "boolean", "date", "datetime"]
    group: str
    description: str | None = None
    operators: list[OperatorLiteral] = Field(default_factory=list)
    allowed_aggregates: list[AggregateLiteral] = Field(default_factory=list)
    default_aggregate: AggregateLiteral | None = None
    is_linked_measure: bool = False


class AnalyticsStarterView(BaseModel):
    key: str
    label: str
    description: str
    subject_key: str
    config: dict[str, Any]


class AnalyticsSubjectMeta(BaseModel):
    key: str
    label: str
    description: str
    grain_label: str
    fields: list[AnalyticsFieldMeta] = Field(default_factory=list)
    default_table_fields: list[str] = Field(default_factory=list)
    default_values: list[dict[str, Any]] = Field(default_factory=list)


class AnalyticsCatalogResponse(BaseModel):
    subjects: list[AnalyticsSubjectMeta] = Field(default_factory=list)
    starter_views: list[AnalyticsStarterView] = Field(default_factory=list)
    executive_packs: list["AnalyticsExecutivePack"] = Field(default_factory=list)
    executive_filter_options: "AnalyticsExecutiveFilterOptions" = Field(default_factory=lambda: AnalyticsExecutiveFilterOptions())


class AnalyticsFilter(BaseModel):
    field: str
    op: OperatorLiteral
    value: Any = None
    value_to: Any = None


class AnalyticsSort(BaseModel):
    field: str
    direction: Literal["asc", "desc"] = "asc"


class AnalyticsValueSpec(BaseModel):
    key: str
    aggregate: AggregateLiteral | None = None
    alias: str | None = None


class AnalyticsQueryOptions(BaseModel):
    show_subtotals: bool = True
    show_grand_totals: bool = True
    hide_empty: bool = False
    hide_zero: bool = False
    row_limit: int = Field(default=200, ge=1, le=50000)
    column_limit: int = Field(default=50, ge=1, le=200)


class AnalyticsQueryRequest(BaseModel):
    subject_key: str
    mode: ModeLiteral = "pivot"
    rows: list[str] = Field(default_factory=list)
    columns: list[str] = Field(default_factory=list)
    values: list[AnalyticsValueSpec] = Field(default_factory=list)
    selected_fields: list[str] = Field(default_factory=list)
    filters: list[AnalyticsFilter] = Field(default_factory=list)
    sorts: list[AnalyticsSort] = Field(default_factory=list)
    options: AnalyticsQueryOptions = Field(default_factory=AnalyticsQueryOptions)


class AnalyticsExecutiveFilterBinding(BaseModel):
    fund_field: str | None = None
    date_field: str | None = None


ExecutiveVisualLiteral = Literal[
    "kpi",
    "line",
    "stacked_area",
    "bar",
    "grouped_bar",
    "stacked_bar",
    "donut",
    "ranked_bar",
    "table",
]


class AnalyticsExecutiveCard(BaseModel):
    key: str
    title: str
    description: str
    subject_key: str
    visual_type: ExecutiveVisualLiteral
    height: Literal["sm", "md", "lg"] = "md"
    query: AnalyticsQueryRequest
    filter_binding: AnalyticsExecutiveFilterBinding = Field(default_factory=AnalyticsExecutiveFilterBinding)
    direct_analysis_label: str = "직접 분석으로 열기"


class AnalyticsExecutiveSection(BaseModel):
    key: str
    label: str
    layout: Literal["kpi", "grid"] = "grid"
    cards: list[AnalyticsExecutiveCard] = Field(default_factory=list)


class AnalyticsExecutivePack(BaseModel):
    key: str
    label: str
    description: str
    sections: list[AnalyticsExecutiveSection] = Field(default_factory=list)


class AnalyticsOptionItem(BaseModel):
    value: str
    label: str


class AnalyticsExecutiveFilterOptions(BaseModel):
    funds: list[AnalyticsOptionItem] = Field(default_factory=list)


class AnalyticsResultField(BaseModel):
    key: str
    label: str
    kind: Literal["dimension", "measure"]
    data_type: Literal["string", "number", "boolean", "date", "datetime"]


class AnalyticsQueryMeta(BaseModel):
    subject_key: str
    subject_label: str
    mode: ModeLiteral
    grain_label: str
    execution_ms: int = 0
    truncated: bool = False
    warnings: list[str] = Field(default_factory=list)
    result_count: int = 0


class AnalyticsQueryResponse(BaseModel):
    meta: AnalyticsQueryMeta
    row_fields: list[AnalyticsResultField] = Field(default_factory=list)
    column_fields: list[AnalyticsResultField] = Field(default_factory=list)
    value_fields: list[AnalyticsResultField] = Field(default_factory=list)
    table_fields: list[AnalyticsResultField] = Field(default_factory=list)
    rows: list[dict[str, Any]] = Field(default_factory=list)
    grand_totals: dict[str, Any] = Field(default_factory=dict)


class AnalyticsSavedViewCreate(BaseModel):
    name: str
    description: str | None = None
    subject_key: str
    config: dict[str, Any]
    is_favorite: bool = False


class AnalyticsSavedViewUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    subject_key: str | None = None
    config: dict[str, Any] | None = None
    is_favorite: bool | None = None


class AnalyticsSavedViewResponse(BaseModel):
    id: int
    owner_user_id: int
    name: str
    description: str | None = None
    subject_key: str
    config: dict[str, Any]
    is_favorite: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AnalyticsExportRequest(BaseModel):
    view_id: int | None = None
    query: AnalyticsQueryRequest | None = None
    file_name: str | None = None


class AnalyticsBatchQueryItem(BaseModel):
    key: str
    query: AnalyticsQueryRequest


class AnalyticsBatchQueryRequest(BaseModel):
    items: list[AnalyticsBatchQueryItem] = Field(default_factory=list)


class AnalyticsBatchQueryResult(BaseModel):
    key: str
    response: AnalyticsQueryResponse | None = None
    error: str | None = None


class AnalyticsBatchQueryResponse(BaseModel):
    results: list[AnalyticsBatchQueryResult] = Field(default_factory=list)

