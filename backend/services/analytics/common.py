from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import date, datetime
from decimal import Decimal
from typing import Any


def parse_duration_to_minutes(value: str | None) -> int:
    if not value:
        return 0
    text = str(value).strip().lower()
    if not text:
        return 0

    total = 0
    matched = False

    hour_match = re.search(r"(\d+)\s*(?:h|hr|hrs|hour|hours|시간)", text)
    if hour_match:
        total += int(hour_match.group(1)) * 60
        matched = True

    minute_match = re.search(r"(\d+)\s*(?:m|min|mins|minute|minutes|분)", text)
    if minute_match:
        total += int(minute_match.group(1))
        matched = True

    if matched:
        return total

    compact = text.replace(" ", "")
    compact_match = re.fullmatch(r"(?:(\d+)h)?(?:(\d+)m)?", compact)
    if compact_match and (compact_match.group(1) or compact_match.group(2)):
        hours = int(compact_match.group(1) or 0)
        minutes = int(compact_match.group(2) or 0)
        return hours * 60 + minutes

    return int(compact) if compact.isdigit() else 0


def to_number(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def to_iso(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


RELATIVE_DATE_OPTIONS = {
    "today": 0,
    "next_7_days": 7,
    "next_30_days": 30,
    "past_30_days": -30,
    "this_month": 31,
}


def apply_date_buckets(raw_date: date | datetime | None, prefix: str) -> dict[str, Any]:
    if raw_date is None:
        return {
            f"{prefix}.year": None,
            f"{prefix}.half": None,
            f"{prefix}.quarter": None,
            f"{prefix}.month": None,
            f"{prefix}.week": None,
            f"{prefix}.day": None,
            f"{prefix}.year_month": None,
            f"{prefix}.year_quarter": None,
        }

    value = raw_date.date() if isinstance(raw_date, datetime) else raw_date
    quarter = ((value.month - 1) // 3) + 1
    return {
        f"{prefix}.year": value.year,
        f"{prefix}.half": f"H{1 if value.month <= 6 else 2}",
        f"{prefix}.quarter": f"Q{quarter}",
        f"{prefix}.month": value.month,
        f"{prefix}.week": value.isocalendar().week,
        f"{prefix}.day": value.isoformat(),
        f"{prefix}.year_month": value.strftime("%Y-%m"),
        f"{prefix}.year_quarter": f"{value.year}-Q{quarter}",
    }


def ensure_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, set):
        return list(value)
    return [value]


def distinct_count(values: Iterable[Any]) -> int:
    seen: set[Any] = set()
    for value in values:
        if value is None:
            continue
        seen.add(value)
    return len(seen)

