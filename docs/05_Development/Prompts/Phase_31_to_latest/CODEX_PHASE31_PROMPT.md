# Phase 31(수정): 대시보드 + 업무보드 효율성 극대화 — 에러-프루프 게이트키퍼 구축

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 및 아래 참조 문서를 먼저 읽을 것.
>
> **참조 PRD:** `docs/06_PRD/PRD_01_Dashboard.md`, `docs/06_PRD/PRD_02_TaskBoard.md`
> **참조 플로우차트:** `docs/06_PRD/Flowchart/v_on_erp_comprehensive_flow.md` (Page 01, 02, 04)
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist를 반드시 수행할 것.

**Priority:** P0 (Business Critical)

---

## 🚨 핵심 기획 배경 (Why we do this)

VC의 관리역(VC Operations / Fund Admin)은 **1~2인의 극소수 인원**이 수백억 원의 자금 흐름과 
수천 장의 서류를 통제하는 구조입니다. 이 시스템의 존재 이유는 두 가지입니다:

1. **기한 강제(Deadline Enforcement):** 캐피탈콜 납입일, 총회 소집 통지 기일, 금감원 보고 기한 등은 
   **하루라도 넘기면 규약 위반**이 됩니다. 시스템이 기한을 추적하고 실무자에게 계속 압박해야 합니다.
   
2. **숫자 실수 원천 차단(Numeral Error-Proof):** 150억을 15억으로 잘못 입력하면 수습 불가능한 
   캐피탈콜 사고가 발생합니다. 시스템이 숫자 입력 시 이중 확인 장치를 제공해야 합니다.

---

## 현재 상태 분석 (Before → After)

### ✅ 이미 구현된 것 (건드리지 않아도 되는 것)

| 항목 | 현재 상태 | 비고 |
|---|---|---|
| `KrwAmountInput` 한글 금액 보조 | ✅ 이미 존재 | `FundsPage`, `FundDetailPage`, `FundCoreFields` 등 20곳+ 적용 완료 |
| 대시보드 D-Day 분류 | ✅ 이미 존재 | 오늘/내일/이번주/예정/기한없음 레인 + 파이프라인 뷰 |
| 워크플로 진행률 표시 | ✅ 이미 존재 | `WorkflowGroupCard`에 `5/10` 형태 Progress 배지 |
| Task 드래그 앤 드롭 | ✅ 이미 존재 | Q1~Q4 간 드래그로 이동 |
| 미니 캘린더 | ✅ 이미 존재 | TaskBoardPage 내 캘린더 토글 |
| 완료 시 WorkLog 자동 생성 | ✅ 이미 존재 | `CompleteModal` 체크박스 |

### ❌ 아직 없는 것 (이번 Phase에서 구현해야 할 것)

| # | 문제 | 현재 | 목표 |
|---|---|---|---|
| **G-1** | 완료 시 필수 서류 검증 없음 | `CompleteModal`이 `actualTime`만 체크 | 워크플로 단계에 필수 서류가 정의되어 있으면, 서류가 미첨부 시 완료 버튼 Lock |
| **G-2** | 완료 시 필수 숫자 검증 없음 | 아무 Task나 자유롭게 완료 가능 | 캐피탈콜 관련 Task 완료 시 금액/납입일 미기입이면 경고 표시 |
| **G-3** | 지연(Overdue) 업무 시각적 경고 약함 | `urgentTasks` 배너는 있으나 개별 Task에 색상 구분 없음 | D-Day 기반 색상 코딩: 지연(빨강), 오늘(주황), 임박(노랑) |
| **G-4** | 일괄(Bulk) 처리 불가 | Task 하나씩만 처리 가능 | 체크박스 다중 선택 → 일괄 완료/삭제 |
| **G-5** | 대시보드 ↔ 업무보드 중복/비효율 | 양쪽에서 비슷한 Task를 별개 UI로 보여줌 | 대시보드=빠른 현황 파악(읽기+빠른완료), 업무보드=깊은 관리(CRUD+필터+Bulk) |

---

## Part 1. CompleteModal 에러-프루프 강화 (G-1, G-2)

> **핵심 변경:** `CompleteModal`을 단순 시간 입력 모달에서 → **필수 조건 검증 게이트키퍼**로 업그레이드

### 1-1. 워크플로 필수 서류 검증

**조건:** Task에 `workflow_instance_id`와 `workflow_step_id`가 존재하는 경우

**검증 로직:**
1. `CompleteModal`이 열릴 때, Backend API를 호출하여 해당 워크플로 단계(`workflow_step`)의 
   `step_documents` 중 `required: true`인 서류 목록을 조회
2. 각 필수 서류에 대해 실제 파일이 업로드되었는지 검증
3. **미첨부 서류가 1건이라도 있으면:**
   - `[완료]` 버튼을 `disabled` 처리
   - 모달 내에 빨간 경고 박스와 함께 누락된 서류 이름을 목록으로 표시
   - 예: `⚠️ 필수 서류 미첨부: 조합원 명부 (PDF), 투자계약서 (필수)`
4. **모든 필수 서류가 첨부된 경우에만** `[완료]` 버튼 활성화

### 1-2. 캐피탈콜 관련 Task 금액 검증

**조건:** Task의 `category`가 `'투자실행'`이거나 Task `title`에 '캐피탈콜', '출자', '납입' 키워드가 포함된 경우

**검증 로직:**
1. 해당 Task에 연결된 Fund(`fund_id`)의 최근 CapitalCall에 `total_amount`와 `due_date`가 
   기입되었는지 Backend API로 조회
2. **미기입 시:** 경고 툴팁 표시 (완료는 가능하되 경고는 반드시 보여줌)
   - 예: `⚠️ 연결된 캐피탈콜의 청구 금액 또는 납입 기일이 비어있습니다. 펀드 상세에서 확인해주세요.`
3. 이 경고는 `blocking`이 아닌 `warning` 수준 (실무자 판단에 맡기되 인지시킴)

### Backend 변경 필요

```
GET /api/tasks/{task_id}/completion-check
Response: {
  "can_complete": true/false,
  "missing_documents": ["조합원 명부 (PDF)", ...],
  "warnings": ["캐피탈콜 금액 미기입"]
}
```

---

## Part 2. D-Day 색상 코딩 (G-3)

> **핵심:** 기존 Q1~Q4 구조를 유지하되, 각 Task 카드에 D-Day 기반 시각적 긴급도를 오버레이

### 2-1. TaskItem 컴포넌트 색상 변경

`TaskItem` 컴포넌트의 좌측 보더(border-left) 색상을 D-Day 기반으로 자동 적용:

| D-Day 상태 | 색상 | 조건 |
|---|---|---|
| 🔴 **지연(Overdue)** | `border-l-4 border-l-red-500 bg-red-50` | `deadline < now && status !== 'completed'` |
| 🟠 **오늘 마감(Today)** | `border-l-4 border-l-orange-500 bg-orange-50` | `deadline`이 오늘 |
| 🟡 **이번 주 내(This Week)** | `border-l-4 border-l-amber-400` | `deadline`이 7일 이내 |
| 🟢 **여유(Later)** | 기본 스타일 유지 | 8일 이상 남음 |
| ⚪ **기한 없음** | `border-l-4 border-l-gray-300` | `deadline`이 null |

### 2-2. Overdue 카운터 배지

업무 보드 상단(`page-header` 영역)에 지연 업무 수를 빨간 배지로 상시 표시:
```
📌 업무 보드  [🔴 지연 3건]  [진행 중 | 전체 | 완료]  [전체 대상 ▼]
```

### 2-3. 대시보드 StatCard 개선

`DashboardDefaultView`의 6개 StatCard 중 '📋 오늘 업무' 카드에:
- 지연 업무가 있으면 카드 자체를 빨간 변형(variant)으로 렌더링
- 숫자 옆에 `(+3 지연)` 식으로 지연 카운트 병기

---

## Part 3. Bulk Action (G-4)

> **핵심:** 체크박스 기반 다중 선택 → 일괄 완료/삭제

### 3-1. TaskBoardPage UI 변경

1. 각 `TaskItem` 좌측에 체크박스 추가 (hover 시 표시, 선택 상태에서는 상시 표시)
2. 1개 이상 선택 시 상단에 **Floating Bulk Action Bar** 표시:
   ```
   ┌────────────────────────────────────────────┐
   │ ✅ 5개 선택됨  [일괄 완료]  [일괄 삭제]  [선택 해제]  │
   └────────────────────────────────────────────┘
   ```
3. `[일괄 완료]` 클릭 시:
   - 선택된 Task 중 워크플로 연동 Task가 있으면 → 개별 `CompleteModal` 순차 표시 (서류 검증 필요)
   - 워크플로 비연동 Task만 있으면 → 일괄 `actualTime` 입력 모달 1회 표시 후 전체 완료 처리

### 3-2. Backend 변경 필요

```
POST /api/tasks/bulk-complete
Body: { "task_ids": [1, 2, 3], "actual_time": "30m", "auto_worklog": true }

POST /api/tasks/bulk-delete
Body: { "task_ids": [1, 2, 3] }
```

---

## Part 4. 대시보드 ↔ 업무보드 역할 명확화 (G-5)

> **원칙:** 대시보드 = 아침 30초 현황파악, 업무보드 = 하루 종일 실무 처리

### 4-1. 대시보드 개선

- **Quick Complete(빠른 완료)** 기능 강화: 대시보드의 Task 카드에서 체크 아이콘 한 번 클릭 → 
  즉시 `CompleteModal` 진입 (현재 이미 `onQuickComplete` prop으로 존재, 동작 확인 및 보완)
- 대시보드에서는 Task **생성/편집/삭제 UI를 최소화** (이미 Quick Add만 존재, 확인)
- 업무보드(`/tasks`)로 이동하는 CTA 버튼을 각 섹션 헤더에 명확히 배치

### 4-2. 업무보드에서 대시보드 링크

- 업무보드 상단에 "오늘의 현황" 링크 → 대시보드로 복귀할 수 있는 경로 추가

---

## Files to modify / create

| # | Type | Target | Description |
|---|---|---|---|
| 1 | **[MODIFY]** | `frontend/src/components/CompleteModal.tsx` | 완료 전 서류 검증 + 금액 경고 로직 추가. Backend API `/api/tasks/{id}/completion-check` 호출. 필수 서류 미첨부 시 완료 버튼 Lock, 금액 미기입 시 경고 표시 |
| 2 | **[MODIFY]** | `frontend/src/pages/TaskBoardPage.tsx` | (1) `TaskItem`에 D-Day 색상 코딩 (border-left 색상 분기), (2) 체크박스 추가 및 Bulk Action Bar 구현, (3) Overdue 카운터 배지 |
| 3 | **[MODIFY]** | `frontend/src/components/dashboard/DashboardDefaultView.tsx` | StatCard에 지연 업무 카운트 반영, Quick Complete 동작 검증 |
| 4 | **[MODIFY]** | `frontend/src/components/dashboard/DashboardStatCard.tsx` | `variant` prop 확장하여 빨간 경고 변형 지원 |
| 5 | **[NEW]** | `backend/routers/task_completion.py` | `GET /api/tasks/{id}/completion-check` 엔드포인트: 워크플로 필수 서류 검증 + 캐피탈콜 금액 검증 결과 반환 |
| 6 | **[NEW]** | `backend/routers/task_bulk.py` | `POST /api/tasks/bulk-complete`, `POST /api/tasks/bulk-delete` 엔드포인트 |

---

## Acceptance Criteria

- [ ] **AC-01 (에러-프루프 Lock):** 워크플로 단계에 필수 서류(`required: true`)가 정의된 Task를 완료하려 할 때, 해당 서류가 미첨부면 `CompleteModal`의 완료 버튼이 `disabled` 되고 누락 서류 목록이 빨간 경고로 표시된다.
- [ ] **AC-02 (금액 경고):** 캐피탈콜 관련 Task 완료 시, 연결 Fund의 CapitalCall에 금액/납입일이 미기입이면 경고 메시지가 표시된다 (완료 자체는 가능하되 인지시킴).
- [ ] **AC-03 (D-Day 색상):** TaskBoardPage의 모든 TaskItem이 deadline 기준으로 자동 색상 코딩(빨강/주황/노랑/기본)되어, 지연된 업무가 시각적으로 즉시 구분된다.
- [ ] **AC-04 (Bulk Action):** TaskBoardPage에서 체크박스로 여러 Task를 선택한 후 `[일괄 완료]` 또는 `[일괄 삭제]` 버튼으로 한번에 처리할 수 있다.
- [ ] **AC-05 (Overdue 배지):** TaskBoardPage 상단에 지연 업무 수가 빨간 배지로 표시된다. 대시보드의 '오늘 업무' StatCard에도 지연 카운트가 반영된다.
- [ ] **AC-06 (기존 유지):** 기존 Q1~Q4 칸반, 드래그앤드롭, 캘린더, 워크플로 그룹, `KrwAmountInput` 한글 보조는 모두 그대로 유지된다.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` 컴포넌트 — 이미 완벽하게 동작 중, 건드리지 않는다
2. Q1~Q4 칸반 구조 — 삭제하지 않는다. D-Day 색상은 기존 구조 위에 오버레이한다
3. 대시보드의 Pipeline 뷰 (`TaskPipelineView`) — 별도 뷰로 유지한다
4. `WorkflowGroupCard` — 기존 Progress 배지 유지한다
