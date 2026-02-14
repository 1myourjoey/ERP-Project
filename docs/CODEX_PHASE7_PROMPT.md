# Phase 7: Fund Notice Periods (규약 통지기간) + Key Terms Display

## Context

This is a 1-person VC back-office ERP (Trigger Investment Partners).
- Stack: FastAPI + SQLAlchemy + SQLite (backend), React + Vite + TailwindCSS v4 + React Query (frontend)
- Each fund (조합) has a partnership agreement (규약) with specific notice periods in **business days**
- These notice periods determine when tasks/workflows must start
- The system already has a business day calculator in `backend/services/workflow_service.py` (`shift_to_business_day`, `calculate_step_date`)
- Workflow templates have steps with `timing_offset_days`, but currently these are fixed per template — they should be overridable per fund

---

## Part 1: Backend — FundNoticePeriod Model

### 1.1 New Model

**File:** `backend/models/fund.py` — Add to existing file

```python
class FundNoticePeriod(Base):
    __tablename__ = "fund_notice_periods"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    notice_type = Column(String, nullable=False)      # e.g., "assembly", "capital_call", "ic_agenda"
    label = Column(String, nullable=False)             # e.g., "총회 소집 통지"
    business_days = Column(Integer, nullable=False)    # e.g., 14
    memo = Column(Text, nullable=True)                 # e.g., "규약 제15조 제2항"

    fund = relationship("Fund", back_populates="notice_periods")
```

Add to `Fund` model:
```python
notice_periods = relationship("FundNoticePeriod", back_populates="fund", cascade="all, delete-orphan")
```

### 1.2 New Model: FundKeyTerm

```python
class FundKeyTerm(Base):
    __tablename__ = "fund_key_terms"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    category = Column(String, nullable=False)    # "보수", "의결", "LP", "기타"
    label = Column(String, nullable=False)       # e.g., "GP출자의무"
    value = Column(String, nullable=False)       # e.g., "약정총액의 1% 이상"
    article_ref = Column(String, nullable=True)  # e.g., "제8조 제1항"

    fund = relationship("Fund", back_populates="key_terms")
```

Add to `Fund` model:
```python
key_terms = relationship("FundKeyTerm", back_populates="fund", cascade="all, delete-orphan")
```

### 1.3 Predefined Notice Types

These are the standard notice types used in Korean VC fund agreements. Use them as default options in the frontend, but allow custom types too.

```python
STANDARD_NOTICE_TYPES = [
    {"notice_type": "assembly", "label": "총회 소집 통지", "default_days": 14},
    {"notice_type": "capital_call_initial", "label": "최초 출자금 납입 요청", "default_days": 10},
    {"notice_type": "capital_call_additional", "label": "수시 출자금 납입 요청", "default_days": 10},
    {"notice_type": "ic_agenda", "label": "투자심의위원회 안건 통지", "default_days": 7},
    {"notice_type": "distribution", "label": "분배 통지", "default_days": 5},
    {"notice_type": "dissolution", "label": "해산/청산 통지", "default_days": 30},
    {"notice_type": "lp_report", "label": "조합원 보고", "default_days": 0},
    {"notice_type": "amendment", "label": "규약 변경 통지", "default_days": 14},
]
```

### 1.4 Alembic Migration

Create a new migration that adds `fund_notice_periods` and `fund_key_terms` tables.

### 1.5 Schema Updates

**File:** `backend/schemas/fund.py` — Add:

```python
class FundNoticePeriodCreate(BaseModel):
    notice_type: str
    label: str
    business_days: int = Field(ge=0)
    memo: Optional[str] = None

class FundNoticePeriodResponse(BaseModel):
    id: int
    fund_id: int
    notice_type: str
    label: str
    business_days: int
    memo: Optional[str] = None
    model_config = {"from_attributes": True}

class FundKeyTermCreate(BaseModel):
    category: str
    label: str
    value: str
    article_ref: Optional[str] = None

class FundKeyTermResponse(BaseModel):
    id: int
    fund_id: int
    category: str
    label: str
    value: str
    article_ref: Optional[str] = None
    model_config = {"from_attributes": True}
```

Update `FundResponse` to include:
```python
notice_periods: list[FundNoticePeriodResponse] = []
key_terms: list[FundKeyTermResponse] = []
```

### 1.6 API Endpoints

**File:** `backend/routers/funds.py` — Add these endpoints:

```
# Notice Periods — "clear & recreate" pattern (same as worklogs)
PUT  /api/funds/{fund_id}/notice-periods
     Body: list[FundNoticePeriodCreate]
     → Deletes all existing notice_periods for this fund, creates new ones
     → Returns list[FundNoticePeriodResponse]

# Key Terms — "clear & recreate" pattern
PUT  /api/funds/{fund_id}/key-terms
     Body: list[FundKeyTermCreate]
     → Deletes all existing key_terms for this fund, creates new ones
     → Returns list[FundKeyTermResponse]

# Get notice period for a specific fund + notice_type (used by workflow service)
GET  /api/funds/{fund_id}/notice-periods/{notice_type}
     → Returns FundNoticePeriodResponse or 404

# Utility: calculate deadline given a target date and fund notice type
GET  /api/funds/{fund_id}/calculate-deadline?target_date=2026-03-15&notice_type=assembly
     → Returns { "target_date": "2026-03-15", "notice_type": "assembly",
                 "business_days": 14, "deadline": "2026-02-24",
                 "label": "총회 소집 통지" }
     → Uses the business day calculator from workflow_service.py
```

### 1.7 Workflow Service Integration

**File:** `backend/services/workflow_service.py`

Add a new function:

```python
def calculate_business_days_before(target_date: date, business_days: int) -> date:
    """Go back N business days from target_date."""
    result = target_date
    days_counted = 0
    while days_counted < business_days:
        result -= timedelta(days=1)
        if not _is_non_business_day(result):
            days_counted += 1
    return result
```

Update `instantiate_workflow` to accept an optional `notice_overrides: dict[str, int] | None` parameter:
- When a workflow is instantiated for a fund, look up the fund's notice_periods
- If a workflow step's name or tag matches a notice_type, use the fund's business_days instead of the template's fixed timing_offset_days
- This allows the same "총회 소집" workflow template to produce different timelines per fund

---

## Part 2: Frontend — Fund Detail Page Enhancement

### 2.1 Fund Detail Page: "규약 핵심 조건" Section

**File:** `frontend/src/pages/FundDetailPage.tsx`

Add two new card sections between the fund info card and LP section:

#### Card 1: "통지기간 (영업일)"

```
┌─ 통지기간 (영업일) ──────────────────── [수정] ─┐
│                                               │
│  총회 소집 통지        14일    규약 제15조      │
│  출자금 납입 요청      10일    규약 제20조      │
│  투심위 안건 통지       7일    규약 제25조      │
│  분배 통지              5일    규약 제30조      │
│  해산/청산 통지        30일    규약 제40조      │
│                                               │
│  [ + 통지기간 추가 ]                            │
└───────────────────────────────────────────────┘
```

- Display as a clean table/list: label | business_days + "일" | memo (article ref)
- "수정" button toggles inline edit mode (same pattern as LP editing)
- In edit mode: each row becomes editable inputs, can delete rows, add new rows
- Dropdown or autocomplete for `notice_type` with STANDARD_NOTICE_TYPES as suggestions
- Save calls `PUT /api/funds/{fund_id}/notice-periods` with full list

#### Card 2: "주요 규약 조항"

```
┌─ 주요 규약 조항 ─────────────────────── [수정] ─┐
│                                               │
│  [보수]                                       │
│  GP출자의무      약정총액의 1% 이상    제8조    │
│  관리보수 산정    약정총액 기준         제15조   │
│                                               │
│  [의결]                                       │
│  의결정족수      출자좌수 과반수        제12조   │
│  서면결의        총 출자좌수 2/3 이상   제12조   │
│                                               │
│  [LP]                                         │
│  지분양도        GP 사전동의 필요       제22조   │
│  조합원 보고     분기 1회              제35조   │
│                                               │
│  [ + 조항 추가 ]                               │
└───────────────────────────────────────────────┘
```

- Group by `category`
- Display: label | value | article_ref
- Edit mode: inline form rows, can add/delete/reorder
- Save calls `PUT /api/funds/{fund_id}/key-terms` with full list

### 2.2 API Client

**File:** `frontend/src/lib/api.ts` — Add:

```typescript
// Notice Periods
export async function updateFundNoticePeriods(
  fundId: number,
  data: FundNoticePeriodInput[]
): Promise<FundNoticePeriodResponse[]> {
  const res = await api.put(`/api/funds/${fundId}/notice-periods`, data)
  return res.data
}

// Key Terms
export async function updateFundKeyTerms(
  fundId: number,
  data: FundKeyTermInput[]
): Promise<FundKeyTermResponse[]> {
  const res = await api.put(`/api/funds/${fundId}/key-terms`, data)
  return res.data
}

// Deadline Calculator
export async function calculateDeadline(
  fundId: number,
  targetDate: string,
  noticeType: string
): Promise<{ target_date: string; notice_type: string; business_days: number; deadline: string; label: string }> {
  const res = await api.get(`/api/funds/${fundId}/calculate-deadline`, {
    params: { target_date: targetDate, notice_type: noticeType },
  })
  return res.data
}
```

### 2.3 Deadline Helper in Workflow Instance Creation

When creating a workflow instance and a fund is selected, show an info box:

```
ℹ️ A조합 규약 기준:
   총회 소집 → 14영업일 전 통지 필요
   목표일 3/15 기준 → 2/24(월)까지 통지 발송
```

This should appear in the existing workflow instance creation flow (WorkflowsPage.tsx active tab).
Call `GET /api/funds/{fund_id}/calculate-deadline` when both fund and target date are selected.

---

## Part 3: Dashboard Integration

### 3.1 Upcoming Notice Deadlines Widget

**File:** `frontend/src/pages/DashboardPage.tsx`

Add a small card showing upcoming notice deadlines from active workflow instances that have fund notice periods configured:

```
┌─ 다가오는 통지 기한 ─────────────────────┐
│                                         │
│  🔴 A조합 총회 소집 통지    D-3  2/24    │
│  🟡 B조합 출자금 납입 요청   D-7  2/28   │
│  🟢 C조합 투심위 안건 통지   D-14 3/10   │
│                                         │
└─────────────────────────────────────────┘
```

This requires a new backend endpoint:

```
GET /api/dashboard/upcoming-notices?days=30
    → Returns list of { fund_name, notice_label, deadline, days_remaining, workflow_instance_name }
```

**File:** `backend/routers/dashboard.py` — Add endpoint

---

## Files to Modify

### Backend
1. `backend/models/fund.py` — Add FundNoticePeriod, FundKeyTerm models + Fund relationships
2. `backend/schemas/fund.py` — Add schemas + update FundResponse
3. `backend/routers/funds.py` — Add notice-periods, key-terms, calculate-deadline endpoints
4. `backend/routers/dashboard.py` — Add upcoming-notices endpoint
5. `backend/services/workflow_service.py` — Add `calculate_business_days_before`, update `instantiate_workflow`
6. `backend/migrations/versions/` — New migration for fund_notice_periods + fund_key_terms tables
7. `backend/models/__init__.py` — Import new models if needed for Alembic

### Frontend
8. `frontend/src/lib/api.ts` — Add API functions + types
9. `frontend/src/pages/FundDetailPage.tsx` — Add notice periods + key terms sections
10. `frontend/src/pages/WorkflowsPage.tsx` — Add notice period info when creating instances
11. `frontend/src/pages/DashboardPage.tsx` — Add upcoming notices widget

### Files NOT to Modify
- `frontend/src/App.tsx` — No new routes needed
- `frontend/src/components/Layout.tsx` — No navigation changes
- `backend/models/workflow.py` — Workflow template structure stays the same

---

## Acceptance Criteria

1. `fund_notice_periods` and `fund_key_terms` tables are created via Alembic migration
2. Fund detail page shows "통지기간" card with all notice periods for that fund
3. Fund detail page shows "주요 규약 조항" card grouped by category
4. Both cards support inline editing (add/edit/delete rows) with PUT save
5. Standard notice types are available as suggestions/defaults when adding
6. `calculate-deadline` API correctly counts business days backward (skipping weekends + Korean holidays)
7. Workflow instance creation shows notice period info when a fund is selected
8. Dashboard shows upcoming notice deadlines widget
9. All new endpoints follow existing API patterns (error handling, response models)
10. All existing functionality continues to work without regression
