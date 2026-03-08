from __future__ import annotations

from dataclasses import dataclass, field as dc_field
from typing import Any, Callable

from sqlalchemy.orm import Session


@dataclass(frozen=True)
class SubjectFieldDef:
    key: str
    label: str
    kind: str
    data_type: str
    group: str
    description: str = ""
    operators: list[str] = dc_field(default_factory=list)
    allowed_aggregates: list[str] = dc_field(default_factory=list)
    default_aggregate: str | None = None
    is_linked_measure: bool = False


ROW_COUNT_FIELD = SubjectFieldDef(
    key="__row_count",
    label="건수",
    kind="measure",
    data_type="number",
    group="기본 지표",
    description="선택한 subject 기준 행 수입니다.",
    allowed_aggregates=["sum", "count"],
    default_aggregate="sum",
)


@dataclass(frozen=True)
class SubjectDefinition:
    key: str
    label: str
    description: str
    grain_label: str
    fields: list[SubjectFieldDef]
    default_table_fields: list[str]
    default_values: list[dict[str, Any]]
    starter_views: list[dict[str, Any]]
    load_rows: Callable[[Session], list[dict[str, Any]]]

    @property
    def field_map(self) -> dict[str, SubjectFieldDef]:
        return {field.key: field for field in self.all_fields}

    @property
    def all_fields(self) -> list[SubjectFieldDef]:
        return [ROW_COUNT_FIELD, *self.fields]


def dimension(
    key: str,
    label: str,
    data_type: str,
    group: str,
    description: str = "",
    operators: list[str] | None = None,
) -> SubjectFieldDef:
    return SubjectFieldDef(
        key=key,
        label=label,
        kind="dimension",
        data_type=data_type,
        group=group,
        description=description,
        operators=operators or _default_operators(data_type),
    )


def measure(
    key: str,
    label: str,
    data_type: str,
    group: str,
    description: str = "",
    aggregates: list[str] | None = None,
    default_aggregate: str | None = None,
    is_linked_measure: bool = False,
) -> SubjectFieldDef:
    values = aggregates or _default_aggregates(data_type)
    return SubjectFieldDef(
        key=key,
        label=label,
        kind="measure",
        data_type=data_type,
        group=group,
        description=description,
        allowed_aggregates=values,
        default_aggregate=default_aggregate or (values[0] if values else None),
        is_linked_measure=is_linked_measure,
    )


def _default_operators(data_type: str) -> list[str]:
    if data_type in {"string"}:
        return ["eq", "neq", "contains", "starts_with", "in", "is_empty", "is_not_empty"]
    if data_type in {"number"}:
        return ["eq", "gt", "gte", "lt", "lte", "between", "is_empty", "is_not_empty"]
    if data_type in {"date", "datetime"}:
        return ["on", "before", "after", "between", "relative_range", "is_empty", "is_not_empty"]
    if data_type == "boolean":
        return ["is_true", "is_false"]
    return ["eq", "neq"]


def _default_aggregates(data_type: str) -> list[str]:
    if data_type == "number":
        return ["sum", "avg", "min", "max", "count"]
    return ["count", "distinct_count"]

