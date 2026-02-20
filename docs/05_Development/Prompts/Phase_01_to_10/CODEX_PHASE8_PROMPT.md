# Phase 8: UX Enhancements — Fund Overview, Dashboard Navigation, BizReport Fix, Seed Data, Print Checklist

## Context

This is a 1-person VC back-office ERP (Trigger Investment Partners).
- Stack: FastAPI + SQLAlchemy + SQLite (backend), React + Vite + TailwindCSS v4 + React Query (frontend)
- All existing pages, routes, and APIs are already working

---

## Part 1: Fund Overview Page (조합 전체 현황 페이지) — 기준일 기반 시점 조회

### Problem
Dashboard shows a small fund summary widget (limited to 6 funds), but there's no dedicated page to compare all funds side by side. More importantly, the user needs to view fund status **as of a specific reference date** (기준일) — e.g., "2025-09-30 기준으로 각 조합의 납입/투자/잔존기간은?"

### Solution
Create a new **FundOverviewPage** (`/fund-overview`) with a **기준일 필터** that calculates all derived values (납입비율, 투자기간 경과율, 잔존기간, 투자업체수, 투자총액 등) based on that date.

### 1.1 Fund Model — New Fields

**File:** `backend/models/fund.py`

Add these fields to the `Fund` model:

```python
# New fields
fund_manager = Column(String, nullable=True)              # 대표 펀드매니저
investment_period_end = Column(Date, nullable=True)        # 투자기간 종료일
gp_commitment = Column(Float, nullable=True)               # GP출자금 (별도 관리)
```

Create an Alembic migration to add these 3 columns.

Update `FundCreate`, `FundUpdate`, `FundResponse` schemas in `backend/schemas/fund.py` to include these fields.

### 1.2 Backend Endpoint — Reference Date Snapshot

**File:** `backend/routers/funds.py`

```
GET /api/funds/overview?reference_date=2025-09-30
```

If `reference_date` is omitted, use today's date.

**Response model:**

```python
class FundOverviewItem(BaseModel):
    no: int                                    # row number
    id: int
    name: str                                  # 조합명
    fund_type: str                             # 조합 구분
    fund_manager: Optional[str]                # 대표 펀드매니저
    formation_date: Optional[str]              # 등록(성립)일
    investment_period_end: Optional[str]        # 투자기간 종료일
    investment_period_progress: Optional[float] # 투자기간 경과율 (%) — CALCULATED
    maturity_date: Optional[str]               # 청산시기(예정)
    commitment_total: Optional[float]           # 약정총액
    total_paid_in: Optional[float]              # 납입총액 — SUM of LP.paid_in for LPs with payments on or before reference_date
    paid_in_ratio: Optional[float]              # 납입비율 (%) — total_paid_in / commitment_total * 100
    gp_commitment: Optional[float]              # GP출자금
    total_invested: Optional[float]             # 투자총액 — SUM of Investment.amount WHERE investment_date <= reference_date
    uninvested: Optional[float]                 # 미투자액 — total_paid_in - total_invested (or commitment_total - total_invested)
    investment_assets: Optional[float]           # 투자자산 — same as total_invested for active investments
    company_count: int                          # 투자업체수 — COUNT DISTINCT company_id WHERE investment_date <= reference_date
    hurdle_rate: Optional[float]                # 기준수익률(규약)
    remaining_period: Optional[str]             # 잔존기간 — from reference_date to maturity_date, format "X년 Y개월"

    model_config = {"from_attributes": True}

class FundOverviewResponse(BaseModel):
    reference_date: str
    funds: list[FundOverviewItem]
    totals: dict  # 합계 row: commitment_total, total_paid_in, gp_commitment, total_invested, uninvested, company_count
```

**Calculation logic (in the endpoint or a service function):**

```python
from datetime import date
from dateutil.relativedelta import relativedelta  # add python-dateutil if not present

def calculate_fund_overview(fund, lps, investments, reference_date: date):
    # 투자기간 경과율
    if fund.formation_date and fund.investment_period_end:
        total_days = (fund.investment_period_end - fund.formation_date).days
        elapsed_days = (min(reference_date, fund.investment_period_end) - fund.formation_date).days
        progress = max(0, min(100, round(elapsed_days / total_days * 100))) if total_days > 0 else 0
    else:
        progress = None

    # 납입총액 (current LP paid_in — ideally filtered by date, but LP model doesn't have payment dates yet, so use current values)
    total_paid_in = sum(lp.paid_in or 0 for lp in lps)

    # 납입비율
    paid_in_ratio = round(total_paid_in / fund.commitment_total * 100, 2) if fund.commitment_total else None

    # 투자총액 & 투자업체수 — ONLY investments with investment_date <= reference_date
    filtered_investments = [inv for inv in investments if inv.investment_date and inv.investment_date <= reference_date]
    total_invested = sum(inv.amount or 0 for inv in filtered_investments)
    company_ids = set(inv.company_id for inv in filtered_investments)
    company_count = len(company_ids)

    # 미투자액 = 약정총액 - 투자총액 (NOT 납입총액 - 투자총액)
    uninvested = (fund.commitment_total or 0) - total_invested

    # 잔존기간
    if fund.maturity_date and reference_date < fund.maturity_date:
        delta = relativedelta(fund.maturity_date, reference_date)
        remaining = f"{delta.years}년 {delta.months}개월"
    elif fund.maturity_date:
        remaining = "만기 경과"
    else:
        remaining = "-"

    return {
        "investment_period_progress": progress,
        "total_paid_in": total_paid_in,
        "paid_in_ratio": paid_in_ratio,
        "total_invested": total_invested,
        "uninvested": uninvested,
        "investment_assets": total_invested,
        "company_count": company_count,
        "remaining_period": remaining,
    }
```

**IMPORTANT:** The `reference_date` filter primarily affects:
- `Investment` records: only include where `investment_date <= reference_date`
- `investment_period_progress`: calculated relative to reference_date
- `remaining_period`: calculated from reference_date to maturity_date
- LP `paid_in`: use current values for now (LP payment history tracking is not yet implemented; can be added later)

### 1.3 New Route

**File:** `frontend/src/App.tsx`

Add route:
```tsx
<Route path="/fund-overview" element={<FundOverviewPage />} />
```

### 1.4 Navigation

**File:** `frontend/src/components/Layout.tsx`

Add "조합 현황" to the "조합·투자" nav group:
```typescript
{ to: '/fund-overview', label: '조합 현황', icon: BarChart3 },  // add BarChart3 from lucide-react
```

Place it as the **first item** in the 조합·투자 group (before 조합 관리).

### 1.5 New Page Component

**File:** `frontend/src/pages/FundOverviewPage.tsx` (NEW)

Layout:
```
┌─ 조합 전체 현황 ────────── 기준일: [2026-02-14] ─┐
│                                                  │
│  [ 합계 요약 카드 ]                                │
│  총 약정액 106,828 | 납입총액 48,109 |             │
│  GP출자금 3,466 | 투자총액 45,207 | 투자업체 23     │
│                                                  │
│  [ 조합별 현황 테이블 — 가로 스크롤 가능 ]            │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  │ NO  조합명         조합구분          대표펀드매니저  등록일      투자기간종료  경과율  청산시기     │
│  │                                                                                           │
│  │     약정총액    납입총액   납입비율  GP출자금  투자총액   미투자액   투자자산  투자업체수           │
│  │     기준수익률  잔존기간                                                                    │
│  │─────────────────────────────────────────────────────────────────────────────────────────────│
│  │ 1   미래투자조합  농림수산식품투자조합  김00    2024-07-02  2028-07-01  41%  2032-07-01         │
│  │     20,203     14,142    70%    2,203   13,500    6,703    13,500    6                     │
│  │     2%         6년4개월                                                                    │
│  │─────────────────────────────────────────────────────────────────────────────────────────────│
│  │ 2   하이테크1호   벤처투자조합        가--    2024-10-02  2027-10-01  46%  2029-10-01         │
│  │     2,085      1,668     80%    23     1,515     570      1,515     1                     │
│  │     8%         3년7개월                                                                    │
│  │─────────────────────────────────────────────────────────────────────────────────────────────│
│  │ ...                                                                                       │
│  │─────────────────────────────────────────────────────────────────────────────────────────────│
│  │ 합계                                                                                      │
│  │     106,828    48,109           3,466   45,207    48,121           23                      │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘
│  ↑ 각 행 클릭 → /funds/{id} 상세 페이지로 이동                                                  │
└──────────────────────────────────────────────────┘
```

**Key UI elements:**

1. **기준일 필터 (top-right):**
   - Date input defaulting to today
   - Changing the date re-fetches data: `GET /api/funds/overview?reference_date=YYYY-MM-DD`
   - All calculated fields update based on the new reference date

2. **Table design:**
   - Horizontally scrollable for many columns (`overflow-x-auto`)
   - Sticky first column (조합명) so it stays visible when scrolling
   - Numbers formatted with comma separators (e.g., 20,203)
   - 경과율: show as percentage with color coding (>80% red, >50% amber, else green)
   - 납입비율: same color coding
   - 잔존기간: calculated dynamically from reference_date
   - 합계 row at the bottom with bold styling

3. **Row click:** Navigate to `/funds/{fund.id}`

4. **금액 단위:** Display in 백만원 (millions). Add a small label "단위: 백만원" above the table.

### 1.6 Dashboard Link

**File:** `frontend/src/pages/DashboardPage.tsx`

Keep the existing "조합 요약" widget as-is. Add a "전체 보기" link at the bottom:

```tsx
<button onClick={() => navigate('/fund-overview')} className="text-xs text-blue-600 hover:underline mt-2">
  전체 조합 현황 보기 →
</button>
```

---

## Part 2: Dashboard Click Navigation (편집 가능 페이지로 이동)

### Problem
Currently, clicking items on the dashboard navigates to list pages, not to the specific editable item. For example:
- Clicking a task → goes to `/tasks` (the board), not to the specific task
- Clicking a fund → goes to `/funds` (the list), not to `/funds/{id}`
- Clicking a workflow → goes to `/workflows` with expandInstanceId state

### Solution
Make all clickable items navigate to the **most useful destination** for editing/acting on that item.

### 2.1 Changes to DashboardPage.tsx

| Widget | Current navigation | Change to |
|--------|-------------------|-----------|
| Task cards (오늘/내일/이번주) | `navigate('/tasks')` | `navigate('/tasks')` — keep as-is (task board has edit modal, clicking any task there opens it) |
| 조합 요약 items | `navigate('/funds')` | `navigate(`/funds/${fund.id}`)` — go to fund detail |
| 진행중 워크플로우 | `navigate('/workflows', { state: { expandInstanceId: wf.id } })` | Keep as-is (already navigates with expand state) |
| 미수집 서류 items | `navigate(`/investments/${doc.investment_id}`)` | Keep as-is (already correct) |
| 보고 마감 items | `navigate('/reports')` | `navigate('/reports')` — keep, but pass state to highlight the specific report: `navigate('/reports', { state: { highlightId: report.id } })` |
| 통지 기한 items | `navigate('/workflows')` | `navigate('/workflows', { state: { expandInstanceId: notice.workflow_instance_id } })` — include the instance ID if available |

**Key change:** Fund summary click should go to `/funds/${fund.id}` instead of `/funds`.

---

## Part 3: BizReport (영업보고) — Fund-Based Annual Report

### Problem
Current BizReport model uses `company_id` as the primary key — it's designed to receive reports FROM portfolio companies. But 영업보고 is actually an **annual report that the GP writes ABOUT the fund** (조합에 대한 영업보고). The GP selects a fund, writes the report about that fund's overall performance, and submits it to LPs.

### Solution
Restructure BizReport to be **fund-centric** instead of company-centric.

### 3.1 Backend Model Change

**File:** `backend/models/biz_report.py`

Change the model:
```python
class BizReport(Base):
    __tablename__ = "biz_reports"

    id = Column(Integer, primary_key=True, index=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)  # NOW REQUIRED
    report_year = Column(Integer, nullable=False)          # e.g., 2025
    status = Column(String, nullable=False, default="작성중")  # 작성중, 검토중, 완료
    submission_date = Column(Date, nullable=True)           # 제출일

    # Fund performance summary (GP writes this)
    total_commitment = Column(Numeric, nullable=True)       # 약정총액
    total_paid_in = Column(Numeric, nullable=True)          # 납입총액
    total_invested = Column(Numeric, nullable=True)         # 투자총액
    total_distributed = Column(Numeric, nullable=True)      # 분배총액
    fund_nav = Column(Numeric, nullable=True)               # 펀드 순자산가치
    irr = Column(Numeric, nullable=True)                    # IRR (%)
    tvpi = Column(Numeric, nullable=True)                   # TVPI (배수)
    dpi = Column(Numeric, nullable=True)                    # DPI (배수)

    # Text sections
    market_overview = Column(Text, nullable=True)           # 시장 현황
    portfolio_summary = Column(Text, nullable=True)         # 포트폴리오 요약
    investment_activity = Column(Text, nullable=True)       # 투자 활동 내역
    key_issues = Column(Text, nullable=True)                # 주요 이슈
    outlook = Column(Text, nullable=True)                   # 향후 전망
    memo = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
```

**IMPORTANT:** Since this is a structural change, create a new Alembic migration. If the existing `biz_reports` table has data, the migration should:
1. Drop the old table (it only has seed/test data)
2. Create the new table with the new schema

### 3.2 Backend Schema

**File:** `backend/schemas/biz_report.py` (or wherever BizReport schemas are)

Update to match the new model fields. Remove `company_id`, add `fund_id` as required, add new fields.

### 3.3 Backend Router

**File:** `backend/routers/biz_reports.py`

Update CRUD endpoints:
- `GET /api/biz-reports?fund_id=&year=&status=` — filter by fund, year, status
- `POST /api/biz-reports` — create with fund_id + report_year
- `PUT /api/biz-reports/{id}` — update
- `DELETE /api/biz-reports/{id}` — delete

### 3.4 Frontend Page Rewrite

**File:** `frontend/src/pages/BizReportsPage.tsx`

Rewrite to fund-centric flow:

```
┌─ 영업보고 ──────────────────────── [+ 영업보고 작성] ─┐
│                                                      │
│  필터: [조합 선택▾]  [연도 선택▾]  [상태▾]  [초기화]    │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │ A조합 | 2025년 영업보고                        │    │
│  │ 상태: 완료  |  제출일: 2026-03-15              │    │
│  │ 약정 300억 | 납입 250억 | 투자 200억           │    │
│  │ IRR 12.5% | TVPI 1.3x | DPI 0.4x            │    │
│  │                                    [수정] [삭제]│    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │ B조합 | 2025년 영업보고                        │    │
│  │ 상태: 작성중                                   │    │
│  │ ...                                           │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

Create form:
1. Select fund (required)
2. Select report year (required)
3. Fill in performance metrics + text sections
4. Save

Edit: click "수정" → inline form or modal with all fields.

### 3.5 Frontend API Client

**File:** `frontend/src/lib/api.ts`

Update BizReport types and API functions to match new schema. Remove `company_id` references, add new fields.

---

## Part 4: Seed Data (더미 데이터)

### Purpose
Populate the database with realistic Korean VC data so the user can see how the system looks with real data.

### 4.1 Seed Script

**File:** `backend/scripts/seed_data.py` (NEW or update existing seed)

Create comprehensive seed data following the existing pattern: `if db.query(Model).count() > 0: skip`

#### Funds (8 funds — matching the user's actual fund overview table)

All monetary amounts are in 백만원 (millions of KRW). Store as-is in the database (the frontend will display with comma formatting).

```python
funds = [
    {
        "name": "미래투자조합",
        "type": "농림수산식품투자조합",
        "status": "active",
        "fund_manager": "김00",
        "formation_date": "2024-07-02",
        "investment_period_end": "2028-07-01",
        "maturity_date": "2032-07-01",
        "gp": "트리거투자파트너스",
        "commitment_total": 20203,
        "gp_commitment": 2203,
        "hurdle_rate": 2.0,
    },
    {
        "name": "하이테크1호조합",
        "type": "벤처투자조합",
        "status": "active",
        "fund_manager": "가--",
        "formation_date": "2024-10-02",
        "investment_period_end": "2027-10-01",
        "maturity_date": "2029-10-01",
        "gp": "트리거투자파트너스",
        "commitment_total": 2085,
        "gp_commitment": 23,
        "hurdle_rate": 8.0,
    },
    {
        "name": "파마테크2호조합",
        "type": "벤처투자조합",
        "status": "active",
        "fund_manager": "나00",
        "formation_date": "2024-11-15",
        "investment_period_end": "2027-11-14",
        "maturity_date": "2029-11-14",
        "gp": "트리거투자파트너스",
        "commitment_total": 4755,
        "gp_commitment": 55,
        "hurdle_rate": 8.0,
    },
    {
        "name": "EX투자조합",
        "type": "농림수산식품투자조합",
        "status": "active",
        "fund_manager": "일00",
        "formation_date": "2024-12-31",
        "investment_period_end": "2028-12-30",
        "maturity_date": "2032-12-30",
        "gp": "트리거투자파트너스",
        "commitment_total": 10110,
        "gp_commitment": 110,
        "hurdle_rate": 2.0,
    },
    {
        "name": "뉴챕터투자조합",
        "type": "신기술사업투자조합",
        "status": "active",
        "fund_manager": "봐00",
        "formation_date": "2025-06-05",
        "investment_period_end": "2029-06-04",
        "maturity_date": "2033-06-04",
        "gp": "트리거투자파트너스",
        "commitment_total": 33400,
        "gp_commitment": 400,
        "hurdle_rate": 3.5,
    },
    {
        "name": "밸류체인펀드",
        "type": "농림수산식품투자조합",
        "status": "active",
        "fund_manager": "송00",
        "formation_date": "2025-07-17",
        "investment_period_end": "2029-07-16",
        "maturity_date": "2033-07-16",
        "gp": "트리거투자파트너스",
        "commitment_total": 20500,
        "gp_commitment": 500,
        "hurdle_rate": 2.0,
    },
    {
        "name": "메디테크 3호 조합",
        "type": "벤처투자조합",
        "status": "active",
        "fund_manager": "아00",
        "formation_date": "2025-10-31",
        "investment_period_end": "2028-10-30",
        "maturity_date": "2030-10-30",
        "gp": "트리거투자파트너스",
        "commitment_total": 2275,
        "gp_commitment": 25,
        "hurdle_rate": 8.0,
    },
    {
        "name": "성장 벤처투자조합",
        "type": "벤처투자조합",
        "status": "forming",
        "fund_manager": "최00",
        "formation_date": None,  # 26년 3월 예정
        "investment_period_end": None,
        "maturity_date": None,
        "gp": "트리거투자파트너스",
        "commitment_total": 13500,
        "gp_commitment": 150,
        "hurdle_rate": 3.0,
    },
]
```

#### LPs (sample for first 3 funds, 3-5 each)
```python
# Fund 1 (미래투자조합) LPs — total paid_in should = 14,142
fund1_lps = [
    {"name": "농식품모태펀드", "type": "정책기관", "commitment": 8000, "paid_in": 5600},
    {"name": "농업정책보험금융원", "type": "정책기관", "commitment": 5000, "paid_in": 3500},
    {"name": "미래에셋증권", "type": "금융기관", "commitment": 3000, "paid_in": 2100},
    {"name": "개인투자자", "type": "개인", "commitment": 2000, "paid_in": 739},
    {"name": "트리거투자파트너스", "type": "GP", "commitment": 2203, "paid_in": 2203},
]

# Fund 2 (하이테크1호조합) LPs — total paid_in should = 1,668
fund2_lps = [
    {"name": "한국벤처투자", "type": "정책기관", "commitment": 1000, "paid_in": 800},
    {"name": "하이투자증권", "type": "금융기관", "commitment": 562, "paid_in": 450},
    {"name": "기술보증기금", "type": "정책기관", "commitment": 500, "paid_in": 395},
    {"name": "트리거투자파트너스", "type": "GP", "commitment": 23, "paid_in": 23},
]

# Fund 3 (파마테크2호조합) LPs — total paid_in should = 4,755 (100% 납입)
fund3_lps = [
    {"name": "한국성장금융", "type": "정책기관", "commitment": 2000, "paid_in": 2000},
    {"name": "IBK기업은행", "type": "금융기관", "commitment": 1500, "paid_in": 1500},
    {"name": "과학기술인공제회", "type": "기관", "commitment": 1200, "paid_in": 1200},
    {"name": "트리거투자파트너스", "type": "GP", "commitment": 55, "paid_in": 55},
]
```

#### Portfolio Companies (10+, with realistic data)
```python
companies = [
    {"name": "넥스트바이오", "industry": "바이오/헬스케어", "ceo": "박민수"},
    {"name": "클라우드나인", "industry": "SaaS/클라우드", "ceo": "이지현"},
    {"name": "에이아이랩스", "industry": "AI/딥러닝", "ceo": "정석호"},
    {"name": "핀테크원", "industry": "핀테크", "ceo": "김유진"},
    {"name": "그린에너지텍", "industry": "신재생에너지", "ceo": "최동훈"},
    {"name": "메디컬소프트", "industry": "디지털헬스케어", "ceo": "한서영"},
    {"name": "스마트팜코리아", "industry": "애그테크/스마트팜", "ceo": "송준혁"},
    {"name": "푸드테크랩", "industry": "식품기술", "ceo": "오미라"},
    {"name": "모빌리티플러스", "industry": "모빌리티", "ceo": "강태우"},
    {"name": "디지털커머스", "industry": "이커머스", "ceo": "윤하늘"},
]
```

#### Investments (matching the fund overview table — amounts in 백만원)

The investment_date is critical for the reference_date filter. Investments made after the reference_date should NOT appear.

```python
investments = [
    # 미래투자조합 (총 투자 13,500, 6개 업체)
    {"fund": "미래투자조합", "company": "넥스트바이오", "amount": 3000, "instrument": "보통주", "status": "active", "date": "2024-09-15"},
    {"fund": "미래투자조합", "company": "클라우드나인", "amount": 2500, "instrument": "전환사채", "status": "active", "date": "2024-11-01"},
    {"fund": "미래투자조합", "company": "스마트팜코리아", "amount": 2000, "instrument": "상환전환우선주", "status": "active", "date": "2025-01-20"},
    {"fund": "미래투자조합", "company": "푸드테크랩", "amount": 2500, "instrument": "보통주", "status": "active", "date": "2025-03-15"},
    {"fund": "미래투자조합", "company": "그린에너지텍", "amount": 1800, "instrument": "전환사채", "status": "active", "date": "2025-06-10"},
    {"fund": "미래투자조합", "company": "디지털커머스", "amount": 1700, "instrument": "보통주", "status": "active", "date": "2025-09-05"},

    # 하이테크1호조합 (총 투자 1,515, 1개 업체)
    {"fund": "하이테크1호조합", "company": "에이아이랩스", "amount": 1515, "instrument": "상환전환우선주", "status": "active", "date": "2025-02-10"},

    # 파마테크2호조합 (총 투자 4,532, 1개 업체)
    {"fund": "파마테크2호조합", "company": "메디컬소프트", "amount": 4532, "instrument": "전환사채", "status": "active", "date": "2025-01-15"},

    # EX투자조합 (총 투자 8,820, 9개 업체 — creating multiple investments)
    {"fund": "EX투자조합", "company": "넥스트바이오", "amount": 1200, "instrument": "보통주", "status": "active", "date": "2025-03-01"},
    {"fund": "EX투자조합", "company": "핀테크원", "amount": 1100, "instrument": "전환사채", "status": "active", "date": "2025-04-15"},
    {"fund": "EX투자조합", "company": "스마트팜코리아", "amount": 1000, "instrument": "보통주", "status": "active", "date": "2025-05-20"},
    {"fund": "EX투자조합", "company": "푸드테크랩", "amount": 1000, "instrument": "상환전환우선주", "status": "active", "date": "2025-06-10"},
    {"fund": "EX투자조합", "company": "그린에너지텍", "amount": 900, "instrument": "보통주", "status": "active", "date": "2025-07-01"},
    {"fund": "EX투자조합", "company": "모빌리티플러스", "amount": 1000, "instrument": "전환사채", "status": "active", "date": "2025-08-15"},
    {"fund": "EX투자조합", "company": "클라우드나인", "amount": 800, "instrument": "보통주", "status": "active", "date": "2025-09-01"},
    {"fund": "EX투자조합", "company": "디지털커머스", "amount": 900, "instrument": "상환전환우선주", "status": "active", "date": "2025-10-15"},
    {"fund": "EX투자조합", "company": "에이아이랩스", "amount": 920, "instrument": "보통주", "status": "active", "date": "2025-11-20"},

    # 뉴챕터투자조합 (총 투자 8,690, 3개 업체)
    {"fund": "뉴챕터투자조합", "company": "핀테크원", "amount": 3500, "instrument": "보통주", "status": "active", "date": "2025-09-01"},
    {"fund": "뉴챕터투자조합", "company": "모빌리티플러스", "amount": 3000, "instrument": "전환사채", "status": "active", "date": "2025-10-15"},
    {"fund": "뉴챕터투자조합", "company": "에이아이랩스", "amount": 2190, "instrument": "상환전환우선주", "status": "active", "date": "2025-12-01"},

    # 밸류체인펀드 (총 투자 6,000, 3개 업체)
    {"fund": "밸류체인펀드", "company": "스마트팜코리아", "amount": 2500, "instrument": "보통주", "status": "active", "date": "2025-10-01"},
    {"fund": "밸류체인펀드", "company": "푸드테크랩", "amount": 2000, "instrument": "전환사채", "status": "active", "date": "2025-11-15"},
    {"fund": "밸류체인펀드", "company": "그린에너지텍", "amount": 1500, "instrument": "보통주", "status": "active", "date": "2025-12-20"},

    # 메디테크 3호 조합 (총 투자 2,150, 1개 업체)
    {"fund": "메디테크 3호 조합", "company": "넥스트바이오", "amount": 2150, "instrument": "상환전환우선주", "status": "active", "date": "2026-01-10"},

    # 성장 벤처투자조합 — 아직 투자 없음 (미성립)
]
```

**Reference date test scenario:**
- reference_date = 2025-09-30: 뉴챕터투자조합 should show only 1 investment (핀테크원 3,500, made on 2025-09-01), NOT the Oct/Dec investments. 밸류체인펀드 should show 0 investments.
- reference_date = 2026-02-14 (today): all investments visible.

#### Tasks (10-15 with various quadrants and deadlines)
Include mix of today, this week, next week, and no-deadline tasks.

#### Workflow Instances (2-3 active)
Create from existing workflow templates with realistic dates.

#### BizReports (2-3, matching new fund-centric schema)
```python
biz_reports = [
    {"fund": "1호", "report_year": 2025, "status": "완료", "submission_date": "2026-03-15",
     "total_commitment": 30000000000, "total_invested": 11500000000, "irr": 12.5, "tvpi": 1.3, "dpi": 0.4},
    {"fund": "2호", "report_year": 2025, "status": "작성중",
     "total_commitment": 50000000000, "total_invested": 18000000000},
]
```

#### Fund Notice Periods (for Phase 7 integration)
```python
# Fund 1 notice periods
fund1_notices = [
    {"notice_type": "assembly", "label": "총회 소집 통지", "business_days": 14, "memo": "규약 제15조"},
    {"notice_type": "capital_call_initial", "label": "최초 출자금 납입 요청", "business_days": 10, "memo": "규약 제20조"},
    {"notice_type": "capital_call_additional", "label": "수시 출자금 납입 요청", "business_days": 10, "memo": "규약 제20조"},
    {"notice_type": "ic_agenda", "label": "투심위 안건 통지", "business_days": 7, "memo": "규약 제25조"},
    {"notice_type": "distribution", "label": "분배 통지", "business_days": 5, "memo": "규약 제30조"},
]
# Fund 2 has different periods
fund2_notices = [
    {"notice_type": "assembly", "label": "총회 소집 통지", "business_days": 10, "memo": "규약 제12조"},
    {"notice_type": "capital_call_additional", "label": "수시 출자금 납입 요청", "business_days": 14, "memo": "규약 제18조"},
    {"notice_type": "ic_agenda", "label": "투심위 안건 통지", "business_days": 5, "memo": "규약 제22조"},
]
```

### 4.2 Run Seed

Add to `backend/main.py` startup or create a CLI command:
```python
# In main.py lifespan or startup event
from scripts.seed_data import seed_all
seed_all(db)
```

Or make it runnable via: `python -m scripts.seed_data`

---

## Part 5: Print-Friendly Workflow Checklist

### Problem
Workflows with defined steps are useful digitally, but the user also needs to print checklists for offline use (meetings, field work, physical filing).

### Solution
Add a "인쇄" (print) button to workflow instances that generates a clean, printer-friendly checklist.

### 5.1 Print Button

**File:** `frontend/src/pages/WorkflowsPage.tsx`

Add a print button to each active/completed workflow instance card:
```tsx
<button onClick={() => handlePrint(instance)} className="secondary-btn flex items-center gap-1">
  <Printer size={14} /> 인쇄
</button>
```

Import `Printer` from `lucide-react`.

### 5.2 Print View

When the print button is clicked, open a new window/tab with a print-optimized layout, then trigger `window.print()`.

**Content of the print view:**

```
┌─────────────────────────────────────────────┐
│  VC ERP — 워크플로우 체크리스트                  │
│                                             │
│  워크플로우: 투자 실행 워크플로우                  │
│  대상: A조합 / 넥스트바이오                     │
│  시작일: 2026-02-10                          │
│  인쇄일: 2026-02-14                          │
│                                             │
│  ☐ D-7  (2/10) 투자심의위원회 안건 준비          │
│  ☐ D-5  (2/12) 투심위 자료 배포                │
│  ☐ D-3  (2/14) 투자심의위원회 개최              │
│  ☐ D-day(2/17) 투자 계약 체결                  │
│  ☐ D+1  (2/18) 투자금 송금                    │
│  ☐ D+3  (2/20) 등기/공시 서류 제출              │
│  ☐ D+5  (2/22) 사후 관리 등록                  │
│                                             │
│  필요 서류:                                   │
│  ☐ 투자심의의결서                              │
│  ☐ 주주간계약서                                │
│  ☐ 투자계약서                                  │
│  ☐ 주금납입증명서                              │
│                                             │
│  주의사항:                                    │
│  • 투심위 의결정족수 확인                       │
│  • 계약서 법무 검토 필수                        │
│                                             │
└─────────────────────────────────────────────┘
```

### 5.3 Implementation

Create a utility function or component:

```tsx
function printWorkflowChecklist(instance: WorkflowInstanceDetail) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return

  const stepsHtml = instance.step_instances
    .map(step => {
      const statusMark = step.status === 'completed' ? '☑' : '☐'
      const dateStr = new Date(step.calculated_date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
      return `<tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${statusMark}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${step.step?.timing || ''}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${dateStr}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${step.step?.name || ''}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${step.step?.memo || ''}</td>
      </tr>`
    })
    .join('')

  const documentsHtml = instance.workflow?.documents
    ?.map(doc => `<li style="padding: 4px 0;">☐ ${doc.name}${doc.notes ? ` — ${doc.notes}` : ''}</li>`)
    .join('') || '<li>없음</li>'

  const warningsHtml = instance.workflow?.warnings
    ?.map(w => `<li style="padding: 4px 0;">• ${w.content}</li>`)
    .join('') || ''

  printWindow.document.write(`
    <html>
    <head>
      <title>${instance.name} — 체크리스트</title>
      <style>
        body { font-family: -apple-system, sans-serif; padding: 40px; color: #111; max-width: 800px; margin: 0 auto; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        h2 { font-size: 14px; margin-top: 24px; margin-bottom: 8px; color: #374151; }
        .meta { font-size: 13px; color: #6b7280; margin-bottom: 24px; line-height: 1.8; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: left; padding: 8px; border-bottom: 2px solid #111; font-weight: 600; }
        ul { list-style: none; padding: 0; font-size: 13px; }
        @media print {
          body { padding: 20px; }
          button { display: none; }
        }
      </style>
    </head>
    <body>
      <h1>워크플로우 체크리스트</h1>
      <div class="meta">
        <strong>${instance.name}</strong><br>
        ${instance.fund_name ? `조합: ${instance.fund_name}<br>` : ''}
        ${instance.company_name ? `대상: ${instance.company_name}<br>` : ''}
        시작일: ${instance.trigger_date}<br>
        인쇄일: ${new Date().toLocaleDateString('ko-KR')}
      </div>

      <h2>진행 단계</h2>
      <table>
        <thead><tr><th></th><th>시점</th><th>날짜</th><th>단계</th><th>비고</th></tr></thead>
        <tbody>${stepsHtml}</tbody>
      </table>

      <h2>필요 서류</h2>
      <ul>${documentsHtml}</ul>

      ${warningsHtml ? `<h2>주의사항</h2><ul>${warningsHtml}</ul>` : ''}

      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `)
  printWindow.document.close()
}
```

### 5.4 Workflow Template Print

Also add print capability to workflow **templates** (not just instances). When viewing a template, a "인쇄" button generates a blank checklist with the template's default steps/documents/warnings (useful for planning).

---

## Files to Create

1. `frontend/src/pages/FundOverviewPage.tsx` — NEW fund overview with reference date filter
2. `backend/scripts/seed_data.py` — NEW comprehensive seed data script

## Files to Modify

### Backend
3. `backend/models/fund.py` — Add `fund_manager`, `investment_period_end`, `gp_commitment` columns + BizReport FK relationship
4. `backend/models/biz_report.py` — Restructure to fund-centric model
5. `backend/schemas/fund.py` — Add new fields to FundCreate/Update/Response + FundOverviewItem/Response schemas
6. `backend/schemas/biz_report.py` (or wherever BizReport schemas are) — Update schemas
7. `backend/routers/funds.py` — Add `GET /api/funds/overview?reference_date=` endpoint with all calculations
8. `backend/routers/biz_reports.py` — Update CRUD endpoints
9. `backend/migrations/versions/` — Two migrations: (1) add fund columns, (2) biz_reports restructure
10. `backend/main.py` — Optional: add seed data on startup

### Frontend
11. `frontend/src/App.tsx` — Add `/fund-overview` route
12. `frontend/src/components/Layout.tsx` — Add "조합 현황" to nav
13. `frontend/src/lib/api.ts` — Update BizReport types + add fetchFundOverview + FundOverviewItem types
14. `frontend/src/pages/DashboardPage.tsx` — Fix click navigation (fund → fund detail, add "전체 보기" link)
15. `frontend/src/pages/BizReportsPage.tsx` — Complete rewrite (fund-centric)
16. `frontend/src/pages/WorkflowsPage.tsx` — Add print button + print function
17. `frontend/src/pages/FundDetailPage.tsx` — Show new fields (fund_manager, investment_period_end, gp_commitment)

## Files NOT to Modify
- `frontend/src/components/SearchModal.tsx`
- `backend/models/workflow.py`

---

## Acceptance Criteria

1. `/fund-overview` page shows all funds in a detailed comparison table matching the provided format (NO, 조합명, 조합구분, 대표펀드매니저, 등록일, 투자기간종료, 경과율, 청산시기, 약정총액, 납입총액, 납입비율, GP출자금, 투자총액, 미투자액, 투자자산, 투자업체수, 기준수익률, 잔존기간)
2. **기준일 필터** works: changing the date input re-fetches and recalculates all derived values
3. reference_date filter correctly excludes investments with investment_date > reference_date
4. 합계 row at the bottom sums all numeric columns
5. Each fund row is clickable → navigates to `/funds/{id}`
6. Fund model has new fields: fund_manager, investment_period_end, gp_commitment
7. Dashboard "조합 요약" items click → `/funds/{id}` (not `/funds`)
8. Dashboard has "전체 조합 현황 보기" link → `/fund-overview`
9. BizReport is fund-centric: create by selecting fund + year, no company_id
10. BizReport form includes performance metrics (IRR, TVPI, DPI) and text sections
11. Seed data creates 8 funds with correct amounts, LPs, 10+ companies, 25+ investments matching the provided data
12. Seed data uses `if count > 0: skip` pattern to prevent duplicates
13. Seed data can be run via `python -m scripts.seed_data`
14. Workflow instances have a "인쇄" button that opens a print-friendly checklist
15. Print view includes: steps with checkboxes, dates, required documents, warnings
16. Print view auto-triggers `window.print()` on load
17. Workflow templates also have a print button for blank checklists
18. All new pages follow the standard container pattern (`mx-auto max-w-7xl px-6 py-6`)
19. All existing functionality continues to work without regression
20. **Verification test:** With reference_date=2025-09-30, 뉴챕터투자조합 should show 1 investment / 3,500 invested / company_count=1. With reference_date=2026-02-14, it should show 3 investments / 8,690 / company_count=3.
