# VC ERP 개선 계획서 (CODEX 작업 명세서)

> 트리거투자파트너스 1인 백오피스 ERP 시스템 개선
> 작성일: 2026-02-13
> 대상 작업자: OpenAI CODEX
> PM: Claude Code

---

## 프로젝트 배경

본 시스템은 VC(벤처캐피탈) 1인 백오피스 담당자가 투자 프로세스, 조합 관리, 서류 추적, 일정 관리를 효율적으로 수행하기 위한 ERP이다. 현재 MVP 수준의 기본 CRUD가 구현되어 있으나, 실제 업무 효율성을 높이기 위한 **핵심 개선 사항**이 다수 존재한다.

### 기술 스택 & 환경

| 구분 | 기술 | 버전 | 비고 |
|------|------|------|------|
| **Backend 언어** | Python | 3.8+ | 모든 Backend 코드는 Python으로 작성 |
| **Backend 프레임워크** | FastAPI | 0.115+ | 비동기 ASGI, Uvicorn 서버 |
| **ORM** | SQLAlchemy | 2.0+ | DeclarativeBase 방식 |
| **DB** | SQLite | - | 파일: `backend/erp.db` |
| **스키마 검증** | Pydantic | 2.10+ | `model_validate` 방식 |
| **Frontend 언어** | TypeScript | 5.9 | strict mode |
| **Frontend 프레임워크** | React | 19.2 | 함수형 컴포넌트 only |
| **빌드 도구** | Vite | 7.3 | HMR, proxy 설정 포함 |
| **CSS** | Tailwind CSS | 4.1 | 유틸리티 클래스 방식 |
| **서버 상태 관리** | TanStack React Query | 5.90 | `useQuery`, `useMutation` |
| **HTTP 클라이언트** | Axios | 1.13 | `frontend/src/lib/api.ts`에 집중 |
| **라우팅** | React Router DOM | 7.13 | `<Routes>`, `<Route>` 방식 |
| **아이콘** | Lucide React | 0.563 | SVG 아이콘 라이브러리 |
| **패키지 매니저** | npm | - | `package.json` 기반 |

### 현재 구현 완료 모듈
1. Task Board (아이젠하워 매트릭스 Q1-Q4)
2. Workflow Templates & Instances (투심위/투자계약/투자후 서류)
3. Fund & LP 관리
4. Investment & Portfolio Company 관리
5. Work Log 추적
6. Checklist 관리
7. Calendar Event CRUD
8. Dashboard (일일 개요)
9. Document Status 조회

### 프로젝트 디렉토리 구조

```
ERP Project/
├── backend/                    # Python FastAPI 서버
│   ├── main.py                 # FastAPI 앱 진입점
│   ├── database.py             # SQLite 연결 설정
│   ├── requirements.txt        # Python 의존성
│   ├── models/                 # SQLAlchemy ORM 모델 (*.py)
│   ├── schemas/                # Pydantic 검증 스키마 (*.py)
│   ├── routers/                # API 엔드포인트 (*.py)
│   ├── services/               # 비즈니스 로직 (*.py)
│   └── seed/                   # DB 시드 데이터 (*.py)
├── frontend/                   # React + TypeScript 클라이언트
│   ├── src/
│   │   ├── main.tsx            # React 진입점
│   │   ├── App.tsx             # 라우터 설정
│   │   ├── components/         # 공용 컴포넌트 (*.tsx)
│   │   ├── lib/api.ts          # Axios API 클라이언트 + 타입 정의
│   │   └── pages/              # 페이지 컴포넌트 (*.tsx)
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── 01_Requirements/            # 업무 요구사항 문서 (*.md)
├── 02_Data/                    # 데이터 구조 문서 (*.md)
├── 03_Workflows/               # 업무 워크플로우 문서 (*.md)
├── 04_Checklists/              # 체크리스트 문서 (*.md)
└── docs/                       # 프로젝트 문서 (*.md)
```

---

## 목차

1. [P0 - 크리티컬 구조 개선](#p0---크리티컬-구조-개선)
2. [P1 - UX/기능 핵심 개선](#p1---ux기능-핵심-개선)
3. [P2 - 업무 자동화 강화](#p2---업무-자동화-강화)
4. [P3 - 데이터 무결성 & 안정성](#p3---데이터-무결성--안정성)
5. [P4 - UI 품질 개선](#p4---ui-품질-개선)
6. [작업 순서 & 의존성 맵](#작업-순서--의존성-맵)

---

## P0 - 크리티컬 구조 개선

### P0-1. 한국어 UI 전환

> **언어**: TypeScript (TSX)
> **대상 파일**: `frontend/src/` 내 모든 `.tsx` 파일 (10개)
> **변경 범위**: UI 표시 텍스트만 — API key, DB 값은 영어 유지

**문제**: 모든 UI가 영어로 되어 있으나, 사용자는 한국어 화자이며 업무 용어가 모두 한국어이다.

**작업 범위**:

| 파일 | 변경 내용 |
|------|-----------|
| `frontend/src/components/Layout.tsx` | NAV 라벨: Dashboard→대시보드, Task Board→업무 보드, Workflows→워크플로우, Work Logs→업무 기록, Funds→조합 관리, Investments→투자 관리, Checklists→체크리스트, Documents→서류 현황, Calendar→캘린더 |
| `frontend/src/pages/DashboardPage.tsx` | Today→오늘, Tomorrow→내일, This Week→이번 주, Upcoming→예정, Active Workflows→진행중 워크플로우, Fund Summary→조합 현황, Missing Documents→미수 서류, "No tasks"→"작업 없음", "Daily overview"→"일일 개요", "Loading..."→"불러오는 중..." |
| `frontend/src/pages/TaskBoardPage.tsx` | 컬럼 헤더: Q1→긴급&중요(Q1), Q2→중요&비긴급(Q2), Q3→긴급&비중요(Q3), Q4→비긴급&비중요(Q4). 버튼: Add→추가, Edit→수정, Delete→삭제, Complete→완료 |
| `frontend/src/pages/FundsPage.tsx` | Fund→조합, LP→출자자, commitment→약정금액, paid_in→납입금액, AUM→운용규모 |
| `frontend/src/pages/InvestmentsPage.tsx` | Investment→투자, Company→피투자사, shares→주식수, valuation→밸류에이션, instrument→투자수단 |
| `frontend/src/pages/WorkflowsPage.tsx` | Template→템플릿, Instance→실행건, Step→단계, Progress→진행률, Instantiate→실행 |
| `frontend/src/pages/WorkLogsPage.tsx` | Work Log→업무 기록, Category→카테고리, Estimated→예상, Actual→실제 |
| `frontend/src/pages/ChecklistsPage.tsx` | 모든 영어 라벨 한국어화 |
| `frontend/src/pages/DocumentsPage.tsx` | Document→서류, pending→미수, collected→수집완료 |
| `frontend/src/pages/CalendarPage.tsx` | Event→일정, Duration→소요시간, pending→예정, completed→완료 |

**status 매핑 (표시용 한국어 ↔ 실제 값 영어)**:
```typescript
// 각 페이지에서 status 표시 시 사용할 공통 매핑 (api.ts 또는 별도 constants 파일)
const STATUS_LABEL: Record<string, string> = {
  pending: '대기',
  in_progress: '진행중',
  completed: '완료',
  active: '운용중',
  closed: '청산',
  collected: '수집완료',
  archived: '보관',
}
```

**날짜 표시 변경**:
- `toLocaleDateString('en-US', ...)` → `toLocaleDateString('ko-KR', ...)` 또는 직접 `M/D` 형식

**주의사항**:
- API 필드명(JSON key)은 영어 유지 — UI 표시 텍스트만 변경
- status 값의 **표시**만 한국어로 매핑, DB/API 값은 영어 유지
- 이 작업은 **P4-1(대시보드 레이아웃 개선)보다 반드시 먼저** 완료. P4-1은 이미 한국어화된 텍스트 위에서 레이아웃만 변경

---

### P0-2. 프론트엔드 `any` 타입 제거

> **언어**: TypeScript
> **대상 파일**: `frontend/src/lib/api.ts`, `frontend/src/pages/*.tsx`
> **변경 범위**: 타입 정의 추가 + `any` → 구체적 타입으로 교체

**문제**: 프론트엔드 코드 전반에 `any` 타입이 사용되어 있어 타입 안전성이 없다.

**작업 내용**:

**Step 1 — `frontend/src/lib/api.ts` 하단 Types 섹션에 인터페이스 추가:**

```typescript
// ===== 추가할 타입 =====

// Dashboard 응답 전체
export interface DashboardResponse {
  date: string
  day_of_week: string
  today: { tasks: Task[]; total_estimated_time: string }
  tomorrow: { tasks: Task[]; total_estimated_time: string }
  this_week: Task[]
  upcoming: Task[]
  active_workflows: ActiveWorkflow[]
  fund_summary: FundSummary[]
  missing_documents: MissingDocument[]
}

export interface ActiveWorkflow {
  id: number
  name: string
  progress: string
  next_step: string | null
}

export interface FundSummary {
  id: number
  name: string
  type: string
  status: string
  commitment_total: number | null
  aum: number | null
  lp_count: number
  investment_count: number
}

export interface MissingDocument {
  id: number
  investment_id: number
  document_name: string
  document_type: string | null
  status: string
  company_name: string
  fund_name: string
}

// Calendar 이벤트 (API 응답용)
export interface CalendarEvent {
  id: number
  title: string
  date: string
  time: string | null
  duration: number | null
  description: string | null
  status: string
  task_id: number | null
}

// Document Status 조회 결과
export interface DocumentStatusItem {
  id: number
  investment_id: number
  document_name: string
  document_type: string | null
  status: string
  note: string | null
  company_name: string
  fund_name: string
}

// Fund (API 응답용)
export interface Fund {
  id: number
  name: string
  type: string
  formation_date: string | null
  status: string
  gp: string | null
  co_gp: string | null
  trustee: string | null
  commitment_total: number | null
  aum: number | null
  lps?: LP[]
}

export interface LP {
  id: number
  fund_id: number
  name: string
  type: string
  commitment: number | null
  paid_in: number | null
  contact: string | null
}

// Company (API 응답용)
export interface Company {
  id: number
  name: string
  business_number: string | null
  ceo: string | null
  address: string | null
  industry: string | null
  vics_registered: boolean
}

// WorkLog 입력
export interface WorkLogInput {
  date: string
  category: string
  title: string
  content?: string | null
  status?: string
  estimated_time?: string | null
  actual_time?: string | null
  task_id?: number | null
  details?: { content: string }[]
  lessons?: { content: string }[]
  follow_ups?: { content: string; target_date?: string | null }[]
}
```

**Step 2 — API 함수 리턴 타입 지정:**
```typescript
// api.ts 변경
export const fetchDashboard = (): Promise<DashboardResponse> => api.get('/dashboard/today').then(r => r.data)
export const fetchFunds = (): Promise<Fund[]> => api.get('/funds').then(r => r.data)
export const fetchCompanies = (): Promise<Company[]> => api.get('/companies').then(r => r.data)
export const fetchCalendarEvents = (...): Promise<CalendarEvent[]> => ...
export const fetchDocumentStatus = (...): Promise<DocumentStatusItem[]> => ...
export const createWorkLog = (data: WorkLogInput) => api.post('/worklogs', data).then(r => r.data)
export const updateWorkLog = (id: number, data: Partial<WorkLogInput>) => api.put(`/worklogs/${id}`, data).then(r => r.data)
```

**Step 3 — 각 페이지에서 `any` 제거:**

| 파일 | 변경 |
|------|------|
| `DashboardPage.tsx` | `data` → `data as DashboardResponse` 또는 `useQuery<DashboardResponse>`. `(wf: any)` → `(wf: ActiveWorkflow)`, `(fund: any)` → `(fund: FundSummary)`, `(doc: any)` → `(doc: MissingDocument)` |
| `CalendarPage.tsx` | `(event: any)` → `(event: CalendarEvent)` |
| `DocumentsPage.tsx` | `(fund: any)` → `(fund: Fund)`, `(company: any)` → `(company: Company)`, `(doc: any)` → `(doc: DocumentStatusItem)` |

---

### P0-3. FastAPI `on_event` deprecation 수정

> **언어**: Python
> **대상 파일**: `backend/main.py`
> **변경 범위**: 3줄 수정

**문제**: `backend/main.py:39`에서 `@app.on_event("startup")` 사용 중. FastAPI 최신 버전에서 deprecated.

**변경**:
```python
# === 변경 전 (main.py:39-41) ===
@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)

# === 변경 후 ===
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield

# app 생성부도 수정 (기존 line 18)
app = FastAPI(title="VC ERP API", version="0.2.0", lifespan=lifespan)
```

**확인 방법**: `uvicorn main:app --reload` 실행 후 `GET /api/health` 정상 응답 확인

---

## P1 - UX/기능 핵심 개선

### P1-1. 캘린더 페이지 월별 뷰 구현

> **언어**: TypeScript (TSX) + Tailwind CSS
> **대상 파일**: `frontend/src/pages/CalendarPage.tsx` (기존 파일 수정)
> **Backend 변경**: 없음 (기존 `GET /api/calendar-events?date_from=&date_to=` 활용)

**문제**: 현재 CalendarPage는 테이블 리스트뷰만 있음. 1인 관리자에게 월별 캘린더 뷰는 일정 파악의 핵심이다.

**작업 내용**:

1. **월별 그리드 캘린더 컴포넌트 구현** (CalendarPage.tsx 내 추가)
   - 7열(월~일) x 5~6행 그리드 → Tailwind: `grid grid-cols-7`
   - 각 날짜 셀에 해당일 이벤트 표시 (제목 + 색상 dot)
   - 현재 월 표시 + 이전/다음 월 네비게이션 버튼 (`< 2026년 2월 >`)
   - 오늘 날짜 하이라이트: `bg-blue-50 font-bold`

2. **뷰 전환 토글**: 리스트뷰 ↔ 캘린더뷰 전환 버튼
   ```tsx
   const [view, setView] = useState<'calendar' | 'list'>('calendar')
   ```

3. **이벤트 색상 코딩**:
   - pending(예정): `bg-blue-100 text-blue-700`
   - completed(완료): `bg-green-100 text-green-700`
   - 마감 임박(오늘/내일): `bg-red-100 text-red-700`

4. **날짜 셀 클릭 시**: 해당 날짜의 이벤트 목록 사이드 패널 또는 하단 표시 + 새 이벤트 추가 버튼

5. **API 호출**: `fetchCalendarEvents({ date_from: '2026-02-01', date_to: '2026-02-28' })`

**외부 라이브러리 사용 금지** — Tailwind CSS 그리드로 직접 구현.

**참고 구현 가이드**:
```tsx
// 월별 날짜 배열 생성 (월요일 시작)
function getMonthDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startOffset = (firstDay.getDay() + 6) % 7 // 월요일=0
  const days: (number | null)[] = []
  for (let i = 0; i < startOffset; i++) days.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d)
  return days
}

// 캘린더 그리드 구조
<div className="grid grid-cols-7 gap-px bg-slate-200">
  {['월','화','수','목','금','토','일'].map(d => (
    <div key={d} className="bg-slate-50 p-2 text-center text-xs font-medium text-slate-600">{d}</div>
  ))}
  {days.map((day, i) => (
    <div key={i} className={`bg-white p-2 min-h-[80px] ${day === todayDate ? 'bg-blue-50' : ''}`}>
      {day && <span className="text-sm">{day}</span>}
      {/* 해당 날짜 이벤트 dot 표시 */}
    </div>
  ))}
</div>
```

---

### P1-2. Task → Calendar 자동 연동

> **언어**: Python (Backend) + TypeScript (Frontend)
> **Backend 파일**: `backend/routers/tasks.py`, `backend/routers/calendar_events.py`
> **Frontend 파일**: `frontend/src/pages/CalendarPage.tsx`
> **의존**: P1-1 완료 후 프론트엔드 표시 작업 수행

**문제**: Task에 deadline이 있지만 CalendarPage에 자동 반영되지 않음. 두 곳에서 따로 관리해야 함.

**작업 내용**:

1. **`backend/routers/tasks.py` 수정** (Python):
   - `POST /api/tasks` — deadline이 있으면 `CalendarEvent` 자동 생성 (title 동일, date=deadline, task_id=task.id)
   - `PUT /api/tasks/{id}` — deadline 변경 시 연결된 `CalendarEvent.date` 업데이트. 없으면 신규 생성
   - `DELETE /api/tasks/{id}` — `CalendarEvent.task_id == id`인 이벤트 자동 삭제
   - CalendarEvent 생성 시 `from models.calendar_event import CalendarEvent` import 필요

2. **`backend/routers/calendar_events.py` 수정** (Python):
   - `GET /api/calendar-events` 응답에 `task_id`가 있으면 Task의 `quadrant` 정보도 포함:
     ```python
     if event.task_id:
         task = db.get(Task, event.task_id)
         result["quadrant"] = task.quadrant if task else None
     ```

3. **`frontend/src/pages/CalendarPage.tsx` 수정** (TypeScript):
   - Task 연동 이벤트: 왼쪽에 quadrant 뱃지 (Q1, Q2 등)
   - Task 연동 이벤트는 편집/삭제 버튼 숨김 (Task 쪽에서 관리)

---

### P1-3. Workflow 스텝 완료 시 다음 Task 자동 활성화

> **언어**: Python
> **대상 파일**: `backend/routers/workflows.py`, `backend/services/workflow_service.py`
> **Frontend 변경**: 없음

**문제**: 워크플로우 스텝 완료 시 다음 스텝의 Task가 자동으로 `in_progress`가 되지 않아 수동 관리가 필요하다.

**작업 내용**:

1. **`backend/routers/workflows.py`** — `complete_workflow_step` 엔드포인트:
   - 현재 스텝 완료 처리 후, 다음 순서(`order + 1`)의 `WorkflowStepInstance`를 조회
   - 다음 스텝의 `task_id`가 있으면 해당 Task의 `status`를 `"in_progress"`로 변경
   ```python
   # 다음 스텝 자동 활성화
   next_step = (
       db.query(WorkflowStepInstance)
       .filter(
           WorkflowStepInstance.instance_id == instance_id,
           WorkflowStepInstance.status == "pending"
       )
       .order_by(WorkflowStepInstance.id)
       .first()
   )
   if next_step and next_step.task_id:
       task = db.get(Task, next_step.task_id)
       if task:
           task.status = "in_progress"
   ```

2. **`backend/services/workflow_service.py`** — 주말 건너뛰기 로직 검증:
   - `timing_offset_days`에 따른 날짜 계산에서 주말(토/일) 건너뛰기 동작 확인
   - 공휴일은 미지원 → `# TODO: 공휴일 처리` 주석만 추가

---

### P1-4. 조합(Fund) 상세 페이지 분리

> **언어**: TypeScript (TSX)
> **신규 파일**: `frontend/src/pages/FundDetailPage.tsx`
> **수정 파일**: `frontend/src/App.tsx`, `frontend/src/pages/FundsPage.tsx`
> **Backend 변경**: 없음 (기존 API 활용)

**문제**: 현재 FundsPage에서 조합 목록과 상세가 같은 페이지에 혼재.

**작업 내용**:

1. **`frontend/src/App.tsx` 수정** — 라우트 추가:
   ```tsx
   import FundDetailPage from './pages/FundDetailPage'
   // <Route> 내부에 추가:
   <Route path="/funds/:id" element={<FundDetailPage />} />
   ```

2. **`frontend/src/pages/FundDetailPage.tsx` 신규 생성**:
   - `useParams`로 `id` 추출 → `fetchFund(id)` 호출
   - 조합 기본 정보 카드 (이름, 유형, 결성일, 상태, GP, Co-GP, 수탁사, 약정, AUM)
   - LP 목록 테이블: 이름, 유형, 약정금액, 납입금액, 연락처 + LP 추가/수정/삭제
   - 해당 조합의 투자 내역: `fetchInvestments({ fund_id: id })`
   - 해당 조합의 미수 서류: `fetchDocumentStatus({ fund_id: id })`
   - 뒤로가기 버튼 → `/funds`

3. **`frontend/src/pages/FundsPage.tsx` 수정**:
   - 조합 이름 클릭 → `navigate(`/funds/${fund.id}`)` (현재 inline 확장 방식 → 페이지 이동)

---

### P1-5. 투자 상세 페이지 분리

> **언어**: TypeScript (TSX)
> **신규 파일**: `frontend/src/pages/InvestmentDetailPage.tsx`
> **수정 파일**: `frontend/src/App.tsx`, `frontend/src/pages/InvestmentsPage.tsx`
> **Backend 변경**: 없음 (기존 API 활용)

**문제**: InvestmentsPage에서도 동일한 문제. 투자건별 상세 정보(서류 목록 포함)를 별도 페이지로 분리.

**작업 내용**:

1. **`frontend/src/App.tsx` 수정** — 라우트 추가:
   ```tsx
   import InvestmentDetailPage from './pages/InvestmentDetailPage'
   <Route path="/investments/:id" element={<InvestmentDetailPage />} />
   ```

2. **`frontend/src/pages/InvestmentDetailPage.tsx` 신규 생성**:
   - `useParams`로 `id` 추출 → `fetchInvestment(id)` 호출
   - 투자 기본 정보 카드: 조합명, 피투자사명, 투자일, 금액, 주식수, 단가, 밸류, 기여율, 투자수단, 상태
   - 첨부 서류 테이블: `fetchInvestmentDocuments(id)` → 이름, 유형, 상태, 메모 + CRUD
   - 서류 상태 변경 드롭다운: pending → collected → archived
   - 뒤로가기 버튼 → `/investments`

3. **`frontend/src/pages/InvestmentsPage.tsx` 수정**:
   - 투자건 행 클릭 → `navigate(`/investments/${inv.id}`)`

---

## P2 - 업무 자동화 강화

### P2-1. 조합 결성 워크플로우 시드 추가

> **언어**: Python
> **대상 파일**: `backend/seed/seed_workflows.py`
> **참조 문서**: `01_Requirements/business_overview.md` 섹션 2.1

**문제**: 시드에 투자 관련 3개 워크플로우만 있고, "조합 결성 프로세스" (11단계, ~1개월)가 없다.

**작업 내용** — `seed_workflows.py`의 워크플로우 리스트에 추가:

```python
{
    "name": "조합 결성",
    "trigger_description": "신규 조합 제안 시",
    "category": "조합관리",
    "total_duration": "약 1개월",
    "steps": [
        {"order": 1, "name": "고유번호증 발급 준비", "timing": "D-day", "timing_offset_days": 0, "estimated_time": "2h", "quadrant": "Q1"},
        {"order": 2, "name": "고유번호증 발급 신청", "timing": "D-day", "timing_offset_days": 0, "estimated_time": "1h", "quadrant": "Q1"},
        {"order": 3, "name": "수탁계약 서류 준비", "timing": "D+5", "timing_offset_days": 5, "estimated_time": "3h", "quadrant": "Q1"},
        {"order": 4, "name": "수탁계약 체결", "timing": "D+5", "timing_offset_days": 5, "estimated_time": "2h", "quadrant": "Q1"},
        {"order": 5, "name": "계좌개설", "timing": "D+5", "timing_offset_days": 5, "estimated_time": "1h", "quadrant": "Q1"},
        {"order": 6, "name": "결성총회 공문 발송", "timing": "D+10", "timing_offset_days": 10, "estimated_time": "1h", "quadrant": "Q2"},
        {"order": 7, "name": "LP 서류 취합", "timing": "D+10~24", "timing_offset_days": 10, "estimated_time": "4h", "quadrant": "Q1"},
        {"order": 8, "name": "운용지시서 작성", "timing": "D+24", "timing_offset_days": 24, "estimated_time": "1h", "quadrant": "Q1"},
        {"order": 9, "name": "결성총회 개최", "timing": "D+25", "timing_offset_days": 25, "estimated_time": "3h", "quadrant": "Q1"},
        {"order": 10, "name": "총회 회람서류 전달", "timing": "D+25", "timing_offset_days": 25, "estimated_time": "30m", "quadrant": "Q3"},
        {"order": 11, "name": "조합등록 신청", "timing": "D+26", "timing_offset_days": 26, "estimated_time": "2h", "quadrant": "Q1"},
    ],
    "documents": [
        {"name": "고유번호증", "required": True, "timing": "D-day"},
        {"name": "수탁계약서", "required": True, "timing": "D+5"},
        {"name": "계좌개설 확인서", "required": True, "timing": "D+5"},
        {"name": "결성총회 공문", "required": True, "timing": "D+10"},
        {"name": "LP 출자확약서", "required": True, "timing": "D+10~24"},
        {"name": "LP 서류 (KYC 등)", "required": True, "timing": "D+10~24"},
        {"name": "운용지시서", "required": True, "timing": "D+24"},
        {"name": "결성총회 의사록", "required": True, "timing": "D+25"},
        {"name": "조합등록 신청서", "required": True, "timing": "D+26"},
    ],
    "warnings": [
        {"content": "고유번호증 발급은 세무서 방문 필요 (온라인 불가한 경우 있음)"},
        {"content": "LP 서류 취합 기간이 길어질 수 있으므로 조기 안내 필요"},
        {"content": "결성총회 7일 전 소집통지 발송 필수 (규약 확인)"},
    ],
}
```

---

### P2-2. 정기 총회 워크플로우 시드 추가

> **언어**: Python
> **대상 파일**: `backend/seed/seed_workflows.py`
> **참조 문서**: `01_Requirements/business_overview.md` 섹션 2.2

**작업 내용** — `seed_workflows.py`에 추가:

```python
{
    "name": "정기 총회",
    "trigger_description": "매년 3월 정기 총회 개최 시",
    "category": "조합관리",
    "total_duration": "약 3주",
    "steps": [
        {"order": 1, "name": "총회 서류 초안 작성", "timing": "D-14", "timing_offset_days": -14, "estimated_time": "4h", "quadrant": "Q2",
         "memo": "개최공문, 의안설명서, 영업보고서, 감사보고서"},
        {"order": 2, "name": "총회 소집 통지 발송", "timing": "D-7", "timing_offset_days": -7, "estimated_time": "1h", "quadrant": "Q1"},
        {"order": 3, "name": "총회 개최", "timing": "D-day", "timing_offset_days": 0, "estimated_time": "3h", "quadrant": "Q1"},
        {"order": 4, "name": "의사록 작성", "timing": "D+2", "timing_offset_days": 2, "estimated_time": "2h", "quadrant": "Q1"},
    ],
    "documents": [
        {"name": "개최공문", "required": True, "timing": "D-14"},
        {"name": "의안설명서", "required": True, "timing": "D-14"},
        {"name": "영업보고서", "required": True, "timing": "D-14"},
        {"name": "감사보고서", "required": True, "timing": "D-14"},
        {"name": "소집 통지서", "required": True, "timing": "D-7"},
        {"name": "의사록", "required": True, "timing": "D+2"},
    ],
    "warnings": [
        {"content": "소집통지는 총회 7일 전 필수 발송"},
        {"content": "감사보고서는 회계법인 최종 확인 후 첨부"},
    ],
}
```

---

### P2-3. 월보고 자동 리마인더 Task 생성

> **언어**: Python (Backend) + TypeScript (Frontend)
> **Backend 파일**: `backend/routers/tasks.py`, `backend/routers/dashboard.py`
> **Frontend 파일**: `frontend/src/pages/DashboardPage.tsx`, `frontend/src/lib/api.ts`

**문제**: 농금원(매월 5일), 벤처협회 VICS(매월 5일) 월보고가 매달 반복되지만, 수동으로 Task를 만들어야 한다.

**작업 내용**:

1. **`backend/routers/tasks.py`** (Python) — 신규 엔드포인트 추가:
   ```python
   @router.post("/api/tasks/generate-monthly-reminders")
   def generate_monthly_reminders(year_month: str, db: Session = Depends(get_db)):
       """
       year_month: "2026-03" 형식
       농금원 + VICS 월보고 Task 2건 자동 생성
       이미 동일 제목 Task 존재 시 skip
       """
   ```
   - "농금원 월보고 (2026-03)" — deadline: 해당월 5일, quadrant: Q1, estimated_time: "2h"
   - "벤처협회 VICS 월보고 (2026-03)" — deadline: 해당월 5일, quadrant: Q1, estimated_time: "2h"

2. **`backend/routers/dashboard.py`** (Python) — 응답에 필드 추가:
   - `/api/dashboard/today` 응답에 `monthly_reminder: bool` 추가
   - 현재 월 월보고 Task가 없으면 `True`

3. **`frontend/src/lib/api.ts`** (TypeScript) — 함수 추가:
   ```typescript
   export const generateMonthlyReminders = (yearMonth: string) =>
     api.post('/tasks/generate-monthly-reminders', null, { params: { year_month: yearMonth } }).then(r => r.data)
   ```

4. **`frontend/src/pages/DashboardPage.tsx`** (TypeScript) — 알림 배너:
   - `monthly_reminder === true`이면 상단에:
     ```
     "이번 달 월보고 Task가 아직 등록되지 않았습니다. [등록하기]"
     ```
   - 클릭 시 `generateMonthlyReminders` 호출 후 대시보드 새로고침

---

### P2-4. 교훈(Lessons Learned) 워크플로우 연동

> **언어**: Python (Backend 모델 + 시드) + TypeScript (Frontend)
> **Backend 파일**: `backend/models/workflow.py`, `backend/schemas/workflow.py`, `backend/seed/seed_workflows.py`
> **Frontend 파일**: `frontend/src/pages/WorkflowsPage.tsx`

**문제**: `04_Checklists/lessons_learned.md`에 12개 항목의 실무 교훈이 있지만, 워크플로우 실행 시 관련 교훈이 표시되지 않는다.

**작업 내용**:

1. **`backend/models/workflow.py`** (Python) — `WorkflowWarning` 모델에 컬럼 추가:
   ```python
   category = Column(String, nullable=True, default="warning")  # "warning" | "lesson" | "tip"
   ```

2. **`backend/schemas/workflow.py`** (Python) — 스키마에 `category` 필드 추가

3. **`backend/seed/seed_workflows.py`** (Python) — 기존 워크플로우 warnings에 교훈 추가:
   - "투자계약 체결" → `{"content": "간인 순서: 조합 인감 → 피투자사 → 이해관계인", "category": "lesson"}`
   - "투자 후 서류처리" → `{"content": "바이블 제작 시 서류 누락 방지 - 투자 당일 서류 취합 리스트 사전 확인", "category": "lesson"}`
   - "투자 후 서류처리" → `{"content": "등기부등본 확인 후 주식 수와 계약서 일치 여부 반드시 검증", "category": "lesson"}`

4. **`frontend/src/pages/WorkflowsPage.tsx`** (TypeScript) — 워크플로우 상세에서 아이콘 구분:
   ```tsx
   {warning.category === 'lesson' ? '💡' : '⚠️'} {warning.content}
   ```

---

## P3 - 데이터 무결성 & 안정성

### P3-1. Backend 입력 유효성 검증 강화

> **언어**: Python
> **대상 파일**: `backend/schemas/task.py`, `backend/schemas/fund.py`, `backend/schemas/investment.py`, `backend/schemas/calendar_event.py`

**문제**: Pydantic 스키마에 최소한의 검증만 있고, 비즈니스 규칙 검증이 부족하다.

**작업 내용**:

| 스키마 파일 | 추가 검증 |
|-------------|-----------|
| `schemas/task.py` | `quadrant: Literal["Q1","Q2","Q3","Q4"]`. `estimated_time`: `field_validator`로 정규식 패턴 검증 (`^\d+[hdm]$` 또는 `^\d+h\s?\d+m$`). `status: Literal["pending","in_progress","completed"]` |
| `schemas/fund.py` | `type: Literal["투자조합","고유계정","농모태"]` (또는 자유 입력 유지하되 비어있으면 거부). `commitment_total: float | None = Field(default=None, ge=0)`. `aum: float | None = Field(default=None, ge=0)` |
| `schemas/investment.py` | `amount: float | None = Field(default=None, ge=0)`. `shares: int | None = Field(default=None, ge=0)`. `share_price: float | None = Field(default=None, ge=0)`. `status: Literal["active","exited","written_off"]` |
| `schemas/calendar_event.py` | `duration: int | None = Field(default=None, ge=0)`. `status: Literal["pending","completed"]` |

**Pydantic import 예시**:
```python
from typing import Literal
from pydantic import BaseModel, Field, field_validator
```

---

### P3-2. API 에러 응답 일관성 + Frontend 에러 인터셉터

> **언어**: Python (Backend) + TypeScript (Frontend)
> **Backend 파일**: `backend/main.py`, `backend/routers/*.py` (전체)
> **Frontend 파일**: `frontend/src/lib/api.ts`
> **주의**: 이 항목의 Frontend 에러 인터셉터는 **P4-4(Toast 시스템) 구현 후** Toast와 통합해야 함. P4-4 이전에는 인터셉터만 추가하고 `console.error`로 출력.

**문제**: 라우터마다 에러 처리 방식이 다르고, 404/400 응답 형식이 일관되지 않다.

**작업 내용**:

1. **`backend/main.py`** (Python) — 공통 예외 핸들러:
   ```python
   from fastapi.responses import JSONResponse
   from fastapi.exceptions import RequestValidationError

   @app.exception_handler(RequestValidationError)
   async def validation_exception_handler(request, exc):
       return JSONResponse(
           status_code=422,
           content={"detail": "입력값 검증 실패", "errors": str(exc.errors())}
       )
   ```

2. **각 `backend/routers/*.py`** (Python) — 404 응답 일관화:
   - 모든 라우터에서 `db.get(Model, id)` 결과 None일 때:
   ```python
   if not fund:
       raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")
   ```

3. **`frontend/src/lib/api.ts`** (TypeScript) — Axios 에러 인터셉터:
   ```typescript
   api.interceptors.response.use(
     response => response,
     error => {
       const message = error.response?.data?.detail || '오류가 발생했습니다.'
       return Promise.reject(new Error(message))
     }
   )
   ```
   - P4-4 Toast 구현 후에는 이 인터셉터에서 `addToast('error', message)` 호출 추가 가능

---

### P3-3. DB 마이그레이션 체계 구축 (Alembic)

> **언어**: Python + INI (설정파일)
> **신규 파일**: `backend/alembic.ini`, `backend/migrations/` 디렉토리
> **수정 파일**: `backend/requirements.txt`, `backend/main.py`
> **신규 의존성**: `alembic>=1.13`

**문제**: 현재 `Base.metadata.create_all()`로 테이블 생성만 하고 있어, 스키마 변경 시 기존 데이터가 유실될 수 있다.

**작업 내용**:

1. **`backend/requirements.txt`** 에 추가: `alembic>=1.13`

2. **`backend/` 디렉토리에서 Alembic 초기화**:
   ```bash
   cd backend
   alembic init migrations
   ```

3. **`backend/alembic.ini`** — `sqlalchemy.url` 설정:
   ```ini
   sqlalchemy.url = sqlite:///%(here)s/erp.db
   ```

4. **`backend/migrations/env.py`** — metadata 연결:
   ```python
   from database import Base
   target_metadata = Base.metadata
   ```

5. **초기 마이그레이션 생성**:
   ```bash
   alembic revision --autogenerate -m "initial schema"
   ```

6. **`backend/main.py`** — `create_all` 조건부 유지 (개발 편의):
   ```python
   import os
   if os.getenv("AUTO_CREATE_TABLES", "true").lower() == "true":
       Base.metadata.create_all(bind=engine)
   ```

---

## P4 - UI 품질 개선

### P4-1. 대시보드 레이아웃 개선

> **언어**: TypeScript (TSX) + Tailwind CSS
> **대상 파일**: `frontend/src/pages/DashboardPage.tsx`
> **의존**: P0-1(한국어화) 완료 후 수행. 이미 한국어화된 텍스트 위에서 레이아웃만 변경.

**문제**: 현재 대시보드가 단순 카드 나열 형태로, 정보 계층이 부족하다.

**작업 내용**:

1. **상단 요약 카드 4개** (기존 코드 위에 추가):
   ```tsx
   <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
     <StatCard icon={<AlertTriangle />} label="오늘 작업" value={today.tasks.length} color="red" />
     <StatCard icon={<Clock />} label="이번 주" value={this_week.length} color="blue" />
     <StatCard icon={<ArrowRight />} label="진행중 워크플로우" value={active_workflows.length} color="indigo" />
     <StatCard icon={<FileWarning />} label="미수 서류" value={missing_documents.length} color="amber" />
   </div>
   ```

2. **메인 콘텐츠 2/3 + 1/3 분할**:
   ```tsx
   <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
     <div className="lg:col-span-2 space-y-6">
       {/* 오늘 → 내일 → 이번 주 */}
     </div>
     <div className="space-y-6">
       {/* 조합 현황 + 미수 서류 */}
     </div>
   </div>
   ```

3. **지연 Task 표시** — TaskCard 컴포넌트에서:
   ```tsx
   const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'completed'
   // isOverdue이면: bg-red-50 border-red-300 + "지연" 뱃지
   ```

---

### P4-2. Task Board 드래그 앤 드롭

> **언어**: TypeScript (TSX)
> **대상 파일**: `frontend/src/pages/TaskBoardPage.tsx`
> **Backend 변경**: 없음 (기존 `PATCH /api/tasks/{id}/move` 활용)

**문제**: 실제 드래그 앤 드롭이 구현되지 않았다.

**작업 내용** — HTML5 Drag and Drop API 사용 (외부 라이브러리 없이):

```tsx
// 1. Task 카드에 drag 속성
<div
  draggable
  onDragStart={(e) => {
    e.dataTransfer.setData('taskId', String(task.id))
    e.dataTransfer.setData('fromQuadrant', task.quadrant)
  }}
  className="cursor-grab active:cursor-grabbing"
>

// 2. Quadrant 컬럼에 drop 핸들러
const [dragOver, setDragOver] = useState(false)

<div
  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
  onDragLeave={() => setDragOver(false)}
  onDrop={(e) => {
    e.preventDefault()
    setDragOver(false)
    const taskId = Number(e.dataTransfer.getData('taskId'))
    const from = e.dataTransfer.getData('fromQuadrant')
    if (from !== quadrant) {
      moveTaskMut.mutate({ id: taskId, quadrant })
    }
  }}
  className={dragOver ? 'border-2 border-dashed border-blue-300' : ''}
>
```

---

### P4-3. 반응형 사이드바 (모바일 대응)

> **언어**: TypeScript (TSX) + Tailwind CSS
> **대상 파일**: `frontend/src/components/Layout.tsx`

**문제**: 사이드바가 고정 `w-56`으로, 모바일에서 화면을 차지한다.

**작업 내용**:

```tsx
import { useState } from 'react'
import { Menu, X } from 'lucide-react'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen">
      {/* 모바일 오버레이 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 사이드바 */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-56 bg-slate-900 text-white
        flex flex-col shrink-0 transform transition-transform duration-200
        md:relative md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">VC ERP</h1>
            <p className="text-xs text-slate-400 mt-0.5">Trigger Investment Partners</p>
          </div>
          <button className="md:hidden text-slate-400" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 py-3 overflow-auto">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={() => setSidebarOpen(false)} ...>
              ...
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 flex flex-col">
        <header className="md:hidden flex items-center px-4 py-3 border-b border-slate-200">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <span className="ml-3 font-semibold text-slate-800">VC ERP</span>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

---

### P4-4. Toast 알림 시스템

> **언어**: TypeScript (TSX)
> **신규 파일**: `frontend/src/components/Toast.tsx`, `frontend/src/contexts/ToastContext.tsx`
> **수정 파일**: `frontend/src/main.tsx`, 모든 `frontend/src/pages/*.tsx`
> **주의**: P3-2의 에러 인터셉터와 통합 고려. Toast 구현 후 인터셉터에서 자동으로 에러 Toast 표시 가능.

**문제**: CRUD 작업 성공/실패 시 사용자에게 피드백이 없다.

**작업 내용**:

1. **`frontend/src/contexts/ToastContext.tsx`** (신규):
   ```typescript
   import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

   interface ToastItem {
     id: string
     type: 'success' | 'error' | 'info'
     message: string
   }

   interface ToastContextType {
     toasts: ToastItem[]
     addToast: (type: ToastItem['type'], message: string) => void
     removeToast: (id: string) => void
   }

   const ToastContext = createContext<ToastContextType | null>(null)

   export function ToastProvider({ children }: { children: ReactNode }) {
     const [toasts, setToasts] = useState<ToastItem[]>([])

     const addToast = useCallback((type: ToastItem['type'], message: string) => {
       const id = crypto.randomUUID()
       setToasts(prev => [...prev, { id, type, message }])
       setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
     }, [])

     const removeToast = useCallback((id: string) => {
       setToasts(prev => prev.filter(t => t.id !== id))
     }, [])

     return (
       <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
         {children}
       </ToastContext.Provider>
     )
   }

   export const useToast = () => {
     const ctx = useContext(ToastContext)
     if (!ctx) throw new Error('useToast must be used within ToastProvider')
     return ctx
   }
   ```

2. **`frontend/src/components/Toast.tsx`** (신규):
   ```tsx
   import { useToast } from '../contexts/ToastContext'
   import { X } from 'lucide-react'

   const COLORS = {
     success: 'bg-green-50 border-green-300 text-green-800',
     error: 'bg-red-50 border-red-300 text-red-800',
     info: 'bg-blue-50 border-blue-300 text-blue-800',
   }

   export default function ToastContainer() {
     const { toasts, removeToast } = useToast()
     return (
       <div className="fixed top-4 right-4 z-[100] space-y-2">
         {toasts.map(toast => (
           <div key={toast.id} className={`flex items-center gap-2 px-4 py-2 rounded-lg border shadow-sm text-sm ${COLORS[toast.type]}`}>
             <span>{toast.message}</span>
             <button onClick={() => removeToast(toast.id)}><X size={14} /></button>
           </div>
         ))}
       </div>
     )
   }
   ```

3. **`frontend/src/main.tsx`** — Provider 감싸기:
   ```tsx
   import { ToastProvider } from './contexts/ToastContext'
   import ToastContainer from './components/Toast'

   // <BrowserRouter> 내부:
   <ToastProvider>
     <App />
     <ToastContainer />
   </ToastProvider>
   ```

4. **각 페이지 mutation에 toast 연동** — 예시 (`TaskBoardPage.tsx`):
   ```typescript
   const { addToast } = useToast()
   const createMut = useMutation({
     mutationFn: createTask,
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['tasks'] })
       addToast('success', '작업이 생성되었습니다.')
     },
     onError: (err: Error) => addToast('error', err.message),
   })
   ```

5. **P3-2 에러 인터셉터와 통합 (선택)**:
   - Toast 시스템 구현 후, `api.ts` 인터셉터에서 전역 에러 Toast를 표시하려면 ToastContext 외부에서 접근 필요
   - 방법: `api.ts`에 `let globalAddToast` 변수를 두고, `main.tsx`에서 `useToast().addToast`를 전달
   - 또는 각 페이지의 `onError`에서 개별 처리 (권장 — 더 단순)

---

## 작업 순서 & 의존성 맵

### 의존성 관계

```
P0-3 (FastAPI lifespan)     → 독립. 가장 먼저 수행.
P0-2 (any 타입 제거)        → 독립. P0-3 이후 수행.
P3-1 (입력 검증)            → 독립. P0-2와 병렬 가능.
P3-2 (에러 응답)            → P4-4(Toast) 전에 Backend만 먼저. Frontend 인터셉터는 P4-4 후.
P0-1 (한국어화)             → 독립. 단, P4-1보다 반드시 먼저.
P4-4 (Toast)                → P3-2 Backend 완료 후. P0-1 후 (toast 메시지가 한국어)
P4-1 (대시보드 레이아웃)     → P0-1 완료 후 (한국어 텍스트 기반 레이아웃)
P1-1 (캘린더 월별 뷰)       → P0-1 완료 후 (한국어 요일 헤더)
P1-2 (Task→Calendar 연동)   → P1-1 완료 후 (캘린더 뷰에서 연동 표시)
P1-4 (Fund 상세 페이지)     → P0-1 완료 후
P1-5 (Investment 상세)      → P0-1 완료 후. P1-4와 병렬 가능.
P1-3 (Workflow 스텝 활성화)  → 독립.
P2-1, P2-2 (시드 추가)      → 독립. 병렬 가능.
P2-3 (월보고 리마인더)       → P0-1 완료 후 (한국어 배너 메시지)
P2-4 (교훈 연동)            → P0-1 완료 후
P4-2 (드래그 앤 드롭)        → P0-1 완료 후
P4-3 (반응형 사이드바)       → P0-1 완료 후 (한국어 NAV 반영)
P3-3 (Alembic)              → 모든 스키마 변경 완료 후 마지막에
```

### 권장 실행 순서

```
Phase 1 — 구조 안정화 (Backend 우선):
  1. P0-3  (Python — main.py lifespan 수정)
  2. P3-1  (Python — schemas 검증 강화)
  3. P3-2  (Python — 에러 응답 일관화, Backend only)
  4. P0-2  (TypeScript — any 타입 제거)

Phase 2 — 한국어화:
  5. P0-1  (TypeScript — 전체 UI 한국어 전환)

Phase 3 — Toast + 에러 통합:
  6. P4-4  (TypeScript — Toast 시스템 신규 생성)
  7. P3-2  (TypeScript — Frontend 에러 인터셉터 추가, Toast 연동)

Phase 4 — 핵심 기능:
  8. P1-1  (TypeScript — 캘린더 월별 뷰)
  9. P1-2  (Python + TypeScript — Task↔Calendar 연동)
  10. P1-4 (TypeScript — Fund 상세 페이지)
  11. P1-5 (TypeScript — Investment 상세 페이지)
  12. P1-3 (Python — Workflow 스텝 자동 활성화)

Phase 5 — 자동화:
  13. P2-1 (Python — 조합 결성 워크플로우 시드)
  14. P2-2 (Python — 정기 총회 워크플로우 시드)
  15. P2-3 (Python + TypeScript — 월보고 리마인더)
  16. P2-4 (Python + TypeScript — 교훈 연동)

Phase 6 — UI 마무리:
  17. P4-1 (TypeScript — 대시보드 레이아웃 개선)
  18. P4-2 (TypeScript — 드래그 앤 드롭)
  19. P4-3 (TypeScript — 반응형 사이드바)

Phase 7 — 안정화:
  20. P3-3 (Python — Alembic 마이그레이션 도입)
```

---

## 작업 규칙 (CODEX 준수 사항)

1. **하나의 P 항목 = 하나의 커밋**. 커밋 메시지는 `fix:`, `feat:`, `refactor:` prefix 사용
2. **기존 API 필드명(JSON key)은 영어 유지**. UI 표시 텍스트만 한국어로 변경
3. **외부 라이브러리 최소화**. Alembic 외에는 기존 의존성 내에서 해결
4. **테스트 작성 불필요** (1인 프로젝트, MVP 단계)
5. **파일 생성 시** 기존 코드 스타일 준수:
   - Python: 함수형 라우터, snake_case, type hint 사용
   - TypeScript: 함수형 컴포넌트, arrow function export, Tailwind 유틸리티 클래스
6. **DB 스키마 변경 시** 기존 데이터 호환성 유지 (nullable + default 값으로 추가)
7. **각 Phase 완료 후 빌드 검증**:
   - Frontend: `cd frontend && npm run build`
   - Backend: `cd backend && python -c "from main import app; print('OK')"`
8. **Python 파일**은 `backend/` 디렉토리 기준 상대 import 사용 (`from models.task import Task`)
9. **TypeScript 파일**은 `frontend/src/` 디렉토리 기준 상대 import 사용 (`from '../lib/api'`)

---

## 파일 경로 참조

| 구분 | 경로 | 언어 |
|------|------|------|
| Backend 진입점 | `backend/main.py` | Python |
| DB 설정 | `backend/database.py` | Python |
| 모델 디렉토리 | `backend/models/*.py` | Python |
| 스키마 디렉토리 | `backend/schemas/*.py` | Python |
| 라우터 디렉토리 | `backend/routers/*.py` | Python |
| 서비스 | `backend/services/*.py` | Python |
| 시드 데이터 | `backend/seed/seed_workflows.py` | Python |
| 의존성 | `backend/requirements.txt` | pip |
| Frontend 진입점 | `frontend/src/main.tsx` | TypeScript/TSX |
| 라우터 설정 | `frontend/src/App.tsx` | TypeScript/TSX |
| API 클라이언트 + 타입 | `frontend/src/lib/api.ts` | TypeScript |
| 레이아웃 | `frontend/src/components/Layout.tsx` | TypeScript/TSX |
| 페이지 디렉토리 | `frontend/src/pages/*.tsx` | TypeScript/TSX |
| 의존성 | `frontend/package.json` | npm |
| 빌드 설정 | `frontend/vite.config.ts` | TypeScript |
| 업무 요구사항 | `01_Requirements/business_overview.md` | Markdown |
| 교훈 목록 | `04_Checklists/lessons_learned.md` | Markdown |

---

**작성자**: Claude Code (PM)
**작업 대상**: OpenAI CODEX
**마지막 업데이트**: 2026-02-13
