# Phase 12-1: Dashboard Completed-Card Relocation · Capital-Call UI · Workflow Full Koreanization

> **Priority:** P0 (Phase 12 supplement)

---

## Table of Contents

1. [Part 1 — Dashboard: Completed card refactor + StatCard click modal](#part-1--dashboard-completed-card-refactor--statcard-click-modal)
2. [Part 2 — Fund Management: Capital-call add UI + Workflow linkage](#part-2--fund-management-capital-call-add-ui--workflow-linkage)
3. [Part 3 — Workflows: Full Koreanization + Broken chars fix + Seed templates](#part-3--workflows-full-koreanization--broken-chars-fix--seed-templates)
4. [Files to modify](#files-to-modify)
5. [Acceptance Criteria](#acceptance-criteria)

---

## Part 1 — Dashboard: Completed card refactor + StatCard click modal

### 1-A. Move "Completed Today" card to the right panel

**Current state:**  
In `DashboardPage.tsx`, the "오늘 완료" (Completed Today) section is rendered inside the left 2/3 area (`lg:col-span-2`), below the Today/Tomorrow task lists.

**Required change:**  
Move the "오늘 완료" section to the **right 1/3 panel** (below the 조합/통지/보고/서류 tab content area), as an independent card.

**Implementation details:**

1. Remove the existing completed section (around lines 292–305).
2. Add the following card **inside the right panel `<div className="space-y-3">` block** (after the tab content, around line 330):

```tsx
{/* Completed card — always visible, even when empty */}
<div className="card-base">
  <div className="mb-2 flex items-center justify-between">
    <h3 className="text-sm font-semibold text-emerald-700">완료 업무</h3>
    {/* Filter tabs: 오늘 / 이번 주 / 전주 */}
    <div className="flex gap-1 rounded bg-gray-100 p-0.5 text-xs">
      {(['today', 'this_week', 'last_week'] as const).map((key) => (
        <button key={key} onClick={() => setCompletedFilter(key)}
          className={`rounded px-2 py-1 ${completedFilter === key ? 'bg-white font-medium text-emerald-700 shadow' : 'text-gray-500'}`}>
          {key === 'today' ? '오늘' : key === 'this_week' ? '이번 주' : '전주'}
        </button>
      ))}
    </div>
  </div>

  {filteredCompleted.length === 0 ? (
    <p className="text-sm text-gray-400 text-center py-4">완료된 업무가 없습니다.</p>
  ) : (
    <div className="space-y-1 max-h-64 overflow-y-auto">
      {filteredCompleted.map((task) => (
        <div key={task.id} className="flex items-center justify-between text-sm">
          <button onClick={() => setSelectedTask(task)}
            className="truncate text-left line-through text-gray-400 hover:text-blue-600">
            {task.title}
          </button>
          <div className="ml-2 flex items-center gap-2">
            {task.actual_time && <span className="text-xs text-gray-400">{task.actual_time}</span>}
            <button onClick={() => undoCompleteMut.mutate(task.id)}
              className="text-xs text-blue-500 hover:underline">되돌리기</button>
          </div>
        </div>
      ))}
    </div>
  )}
</div>
```

3. Add new state and memo:

```tsx
const [completedFilter, setCompletedFilter] = useState<'today' | 'this_week' | 'last_week'>('today')

const filteredCompleted = useMemo(() => {
  if (completedFilter === 'today') return completed_today
  if (completedFilter === 'this_week') return data?.completed_this_week ?? completed_today
  return data?.completed_last_week ?? []
}, [completedFilter, completed_today, data])
```

4. **Backend change** (`backend/routers/dashboard.py`):  
Add `completed_this_week` and `completed_last_week` fields to the dashboard response.

```python
from datetime import timedelta

week_start = today - timedelta(days=today.weekday())
completed_this_week_tasks = db.query(TaskModel).filter(
    TaskModel.status == "completed",
    TaskModel.completed_at >= str(week_start),
    TaskModel.completed_at < str(week_start + timedelta(days=7)),
).order_by(TaskModel.completed_at.desc()).all()

last_week_start = week_start - timedelta(days=7)
completed_last_week_tasks = db.query(TaskModel).filter(
    TaskModel.status == "completed",
    TaskModel.completed_at >= str(last_week_start),
    TaskModel.completed_at < str(week_start),
).order_by(TaskModel.completed_at.desc()).all()
```

5. **Frontend API type** (`frontend/src/lib/api.ts`):  
Add to `DashboardResponse`:
```tsx
completed_this_week: Task[]
completed_last_week: Task[]
```

### 1-B. StatCard click → list popup modal

**Current state:**  
The 6 `StatCard` components at the top of `DashboardPage.tsx` display numbers only, with no `onClick`.

**Required change:**  
Clicking any StatCard opens the existing `ListPopupModal` showing the corresponding list.

**Implementation:**

1. Add `onClick` prop to `StatCard`:

```tsx
function StatCard({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  return (
    <div onClick={onClick}
      className={`rounded-xl border border-gray-200 bg-white p-3 ${onClick ? 'cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all' : ''}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  )
}
```

2. Wire each StatCard to `setPopupSection`:

```tsx
<StatCard label="오늘 업무" value={today.tasks.length} onClick={() => setPopupSection('today')} />
<StatCard label="이번 주" value={this_week.length} onClick={() => setPopupSection('this_week')} />
<StatCard label="진행 워크플로" value={active_workflows.length} onClick={() => setPopupSection('workflows')} />
<StatCard label="미수집 서류" value={missing_documents.length} onClick={() => setPopupSection('documents')} />
<StatCard label="보고 마감" value={upcoming_reports.length} onClick={() => setPopupSection('reports')} />
<StatCard label="오늘 완료" value={completed_today_count} onClick={() => setPopupSection('completed')} />
```

3. Replace the last emerald-colored `<div>` (line ~261) with the `StatCard` component, keeping emerald styling via a wrapper or a variant prop.

---

## Part 2 — Fund Management: Capital-call add UI + Workflow linkage

### 2-A. Capital-call inline add form in FundDetailPage

**Current state:**  
`FundDetailPage.tsx` shows a capital-call history table (lines ~461–506) that only reads data. There is **no UI to add a new capital call**.

**Required change:**  
Add a **"+ 출자 추가"** button at the top-right of the capital-call card. Clicking it toggles an inline form to create a new `CapitalCall`.

**Implementation:**

1. Add to `FundDetailPage.tsx` state:

```tsx
const [showAddCapitalCall, setShowAddCapitalCall] = useState(false)
const [newCapitalCall, setNewCapitalCall] = useState({
  call_date: '', total_amount: null as number | null, call_type: '', memo: ''
})
```

2. Add mutation:

```tsx
const createCapitalCallMut = useMutation({
  mutationFn: (data: { call_date: string; total_amount: number | null; call_type?: string; memo?: string }) =>
    createCapitalCall(fundId, data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['capitalCalls', { fund_id: fundId }] })
    queryClient.invalidateQueries({ queryKey: ['fund', fundId] })
    setShowAddCapitalCall(false)
    setNewCapitalCall({ call_date: '', total_amount: null, call_type: '', memo: '' })
    addToast('success', '출자가 추가되었습니다.')
  },
})
```

3. Render: Add button and inline form above the existing table (see Part 2 code in the Korean version for full JSX).

4. **API** (`frontend/src/lib/api.ts`): Add `createCapitalCall` function:

```tsx
export async function createCapitalCall(fundId: number, data: {
  call_date: string; total_amount: number | null; call_type?: string | null; memo?: string | null;
}) {
  const res = await fetch(`/api/capital-calls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, fund_id: fundId }),
  })
  if (!res.ok) throw new Error('Failed to create capital call')
  return res.json()
}
```

### 2-B. Seed workflow templates for fund/investment processes

The `03_Workflows/` folder contains 3 markdown files defining fund-management processes. These must be converted into seed workflow templates so users can run them from the Workflows page. See **Part 3-D** below for the full list.

---

## Part 3 — Workflows: Full Koreanization + Broken chars fix + Seed templates

### 3-A. Fix broken/garbled strings

The following lines in `WorkflowsPage.tsx` contain garbled characters due to encoding issues:

| Line | Current (broken) | Replace with |
|------|------------------|-------------|
| 592 | `'?쒗뵆由??뺣낫瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??'` | `'템플릿 정보를 불러오지 못했습니다.'` |
| 642 | `鸚?` | ` · ` (middle dot separator) |

### 3-B. Full UI Koreanization

Replace **ALL** English UI strings in `WorkflowsPage.tsx` with Korean. The complete mapping:

| Current (English) | Replace with (Korean) |
|---|---|
| `Workflows` (page-title, line 612) | `워크플로우` |
| `Template and instance management` (line 613) | `템플릿 및 인스턴스 관리` |
| `New template` (button, line 615) | `+ 새 템플릿` |
| `Templates` (tab, line 621) | `템플릿` |
| `Active` (tab, line 622) | `진행 중` |
| `Completed` (tab, line 623) | `완료` |
| `No templates.` (line 636) | `등록된 템플릿이 없습니다.` |
| `Print` (button, ×3) | `인쇄` |
| `Edit` (button, ×2) | `수정` |
| `Delete` (button) | `삭제` |
| `Select a template.` (line 668) | `템플릿을 선택하세요.` |
| `No instances.` (line 484) | `인스턴스가 없습니다.` |
| `Cancel instance` (line 525) | `인스턴스 취소` |
| `Delete this template?` (confirm, line 652) | `이 템플릿을 삭제하시겠습니까?` |
| `Cancel this instance?` (confirm, line 525) | `이 인스턴스를 취소하시겠습니까?` |
| `Start` (button, line 412) | `실행` |
| `Run` (button, line 442) | `실행` |
| `Cancel` (button, lines 302, 443) | `취소` |
| `Instance name` (placeholder, line 415) | `인스턴스 이름` |
| `Related fund (optional)` (line 418) | `관련 조합 (선택)` |
| `Related company (optional)` (line 422) | `관련 회사 (선택)` |
| `Related investment (optional)` (line 426) | `관련 투자 (선택)` |
| `Memo (optional)` (line 440) | `메모 (선택)` |
| `Template name` (line 281) | `템플릿 이름` |
| `Category` (line 282) | `카테고리` |
| `Total duration` (line 283) | `총 기간` |
| `Trigger description` (line 284) | `트리거 설명` |
| `Step name` (line 289) | `단계 이름` |
| `Timing` (line 290) | `시점` |
| `Offset` (line 291) | `오프셋` |
| `Estimate` (line 292) | `예상 시간` |
| `Quadrant` (line 293) | `사분면` |
| `Memo` (line 294) | `메모` |
| `Delete step` (line 295) | `단계 삭제` |
| `+ Add step` (line 298) | `+ 단계 추가` |
| `Create template` (line 686) | `템플릿 생성` |
| `Create` (submitLabel, line 686) | `생성` |
| `Edit template` (line 694) | `템플릿 수정` |
| `Save` (submitLabel, line 694) | `저장` |
| `Template created.` (toast, line 557) | `템플릿이 생성되었습니다.` |
| `Template updated.` (toast, line 567) | `템플릿이 수정되었습니다.` |
| `Template deleted.` (toast, line 576) | `템플릿이 삭제되었습니다.` |
| `Workflow instance started.` (toast, line 373) | `워크플로우 인스턴스가 시작되었습니다.` |
| `Step completed.` (toast, line 471) | `단계가 완료되었습니다.` |
| `Instance cancelled.` (toast, line 479) | `인스턴스가 취소되었습니다.` |
| `business days before target date.` (line 436) | `영업일 전 통지 필요.` |
| `Target ... / notice deadline ...` (line 437) | `기준일 ... / 통지 기한 ...` |

### 3-C. Koreanize DEFAULT_NOTICE_TYPES

Replace the `DEFAULT_NOTICE_TYPES` array (lines 44–53) with Korean labels:

```tsx
const DEFAULT_NOTICE_TYPES = [
  { notice_type: 'assembly', label: '총회 소집 통지' },
  { notice_type: 'capital_call_initial', label: '최초 출자금 납입 요청' },
  { notice_type: 'capital_call_additional', label: '수시 출자금 납입 요청' },
  { notice_type: 'ic_agenda', label: '투자심의위원회 안건 통지' },
  { notice_type: 'distribution', label: '분배 통지' },
  { notice_type: 'dissolution', label: '해산/청산 통지' },
  { notice_type: 'lp_report', label: '조합원 보고' },
  { notice_type: 'amendment', label: '규약 변경 통지' },
]
```

### 3-D. Seed workflow templates from `03_Workflows/`

Add the following **11 workflow templates** to `backend/scripts/seed_data.py` via a `seed_workflow_templates()` function. Use the existing `WorkflowTemplate`, `WorkflowStep`, `WorkflowDocument`, `WorkflowWarning` models.

**Source: `03_Workflows/investment.md`** (3 templates)

| # | Template name | Category | Trigger | Duration | Steps | Docs | Warnings |
|---|---|---|---|---|---|---|---|
| 1 | 투자심의위원회 (투심위) | 투자실행 | 투자 결정 확정 시 | 1~2주 | 7 steps (§1단계) | 7 | 3 |
| 2 | 투자계약 체결 | 투자실행 | 투심위 통과 후 계약일 확정 시 | 3~5일 | 8 steps (§2단계) | 10 (4+6) | 4 |
| 3 | 투자 후 서류처리 | 투자실행 | 투자금 출금 완료 후 | 2~3주 | 6 steps (§3단계) | 10 (6+4) | 5 |

**Source: `03_Workflows/fund_formation.md`** (4 templates)

| # | Template name | Category | Trigger | Duration | Steps | Docs | Warnings |
|---|---|---|---|---|---|---|---|
| 4 | 고유번호증 발급 | 조합결성 | 신규 조합 제안 확정 시 | 3~5일 | 4 | 3 | 0 |
| 5 | 수탁계약 체결 | 조합결성 | 고유번호증 발급 후 | 3~5일 | 4 | 6 | 1 |
| 6 | 결성총회 개최 | 조합결성 | 수탁계약 체결 후 | 2~3주 | 6 | 11 (6+5) | 3 |
| 7 | 벤처투자조합 등록 | 조합결성 | 결성총회 완료 후 | 3~5일 | 3 | 0 | 0 |

**Source: `03_Workflows/regular_tasks.md`** (4 templates)

| # | Template name | Category | Trigger | Duration | Steps |
|---|---|---|---|---|---|
| 8 | 월간 보고 (농금원/벤처협회) | 정기보고 | 매월 초 | 매월 5일까지 | 2 |
| 9 | 분기 내부보고회 | 정기보고 | 분기별 | 약 2주 | 4 |
| 10 | 기말감사 | 연간업무 | 1~2월 | 약 3개월 | 7 (+ 6 docs, 2 warnings) |
| 11 | 정기 총회 | 연간업무 | 매년 3월 | 약 4주 | 4 (+ 4 docs) |

Each template's **steps** should use the exact task names, timings (`D-day`, `D-3`, `D+7`, etc.), estimated times, and `quadrant` values from the corresponding markdown files. Include all **documents** (as `WorkflowDocument`) and **warnings** (as `WorkflowWarning` with `category='warning'`).

---

## Files to modify

| # | File | Changes |
|---|------|---------|
| 1 | `frontend/src/pages/DashboardPage.tsx` | Move completed card to right panel; add today/this_week/last_week filter; add StatCard onClick; unify last emerald card into StatCard |
| 2 | `frontend/src/lib/api.ts` | Add `completed_this_week`, `completed_last_week` to `DashboardResponse`; add `createCapitalCall` function |
| 3 | `backend/routers/dashboard.py` | Add `completed_this_week` / `completed_last_week` response fields |
| 4 | `frontend/src/pages/FundDetailPage.tsx` | Add "출자 추가" button + inline form to capital-call card |
| 5 | `frontend/src/pages/WorkflowsPage.tsx` | Full Koreanization (~45+ strings); fix 2 garbled strings; Koreanize `DEFAULT_NOTICE_TYPES` |
| 6 | `backend/scripts/seed_data.py` | Add 11 workflow templates with steps, documents, and warnings |

---

## Acceptance Criteria

### Part 1: Dashboard

- [ ] AC-01: "완료 업무" card appears in the **right panel** (below 조합/통지/보고/서류 tabs)
- [ ] AC-02: The card is **always visible** even with 0 completed tasks (shows "완료된 업무가 없습니다.")
- [ ] AC-03: Filter tabs (오늘 / 이번 주 / 전주) switch the completed list
- [ ] AC-04: All 6 top StatCards are clickable → open `ListPopupModal` with the corresponding list
- [ ] AC-05: Last "오늘 완료" StatCard uses the `StatCard` component (emerald styling preserved, onClick added)

### Part 2: Capital-call

- [ ] AC-06: FundDetailPage capital-call card has a "출자 추가" button
- [ ] AC-07: Button toggles an inline form (납입일, 납입금액, 유형 select, 비고)
- [ ] AC-08: Saving the form creates a CapitalCall and refreshes the table

### Part 3: Workflow Koreanization

- [ ] AC-09: All English UI strings in `WorkflowsPage.tsx` are replaced with Korean (~45+ strings)
- [ ] AC-10: Two garbled strings (line 592, 642) are fixed
- [ ] AC-11: `DEFAULT_NOTICE_TYPES` labels are in Korean (8 items)
- [ ] AC-12: Seed data includes 11 workflow templates (3 investment + 4 fund formation + 4 regular tasks)
- [ ] AC-13: Seed templates include documents and warnings from the `03_Workflows/` markdown files

---

**Last updated:** 2026-02-15
