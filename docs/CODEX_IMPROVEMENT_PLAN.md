# VC ERP 개선 계획서 (CODEX 작업 명세서)

> 트리거투자파트너스 1인 백오피스 ERP 시스템 개선
> 작성일: 2026-02-13
> 대상 작업자: OpenAI CODEX
> PM: Claude Code

---

## 프로젝트 배경

본 시스템은 VC(벤처캐피탈) 1인 백오피스 담당자가 투자 프로세스, 조합 관리, 서류 추적, 일정 관리를 효율적으로 수행하기 위한 ERP이다. 현재 MVP 수준의 기본 CRUD가 구현되어 있으나, 실제 업무 효율성을 높이기 위한 **핵심 개선 사항**이 다수 존재한다.

### 기술 스택
- **Backend**: Python FastAPI + SQLAlchemy + SQLite (`backend/`)
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + TanStack React Query (`frontend/`)
- **DB 파일**: `backend/erp.db`

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

---

## 목차

1. [P0 - 크리티컬 구조 개선](#p0---크리티컬-구조-개선)
2. [P1 - UX/기능 핵심 개선](#p1---ux기능-핵심-개선)
3. [P2 - 업무 자동화 강화](#p2---업무-자동화-강화)
4. [P3 - 데이터 무결성 & 안정성](#p3---데이터-무결성--안정성)
5. [P4 - UI 품질 개선](#p4---ui-품질-개선)

---

## P0 - 크리티컬 구조 개선

### P0-1. 한국어 UI 전환

**문제**: 모든 UI가 영어로 되어 있으나, 사용자는 한국어 화자이며 업무 용어가 모두 한국어이다. "Investment Committee" 대신 "투심위", "Fund" 대신 "조합"으로 표시해야 직관적이다.

**작업 범위**:

| 파일 | 변경 내용 |
|------|-----------|
| `frontend/src/components/Layout.tsx` | NAV 라벨 한국어화: Dashboard→대시보드, Task Board→업무 보드, Workflows→워크플로우, Work Logs→업무 기록, Funds→조합 관리, Investments→투자 관리, Checklists→체크리스트, Documents→서류 현황, Calendar→캘린더 |
| `frontend/src/pages/DashboardPage.tsx` | 섹션 제목: Today→오늘, Tomorrow→내일, This Week→이번 주, Upcoming→예정, Active Workflows→진행중 워크플로우, Fund Summary→조합 현황, Missing Documents→미수 서류, "No tasks"→"작업 없음", "Daily overview"→"일일 개요", "Loading..."→"불러오는 중..." |
| `frontend/src/pages/TaskBoardPage.tsx` | Q1→긴급&중요, Q2→중요&비긴급, Q3→긴급&비중요, Q4→비긴급&비중요. 버튼: Add→추가, Edit→수정, Delete→삭제, Complete→완료 |
| `frontend/src/pages/FundsPage.tsx` | Fund→조합, LP→출자자, commitment→약정금액, paid_in→납입금액, AUM→운용규모 |
| `frontend/src/pages/InvestmentsPage.tsx` | Investment→투자, Company→피투자사, shares→주식수, valuation→밸류에이션, instrument→투자수단 |
| `frontend/src/pages/WorkflowsPage.tsx` | Template→템플릿, Instance→실행건, Step→단계, Progress→진행률, Instantiate→실행 |
| `frontend/src/pages/WorkLogsPage.tsx` | Work Log→업무 기록, Category→카테고리, Estimated→예상, Actual→실제 |
| `frontend/src/pages/ChecklistsPage.tsx` | 모든 영어 라벨 한국어화 |
| `frontend/src/pages/DocumentsPage.tsx` | Document→서류, Status→상태, pending→미수, collected→수집완료 |
| `frontend/src/pages/CalendarPage.tsx` | Event→일정, Duration→소요시간, pending→예정, completed→완료 |

**주의사항**:
- API 필드명(JSON key)은 영어 유지 — UI 표시 텍스트만 변경
- status 값(pending, completed 등)의 **표시**만 한국어로 매핑, 실제 값은 영어 유지
- 날짜 표시 형식: `en-US` → `ko-KR` (예: "Feb 13" → "2/13")

---

### P0-2. 프론트엔드 `any` 타입 제거

**문제**: 프론트엔드 코드 전반에 `any` 타입이 사용되어 있어 타입 안전성이 없다.

**작업 범위**:

1. `frontend/src/pages/DashboardPage.tsx`:
   - Line 110: `active_workflows.map((wf: any)` → 별도 `ActiveWorkflow` 인터페이스 정의
   - Line 134: `fund_summary.map((fund: any)` → `FundSummary` 인터페이스 정의
   - Line 156: `missing_documents.map((doc: any)` → `MissingDocument` 인터페이스 정의
   - `data` 변수 전체에 `DashboardResponse` 타입 정의

2. `frontend/src/pages/CalendarPage.tsx`:
   - Line 78: `events?.map((event: any)` → `CalendarEvent` 인터페이스 정의

3. `frontend/src/pages/DocumentsPage.tsx`:
   - Line 38-39: `funds?.map((fund: any)`, `companies?.map((company: any)` → 기존 타입 사용
   - Line 64: `docs?.map((doc: any)` → `DocumentStatusItem` 인터페이스 정의

4. `frontend/src/lib/api.ts`:
   - Line 79-81: `createWorkLog`, `updateWorkLog`의 `data: any` → `WorkLogInput` 인터페이스 정의 후 교체

**구현 방법**:
- `frontend/src/lib/api.ts` 하단의 Types 섹션에 누락된 인터페이스 추가
- 각 페이지에서 `any` 대신 정의된 타입 사용
- `fetchDashboard`의 리턴 타입을 `DashboardResponse`로 지정

```typescript
// api.ts에 추가할 타입 예시
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

---

### P0-3. FastAPI `on_event` deprecation 수정

**문제**: `backend/main.py:39`에서 `@app.on_event("startup")` 사용 중. FastAPI 최신 버전에서 deprecated.

**변경**:
```python
# 변경 전 (main.py:39-41)
@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)

# 변경 후
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(title="VC ERP API", version="0.2.0", lifespan=lifespan)
```

---

## P1 - UX/기능 핵심 개선

### P1-1. 캘린더 페이지 월별 뷰 구현

**문제**: 현재 CalendarPage는 테이블 리스트뷰만 있음. 1인 관리자에게 월별 캘린더 뷰는 일정 파악의 핵심이다.

**작업 내용**:

1. **월별 그리드 캘린더 컴포넌트 구현** (`frontend/src/pages/CalendarPage.tsx` 수정)
   - 7열(월~일) x 5~6행 그리드
   - 각 날짜 셀에 해당일 이벤트 표시 (제목 + 색상 dot)
   - 현재 월 표시 + 이전/다음 월 네비게이션 버튼
   - 오늘 날짜 하이라이트 (배경색 구분)

2. **뷰 전환 토글**: 리스트뷰 ↔ 캘린더뷰 전환 버튼

3. **이벤트 색상 코딩**:
   - pending(예정): `bg-blue-100 text-blue-700`
   - completed(완료): `bg-green-100 text-green-700`
   - 마감 임박(오늘/내일): `bg-red-100 text-red-700`

4. **날짜 셀 클릭 시**: 해당 날짜의 이벤트 목록 표시 + 새 이벤트 추가 버튼

5. **API 변경**: `fetchCalendarEvents`에 `date_from`, `date_to` 파라미터 활용하여 현재 월 범위만 조회

**외부 라이브러리 사용 금지** — Tailwind CSS 그리드로 직접 구현.

**참고 구현 가이드**:
```tsx
// 월별 날짜 배열 생성 함수
function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startOffset = (firstDay.getDay() + 6) % 7 // 월요일 시작
  const days: (number | null)[] = []
  for (let i = 0; i < startOffset; i++) days.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d)
  return days
}
```

---

### P1-2. Task → Calendar 자동 연동

**문제**: Task에 deadline이 있지만 CalendarPage에 자동 반영되지 않음. 두 곳에서 따로 관리해야 함.

**작업 내용**:

1. **Backend 수정** — `backend/routers/tasks.py`:
   - `POST /api/tasks` (Task 생성) 시 deadline이 있으면 `CalendarEvent` 자동 생성
   - `PUT /api/tasks/{id}` 시 deadline 변경되면 연결된 `CalendarEvent`도 업데이트
   - `DELETE /api/tasks/{id}` 시 연결된 `CalendarEvent` 자동 삭제
   - Task → CalendarEvent 연결은 `CalendarEvent.task_id` 필드 활용

2. **Backend 수정** — `backend/routers/calendar_events.py`:
   - CalendarEvent에 `task_id`가 있으면 해당 Task의 정보도 함께 반환 (title, quadrant)

3. **Frontend 수정** — CalendarPage에서 Task 연동 이벤트는 구분 표시:
   - Task 연동 이벤트: 왼쪽에 quadrant 뱃지 (Q1, Q2 등)
   - 일반 이벤트: 뱃지 없음

---

### P1-3. Workflow Instance → Task 자동 마감일 계산 개선

**문제**: `backend/services/workflow_service.py`에서 워크플로우 인스턴스 생성 시 Task가 자동 생성되지만, 주말 건너뛰기 로직의 정확성 검증이 필요하다.

**작업 내용**:

1. `backend/services/workflow_service.py` 확인 및 검증:
   - `timing_offset_days`에 따른 날짜 계산에서 주말(토/일) 건너뛰기 로직 확인
   - 공휴일은 현재 미지원 → 주석으로 TODO 표시만

2. 워크플로우 스텝 완료 시 다음 스텝 Task의 상태를 `in_progress`로 자동 변경하는 로직 추가:
   - `backend/routers/workflows.py`의 `complete_workflow_step` 엔드포인트 수정
   - 현재 스텝 완료 → 다음 순서 스텝의 Task `status`를 `pending`에서 `in_progress`로

---

### P1-4. 조합(Fund) 상세 페이지 분리

**문제**: 현재 FundsPage에서 조합 목록과 상세가 같은 페이지에 있어, 정보가 많아지면 혼잡하다.

**작업 내용**:

1. **라우트 추가** — `frontend/src/App.tsx`:
   ```tsx
   <Route path="/funds/:id" element={<FundDetailPage />} />
   ```

2. **FundDetailPage 신규 생성** — `frontend/src/pages/FundDetailPage.tsx`:
   - 조합 기본 정보 (이름, 유형, 결성일, 상태, GP, Co-GP, 수탁사)
   - 약정/AUM 현황 표시
   - LP 목록 테이블 (이름, 유형, 약정금액, 납입금액, 연락처)
   - 해당 조합의 투자 내역 목록 (API: `fetchInvestments({ fund_id })`)
   - 해당 조합의 미수 서류 목록 (API: `fetchDocumentStatus({ fund_id })`)

3. **FundsPage 수정**: 조합 이름 클릭 시 `/funds/:id`로 이동 (현재 inline 확장 → 페이지 이동)

4. **Layout.tsx**: NAV 변경 불필요 (기존 /funds 유지)

---

### P1-5. 투자 상세 페이지 분리

**문제**: InvestmentsPage에서도 동일한 문제. 투자건별 상세 정보(서류 목록 포함)를 별도 페이지로 분리.

**작업 내용**:

1. **라우트 추가** — `frontend/src/App.tsx`:
   ```tsx
   <Route path="/investments/:id" element={<InvestmentDetailPage />} />
   ```

2. **InvestmentDetailPage 신규 생성** — `frontend/src/pages/InvestmentDetailPage.tsx`:
   - 투자 기본 정보 (조합, 피투자사, 투자일, 금액, 주식수, 단가, 밸류, 투자수단)
   - 첨부 서류 목록 + 상태 관리 (pending/collected/archived)
   - 서류 추가/수정/삭제 기능
   - 관련 워크플로우 인스턴스 연결 (있는 경우)

3. **InvestmentsPage 수정**: 투자건 클릭 시 `/investments/:id`로 이동

---

## P2 - 업무 자동화 강화

### P2-1. 조합 결성 워크플로우 시드 추가

**문제**: `backend/seed/seed_workflows.py`에 투자 관련 3개 워크플로우만 있고, `01_Requirements/business_overview.md`에 정의된 "조합 결성 프로세스"가 시드에 없다.

**작업 내용** — `backend/seed/seed_workflows.py`에 추가:

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

### P2-2. 정기 총회 워크플로우 시드 추가

**작업 내용** — `backend/seed/seed_workflows.py`에 추가:

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

**문제**: 농금원(매월 5일), 벤처협회 VICS(매월 5일) 월보고가 매달 반복되지만, 수동으로 Task를 만들어야 한다.

**작업 내용**:

1. **Backend 신규 엔드포인트** — `backend/routers/tasks.py`:
   ```
   POST /api/tasks/generate-monthly-reminders
   ```
   - 파라미터: `year_month` (예: "2026-03")
   - 동작: 해당 월의 월보고 Task 2건 자동 생성
     - "농금원 월보고 (YYYY-MM)" — deadline: 해당월 5일, quadrant: Q1, estimated_time: "2h"
     - "벤처협회 VICS 월보고 (YYYY-MM)" — deadline: 해당월 5일, quadrant: Q1, estimated_time: "2h"
   - 이미 동일 제목의 Task가 있으면 중복 생성하지 않음

2. **Dashboard 자동 체크** — `backend/routers/dashboard.py`:
   - `/api/dashboard/today` 응답에 `monthly_reminder` 필드 추가
   - 현재 월에 해당하는 월보고 Task가 없으면 `monthly_reminder: true` 반환
   - 있으면 `monthly_reminder: false`

3. **Frontend** — `DashboardPage.tsx`:
   - `monthly_reminder === true`이면 상단에 알림 배너 표시:
     "이번 달 월보고 Task가 아직 등록되지 않았습니다. [등록하기]"
   - [등록하기] 클릭 시 `POST /api/tasks/generate-monthly-reminders` 호출

---

### P2-4. 교훈(Lessons Learned) 연동 강화

**문제**: `04_Checklists/lessons_learned.md`에 12개 항목의 실무 교훈이 있지만, ERP 시스템과 연동되지 않는다. 워크플로우 실행 시 관련 교훈이 자동으로 표시되어야 한다.

**작업 내용**:

1. **Backend DB 모델 확장** — `backend/models/workflow.py`:
   - `WorkflowWarning` 모델에 `category` 필드 추가 (string, nullable)
   - category 값: "lesson", "warning", "tip" 등

2. **시드 데이터 보강** — `backend/seed/seed_workflows.py`:
   - 기존 3개 워크플로우의 `warnings`에 `lessons_learned.md`의 관련 교훈 추가
   - 예: "투자계약 체결" 워크플로우에 교훈 #12 (간인 순서) 추가
   - 예: "투자 후 서류처리" 워크플로우에 교훈 #4 (바이블 서류 누락 방지), #6 (주식 수 일치 검증) 추가

3. **Frontend** — `WorkflowsPage.tsx`:
   - 워크플로우 인스턴스 상세 보기에서 `warnings`를 아이콘 구분하여 표시
   - lesson: 💡 아이콘
   - warning: ⚠️ 아이콘

---

## P3 - 데이터 무결성 & 안정성

### P3-1. Backend 입력 유효성 검증 강화

**문제**: Pydantic 스키마에 최소한의 검증만 있고, 비즈니스 규칙 검증이 부족하다.

**작업 내용** — 각 `backend/schemas/*.py` 파일:

| 스키마 | 추가 검증 |
|--------|-----------|
| `schemas/task.py` | `quadrant`은 "Q1","Q2","Q3","Q4" 중 하나만 허용 (Literal 타입 사용). `estimated_time`은 정규식 패턴 검증 (`^\d+[hdm]$` 또는 `^\d+h\s?\d+m$`) |
| `schemas/fund.py` | `type`은 "투자조합","고유계정","농모태" 등 Enum 정의. `commitment_total`, `aum`은 0 이상 (`ge=0`) |
| `schemas/investment.py` | `amount`, `shares`, `share_price`는 0 이상. `status`는 Literal["active","exited","written_off"]. `fund_id`, `company_id` 존재 여부 라우터에서 검증 |
| `schemas/calendar_event.py` | `date`는 유효한 날짜 형식 검증. `duration`은 0 이상 |

---

### P3-2. API 에러 응답 일관성

**문제**: 라우터마다 에러 처리 방식이 다르고, 404/400 응답 형식이 일관되지 않다.

**작업 내용**:

1. **공통 예외 핸들러** — `backend/main.py`에 추가:
   ```python
   from fastapi import Request
   from fastapi.responses import JSONResponse

   @app.exception_handler(404)
   async def not_found_handler(request: Request, exc):
       return JSONResponse(status_code=404, content={"detail": str(exc.detail)})
   ```

2. **각 라우터** — 404 응답 시 일관된 형식 사용:
   ```python
   from fastapi import HTTPException
   raise HTTPException(status_code=404, detail="Fund not found")
   ```

3. **Frontend** — `api.ts`에 Axios 에러 인터셉터 추가:
   ```typescript
   api.interceptors.response.use(
     response => response,
     error => {
       const message = error.response?.data?.detail || '오류가 발생했습니다.'
       // 에러 상태 전파 (React Query에서 처리)
       return Promise.reject(new Error(message))
     }
   )
   ```

---

### P3-3. DB 마이그레이션 체계 구축

**문제**: 현재 `Base.metadata.create_all()`로 테이블 생성만 하고 있어, 스키마 변경 시 기존 데이터가 유실될 수 있다.

**작업 내용**:

1. **Alembic 도입** — `backend/` 디렉토리:
   ```bash
   pip install alembic
   alembic init migrations
   ```

2. **설정** — `backend/alembic.ini` 및 `backend/migrations/env.py`:
   - `sqlalchemy.url`을 `database.py`의 `DATABASE_URL`과 동일하게 설정
   - `target_metadata`를 `Base.metadata`로 설정

3. **requirements.txt 업데이트**: `alembic>=1.13` 추가

4. **초기 마이그레이션 생성**:
   ```bash
   alembic revision --autogenerate -m "initial"
   ```

5. **main.py 수정**: `Base.metadata.create_all()` 제거, 대신 마이그레이션으로 테이블 관리
   - 단, 개발 편의를 위해 `create_all`을 조건부로 유지 가능:
   ```python
   import os
   if os.getenv("AUTO_CREATE_TABLES", "true").lower() == "true":
       Base.metadata.create_all(bind=engine)
   ```

---

## P4 - UI 품질 개선

### P4-1. 대시보드 레이아웃 개선

**문제**: 현재 대시보드가 단순 카드 나열 형태로, 정보 계층이 부족하다.

**작업 내용** — `frontend/src/pages/DashboardPage.tsx`:

1. **상단 요약 카드** (새로 추가):
   - 4개 카드 가로 배열: `grid-cols-4`
   - 오늘 작업 수 | 이번 주 작업 수 | 진행중 워크플로우 | 미수 서류 수
   - 각 카드: 숫자 크게 + 라벨 작게 + 아이콘

2. **기존 섹션 재배치**:
   - 좌측(2/3): 오늘 → 내일 → 이번 주 (세로 배열)
   - 우측(1/3): 조합 현황 + 미수 서류 (세로 배열)
   - 하단: 예정 작업 (전체 너비)

3. **작업 카드 개선**:
   - 마감일이 오늘인데 미완료 → 빨간 테두리 (`border-red-400`)
   - 마감일이 지난 Task → 빨간 배경 + "지연" 뱃지 (`bg-red-50`)

---

### P4-2. Task Board 드래그 앤 드롭

**문제**: TaskBoardPage에 "Drag-and-drop between quadrants (UI ready)"로 표시되어 있지만 실제 드래그 앤 드롭이 구현되지 않았다.

**작업 내용** — `frontend/src/pages/TaskBoardPage.tsx`:

1. **HTML5 Drag and Drop API 사용** (외부 라이브러리 없이):
   - 각 Task 카드에 `draggable="true"` 속성
   - `onDragStart`: Task ID와 현재 quadrant 저장
   - 각 quadrant 컬럼에 `onDragOver`, `onDrop` 핸들러
   - `onDrop`: `moveTask(taskId, newQuadrant)` API 호출

2. **시각적 피드백**:
   - 드래그 중인 카드: `opacity-50`
   - 드롭 가능 영역: `border-2 border-dashed border-blue-300`
   - 드롭 불가 영역 (같은 quadrant): 변화 없음

3. **API 호출**: 기존 `PATCH /api/tasks/{id}/move` 활용 — 이미 구현되어 있음

---

### P4-3. 반응형 사이드바 (모바일 대응)

**문제**: Layout.tsx의 사이드바가 고정 `w-56`으로, 모바일에서 화면을 차지한다.

**작업 내용** — `frontend/src/components/Layout.tsx`:

1. **모바일 토글 버튼**: 화면 상단 좌측에 햄버거 메뉴 아이콘 (`md:hidden`)
2. **데스크톱**: 기존과 동일 (사이드바 항상 표시)
3. **모바일**: 사이드바 오버레이로 열림/닫힘 (`fixed inset-0 z-50`)
4. **오버레이 배경**: `bg-black/50` 클릭 시 닫힘

```tsx
// 상태 관리
const [sidebarOpen, setSidebarOpen] = useState(false)

// 모바일 토글 버튼 (md:hidden)
<button className="md:hidden p-2" onClick={() => setSidebarOpen(true)}>
  <Menu size={24} />
</button>

// 사이드바 (데스크톱: 항상 표시, 모바일: 조건부)
<aside className={`
  fixed inset-y-0 left-0 z-50 w-56 bg-slate-900 text-white transform transition-transform
  md:relative md:translate-x-0
  ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
`}>
```

---

### P4-4. Toast 알림 시스템

**문제**: CRUD 작업(생성, 수정, 삭제) 성공/실패 시 사용자에게 피드백이 없다.

**작업 내용**:

1. **Toast 컴포넌트 생성** — `frontend/src/components/Toast.tsx`:
   - 화면 우측 상단에 표시
   - 3초 후 자동 사라짐
   - 타입: success(초록), error(빨강), info(파랑)
   - 메시지 + 닫기 버튼

2. **Toast Context 생성** — `frontend/src/contexts/ToastContext.tsx`:
   ```typescript
   interface Toast { id: string; type: 'success' | 'error' | 'info'; message: string }
   const ToastContext = createContext<{ addToast: (type: string, message: string) => void }>()
   ```

3. **main.tsx에 Provider 감싸기**

4. **각 페이지의 mutation onSuccess/onError에 toast 호출 추가**:
   ```typescript
   const { addToast } = useToast()
   const createMut = useMutation({
     mutationFn: createTask,
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['tasks'] })
       addToast('success', '작업이 생성되었습니다.')
     },
     onError: (err) => addToast('error', err.message),
   })
   ```

---

## 작업 순서 권장

CODEX가 작업할 때 권장하는 순서:

```
Phase 1 (구조 기반):
  P0-3 → P0-2 → P3-1 → P3-2

Phase 2 (한국어화):
  P0-1

Phase 3 (핵심 기능):
  P1-1 → P1-2 → P1-4 → P1-5 → P1-3

Phase 4 (자동화):
  P2-1 → P2-2 → P2-3 → P2-4

Phase 5 (UI 품질):
  P4-4 → P4-1 → P4-2 → P4-3

Phase 6 (안정성):
  P3-3
```

---

## 작업 규칙 (CODEX 준수 사항)

1. **하나의 P 항목 = 하나의 커밋**. 커밋 메시지는 `fix:`, `feat:`, `refactor:` prefix 사용.
2. **기존 API 필드명(JSON key)은 영어 유지**. UI 표시 텍스트만 한국어로 변경.
3. **외부 라이브러리 최소화**. Alembic 외에는 기존 의존성 내에서 해결.
4. **테스트 작성 불필요** (1인 프로젝트, MVP 단계).
5. **파일 생성 시** 기존 코드 스타일 준수 (함수형 컴포넌트, arrow function, Tailwind 유틸리티 클래스).
6. **DB 스키마 변경 시** 기존 데이터 호환성 유지 (nullable 필드로 추가).
7. **각 Phase 완료 후** `npm run build`(frontend) 및 서버 기동 확인.

---

## 파일 경로 참조

| 구분 | 경로 |
|------|------|
| Backend 진입점 | `backend/main.py` |
| DB 설정 | `backend/database.py` |
| 모델 디렉토리 | `backend/models/` |
| 스키마 디렉토리 | `backend/schemas/` |
| 라우터 디렉토리 | `backend/routers/` |
| 시드 데이터 | `backend/seed/seed_workflows.py` |
| Frontend 진입점 | `frontend/src/main.tsx` |
| 라우터 설정 | `frontend/src/App.tsx` |
| API 클라이언트 | `frontend/src/lib/api.ts` |
| 레이아웃 | `frontend/src/components/Layout.tsx` |
| 페이지 디렉토리 | `frontend/src/pages/` |
| 업무 요구사항 | `01_Requirements/business_overview.md` |
| 교훈 목록 | `04_Checklists/lessons_learned.md` |

---

**작성자**: Claude Code (PM)
**작업 대상**: OpenAI CODEX
**마지막 업데이트**: 2026-02-13
