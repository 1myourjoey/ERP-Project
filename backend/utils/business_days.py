"""Business-day utility helpers shared across services.

Uses Korean holidays and optional ERP_EXTRA_HOLIDAYS from environment.
"""

from __future__ import annotations

from datetime import date, timedelta
from functools import lru_cache
from typing import Iterable, Set

from config import settings

# Includes major fixed and lunar holidays for 2025/2026.
KOREAN_HOLIDAYS_2025: Set[date] = {
    date(2025, 1, 1),
    date(2025, 1, 28),
    date(2025, 1, 29),
    date(2025, 1, 30),
    date(2025, 3, 1),
    date(2025, 3, 3),
    date(2025, 5, 5),
    date(2025, 5, 6),
    date(2025, 6, 6),
    date(2025, 8, 15),
    date(2025, 10, 3),
    date(2025, 10, 5),
    date(2025, 10, 6),
    date(2025, 10, 7),
    date(2025, 10, 8),
    date(2025, 10, 9),
    date(2025, 12, 25),
}

KOREAN_HOLIDAYS_2026: Set[date] = {
    date(2026, 1, 1),
    date(2026, 2, 16),
    date(2026, 2, 17),
    date(2026, 2, 18),
    date(2026, 3, 1),
    date(2026, 3, 2),
    date(2026, 5, 5),
    date(2026, 5, 24),
    date(2026, 5, 25),
    date(2026, 6, 6),
    date(2026, 8, 15),
    date(2026, 8, 17),
    date(2026, 9, 24),
    date(2026, 9, 25),
    date(2026, 9, 26),
    date(2026, 10, 3),
    date(2026, 10, 5),
    date(2026, 10, 9),
    date(2026, 12, 25),
}


def _parse_extra_holidays(tokens: Iterable[str]) -> set[date]:
    parsed: set[date] = set()
    for token in tokens:
        normalized = token.strip()
        if not normalized:
            continue
        try:
            parsed.add(date.fromisoformat(normalized))
        except ValueError:
            # Ignore malformed custom values instead of breaking business flows.
            continue
    return parsed


@lru_cache(maxsize=8)
def get_holidays(year: int) -> Set[date]:
    """Return holiday set for the given year including custom extra holidays."""
    if year == 2025:
        base = set(KOREAN_HOLIDAYS_2025)
    elif year == 2026:
        base = set(KOREAN_HOLIDAYS_2026)
    else:
        base = set()

    for holiday in _parse_extra_holidays(settings.EXTRA_HOLIDAYS):
        if holiday.year == year:
            base.add(holiday)
    return base


def is_business_day(value: date) -> bool:
    """Return True when the date is a business day."""
    if value.weekday() >= 5:
        return False
    return value not in get_holidays(value.year)


def shift_to_business_day(value: date, direction: int = 1) -> date:
    """Shift non-business day to nearest business day in the given direction."""
    if direction not in (-1, 1):
        raise ValueError("direction must be -1 or 1")

    shifted = value
    for _ in range(30):
        if is_business_day(shifted):
            return shifted
        shifted += timedelta(days=direction)
    raise ValueError("unable to find business day within 30 days")


def add_business_days(start: date, days: int) -> date:
    """Return date after adding business days (supports negatives)."""
    if days == 0:
        return start

    step = 1 if days > 0 else -1
    remaining = abs(days)
    cursor = start
    while remaining > 0:
        cursor += timedelta(days=step)
        if is_business_day(cursor):
            remaining -= 1
    return cursor


def business_days_between(start: date, end: date) -> int:
    """Return business-day distance from start to end (exclusive of start)."""
    if start == end:
        return 0

    step = 1 if end > start else -1
    count = 0
    cursor = start
    while cursor != end:
        cursor += timedelta(days=step)
        if is_business_day(cursor):
            count += step
    return count
