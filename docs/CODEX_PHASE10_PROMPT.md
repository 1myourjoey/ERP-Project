# Phase 10: Code Quality, Comprehensive Seed Data, Task Categorization, and Dashboard UX

## Context

This is a 1-person VC back-office ERP (Trigger Investment Partners).
- Stack: FastAPI + SQLAlchemy + SQLite (backend), React + Vite + TailwindCSS v4 + React Query (frontend)
- All existing pages, routes, and APIs are already working
- 19 frontend pages, 22 backend routers, 26 models
- Seed data currently covers: funds (8), LPs, capital calls, portfolio companies (10), investments (25), tasks (12), workflow templates (2), workflow instances (3), biz reports (3), notice periods
- Seed data does NOT cover: regular_reports, checklists, checklist_items, calendar_events, investment_documents, valuations, transactions, assemblies, distributions, distribution_items, exit_committees, exit_committee_funds, exit_trades, accounts, journal_entries, journal_entry_lines, vote_records

### Key Models Reference (current state)

**Task** (`backend/models/task.py`):
```
id, title, deadline, estimated_time, quadrant(Q1-Q4), memo, status, delegate_to,
workflow_instance_id, workflow_step_order, created_at, completed_at, actual_time
```
No `fund_id`, no `investment_id`, no `category`.

**WorkflowInstance** (`backend/models/workflow_instance.py`):
```
id, workflow_id, name, trigger_date, status, memo, investment_id, company_id, fund_id
```

**Frontend Task type** (`frontend/src/lib/api.ts`):
```typescript
interface Task {
  id: number; title: string; deadline: string | null; estimated_time: string | null;
  quadrant: string; memo: string | null; status: string; delegate_to: string | null;
  created_at: string | null; completed_at: string | null; actual_time: string | null;
  workflow_instance_id: number | null; workflow_step_order: number | null;
}
```

---

## Part 1: Code Quality Check

### 1.1 Encoding Scan

Scan all `.py` and `.tsx` files for broken Korean encoding (mojibake patterns like `\xec`, `\xed` appearing as raw bytes). Fix any files where Korean text renders as garbled characters. The expected Korean characters are UTF-8 encoded hangul (e.g., "조합", "업무", "투자").

### 1.2 Syntax & Import Check

For each backend Python file, verify:
- All imports resolve (no `ModuleNotFoundError`)
- No duplicate function names within the same file
- All SQLAlchemy model `__tablename__` values are unique across models

For each frontend TypeScript file, verify:
- No unused imports that cause build warnings
- All component props match their type definitions

### 1.3 File Consistency

Verify that every model listed in `backend/models/__init__.py` has:
1. A corresponding schema in `backend/schemas/`
2. A corresponding router in `backend/routers/`
3. Frontend API functions in `frontend/src/lib/api.ts`

If any are missing or inconsistent, fix them. Do NOT remove models or routers — only add missing glue code.

---

## Part 2: Comprehensive Seed Data

### Goal

Expand `backend/scripts/seed_data.py` to populate EVERY model in the system with realistic data so all pages display content. Follow the existing pattern: `if db.query(Model).count() > 0: skip`.

### 2.1 Models Currently Missing Seed Data

The following models have zero seed records. Add seed functions for each:

#### 2.1.1 RegularReport (`backend/models/regular_report.py`)
Fields: `report_target, fund_id, period, due_date, status, submitted_date, task_id, memo`

```python
regular_reports = [
    {"report_target": "농금원", "fund_name": "미래투자조합", "period": "2026-01", "due_date": "2026-02-05", "status": "전송완료", "submitted_date": "2026-02-03"},
    {"report_target": "농금원", "fund_name": "EX투자조합", "period": "2026-01", "due_date": "2026-02-05", "status": "전송완료", "submitted_date": "2026-02-04"},
    {"report_target": "농금원", "fund_name": "밸류체인펀드", "period": "2026-01", "due_date": "2026-02-05", "status": "예정"},
    {"report_target": "벤처협회", "fund_name": None, "period": "2026-01 VICS", "due_date": "2026-02-10", "status": "예정"},
    {"report_target": "농금원", "fund_name": "미래투자조합", "period": "2026-02", "due_date": "2026-03-05", "status": "예정"},
    {"report_target": "농금원", "fund_name": "EX투자조합", "period": "2026-02", "due_date": "2026-03-05", "status": "예정"},
    {"report_target": "벤처협회", "fund_name": None, "period": "2026-02 VICS", "due_date": "2026-03-10", "status": "예정"},
]
```

#### 2.1.2 Checklist + ChecklistItem (`backend/models/checklist.py`)
Fields: Checklist: `name, category, investment_id`; ChecklistItem: `checklist_id, order, name, required, checked, notes`

```python
checklists = [
    {
        "name": "투자 실행 서류 체크리스트",
        "category": "투자",
        "investment_name": ("미래투자조합", "루스바이오"),  # look up investment by fund+company name
        "items": [
            {"order": 1, "name": "투자심의의결서", "required": True, "checked": True},
            {"order": 2, "name": "투자계약서", "required": True, "checked": True},
            {"order": 3, "name": "주주간계약서", "required": True, "checked": False},
            {"order": 4, "name": "납입증명서", "required": True, "checked": False},
            {"order": 5, "name": "등기부등본", "required": False, "checked": False, "notes": "법인등기 확인용"},
        ],
    },
    {
        "name": "LP 보고 체크리스트",
        "category": "보고",
        "investment_name": None,
        "items": [
            {"order": 1, "name": "운용보고서 초안", "required": True, "checked": False},
            {"order": 2, "name": "재무제표 첨부", "required": True, "checked": False},
            {"order": 3, "name": "투자성과 요약", "required": True, "checked": False},
        ],
    },
    {
        "name": "사후관리 체크리스트",
        "category": "사후관리",
        "investment_name": ("EX투자조합", "핀테크랩"),
        "items": [
            {"order": 1, "name": "분기실적 수령", "required": True, "checked": True},
            {"order": 2, "name": "이사회 참석", "required": False, "checked": True},
            {"order": 3, "name": "주요 경영현황 확인", "required": True, "checked": False},
            {"order": 4, "name": "자금사용보고서 수령", "required": True, "checked": False},
        ],
    },
]
```

#### 2.1.3 InvestmentDocument (`backend/models/investment.py`)
Fields: `investment_id, name, doc_type, status, note, due_date`

Create 2-4 documents per investment for the first 6 investments. Use realistic document types:

```python
doc_templates = [
    {"name": "투자계약서", "doc_type": "계약서", "status": "collected"},
    {"name": "주주간계약서", "doc_type": "계약서", "status": "collected"},
    {"name": "납입증명서", "doc_type": "증빙", "status": "pending", "due_date_offset": 30},
    {"name": "사업계획서", "doc_type": "사업자료", "status": "requested", "due_date_offset": 14},
    {"name": "재무제표", "doc_type": "재무", "status": "pending", "due_date_offset": 45},
    {"name": "등기부등본", "doc_type": "법무", "status": "reviewing"},
]
```

For each of the first 6 investments, assign 3-4 documents with varied statuses so the dashboard "미수집 서류" widget displays items.

#### 2.1.4 Valuation (`backend/models/valuation.py`)
Fields: `investment_id, fund_id, company_id, as_of_date, evaluator, method, instrument, value, prev_value, change_amount, change_pct, basis`

```python
valuations = [
    {"fund": "미래투자조합", "company": "루스바이오", "as_of": "2025-06-30", "value": 3200, "prev": 3000, "method": "최근거래가", "evaluator": "내부"},
    {"fund": "미래투자조합", "company": "루스바이오", "as_of": "2025-12-31", "value": 3800, "prev": 3200, "method": "최근거래가", "evaluator": "외부감정"},
    {"fund": "미래투자조합", "company": "클라우드체인", "as_of": "2025-12-31", "value": 2800, "prev": 2500, "method": "DCF", "evaluator": "내부"},
    {"fund": "하이테크1호조합", "company": "에이아이엑스", "as_of": "2025-12-31", "value": 2100, "prev": 1515, "method": "유사기업비교", "evaluator": "외부감정"},
    {"fund": "EX투자조합", "company": "핀테크랩", "as_of": "2025-12-31", "value": 1400, "prev": 1100, "method": "DCF", "evaluator": "내부"},
    {"fund": "뉴챕터투자조합", "company": "모빌리티플러스", "as_of": "2025-12-31", "value": 3500, "prev": 3000, "method": "유사기업비교", "evaluator": "내부"},
]
```

Calculate `change_amount = value - prev_value` and `change_pct = (change_amount / prev_value) * 100`. Look up `instrument` from the corresponding Investment record.

#### 2.1.5 Transaction (`backend/models/transaction.py`)
Fields: `investment_id, fund_id, company_id, transaction_date, type, amount, shares_change, balance_before, balance_after, realized_gain, memo`

```python
transactions = [
    {"fund": "미래투자조합", "company": "루스바이오", "date": "2024-09-15", "type": "투자", "amount": 3000, "balance_before": 0, "balance_after": 3000},
    {"fund": "미래투자조합", "company": "클라우드체인", "date": "2024-11-01", "type": "투자", "amount": 2500, "balance_before": 0, "balance_after": 2500},
    {"fund": "미래투자조합", "company": "루스바이오", "date": "2025-09-01", "type": "배당수령", "amount": -200, "balance_before": 3000, "balance_after": 3000, "realized_gain": 200},
    {"fund": "EX투자조합", "company": "핀테크랩", "date": "2025-04-15", "type": "투자", "amount": 1100, "balance_before": 0, "balance_after": 1100},
    {"fund": "하이테크1호조합", "company": "에이아이엑스", "date": "2025-02-10", "type": "투자", "amount": 1515, "balance_before": 0, "balance_after": 1515},
]
```

#### 2.1.6 Assembly (`backend/models/phase3.py`)
Fields: `fund_id, type, date, agenda, status, minutes_completed, memo`

```python
assemblies = [
    {"fund": "미래투자조합", "type": "정기", "date": "2025-03-25", "agenda": "2024 사업보고 및 결산 승인", "status": "completed", "minutes_completed": 1},
    {"fund": "하이테크1호조합", "type": "정기", "date": "2025-03-28", "agenda": "2024 결산 승인건", "status": "completed", "minutes_completed": 1},
    {"fund": "미래투자조합", "type": "임시", "date": "2026-03-15", "agenda": "규약 변경안 의결", "status": "planned", "minutes_completed": 0},
    {"fund": "뉴챕터투자조합", "type": "정기", "date": "2026-03-20", "agenda": "2025 사업보고 및 결산 승인", "status": "planned", "minutes_completed": 0},
]
```

#### 2.1.7 Distribution + DistributionItem (`backend/models/phase3.py`)
Fields: Distribution: `fund_id, dist_date, dist_type, principal_total, profit_total, performance_fee, memo`; DistributionItem: `distribution_id, lp_id, principal, profit`

```python
distributions = [
    {
        "fund": "미래투자조합", "date": "2025-09-01", "type": "이익분배",
        "principal_total": 0, "profit_total": 2100, "performance_fee": 420,
        "items": [
            {"lp_type": "기관", "principal": 0, "profit": 1680},
            {"lp_type": "GP", "principal": 0, "profit": 420},
        ],
    },
]
```

Look up LP records by fund_id and type to get lp_id.

#### 2.1.8 ExitCommittee + ExitCommitteeFund + ExitTrade (`backend/models/phase3.py`)

```python
exit_committees = [
    {
        "company": "그린에너지", "status": "completed", "meeting_date": "2025-11-20",
        "agenda": "그린에너지 지분 매각 검토", "exit_strategy": "구주매출",
        "vote_result": "매각 승인", "analyst_opinion": "목표 수익률 달성 시 매각 적정",
        "funds": [
            {"fund": "미래투자조합", "investment_lookup": ("미래투자조합", "그린에너지")},
        ],
    },
]

exit_trades = [
    {
        "exit_committee_company": "그린에너지",
        "fund": "미래투자조합", "company": "그린에너지",
        "exit_type": "구주매출", "trade_date": "2025-12-15",
        "amount": 2400, "net_amount": 2300, "realized_gain": 500,
    },
]
```

#### 2.1.9 Account + JournalEntry + JournalEntryLine (`backend/models/accounting.py`)

Check if the `seed_accounts()` function already exists in `backend/main.py` or elsewhere. If accounts are already seeded (the main.py calls `seed_accounts(db)` before `seed_all(db)`), then only add journal entries. If not, add both.

```python
# Only if accounts are NOT already seeded elsewhere:
accounts = [
    {"fund": "미래투자조합", "code": "1110", "name": "보통예금", "category": "자산", "sub_category": "유동자산", "normal_side": "debit"},
    {"fund": "미래투자조합", "code": "1210", "name": "투자주식", "category": "자산", "sub_category": "투자자산", "normal_side": "debit"},
    {"fund": "미래투자조합", "code": "1220", "name": "투자사채", "category": "자산", "sub_category": "투자자산", "normal_side": "debit"},
    {"fund": "미래투자조합", "code": "3110", "name": "출자금", "category": "자본", "sub_category": "납입자본", "normal_side": "credit"},
    {"fund": "미래투자조합", "code": "4110", "name": "투자수익", "category": "수익", "sub_category": "영업수익", "normal_side": "credit"},
]

journal_entries = [
    {
        "fund": "미래투자조합", "date": "2024-09-15", "type": "투자분개",
        "description": "루스바이오 투자 집행", "status": "결재완료",
        "lines": [
            {"account_code": "1210", "debit": 3000, "credit": 0, "memo": "루스바이오 보통주"},
            {"account_code": "1110", "debit": 0, "credit": 3000, "memo": "보통예금 출금"},
        ],
    },
]
```

#### 2.1.10 VoteRecord (`backend/models/vote_record.py`)
Fields: `company_id, investment_id, vote_type, date, agenda, decision, memo`

```python
vote_records = [
    {"company": "루스바이오", "investment_lookup": ("미래투자조합", "루스바이오"), "vote_type": "주주총회", "date": "2025-03-20", "agenda": "이사 선임의 건", "decision": "찬성"},
    {"company": "에이아이엑스", "investment_lookup": ("하이테크1호조합", "에이아이엑스"), "vote_type": "이사회", "date": "2025-06-15", "agenda": "제3자 배정 유상증자의 건", "decision": "찬성"},
    {"company": "핀테크랩", "investment_lookup": ("EX투자조합", "핀테크랩"), "vote_type": "주주총회", "date": "2025-09-10", "agenda": "정관 변경의 건", "decision": "찬성"},
]
```

#### 2.1.11 CalendarEvent (`backend/models/calendar_event.py`)
Fields: `title, date, time, duration, description, status, task_id`

Create 8-10 calendar events. Some linked to tasks (use task_id from seeded tasks), some standalone:

```python
calendar_events = [
    {"title": "투자위원회 정기회의", "date_offset": 3, "time": "10:00", "duration": 120, "status": "pending"},
    {"title": "LP 간담회", "date_offset": 7, "time": "14:00", "duration": 90, "status": "pending"},
    {"title": "포트폴리오 데이", "date_offset": 14, "time": "09:30", "duration": 480, "description": "전체 포트폴리오 기업 발표", "status": "pending"},
    {"title": "농금원 실사 대비 미팅", "date_offset": 10, "time": "15:00", "duration": 60, "status": "pending"},
    {"title": "분기 실적 마감", "date_offset": 21, "time": None, "duration": None, "status": "pending"},
    {"title": "벤처협회 교육", "date_offset": 5, "time": "13:00", "duration": 180, "status": "pending"},
    {"title": "월간 투자위원회", "date_offset": 28, "time": "10:00", "duration": 120, "status": "pending"},
    {"title": "조합 결산 미팅", "date_offset": 35, "time": "14:00", "duration": 90, "status": "pending"},
]
```

Use `date.today() + timedelta(days=date_offset)` for dates so events are always in the future.

### 2.2 Seed Function Order

Update `seed_all()` in `backend/scripts/seed_data.py` to call seed functions in dependency order:

```python
def seed_all(db: Session) -> None:
    ensure_fund_schema(db)
    ensure_biz_report_schema(db)
    ensure_task_schema(db)                              # NEW (Part 3)
    reset_seed_data_if_requested(db)
    funds = seed_funds(db)
    lps = seed_lps(db, funds)
    seed_capital_calls(db, funds, lps)
    companies = seed_companies(db)
    investments = seed_investments(db, funds, companies)
    seed_investment_documents(db, investments)           # NEW
    seed_valuations(db, investments, funds, companies)   # NEW
    seed_transactions(db, investments, funds, companies) # NEW
    tasks = seed_tasks(db, funds, investments)           # UPDATED (pass funds/investments)
    seed_calendar_events(db, tasks)                      # NEW
    templates = seed_workflow_templates(db)
    seed_workflow_instances(db, templates, funds, investments)
    seed_biz_reports(db, funds)
    seed_notice_periods(db, funds)
    seed_regular_reports(db, funds)                      # NEW
    seed_checklists(db, investments)                     # NEW
    seed_assemblies(db, funds)                           # NEW
    seed_distributions(db, funds, lps)                   # NEW
    seed_exit_committees(db, companies, investments, funds)  # NEW
    seed_vote_records(db, companies, investments)        # NEW
```

### 2.3 Reset Tables

Update `reset_seed_data_if_requested()` to include all tables in the deletion list. Verify that ALL tables in the system are covered. The current list already includes most tables. Ensure these are present:
- `calendar_events`
- `journal_entry_lines`, `journal_entries`, `accounts`
- `vote_records`
- `regular_reports`

---

## Part 3: Task Categorization (Model Change)

### 3.1 Add `category`, `fund_id`, and `investment_id` to Task Model

**File:** `backend/models/task.py`

Add three new nullable columns:

```python
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from database import Base


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)
    deadline = Column(DateTime, nullable=True)
    estimated_time = Column(String, nullable=True)
    quadrant = Column(String, nullable=False)  # Q1, Q2, Q3, Q4
    memo = Column(Text, nullable=True)
    status = Column(String, default="pending")
    delegate_to = Column(String, nullable=True)
    created_at = Column(DateTime, default=func.now())
    completed_at = Column(DateTime, nullable=True)
    actual_time = Column(String, nullable=True)

    workflow_instance_id = Column(Integer, ForeignKey("workflow_instances.id"), nullable=True)
    workflow_step_order = Column(Integer, nullable=True)

    # NEW Phase 10 fields
    category = Column(String, nullable=True)      # "투자실행", "LP보고", "사후관리", "규약/총회", "서류관리", "일반"
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=True)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=True)
```

### 3.2 Schema Migration (Runtime ALTER TABLE)

**File:** `backend/scripts/seed_data.py` — Add an `ensure_task_schema()` function (similar to `ensure_fund_schema()`):

```python
def ensure_task_schema(db: Session) -> None:
    bind = db.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("tasks"):
        return

    columns = {column["name"] for column in inspector.get_columns("tasks")}
    add_specs = [
        ("category", "TEXT"),
        ("fund_id", "INTEGER"),
        ("investment_id", "INTEGER"),
    ]
    with bind.begin() as conn:
        for name, sql_type in add_specs:
            if name not in columns:
                conn.exec_driver_sql(f"ALTER TABLE tasks ADD COLUMN {name} {sql_type}")
```

Call `ensure_task_schema(db)` at the beginning of `seed_all()`, before `seed_funds()`.

Also add the same column-add logic to `backend/main.py` in the SQLite compatibility section (where other columns are added dynamically), so the columns exist even without running seed:

```python
# In main.py ensure_columns() or lifespan
task_adds = [("category", "TEXT"), ("fund_id", "INTEGER"), ("investment_id", "INTEGER")]
for col_name, col_type in task_adds:
    if col_name not in task_columns:
        conn.exec_driver_sql(f"ALTER TABLE tasks ADD COLUMN {col_name} {col_type}")
```

### 3.3 Update Task Schemas

**File:** `backend/schemas/task.py`

Add the new fields to all schemas:

```python
class TaskCreate(BaseModel):
    title: str
    deadline: Optional[datetime] = None
    estimated_time: Optional[str] = None
    quadrant: Literal["Q1", "Q2", "Q3", "Q4"] = "Q1"
    memo: Optional[str] = None
    delegate_to: Optional[str] = None
    category: Optional[str] = None          # NEW
    fund_id: Optional[int] = None           # NEW
    investment_id: Optional[int] = None     # NEW

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    deadline: Optional[datetime] = None
    estimated_time: Optional[str] = None
    quadrant: Optional[Literal["Q1", "Q2", "Q3", "Q4"]] = None
    memo: Optional[str] = None
    status: Optional[Literal["pending", "in_progress", "completed"]] = None
    delegate_to: Optional[str] = None
    category: Optional[str] = None          # NEW
    fund_id: Optional[int] = None           # NEW
    investment_id: Optional[int] = None     # NEW

class TaskResponse(BaseModel):
    id: int
    title: str
    deadline: Optional[datetime] = None
    estimated_time: Optional[str] = None
    quadrant: str
    memo: Optional[str] = None
    status: str
    delegate_to: Optional[str] = None
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    actual_time: Optional[str] = None
    workflow_instance_id: Optional[int] = None
    workflow_step_order: Optional[int] = None
    category: Optional[str] = None          # NEW
    fund_id: Optional[int] = None           # NEW
    investment_id: Optional[int] = None     # NEW
    fund_name: Optional[str] = None         # NEW (resolved, not stored)
    company_name: Optional[str] = None      # NEW (resolved, not stored)

    model_config = {"from_attributes": True}
```

### 3.4 Update Task Router — Enrich Responses

**File:** `backend/routers/tasks.py`

Add a helper function to resolve `fund_name` and `company_name`:

```python
from models.fund import Fund
from models.investment import Investment, PortfolioCompany
from models.workflow_instance import WorkflowInstance

def _enrich_task(task, db: Session) -> dict:
    """Add fund_name and company_name from direct FK or linked workflow."""
    resp = TaskResponse.model_validate(task).model_dump()

    fund_name = None
    company_name = None

    # Direct relationship first
    if task.fund_id:
        fund = db.get(Fund, task.fund_id)
        if fund:
            fund_name = fund.name
    if task.investment_id:
        inv = db.get(Investment, task.investment_id)
        if inv:
            company = db.get(PortfolioCompany, inv.company_id)
            if company:
                company_name = company.name
            if not fund_name:
                fund = db.get(Fund, inv.fund_id)
                if fund:
                    fund_name = fund.name

    # Fallback: resolve from workflow instance
    if (not fund_name or not company_name) and task.workflow_instance_id:
        instance = db.get(WorkflowInstance, task.workflow_instance_id)
        if instance:
            if not fund_name and instance.fund_id:
                fund = db.get(Fund, instance.fund_id)
                if fund:
                    fund_name = fund.name
            if not company_name and instance.company_id:
                company = db.get(PortfolioCompany, instance.company_id)
                if company:
                    company_name = company.name

    resp["fund_name"] = fund_name
    resp["company_name"] = company_name
    return resp
```

Update `get_task_board` endpoint to return enriched responses:
```python
board = {"Q1": [], "Q2": [], "Q3": [], "Q4": []}
for t in tasks:
    if t.quadrant in board:
        board[t.quadrant].append(_enrich_task(t, db))
return board
```

Similarly update `list_tasks` and `get_task` endpoints.

### 3.5 Update Dashboard Task Response

**File:** `backend/routers/dashboard.py`

In the `get_today_dashboard` function, enrich each task with `fund_name`, `company_name`, and `category`. Use the same resolution logic as in tasks.py:

```python
from models.fund import Fund
from models.investment import Investment, PortfolioCompany
from models.workflow_instance import WorkflowInstance

# For each task in today_tasks, tomorrow_tasks, this_week_tasks, upcoming_tasks, no_deadline_tasks:
def _enrich_dashboard_task(task, db):
    task_dict = TaskResponse.model_validate(task).model_dump()
    fund_name = None
    company_name = None

    if task.fund_id:
        f = db.get(Fund, task.fund_id)
        fund_name = f.name if f else None
    if task.investment_id:
        inv = db.get(Investment, task.investment_id)
        if inv:
            co = db.get(PortfolioCompany, inv.company_id)
            company_name = co.name if co else None
            if not fund_name:
                f = db.get(Fund, inv.fund_id)
                fund_name = f.name if f else None
    if not fund_name and task.workflow_instance_id:
        wi = db.get(WorkflowInstance, task.workflow_instance_id)
        if wi:
            if wi.fund_id:
                f = db.get(Fund, wi.fund_id)
                fund_name = f.name if f else None
            if not company_name and wi.company_id:
                co = db.get(PortfolioCompany, wi.company_id)
                company_name = co.name if co else None

    task_dict["fund_name"] = fund_name
    task_dict["company_name"] = company_name
    task_dict["category"] = task.category
    return task_dict
```

Use `_enrich_dashboard_task(task, db)` instead of raw `TaskResponse.model_validate(task)` for all task lists returned by the dashboard endpoint.

### 3.6 Update Seed Tasks with Categories and Fund References

**File:** `backend/scripts/seed_data.py` — Update `seed_tasks()` signature and content:

```python
def seed_tasks(db: Session, funds: list[Fund] = None, investments: list[Investment] = None) -> list[Task]:
    if db.query(Task).count() > 0:
        print("[seed] tasks: skip")
        return db.query(Task).order_by(Task.id.asc()).all()

    today = date.today()
    fund_map = {f.name: f for f in (funds or [])}

    f1 = fund_map.get("미래투자조합")
    f4 = fund_map.get("EX투자조합")
    f5 = fund_map.get("뉴챕터투자조합")

    rows = [
        Task(title="투자위원회 안건 검토", deadline=dt(today), estimated_time="2h", quadrant="Q1",
             status="pending", category="투자실행", fund_id=f1.id if f1 else None),
        Task(title="LP 문의 답변", deadline=dt(today, 14), estimated_time="45m", quadrant="Q1",
             status="pending", category="LP보고"),
        Task(title="주간 파이프라인 미팅", deadline=dt(today + timedelta(days=1), 10), estimated_time="1h",
             quadrant="Q2", status="pending", category="투자실행"),
        Task(title="신규 딜 티저 콜", deadline=dt(today + timedelta(days=2), 16), estimated_time="1h",
             quadrant="Q2", status="in_progress", category="투자실행"),
        Task(title="월간 운용보고서 초안", deadline=dt(today + timedelta(days=3), 11), estimated_time="3h",
             quadrant="Q1", status="pending", category="LP보고", fund_id=f1.id if f1 else None),
        Task(title="법무 계약서 검토", deadline=dt(today + timedelta(days=4), 15), estimated_time="2h",
             quadrant="Q1", status="pending", category="투자실행", fund_id=f4.id if f4 else None),
        Task(title="포트폴리오 KPI 업데이트", deadline=dt(today + timedelta(days=6), 9, 30), estimated_time="1h",
             quadrant="Q2", status="pending", category="사후관리"),
        Task(title="투자자 레터 작성", deadline=dt(today + timedelta(days=8), 13), estimated_time="2h",
             quadrant="Q3", status="pending", category="LP보고", fund_id=f5.id if f5 else None),
        Task(title="미수서류 리마인드", deadline=dt(today + timedelta(days=10), 10), estimated_time="1h 30m",
             quadrant="Q1", status="pending", category="서류관리"),
        Task(title="조합 규약 개정안 검토", deadline=dt(today + timedelta(days=12), 11), estimated_time="2h",
             quadrant="Q2", status="pending", category="규약/총회", fund_id=f1.id if f1 else None),
        Task(title="내부 운영비 정산", deadline=None, estimated_time="30m", quadrant="Q4",
             status="pending", category="일반"),
        Task(title="채용 인터뷰 일정 조율", deadline=None, estimated_time="45m", quadrant="Q3",
             status="pending", category="일반"),
    ]
    db.add_all(rows)
    db.commit()
    print("[seed] tasks: created")
    return db.query(Task).order_by(Task.id.asc()).all()
```

Update the `seed_all()` call: `tasks = seed_tasks(db, funds, investments)`.

### 3.7 Frontend Task Type Update

**File:** `frontend/src/lib/api.ts`

Update the `TaskCreate` and `Task` interfaces:

```typescript
export interface TaskCreate {
  title: string
  deadline?: string | null
  estimated_time?: string | null
  quadrant?: string
  memo?: string | null
  delegate_to?: string | null
  category?: string | null          // NEW
  fund_id?: number | null           // NEW
  investment_id?: number | null     // NEW
}

export interface Task {
  id: number
  title: string
  deadline: string | null
  estimated_time: string | null
  quadrant: string
  memo: string | null
  status: string
  delegate_to: string | null
  created_at: string | null
  completed_at: string | null
  actual_time: string | null
  workflow_instance_id: number | null
  workflow_step_order: number | null
  category: string | null           // NEW
  fund_id: number | null            // NEW
  investment_id: number | null      // NEW
  fund_name: string | null          // NEW (resolved by backend)
  company_name: string | null       // NEW (resolved by backend)
}
```

### 3.8 Frontend Category Badge Helper

Create a reusable helper for category badge colors. Add to both DashboardPage.tsx and TaskBoardPage.tsx (or extract to a shared utility):

```tsx
function categoryBadgeClass(category: string): string {
  switch (category) {
    case '투자실행': return 'bg-red-50 text-red-700'
    case 'LP보고': return 'bg-green-50 text-green-700'
    case '사후관리': return 'bg-amber-50 text-amber-700'
    case '규약/총회': return 'bg-indigo-50 text-indigo-700'
    case '서류관리': return 'bg-orange-50 text-orange-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}
```

### 3.9 Frontend Dashboard Task Card Badges

**File:** `frontend/src/pages/DashboardPage.tsx` — Update the `TaskList` component:

In each task card, add category and fund badges:

```tsx
<div className="w-full cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-2 text-left hover:bg-gray-50">
  <div className="flex items-start justify-between gap-2">
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
        {task.category && (
          <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${categoryBadgeClass(task.category)}`}>
            {task.category}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
        {task.deadline ? formatShortDate(task.deadline) : '마감 없음'}
        {task.estimated_time && ` | 예상 ${task.estimated_time}`}
        {task.fund_name && <span className="text-blue-600">{task.fund_name}</span>}
      </div>
    </div>
    <button /* quick complete button - unchanged */ />
  </div>
</div>
```

### 3.10 Frontend Task Board Badges

**File:** `frontend/src/pages/TaskBoardPage.tsx` — Update the `TaskItem` component:

Add badges after the existing metadata line:

```tsx
<div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-gray-500">
  {deadlineStr && <span>{deadlineStr}</span>}
  {task.estimated_time && (
    <span className="flex items-center gap-0.5">
      <Clock size={11} /> {task.estimated_time}
    </span>
  )}
  {task.workflow_instance_id && <span className="text-indigo-500">WF</span>}
  {task.category && (
    <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${categoryBadgeClass(task.category)}`}>
      {task.category}
    </span>
  )}
  {task.fund_name && (
    <span className="rounded bg-blue-50 text-blue-600 px-1 py-0.5 text-[10px]">
      {task.fund_name}
    </span>
  )}
</div>
```

### 3.11 Task Board Fund Filter

**File:** `frontend/src/pages/TaskBoardPage.tsx`

Add a fund filter dropdown in the header area:

```tsx
const [fundFilter, setFundFilter] = useState<number | ''>('')

// Fetch funds list for the filter dropdown
const { data: fundsForFilter } = useQuery({
  queryKey: ['funds'],
  queryFn: fetchFunds,
})

// Filter tasks client-side
const filterByFund = (tasks: Task[]) => {
  if (fundFilter === '') return tasks
  return tasks.filter(t => t.fund_id === fundFilter)
}

// In the header bar, add next to status filter:
<select
  value={fundFilter}
  onChange={(e) => setFundFilter(e.target.value ? Number(e.target.value) : '')}
  className="rounded border border-gray-200 px-2 py-1 text-xs"
>
  <option value="">전체 조합</option>
  {fundsForFilter?.map((f: any) => (
    <option key={f.id} value={f.id}>{f.name}</option>
  ))}
</select>
```

Apply `filterByFund()` when rendering each quadrant's tasks:
```tsx
const tasks = filterByFund(board?.[q.key] || [])
```

### 3.12 Task Edit Modal Updates

**File:** `frontend/src/pages/TaskBoardPage.tsx` — Update `EditTaskModal`:

Add category and fund select fields:

```tsx
const [category, setCategory] = useState(task.category || '')
const [fundId, setFundId] = useState<number | ''>(task.fund_id || '')

// In the form grid:
<div>
  <label className="block text-xs text-gray-500 mb-1">카테고리</label>
  <select value={category} onChange={e => setCategory(e.target.value)}
    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400">
    <option value="">없음</option>
    <option value="투자실행">투자실행</option>
    <option value="LP보고">LP보고</option>
    <option value="사후관리">사후관리</option>
    <option value="규약/총회">규약/총회</option>
    <option value="서류관리">서류관리</option>
    <option value="일반">일반</option>
  </select>
</div>

<div>
  <label className="block text-xs text-gray-500 mb-1">관련 조합</label>
  <select value={fundId} onChange={e => setFundId(e.target.value ? Number(e.target.value) : '')}
    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400">
    <option value="">없음</option>
    {fundsForFilter?.map((f: any) => (
      <option key={f.id} value={f.id}>{f.name}</option>
    ))}
  </select>
</div>
```

Include the new fields in the `submit()` / `onSave()` function:
```tsx
onSave(task.id, {
  // ... existing fields ...
  category: category || null,
  fund_id: fundId || null,
})
```

---

## Part 4: Dashboard Compact Layout

### Problem
The dashboard is 430 lines and very long vertically. The right column stacks 5 widgets: MiniCalendar + Fund Summary + Upcoming Notices + Report Deadlines + Missing Documents. With data, this creates excessive vertical scroll.

### 4.1 Remove MiniCalendar from Dashboard

**File:** `frontend/src/pages/DashboardPage.tsx`

Remove the `<MiniCalendar />` component from the right column. It already exists on the dedicated `/calendar` page and the task board has a toggle for it. Remove the `import MiniCalendar` line as well.

### 4.2 Tab-Based Right Column

Replace the stacked right column widgets with a tab-based layout. Only one tab's content is visible at a time:

```tsx
import { useState } from 'react'

const RIGHT_TABS = [
  { key: 'funds', label: '조합', icon: Building2 },
  { key: 'notices', label: '통지', icon: Clock },
  { key: 'reports', label: '보고', icon: Send },
  { key: 'documents', label: '서류', icon: FileWarning },
] as const

type RightTab = typeof RIGHT_TABS[number]['key']

// Inside DashboardPage component:
const [rightTab, setRightTab] = useState<RightTab>('funds')

// Replace the right column content with:
<div className="space-y-3">
  {/* Tab bar */}
  <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
    {RIGHT_TABS.map(tab => {
      const count = {
        funds: fund_summary.length,
        notices: upcomingNotices?.length || 0,
        reports: upcoming_reports.length,
        documents: missing_documents.length,
      }[tab.key]
      return (
        <button
          key={tab.key}
          onClick={() => setRightTab(tab.key)}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-md transition-colors ${
            rightTab === tab.key
              ? 'bg-white shadow text-gray-800 font-medium'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <tab.icon size={13} />
          {tab.label}
          {count > 0 && (
            <span className="ml-0.5 rounded-full bg-gray-200 px-1.5 text-[10px] text-gray-600">{count}</span>
          )}
        </button>
      )
    })}
  </div>

  {/* Tab content */}
  {rightTab === 'funds' && (/* existing fund_summary widget content */)}
  {rightTab === 'notices' && (/* existing upcoming notices widget content */)}
  {rightTab === 'reports' && (/* existing upcoming_reports widget content */)}
  {rightTab === 'documents' && (/* existing missing_documents widget content */)}
</div>
```

### 4.3 Limit Items Per Section + "More" Link

In each tab's content, limit to 5 items with a "더보기" link:

```tsx
{rightTab === 'funds' && (
  <div className="card-base">
    <div className="space-y-2">
      {fund_summary.slice(0, 5).map((fund: FundSummary) => (
        /* existing fund card */
      ))}
    </div>
    {fund_summary.length > 5 && (
      <button onClick={() => navigate('/fund-overview')} className="mt-2 text-xs text-blue-600 hover:underline">
        +{fund_summary.length - 5}건 더보기 →
      </button>
    )}
  </div>
)}
```

Apply the same pattern to:
- Notices: max 5, "더보기" links to `/workflows`
- Reports: max 5, "더보기" links to `/reports`
- Documents: max 5, "더보기" links to `/documents`

### 4.4 Two-Column Task Grid for Today/Tomorrow

Instead of stacking Today and Tomorrow vertically, place them side by side on medium+ screens:

```tsx
<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
  <TaskList title="오늘" tasks={today.tasks} /* ... */ />
  <TaskList title="내일" tasks={tomorrow.tasks} /* ... */ />
</div>
```

Keep "이번 주", "예정 업무", and "기한 미지정" as full-width below.

### 4.5 Collapsible Task Sections

Add collapse/expand capability to the "이번 주", "예정 업무", and "기한 미지정" sections:

```tsx
import { ChevronDown } from 'lucide-react'

function TaskList({ title, tasks, onClickTask, onQuickComplete, completingTaskId, defaultCollapsed = false }: {
  title: string
  tasks: Task[]
  onClickTask: () => void
  onQuickComplete: (task: Task) => void
  completingTaskId: number | null
  defaultCollapsed?: boolean
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  return (
    <div className="card-base">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="mb-2 flex w-full items-center justify-between"
      >
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{tasks.length}건</span>
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        </div>
      </button>
      {!collapsed && (
        <>
          {!tasks.length ? (
            <p className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">업무 없음</p>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                /* existing task card */
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

Pass `defaultCollapsed={true}` for "기한 미지정" section:
```tsx
{no_deadline.length > 0 && (
  <TaskList title="기한 미지정" tasks={no_deadline} defaultCollapsed={true} /* ... */ />
)}
```

---

## Part 5: Integration Verification

### 5.1 Smoke Test Updates

**File:** `backend/scripts/api_smoke.py`

Add smoke test checks for the new Task fields. After creating or fetching a task, verify:
- `category` field is present (can be null)
- `fund_id` field is present (can be null)
- `fund_name` field is present (can be null)
- `company_name` field is present (can be null)

### 5.2 Cross-Page Navigation Check

Verify these navigation paths work:
1. Dashboard task card click → `/tasks` (task board)
2. Dashboard fund card click → `/funds/{id}` (fund detail page)
3. Dashboard workflow card click → `/workflows` with `expandInstanceId` state
4. Dashboard report card click → `/reports` with `highlightId` state
5. Dashboard document card click → `/investments/{id}` (investment detail)
6. Dashboard notice card click → `/workflows` with `expandInstanceId` state
7. Fund overview link in dashboard → `/fund-overview`
8. Task board fund filter → filters tasks by fund

---

## Files to Modify

### Backend
1. `backend/models/task.py` — Add `category`, `fund_id`, `investment_id` columns
2. `backend/schemas/task.py` — Add new fields to TaskCreate, TaskUpdate, TaskResponse
3. `backend/routers/tasks.py` — Enrich task responses with fund_name, company_name; add imports
4. `backend/routers/dashboard.py` — Enrich dashboard task responses with new fields
5. `backend/scripts/seed_data.py` — Add 11 new seed functions; update seed_tasks with categories/fund refs; add ensure_task_schema()
6. `backend/main.py` — Add task column ensure logic in startup

### Frontend
7. `frontend/src/lib/api.ts` — Update Task and TaskCreate interfaces with new fields
8. `frontend/src/pages/DashboardPage.tsx` — Remove MiniCalendar; add tab-based right column; compact task cards; two-column Today/Tomorrow; collapsible sections; category/fund badges
9. `frontend/src/pages/TaskBoardPage.tsx` — Add category/fund badges to TaskItem; add fund filter dropdown; update EditTaskModal with category/fund selects

### Files NOT to Modify
- `backend/models/fund.py` — No changes needed
- `backend/models/workflow.py` — No changes needed
- `backend/models/workflow_instance.py` — No changes needed
- `frontend/src/components/Layout.tsx` — No nav changes
- `frontend/src/components/SearchModal.tsx` — No changes needed

---

## Acceptance Criteria

### Part 1: Code Quality
1. No broken Korean encoding in any `.py` or `.tsx` file
2. All Python files have valid syntax and imports resolve
3. No TypeScript build errors (`npm run build` succeeds)

### Part 2: Seed Data
4. Running `FORCE_SEED_RESET=1 python -m scripts.seed_data` populates ALL tables
5. Seed data creates records for: regular_reports (7+), checklists (3+), checklist_items (12+), investment_documents (18+), valuations (6+), transactions (4+), assemblies (4+), distributions (1+), distribution_items (2+), exit_committees (1+), exit_trades (1+), vote_records (3+), calendar_events (6+)
6. All seed functions use `if db.query(Model).count() > 0: skip` pattern
7. After seeding, all 19 frontend pages show data (not empty states)
8. Dashboard shows: tasks with deadlines, active workflows, fund summary, missing documents, upcoming reports

### Part 3: Task Categorization
9. Task model has `category`, `fund_id`, `investment_id` columns (nullable)
10. `ensure_task_schema()` adds columns via ALTER TABLE if missing (no Alembic migration required)
11. `backend/main.py` also adds the columns at startup
12. TaskCreate/TaskUpdate schemas accept `category`, `fund_id`, `investment_id`
13. TaskResponse includes `category`, `fund_id`, `investment_id`, `fund_name`, `company_name`
14. Dashboard task API (`GET /api/dashboard/today`) returns tasks with `fund_name` and `company_name` resolved
15. Task board API (`GET /api/tasks/board`) returns tasks with `fund_name` and `company_name` resolved
16. Seeded tasks have categories and some have fund_id values
17. Dashboard task cards show category badges (colored) and fund name
18. Task board cards show category badges and fund name
19. Task board has a fund filter dropdown that filters tasks by fund_id
20. Task edit modal includes category select (6 options) and fund select dropdown
21. Creating/editing a task with category and fund_id works correctly

### Part 4: Dashboard Layout
22. MiniCalendar is removed from the dashboard right column
23. Right column uses tab-based layout with 4 tabs: 조합, 통지, 보고, 서류
24. Each tab shows a count badge
25. Each tab limits display to 5 items with a "더보기" link
26. Today and Tomorrow task lists are side by side on md+ screens
27. "이번 주", "예정 업무", "기한 미지정" sections are collapsible (click header to toggle)
28. "기한 미지정" section is collapsed by default
29. Task cards use compact padding
30. Dashboard vertical scroll is noticeably shorter than before

### General
31. All existing functionality continues to work without regression
32. `npm run build` completes without errors
33. Backend starts without errors
34. Seed data can be run via `python -m scripts.seed_data`
