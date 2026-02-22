# Phase 31_4: 카테고리 자동 등록 + 전체 시스템 무결성·정합성 보완

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 및 아래 참조 문서를 먼저 읽을 것.
>
> **참조:** 이 프롬프트는 전체 코드베이스(22개 프론트엔드 페이지, 31개 백엔드 라우터, api.ts 1785줄)를
> 전수 감사한 결과를 기반으로 작성되었습니다.
>
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist를 반드시 수행할 것.

**Priority:** P0 (System Integrity)

---

## Part 1. 카테고리 자동 등록 — 워크플로 → 업무 → 업무일지 → 교훈 순환 시스템

### 1-1. 현재 구조의 끊김 지점

현재 시스템의 데이터 흐름:
```
[워크플로 템플릿] → category: "투자실행" (TemplateModal에서 직접 입력)
       ↓ 인스턴스 실행
[Task 생성] → category: null ← ⚠️ 템플릿의 category가 전달되지 않음!
       ↓ 완료
[WorkLog 생성] → category: null ← ⚠️ Task에서 category 없으면 null
       ↓ 다음 번 같은 유형 업무
[교훈 리마인드] → category 기반 조회 ← ⚠️ category null이면 매칭 불가!
```

**끊김 #1:** 워크플로 인스턴스 실행 시 Task를 자동 생성하지만, 워크플로 템플릿의 `category`가 Task에 전달되지 않음

**끊김 #2:** Task의 `category`가 `task_categories` 테이블에 등록되지 않은 값이면 관리가 안 됨

**끊김 #3:** 워크플로 단계 완료 → WorkLog 자동 생성(Phase 31_3) 시, category가 null이면 교훈 리마인드 순환이 불가

### 1-2. 구현 내용 — 완전한 순환 시스템

#### A. 워크플로 인스턴스 실행 시 카테고리 자동 전파

Backend — `instantiate_workflow` API 수정:
- 워크플로 템플릿의 `category` 값을 인스턴스로 생성되는 **모든 Task에 자동 설정**
- 이미 Task에 category가 있으면 덮어쓰지 않음

#### B. 워크플로 템플릿 저장 시 카테고리 자동 등록

Backend — `create_workflow / update_workflow` API 수정:
- 템플릿의 `category` 필드에 값이 있으면, 해당 값을 `task_categories` 테이블에 **자동 등록** (없으면 insert, 있으면 무시)
- 이를 통해 워크플로 카테고리가 Task 카테고리와 자동으로 동기화

#### C. 워크플로 단계 완료 → WorkLog의 category 설정

Phase 31_3에서 추가된 "단계 완료 → WorkLog 자동 생성" 로직에서:
- WorkLog의 `category`를 해당 인스턴스의 워크플로 category로 설정
- 이를 통해 교훈 리마인드(worklog_lessons.py)의 category 기반 조회가 작동

#### D. 완성된 순환 흐름

```
[워크플로 템플릿] → category: "투자실행"
       ↓ 저장 시 task_categories에 자동 등록
[task_categories] → "투자실행" 행 존재
       ↓ 인스턴스 실행
[Task 생성] → category: "투자실행" (템플릿에서 자동 전파)
       ↓ 완료 (업무보드 또는 워크플로 직접 체크)
[WorkLog 생성] → category: "투자실행" + lessons DynamicList
       ↓ 다음 번 동일 카테고리 업무 완료 시
[CompleteModal] → 교훈 리마인드: "간인 순서 틀리지 않도록 주의" ✅
```

#### E. 워크플로 TemplateModal의 카테고리 입력 개선

현재 TemplateModal(WorkflowsPage 646줄)에서 카테고리는 자유 텍스트 `<input>`:
```tsx
<input value={form.category || ''} onChange={...} placeholder="선택 입력" />
```

변경:
- **기존 `task_categories`를 `<select>` 또는 `<datalist>`로 제안**, 새 카테고리는 직접 입력도 가능
- `fetchTaskCategories()` 쿼리를 TemplateModal에서 호출하여 기존 카테고리 목록 표시
- 직접 입력한 새 카테고리는 저장 시 자동 등록 (위 B에서 처리)

---

## Part 2. 전체 시스템 무결성·정합성 감사 — 발견된 갭 보완

> 아래는 22개 프론트엔드 페이지, 31개 백엔드 라우터, api.ts(1785줄, 312개 export)를
> 전수 감사하여 발견한 연계 갭입니다. 각 항목별로 수정 내용을 명시합니다.

### 2-1. 워크플로 인스턴스 서류 — API 존재하나 프론트 미연결

**발견:**
- Backend + api.ts에 이미 구현 완료:
  - `checkWorkflowStepInstanceDocument(instanceId, stepId, documentId, checked)` (api.ts 132줄)
  - `listWorkflowStepInstanceDocuments(instanceId, stepId)` (api.ts 108줄)
  - `addWorkflowStepInstanceDocument` / `updateWorkflowStepInstanceDocument` / `deleteWorkflowStepInstanceDocument` (api.ts 113~131줄)
- `WorkflowStepInstance` 타입에 `step_documents: WorkflowStepInstanceDocument[]` 이미 포함 (api.ts 670줄)
- `WorkflowStepInstanceDocument`에 `checked: boolean` 필드 존재 (api.ts 651줄)

**BUT:** `WorkflowsPage.tsx`의 `InstanceList`에서 이 데이터를 **렌더링하지 않음**!

**수정:**
- `InstanceList`의 각 단계 렌더링 부분에서 `step.step_documents`를 체크리스트 UI로 표시
- 각 서류 체크박스 클릭 시 `checkWorkflowStepInstanceDocument` API 호출
- 필수 서류 미확인 상태에서 단계 완료 시 경고 (Phase 31_3 AC-03과 동일)
- **Phase 31_3에서 `Part 2`로 명시한 내용과 동일하나, API가 이미 존재하므로 새 API 생성이 불필요함을 명확히 함**

### 2-2. DashboardSidebarResponse — 통지(notices) 타입 누락

**발견:**
- `DashboardSidebarResponse` (api.ts 416줄):
  ```ts
  export interface DashboardSidebarResponse {
    fund_summary: FundSummary[]
    missing_documents: MissingDocument[]
    upcoming_reports: UpcomingReport[]
    // ⚠️ upcoming_notices가 없음!
  }
  ```
- `upcoming_notices`는 `DashboardResponse` (api.ts 430줄)에만 optional로 존재
- 별도 API `fetchUpcomingNotices(days)` (api.ts 56줄)로 분리 호출

**수정:**
- `DashboardSidebarResponse`에 `upcoming_notices?: UpcomingNotice[]` 추가
- 또는 현재 구조 유지하되, `DashboardRightPanel`에서 `fetchUpcomingNotices`를 별도 호출하도록 확인 (이미 호출 중이면 OK)
- **핵심:** Phase 31_3 Part 7에서 통지/보고 데이터 소스를 확장할 때, is_notice/is_report Task도 포함시키는 것을 반드시 구현

### 2-3. Task.is_notice / is_report → Dashboard 통지/보고 탭 미연결

**발견:**
- `TaskCreate` 인터페이스(api.ts 518~519줄)에 `is_notice`, `is_report` 필드 존재
- `Task` 인터페이스(api.ts 540~541줄)에도 `is_notice`, `is_report` boolean 필드 존재
- 워크플로 단계에도 `is_notice`, `is_report` (api.ts 584~585줄) 존재

**BUT:**
- `DashboardRightPanel`의 통지/보고 탭은 이 필드를 사용하지 않음!
- 통지 탭: `fetchUpcomingNotices`만 사용 (조합 규약 기반)
- 보고 탭: `upcoming_reports`만 사용

**수정:**
- Backend `dashboard/sidebar` API에서 `is_notice: true`인 미완료 Task도 통지 목록에 포함
- Backend `dashboard/sidebar` API에서 `is_report: true`인 미완료 Task도 보고 목록에 포함
- 프론트에서 각 항목에 출처 라벨 표시: `[규약]`, `[워크플로]`, `[업무]`

### 2-4. WorkLog.task_id NULL 문제 — 워크플로 단계 직접 완료 시

**발견:**
- `worklog_lessons.py`(28줄~)에서 교훈 조회:
  ```python
  .join(Task, Task.id == WorkLog.task_id)  # ← INNER JOIN!
  ```
- 워크플로 단계를 직접 완료할 때 해당 단계에 연결된 Task가 없으면, `WorkLog.task_id`가 `NULL`
- INNER JOIN 때문에 해당 WorkLog의 교훈이 **조회에서 제외됨**

**수정:**
- `worklog_lessons.py`: `JOIN → OUTERJOIN` 변경
  ```python
  .outerjoin(Task, Task.id == WorkLog.task_id)
  ```
- WorkLog 자체의 `category` 필드로 매칭하도록 쿼리 조건 수정:
  ```python
  .filter(
    (Task.category == normalized_category) | (WorkLog.category == normalized_category)
  )
  ```
- WorkLog에 `category` 필드가 없으면 모델에 추가 필요

### 2-5. CalendarPage (26KB) vs MiniCalendar — 이중 구현 정합성

**발견:**
- `CalendarPage.tsx` (26KB, 별도 페이지) — 전용 캘린더 뷰
- `MiniCalendar.tsx` (254줄) — TaskBoardPage 내 보조 뷰
- 두 컴포넌트가 **동일 API** (`fetchCalendarEvents`)를 사용하지만 렌더링 로직이 독립적
- Phase 31_1에서 MiniCalendar에 D-Day 색상 + Quick Complete를 추가했지만, CalendarPage에는 적용 안 됨

**수정:**
- CalendarPage에도 Phase 31_1의 D-Day 색상 코딩 및 overdue 표시 적용
- 두 컴포넌트의 공통 로직(D-Day 계산, urgency 색상)을 공유 유틸로 추출:
  - `frontend/src/lib/taskUrgency.ts` (NEW) — D-Day 계산 함수, urgency 색상 매핑

### 2-6. invalidateQueries 불일치 — 완전 목록

**발견 (전수 조사):**

| 페이지 | mutation 후 무효화 | 누락 |
|---|---|---|
| `TaskBoardPage` | `['taskBoard', 'dashboard']` | calendar, workflowInstances, worklogs |
| `WorkflowsPage` | 20+ 키 (가장 철저) | worklogs, worklogInsights |
| `WorkLogsPage` | `['worklogs', 'worklogInsights']` | dashboard, taskBoard |
| `DashboardPage` | `['dashboard']` | taskBoard, calendar |
| `ValuationsPage` | `['valuations', 'fundPerformance']` | dashboard |
| `TransactionsPage` | `['transactions', 'investment']` | dashboard, fundPerformance |
| `FundsPage` | fund 관련 키만 | dashboard, taskBoard |
| `FundDetailPage` | fund 관련 키만 | dashboard, taskBoard |
| `CalendarPage` | calendar 키만 | dashboard, taskBoard |

**수정:**
- Phase 31_3에서 설계한 `queryInvalidation.ts` 공통 함수를 반드시 **모든 22개 페이지에 적용**
- 특히 위 표의 "누락" 열에 해당하는 무효화를 모두 추가

### 2-7. 워크플로 인스턴스 실행 시 task_categories 미등록

**발견:**
- `task_categories.py`의 `DEFAULT_TASK_CATEGORIES`: `['투자실행', 'LP보고', '사후관리', '규약/총회', '서류관리', '일반']`
- 하지만 워크플로 템플릿의 category가 이 목록에 없는 값(예: "회계감사")이면, Task에 설정되어도 카테고리 관리 UI에서 보이지 않을 수 있음

**수정:**
- Part 1-B에서 해결: 워크플로 템플릿 저장 시 자동 등록
- 추가: `updateTask` API에서도 category 값이 변경될 때, 해당 category가 `task_categories`에 없으면 자동 등록

### 2-8. CompleteModal props — category/fund_id 전달 누락 가능성

**발견:**
- Phase 31_2에서 `CompleteTaskLike`에 `category`, `fund_id` 추가 설계
- 하지만 `TaskBoardPage`에서 `CompleteModal`을 호출하는 부분에서 이 props를 전달하는지 확인 필요
- `Task` 인터페이스에는 `category`, `fund_id` 모두 있으므로, Task 객체를 그대로 전달하면 자동으로 포함됨

**수정:**
- `TaskBoardPage`의 `setCompletingTask(task)` 호출 시 Task 전체를 전달하고 있는지 확인
- 만약 부분 객체만 전달하면 `category`와 `fund_id`를 포함하도록 수정

### 2-9. 워크플로 인스턴스 실행 시 `is_notice` / `is_report` Task 미전달

**발견:**
- 워크플로 템플릿의 각 단계에 `is_notice`, `is_report` 체크 존재 (TemplateModal 660~676줄)
- 하지만 인스턴스 실행 시 생성되는 Task에 이 값이 전달되는지 확인 필요
- Backend `instantiate_workflow`에서 step의 `is_notice`/`is_report` → Task의 `is_notice`/`is_report`로 매핑되어야 함

**수정:**
- Backend 확인 후, 누락이면 `is_notice`/`is_report` 전파 추가

---

## Part 3. 전체 시스템 건강도 점검 항목 (Codex 점검 체크리스트)

아래 항목을 하나씩 **코드 레벨에서 확인**하고, 문제가 있으면 수정:

### 프론트엔드 연계 점검
- [ ] 모든 mutation `onSuccess`에서 `invalidateTaskRelated` 또는 `invalidateFundRelated` 사용 확인
- [ ] 모든 `useQuery`의 `queryKey`가 다른 페이지의 `invalidateQueries` 대상에 포함되는지 확인
- [ ] `DashboardRightPanel`의 4개 탭(조합/통지/보고/서류)에서 사용하는 API가 모두 정상 연결되는지 확인
- [ ] `CalendarPage`와 `MiniCalendar`의 이벤트 데이터가 동일 API를 사용하는지, 불일치 없는지 확인
- [ ] `TaskPipelineView`가 대시보드에서 제거되고 업무보드에만 존재하는지 확인 (Phase 31_1)

### 백엔드 연계 점검
- [ ] `instantiate_workflow`에서 Task 생성 시 `category`, `is_notice`, `is_report` 전파 확인
- [ ] `completeWorkflowStep`에서 WorkLog 생성 시 `category`, `task_id` (있으면) 설정 확인
- [ ] `worklog_lessons` 조회 시 `WorkLog.task_id`가 NULL인 경우도 매칭되는지 확인
- [ ] `task_categories`에 워크플로/Task에서 사용하는 모든 category가 등록되어 있는지 확인
- [ ] `dashboard/sidebar` API가 `is_notice`/`is_report` Task를 통지/보고 목록에 포함하는지 확인

### 데이터 무결성 점검
- [ ] Task.category → task_categories.name 참조 무결성 (FK는 없으나 논리적 정합성)
- [ ] WorkLog.category → task_categories.name 참조 무결성
- [ ] WorkflowTemplate.category → task_categories.name 참조 무결성
- [ ] WorkflowStepInstanceDocument.checked 상태가 Backend에 영속되는지 확인

---

## Files to modify / create

| # | Type | Target | Description |
|---|---|---|---|
| 1 | **[MODIFY]** | `backend/routers/workflows.py` | 템플릿 저장 시 category → task_categories 자동 등록, 인스턴스 실행 시 Task에 category/is_notice/is_report 전파 |
| 2 | **[MODIFY]** | `backend/routers/worklog_lessons.py` | INNER JOIN → OUTERJOIN, WorkLog.category 기반 매칭 추가 |
| 3 | **[MODIFY]** | `backend/routers/dashboard.py` | sidebar API에 is_notice/is_report Task 포함 |
| 4 | **[MODIFY]** | `backend/routers/tasks.py` | updateTask에서 category 변경 시 task_categories 자동 등록 |
| 5 | **[MODIFY]** | `frontend/src/pages/WorkflowsPage.tsx` | (1) InstanceList에서 step_documents 체크리스트 렌더링, (2) TemplateModal 카테고리 입력을 datalist로 변경 |
| 6 | **[NEW]** | `frontend/src/lib/queryInvalidation.ts` | 공통 invalidateQueries 함수 |
| 7 | **[MODIFY]** | 22개 전체 프론트엔드 페이지 | mutation onSuccess에서 공통 invalidation 함수 사용 |
| 8 | **[NEW]** | `frontend/src/lib/taskUrgency.ts` | D-Day 계산, urgency 색상 매핑 공유 유틸 |
| 9 | **[MODIFY]** | `frontend/src/pages/CalendarPage.tsx` | D-Day 색상 코딩 적용 (MiniCalendar와 동일 원칙) |
| 10 | **[MODIFY]** | `frontend/src/components/dashboard/DashboardRightPanel.tsx` | 통지/보고 탭에 is_notice/is_report Task 표시 |

---

## Acceptance Criteria

- [ ] **AC-01 (카테고리 순환):** 워크플로 템플릿 저장 시 category가 task_categories에 자동 등록되고, 인스턴스 실행 시 모든 생성 Task에 자동 전파되며, 워크플로 단계 완료 → WorkLog의 category도 설정되어, 교훈 리마인드 조회가 정상 작동한다.
- [ ] **AC-02 (TemplateModal 카테고리):** 워크플로 템플릿 생성/수정 시 기존 task_categories를 드롭다운/datalist로 제안하고, 새 카테고리도 직접 입력 가능하다.
- [ ] **AC-03 (인스턴스 서류 체크):** 워크플로 인스턴스의 각 단계에 서류 체크리스트가 표시되고, 개별 체크가 가능하다 (기존 API `checkWorkflowStepInstanceDocument` 활용).
- [ ] **AC-04 (worklog_lessons JOIN):** WorkLog.task_id가 NULL인 워크플로 직접 완료 기록의 교훈도 리마인드에서 조회된다.
- [ ] **AC-05 (통지/보고 연결):** 대시보드 우측 통지/보고 탭에 is_notice/is_report Task가 포함되어 표시된다.
- [ ] **AC-06 (invalidateQueries 통일):** 어떤 페이지에서든 데이터 변경 후 관련 페이지로 이동하면 새로고침 없이 반영된다.
- [ ] **AC-07 (CalendarPage D-Day):** 전용 캘린더 페이지에도 MiniCalendar와 동일한 D-Day 색상 코딩이 적용된다.
- [ ] **AC-08 (is_notice/is_report 전파):** 워크플로 인스턴스 실행 시 생성되는 Task에 단계의 is_notice/is_report가 전파된다.
- [ ] **AC-09 (기존 유지):** Q1~Q4 칸반, Bulk Action, CompleteModal 에러프루프/교훈 리마인드, 체크리스트 통합 등 Phase 31~31_3의 모든 기능 유지.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. Q1~Q4 칸반 구조 — 그대로 유지
3. `CompleteModal`의 에러프루프/교훈 리마인드 UI — 유지 (데이터 소스만 보강)
4. `worklog_lessons.py`의 기존 반환 타입 `WorkLogLessonReminder` — 유지 (JOIN만 수정)
5. 기존 `checkWorkflowStepInstanceDocument` API 시그니처 — 유지 (프론트 연결만 추가)
6. `DEFAULT_TASK_CATEGORIES` 기본값 — 유지 (새 카테고리는 추가만, 기존 것 삭제 안 함)
