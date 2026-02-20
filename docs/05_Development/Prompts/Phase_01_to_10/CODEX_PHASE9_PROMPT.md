# Phase 9: Reference-Date Aware Paid-In/GP Calculation + Overview UX Fix

## Context

This is a 1-person VC back-office ERP (Trigger Investment Partners).
- The Fund Overview page (`/fund-overview`) was implemented in Phase 8 with a `reference_date` filter
- Currently, `total_paid_in` uses `LP.paid_in` (a static field) — it does NOT change based on reference_date
- The system already has `CapitalCall` + `CapitalCallItem` models (in `backend/models/phase3.py`) that track LP-level payments with `paid_date`
- The totals row is at the bottom of the table, requiring scroll to see

## Problem

1. **납입총액** should reflect actual payments made on or before the reference date, not a static LP field
2. **GP출자금** should also be calculated from actual payments by GP-type LPs
3. **합계 row** at the bottom of the overview table is hard to see — must scroll down

---

## Part 1: Reference-Date Aware Calculations

### 1.1 Current Data Flow (WRONG)

```
Fund Overview → LP.paid_in (static) → 납입총액 (always shows current value regardless of reference_date)
```

### 1.2 Correct Data Flow

```
Fund Overview (reference_date = 2025-09-30)
    ↓
CapitalCallItem WHERE paid = 1 AND paid_date <= 2025-09-30
    ↓
SUM(amount) per fund → 납입총액 (as of 2025-09-30)
    ↓
SUM(amount) WHERE LP.type = 'GP' → GP출자금 (as of 2025-09-30)
```

### 1.3 Backend Changes

**File:** `backend/routers/funds.py` — Update the `GET /api/funds/overview` endpoint

Change the calculation logic for `total_paid_in` and `gp_commitment`:

```python
from models.phase3 import CapitalCall, CapitalCallItem
from models.fund import LP

def calculate_paid_in_as_of(db: Session, fund_id: int, reference_date: date) -> tuple[float, float]:
    """
    Calculate total_paid_in and gp_paid_in as of reference_date
    using CapitalCallItem records.

    Returns (total_paid_in, gp_paid_in)
    """
    # Get all paid capital call items for this fund up to reference_date
    items = (
        db.query(CapitalCallItem)
        .join(CapitalCall, CapitalCall.id == CapitalCallItem.capital_call_id)
        .filter(
            CapitalCall.fund_id == fund_id,
            CapitalCallItem.paid == 1,
            CapitalCallItem.paid_date <= reference_date,
        )
        .all()
    )

    # Get GP LP IDs for this fund
    gp_lp_ids = set(
        lp.id for lp in db.query(LP).filter(LP.fund_id == fund_id, LP.type == "GP").all()
    )

    total_paid_in = sum(item.amount or 0 for item in items)
    gp_paid_in = sum(item.amount or 0 for item in items if item.lp_id in gp_lp_ids)

    return total_paid_in, gp_paid_in
```

**Fallback logic:** If NO CapitalCallItem records exist for a fund (data hasn't been entered yet), fall back to the static values:
- `total_paid_in` → `SUM(LP.paid_in)` for that fund
- `gp_paid_in` → `Fund.gp_commitment` or `SUM(LP.paid_in WHERE LP.type = 'GP')`

```python
def calculate_paid_in_as_of(db: Session, fund_id: int, reference_date: date) -> tuple[float, float]:
    # Try CapitalCallItem first
    items = (
        db.query(CapitalCallItem)
        .join(CapitalCall, CapitalCall.id == CapitalCallItem.capital_call_id)
        .filter(CapitalCall.fund_id == fund_id)
        .first()
    )

    if items is None:
        # No capital call records → fallback to static LP.paid_in
        lps = db.query(LP).filter(LP.fund_id == fund_id).all()
        total = sum(lp.paid_in or 0 for lp in lps)
        gp = sum(lp.paid_in or 0 for lp in lps if lp.type == "GP")
        return total, gp

    # Has capital call records → calculate from CapitalCallItem
    paid_items = (
        db.query(CapitalCallItem)
        .join(CapitalCall, CapitalCall.id == CapitalCallItem.capital_call_id)
        .filter(
            CapitalCall.fund_id == fund_id,
            CapitalCallItem.paid == 1,
            CapitalCallItem.paid_date <= reference_date,
        )
        .all()
    )

    gp_lp_ids = set(
        lp.id for lp in db.query(LP).filter(LP.fund_id == fund_id, LP.type == "GP").all()
    )

    total = sum(item.amount or 0 for item in paid_items)
    gp = sum(item.amount or 0 for item in paid_items if item.lp_id in gp_lp_ids)

    return total, gp
```

### 1.4 Update Overview Calculation

In the `GET /api/funds/overview` endpoint, replace:
- The current static `total_paid_in = sum(lp.paid_in ...)` with `calculate_paid_in_as_of(db, fund.id, reference_date)`
- The current static `gp_commitment = fund.gp_commitment` with the `gp_paid_in` from the same function

All downstream calculations that depend on these values also update:
- **납입비율** = `total_paid_in / commitment_total × 100`
- **미투자액** = `약정총액 - 투자총액` (this stays the same, it doesn't use 납입총액)

### 1.5 Affected Formulas Summary

| Field | Formula | Reference-Date Aware? |
|-------|---------|----------------------|
| 약정총액 | `Fund.commitment_total` (static) | No — doesn't change |
| 납입총액 | `SUM(CapitalCallItem.amount) WHERE paid=1 AND paid_date <= ref_date` | **YES** |
| 납입비율 | `납입총액 / 약정총액 × 100` | **YES** (depends on 납입총액) |
| GP출자금 | `SUM(CapitalCallItem.amount) WHERE LP.type='GP' AND paid_date <= ref_date` | **YES** |
| 투자총액 | `SUM(Investment.amount) WHERE investment_date <= ref_date` | **YES** (already implemented) |
| 미투자액 | `약정총액 - 투자총액` | **YES** (depends on 투자총액) |
| 투자자산 | = 투자총액 | **YES** |
| 투자업체수 | `COUNT DISTINCT company_id WHERE investment_date <= ref_date` | **YES** (already implemented) |
| 투자기간 경과율 | `(ref_date - formation_date) / (period_end - formation_date)` | **YES** (already implemented) |
| 잔존기간 | `maturity_date - ref_date` | **YES** (already implemented) |
| 기준수익률 | `Fund.hurdle_rate` (static) | No |

### 1.6 Seed Data: Capital Call Records

**File:** `backend/scripts/seed_data.py` — Add capital call seed data

For each fund that has LP paid_in values, create matching CapitalCall + CapitalCallItem records so the reference_date filter works properly.

```python
# Example: 미래투자조합 — 70% 납입 (14,142 of 20,203)
# Two capital calls:
capital_calls_fund1 = [
    {
        "call_date": "2024-07-15",   # 1차 납입 (성립 시)
        "call_type": "최초납입",
        "total_amount": 10102,        # 50% of 20,203
        "items": [
            {"lp": "농식품모태펀드", "amount": 4000, "paid": True, "paid_date": "2024-07-15"},
            {"lp": "농업정책보험금융원", "amount": 2500, "paid": True, "paid_date": "2024-07-15"},
            {"lp": "미래에셋증권", "amount": 1500, "paid": True, "paid_date": "2024-07-15"},
            {"lp": "개인투자자", "amount": 900, "paid": True, "paid_date": "2024-07-15"},
            {"lp": "트리거투자파트너스", "amount": 1202, "paid": True, "paid_date": "2024-07-15"},
        ],
    },
    {
        "call_date": "2025-03-01",   # 2차 납입 (수시콜)
        "call_type": "추가납입",
        "total_amount": 4040,         # 20% of 20,203
        "items": [
            {"lp": "농식품모태펀드", "amount": 1600, "paid": True, "paid_date": "2025-03-10"},
            {"lp": "농업정책보험금융원", "amount": 1000, "paid": True, "paid_date": "2025-03-10"},
            {"lp": "미래에셋증권", "amount": 600, "paid": True, "paid_date": "2025-03-10"},
            {"lp": "개인투자자", "amount": -161, "paid": False, "paid_date": None},  # skip if negative
            {"lp": "트리거투자파트너스", "amount": 1001, "paid": True, "paid_date": "2025-03-10"},
        ],
    },
]
```

Create similar capital call records for each fund so that:
- `SUM(paid items)` per fund matches the 납입총액 in the user's table
- `SUM(paid items WHERE LP.type='GP')` matches the GP출자금
- Items have realistic `paid_date` values for reference_date filtering

**IMPORTANT:** The total paid amounts must match:
- 미래투자조합: 납입 14,142, GP 2,203
- 하이테크1호: 납입 1,668, GP 23
- 파마테크2호: 납입 4,755, GP 55
- EX투자조합: 납입 9,099, GP 110
- 뉴챕터투자조합: 납입 10,020, GP 400
- 밸류체인펀드: 납입 6,150, GP 500
- 메디테크3호: 납입 2,275, GP 25
- 성장벤처투자조합: 납입 0, GP 0

---

## Part 2: Overview Table UX — Sticky Totals

### Problem
The 합계 row is at the bottom of the table. With 8+ funds, the user must scroll down to see totals.

### Solution
Two improvements:

### 2.1 Summary Cards (Above Table — Always Visible)

Show key totals as summary cards above the table, always visible without scrolling:

```
┌─ 조합 전체 현황 ────────── 기준일: [2026-02-14] ─┐
│                                                  │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │
│  │ 조합 수  │ │ 약정총액 │ │ 납입총액 │ │ 투자총액 │ │ 미투자액 │  │
│  │    8    │ │ 106,828│ │ 48,109 │ │ 45,207 │ │ 61,621 │  │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘  │
│                                                  │
│  [ 테이블 ]                                       │
│  ...                                             │
└──────────────────────────────────────────────────┘
```

Summary cards should include:
- 조합 수 (total fund count)
- 약정총액 합계
- 납입총액 합계
- GP출자금 합계
- 투자총액 합계
- 미투자액 합계
- 투자업체수 합계

### 2.2 Sticky Footer Row

The 합계 row at the bottom of the table should be **sticky** so it stays visible when scrolling:

```css
/* Make the last row (합계) sticky at the bottom */
table tbody tr:last-child {
  position: sticky;
  bottom: 0;
  background: white;
  border-top: 2px solid #111;
  font-weight: 700;
  z-index: 1;
}
```

Or implement with TailwindCSS:
```tsx
<tr className="sticky bottom-0 bg-white border-t-2 border-gray-900 font-bold z-10 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
  <td colSpan={3} className="px-2 py-3 text-sm">합계</td>
  <td>...</td>
  ...
</tr>
```

### 2.3 Table Container

Wrap the table in a container with fixed max height so the sticky footer works:

```tsx
<div className="overflow-auto max-h-[calc(100vh-320px)] border border-gray-200 rounded-2xl">
  <table className="min-w-full">
    <thead className="sticky top-0 bg-white z-10 border-b-2 border-gray-200">
      ...
    </thead>
    <tbody>
      {/* fund rows */}
      ...
      {/* sticky totals row */}
      <tr className="sticky bottom-0 bg-gray-50 border-t-2 border-gray-900 font-bold">
        ...
      </tr>
    </tbody>
  </table>
</div>
```

This gives both **sticky header** (column names) and **sticky footer** (합계).

---

## Files to Modify

### Backend
1. `backend/routers/funds.py` — Update `GET /api/funds/overview` to use `CapitalCallItem` for paid-in calculations with fallback
2. `backend/scripts/seed_data.py` — Add CapitalCall + CapitalCallItem seed records for all 8 funds

### Frontend
3. `frontend/src/pages/FundOverviewPage.tsx` — Add summary cards above table + sticky header/footer

### Files NOT to Modify
- `backend/models/phase3.py` — CapitalCall/CapitalCallItem models are already correct
- `backend/models/fund.py` — No changes needed
- `frontend/src/components/Layout.tsx` — No nav changes

---

## Acceptance Criteria

1. `total_paid_in` in fund overview is calculated from `CapitalCallItem` records filtered by `paid_date <= reference_date`
2. `gp_paid_in` is calculated from `CapitalCallItem` records where the LP type is "GP"
3. If no `CapitalCallItem` records exist for a fund, falls back to `LP.paid_in` static values
4. Seed data includes CapitalCall + CapitalCallItem records for all 8 funds, matching the expected totals
5. Summary cards above the table show: 조합 수, 약정총액, 납입총액, GP출자금, 투자총액, 미투자액, 투자업체수
6. Summary cards update when reference_date changes
7. Table has sticky header (column names) and sticky footer (합계 row)
8. Table is in a scrollable container with max-height
9. **Verification:** reference_date=2024-12-31 → 미래투자조합 납입총액 = 1차 납입분만 (≈10,102). reference_date=2026-02-14 → 납입총액 = 14,142 (전체).
10. All existing Phase 8 functionality continues to work
