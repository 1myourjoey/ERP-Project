# Phase 45: 대시보드 UX 효율성 개선 (업무·워크플로 그룹핑 + 레이아웃 재구성)

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P0  
**의존성:** 없음 (독립 실행 가능)

**핵심 문제:** VC 운용사는 10+개 조합을 동시 운용하며, 동일 유형 업무(월보고, 총회, 내부보고)가 조합 수만큼 반복 생성된다. 현재 대시보드는 이를 1건씩 나열하여 "오늘 할 일" 이 100건으로 폭발하면 실질적으로 사용 불가.

**목표:**
1. 업무를 **카테고리별 그룹핑**으로 100건 → 5~8그룹으로 압축
2. 워크플로도 **템플릿별 그룹핑**으로 가독성 확보
3. 대시보드 레이아웃을 **사용자 행동 흐름** 기준으로 재배치
4. 긴급 알림에 **어떤 업무가 긴급인지** 구체적으로 표시
5. 불필요한 월보고 Task 생성 리마인더 제거
6. 기존 기능 100% 유지

---

## Part 0. 전수조사 (필수)

반드시 아래 파일을 먼저 읽고 현재 구조를 완전히 파악한 후 작업:

- [ ] `backend/routers/dashboard.py` — 4개 API 엔드포인트 + 데이터 구성 (1,042줄)
- [ ] `backend/schemas/dashboard.py` — PrioritizedTaskItem, ActiveWorkflowItem, 응답 스키마 (174줄)
- [ ] `frontend/src/pages/DashboardPage.tsx` — 로직/상태관리 (304줄)
- [ ] `frontend/src/components/dashboard/DashboardDefaultView.tsx` — 메인 뷰 (231줄)
- [ ] `frontend/src/components/dashboard/DashboardStatCard.tsx` — KPI 카드 (55줄)
- [ ] `frontend/src/components/dashboard/DashboardTaskPanels.tsx` — 업무 패널 (180줄)
- [ ] `frontend/src/components/dashboard/DashboardWorkflowPanel.tsx` — 워크플로 패널 (111줄)
- [ ] `frontend/src/components/dashboard/DashboardRightPanel.tsx` — 우측 패널 (338줄)
- [ ] `frontend/src/components/dashboard/DashboardOverlayLayer.tsx` — 오버레이/모달
- [ ] `frontend/src/components/dashboard/dashboardUtils.ts` — 유틸리티 함수
- [ ] `backend/schemas/task.py` — TaskResponse 스키마 (category, fund_name 필드 확인)

---

## Part 1. 프론트엔드 — 업무 그룹핑 로직

### 1-1. 그룹핑 유틸리티

#### [MODIFY] `frontend/src/components/dashboard/dashboardUtils.ts`

클라이언트 사이드 그룹핑 함수 추가:

```typescript
export interface TaskGroup {
  groupKey: string           // 그룹 식별자 (category 또는 title 패턴)
  groupLabel: string         // 표시 라벨 ("월보고", "투자심의" 등)
  groupType: 'category' | 'workflow' | 'individual'
  tasks: DashboardPrioritizedTask[]
  fundNames: string[]        // 포함된 조합명 목록
  urgencyMax: string         // 그룹 내 최고 긴급도
  dDayMin: number | null     // 가장 가까운 D-day
}

export function groupPrioritizedTasks(tasks: DashboardPrioritizedTask[]): TaskGroup[] {
  /**
   * 그룹핑 우선순위:
   * 1. task.category가 같은 업무끼리 그룹 (카테고리 기반)
   *    - TaskResponse에 이미 category 필드 존재
   *    - 같은 category + fund가 다르면 → 1그룹 (예: "월보고" 8건)
   * 
   * 2. workflow_info가 있으면 workflow_info.name으로 그룹
   *    - 같은 워크플로 템플릿에서 생성된 업무
   * 
   * 3. 위 둘에 해당하지 않는 개별 업무 → 각각 1그룹
   * 
   * 그룹 정렬: urgencyMax 기준 (overdue → today → tomorrow → this_week → upcoming)
   */
  
  const groups = new Map<string, TaskGroup>()
  
  for (const item of tasks) {
    const task = item.task
    
    // 그룹키 결정
    let groupKey: string
    let groupLabel: string
    let groupType: TaskGroup['groupType']
    
    if (task.category && task.category !== '일반') {
      groupKey = `cat_${task.category}`
      groupLabel = task.category
      groupType = 'category'
    } else if (item.workflow_info) {
      groupKey = `wf_${item.workflow_info.name}`
      groupLabel = item.workflow_info.name
      groupType = 'workflow'
    } else {
      groupKey = `ind_${task.id}`
      groupLabel = task.title
      groupType = 'individual'
    }
    
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        groupKey,
        groupLabel,
        groupType,
        tasks: [],
        fundNames: [],
        urgencyMax: item.urgency,
        dDayMin: item.d_day,
      })
    }
    
    const group = groups.get(groupKey)!
    group.tasks.push(item)
    
    const fundName = task.fund_name || task.gp_entity_name
    if (fundName && !group.fundNames.includes(fundName)) {
      group.fundNames.push(fundName)
    }
    
    // 최고 긴급도 갱신
    group.urgencyMax = higherUrgency(group.urgencyMax, item.urgency)
    if (item.d_day != null && (group.dDayMin == null || item.d_day < group.dDayMin)) {
      group.dDayMin = item.d_day
    }
  }
  
  return Array.from(groups.values()).sort(compareByUrgency)
}

// 워크플로 그룹핑
export interface WorkflowGroup {
  groupKey: string
  groupLabel: string
  workflows: ActiveWorkflow[]
  fundNames: string[]
}

export function groupWorkflows(workflows: ActiveWorkflow[]): WorkflowGroup[] {
  /**
   * workflow.name에서 공통 템플릿명 추출하여 그룹핑
   * 예: "A조합 결성", "B조합 결성" → 그룹 "결성" (2건)
   */
  ...
}
```

---

## Part 2. 프론트엔드 — TaskPanels 그룹핑 UI

### 2-1. 그룹핑된 업무 패널

#### [MODIFY] `frontend/src/components/dashboard/DashboardTaskPanels.tsx`

현재: 우선순위 업무를 1건씩 리스트로 표시
변경: 그룹별로 묶어서 표시, 펼치기/접기 가능

```
오늘 할 일 우선순위 (총 47건, 8그룹)

📊 월보고 작성                    8개 조합    D-3    ⚠️
   [펼치기 ▶]

🏛️ 조합원총회 소집통지            3개 조합    D-7
   [펼치기 ▶]

📋 내부보고회 자료 준비           5개 조합    D-1    ❌ 지연
   ├ A조합 — D+2 지연   [완료]
   ├ B조합 — D-1        [완료]
   ├ C조합 — D-1        [완료]
   └ ...2건 더 [모두 보기]

🔧 투자심의위 안건 작성           개별 업무    D-day  ⚠️
   (단일 업무는 바로 표시)

─── 이번주 마감 | 완료 ──── (기존 2칼럼 유지)
```

구현 사항:
- `groupPrioritizedTasks()` 호출하여 그룹 배열 생성
- 그룹당 1개의 카드(클릭 시 펼침)
- 그룹 카드에: 라벨, 건수, 조합명 나열, 최고 긴급도 배지, D-day
- 펼침 시: 개별 업무 리스트 (기존 스타일 유지)
- 개별 업무에서 `[완료]` 버튼 유지
- 그룹이 1건인 경우: 그룹 헤더 없이 개별 업무로 직접 표시
- **일괄 완료 버튼** 없음 (향후 추가 가능)

---

## Part 3. 프론트엔드 — WorkflowPanel 그룹핑 UI

### 3-1. 그룹핑된 워크플로 패널

#### [MODIFY] `frontend/src/components/dashboard/DashboardWorkflowPanel.tsx`

현재: 워크플로를 1건씩 2칼럼 카드로 표시
변경: 같은 유형 워크플로를 그룹핑

```
🔄 진행 중인 워크플로 (12건, 4그룹)

📦 결성 (3건)
   A조합 (3/5) | B조합 (2/5) | C조합 (1/5)    [펼치기 ▶]

💰 투자 심의 (4건)
   D-피투자A (2/4) | E-피투자B (3/4) | ...    [펼치기 ▶]

📑 보고 (5건)
   F~J조합 월보고 (1/3)                        [펼치기 ▶]
```

---

## Part 4. 프론트엔드 — DefaultView 레이아웃 재배치

### 4-1. 레이아웃 순서 변경

#### [MODIFY] `frontend/src/components/dashboard/DashboardDefaultView.tsx`

현재 순서 → 변경 후:

```
[현재]                              [변경 후]
1. KPI 5개 (1행)                   1. 🚨 긴급 알림 (최상단)
2. KPI 4개 (2행)                   2. KPI 5개 (핵심만, 1행)
3. 월보고 리마인더                   3. 월보고 리마인더
4. 긴급 알림                        4. 좌 2/3: 업무 그룹핑 + 이번주/완료
5. 좌 2/3: 워크플로 + 업무             우 1/3: 워크플로 그룹핑
6.   우 1/3: Quick View             5. Quick View (조합/통지/보고/서류)
```

변경 사항:
1. **긴급 알림을 KPI 위로 이동** → 가장 먼저 눈에 들어옴
2. **KPI 2행(5+4) → 1행 5개로 통합**
   - "오늘 우선업무", "이번주 마감", "진행 워크플로", "미수 서류", "오늘 완료" 유지
   - 2행(심의/NAV/미납LP/컴플라이언스)은 **삭제하지 말고** Quick View 조합 섹션에 통합
3. **업무 패널(좌)에 그룹핑된 TaskPanels 배치**
4. **워크플로 패널(우)로 이동** — 워크플로는 참고 정보이므로 사이드로
5. **Quick View(조합/통지/보고/서류)를 하단으로** — 접기/펼치기 유지

### 4-2. 한 화면 원칙 (No Scroll)

**대시보드는 스크롤 없이 한 화면(100vh)에서 핵심 정보를 한눈에 파악하는 페이지다.**

디자인 규칙:
- 전체 대시보드가 **뷰포트 높이(100vh) 내에 수용**되어야 함 (사이드바/헤더 제외)
- 각 섹션(업무, 워크플로, Quick View)은 **컴팩트하게** — 불필요한 여백/패딩 최소화
- 업무 그룹 리스트: **max-height 제한 + 내부 스크롤** (전체 페이지 스크롤 X)
- 워크플로: **max-height 제한 + 내부 스크롤**
- Quick View: **기본 접힘** 또는 매우 축소된 1줄 요약만 표시
- KPI 카드: **높이를 낮게** — 라벨 + 숫자만 (패딩 최소)
- 긴급 알림: 최대 **3줄** 표시, 나머지는 "더보기" 클릭
- 글자 크기: text-xs ~ text-sm 위주
- **목표: 1920×1080 해상도에서 페이지 스크롤 0**

---

## Part 5. 프론트엔드 — StatCard 개선

### 5-1. 2행 KPI 통합 처리

#### [MODIFY] `frontend/src/components/dashboard/DashboardStatCard.tsx`

기존 코드 유지하되, variant에 `compact` 추가 (2행 KPI를 작게 표시할 경우 대비).

### 5-2. 2행 KPI 데이터를 Quick View에 통합

#### [MODIFY] `frontend/src/components/dashboard/DashboardRightPanel.tsx`

조합 탭 상단에 추가:
```
── 운영 요약 ──
심의 진행 3건 | 운용 NAV 50억 | 미납 LP 2건 | 컴플라이언스 지연 1건
```

---

## Part 6. DefaultView Props 조정

### 6-1. DashboardDefaultViewProps

#### [MODIFY] `frontend/src/components/dashboard/DashboardDefaultView.tsx`

Props 인터페이스 변경 **금지**. 기존 Props를 그대로 받되 내부에서 그룹핑 처리:

```typescript
function DashboardDefaultView(props: DashboardDefaultViewProps) {
  // 그룹핑은 컴포넌트 내부에서 처리
  const taskGroups = useMemo(
    () => groupPrioritizedTasks(props.prioritizedTasks),
    [props.prioritizedTasks]
  )
  const workflowGroups = useMemo(
    () => groupWorkflows(props.activeWorkflows),
    [props.activeWorkflows]
  )
  
  // ...나머지 기존 로직 유지
}
```

---

## ⚠️ 기능 보호 규칙 (절대 위반 금지)

- `DashboardPage.tsx`의 **모든 Hook/Mutation/Query 로직** 변경 금지
- `DashboardDefaultViewProps` **인터페이스 변경 금지**
- **이벤트 핸들러** (onOpenTask, onQuickComplete, onOpenWorkflow 등) 변경 금지
- **API 엔드포인트** (backend/routers/dashboard.py) 변경 금지
- **모달/오버레이 동작** (CompleteModal, EditTaskModal, WorkflowModal) 변경 금지
- 기존 **클릭 → 상세 이동** 동작 모두 유지

---

## Part 7. 긴급 알림 상세화

### 7-1. 어떤 업무가 긴급인지 표시

#### [MODIFY] `frontend/src/components/dashboard/DashboardDefaultView.tsx`

현재 긴급 알림은 "오늘 기준 지연 업무 3건" 처럼 **건수만** 표시한다.
변경: 구체적으로 **어떤 업무가 긴급인지** 나열한다.

```
🚨 긴급 알림

❌ 지연 업무 (3건)
 ├ A조합 월보고 제출 — D+3 지연  [바로가기]
 ├ B조합 수탁계약 검토 — D+1 지연  [바로가기]
 └ 투자심의위 안건 작성 — D+2 지연  [바로가기]

⚠️ 캐피탈콜 납입기한 2일 전 — C조합  [바로가기]
⚠️ 영업보고서 기한 3일 전 — D조합  [바로가기]
```

구현:
- `baseData.urgent_alerts`의 각 항목을 개별 줄로 표시 (현재도 `.map()` 으로 표시 중)
- 추가로: `prioritizedTasks`에서 `urgency === 'overdue'`인 업무를 알림 영역에 **직접 나열**
- 각 항목에 클릭 시 해당 업무 상세로 이동 (`onOpenTask` 호출)
- 지연 업무는 ❌, 오늘 마감은 ⚠️ 아이콘으로 구분

---

## Part 8. 월보고 리마인더 제거

### 8-1. monthlyReminder 배너 삭제

#### [MODIFY] `frontend/src/components/dashboard/DashboardDefaultView.tsx`

현재 존재하는 아래 코드 블록을 **완전히 제거**:
```
{monthlyReminder && (
  <div className="warning-banner">
    <p>이번 달 월간 보고 Task가 아직 생성되지 않았습니다.</p>
    <button onClick={...}>지금 생성</button>
  </div>
)}
```

이 기능은 실무적으로 불필요하므로 전체 삭제한다.
`monthlyReminder`, `monthlyReminderPending`, `onGenerateMonthlyReminder` props는 받되 사용하지 않는 것으로 처리 (Props 인터페이스 변경 금지).

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [MODIFY] | `frontend/src/components/dashboard/dashboardUtils.ts` | groupPrioritizedTasks, groupWorkflows 함수 추가 |
| 2 | [MODIFY] | `frontend/src/components/dashboard/DashboardDefaultView.tsx` | 레이아웃 재배치 + 그룹핑 + 긴급알림 상세 + 월보고리마인더 제거 |
| 3 | [MODIFY] | `frontend/src/components/dashboard/DashboardTaskPanels.tsx` | 그룹핑 UI (펼치기/접기) |
| 4 | [MODIFY] | `frontend/src/components/dashboard/DashboardWorkflowPanel.tsx` | 워크플로 그룹핑 UI |
| 5 | [MODIFY] | `frontend/src/components/dashboard/DashboardRightPanel.tsx` | 2행 KPI 통합 |
| 6 | [MODIFY] | `frontend/src/components/dashboard/DashboardStatCard.tsx` | compact variant 추가 (필요 시) |

---

## Acceptance Criteria

- [ ] **AC-01:** 같은 category의 업무가 1그룹으로 묶여 표시된다 (예: "월보고 8건").
- [ ] **AC-02:** 그룹을 클릭하면 펼쳐져서 개별 업무가 나타난다.
- [ ] **AC-03:** 개별 업무에서 기존 [완료] 버튼, 클릭→상세 기능이 동작한다.
- [ ] **AC-04:** 1건뿐인 그룹은 그룹 헤더 없이 개별 업무로 직접 표시된다.
- [ ] **AC-05:** 워크플로가 같은 템플릿 유형별로 그룹핑된다.
- [ ] **AC-06:** 긴급 알림이 KPI 카드 위(최상단)에 표시된다.
- [ ] **AC-07:** KPI 1행만 표시되고, 2행 데이터는 Quick View에 통합된다.
- [ ] **AC-08:** 기존 DashboardPage.tsx의 Hook/Mutation/API 호출이 변경되지 않는다.
- [ ] **AC-09:** 기존 모든 클릭 동작(업무 상세, 워크플로 상세, 조합 이동 등)이 유지된다.
- [ ] **AC-10:** 그룹 정렬은 긴급도 기준 (overdue → today → tomorrow → this_week).
- [ ] **AC-11:** 긴급 알림에 지연 업무가 구체적으로 나열되고 클릭 시 상세로 이동된다.
- [ ] **AC-12:** 월보고 Task 생성 리마인더 배너가 제거되었다.
