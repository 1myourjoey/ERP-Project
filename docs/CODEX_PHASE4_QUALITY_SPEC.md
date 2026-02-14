# Phase 4: Quality & Usability Fixes — Codex Spec

> 전수 검사 결과 기반 품질/사용성 개선 사항
> 우선순위: CRITICAL → HIGH → MEDIUM 순서로 작업

---

## CODEX 공통 규칙

1. Python 코드는 `backend/` 기준, TypeScript는 `frontend/src/` 기준
2. SQLite 호환 유지 — `Numeric` 사용 시 `asdecimal=False` 옵션 추가
3. 기존 API 인터페이스(필드명, URL)는 변경하지 않고 확장만
4. 프론트엔드 텍스트는 모두 한국어
5. `npm run build` 통과 필수
6. 기존 seed 데이터/마이그레이션 호환 유지
7. Pydantic v2 문법 사용 (`model_validate`, `model_config`)
8. `from __future__ import annotations` 사용 금지
9. 관계(relationship) 추가 시 `back_populates` 양방향 설정
10. 새 컬럼 추가 시 `backend/main.py`의 `ensure_sqlite_compat_columns()` 함수에 ALTER TABLE 추가

---

## Q0: WorkflowsPage 한국어화 (CRITICAL)

**파일**: `frontend/src/pages/WorkflowsPage.tsx`

WorkflowsPage.tsx에 영문 텍스트가 32건 이상 남아있다. 모두 한국어로 변환:

| 영문 | 한국어 |
|------|--------|
| `"Loading..."` | `"불러오는 중..."` |
| `"New Template"` | `"새 템플릿"` |
| `"Edit"` | `"수정"` |
| `"Delete"` | `"삭제"` |
| `placeholder="Template name"` | `placeholder="템플릿 이름"` |
| `placeholder="Category"` | `placeholder="카테고리"` |
| `placeholder="Total duration"` | `placeholder="총 소요 시간"` |
| `placeholder="Trigger description"` | `placeholder="트리거 설명"` |
| `"Steps"` (섹션 제목) | `"단계"` |
| `placeholder="N Step"` | `placeholder="단계 이름"` |
| `placeholder="Timing"` | `placeholder="타이밍"` |
| `placeholder="Offset days"` | `placeholder="오프셋 일수"` |
| `placeholder="Estimated time"` | `placeholder="예상 시간"` |
| `placeholder="Quadrant"` | `placeholder="사분면"` |
| `placeholder="Memo"` | `placeholder="메모"` |
| `"Delete Step"` | `"단계 삭제"` |
| `"Documents"` (섹션 제목) | `"서류"` |
| `"+ Add Document"` | `"+ 서류 추가"` |
| `placeholder="Document name"` | `placeholder="서류 이름"` |
| `placeholder="Notes"` | `placeholder="비고"` |
| `"Warnings"` (섹션 제목) | `"주의사항"` |
| `"+ Add Warning"` | `"+ 주의사항 추가"` |
| `"Warning"` (option) | `"경고"` |
| `"Lesson"` (option) | `"교훈"` |
| `"Tip"` (option) | `"팁"` |
| `placeholder="Content"` | `placeholder="내용"` |
| `"Cancel"` | `"취소"` |
| `"Start Workflow"` | `"워크플로우 시작"` |
| `placeholder="Instance name"` | `placeholder="인스턴스 이름"` |
| `"Related fund (optional)"` | `"연관 조합 (선택)"` |
| `"Related company (optional)"` | `"연관 회사 (선택)"` |
| `"Related investment (optional)"` | `"연관 투자 (선택)"` |
| `placeholder="Memo (optional)"` | `placeholder="메모 (선택)"` |
| `"Start"` | `"시작"` |
| `"No active workflow instances."` | `"활성 워크플로우 인스턴스가 없습니다."` |
| `"Cancel this workflow instance?"` | `"이 워크플로우 인스턴스를 취소하시겠습니까?"` |
| `"Cancel workflow"` | `"워크플로우 취소"` |
| `"Workflow Templates"` | `"워크플로우 템플릿"` |
| `"Template Management"` | `"템플릿 관리"` |
| `"Active Instances"` | `"활성 인스턴스"` |
| `"N steps"` 포맷 | `"N 단계"` |

**작업**: 파일 전체에서 영문 UI 텍스트를 검색하여 위 표에 따라 한국어로 교체. 누락 없이 전부 처리.

---

## Q1: 금융 컬럼 타입 수정 (CRITICAL)

금액 필드가 `Integer`로 정의되어 소수점 금액 처리 불가. `Float`로 변경:

### backend/models/fund.py
```python
# 변경: Integer → Float
commitment_total = Column(Float, nullable=True)  # 약정총액
aum = Column(Float, nullable=True)               # 운용자산
```

### backend/models/investment.py
```python
amount = Column(Float, nullable=True)
shares = Column(Float, nullable=True)        # 주식수 (소수점 가능)
share_price = Column(Float, nullable=True)
valuation = Column(Float, nullable=True)
```

### backend/models/transaction.py
```python
amount = Column(Float, default=0)
balance_before = Column(Float, nullable=True)
balance_after = Column(Float, nullable=True)
realized_gain = Column(Float, nullable=True)
cumulative_gain = Column(Float, nullable=True)
```

### backend/models/valuation.py
```python
value = Column(Float, default=0)
prev_value = Column(Float, nullable=True)
change_amount = Column(Float, nullable=True)
```

### backend/models/phase3.py
```python
# CapitalCall
total_amount = Column(Float, default=0)
# Distribution
principal_total = Column(Float, default=0)
profit_total = Column(Float, default=0)
# ExitCommittee
performance_fee = Column(Float, nullable=True)
```

### 스키마 대응
각 모델의 대응 스키마(schemas/)에서 해당 필드 타입도 `int` → `float`로 변경. 기존 `ge=0` 등 validator는 유지.

### main.py ensure_sqlite_compat_columns()
SQLite는 `ALTER TABLE ... ALTER COLUMN` 미지원이므로, 기존 Integer 컬럼을 Float로 바꿀 수 없음. 대신 **새 테이블을 만들지 않고**, SQLite에서 Integer와 Float는 내부적으로 호환되므로 모델만 변경하면 동작함. 추가 ALTER TABLE 불필요.

---

## Q2: Fund 모델 필수 필드 추가 (HIGH)

### backend/models/fund.py
Fund 모델에 다음 필드 추가:
```python
maturity_date = Column(Date, nullable=True)          # 만기일
mgmt_fee_rate = Column(Float, nullable=True)          # 관리보수율 (예: 2.0 → 2%)
performance_fee_rate = Column(Float, nullable=True)    # 성과보수율
hurdle_rate = Column(Float, nullable=True)             # 허들레이트
account_number = Column(String, nullable=True)         # 운용계좌번호
```

### backend/schemas/fund.py
FundCreate, FundUpdate, FundResponse에 동일 필드 추가 (모두 Optional).

### backend/main.py ensure_sqlite_compat_columns()
다음 ALTER TABLE 추가:
```python
("funds", "maturity_date", "DATE"),
("funds", "mgmt_fee_rate", "REAL"),
("funds", "performance_fee_rate", "REAL"),
("funds", "hurdle_rate", "REAL"),
("funds", "account_number", "TEXT"),
```

### frontend/src/pages/FundDetailPage.tsx
펀드 상세 페이지에 다음 필드 표시/편집 추가:
- 만기일 (date input)
- 관리보수율 (number input, % 표시)
- 성과보수율 (number input, % 표시)
- 허들레이트 (number input, % 표시)
- 운용계좌번호 (text input)

### frontend/src/lib/api.ts
Fund 인터페이스에 필드 추가:
```typescript
maturity_date?: string | null
mgmt_fee_rate?: number | null
performance_fee_rate?: number | null
hurdle_rate?: number | null
account_number?: string | null
```

---

## Q3: PortfolioCompany 필드 보강 (HIGH)

### backend/models/investment.py — PortfolioCompany
다음 필드 추가:
```python
corp_number = Column(String, nullable=True)        # 법인등록번호
founded_date = Column(Date, nullable=True)         # 설립일
analyst = Column(String, nullable=True)            # 담당 심사역
contact_name = Column(String, nullable=True)       # 담당자명
contact_email = Column(String, nullable=True)      # 이메일
contact_phone = Column(String, nullable=True)      # 전화번호
memo = Column(Text, nullable=True)                 # 비고
```

### backend/schemas/investment.py
CompanyCreate, CompanyResponse에 동일 필드 추가 (모두 Optional).

### backend/main.py ensure_sqlite_compat_columns()
```python
("portfolio_companies", "corp_number", "TEXT"),
("portfolio_companies", "founded_date", "DATE"),
("portfolio_companies", "analyst", "TEXT"),
("portfolio_companies", "contact_name", "TEXT"),
("portfolio_companies", "contact_email", "TEXT"),
("portfolio_companies", "contact_phone", "TEXT"),
("portfolio_companies", "memo", "TEXT"),
```

### frontend/src/pages/InvestmentsPage.tsx
회사 생성/편집 폼에 위 필드를 추가. 현재 `document.getElementById()` 사용하는 안티패턴을 **React state 기반 폼**으로 리팩터링:
- `useState`로 폼 상태 관리
- 기존 DOM 접근(`document.getElementById`) 완전 제거

### frontend/src/lib/api.ts
Company 인터페이스에 필드 추가.

---

## Q4: Investment 모델 보강 (HIGH)

### backend/models/investment.py — Investment
다음 필드 추가:
```python
round = Column(String, nullable=True)              # 투자 라운드 (Seed, Series A 등)
valuation_pre = Column(Float, nullable=True)       # Pre-money 밸류
valuation_post = Column(Float, nullable=True)      # Post-money 밸류
ownership_pct = Column(Float, nullable=True)       # 지분율
board_seat = Column(String, nullable=True)         # 이사회 참여 (observer/board/none)
```

### backend/schemas/investment.py
InvestmentCreate, InvestmentUpdate, InvestmentResponse에 필드 추가 (모두 Optional).

### backend/main.py ensure_sqlite_compat_columns()
```python
("investments", "round", "TEXT"),
("investments", "valuation_pre", "REAL"),
("investments", "valuation_post", "REAL"),
("investments", "ownership_pct", "REAL"),
("investments", "board_seat", "TEXT"),
```

### frontend/src/pages/InvestmentDetailPage.tsx
투자 상세 화면에 위 필드 표시/편집 추가.

### frontend/src/lib/api.ts
Investment 인터페이스에 필드 추가.

---

## Q5: 검색 범위 확대 (MEDIUM)

### backend/routers/search.py
현재 검색 대상: Task, Fund, Company, Investment, WorkflowInstance

추가할 검색 대상:
1. **BizReport** — `report_name` 검색, type: "biz_report", url: "/biz-reports"
2. **RegularReport** — `report_target` 검색, type: "report", url: "/reports"
3. **WorkLog** — `title` 검색, type: "worklog", url: "/worklogs"

각 모델 import 추가하고 검색 로직 추가. 각 limit(5).

```python
from models.regular_report import RegularReport
from models.worklog import WorkLog

# BizReport (models/biz_report.py의 BizReport)
# 영업보고 이름으로 검색
biz_reports = db.query(BizReport).filter(BizReport.report_name.ilike(like)).order_by(BizReport.id.desc()).limit(5).all()
for br in biz_reports:
    results.append({
        "type": "biz_report",
        "id": br.id,
        "title": br.report_name,
        "subtitle": br.status,
        "url": "/biz-reports",
    })

# RegularReport
reports = db.query(RegularReport).filter(RegularReport.report_target.ilike(like)).order_by(RegularReport.id.desc()).limit(5).all()
for r in reports:
    results.append({
        "type": "report",
        "id": r.id,
        "title": f"{r.report_target} ({r.period or ''})",
        "subtitle": r.status,
        "url": "/reports",
    })

# WorkLog
worklogs = db.query(WorkLog).filter(WorkLog.title.ilike(like)).order_by(WorkLog.id.desc()).limit(5).all()
for wl in worklogs:
    results.append({
        "type": "worklog",
        "id": wl.id,
        "title": wl.title,
        "subtitle": wl.category,
        "url": "/worklogs",
    })
```

### frontend/src/components/SearchModal.tsx
검색 결과 타입 아이콘 매핑에 새 타입 추가:
- `biz_report` → FileText 아이콘
- `report` → Send 아이콘
- `worklog` → BookOpen 아이콘

---

## Q6: 대시보드에 deadline 없는 Task 표시 (MEDIUM)

### 문제
현재 `dashboard.py`에서 deadline이 없는 Task는 어느 섹션에도 표시되지 않음. 실무에서 "기한 없음" Task도 관리 필요.

### backend/routers/dashboard.py
`pending_tasks` 루프 끝에 "no deadline" 카테고리 추가:

```python
no_deadline_tasks: list[TaskResponse] = []

for task in pending_tasks:
    # ... 기존 로직 ...
    if deadline is None:
        no_deadline_tasks.append(task_resp)
        continue  # 기존 deadline 비교 건너뛰기
    # ... 기존 deadline 비교 로직 ...
```

리턴 딕셔너리에 추가:
```python
"no_deadline": no_deadline_tasks,
```

### frontend/src/lib/api.ts
DashboardResponse에 `no_deadline: Task[]` 필드 추가.

### frontend/src/pages/DashboardPage.tsx
"예정" 섹션 아래에 "기한 미설정" 섹션 추가:
```tsx
{data.no_deadline?.length > 0 && (
  <TaskSection
    title="기한 미설정"
    tasks={data.no_deadline}
    icon={<Clock size={16} className="text-slate-400" />}
    onTaskClick={() => navigate('/tasks')}
    onTaskComplete={handleQuickComplete}
    completingTaskId={completeTaskMut.variables?.id ?? null}
  />
)}
```

---

## Q7: 워크플로우 인스턴스 first step 자동 활성화 (MEDIUM)

### 문제
워크플로우 인스턴스 생성 시 모든 step이 "pending" 상태로 생성됨. 첫 번째 step은 자동으로 "in_progress"가 되어야 함.

### backend/services/workflow_service.py
`instantiate_workflow()` 함수 끝(commit 직전)에 첫 번째 step 활성화 로직 추가:

```python
# Activate first step
first_step = (
    db.query(WorkflowStepInstance)
    .filter(WorkflowStepInstance.instance_id == instance.id)
    .join(WorkflowStep, WorkflowStep.id == WorkflowStepInstance.workflow_step_id)
    .order_by(WorkflowStep.order.asc())
    .first()
)
if first_step:
    first_step.status = "in_progress"
    if first_step.task_id:
        task = db.get(Task, first_step.task_id)
        if task:
            task.status = "in_progress"
```

---

## Q8: 워크플로우 step 완료 시 Task에 notes 기록 (MEDIUM)

### 문제
워크플로우 단계 완료 시 `notes`가 StepInstance에만 저장되고 연결된 Task의 memo에 반영되지 않음.

### backend/routers/workflows.py — complete_step 함수
Task 업데이트 부분에 notes 반영 추가:

```python
if si.task_id:
    task = db.get(Task, si.task_id)
    if task:
        task.status = "completed"
        task.completed_at = datetime.now()
        task.actual_time = data.actual_time
        # notes가 있으면 task memo에 추가
        if data.notes:
            existing_memo = task.memo or ""
            task.memo = f"{existing_memo}\n[완료 메모] {data.notes}".strip()
```

---

## Q9: DocumentsPage 기능 보강 (MEDIUM)

### 문제
`DocumentsPage.tsx`가 86줄로 매우 간소함. 실무에서 서류 현황 파악에 필수적인 기능 부족.

### frontend/src/pages/DocumentsPage.tsx
전면 리팩터링:

1. **필터 추가**: 상태별(전체/미수집/요청중/수집완료), 조합별, 회사별
2. **통계 요약 상단 배치**: 전체 서류 수, 미수집 수, 수집률(%)
3. **테이블 개선**: 서류명, 투자건(회사명), 조합명, 상태, 마감일, D-day 배지, 비고
4. **상태 변경 버튼**: 테이블 행에서 직접 상태를 변경할 수 있는 드롭다운
5. **한국어 UI**: 모든 텍스트 한국어

API는 기존 `fetchDocumentStatus()`를 사용. 상태 변경은 `updateInvestmentDocument()` API 사용.

---

## Q10: 캘린더에 워크플로우 마감일 표시 (MEDIUM)

### 문제
CalendarPage가 calendar_events 테이블만 표시. 워크플로우 step 마감일도 함께 보여야 실무에서 유용.

### backend/routers/calendar_events.py
기존 GET /api/calendar-events 엔드포인트에 query param 추가:

```python
@router.get("/api/calendar-events")
def list_events(
    year: int | None = None,
    month: int | None = None,
    include_tasks: bool = False,
    db: Session = Depends(get_db),
):
    # 기존 calendar_events 조회...
    events = [...]

    if include_tasks:
        # pending/in_progress Task 중 해당 월의 deadline이 있는 것 추가
        task_query = db.query(Task).filter(
            Task.status.in_(["pending", "in_progress"]),
            Task.deadline.isnot(None),
        )
        if year and month:
            start = date(year, month, 1)
            end = date(year, month + 1, 1) if month < 12 else date(year + 1, 1, 1)
            task_query = task_query.filter(Task.deadline >= start, Task.deadline < end)

        for task in task_query.all():
            events.append({
                "id": f"task-{task.id}",
                "title": task.title,
                "event_date": task.deadline.isoformat() if task.deadline else None,
                "event_type": "task",
                "color": "#3b82f6",  # blue
            })

    return events
```

### frontend/src/pages/CalendarPage.tsx
- `include_tasks=true` 쿼리 파라미터 추가
- Task 이벤트를 다른 색상(파란색)으로 표시
- 이벤트 타입별 범례 추가

---

## 작업 순서 요약

| 순서 | 항목 | 우선순위 | 주요 파일 |
|------|------|----------|-----------|
| 1 | Q0: WorkflowsPage 한국어화 | CRITICAL | WorkflowsPage.tsx |
| 2 | Q1: 금융 컬럼 Float 변경 | CRITICAL | models/*.py, schemas/*.py |
| 3 | Q2: Fund 필드 추가 | HIGH | fund.py, FundDetailPage.tsx |
| 4 | Q3: Company 필드 보강 | HIGH | investment.py, InvestmentsPage.tsx |
| 5 | Q4: Investment 필드 보강 | HIGH | investment.py, InvestmentDetailPage.tsx |
| 6 | Q5: 검색 범위 확대 | MEDIUM | search.py, SearchModal.tsx |
| 7 | Q6: 기한없는 Task 표시 | MEDIUM | dashboard.py, DashboardPage.tsx |
| 8 | Q7: 첫 step 자동 활성화 | MEDIUM | workflow_service.py |
| 9 | Q8: 완료 notes→Task memo | MEDIUM | workflows.py |
| 10 | Q9: DocumentsPage 보강 | MEDIUM | DocumentsPage.tsx |
| 11 | Q10: 캘린더 Task 표시 | MEDIUM | calendar_events.py, CalendarPage.tsx |
