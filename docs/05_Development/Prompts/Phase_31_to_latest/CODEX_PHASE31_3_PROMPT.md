# Phase 31_3: 시스템 연계 완성 + 체크리스트 통합 + 실시간 동기화

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 및 아래 참조 문서를 먼저 읽을 것.
>
> **참조 PRD:** `docs/06_PRD/PRD_02_TaskBoard.md`, `docs/06_PRD/PRD_03_Workflows.md`
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist를 반드시 수행할 것.

**Priority:** P0 (System Integrity + UX Bugs)

---

## Part 1. 워크플로 단계 완료 → 업무일지 자동 기록

> **대상:** `frontend/src/pages/WorkflowsPage.tsx` — `handleCompleteStep` (1173줄), `completeMut` (1196줄)
> **대상:** Backend — `completeWorkflowStep` API

### 1-1. 현재 문제

`handleCompleteStep`으로 워크플로 단계를 체크(완료)하면:
- Backend에서 단계 상태만 `completed`로 변경
- **업무일지(WorkLog)가 전혀 생성되지 않음**
- 업무보드(`TaskBoardPage`)의 `CompleteModal`에서는 `auto_worklog` 옵션이 있어 worklog가 생성되지만,
  워크플로에서 직접 체크하면 이 경로를 거치지 않음

### 1-2. 구현 내용

#### A. Backend — 단계 완료 시 WorkLog 자동 생성

`completeWorkflowStep` API 내부에서 단계 완료 처리 후:
1. 해당 단계에 연결된 Task가 있으면, 그 Task의 정보(title, category, fund_id)로 WorkLog 자동 생성
2. WorkLog 필드 매핑:
   - `title`: `[워크플로명] - [단계명]` (예: "결성총회 - 통지서 발송")
   - `category`: 워크플로의 category 또는 '워크플로'
   - `date`: 완료 시점(오늘)
   - `estimated_time`: 단계의 `estimated_time`
   - `actual_time`: 전달받은 `actual_time` (현재 estimated와 동일하게 전달됨)
   - `status`: `'completed'`
3. 연결된 Task가 없는 경우에도 워크플로+단계 정보 기반으로 WorkLog 생성

#### B. Frontend — 워크플로 단계 완료 시 toast 메시지 개선

`completeMut.onSuccess`에서:
- 기존: `'단계가 완료되었습니다.'`
- 변경: `'단계가 완료되었습니다. 업무일지에 자동 기록됩니다.'`
- `invalidateQueries`에 `['worklogs']`, `['worklogInsights']` 추가

---

## Part 2. 워크플로 인스턴스 — 단계 서류 체크리스트 연동

> **대상:** `WorkflowsPage.tsx` — `InstanceList` 컴포넌트 (1048줄~)
> **대상:** Backend — 워크플로 인스턴스 단계 서류 조회/확인 API

### 2-1. 현재 문제

**템플릿 생성 시:** `TemplateModal`(314~851줄)에서 각 단계에 `step_documents`를 자유롭게 추가/삭제 가능:
- 서류명, 필수 여부, 시점, 메모, 문서 템플릿 연결 모두 완벽하게 구현

**인스턴스 실행 시:** `InstanceList`에서 단계를 체크(완료)할 때:
- 해당 단계의 `step_documents` 확인/체크 UI가 **전혀 없음**
- 서류가 준비되었는지 여부를 확인하지 않고 바로 완료 처리 가능
- 실무자가 서류 누락을 인지하지 못하고 단계를 넘기는 **휴먼 에러 발생**

**인스턴스 수정 시:** 인스턴스의 개별 단계 서류를 확인하거나 수정하는 UI도 **없음**

### 2-2. 구현 내용

#### A. 인스턴스 단계 상세 — 서류 체크리스트 표시

`InstanceList`에서 각 인스턴스를 펼쳤을(expand) 때, 각 단계 옆에 해당 단계의 `step_documents`를 체크리스트로 표시:

```
┌─ 결성총회 워크플로 ──────────────────────────┐
│ ✅ 1. 총회 소집 통지                     [완료됨] │
│    📄 ☑ 총회 소집 통지서 (필수)                  │
│    📄 ☑ 위임장 양식 (선택)                       │
│                                                │
│ ⬜ 2. 투심위 서류 준비                    [체크]  │
│    📄 ☐ 투심보고서 (필수)       ← 미확인          │
│    📄 ☐ 등기부등본 (필수)       ← 미확인          │
│    📄 ☑ 재무제표 (선택)         ← 확인 완료       │
│    ⚠️ 필수 서류 2건 미확인                        │
└──────────────────────────────────────────────┘
```

#### B. 서류 체크 상태 관리

Backend에 서류 체크 상태를 저장할 수 있게:
```
PATCH /api/workflow-instances/{instance_id}/steps/{step_id}/documents/{doc_id}/check
Body: { "checked": true }
```

또는 기존 `step_documents` 모델에 `checked` 필드를 추가하여 인스턴스 레벨에서 관리.

#### C. 필수 서류 미확인 시 경고

단계 완료(`handleCompleteStep`) 시:
1. 해당 단계의 `step_documents` 중 `required: true`인 서류의 `checked` 상태 확인
2. **필수 서류가 미확인이면:**
   - `confirm()` 다이얼로그: `"필수 서류 2건이 미확인 상태입니다. 그래도 완료하시겠습니까?"`
   - 사용자가 확인해야 완료 진행 (실수 인지 기회 제공, 완전 Lock은 아님)
3. 선택 서류는 경고 없이 통과

#### D. 인스턴스 단계 서류 수정 UI

인스턴스의 각 단계에서 서류 목록을 수정할 수 있는 간단한 편집 UI:
- 기존 `TemplateModal`의 서류 편집 UI를 참고하되, 더 간소화
- 서류 추가/삭제/수정(이름, 필수여부) 가능
- 이는 인스턴스 레벨의 변경이므로 원본 템플릿에는 영향 없음

---

## Part 3. 전체 페이지 실시간 동기화 (invalidateQueries 표준화)

> **대상:** 프론트엔드 전체 페이지의 mutation `onSuccess` 핸들러

### 3-1. 현재 문제

변경(mutation) 후 `invalidateQueries`가 **페이지마다 제각각**:
- `WorkflowsPage`: 가장 철저 — 20+ 쿼리 키 무효화 (`invalidateCapitalLinkedQueries`)
- `TaskBoardPage`: `['taskBoard', 'dashboard']`만 무효화 → 워크플로/캘린더/파이프라인에 반영 안 됨
- `DashboardPage`: `['dashboard']`만 무효화
- `WorkLogsPage`: `['worklogs', 'worklogInsights']`만 무효화
- 기타 페이지(`FundsPage`, `ValuationsPage` 등): 해당 페이지 쿼리만 무효화

**증상:** 한 페이지에서 수정 후 다른 페이지로 이동하면 **새로고침하지 않으면 변경 사항이 반영 안 됨**

### 3-2. 구현 내용

#### A. 공통 무효화 함수 생성

`frontend/src/lib/queryInvalidation.ts` (NEW 파일):

```ts
import { QueryClient } from '@tanstack/react-query'

// 업무/워크플로 관련 변경 시 호출
export function invalidateTaskRelated(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
  queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  queryClient.invalidateQueries({ queryKey: ['calendarEvents'] })
  queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
  queryClient.invalidateQueries({ queryKey: ['workflow-instances'] })
  queryClient.invalidateQueries({ queryKey: ['tasks'] })
  queryClient.invalidateQueries({ queryKey: ['worklogs'] })
  queryClient.invalidateQueries({ queryKey: ['worklogInsights'] })
}

// 자금/조합 관련 변경 시 호출
export function invalidateFundRelated(queryClient: QueryClient, fundId?: number | null) {
  invalidateTaskRelated(queryClient)
  queryClient.invalidateQueries({ queryKey: ['funds'] })
  queryClient.invalidateQueries({ queryKey: ['fund'] })
  queryClient.invalidateQueries({ queryKey: ['capitalCalls'] })
  queryClient.invalidateQueries({ queryKey: ['capitalCallItems'] })
  queryClient.invalidateQueries({ queryKey: ['capitalCallSummary'] })
  queryClient.invalidateQueries({ queryKey: ['fundPerformance'] })
  if (fundId) {
    queryClient.invalidateQueries({ queryKey: ['fund', fundId] })
    queryClient.invalidateQueries({ queryKey: ['fundDetails', fundId] })
    queryClient.invalidateQueries({ queryKey: ['fundLPs', fundId] })
  }
}
```

#### B. 모든 페이지의 mutation onSuccess 수정

각 페이지에서:
- Task 생성/수정/삭제/완료 → `invalidateTaskRelated()` 호출
- Fund/LP/CapitalCall 변경 → `invalidateFundRelated()` 호출
- 기존 개별 `invalidateQueries` 호출을 공통 함수로 교체

**수정 대상 파일 (전수 검사 대상):**
- `DashboardPage.tsx`
- `TaskBoardPage.tsx`
- `WorkflowsPage.tsx`
- `WorkLogsPage.tsx`
- `FundsPage.tsx`
- `FundDetailPage.tsx`
- `ValuationsPage.tsx`
- `TransactionsPage.tsx`
- 기타 mutation이 있는 모든 페이지

---

## Part 4. 파이프라인 대기 영역 — 비어있으면 접기

> **대상:** `frontend/src/components/TaskPipelineView.tsx`

### 4-1. 구현 내용

대기(No Deadline) 업무가 0건이면:
- 상단 대기 행을 **축소(collapse)** 또는 **숨김(hide)** 처리
- 접힌 상태에서 `📥 대기 (0건)` 텍스트만 표시, 클릭 시 펼쳐짐 (드롭다운 형태)
- 업무가 생기면 자동으로 다시 표시

---

## Part 5. 엑셀 템플릿 — Funds 시트 한글화 + 파일명 변경

> **대상:** Backend 엑셀 생성 코드

### 5-1. 현재 상황

Phase 31_2에서 LPs 시트는 한글화+가이드가 적용되었지만, **Funds 시트는 미적용**.

### 5-2. 구현 내용

1. **Funds 시트 컬럼 헤더 한글화:**
   - `name` → `조합명`, `fund_type` → `조합유형`, `commitment_total` → `약정총액` 등
   - 모든 컬럼을 LPs 시트와 동일한 원칙으로 한글화

2. **Funds 시트 도움말 행 추가:**
   - LPs 시트와 동일하게 첫 데이터 행에 입력 안내 텍스트 삽입

3. **파일명 변경:**
   - 현재: `LP_일괄등록_양식.xlsx`
   - 변경: `조합_및_LP_일괄등록_양식.xlsx`

---

## Part 6. 체크리스트 → 워크플로 통합

> **대상:** `frontend/src/pages/ChecklistsPage.tsx` (487줄), Backend 체크리스트 API

### 6-1. 분석

체크리스트와 워크플로는 기능이 거의 동일:
- 둘 다: 단계별 항목 관리, 체크/미체크, 서류 연결 가능
- 워크플로가 상위 호환: Task 자동 생성, D-Day 일정, 필수 서류 검증
- Phase 31에서 에러-프루프 검증까지 추가되어 워크플로가 완전히 체크리스트를 대체

### 6-2. 구현 내용

#### A. 체크리스트 데이터 → 워크플로 마이그레이션 안내

ChecklistsPage 상단에 안내 배너 표시:
```
💡 체크리스트 기능이 워크플로와 통합됩니다.
   기존 체크리스트 항목을 워크플로 템플릿으로 변환할 수 있습니다.
   [워크플로로 변환] [자세히 보기]
```

#### B. 사이드바에서 체크리스트 → 워크플로 하위 메뉴로 이동

- 사이드바의 독립 `📋 체크리스트` 메뉴를 제거하고,
  `🔄 워크플로` 페이지 내의 탭 또는 서브 메뉴로 통합
- 워크플로 페이지에 `[템플릿 | 진행 중 | 완료 | 체크리스트(레거시)]` 탭 추가
- 체크리스트 탭에서는 기존 `ChecklistsPage`의 UI를 그대로 렌더링하되,
  `[워크플로로 변환]` 버튼을 각 체크리스트에 추가

#### C. 체크리스트 → 워크플로 변환 기능

`[워크플로로 변환]` 클릭 시:
1. 체크리스트의 항목들을 워크플로 템플릿의 steps로 자동 변환
2. 변환된 템플릿을 `TemplateModal`에서 미리보기 → 수정 → 저장
3. 변환 완료 후 원본 체크리스트는 `(워크플로 변환됨)` 라벨 표시

---

## Part 7. 대시보드 우측 — 통지/보고 탭 연결 논리 강화

> **대상:** `frontend/src/components/dashboard/DashboardRightPanel.tsx` (291줄)
> **대상:** Backend — 통지/보고 데이터 소스

### 7-1. 현재 문제

- **통지 탭:** `fetchUpcomingNotices(30)` — 30일 이내 통지만 표시.
  데이터 소스가 한정적이어서 통지 관련 업무가 빠질 수 있음
- **보고 탭:** `upcomingReports` — 보고 마감만 표시.
  워크플로 단계 중 `is_report: true`인 항목과의 연결이 약함
- 워크플로 템플릿에서 단계에 `is_notice`, `is_report` 체크를 넣어도,
  대시보드 통지/보고 탭과 유기적으로 연결되는지 불확실

### 7-2. 구현 내용

#### A. 통지 탭 데이터 소스 확장

통지 탭이 다음 소스를 모두 취합하여 표시:
1. 기존 `fetchUpcomingNotices` (조합 통지기간 기반)
2. 워크플로 인스턴스의 진행 중 단계 중 `is_notice: true`인 Task/Step
3. 업무보드에서 `is_notice: true`인 미완료 Task

Backend에서 이 3개 소스를 병합하여 반환하도록 API 개선 또는 프론트에서 merge:
- 각 항목에 출처 표시: `[조합규약]`, `[워크플로]`, `[업무]`

#### B. 보고 탭 데이터 소스 확장

보고 탭이 다음 소스를 모두 취합:
1. 기존 `upcomingReports` (보고 마감 기반)
2. 워크플로 단계 중 `is_report: true`인 진행 중 Step
3. 업무보드에서 `is_report: true`인 미완료 Task

#### C. 탭 카운트 실시간 반영

통지/보고 탭의 카운트 배지가 위의 확장된 데이터를 반영하도록 업데이트.

---

## Part 8. 업무보드 배너 [업무 확인] 클릭 → 해당 항목 스크롤 수정

> **대상:** `frontend/src/pages/TaskBoardPage.tsx` — 긴급/지연 배너 영역

### 8-1. 현재 문제

배너의 `[업무 확인]` 버튼을 클릭해도 해당 Task 위치로 스크롤되지 않음.
`scrollIntoView` 로직이 누락된 것으로 확인.

### 8-2. 구현 내용

`[업무 확인]` 클릭 시:
1. 해당 배너의 첫 번째 Task의 `id`를 가져옴
2. `document.getElementById('task-{id}')?.scrollIntoView({ behavior: 'smooth', block: 'center' })`
3. 스크롤 후 해당 Task 카드에 **하이라이트 애니메이션** 적용 (기존 `isBlinking` 로직 활용):
   - `setBlinkingId(taskId)` → 2초 후 자동 해제
4. 만약 해당 Task가 접힌 `WorkflowGroupCard` 안에 있으면, 카드를 먼저 펼친 후 스크롤

---

## Files to modify / create

| # | Type | Target | Description |
|---|---|---|---|
| 1 | **[MODIFY]** | `backend/` — `completeWorkflowStep` API | 단계 완료 시 WorkLog 자동 생성 추가 |
| 2 | **[MODIFY]** | `frontend/src/pages/WorkflowsPage.tsx` | (1) 단계 서류 체크리스트 UI, (2) 서류 미확인 경고, (3) 완료 toast 개선, (4) invalidate에 worklogs 추가 |
| 3 | **[NEW]** | `frontend/src/lib/queryInvalidation.ts` | 공통 invalidateQueries 함수 (invalidateTaskRelated, invalidateFundRelated) |
| 4 | **[MODIFY]** | 전체 페이지 (.tsx) | 모든 mutation의 onSuccess에서 공통 invalidation 함수 사용으로 교체 |
| 5 | **[MODIFY]** | `frontend/src/components/TaskPipelineView.tsx` | 대기 0건 시 접기/숨기기 처리 |
| 6 | **[MODIFY]** | Backend 엑셀 생성 코드 | Funds 시트 한글화 + 파일명 변경 |
| 7 | **[MODIFY]** | `frontend/src/pages/ChecklistsPage.tsx` | 통합 안내 배너 + 워크플로 변환 버튼 추가 |
| 8 | **[MODIFY]** | 사이드바 / 라우터 | 체크리스트를 워크플로 하위로 이동 |
| 9 | **[MODIFY]** | `frontend/src/components/dashboard/DashboardRightPanel.tsx` | 통지/보고 탭 데이터 소스 확장 |
| 10 | **[MODIFY]** | `frontend/src/pages/TaskBoardPage.tsx` | 배너 [업무 확인] 클릭 시 scrollIntoView + 하이라이트 |
| 11 | **[NEW]** | Backend — 워크플로 인스턴스 서류 체크 API | `PATCH /api/workflow-instances/.../documents/.../check` |

---

## Acceptance Criteria

- [ ] **AC-01 (WF→WorkLog):** 워크플로 단계 체크(완료) 시 업무일지에 자동으로 기록이 생성된다.
- [ ] **AC-02 (서류 체크리스트):** 워크플로 인스턴스의 각 단계에 template에서 정의된 서류 목록이 체크리스트로 표시되고, 개별 체크가 가능하다.
- [ ] **AC-03 (서류 경고):** 필수 서류가 미확인 상태에서 단계 완료 시 경고 다이얼로그가 표시된다.
- [ ] **AC-04 (실시간 동기화):** 어떤 페이지에서든 데이터 변경 후 다른 페이지로 이동하면 새로고침 없이 변경 사항이 반영된다.
- [ ] **AC-05 (대기 접기):** 파이프라인에서 대기 업무가 0건이면 대기 영역이 접혀(collapse) 공간을 절약한다.
- [ ] **AC-06 (Funds 한글화):** 엑셀 다운로드의 Funds 시트가 한글 헤더+가이드를 가지며, 파일명이 `조합_및_LP_일괄등록_양식.xlsx`이다.
- [ ] **AC-07 (체크리스트 통합):** 체크리스트가 워크플로 페이지 하위로 이동되고, 기존 체크리스트를 워크플로 템플릿으로 변환할 수 있는 버튼이 제공된다.
- [ ] **AC-08 (통지/보고 연결):** 대시보드 우측 통지/보고 탭에 워크플로의 is_notice/is_report 단계와 업무보드의 관련 Task가 유기적으로 포함되어 표시된다.
- [ ] **AC-09 (배너 스크롤):** 업무보드 상단 배너의 [업무 확인] 클릭 시 해당 Task 위치로 스크롤되고 하이라이트 효과가 적용된다.
- [ ] **AC-10 (기존 유지):** Q1~Q4 칸반, Bulk Action, CompleteModal 에러프루프, 교훈 리마인드 등 기존 기능 모두 유지.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. Q1~Q4 칸반 구조 — 그대로 유지
3. `CompleteModal`의 에러프루프/교훈 리마인드 로직 — 유지
4. 워크플로 `TemplateModal`의 기존 서류 편집 UI 구조 — 유지 (인스턴스 서류 UI는 별도 추가)
5. `WorkflowsPage`의 `invalidateCapitalLinkedQueries` 로직은 유지하되, 공통 함수에서 호출하는 구조로 리팩토링
