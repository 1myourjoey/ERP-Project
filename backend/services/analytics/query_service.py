from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, datetime, timedelta
from time import perf_counter
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from schemas.analytics import (
    AnalyticsQueryRequest,
    AnalyticsQueryResponse,
    AnalyticsQueryMeta,
    AnalyticsResultField,
    AnalyticsValueSpec,
)
from services.analytics.catalog import get_subject_definition
from services.analytics.common import distinct_count, ensure_list, to_iso, to_number


def run_query(db: Session, payload: AnalyticsQueryRequest) -> AnalyticsQueryResponse:
    started_at = perf_counter()
    subject = get_subject_definition(payload.subject_key)
    if subject is None:
        raise HTTPException(status_code=404, detail="분석 subject를 찾을 수 없습니다.")

    field_map = subject.field_map
    _validate_payload(subject, payload)

    base_rows = [{**row, "__row_count": 1} for row in subject.load_rows(db)]
    filtered_rows = _apply_filters(base_rows, payload.filters, field_map)
    warnings: list[str] = []

    if payload.mode == "table":
        selected_fields = payload.selected_fields or subject.default_table_fields
        _validate_fields(field_map, selected_fields, kind=None)
        sorted_rows = _apply_sorts(filtered_rows, payload.sorts)
        limited_rows, truncated = _apply_limit(sorted_rows, payload.options.row_limit)
        if truncated:
            warnings.append(f"상세 행이 {payload.options.row_limit}건으로 제한되었습니다.")
        table_rows = [{field: to_iso(row.get(field)) for field in selected_fields} for row in limited_rows]
        meta = AnalyticsQueryMeta(
            subject_key=subject.key,
            subject_label=subject.label,
            mode=payload.mode,
            grain_label=subject.grain_label,
            execution_ms=int((perf_counter() - started_at) * 1000),
            truncated=truncated,
            warnings=warnings,
            result_count=len(sorted_rows),
        )
        return AnalyticsQueryResponse(
            meta=meta,
            table_fields=[_result_field(field_map[key]) for key in selected_fields],
            rows=table_rows,
        )

    row_keys = payload.rows
    column_keys = payload.columns
    value_specs = list(payload.values)
    if not value_specs:
        value_specs = [AnalyticsValueSpec(**value) for value in subject.default_values]
    _validate_fields(field_map, row_keys, kind="dimension")
    _validate_fields(field_map, column_keys, kind="dimension")
    _validate_value_specs(field_map, value_specs)

    grouped_rows = _group_rows(filtered_rows, row_keys, column_keys, value_specs)
    grouped_rows = _apply_sorts(grouped_rows, payload.sorts)
    if payload.options.hide_empty:
        grouped_rows = [row for row in grouped_rows if any(row.get(key) not in (None, "") for key in [*row_keys, *column_keys])]
    if payload.options.hide_zero:
        value_aliases = [_measure_alias(spec) for spec in value_specs]
        grouped_rows = [row for row in grouped_rows if any(to_number(row.get(alias)) != 0 for alias in value_aliases)]
    total_group_count = len(grouped_rows)
    grouped_rows, truncated = _apply_limit(grouped_rows, payload.options.row_limit)
    if truncated:
        warnings.append(f"피벗 결과가 {payload.options.row_limit}행으로 제한되었습니다.")

    grand_totals = {
        _measure_alias(spec): _aggregate_rows(filtered_rows, spec.key, spec.aggregate or field_map[spec.key].default_aggregate or "sum")
        for spec in value_specs
    }

    meta = AnalyticsQueryMeta(
        subject_key=subject.key,
        subject_label=subject.label,
        mode=payload.mode,
        grain_label=subject.grain_label,
        execution_ms=int((perf_counter() - started_at) * 1000),
        truncated=truncated,
        warnings=warnings,
        result_count=total_group_count,
    )
    return AnalyticsQueryResponse(
        meta=meta,
        row_fields=[_result_field(field_map[key]) for key in row_keys],
        column_fields=[_result_field(field_map[key]) for key in column_keys],
        value_fields=[_result_field(field_map[spec.key], alias=_measure_alias(spec)) for spec in value_specs],
        rows=[{key: to_iso(value) for key, value in row.items()} for row in grouped_rows],
        grand_totals={key: to_iso(value) for key, value in grand_totals.items()},
    )


def _validate_payload(subject, payload: AnalyticsQueryRequest) -> None:
    if payload.mode == "pivot":
        if len(payload.rows) > 4:
            raise HTTPException(status_code=400, detail="행 필드는 최대 4개까지 허용됩니다.")
        if len(payload.columns) > 2:
            raise HTTPException(status_code=400, detail="열 필드는 최대 2개까지 허용됩니다.")
        if len(payload.values) > 6:
            raise HTTPException(status_code=400, detail="값 필드는 최대 6개까지 허용됩니다.")
    else:
        if payload.options.row_limit > 500:
            raise HTTPException(status_code=400, detail="상세 행 미리보기는 최대 500건까지 허용됩니다.")


def _validate_fields(field_map: dict[str, Any], keys: list[str], kind: str | None) -> None:
    for key in keys:
        field = field_map.get(key)
        if field is None:
            raise HTTPException(status_code=400, detail=f"유효하지 않은 필드입니다: {key}")
        if kind and field.kind != kind:
            raise HTTPException(status_code=400, detail=f"{key} 필드는 {kind} 필드로 사용할 수 없습니다.")


def _validate_value_specs(field_map: dict[str, Any], specs) -> None:
    for spec in specs:
        field = field_map.get(spec.key)
        if field is None:
            raise HTTPException(status_code=400, detail=f"유효하지 않은 값 필드입니다: {spec.key}")
        if field.kind != "measure":
            raise HTTPException(status_code=400, detail=f"{spec.key} 필드는 값 영역에 둘 수 없습니다.")
        aggregate = spec.aggregate or field.default_aggregate
        if aggregate not in field.allowed_aggregates:
            raise HTTPException(status_code=400, detail=f"{spec.key} 필드는 {aggregate} 집계를 지원하지 않습니다.")


def _apply_filters(rows: list[dict[str, Any]], filters, field_map) -> list[dict[str, Any]]:
    result = rows
    for flt in filters:
        field = field_map.get(flt.field)
        if field is None:
            raise HTTPException(status_code=400, detail=f"유효하지 않은 필터 필드입니다: {flt.field}")
        result = [row for row in result if _matches_filter(row.get(flt.field), flt.op, flt.value, flt.value_to)]
    return result


def _matches_filter(raw_value: Any, op: str, value: Any, value_to: Any) -> bool:
    if op == "is_empty":
        return raw_value in (None, "", [])
    if op == "is_not_empty":
        return raw_value not in (None, "", [])
    if op == "is_true":
        return bool(raw_value) is True
    if op == "is_false":
        return bool(raw_value) is False

    if isinstance(raw_value, datetime):
        left = raw_value.date()
    else:
        left = raw_value

    if op == "contains":
        return value is not None and str(value).lower() in str(raw_value or "").lower()
    if op == "starts_with":
        return value is not None and str(raw_value or "").lower().startswith(str(value).lower())
    if op == "in":
        options = {str(item) for item in ensure_list(value)}
        return str(raw_value) in options
    if op == "eq":
        return str(raw_value) == str(value) if isinstance(raw_value, str) or isinstance(value, str) else raw_value == value
    if op == "neq":
        return str(raw_value) != str(value) if isinstance(raw_value, str) or isinstance(value, str) else raw_value != value
    if op in {"gt", "gte", "lt", "lte"}:
        left_num = to_number(left)
        right_num = to_number(value)
        if op == "gt":
            return left_num > right_num
        if op == "gte":
            return left_num >= right_num
        if op == "lt":
            return left_num < right_num
        return left_num <= right_num
    if op == "between":
        if isinstance(left, date):
            start = _parse_date(value)
            end = _parse_date(value_to)
            return start is not None and end is not None and start <= left <= end
        left_num = to_number(left)
        return to_number(value) <= left_num <= to_number(value_to)
    if op == "on":
        target = _parse_date(value)
        return target == left
    if op == "before":
        target = _parse_date(value)
        return target is not None and isinstance(left, date) and left < target
    if op == "after":
        target = _parse_date(value)
        return target is not None and isinstance(left, date) and left > target
    if op == "relative_range":
        if not isinstance(left, date):
            return False
        today = date.today()
        range_key = str(value)
        if range_key == "today":
            return left == today
        if range_key == "next_7_days":
            return today <= left <= today + timedelta(days=7)
        if range_key == "next_30_days":
            return today <= left <= today + timedelta(days=30)
        if range_key == "past_30_days":
            return today - timedelta(days=30) <= left <= today
        if range_key == "this_month":
            return left.year == today.year and left.month == today.month
        return False
    return True


def _group_rows(rows: list[dict[str, Any]], row_keys: list[str], column_keys: list[str], value_specs) -> list[dict[str, Any]]:
    grouped: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    all_group_keys = [*row_keys, *column_keys]
    for row in rows:
        key = tuple(row.get(group_key) for group_key in all_group_keys)
        grouped[key].append(row)

    result = []
    for key_tuple, grouped_rows in grouped.items():
        record: dict[str, Any] = {}
        for index, field_key in enumerate(all_group_keys):
            record[field_key] = grouped_rows[0].get(field_key)
        for spec in value_specs:
            alias = _measure_alias(spec)
            aggregate = spec.aggregate or "sum"
            record[alias] = _aggregate_rows(grouped_rows, spec.key, aggregate)
        result.append(record)
    return result


def _aggregate_rows(rows: list[dict[str, Any]], field_key: str, aggregate: str) -> Any:
    values = [row.get(field_key) for row in rows]
    if aggregate == "count":
        return sum(1 for value in values if value is not None)
    if aggregate == "distinct_count":
        return distinct_count(values)

    numeric_values = [to_number(value) for value in values if value is not None and not (isinstance(value, float) and math.isnan(value))]
    if not numeric_values:
        return 0
    if aggregate == "sum":
        return round(sum(numeric_values), 4)
    if aggregate == "avg":
        return round(sum(numeric_values) / len(numeric_values), 4)
    if aggregate == "min":
        return min(numeric_values)
    if aggregate == "max":
        return max(numeric_values)
    raise HTTPException(status_code=400, detail=f"지원하지 않는 집계입니다: {aggregate}")


def _measure_alias(spec) -> str:
    return spec.alias or f"{spec.aggregate or 'sum'}:{spec.key}"


def _result_field(field, alias: str | None = None) -> AnalyticsResultField:
    return AnalyticsResultField(
        key=alias or field.key,
        label=field.label,
        kind=field.kind,
        data_type=field.data_type,
    )


def _apply_sorts(rows: list[dict[str, Any]], sorts) -> list[dict[str, Any]]:
    sorted_rows = list(rows)
    for sort in reversed(list(sorts or [])):
        sorted_rows.sort(key=lambda row: _sort_key(row.get(sort.field)), reverse=sort.direction == "desc")
    return sorted_rows


def _sort_key(value: Any):
    if value is None:
        return (1, 0, "")
    if isinstance(value, (int, float)):
        return (0, 0, value)
    if isinstance(value, (date, datetime)):
        return (0, 1, value.isoformat())
    return (0, 2, str(value))


def _apply_limit(rows: list[dict[str, Any]], limit: int) -> tuple[list[dict[str, Any]], bool]:
    if len(rows) <= limit:
        return rows, False
    return rows[:limit], True


def _parse_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value)).date()
    except ValueError:
        return None

