# Phase 11: Fund Overview Date-Aware Filtering, Task Board UX Overhaul, Dashboard Quick-Complete & Completed Summary

## Context

This is a 1-person VC back-office ERP (Trigger Investment Partners).
- Stack: FastAPI + SQLAlchemy + SQLite (backend), React + Vite + TailwindCSS v4 + React Query (frontend)
- All existing pages, routes, and APIs are working after Phase 10
- Task model has: `id, title, deadline, estimated_time, quadrant, memo, status, delegate_to, category, fund_id, investment_id, workflow_instance_id, workflow_step_order`
- TaskResponse includes resolved `fund_name` and `company_name`
- Dashboard has tab-based right column, collapsible task lists, category badges
- Task board uses Eisenhower matrix (Q1-Q4) with drag-and-drop, MiniCalendar toggle, fund filter

### Current Issues Being Fixed

1. **Fund Overview** (`/fund-overview`): Changing reference_date does NOT hide funds that didn't exist yet (e.g., a fund with formation_date 2025-10-31 should not appear if reference_date is 2025-06-30). Summary cards and totals also don't reflect this filtering.
2. **Task Board calendar**: Currently shows MiniCalendar below/beside the quadrants. Should instead **replace** the quadrant view (flip between board and calendar).
3. **Task Board readability**: When many workflow-linked tasks exist, the flat list per quadrant is hard to scan. Need grouping by workflow and compact collapsed display.
4. **Task add/complete UX**: Time inputs require typing (e.g., "1h30m"). Should use dropdowns/selectors for faster input without typing.
5. **Dashboard quick-complete**: Missing proper complete modal (currently uses "빠른 완료" which skips the modal). Need same complete popup as task board. Also missing: completed tasks summary for today/this week.

---

## Part 1: Fund Overview — Reference-Date Aware Fund Filtering

### 1.1 Backend: Filter Funds by formation_date

**File:** `backend/routers/funds.py` — Update the `fund_overview` function

Currently line 98: `funds = db.query(Fund).order_by(Fund.id.asc()).all()`

Change to filter funds whose `formation_date` is on or before the reference date (or is NULL for funds without a formation date — include them with a note):

```python
funds = (
    db.query(Fund)
    .filter(
        or_(
            Fund.formation_date.is_(None),
            Fund.formation_date <= ref_date,
        )
    )
    .order_by(Fund.id.asc())
    .all()
)
```

Add import: `from sqlalchemy import or_` (if not already imported).

This means:
- A fund with `formation_date = 2025-10-31` will NOT appear when `reference_date = 2025-06-30`
- A fund with `formation_date = None` (성장 벤처투자조합, status "forming") WILL appear but with empty values
- The `no` column re-numbers based on visible funds only

### 1.2 Frontend Summary Cards Update

**File:** `frontend/src/pages/FundOverviewPage.tsx`

The summary cards already use `funds.length` and `totals` from the backend response. Since the backend now returns filtered funds, the summary cards will automatically update. No frontend change needed for this — the backend drives it.

### 1.3 Additional: Status-Based Filtering for "forming" Funds

Funds with `status = "forming"` and `formation_date = None` should be included but displayed with a visual indicator:

In the table row, if `fund.formation_date` is null, add a gray badge:

```tsx
<td className="px-3 py-2 font-medium text-gray-900">
  {fund.name}
  {!fund.formation_date && (
    <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">미성립</span>
  )}
</td>
```

---

## Part 2: Task Board — Calendar Toggle (Flip View)

### 2.1 Replace Side-by-Side with Flip View

**File:** `frontend/src/pages/TaskBoardPage.tsx`

Currently the calendar toggle (`showMiniCalendar`) shows the calendar beside the quadrants in a 3-column grid (line 523). Change this to a **flip** behavior: when calendar is active, HIDE the quadrant grid entirely and show MiniCalendar full-width instead.

Replace the current grid layout:

```tsx
{/* OLD: grid with side-by-side */}
<div className={`grid gap-4 ${showMiniCalendar ? 'grid-cols-1 xl:grid-cols-3' : 'grid-cols-1'}`}>
```

With a conditional render:

```tsx
{showMiniCalendar ? (
  <div className="w-full">
    <MiniCalendar />
  </div>
) : (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {QUADRANTS.map(q => {
      /* existing quadrant rendering */
    })}
  </div>
)}
```

### 2.2 Update Calendar Button Label

Change the calendar toggle button to indicate the current view state:

```tsx
<button
  onClick={() => {
    const next = !showMiniCalendar
    setShowMiniCalendar(next)
    window.localStorage.setItem(TASKBOARD_CALENDAR_STORAGE_KEY, String(next))
  }}
  className={`rounded-lg px-3 py-1 text-xs ${
    showMiniCalendar
      ? 'bg-blue-600 text-white'
      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
  }`}
>
  {showMiniCalendar ? '업무 보드' : '캘린더'}
</button>
```

When showing the calendar, the button text says "업무 보드" (click to go back). When showing the board, it says "캘린더".

---

## Part 3: Task Board — Workflow-Grouped Display

### 3.1 Group Tasks Within Quadrants

**File:** `frontend/src/pages/TaskBoardPage.tsx`

When a quadrant has workflow-linked tasks, group them visually. Instead of a flat list, show:

**Layout per quadrant:**
```
[Standalone tasks — shown as individual cards like now]

[Workflow group 1: "루스바이오 Follow-on 투자"]
  ├── Current step badge: "2/6 계약서 초안 검토"
  └── Click to expand → shows all steps as compact list

[Workflow group 2: "2호 조합 정기총회"]
  ├── Current step badge: "1/4 총회 소집 통지"
  └── Click to expand → shows all steps
```

### 3.2 Implementation

Add a grouping function:

```tsx
interface WorkflowGroup {
  workflowInstanceId: number
  workflowName: string  // from first task's title context or fund_name
  tasks: Task[]
  currentStep: Task | null  // the first pending task
  progress: string  // e.g., "2/6"
}

function groupTasksByWorkflow(tasks: Task[]): { standalone: Task[]; workflows: WorkflowGroup[] } {
  const standalone: Task[] = []
  const wfMap = new Map<number, Task[]>()

  for (const task of tasks) {
    if (task.workflow_instance_id) {
      const existing = wfMap.get(task.workflow_instance_id) || []
      existing.push(task)
      wfMap.set(task.workflow_instance_id, existing)
    } else {
      standalone.push(task)
    }
  }

  const workflows: WorkflowGroup[] = []
  for (const [instanceId, wfTasks] of wfMap) {
    const sorted = wfTasks.sort((a, b) => (a.workflow_step_order || 0) - (b.workflow_step_order || 0))
    const currentStep = sorted.find(t => t.status === 'pending') || sorted[0]
    const completedCount = sorted.filter(t => t.status === 'completed').length

    workflows.push({
      workflowInstanceId: instanceId,
      workflowName: currentStep?.fund_name
        ? `${currentStep.fund_name} — ${currentStep.title}`
        : currentStep?.title || `워크플로 #${instanceId}`,
      tasks: sorted,
      currentStep,
      progress: `${completedCount}/${sorted.length}`,
    })
  }

  return { standalone, workflows }
}
```

### 3.3 Workflow Group Component

```tsx
function WorkflowGroupCard({ group, onComplete, onEdit, onDelete }: {
  group: WorkflowGroup
  onComplete: (id: number) => void
  onEdit: (task: Task) => void
  onDelete: (id: number) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-md border border-indigo-200 bg-indigo-50/50">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
      >
        <span className="text-indigo-500">
          <GitBranch size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-indigo-800">
            {group.currentStep?.fund_name || '워크플로'}
          </p>
          <p className="truncate text-xs text-indigo-600">
            현재: {group.currentStep?.title || '-'}
          </p>
        </div>
        <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
          {group.progress}
        </span>
        <ChevronDown size={14} className={`text-indigo-400 transition-transform ${expanded ? '' : '-rotate-90'}`} />
      </button>

      {/* Expanded: show all tasks in this workflow */}
      {expanded && (
        <div className="border-t border-indigo-200 px-2 py-1.5 space-y-1">
          {group.tasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              onComplete={onComplete}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

Import `GitBranch` and `ChevronDown` from `lucide-react`.

### 3.4 Use Grouped Display in Quadrants

Replace the flat task list in each quadrant:

```tsx
{QUADRANTS.map(q => {
  const allTasks = filterByFund(board?.[q.key as keyof TaskBoard] || [])
  const { standalone, workflows } = groupTasksByWorkflow(allTasks)

  return (
    <div key={q.key} /* existing drag handlers and styling */>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2.5 h-2.5 rounded-full ${q.badge}`} />
        <h3 className="text-sm font-semibold text-gray-700">{q.label}</h3>
        <span className="text-xs text-gray-400 ml-auto">{allTasks.length}</span>
      </div>

      <div className="space-y-1.5">
        {/* Standalone tasks first */}
        {standalone.map(t => (
          <TaskItem key={t.id} task={t}
            onComplete={() => setCompletingTask(t)}
            onEdit={(task) => setEditingTask(task)}
            onDelete={(id) => { if (confirm('삭제?')) deleteMutation.mutate(id) }}
          />
        ))}

        {/* Workflow groups */}
        {workflows.map(group => (
          <WorkflowGroupCard key={group.workflowInstanceId} group={group}
            onComplete={(id) => {
              const task = group.tasks.find(t => t.id === id)
              if (task) setCompletingTask(task)
            }}
            onEdit={(task) => setEditingTask(task)}
            onDelete={(id) => { if (confirm('삭제?')) deleteMutation.mutate(id) }}
          />
        ))}
      </div>

      <div className="mt-2">
        <AddTaskForm quadrant={q.key} onAdd={(data) => addMutation.mutate(data)} />
      </div>
    </div>
  )
})}
```

---

## Part 3.1: Task Add/Edit — Time Picker Dropdowns

### 3.1.1 Time Selector Component

Create a reusable time dropdown component. Replace text inputs for `estimated_time` and `actual_time` with select dropdowns.

**Add a helper component** (inline in TaskBoardPage.tsx or extract):

```tsx
const TIME_OPTIONS = [
  '5m', '10m', '15m', '20m', '30m', '45m',
  '1h', '1h 30m', '2h', '2h 30m', '3h', '3h 30m', '4h',
  '5h', '6h', '8h', '1d',
]

function TimeSelect({ value, onChange, className }: {
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const isCustom = value && !TIME_OPTIONS.includes(value)

  return (
    <select
      value={isCustom ? '__custom__' : value}
      onChange={(e) => {
        if (e.target.value === '__custom__') {
          const custom = prompt('시간을 입력하세요 (예: 1h 30m)')
          if (custom) onChange(custom)
        } else {
          onChange(e.target.value)
        }
      }}
      className={className || 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400'}
    >
      <option value="">선택</option>
      {TIME_OPTIONS.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
      <option value="__custom__">{isCustom ? `직접입력: ${value}` : '직접입력...'}</option>
    </select>
  )
}
```

### 3.1.2 Replace Time Inputs

**AddTaskForm** (line ~90): Replace the estimated time text input:

```tsx
{/* OLD: <input value={estimatedTime} onChange={e => setEstimatedTime(e.target.value)} placeholder="예) 1h, 30m" ... /> */}
<TimeSelect
  value={estimatedTime}
  onChange={setEstimatedTime}
  className="w-24 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
/>
```

**EditTaskModal** (line ~220): Replace the estimated time input:

```tsx
<TimeSelect value={estimatedTime} onChange={setEstimatedTime} />
```

### 3.1.3 Deadline Date+Time Picker

For the deadline in **AddTaskForm**, replace the plain `<input type="date">` with date + time select:

```tsx
const [deadlineDate, setDeadlineDate] = useState('')
const [deadlineHour, setDeadlineHour] = useState('')

// Generate hour options (9:00 to 18:00, 30min intervals)
const HOUR_OPTIONS = Array.from({ length: 19 }, (_, i) => {
  const h = Math.floor(i / 2) + 9
  const m = (i % 2) * 30
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})

// In the form:
<div className="flex gap-1">
  <input type="date" value={deadlineDate} onChange={e => setDeadlineDate(e.target.value)}
    className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded ..." />
  <select value={deadlineHour} onChange={e => setDeadlineHour(e.target.value)}
    className="w-20 px-1 py-1 text-xs border border-gray-200 rounded ...">
    <option value="">시간</option>
    {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
  </select>
</div>

// When submitting, combine:
const deadline = deadlineDate
  ? (deadlineHour ? `${deadlineDate}T${deadlineHour}` : deadlineDate)
  : null
```

Apply the same pattern to **EditTaskModal** for the deadline field.

---

## Part 3.2: Complete Modal — Enhanced with Memo and Time Dropdown

### 3.2.1 Update CompleteModal

**File:** `frontend/src/pages/TaskBoardPage.tsx` — Update `CompleteModal` component

Replace the `actualTime` text input with `TimeSelect` dropdown. Add a memo textarea for worklog notes:

```tsx
function CompleteModal({ task, onConfirm, onCancel }: {
  task: Task
  onConfirm: (actualTime: string, autoWorklog: boolean, memo?: string) => void
  onCancel: () => void
}) {
  const [actualTime, setActualTime] = useState(task.estimated_time || '')
  const [memo, setMemo] = useState('')
  const [autoWorklog, setAutoWorklog] = useState(() => {
    const saved = window.localStorage.getItem(AUTO_WORKLOG_STORAGE_KEY)
    return saved == null ? true : saved === 'true'
  })

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">작업 완료</h3>
            <button onClick={onCancel}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
          </div>

          <p className="text-sm text-gray-600 mb-1">{task.title}</p>
          {task.fund_name && <p className="text-xs text-blue-600 mb-3">{task.fund_name}</p>}

          <label className="block text-xs text-gray-500 mb-1">실제 소요 시간</label>
          <TimeSelect value={actualTime} onChange={setActualTime} />

          <label className="block text-xs text-gray-500 mb-1 mt-3">메모 (업무기록에 반영)</label>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            rows={2}
            placeholder="완료 소감, 특이사항 등"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />

          <label className="mt-3 mb-4 flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={autoWorklog}
              onChange={(e) => {
                setAutoWorklog(e.target.checked)
                window.localStorage.setItem(AUTO_WORKLOG_STORAGE_KEY, String(e.target.checked))
              }} />
            업무 기록 자동 생성
          </label>

          <div className="flex justify-end gap-2">
            <button onClick={onCancel} className="secondary-btn">취소</button>
            <button onClick={() => actualTime && onConfirm(actualTime, autoWorklog, memo)}
              className="primary-btn inline-flex items-center gap-1">
              <Check size={16} /> 완료
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
```

### 3.2.2 Backend: Accept Memo in Complete Endpoint

**File:** `backend/routers/tasks.py` — Update the complete endpoint

If the complete endpoint's `TaskComplete` schema doesn't have a `memo` field, add one:

**File:** `backend/schemas/task.py`
```python
class TaskComplete(BaseModel):
    actual_time: str
    auto_worklog: bool = True
    memo: Optional[str] = None  # NEW — passed to worklog content if auto_worklog is True
```

In the complete handler, if `auto_worklog` is True and `memo` is provided, include the memo in the generated worklog's `content` field.

### 3.2.3 Frontend: Pass Memo to Complete API

**File:** `frontend/src/lib/api.ts` — Update `completeTask`:

```typescript
export async function completeTask(id: number, actualTime: string, autoWorklog: boolean, memo?: string) {
  const res = await fetch(`${API}/api/tasks/${id}/complete`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actual_time: actualTime, auto_worklog: autoWorklog, memo: memo || null }),
  })
  if (!res.ok) throw new Error('Failed to complete task')
  return res.json()
}
```

Update the mutation call in TaskBoardPage.tsx to pass memo:

```tsx
const completeMutation = useMutation({
  mutationFn: ({ id, actualTime, autoWorklog, memo }: { id: number; actualTime: string; autoWorklog: boolean; memo?: string }) =>
    completeTask(id, actualTime, autoWorklog, memo),
  // ... rest unchanged
})
```

And in CompleteModal's onConfirm callback:
```tsx
onConfirm={(actualTime, autoWorklog, memo) =>
  completeMutation.mutate({ id: completingTask.id, actualTime, autoWorklog, memo })
}
```

---

## Part 4: Dashboard — Quick Add Task from Workflows

### 4.1 Add Task Button on Workflow Cards

**File:** `frontend/src/pages/DashboardPage.tsx`

Add a small "+" button on each active workflow card that opens a task creation popup:

```tsx
{active_workflows.map((wf: ActiveWorkflow) => (
  <button key={wf.id}
    onClick={() => navigate('/workflows', { state: { expandInstanceId: wf.id } })}
    className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-left hover:bg-indigo-100 relative group"
  >
    {/* existing content */}
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm font-medium text-indigo-800">{wf.name}</p>
      <span className="text-xs text-indigo-600">{wf.progress}</span>
    </div>
    {/* ... */}

    {/* Quick add task button */}
    <button
      onClick={(e) => {
        e.stopPropagation()
        setQuickAddContext({ fund_name: wf.fund_name, company_name: wf.company_name })
        setShowQuickAddModal(true)
      }}
      className="absolute top-2 right-2 rounded-full bg-white/80 p-1 text-indigo-500 opacity-0 group-hover:opacity-100 hover:bg-indigo-100 transition-all"
      title="업무 추가"
    >
      <Plus size={14} />
    </button>
  </button>
))}
```

### 4.2 Quick Add Task Modal

Add a lightweight task creation modal to DashboardPage:

```tsx
const [showQuickAddModal, setShowQuickAddModal] = useState(false)
const [quickAddContext, setQuickAddContext] = useState<{ fund_name?: string | null; company_name?: string | null }>({})

// Import createTask and related types
import { createTask, type TaskCreate } from '../lib/api'

const createTaskMut = useMutation({
  mutationFn: createTask,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
    setShowQuickAddModal(false)
    addToast('success', '업무가 추가되었습니다.')
  },
})

// Modal component (inline or extracted):
function QuickAddTaskModal({ context, onAdd, onCancel }: {
  context: { fund_name?: string | null; company_name?: string | null }
  onAdd: (data: TaskCreate) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [deadlineDate, setDeadlineDate] = useState('')
  const [deadlineHour, setDeadlineHour] = useState('')
  const [estimatedTime, setEstimatedTime] = useState('')
  const [quadrant, setQuadrant] = useState('Q1')

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
          <h3 className="text-lg font-semibold mb-1">빠른 업무 추가</h3>
          {context.fund_name && <p className="text-xs text-blue-600 mb-3">{context.fund_name}</p>}

          <div className="space-y-3">
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              placeholder="업무 제목"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">마감일</label>
                <input type="date" value={deadlineDate} onChange={e => setDeadlineDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">시간</label>
                <select value={deadlineHour} onChange={e => setDeadlineHour(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg">
                  <option value="">선택</option>
                  {/* HOUR_OPTIONS from Part 3.1 */}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">예상 시간</label>
                <TimeSelect value={estimatedTime} onChange={setEstimatedTime} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">사분면</label>
                <select value={quadrant} onChange={e => setQuadrant(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg">
                  <option value="Q1">Q1 긴급·중요</option>
                  <option value="Q2">Q2 중요</option>
                  <option value="Q3">Q3 긴급</option>
                  <option value="Q4">Q4 기타</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onCancel} className="secondary-btn">취소</button>
            <button onClick={() => {
              if (!title.trim()) return
              onAdd({
                title: title.trim(),
                quadrant,
                deadline: deadlineDate ? (deadlineHour ? `${deadlineDate}T${deadlineHour}` : deadlineDate) : null,
                estimated_time: estimatedTime || null,
              })
            }} className="primary-btn">추가</button>
          </div>
        </div>
      </div>
    </>
  )
}
```

Render the modal at the bottom of DashboardPage:
```tsx
{showQuickAddModal && (
  <QuickAddTaskModal
    context={quickAddContext}
    onAdd={(data) => createTaskMut.mutate(data)}
    onCancel={() => setShowQuickAddModal(false)}
  />
)}
```

**IMPORTANT:** Also share the `TimeSelect` component and `HOUR_OPTIONS` between DashboardPage and TaskBoardPage. Either extract to a shared file (e.g., `frontend/src/components/TimeSelect.tsx`) or duplicate inline.

---

## Part 4.1: Dashboard — Upcoming Tasks Readability

### 4.1.1 Group Upcoming Tasks by Category/Fund

**File:** `frontend/src/pages/DashboardPage.tsx`

For the "예정 업무" section, instead of a flat list, group tasks by `category` (or `fund_name` if category is empty):

```tsx
function groupByCategory(tasks: Task[]): Map<string, Task[]> {
  const groups = new Map<string, Task[]>()
  for (const task of tasks) {
    const key = task.category || task.fund_name || '일반'
    const existing = groups.get(key) || []
    existing.push(task)
    groups.set(key, existing)
  }
  return groups
}
```

In the "예정 업무" TaskList, override the content to show grouped tasks:

```tsx
{upcoming.length > 0 && (
  <div className="card-base">
    <button onClick={() => setUpcomingCollapsed(!upcomingCollapsed)} className="mb-2 flex w-full items-center justify-between">
      <h3 className="text-sm font-semibold text-gray-700">예정 업무</h3>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">{upcoming.length}건</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${upcomingCollapsed ? '-rotate-90' : ''}`} />
      </div>
    </button>
    {!upcomingCollapsed && (
      <div className="space-y-3">
        {Array.from(groupByCategory(upcoming)).map(([category, tasks]) => (
          <div key={category}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${categoryBadgeClass(category)}`}>
                {category}
              </span>
              <span className="text-[10px] text-gray-400">{tasks.length}건</span>
            </div>
            <div className="space-y-1">
              {tasks.map(task => (
                <div key={task.id} onClick={() => navigate('/tasks')}
                  className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-800 truncate">{task.title}</p>
                    <span className="shrink-0 text-xs text-gray-400">{task.deadline ? formatShortDate(task.deadline) : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

---

## Part 4.2: Dashboard — Complete Modal & Completed Tasks Summary

### 4.2.1 Add Complete Modal to Dashboard

**File:** `frontend/src/pages/DashboardPage.tsx`

Currently, the dashboard uses `handleQuickComplete` which bypasses the modal (uses estimated_time directly). Replace this with a proper CompleteModal like the task board has.

Add state:
```tsx
const [completingTask, setCompletingTask] = useState<Task | null>(null)
```

Replace `handleQuickComplete`:
```tsx
// Remove the old handleQuickComplete function

// Update TaskList's onQuickComplete to open the modal instead:
<TaskList
  title="오늘"
  tasks={today.tasks}
  onClickTask={() => navigate('/tasks')}
  onQuickComplete={(task) => setCompletingTask(task)}
  completingTaskId={completeTaskMut.variables?.id ?? null}
/>
```

Add the CompleteModal at the bottom of the component (reuse the same CompleteModal from TaskBoardPage, or extract to a shared component):

```tsx
{completingTask && (
  <CompleteModal
    task={completingTask}
    onConfirm={(actualTime, autoWorklog, memo) => {
      completeTaskMut.mutate(
        { id: completingTask.id, actualTime, autoWorklog, memo },
        { onSettled: () => setCompletingTask(null) }
      )
    }}
    onCancel={() => setCompletingTask(null)}
  />
)}
```

Update the mutation to accept memo:
```tsx
const completeTaskMut = useMutation({
  mutationFn: ({ id, actualTime, autoWorklog, memo }: { id: number; actualTime: string; autoWorklog: boolean; memo?: string }) =>
    completeTask(id, actualTime, autoWorklog, memo),
  // ... rest unchanged
})
```

**IMPORTANT:** Extract `CompleteModal` and `TimeSelect` to shared components (e.g., `frontend/src/components/CompleteModal.tsx` and `frontend/src/components/TimeSelect.tsx`) so both DashboardPage and TaskBoardPage can import them.

### 4.2.2 Completed Tasks Summary

**File:** `backend/routers/dashboard.py` — Add completed task counts to the dashboard response

After the existing pending tasks logic, query completed tasks:

```python
# Completed today
completed_today = (
    db.query(Task)
    .filter(
        Task.status == "completed",
        Task.completed_at.isnot(None),
        func.date(Task.completed_at) == today,
    )
    .order_by(Task.completed_at.desc())
    .all()
)

# Completed this week (Monday to Sunday)
week_start = today - timedelta(days=today.weekday())
completed_this_week = (
    db.query(Task)
    .filter(
        Task.status == "completed",
        Task.completed_at.isnot(None),
        func.date(Task.completed_at) >= week_start,
        func.date(Task.completed_at) <= week_end,
    )
    .order_by(Task.completed_at.desc())
    .all()
)
```

Add `func` import: `from sqlalchemy import func` (if not already imported).

Add to the response:
```python
return {
    # ... existing fields ...
    "completed_today": [_task_response(db, t) for t in completed_today],
    "completed_today_count": len(completed_today),
    "completed_this_week_count": len(completed_this_week),
}
```

### 4.2.3 Frontend: Display Completed Summary

**File:** `frontend/src/pages/DashboardPage.tsx`

Update the `DashboardResponse` type in `frontend/src/lib/api.ts`:

```typescript
export interface DashboardResponse {
  // ... existing fields ...
  completed_today: Task[]
  completed_today_count: number
  completed_this_week_count: number
}
```

Add a "완료" stat card and a collapsible completed section:

In the stat cards grid, add:
```tsx
<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
  <p className="text-xs text-emerald-600">오늘 완료</p>
  <p className="mt-1 text-2xl font-semibold text-emerald-700">{data.completed_today_count}</p>
</div>
```

Below the task lists (after "기한 미지정"), add a completed section:

```tsx
{data.completed_today.length > 0 && (
  <div className="card-base">
    <button onClick={() => setCompletedCollapsed(!completedCollapsed)} className="mb-2 flex w-full items-center justify-between">
      <h3 className="text-sm font-semibold text-emerald-700">오늘 완료한 업무</h3>
      <div className="flex items-center gap-2">
        <span className="text-xs text-emerald-500">{data.completed_today.length}건</span>
        <span className="text-xs text-gray-400">이번 주 {data.completed_this_week_count}건</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${completedCollapsed ? '-rotate-90' : ''}`} />
      </div>
    </button>
    {!completedCollapsed && (
      <div className="space-y-1">
        {data.completed_today.map(task => (
          <div key={task.id} className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-600 line-through truncate">{task.title}</p>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                {task.actual_time && <span>{task.actual_time}</span>}
                {task.fund_name && <span className="text-blue-500">{task.fund_name}</span>}
              </div>
            </div>
            <button
              onClick={() => undoCompleteMut.mutate(task.id)}
              className="shrink-0 rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
              title="완료 취소"
            >
              되돌리기
            </button>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

### 4.2.4 Backend: Undo Complete Endpoint

**File:** `backend/routers/tasks.py` — Add an undo-complete endpoint

```python
@router.patch("/{task_id}/undo-complete")
def undo_complete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status != "completed":
        raise HTTPException(status_code=400, detail="Task is not completed")

    task.status = "pending"
    task.completed_at = None
    task.actual_time = None
    db.commit()
    db.refresh(task)
    return _enrich_task(task, db)
```

### 4.2.5 Frontend: Undo Complete API

**File:** `frontend/src/lib/api.ts`

```typescript
export async function undoCompleteTask(id: number) {
  const res = await fetch(`${API}/api/tasks/${id}/undo-complete`, { method: 'PATCH' })
  if (!res.ok) throw new Error('Failed to undo complete')
  return res.json()
}
```

**File:** `frontend/src/pages/DashboardPage.tsx`

```tsx
import { undoCompleteTask } from '../lib/api'

const undoCompleteMut = useMutation({
  mutationFn: undoCompleteTask,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
    addToast('success', '완료를 취소했습니다.')
  },
})
```

---

## Files to Modify

### Backend
1. `backend/routers/funds.py` — Filter funds by formation_date in overview endpoint
2. `backend/routers/tasks.py` — Add undo-complete endpoint
3. `backend/routers/dashboard.py` — Add completed_today/completed_this_week to response
4. `backend/schemas/task.py` — Add `memo` field to TaskComplete schema

### Frontend — New Shared Components
5. `frontend/src/components/TimeSelect.tsx` — NEW: Reusable time dropdown (extracted)
6. `frontend/src/components/CompleteModal.tsx` — NEW: Reusable complete modal (extracted)

### Frontend — Modified Pages
7. `frontend/src/lib/api.ts` — Update completeTask to accept memo; add undoCompleteTask; update DashboardResponse type
8. `frontend/src/pages/FundOverviewPage.tsx` — Add "미성립" badge for funds without formation_date
9. `frontend/src/pages/TaskBoardPage.tsx` — Calendar flip view; workflow-grouped display; TimeSelect in AddTaskForm/EditTaskModal/CompleteModal; import shared components
10. `frontend/src/pages/DashboardPage.tsx` — CompleteModal instead of quick complete; quick-add task modal; upcoming tasks grouped by category; completed summary section with undo; import shared components

### Files NOT to Modify
- `backend/models/task.py` — No schema changes
- `backend/models/fund.py` — No changes
- `frontend/src/components/Layout.tsx` — No nav changes
- `backend/scripts/seed_data.py` — No seed changes

---

## Acceptance Criteria

### Part 1: Fund Overview
1. Setting reference_date to a date BEFORE a fund's formation_date hides that fund from the table
2. Summary cards (조합 수, 약정총액, etc.) update to reflect only visible funds
3. Totals row only sums visible funds
4. Funds with formation_date=NULL show with "미성립" badge but are included
5. Setting reference_date to today shows all funds (all have formation_date <= today or NULL)

### Part 2: Task Board Calendar
6. Clicking "캘린더" button hides the 4 quadrants and shows MiniCalendar full-width
7. Button text changes to "업무 보드" when calendar is shown
8. Clicking "업무 보드" returns to the quadrant view
9. The toggle state persists in localStorage

### Part 3: Task Board Grouping
10. Workflow-linked tasks in each quadrant are grouped under collapsible workflow headers
11. Workflow header shows: fund name, current step title, progress (e.g., "2/6")
12. Clicking a workflow header expands/collapses the task list
13. Standalone (non-workflow) tasks appear as individual cards above workflow groups
14. The grouped display does not break drag-and-drop for standalone tasks

### Part 3.1: Time Picker
15. AddTaskForm uses TimeSelect dropdown instead of text input for estimated time
16. EditTaskModal uses TimeSelect for estimated time
17. Deadline input includes date picker + hour dropdown (30min intervals, 9:00-18:00)
18. TimeSelect offers "직접입력" option for custom values
19. TIME_OPTIONS include: 5m, 10m, 15m, 20m, 30m, 45m, 1h, 1h 30m, 2h, 2h 30m, 3h, 3h 30m, 4h, 5h, 6h, 8h, 1d

### Part 3.2: Complete Modal
20. CompleteModal uses TimeSelect instead of text input for actual time
21. CompleteModal includes a memo textarea
22. Memo is passed to the backend and included in auto-generated worklog content
23. TaskComplete schema accepts optional `memo` field

### Part 4: Dashboard Quick Add
24. Active workflow cards show a "+" button on hover
25. Clicking "+" opens a QuickAddTaskModal popup
26. The modal allows setting: title, deadline (date+time), estimated time, quadrant
27. Created task appears in the task board after creation

### Part 4.1: Upcoming Tasks Readability
28. "예정 업무" section groups tasks by category with colored badges
29. Each category group shows a count badge

### Part 4.2: Dashboard Complete + Undo
30. Dashboard "완료" button on task cards opens CompleteModal (NOT quick complete)
31. CompleteModal in dashboard has time dropdown + memo + auto worklog checkbox
32. Dashboard shows "오늘 완료" stat card with count (emerald colored)
33. "오늘 완료한 업무" collapsible section shows completed tasks with strikethrough
34. Each completed task has a "되돌리기" button
35. Clicking "되돌리기" restores the task to pending status
36. "이번 주 X건" count is shown next to the completed section header
37. `PATCH /api/tasks/{id}/undo-complete` endpoint exists and works

### General
38. All existing functionality works without regression
39. `npm run build` completes without errors
40. Backend starts without errors
41. TimeSelect and CompleteModal are shared components (not duplicated code)
