# VC ERP Phase 3 — 한국어화 완성 + 보고·영업보고·회계 기초

> 트리거투자파트너스 1인 백오피스 ERP 시스템
> 작성일: 2026-02-13
> 대상 작업자: OpenAI CODEX
> PM: Claude Code

---

## 프로젝트 배경

Phase 1(구조 안정화 20개 항목)과 Phase 2(동선 단축 8개 항목)이 전부 완료되었다. Phase 3에서 추가된 Transaction, Valuation, FundOperations, Exits 4개 페이지와 관련 Backend가 추가되었으나, **이 4개 페이지의 UI가 영어로 되어 있다**. 또한 `business_overview.md`의 Phase 4에 해당하는 영업보고 수집(D-3), 보고·공시(G), 회계 기초(F)가 아직 미구현이다.

### 현재 구현 완료 모듈 (Phase 1~3)

1. Task Board (아이젠하워 매트릭스 Q1-Q4, 드래그앤드롭)
2. Workflow Templates & Instances (투심위/투자계약/투자후서류/조합결성/정기총회/월보고 등 10개 시드)
3. Fund & LP 관리 (상세 페이지 분리)
4. Investment & Portfolio Company 관리 (상세 페이지 분리, 서류 D-day 추적)
5. Transaction Ledger (거래원장)
6. Valuation (가치평가)
7. Fund Operations (출자/배분/총회/성과지표)
8. Exit Management (회수위원회/회수거래)
9. Work Log 추적
10. Checklist 관리
11. Calendar (월별 뷰 + Task 연동)
12. Document Status 조회
13. Dashboard (일일 개요 + 워크플로우 상세 + 조합 현황 + 미수 서류)
14. 글로벌 검색 (Ctrl+K)
15. Toast 알림 시스템

### 기술 스택 (변경 없음)

| 구분 | 기술 | 비고 |
|------|------|------|
| Backend | Python + FastAPI + SQLAlchemy + SQLite | `backend/` |
| Frontend | TypeScript + React 19 + Vite + Tailwind CSS 4 | `frontend/` |
| 서버 상태 | TanStack React Query 5 | |
| HTTP | Axios (`frontend/src/lib/api.ts`) | |
| 아이콘 | Lucide React | |
| CSS 유틸 | `frontend/src/lib/labels.ts` | `formatKRW`, `labelStatus` |
| Toast | `frontend/src/contexts/ToastContext.tsx` | `useToast().addToast` |
| 마이그레이션 | Alembic (`backend/migrations/`) | |

### 프로젝트 디렉토리 구조

```
ERP-Project/
├── backend/
│   ├── main.py                 # FastAPI 앱 (lifespan 패턴, 17개 라우터 등록)
│   ├── database.py             # SQLite 연결
│   ├── models/                 # SQLAlchemy 모델
│   │   ├── task.py, workflow.py, workflow_instance.py, worklog.py
│   │   ├── fund.py, investment.py, checklist.py, calendar_event.py
│   │   ├── transaction.py, valuation.py, phase3.py
│   │   └── __init__.py (모든 모델 import)
│   ├── schemas/                # Pydantic 스키마
│   ├── routers/                # API 엔드포인트 (17개 파일)
│   ├── services/workflow_service.py
│   ├── seed/seed_workflows.py
│   └── migrations/             # Alembic
├── frontend/
│   ├── src/
│   │   ├── App.tsx             # 15개 라우트
│   │   ├── components/Layout.tsx, SearchModal.tsx, Toast.tsx
│   │   ├── contexts/ToastContext.tsx
│   │   ├── lib/api.ts (API 클라이언트 + 60+ 타입), labels.ts (한국어 유틸)
│   │   └── pages/ (15개 페이지)
│   └── vite.config.ts
├── 01_Requirements/business_overview.md, data_structures.md
├── 02_Data/, 03_Workflows/, 04_Checklists/
└── docs/
```

---

## 목차

1. [Q0 - 한국어 UI 완성 (신규 4개 페이지)](#q0---한국어-ui-완성)
2. [Q1 - 영업보고 수집·관리 (D-3)](#q1---영업보고-수집관리)
3. [Q2 - 보고·공시 관리 (G)](#q2---보고공시-관리)
4. [Q3 - 회계 기초 (F 간소화)](#q3---회계-기초)
5. [Q4 - 의결권 행사 (D-4)](#q4---의결권-행사)
6. [Q5 - 대시보드 고도화](#q5---대시보드-고도화)
7. [작업 순서 & 의존성](#작업-순서--의존성)

---

## Q0 - 한국어 UI 완성

> **언어**: TypeScript (TSX)
> **대상 파일**: `frontend/src/pages/TransactionsPage.tsx`, `ValuationsPage.tsx`, `FundOperationsPage.tsx`, `ExitsPage.tsx`, `frontend/src/components/Layout.tsx`
> **변경 범위**: UI 표시 텍스트만 — API key, DB 값은 영어 유지

### Q0-1. Layout.tsx NAV 라벨 한국어 전환

**문제**: Phase 3에서 추가된 4개 메뉴가 영어로 되어 있다.

**변경** — `frontend/src/components/Layout.tsx`의 `NAV` 배열:

```typescript
const NAV = [
  { to: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { to: '/tasks', label: '업무 보드', icon: KanbanSquare },
  { to: '/workflows', label: '워크플로우', icon: GitBranch },
  { to: '/worklogs', label: '업무 기록', icon: BookOpen },
  { to: '/funds', label: '조합 관리', icon: Building2 },
  { to: '/investments', label: '투자 관리', icon: PieChart },
  { to: '/transactions', label: '거래원장', icon: ListTree },
  { to: '/valuations', label: '가치평가', icon: LineChart },
  { to: '/fund-operations', label: '조합 운영', icon: Landmark },
  { to: '/exits', label: '회수 관리', icon: TrendingDown },
  { to: '/checklists', label: '체크리스트', icon: CheckSquare },
  { to: '/documents', label: '서류 현황', icon: Files },
  { to: '/calendar', label: '캘린더', icon: CalendarDays },
]
```

또한 헤더 바의 검색 버튼 텍스트:
- `<span>Search</span>` → `<span>검색</span>`

---

### Q0-2. TransactionsPage.tsx 한국어 전환

**대상 파일**: `frontend/src/pages/TransactionsPage.tsx`

**변경할 텍스트 매핑**:

| 영어 | 한국어 |
|------|--------|
| Transaction Ledger | 거래원장 |
| Manage investment transaction history | 투자 거래 내역 관리 |
| All Types | 전체 유형 |
| All Funds | 전체 조합 |
| All Companies | 전체 피투자사 |
| All Investments | 전체 투자건 |
| New Transaction | 신규 거래 등록 |
| Fund | 조합 |
| Company | 피투자사 |
| Investment | 투자건 |
| Transaction Date | 거래일 |
| Type | 유형 |
| Amount | 금액 |
| Shares Change | 주식수 변동 |
| Balance Before | 거래 전 잔액 |
| Balance After | 거래 후 잔액 |
| Realized Gain | 실현손익 |
| Cumulative Gain | 누적손익 |
| Memo | 비고 |
| Save | 저장 |
| Cancel | 취소 |
| Edit | 수정 |
| Delete | 삭제 |
| No transactions found | 거래 내역이 없습니다 |
| Loading... | 불러오는 중... |

**거래 유형 라벨 (드롭다운 표시용)**:
```typescript
const TRANSACTION_TYPE_LABEL: Record<string, string> = {
  '투자': '투자',
  '추가투자': '추가투자',
  '전환': '전환',
  '감자': '감자',
  '매각': '매각',
  '상환': '상환',
  '배당': '배당',
  '합병': '합병',
  '기타': '기타',
}
```

---

### Q0-3. ValuationsPage.tsx 한국어 전환

**대상 파일**: `frontend/src/pages/ValuationsPage.tsx`

| 영어 | 한국어 |
|------|--------|
| Valuations | 가치평가 |
| Portfolio company valuations | 포트폴리오 가치평가 관리 |
| New Valuation | 신규 평가 등록 |
| All Methods | 전체 평가방법 |
| As of Date | 평가 기준일 |
| Evaluator | 평가 주체 |
| Method | 평가 방법 |
| Instrument | 투자유형 |
| Value | 평가금액 |
| Previous Value | 전기 평가금액 |
| Change | 변동액 |
| Change % | 변동률 |
| Basis | 산출 근거 |
| No valuations found | 가치평가 내역이 없습니다 |

**평가 방법 라벨**:
```typescript
const METHOD_LABEL: Record<string, string> = {
  '최근거래가': '최근거래가',
  'DCF': 'DCF',
  '비교법': '비교법',
  '순자산법': '순자산법',
  '기타': '기타',
}
```

---

### Q0-4. FundOperationsPage.tsx 한국어 전환

**대상 파일**: `frontend/src/pages/FundOperationsPage.tsx`

| 영어 | 한국어 |
|------|--------|
| Fund Operations | 조합 운영 |
| Capital calls, distributions, assemblies & performance | 출자·배분·총회·성과 관리 |
| Select Fund | 조합 선택 |
| Capital Calls | 출자 |
| Distributions | 배분 |
| Assemblies | 총회 |
| Performance | 성과지표 |
| New Capital Call | 신규 출자 등록 |
| Call Date | 출자 기준일 |
| Call Type | 출자 유형 |
| Total Amount | 출자 총액 |
| Items | LP별 내역 |
| LP | 출자자 |
| Amount | 금액 |
| Paid | 납입 여부 |
| Paid Date | 납입일 |
| New Distribution | 신규 배분 등록 |
| Distribution Date | 배분 기준일 |
| Distribution Type | 배분 유형 |
| Principal Total | 원금 총액 |
| Profit Total | 수익 총액 |
| Performance Fee | 성과보수 |
| New Assembly | 신규 총회 등록 |
| Assembly Type | 총회 유형 |
| Date | 일자 |
| Agenda | 안건 |
| Status | 상태 |
| Minutes Completed | 의사록 작성 |
| Paid-In Total | 납입 총액 |
| Total Invested | 투자 총액 |
| Total Distributed | 배분 총액 |
| Residual Value | 잔존가치 |
| Total Value | 총가치 |
| IRR | IRR |
| TVPI | TVPI |
| DPI | DPI |
| RVPI | RVPI |

**출자 유형 라벨**:
```typescript
const CALL_TYPE_LABEL: Record<string, string> = {
  '설립출자': '설립출자',
  '추가출자': '추가출자',
  '멀티클로징': '멀티클로징',
}
```

**배분 유형 라벨**:
```typescript
const DIST_TYPE_LABEL: Record<string, string> = {
  '원금배분': '원금배분',
  '수익배분': '수익배분',
  '잔여재산배분': '잔여재산배분',
}
```

**총회 유형 라벨**:
```typescript
const ASSEMBLY_TYPE_LABEL: Record<string, string> = {
  '결성총회': '결성총회',
  '정기총회': '정기총회',
  '임시총회': '임시총회',
}
```

---

### Q0-5. ExitsPage.tsx 한국어 전환

**대상 파일**: `frontend/src/pages/ExitsPage.tsx`

| 영어 | 한국어 |
|------|--------|
| Exit Management | 회수 관리 |
| Exit committees and trade management | 회수위원회 및 거래 관리 |
| Committees | 위원회 |
| Trades | 거래 |
| New Committee | 신규 위원회 등록 |
| Meeting Date | 개최 일시 |
| Location | 장소 |
| Agenda | 안건명 |
| Exit Strategy | 회수 전략 |
| Analyst Opinion | 심사역 의견 |
| Vote Result | 표결 결과 |
| Fund Links | 재원 연결 |
| New Trade | 신규 거래 등록 |
| Exit Type | 회수 유형 |
| Trade Date | 거래일 |
| Shares Sold | 매도 주식수 |
| Price Per Share | 주당 매도가 |
| Fees | 수수료 |
| Net Amount | 순회수액 |

**회수 유형 라벨**:
```typescript
const EXIT_TYPE_LABEL: Record<string, string> = {
  'IPO매도': 'IPO 매도',
  'M&A': 'M&A',
  '세컨더리': '세컨더리',
  '상환': '상환',
  '청산배분': '청산배분',
  '배당': '배당',
}
```

**위원회 상태 라벨**: `labels.ts`에 추가:
```typescript
// labels.ts STATUS_LABEL에 추가
'수정중': '수정중',
'표결중': '표결중',
'가결': '가결',
'부결': '부결',
```

---

## Q1 - 영업보고 수집·관리

> **언어**: Python (Backend) + TypeScript (Frontend)
> **신규 파일**: `backend/models/biz_report.py`, `backend/schemas/biz_report.py`, `backend/routers/biz_reports.py`, `frontend/src/pages/BizReportsPage.tsx`
> **수정 파일**: `backend/models/__init__.py`, `backend/main.py`, `frontend/src/App.tsx`, `frontend/src/components/Layout.tsx`, `frontend/src/lib/api.ts`
> **참조 문서**: `01_Requirements/business_overview.md` 섹션 D-3, `01_Requirements/data_structures.md` BizReport 모델

### Q1-1. Backend 모델

**`backend/models/biz_report.py`** (신규):

```python
from sqlalchemy import Column, Integer, String, Date, Numeric, Text, DateTime, ForeignKey, func
from database import Base


class BizReport(Base):
    __tablename__ = "biz_reports"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("portfolio_companies.id"), nullable=False)
    report_type = Column(String, nullable=False)          # 분기보고 | 월보고 | 일반보고
    period = Column(String, nullable=False)                # "2026-Q1", "2026-01" 등
    status = Column(String, default="요청전")              # 요청전 | 요청중 | 수신 | 검수완료
    requested_date = Column(Date, nullable=True)           # 요청 발송일
    received_date = Column(Date, nullable=True)            # 수신일
    reviewed_date = Column(Date, nullable=True)            # 검수 완료일
    analyst_comment = Column(Text, nullable=True)          # 심사역 의견

    # 재무 데이터 (주요 항목)
    revenue = Column(Numeric, nullable=True)               # 매출
    operating_income = Column(Numeric, nullable=True)      # 영업이익
    net_income = Column(Numeric, nullable=True)            # 당기순이익
    total_assets = Column(Numeric, nullable=True)          # 총자산
    total_liabilities = Column(Numeric, nullable=True)     # 총부채
    employees = Column(Integer, nullable=True)             # 종업원 수

    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
```

**`backend/models/__init__.py`** — import 추가:
```python
from models.biz_report import BizReport
```

### Q1-2. Backend 스키마

**`backend/schemas/biz_report.py`** (신규):

```python
from pydantic import BaseModel
from typing import Literal


class BizReportCreate(BaseModel):
    company_id: int
    report_type: Literal["분기보고", "월보고", "일반보고"]
    period: str
    status: str | None = "요청전"
    requested_date: str | None = None
    received_date: str | None = None
    reviewed_date: str | None = None
    analyst_comment: str | None = None
    revenue: float | None = None
    operating_income: float | None = None
    net_income: float | None = None
    total_assets: float | None = None
    total_liabilities: float | None = None
    employees: int | None = None
    memo: str | None = None


class BizReportUpdate(BaseModel):
    report_type: str | None = None
    period: str | None = None
    status: str | None = None
    requested_date: str | None = None
    received_date: str | None = None
    reviewed_date: str | None = None
    analyst_comment: str | None = None
    revenue: float | None = None
    operating_income: float | None = None
    net_income: float | None = None
    total_assets: float | None = None
    total_liabilities: float | None = None
    employees: int | None = None
    memo: str | None = None


class BizReportResponse(BaseModel):
    id: int
    company_id: int
    report_type: str
    period: str
    status: str
    requested_date: str | None
    received_date: str | None
    reviewed_date: str | None
    analyst_comment: str | None
    revenue: float | None
    operating_income: float | None
    net_income: float | None
    total_assets: float | None
    total_liabilities: float | None
    employees: int | None
    memo: str | None
    created_at: str | None
    company_name: str | None = None

    model_config = {"from_attributes": True}
```

### Q1-3. Backend 라우터

**`backend/routers/biz_reports.py`** (신규):

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.biz_report import BizReport
from models.investment import PortfolioCompany
from schemas.biz_report import BizReportCreate, BizReportUpdate, BizReportResponse

router = APIRouter(prefix="/api/biz-reports", tags=["biz-reports"])


@router.get("")
def list_biz_reports(
    company_id: int | None = None,
    report_type: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(BizReport)
    if company_id:
        q = q.filter(BizReport.company_id == company_id)
    if report_type:
        q = q.filter(BizReport.report_type == report_type)
    if status:
        q = q.filter(BizReport.status == status)
    reports = q.order_by(BizReport.created_at.desc()).all()
    result = []
    for r in reports:
        company = db.get(PortfolioCompany, r.company_id)
        d = {c.name: getattr(r, c.name) for c in r.__table__.columns}
        d["company_name"] = company.name if company else None
        d["created_at"] = str(r.created_at) if r.created_at else None
        d["requested_date"] = str(r.requested_date) if r.requested_date else None
        d["received_date"] = str(r.received_date) if r.received_date else None
        d["reviewed_date"] = str(r.reviewed_date) if r.reviewed_date else None
        result.append(d)
    return result


@router.get("/{report_id}")
def get_biz_report(report_id: int, db: Session = Depends(get_db)):
    r = db.get(BizReport, report_id)
    if not r:
        raise HTTPException(404, "영업보고를 찾을 수 없습니다")
    company = db.get(PortfolioCompany, r.company_id)
    d = {c.name: getattr(r, c.name) for c in r.__table__.columns}
    d["company_name"] = company.name if company else None
    d["created_at"] = str(r.created_at) if r.created_at else None
    d["requested_date"] = str(r.requested_date) if r.requested_date else None
    d["received_date"] = str(r.received_date) if r.received_date else None
    d["reviewed_date"] = str(r.reviewed_date) if r.reviewed_date else None
    return d


@router.post("")
def create_biz_report(data: BizReportCreate, db: Session = Depends(get_db)):
    company = db.get(PortfolioCompany, data.company_id)
    if not company:
        raise HTTPException(404, "피투자사를 찾을 수 없습니다")
    report = BizReport(**data.model_dump())
    db.add(report)
    db.commit()
    db.refresh(report)
    d = {c.name: getattr(report, c.name) for c in report.__table__.columns}
    d["company_name"] = company.name
    d["created_at"] = str(report.created_at) if report.created_at else None
    return d


@router.put("/{report_id}")
def update_biz_report(report_id: int, data: BizReportUpdate, db: Session = Depends(get_db)):
    report = db.get(BizReport, report_id)
    if not report:
        raise HTTPException(404, "영업보고를 찾을 수 없습니다")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(report, key, value)
    db.commit()
    db.refresh(report)
    company = db.get(PortfolioCompany, report.company_id)
    d = {c.name: getattr(report, c.name) for c in report.__table__.columns}
    d["company_name"] = company.name if company else None
    d["created_at"] = str(report.created_at) if report.created_at else None
    return d


@router.delete("/{report_id}")
def delete_biz_report(report_id: int, db: Session = Depends(get_db)):
    report = db.get(BizReport, report_id)
    if not report:
        raise HTTPException(404, "영업보고를 찾을 수 없습니다")
    db.delete(report)
    db.commit()
    return {"ok": True}
```

**`backend/main.py`** — 라우터 등록:
```python
from routers import biz_reports
app.include_router(biz_reports.router)
```

### Q1-4. Frontend API + 타입

**`frontend/src/lib/api.ts`** — 하단에 추가:

```typescript
// -- Biz Reports (영업보고) --
export const fetchBizReports = (params?: { company_id?: number; report_type?: string; status?: string }): Promise<BizReport[]> =>
  api.get('/biz-reports', { params }).then(r => r.data)
export const fetchBizReport = (id: number): Promise<BizReport> => api.get(`/biz-reports/${id}`).then(r => r.data)
export const createBizReport = (data: BizReportInput): Promise<BizReport> => api.post('/biz-reports', data).then(r => r.data)
export const updateBizReport = (id: number, data: Partial<BizReportInput>): Promise<BizReport> => api.put(`/biz-reports/${id}`, data).then(r => r.data)
export const deleteBizReport = (id: number) => api.delete(`/biz-reports/${id}`)

// Types 섹션에 추가:
export interface BizReportInput {
  company_id: number
  report_type: string
  period: string
  status?: string
  requested_date?: string | null
  received_date?: string | null
  reviewed_date?: string | null
  analyst_comment?: string | null
  revenue?: number | null
  operating_income?: number | null
  net_income?: number | null
  total_assets?: number | null
  total_liabilities?: number | null
  employees?: number | null
  memo?: string | null
}

export interface BizReport {
  id: number
  company_id: number
  report_type: string
  period: string
  status: string
  requested_date: string | null
  received_date: string | null
  reviewed_date: string | null
  analyst_comment: string | null
  revenue: number | null
  operating_income: number | null
  net_income: number | null
  total_assets: number | null
  total_liabilities: number | null
  employees: number | null
  memo: string | null
  created_at: string | null
  company_name: string | null
}
```

### Q1-5. Frontend 페이지

**`frontend/src/pages/BizReportsPage.tsx`** (신규):

기존 `TransactionsPage.tsx` 패턴을 참고하여 구현:

1. **상단**: 제목 "영업보고 관리" + 부제 "피투자사 정기/수시 경영현황 수집"
2. **필터**: 피투자사 드롭다운, 보고유형 드롭다운(전체/분기보고/월보고/일반보고), 상태 드롭다운(전체/요청전/요청중/수신/검수완료)
3. **신규 등록 폼** (토글): 피투자사 선택, 보고유형, 기간(period), 요청발송일, 비고
4. **테이블 컬럼**: 피투자사명, 유형, 기간, 상태(상태 뱃지 색상 적용), 요청일, 수신일, 검수일, 수정/삭제
5. **인라인 수정**: 행 클릭 시 상태 변경 + 재무 데이터 입력 가능
6. **상태 뱃지 색상**:
   - 요청전: `bg-slate-100 text-slate-600`
   - 요청중: `bg-yellow-100 text-yellow-700`
   - 수신: `bg-blue-100 text-blue-700`
   - 검수완료: `bg-green-100 text-green-700`
7. **재무 데이터 표시**: 행 확장 시 매출/영업이익/당기순이익/총자산/총부채/종업원수 + 심사역 의견
8. **모든 UI 텍스트는 한국어**

**라우트/네비게이션 추가**:
- `frontend/src/App.tsx`: `<Route path="/biz-reports" element={<BizReportsPage />} />`
- `frontend/src/components/Layout.tsx` NAV에 추가: `{ to: '/biz-reports', label: '영업보고', icon: FileText }` (lucide-react `FileText` import)
  - 위치: '투자 관리' 아래, '거래원장' 위

---

## Q2 - 보고·공시 관리

> **언어**: Python (Backend) + TypeScript (Frontend)
> **신규 파일**: `backend/models/regular_report.py`, `backend/schemas/regular_report.py`, `backend/routers/regular_reports.py`, `frontend/src/pages/ReportsPage.tsx`
> **수정 파일**: `backend/models/__init__.py`, `backend/main.py`, `frontend/src/App.tsx`, `frontend/src/components/Layout.tsx`, `frontend/src/lib/api.ts`
> **참조 문서**: `01_Requirements/business_overview.md` 섹션 G, `01_Requirements/data_structures.md` RegularReport 모델

### Q2-1. Backend 모델

**`backend/models/regular_report.py`** (신규):

```python
from sqlalchemy import Column, Integer, String, Date, Text, DateTime, ForeignKey, func
from database import Base


class RegularReport(Base):
    __tablename__ = "regular_reports"

    id = Column(Integer, primary_key=True, index=True)
    report_target = Column(String, nullable=False)        # 농금원 | VICS | LP | 내부보고회 | 홈택스
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=True)  # null이면 전체
    period = Column(String, nullable=False)                # "2026-01", "2026-H1", "2026"
    due_date = Column(Date, nullable=True)                 # 보고 마감일
    status = Column(String, default="미작성")              # 미작성 | 작성중 | 검수중 | 전송완료 | 실패
    submitted_date = Column(Date, nullable=True)           # 실제 전송일
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)  # 연결된 Task
    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
```

### Q2-2. Backend 스키마

**`backend/schemas/regular_report.py`** (신규):

```python
from pydantic import BaseModel


class RegularReportCreate(BaseModel):
    report_target: str               # 농금원 | VICS | LP | 내부보고회 | 홈택스
    fund_id: int | None = None
    period: str
    due_date: str | None = None
    status: str | None = "미작성"
    submitted_date: str | None = None
    task_id: int | None = None
    memo: str | None = None


class RegularReportUpdate(BaseModel):
    report_target: str | None = None
    fund_id: int | None = None
    period: str | None = None
    due_date: str | None = None
    status: str | None = None
    submitted_date: str | None = None
    task_id: int | None = None
    memo: str | None = None
```

### Q2-3. Backend 라우터

**`backend/routers/regular_reports.py`** (신규):

기존 `biz_reports.py` 라우터와 동일한 패턴으로 CRUD 구현:
- `GET /api/regular-reports` — 필터: report_target, fund_id, status, period
- `GET /api/regular-reports/{id}`
- `POST /api/regular-reports`
- `PUT /api/regular-reports/{id}`
- `DELETE /api/regular-reports/{id}`

응답에 `fund_name` (fund_id로 Fund 조회) 포함.
응답에 `days_remaining` (due_date 기준 잔여일) 포함:
```python
if report.due_date:
    from datetime import date
    days_remaining = (report.due_date - date.today()).days
else:
    days_remaining = None
```

**`backend/main.py`** — 라우터 등록

### Q2-4. Frontend API + 타입

**`frontend/src/lib/api.ts`** — 하단에 추가:

```typescript
// -- Regular Reports (보고·공시) --
export const fetchRegularReports = (params?: { report_target?: string; fund_id?: number; status?: string; period?: string }): Promise<RegularReport[]> =>
  api.get('/regular-reports', { params }).then(r => r.data)
export const createRegularReport = (data: RegularReportInput): Promise<RegularReport> => api.post('/regular-reports', data).then(r => r.data)
export const updateRegularReport = (id: number, data: Partial<RegularReportInput>): Promise<RegularReport> => api.put(`/regular-reports/${id}`, data).then(r => r.data)
export const deleteRegularReport = (id: number) => api.delete(`/regular-reports/${id}`)

export interface RegularReportInput {
  report_target: string
  fund_id?: number | null
  period: string
  due_date?: string | null
  status?: string
  submitted_date?: string | null
  task_id?: number | null
  memo?: string | null
}

export interface RegularReport {
  id: number
  report_target: string
  fund_id: number | null
  period: string
  due_date: string | null
  status: string
  submitted_date: string | null
  task_id: number | null
  memo: string | null
  created_at: string | null
  fund_name: string | null
  days_remaining: number | null
}
```

### Q2-5. Frontend 페이지

**`frontend/src/pages/ReportsPage.tsx`** (신규):

1. **상단**: 제목 "보고·공시 관리" + 부제 "농금원/VICS 월보고, LP보고, 내부보고회 관리"
2. **필터**: 보고대상 드롭다운(전체/농금원/VICS/LP/내부보고회/홈택스), 조합 드롭다운, 상태 드롭다운(전체/미작성/작성중/검수중/전송완료/실패)
3. **신규 등록 폼**: 보고대상, 조합(선택사항), 기간, 마감일, 비고
4. **테이블 컬럼**: 보고대상, 조합명, 기간, 마감일(잔여일 뱃지), 상태, 전송일, 수정/삭제
5. **마감일 뱃지**:
   - 잔여 3일 이내: `bg-red-100 text-red-700` + "D-N"
   - 잔여 7일 이내: `bg-yellow-100 text-yellow-700` + "D-N"
   - 초과: `bg-red-200 text-red-800` + "지연 D+N"
   - 전송완료: `bg-green-100 text-green-700` + "완료"
6. **상태 변경**: 인라인 드롭다운으로 상태 변경 가능
7. **모든 UI 텍스트는 한국어**

**보고대상 라벨**:
```typescript
const REPORT_TARGET_LABEL: Record<string, string> = {
  '농금원': '농금원',
  'VICS': '벤처협회 VICS',
  'LP': 'LP 보고',
  '내부보고회': '내부보고회',
  '홈택스': '홈택스',
}
```

**라우트/네비게이션 추가**:
- `frontend/src/App.tsx`: `<Route path="/reports" element={<ReportsPage />} />`
- `frontend/src/components/Layout.tsx` NAV에 추가: `{ to: '/reports', label: '보고·공시', icon: Send }` (lucide-react `Send` import)
  - 위치: '회수 관리' 아래, '체크리스트' 위

---

## Q3 - 회계 기초

> **언어**: Python (Backend) + TypeScript (Frontend)
> **신규 파일**: `backend/models/accounting.py`, `backend/schemas/accounting.py`, `backend/routers/accounting.py`, `frontend/src/pages/AccountingPage.tsx`
> **수정 파일**: `backend/models/__init__.py`, `backend/main.py`, `frontend/src/App.tsx`, `frontend/src/components/Layout.tsx`, `frontend/src/lib/api.ts`
> **참조 문서**: `01_Requirements/data_structures.md` Account, JournalEntry 모델

**설계 판단**: 1인 관리자가 실제 회계를 이 시스템에서 하지 않는다 (사내 ERP/회계법인 사용). 따라서 **간소화 버전**으로 구현한다:
- 계정과목(Account): 기본 시드만 제공, CRUD 지원
- 전표(JournalEntry): 수동 입력 + 조회만. 자동 생성은 Phase 5로 보류.

### Q3-1. Backend 모델

**`backend/models/accounting.py`** (신규):

```python
from sqlalchemy import Column, Integer, String, Date, Numeric, Text, DateTime, ForeignKey, func
from database import Base


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=True)  # null이면 공통
    code = Column(String, nullable=False)                  # 계정코드 ("101", "401")
    name = Column(String, nullable=False)                  # 계정명 ("현금", "투자주식")
    category = Column(String, nullable=False)              # 자산 | 부채 | 자본 | 수익 | 비용
    sub_category = Column(String, nullable=True)           # 유동자산, 고정자산 등
    normal_side = Column(String, nullable=True)            # 차변 | 대변
    is_active = Column(String, default="true")
    display_order = Column(Integer, default=0)


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True, index=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    entry_date = Column(Date, nullable=False)
    entry_type = Column(String, default="일반분개")        # 일반분개 | 자동전표
    description = Column(Text, nullable=True)              # 적요
    status = Column(String, default="미결재")              # 미결재 | 결재완료
    source_type = Column(String, nullable=True)            # manual | capital_call | transaction 등
    source_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class JournalEntryLine(Base):
    __tablename__ = "journal_entry_lines"

    id = Column(Integer, primary_key=True, index=True)
    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    debit = Column(Numeric, default=0)                     # 차변
    credit = Column(Numeric, default=0)                    # 대변
    memo = Column(String, nullable=True)
```

### Q3-2. Backend 시드 데이터

**`backend/seed/seed_accounts.py`** (신규):

기본 계정과목 시드:

```python
ACCOUNTS = [
    {"code": "101", "name": "현금", "category": "자산", "sub_category": "유동자산", "normal_side": "차변", "display_order": 1},
    {"code": "111", "name": "투자주식", "category": "자산", "sub_category": "투자자산", "normal_side": "차변", "display_order": 2},
    {"code": "112", "name": "투자사채", "category": "자산", "sub_category": "투자자산", "normal_side": "차변", "display_order": 3},
    {"code": "121", "name": "미수금", "category": "자산", "sub_category": "유동자산", "normal_side": "차변", "display_order": 4},
    {"code": "122", "name": "선급비용", "category": "자산", "sub_category": "유동자산", "normal_side": "차변", "display_order": 5},
    {"code": "201", "name": "미지급금", "category": "부채", "sub_category": "유동부채", "normal_side": "대변", "display_order": 10},
    {"code": "202", "name": "예수금", "category": "부채", "sub_category": "유동부채", "normal_side": "대변", "display_order": 11},
    {"code": "203", "name": "미지급보수", "category": "부채", "sub_category": "유동부채", "normal_side": "대변", "display_order": 12},
    {"code": "301", "name": "출자금", "category": "자본", "sub_category": "자본금", "normal_side": "대변", "display_order": 20},
    {"code": "302", "name": "이익잉여금", "category": "자본", "sub_category": "잉여금", "normal_side": "대변", "display_order": 21},
    {"code": "401", "name": "투자주식처분이익", "category": "수익", "sub_category": "투자수익", "normal_side": "대변", "display_order": 30},
    {"code": "402", "name": "이자수익", "category": "수익", "sub_category": "금융수익", "normal_side": "대변", "display_order": 31},
    {"code": "403", "name": "배당금수익", "category": "수익", "sub_category": "투자수익", "normal_side": "대변", "display_order": 32},
    {"code": "501", "name": "관리보수", "category": "비용", "sub_category": "보수비용", "normal_side": "차변", "display_order": 40},
    {"code": "502", "name": "업무수탁수수료", "category": "비용", "sub_category": "수수료", "normal_side": "차변", "display_order": 41},
    {"code": "509", "name": "기타비용", "category": "비용", "sub_category": "기타", "normal_side": "차변", "display_order": 49},
]
```

시드 함수는 `if db.query(Account).count() > 0: return` 패턴 사용.

### Q3-3. Backend 라우터

**`backend/routers/accounting.py`** (신규):

**계정과목 API**:
- `GET /api/accounts` — 필터: fund_id, category
- `POST /api/accounts`
- `PUT /api/accounts/{id}`
- `DELETE /api/accounts/{id}`

**전표 API**:
- `GET /api/journal-entries` — 필터: fund_id, entry_date_from, entry_date_to, status
- `GET /api/journal-entries/{id}` — lines 포함
- `POST /api/journal-entries` — body에 lines 배열 포함
- `PUT /api/journal-entries/{id}`
- `DELETE /api/journal-entries/{id}` — cascade로 lines 삭제

전표 응답에 `fund_name`, `lines`(각 line에 `account_name` 포함) 필드 포함.

**합계잔액 API**:
- `GET /api/accounts/trial-balance?fund_id=1&as_of_date=2026-01-31`
  - 각 계정별 차변합계/대변합계/잔액 반환

### Q3-4. Frontend 페이지

**`frontend/src/pages/AccountingPage.tsx`** (신규):

탭 구조: 계정과목 | 전표 입력 | 합계잔액

1. **계정과목 탭**: 카테고리별 그룹(자산/부채/자본/수익/비용) 테이블. 추가/수정/삭제
2. **전표 탭**: 전표 목록(조합별 필터) + 신규 전표 작성 폼
   - 전표 작성: 조합 선택, 회계일, 적요 입력 후 분개 라인 추가 (계정 드롭다운 + 차변/대변 금액)
   - 차변합계 = 대변합계 검증 (불일치 시 저장 버튼 비활성화)
3. **합계잔액 탭**: 조합 선택 + 기준일 → 계정별 차변합계/대변합계/잔액 테이블

**모든 UI 텍스트는 한국어**

**라우트/네비게이션 추가**:
- `frontend/src/App.tsx`: `<Route path="/accounting" element={<AccountingPage />} />`
- `frontend/src/components/Layout.tsx` NAV에 추가: `{ to: '/accounting', label: '회계 관리', icon: Calculator }` (lucide-react `Calculator` import)
  - 위치: '조합 운영' 아래, '회수 관리' 위

---

## Q4 - 의결권 행사

> **언어**: Python (Backend) + TypeScript (Frontend)
> **신규 파일**: `backend/models/vote_record.py`, `backend/schemas/vote_record.py`, `backend/routers/vote_records.py`
> **수정 파일**: `backend/models/__init__.py`, `backend/main.py`, `frontend/src/lib/api.ts`, `frontend/src/pages/InvestmentDetailPage.tsx`
> **참조 문서**: `01_Requirements/data_structures.md` VoteRecord 모델

### Q4-1. Backend 모델

**`backend/models/vote_record.py`** (신규):

```python
from sqlalchemy import Column, Integer, String, Date, Text, DateTime, ForeignKey, func
from database import Base


class VoteRecord(Base):
    __tablename__ = "vote_records"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("portfolio_companies.id"), nullable=False)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=True)
    vote_type = Column(String, nullable=False)             # 주주총회 | 이사회 | 서면결의
    date = Column(Date, nullable=False)
    agenda = Column(Text, nullable=True)                   # 안건
    decision = Column(String, nullable=True)               # 찬성 | 반대 | 기권 | 미행사
    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
```

### Q4-2. Backend 라우터

기존 패턴과 동일하게 CRUD:
- `GET /api/vote-records` — 필터: company_id, investment_id, vote_type
- `POST /api/vote-records`
- `PUT /api/vote-records/{id}`
- `DELETE /api/vote-records/{id}`

### Q4-3. Frontend 통합

별도 페이지를 만들지 않고, **`InvestmentDetailPage.tsx`에 "의결권 행사" 섹션 추가**:
- 해당 투자건의 의결권 행사 이력 테이블
- 추가/수정/삭제 인라인
- 의결 유형 라벨: `주주총회 | 이사회 | 서면결의`
- 의결 라벨: `찬성 | 반대 | 기권 | 미행사`

---

## Q5 - 대시보드 고도화

> **언어**: Python (Backend) + TypeScript (Frontend)
> **수정 파일**: `backend/routers/dashboard.py`, `frontend/src/pages/DashboardPage.tsx`

### Q5-1. 대시보드에 보고 마감 알림 추가

**`backend/routers/dashboard.py`** — `/api/dashboard/today` 응답에 추가:

```python
# upcoming_reports: 마감 7일 이내 보고 건 목록
upcoming_reports = (
    db.query(RegularReport)
    .filter(
        RegularReport.status.notin_(["전송완료"]),
        RegularReport.due_date != None,
        RegularReport.due_date <= date.today() + timedelta(days=7),
    )
    .order_by(RegularReport.due_date)
    .all()
)
```

**`frontend/src/pages/DashboardPage.tsx`** — 우측 사이드바에 "보고 마감" 카드 추가:
- 보고대상, 기간, 마감일(D-N 뱃지) 표시
- 클릭 시 `/reports` 이동

### Q5-2. 상단 요약 카드에 보고 건수 추가

현재 4개 요약 카드에 1개 추가 (5개):
- 기존: 오늘 작업, 이번 주, 진행중 워크플로우, 미수 서류
- **추가**: 보고 마감 (7일 이내 미전송 보고 건수)

---

## 작업 순서 & 의존성

### 의존성 관계

```
Q0 (한국어화)      → 독립. 가장 먼저 수행.
Q1 (영업보고)      → 독립. Q0 이후.
Q2 (보고·공시)     → 독립. Q1과 병렬 가능.
Q3 (회계 기초)     → 독립. Q1/Q2와 병렬 가능.
Q4 (의결권 행사)   → 독립. Q1/Q2/Q3과 병렬 가능.
Q5 (대시보드)      → Q2 완료 후 (보고 마감 데이터 필요).
```

### 권장 실행 순서

```
1. Q0-1 ~ Q0-5  (한국어화 — Layout NAV + 4개 페이지)
2. Q1-1 ~ Q1-5  (영업보고 — Backend + Frontend)
3. Q2-1 ~ Q2-5  (보고·공시 — Backend + Frontend)
4. Q3-1 ~ Q3-4  (회계 기초 — Backend 모델+시드+라우터 + Frontend)
5. Q4-1 ~ Q4-3  (의결권 행사 — Backend + InvestmentDetail 통합)
6. Q5-1 ~ Q5-2  (대시보드 고도화)
```

---

## labels.ts 추가 항목

`frontend/src/lib/labels.ts`의 `STATUS_LABEL`에 추가:

```typescript
// 영업보고 상태
'요청전': '요청전',
'요청중': '요청중',
'수신': '수신',
'검수완료': '검수완료',
// 보고·공시 상태
'미작성': '미작성',
'작성중': '작성중',
'검수중': '검수중',
'전송완료': '전송완료',
'실패': '실패',
// 회수위원회 상태
'수정중': '수정중',
'표결중': '표결중',
'가결': '가결',
'부결': '부결',
// 전표 상태
'미결재': '미결재',
'결재완료': '결재완료',
```

---

## CODEX 작업 규칙

1. **하나의 Q 항목 = 하나의 커밋**. 커밋 메시지는 `feat:`, `fix:`, `refactor:` prefix 사용
2. **기존 API 필드명(JSON key)은 영어 유지**. UI 표시 텍스트만 한국어로 변경
3. **외부 라이브러리 추가 금지**. 기존 의존성 범위 내에서 해결
4. **테스트 작성 불필요** (1인 프로젝트, MVP 단계)
5. **파일 생성 시** 기존 코드 스타일 준수:
   - Python: 함수형 라우터, snake_case, type hint 사용
   - TypeScript: 함수형 컴포넌트, arrow function export, Tailwind 유틸리티 클래스
6. **DB 스키마 변경 시** 기존 데이터 호환성 유지 (nullable + default 값)
7. **각 Q 항목 완료 후 빌드 검증**:
   - Frontend: `cd frontend && npm run build`
   - Backend: `cd backend && python -c "from main import app; print('OK')"`
8. **Python 파일**은 `backend/` 디렉토리 기준 상대 import 사용
9. **TypeScript 파일**은 `frontend/src/` 디렉토리 기준 상대 import 사용
10. **새 모델 추가 시** `backend/models/__init__.py`에 import 추가 필수
11. **새 라우터 추가 시** `backend/main.py`에 include_router 추가 필수
12. **새 페이지 추가 시** `App.tsx` Route + `Layout.tsx` NAV 동시 추가

---

## 파일 경로 참조

| 구분 | 경로 | 언어 |
|------|------|------|
| Backend 진입점 | `backend/main.py` | Python |
| DB 설정 | `backend/database.py` | Python |
| 모델 디렉토리 | `backend/models/*.py` | Python |
| 스키마 디렉토리 | `backend/schemas/*.py` | Python |
| 라우터 디렉토리 | `backend/routers/*.py` | Python |
| 서비스 | `backend/services/workflow_service.py` | Python |
| 시드 데이터 | `backend/seed/seed_*.py` | Python |
| Frontend 진입점 | `frontend/src/main.tsx` | TypeScript |
| 라우터 설정 | `frontend/src/App.tsx` | TypeScript |
| API 클라이언트 + 타입 | `frontend/src/lib/api.ts` | TypeScript |
| 라벨 유틸 | `frontend/src/lib/labels.ts` | TypeScript |
| Toast 브릿지 | `frontend/src/lib/toastBridge.ts` | TypeScript |
| Toast 컨텍스트 | `frontend/src/contexts/ToastContext.tsx` | TypeScript |
| 레이아웃 | `frontend/src/components/Layout.tsx` | TypeScript |
| 검색 모달 | `frontend/src/components/SearchModal.tsx` | TypeScript |
| 페이지 디렉토리 | `frontend/src/pages/*.tsx` | TypeScript |
| 업무 요구사항 | `01_Requirements/business_overview.md` | Markdown |
| 데이터 구조 | `01_Requirements/data_structures.md` | Markdown |
| 교훈 목록 | `04_Checklists/lessons_learned.md` | Markdown |

---

**작성자**: Claude Code (PM)
**작업 대상**: OpenAI CODEX
**마지막 업데이트**: 2026-02-13
