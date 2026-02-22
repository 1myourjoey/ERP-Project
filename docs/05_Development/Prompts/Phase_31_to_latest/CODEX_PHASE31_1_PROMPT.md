# Phase 31_1: 업무보드 보조 뷰(캘린더·파이프라인) 효율성 극대화 + UX 보조 장치

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 및 아래 참조 문서를 먼저 읽을 것.
>
> **참조 PRD:** `docs/06_PRD/PRD_01_Dashboard.md`, `docs/06_PRD/PRD_02_TaskBoard.md`
> **참조 플로우차트:** `docs/06_PRD/Flowchart/v_on_erp_comprehensive_flow.md` (Page 01, 02)
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist를 반드시 수행할 것.

**Priority:** P1 (UX Consistency)

---

## 🚨 배경: Phase 31 이후 남은 효율성 갭

Phase 31에서 업무보드의 핵심 기능(D-Day 색상 코딩, Bulk Action, CompleteModal 에러프루프)을 구축했습니다.
그러나 업무보드의 **보조 뷰(캘린더, 파이프라인)**는 아직 이 효율성 개선 흐름에 합류하지 못했고,
필터 탭의 의미도 실무자에게 직관적으로 전달되지 않고 있습니다.

---

## Part 1. 필터 탭 설명 툴팁 (진행 중 / 전체 / 완료)

### 1-1. 현재 문제

업무보드 상단의 `[진행 중 | 전체 | 완료]` 3개 탭이 구분 없이 나열되어 있어,
실무자가 "진행 중과 전체가 뭐가 다르지?"라고 혼동합니다.

**Backend 로직 (참조):**
- `pending` (진행 중): `Task.status == 'pending'`인 **미완료 업무만** 표시
- `all` (전체): 미완료 + 완료 **전체** 표시
- `completed` (완료): `Task.status == 'completed'`인 **완료된 업무만** 표시 (연/월 필터 추가)

### 1-2. 구현 내용

각 필터 탭 옆에 **ⓘ (info)** 아이콘을 배치하고, hover 시 툴팁으로 설명을 표시합니다.

| 탭 | 툴팁 내용 |
|---|---|
| **진행 중** | `현재 미완료된 업무만 표시합니다.` |
| **전체** | `미완료 + 완료된 업무를 모두 표시합니다.` |
| **완료** | `완료 처리된 업무만 표시합니다. 연도/월 필터를 사용할 수 있습니다.` |

**구현 위치:** `TaskBoardPage.tsx` — 필터 탭 영역 (약 989~1002줄 근처)

**디자인:**
- `ⓘ` 아이콘은 `lucide-react`의 `HelpCircle` (size=13, `text-gray-400`)
- 마우스 hover 시 하단에 작은 말풍선(tooltip) 표시 (CSS-only 또는 간단한 state)
- 모바일에서는 탭 클릭 시 탭 하단에 1줄 텍스트로 설명 표시

---

## Part 2. 캘린더 뷰 효율성 개선

### 2-1. 현재 문제

현재 `MiniCalendar`(`src/components/MiniCalendar.tsx`, 254줄)는:
- 날짜별 점(dot)으로 업무/워크플로/일정 유무만 표시
- **D-Day 색상 코딩 없음** (모든 업무가 같은 파란 점)
- **빠른 완료(Quick Complete) 불가** — Task 클릭 시 상세 모달만 열림
- **지연(Overdue) 시각 표현 없음** — 기한이 지난 업무도 같은 색으로 표시
- 날짜별 이벤트 목록에서 **상태 구분이 약함** — `labelStatus`로 텍스트만 표시

### 2-2. 구현 내용

#### A. 날짜 셀 D-Day 색상 코딩

```
기한 지난 업무가 있는 날짜 → 셀 배경을 연한 빨강 (bg-red-50, border-red-300)
오늘 마감 업무가 있는 날짜 → 셀 배경을 연한 주황 (bg-orange-50)
기본 → 현재 스타일 유지
```

미완료 업무(`status !== 'completed'`)의 dot 색상도 D-Day 기반으로 변경:
- 지연(Overdue): `bg-red-500` (기존 `bg-blue-500` 대신)
- 오늘 마감: `bg-orange-500`
- 이번 주: `bg-amber-400`
- 기본: `bg-blue-500` (현재와 동일)

#### B. 이벤트 목록 개선

선택된 날짜의 이벤트 목록(`selectedEvents`)에서:

1. **Overdue 업무를 최상단에 고정**, 빨간 border-left 추가
2. **Quick Complete 버튼 추가**: Task 타입 이벤트에 ✅ 아이콘 버튼 → 클릭 시 `onTaskComplete(taskId)` 콜백 호출
   - 이를 위해 `MiniCalendar`의 props에 `onTaskComplete?: (taskId: number) => void` 추가
   - `TaskBoardPage`에서 이 콜백을 `setCompletingTask`로 연결
3. **상태 배지 색상 강화**: `pending`은 파란 배지, `completed`는 초록 배지, overdue는 빨간 배지

#### C. 범례(Legend) 개선

현재 범례:
```
● 업무  ● 워크플로우  ● 일정
```

변경 후:
```
● 업무  ● 워크플로우  ● 일정  | 🔴 지연  🟠 오늘  🟡 이번주
```

---

## Part 3. 파이프라인 뷰 위치 재배치 + 기능 강화

### 3-1. 위치 분석 및 결론

**현재 위치:** 대시보드 탭 내의 전환 뷰 (`DashboardPage?view=pipeline`)

**분석:**
- 대시보드의 목적 = **"아침 30초 현황 파악"** → 빠르게 숫자 확인하고 업무보드로 이동
- 파이프라인의 목적 = **"업무 간 유기적 연결 관계 파악"** → Task와 워크플로가 어디에서 어디로 흐르는지 심층 확인
- 파이프라인은 685줄 짜리 복잡한 SVG 관계선 시각화 컴포넌트 → **심층 작업(deep work)** 도구
- **대시보드에서 30초 현황 파악용으로 파이프라인을 보는 것은 비효율적**

**결론: 파이프라인은 업무보드(`/tasks`)의 보조 뷰로 이동하는 것이 적합합니다.**

| | 대시보드 | 업무보드 |
|---|---|---|
| 목적 | 빠른 현황 파악 | 깊은 업무 관리 |
| 사용 시간 | 30초~1분 | 하루 종일 |
| 파이프라인 적합도 | ❌ 너무 무거움 | ✅ 업무 흐름 파악에 적합 |

### 3-2. 구현 내용

#### A. 업무보드에 3개 뷰 탭 구성

현재 업무보드: `[업무보드 | 캘린더]` 2개 토글

변경 후: `[보드 | 캘린더 | 파이프라인]` 3개 탭

```
📌 업무 보드  [🔴 지연 3건]  [보드 | 캘린더 | 파이프라인]  [진행 중 | 전체 | 완료]  [전체 대상 ▼]
```

- **보드**: 기존 Q1~Q4 칸반 (현재와 동일)
- **캘린더**: 기존 MiniCalendar (Part 2의 개선 적용)
- **파이프라인**: 기존 TaskPipelineView를 여기로 이동

#### B. 대시보드에서 파이프라인 뷰 제거

`DashboardPage.tsx`에서:
- `[대시보드 | 파이프라인]` 전환 토글 제거
- `TaskPipelineView` import 및 렌더링 코드 제거
- `searchParams` 기반 `view=pipeline` 분기 제거
- 대시보드는 항상 `DashboardDefaultView`만 렌더링

#### C. 대시보드에 파이프라인 바로가기 추가

대시보드의 워크플로 패널(`DashboardWorkflowPanel`)에 `[파이프라인 보기]` 버튼 추가:
- 클릭 시 `navigate('/tasks?view=pipeline')` → 업무보드 파이프라인 뷰로 이동
- 기존 `[업무보드]` 버튼 옆에 배치

#### D. 파이프라인 뷰 개선

`TaskPipelineView`에 다음 기능 추가:

1. **D-Day 색상 코딩 반영**: 각 Task 카드의 border-left 색상을 Phase 31에서 도입한 D-Day 색상 로직과 동일하게 적용 (지연=빨강, 오늘=주황, 이번주=노랑)

2. **Overdue 스테이지 추가**: 현재 4개 스테이지(대기/오늘/이번주/예정) → **5개로 확장**
   ```
   🔴 지연(Overdue) → 오늘 → 이번 주 → 예정 → 대기(기한없음)
   ```
   - 지연 스테이지: `deadline < today && status !== 'completed'`인 Task를 자동 분류
   - 빨간 배경(`bg-red-50`) + 빨간 보더(`border-red-200`)

3. **관계선 범례 추가**: SVG 관계선의 색상이 무엇을 의미하는지 알 수 있도록 하단에 범례 표시
   ```
   — 워크플로  — 투자  — 조합  — 고유계정  ┈ 통지/보고
   ```

---

## Files to modify / create

| # | Type | Target | Description |
|---|---|---|---|
| 1 | **[MODIFY]** | `frontend/src/pages/TaskBoardPage.tsx` | (1) 필터 탭에 ⓘ 툴팁 추가, (2) 캘린더/파이프라인을 포함한 3탭 뷰 체계로 전환, (3) 파이프라인 뷰 import 및 렌더링 추가 |
| 2 | **[MODIFY]** | `frontend/src/components/MiniCalendar.tsx` | D-Day 색상 dot, 이벤트 목록에 overdue 강조 + Quick Complete 버튼, 범례 개선 |
| 3 | **[MODIFY]** | `frontend/src/components/TaskPipelineView.tsx` | Overdue 스테이지 추가, D-Day 색상 코딩, 관계선 범례 추가 |
| 4 | **[MODIFY]** | `frontend/src/pages/DashboardPage.tsx` | 파이프라인 뷰 전환 토글 제거, DashboardDefaultView만 상시 렌더링, `searchParams` `view=pipeline` 분기 제거 |
| 5 | **[MODIFY]** | `frontend/src/components/dashboard/DashboardWorkflowPanel.tsx` | `[파이프라인 보기]` 바로가기 버튼 추가 (→ `/tasks?view=pipeline`) |

---

## Acceptance Criteria

- [ ] **AC-01 (필터 툴팁):** 업무보드의 `[진행 중 | 전체 | 완료]` 탭에 ⓘ 아이콘이 있고, hover 시 각 필터의 의미가 툴팁으로 표시된다.
- [ ] **AC-02 (캘린더 D-Day):** 캘린더의 날짜 셀과 dot 색상이 D-Day 기반으로 구분된다 (지연=빨강, 오늘=주황). 이벤트 목록에서 overdue 업무가 상단에 고정되고 빨간 강조 표시된다.
- [ ] **AC-03 (캘린더 Quick Complete):** 캘린더 이벤트 목록의 Task 항목에 ✅ 버튼이 있고, 클릭 시 CompleteModal이 열려 빠른 완료가 가능하다.
- [ ] **AC-04 (파이프라인 이동):** 파이프라인 뷰가 대시보드에서 제거되고, 업무보드의 3번째 탭(`[보드 | 캘린더 | 파이프라인]`)으로 이동된다.
- [ ] **AC-05 (파이프라인 Overdue 스테이지):** 파이프라인에 🔴 지연(Overdue) 스테이지가 최좌측에 추가되어, 기한이 지난 업무들이 빨간 컬럼으로 분류된다.
- [ ] **AC-06 (대시보드 간소화):** 대시보드에는 `[대시보드 | 파이프라인]` 전환 토글이 없고, 항상 기본 뷰만 표시된다. 워크플로 패널에 `[파이프라인 보기]` 바로가기가 있다.
- [ ] **AC-07 (기존 유지):** 기존 Q1~Q4 칸반, 드래그앤드롭, Bulk Action, CompleteModal 에러프루프는 모두 그대로 유지된다.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. Q1~Q4 칸반 구조 — 삭제하지 않는다
3. `CompleteModal` 에러프루프 검증 로직 (Phase 31) — 건드리지 않는다
4. `WorkflowGroupCard` — 기존 Progress 배지 유지
5. 대시보드의 `DashboardDefaultView`, `DashboardRightPanel` 구조 — 유지
