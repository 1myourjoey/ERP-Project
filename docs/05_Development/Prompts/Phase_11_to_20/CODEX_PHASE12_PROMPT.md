# Phase 12: Task Board Enhancement, Dashboard UX, Fund Management, Report Linkage & Full QA

## Context

This is a 1-person VC back-office ERP (Trigger Investment Partners).
- Stack: FastAPI + SQLAlchemy + SQLite (backend), React + Vite + TailwindCSS v4 + React Query (frontend)
- All existing pages, routes, and APIs are working after Phase 11
- Task model has: `id, title, deadline, estimated_time, quadrant, memo, status, delegate_to, category, fund_id, investment_id, workflow_instance_id, workflow_step_order, created_at, completed_at, actual_time`
- TaskResponse includes resolved `fund_name` and `company_name`
- Dashboard has tab-based right column (funds/notices/reports/documents), collapsible task lists, category badges, completed tasks section
- Task board uses Eisenhower matrix (Q1-Q4) with calendar flip-view toggle, fund filter, workflow grouping
- Fund model has: `notice_periods` (FundNoticePeriod[]) linking notice_type → business_days for deadline calculation
- `workflow_service.py` `instantiate_workflow()` creates tasks linked to workflow steps with calculated dates based on trigger_date and fund notice periods

### Important Patterns
- Backend nested items use "clear & recreate" pattern
- Frontend uses React Query mutations + `invalidateQueries` for cache refresh
- Modal pattern: `fixed inset-0 z-50 bg-black/40` overlay with `stopPropagation()`
- Toast via `useToast()` context for success/error messages
- Currency display: `formatKRW()` from `lib/labels.ts`
- Status labels: `labelStatus()` from `lib/labels.ts`

---

## Part 1: Task Board — Default View Reset & Enhanced Task Creation

### 1.1 Default View Reset on Tab Navigation

**File:** `frontend/src/pages/TaskBoardPage.tsx`

Currently the task board has a toggle between "업무 보드" (board) and "캘린더" (calendar) views, persisted in localStorage. The problem: when the user switches to calendar view, navigates to another tab (e.g., Dashboard), and comes back, the calendar view is still showing.

**Fix:** Reset to board view whenever the component mounts or when navigating away and back.

```tsx
// Remove localStorage persistence for showMiniCalendar
// Instead, always default to false (board view) on mount
const [showCalendar, setShowCalendar] = useState(false);

// Remove any localStorage.getItem/setItem for TASKBOARD_CALENDAR_STORAGE_KEY
// The calendar toggle is session-only, not persisted
```

The toggle button still works within the same session, but navigating away resets it.

### 1.2 Enhanced AddTaskForm — Fund & Workflow Template Selection

**File:** `frontend/src/pages/TaskBoardPage.tsx`

Currently `AddTaskForm` has: title, deadlineDate, deadlineHour, estimatedTime. Enhance it to also allow:

1. **Fund selection** (`fund_id`) — dropdown of all funds
2. **Workflow template selection** — dropdown of all workflow templates. When selected, the system creates a full workflow instance instead of a single task.

**Implementation:**

Add two optional select fields to AddTaskForm:

```tsx
// Inside AddTaskForm component
const { data: funds } = useQuery({ queryKey: ['funds'], queryFn: fetchFunds });
const { data: templates } = useQuery({ queryKey: ['workflow-templates'], queryFn: fetchWorkflowTemplates });

const [selectedFundId, setSelectedFundId] = useState<number | ''>('');
const [selectedTemplateId, setSelectedTemplateId] = useState<number | ''>('');
```

**Layout:** Add a row below the existing fields:

```
[Fund dropdown ▼] [Workflow Template dropdown ▼]
```

**Behavior when workflow template is selected:**

When a workflow template is selected AND a fund is also selected:
1. Check if the selected fund has `notice_periods` that relate to the template's steps
2. The deadline date entered becomes the `trigger_date` for the workflow
3. On submit, call `POST /api/workflow-instances` (existing endpoint) instead of `POST /api/tasks`
4. The backend `instantiate_workflow()` will automatically create all tasks with correct dates based on the fund's notice periods

**Behavior when only fund is selected (no template):**
- Create a normal task with `fund_id` set

**API call logic:**

```tsx
const handleSubmit = async () => {
  if (selectedTemplateId) {
    // Create workflow instance
    await createWorkflowInstance({
      workflow_id: selectedTemplateId,
      name: title,
      trigger_date: deadlineDate,  // use deadline as trigger date
      fund_id: selectedFundId || undefined,
      memo: '',
    });
    // Invalidate both tasks and workflow queries
    queryClient.invalidateQueries({ queryKey: ['taskBoard'] });
    queryClient.invalidateQueries({ queryKey: ['workflow-instances'] });
  } else {
    // Create single task (existing logic)
    await createTask({
      title,
      deadline: combineDeadline(deadlineDate, deadlineHour),
      estimated_time: estimatedTime || undefined,
      quadrant: targetQuadrant,
      fund_id: selectedFundId || undefined,
    });
    queryClient.invalidateQueries({ queryKey: ['taskBoard'] });
  }
  // Reset form
  resetForm();
};
```

**Notice period awareness display:**

When both a fund and a workflow template are selected, show a helper text below the form:

```tsx
{selectedFundId && selectedTemplateId && (
  <p className="mt-1 text-xs text-gray-500">
    선택한 조합의 통지기간에 따라 각 단계 날짜가 자동 계산됩니다.
  </p>
)}
```

The actual date calculation happens server-side in `instantiate_workflow()` which already reads `FundNoticePeriod` records. No frontend date calculation needed.

### 1.3 EditTaskModal — Same Fund & Category Enhancement

**File:** `frontend/src/pages/TaskBoardPage.tsx`

The existing EditTaskModal already has fund_id and category selects. Verify they work correctly. No major changes needed here, but ensure:
- The fund dropdown shows all funds (already does via `fundsForFilter`)
- Category options match: `투자실행`, `LP보고`, `사후관리`, `규약/총회`, `서류관리`

---

## Part 2: Task Board Calendar — Task Detail Popup

### 2.1 Calendar Task Click → Detail Modal

**File:** `frontend/src/pages/TaskBoardPage.tsx`

Currently the MiniCalendar (or calendar view) shows tasks as colored dots/badges on dates. When a user clicks a task in the calendar, show a popup/modal with the task's full details.

**Implementation:**

Create a `TaskDetailModal` component (inline in TaskBoardPage.tsx):

```tsx
interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
  onEdit: (task: Task) => void;
  onComplete: (task: Task) => void;
}

function TaskDetailModal({ task, onClose, onEdit, onComplete }: TaskDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
         onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
           onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{task.title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="space-y-2 text-sm text-gray-700">
          {task.deadline && (
            <div><span className="font-medium">마감:</span> {formatDate(task.deadline)}</div>
          )}
          {task.estimated_time && (
            <div><span className="font-medium">예상 시간:</span> {task.estimated_time}</div>
          )}
          {task.fund_name && (
            <div><span className="font-medium">조합:</span> {task.fund_name}</div>
          )}
          {task.company_name && (
            <div><span className="font-medium">피투자사:</span> {task.company_name}</div>
          )}
          {task.category && (
            <div><span className="font-medium">카테고리:</span> {task.category}</div>
          )}
          {task.quadrant && (
            <div><span className="font-medium">분면:</span> {task.quadrant}</div>
          )}
          {task.memo && (
            <div><span className="font-medium">메모:</span> {task.memo}</div>
          )}
          {task.delegate_to && (
            <div><span className="font-medium">위임:</span> {task.delegate_to}</div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {task.status !== 'completed' && (
            <>
              <button onClick={() => onComplete(task)}
                      className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700">
                완료
              </button>
              <button onClick={() => onEdit(task)}
                      className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
                수정
              </button>
            </>
          )}
          <button onClick={onClose}
                  className="rounded bg-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-300">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Calendar integration:**

In the calendar view, when rendering task items on calendar cells, add an onClick handler:

```tsx
const [detailTask, setDetailTask] = useState<Task | null>(null);

// In calendar cell rendering:
<div onClick={() => setDetailTask(task)} className="cursor-pointer ...">
  {task.title}
</div>

// Render modal:
{detailTask && (
  <TaskDetailModal
    task={detailTask}
    onClose={() => setDetailTask(null)}
    onEdit={(t) => { setDetailTask(null); setEditingTask(t); }}
    onComplete={(t) => { setDetailTask(null); setCompletingTask(t); }}
  />
)}
```

---

## Part 3: Dashboard — Layout & UX Improvements

### 3.1 Move Completed Tasks Section

**File:** `frontend/src/pages/DashboardPage.tsx`

Currently completed tasks section position may not be optimal. Move it to be rendered with `space-y-3` spacing, positioned after the today/tomorrow cards but before this_week section. The exact placement:

```
[Today card] [Tomorrow card]   ← 2-column grid
[Completed Today section]      ← space-y-3 from above
[This Week section]
[Upcoming section]
[No Deadline section]
```

The completed section should be compact:
```tsx
<div className="space-y-3">
  {/* ... today/tomorrow grid above ... */}

  {/* Completed Today */}
  {data.completed_today.length > 0 && (
    <div className="card-base p-3">
      <h3 className="mb-2 text-sm font-semibold text-gray-600">
        오늘 완료 ({data.completed_today_count}건)
        <span className="ml-2 text-xs text-gray-400">이번 주 {data.completed_this_week_count}건</span>
      </h3>
      <div className="space-y-1">
        {data.completed_today.map(task => (
          <div key={task.id} className="flex items-center justify-between text-sm">
            <span className="line-through text-gray-400">{task.title}</span>
            <div className="flex items-center gap-2">
              {task.actual_time && <span className="text-xs text-gray-400">{task.actual_time}</span>}
              <button onClick={() => handleUndoComplete(task.id)}
                      className="text-xs text-blue-500 hover:underline">되돌리기</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )}
</div>
```

### 3.2 Quick Task Add Button in Today/Tomorrow Cards

**File:** `frontend/src/pages/DashboardPage.tsx`

Add a small "+" button in the today and tomorrow card headers that opens a quick-add modal.

```tsx
// In today card header:
<div className="flex items-center justify-between">
  <h3 className="font-semibold">오늘 ({data.today.tasks.length}건, {data.today.total_estimated_time})</h3>
  <button onClick={() => openQuickAdd('today')}
          className="flex h-6 w-6 items-center justify-center rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
          title="업무 추가">
    +
  </button>
</div>

// Similarly for tomorrow card
```

The `openQuickAdd` function should open a small modal (reuse or adapt the existing `QuickAddTaskModal` if it exists) with:
- title, estimated_time, category, fund_id
- deadline auto-set to today or tomorrow based on which card's "+" was clicked
- quadrant defaults to Q1

### 3.3 Section Headers → Popup List Modal (No Page Navigation)

**File:** `frontend/src/pages/DashboardPage.tsx`

Currently, clicking section headers like "오늘업무", "이번주", "진행 워크플로", "미수집 서류", "보고마감", "오늘완료" navigates to other pages. Change this behavior: clicking these headers should open a **popup modal** showing the full list, without leaving the dashboard.

**Implementation:**

Create a `ListPopupModal` component:

```tsx
interface ListPopupModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function ListPopupModal({ title, onClose, children }: ListPopupModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
         onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
           onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

**Usage for each section:**

```tsx
const [popupSection, setPopupSection] = useState<string | null>(null);

// Example: "오늘업무" header
<h3 className="cursor-pointer font-semibold hover:text-blue-600"
    onClick={() => setPopupSection('today')}>
  오늘 ({data.today.tasks.length}건)
</h3>

// Render popup based on popupSection state:
{popupSection === 'today' && (
  <ListPopupModal title="오늘 업무" onClose={() => setPopupSection(null)}>
    {data.today.tasks.map(task => (
      <TaskListItem key={task.id} task={task} onTaskClick={handleTaskDetailClick} />
    ))}
  </ListPopupModal>
)}
```

Apply the same pattern for:
- `'today'` → 오늘 업무 full list
- `'tomorrow'` → 내일 업무 full list
- `'this_week'` → 이번 주 업무 full list
- `'workflows'` → 진행 워크플로 full list
- `'documents'` → 미수집 서류 full list
- `'reports'` → 보고 마감 full list
- `'completed'` → 오늘 완료 full list

Each popup should show all items (not truncated). The dashboard cards themselves can still show a limited number (e.g., 5) with "더보기" linking to the popup.

### 3.4 Task Click → Task Board with Highlight Blink OR Detail Popup

**File:** `frontend/src/pages/DashboardPage.tsx` and `frontend/src/pages/TaskBoardPage.tsx`

When a user clicks a specific task on the dashboard, provide two options:

**Option A (Primary): Show detail popup modal first**

Clicking a task opens a `TaskDetailModal` (same component from Part 2.1 above) showing the task's full details. The modal includes:
- All task fields (title, deadline, time, fund, category, memo, etc.)
- "확인하기" button → navigates to `/tasks` with state `{ highlightTaskId: task.id }`

```tsx
// In DashboardPage:
const navigate = useNavigate();
const [selectedTask, setSelectedTask] = useState<Task | null>(null);

// Task click handler:
const handleTaskClick = (task: Task) => {
  setSelectedTask(task);
};

// In TaskDetailModal, add a "확인하기" button:
<button onClick={() => {
  onClose();
  navigate('/tasks', { state: { highlightTaskId: task.id } });
}}
className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700">
  업무보드에서 확인
</button>
```

**Option B: Highlight blink in TaskBoardPage**

In `TaskBoardPage.tsx`, read `location.state?.highlightTaskId` and apply a blink animation:

```tsx
// In TaskBoardPage:
const location = useLocation();
const highlightTaskId = location.state?.highlightTaskId;
const [blinkingId, setBlinkingId] = useState<number | null>(null);

useEffect(() => {
  if (highlightTaskId) {
    setBlinkingId(highlightTaskId);
    // Scroll to the task element
    const el = document.getElementById(`task-${highlightTaskId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Stop blinking after 3 seconds
    const timer = setTimeout(() => setBlinkingId(null), 3000);
    // Clear the navigation state
    window.history.replaceState({}, document.title);
    return () => clearTimeout(timer);
  }
}, [highlightTaskId]);

// In TaskItem rendering:
<div id={`task-${task.id}`}
     className={`... ${blinkingId === task.id ? 'animate-pulse ring-2 ring-blue-400' : ''}`}>
```

**Implement BOTH options**: popup first, then navigate with highlight.

---

## Part 4: Fund Overview — Excel Download & Investment Instrument Improvements

### 4.1 Excel Download of Comparison Table

**File:** `backend/routers/funds.py` (new endpoint) + `frontend/src/pages/FundOverviewPage.tsx`

**Backend: New Excel Export Endpoint**

Add a new endpoint that generates an Excel file from the fund overview data:

```python
# backend/routers/funds.py
from fastapi.responses import StreamingResponse
import io

@router.get("/overview/export")
def export_fund_overview(reference_date: str | None = None, db: Session = Depends(get_db)):
    """Export fund overview comparison table as Excel (.xlsx)"""
    try:
        import openpyxl
        from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
    except ImportError:
        from fastapi import HTTPException
        raise HTTPException(500, "openpyxl not installed")

    # Reuse the same data logic from fund_overview()
    ref_date = date.fromisoformat(reference_date) if reference_date else date.today()

    # ... (same fund query and calculation logic as fund_overview endpoint) ...
    # Call the existing fund_overview function or extract shared logic

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "조합비교표"

    # Header row
    headers = [
        "NO", "조합명", "조합 구분", "대표 펀드매니저", "등록(성립)일",
        "투자기간 종료일", "투자기간 경과율", "청산시기(예정)",
        "약정총액", "납입총액", "납입비율", "GP출자금",
        "투자총액", "미투자액", "투자자산", "투자업체수",
        "기준수익률(규약)", "잔존기간"
    ]

    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=10)
    thin_border = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'), bottom=Side(style='thin')
    )

    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.border = thin_border
        cell.alignment = Alignment(horizontal='center', wrap_text=True)

    # Data rows (from fund overview items)
    for row_idx, fund_item in enumerate(overview_items, 2):
        values = [
            fund_item.no, fund_item.name, fund_item.fund_type,
            fund_item.fund_manager, fund_item.formation_date,
            fund_item.investment_period_end, fund_item.investment_period_progress,
            fund_item.maturity_date, fund_item.commitment_total,
            fund_item.total_paid_in, fund_item.paid_in_ratio,
            fund_item.gp_commitment, fund_item.total_invested,
            fund_item.uninvested, fund_item.investment_assets,
            fund_item.company_count, fund_item.hurdle_rate,
            fund_item.remaining_period
        ]
        for col, val in enumerate(values, 1):
            cell = ws.cell(row=row_idx, column=col, value=val)
            cell.border = thin_border
            # Format currency columns
            if col in (9, 10, 12, 13, 14, 15):  # amount columns
                cell.number_format = '#,##0'
                cell.alignment = Alignment(horizontal='right')
            elif col in (7, 11):  # percentage columns
                cell.alignment = Alignment(horizontal='center')

    # Totals row
    totals_row = len(overview_items) + 2
    ws.cell(row=totals_row, column=1, value="합계").font = Font(bold=True)
    # ... fill totals ...

    # Auto-fit column widths
    for col in ws.columns:
        max_length = max(len(str(cell.value or '')) for cell in col)
        ws.column_dimensions[col[0].column_letter].width = min(max_length + 4, 25)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"조합비교표_{ref_date.isoformat()}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
```

**Add openpyxl dependency:**

```bash
pip install openpyxl
# Add to requirements.txt: openpyxl>=3.1.0
```

**Frontend: Download Button**

```tsx
// In FundOverviewPage.tsx, add a download button next to the reference date input:
<button
  onClick={() => {
    const url = `/api/funds/overview/export?reference_date=${referenceDate}`;
    window.open(url, '_blank');
  }}
  className="flex items-center gap-1 rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
>
  <span>📥</span> 엑셀 다운로드
</button>
```

### 4.2 Investment Instrument — Multi-Select with Per-Instrument Amounts

**Background:** Currently, each `Investment` record has a single `instrument` field (String, e.g., "보통주", "전환사채", "상환전환우선주"). The user wants:
- Same company can have multiple instruments (e.g., RCPS + CB)
- Each instrument has its own investment amount
- In the overview comparison table: count unique companies (not investment records)
- In fund detail: show each instrument as a separate investment entry

**This is already handled by the current data model.** Each Investment row = one instrument per company per fund. The same company_id can appear in multiple Investment rows with different instruments. The key change needed:

#### 4.2.1 Fund Overview — Company Count Fix

**File:** `backend/routers/funds.py` — in the `fund_overview` function

Currently `company_count` may count Investment rows, not distinct companies. Fix:

```python
# Instead of counting investments:
company_count = (
    db.query(func.count(func.distinct(Investment.company_id)))
    .filter(
        Investment.fund_id == fund.id,
        Investment.investment_date <= ref_date if Investment.investment_date else True,
    )
    .scalar() or 0
)
```

The `FundOverviewTotals.company_count` should also be a distinct count across all funds.

#### 4.2.2 Frontend — Investment Instrument Dropdown in Fund Detail

**File:** `frontend/src/pages/FundDetailPage.tsx`

When adding/editing an investment in the fund detail page, the instrument field should be a dropdown with predefined options:

```tsx
const INSTRUMENT_OPTIONS = [
  '보통주',
  '우선주',
  '전환사채(CB)',
  '신주인수권부사채(BW)',
  '상환전환우선주(RCPS)',
  '전환상환우선주(CRPS)',
  '교환사채(EB)',
  '조건부지분전환사채(CPS)',
  '메자닌',
  '직접대출',
];

// In InvestmentForm or wherever investments are created/edited:
<select value={instrument} onChange={e => setInstrument(e.target.value)}
        className="w-full rounded border px-3 py-2 text-sm">
  <option value="">투자수단 선택</option>
  {INSTRUMENT_OPTIONS.map(opt => (
    <option key={opt} value={opt}>{opt}</option>
  ))}
</select>
```

#### 4.2.3 Multi-Instrument Investment Creation

**File:** `frontend/src/pages/FundDetailPage.tsx`

When creating a new investment, allow selecting multiple instruments with individual amounts:

```tsx
// State for multi-instrument creation:
const [instrumentEntries, setInstrumentEntries] = useState<
  { instrument: string; amount: number }[]
>([{ instrument: '', amount: 0 }]);

// UI: Dynamic list of instrument + amount pairs
{instrumentEntries.map((entry, idx) => (
  <div key={idx} className="flex items-center gap-2">
    <select value={entry.instrument}
            onChange={e => updateInstrumentEntry(idx, 'instrument', e.target.value)}
            className="flex-1 rounded border px-2 py-1.5 text-sm">
      <option value="">투자수단</option>
      {INSTRUMENT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
    </select>
    <input type="number" value={entry.amount || ''}
           onChange={e => updateInstrumentEntry(idx, 'amount', Number(e.target.value))}
           placeholder="투자금액"
           className="w-40 rounded border px-2 py-1.5 text-sm" />
    {idx > 0 && (
      <button onClick={() => removeInstrumentEntry(idx)}
              className="text-red-400 hover:text-red-600">✕</button>
    )}
  </div>
))}
<button onClick={addInstrumentEntry}
        className="text-xs text-blue-600 hover:underline">+ 투자수단 추가</button>
```

**On submit:** Create one `Investment` record per instrument entry (same company_id, same fund_id, different instrument and amount).

```tsx
const handleCreateInvestment = async () => {
  for (const entry of instrumentEntries) {
    if (!entry.instrument) continue;
    await createInvestment({
      fund_id: fundId,
      company_id: selectedCompanyId,
      investment_date: investmentDate,
      instrument: entry.instrument,
      amount: entry.amount,
      // ... other shared fields
    });
  }
  queryClient.invalidateQueries({ queryKey: ['fund', fundId] });
};
```

---

## Part 5: Fund Management (FundsPage) — Enhanced List & Detail View

### 5.1 Fund List Cards — Show Key Info

**File:** `frontend/src/pages/FundsPage.tsx` (currently 142 lines)

Currently each fund card shows: name, type, status, lp_count, investment_count. Enhance to show key financial info at a glance:

```tsx
// Enhanced fund card:
<div key={fund.id}
     onClick={() => navigate(`/funds/${fund.id}`)}
     className="card-base cursor-pointer p-4 hover:ring-1 hover:ring-blue-200">
  <div className="flex items-start justify-between">
    <div>
      <h3 className="font-semibold text-gray-900">{fund.name}</h3>
      <p className="mt-0.5 text-xs text-gray-500">
        {fund.type} · {labelStatus(fund.status)}
      </p>
    </div>
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusColor(fund.status)}`}>
      {labelStatus(fund.status)}
    </span>
  </div>

  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
    {fund.formation_date && (
      <div className="text-gray-500">
        <span className="text-xs">결성일</span>
        <p className="font-medium text-gray-700">{fund.formation_date}</p>
      </div>
    )}
    {fund.commitment_total != null && (
      <div className="text-gray-500">
        <span className="text-xs">약정총액</span>
        <p className="font-medium text-gray-700">{formatKRW(fund.commitment_total)}</p>
      </div>
    )}
    {fund.aum != null && (
      <div className="text-gray-500">
        <span className="text-xs">운용규모</span>
        <p className="font-medium text-gray-700">{formatKRW(fund.aum)}</p>
      </div>
    )}
    <div className="text-gray-500">
      <span className="text-xs">투자기업</span>
      <p className="font-medium text-gray-700">{fund.investment_count ?? 0}개사</p>
    </div>
  </div>
</div>
```

This needs the backend `FundListItem` to include `formation_date` and `aum`. Check and update if needed:

**File:** `backend/schemas/fund.py`

Ensure `FundListItem` schema includes:
```python
class FundListItem(BaseModel):
    id: int
    name: str
    type: str
    status: str
    formation_date: date | None = None  # ADD if missing
    commitment_total: float | None = None
    aum: float | None = None             # ADD if missing
    lp_count: int = 0
    investment_count: int = 0
```

**File:** `backend/routers/funds.py`

In the `GET /api/funds` endpoint, ensure `formation_date` and `aum` are included in the response.

### 5.2 Fund Detail — Investment List View Button

**File:** `frontend/src/pages/FundDetailPage.tsx`

Add a toggle button (similar to TaskBoard's calendar toggle) that switches between the current card-based investment display and a **table/list view** showing:

| 투자기업명 | 설립일 | 업종 | 주요사업분야 | 투자방식 | 회수방법 | 회수완료여부 | 투자금 총액 | 회수금액 총액 | 투자일자 |
|-----------|--------|------|-------------|---------|---------|------------|-----------|-------------|---------|

```tsx
const [investmentViewMode, setInvestmentViewMode] = useState<'cards' | 'table'>('cards');

// Toggle button:
<div className="flex items-center gap-2">
  <h3 className="font-semibold">투자 내역</h3>
  <div className="flex rounded border text-xs">
    <button onClick={() => setInvestmentViewMode('cards')}
            className={`px-2 py-1 ${investmentViewMode === 'cards' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}>
      카드
    </button>
    <button onClick={() => setInvestmentViewMode('table')}
            className={`px-2 py-1 ${investmentViewMode === 'table' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}>
      목록
    </button>
  </div>
</div>

// Table view:
{investmentViewMode === 'table' && (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-xs text-gray-500">
        <tr>
          <th className="px-3 py-2 text-left">투자기업명</th>
          <th className="px-3 py-2 text-left">설립일</th>
          <th className="px-3 py-2 text-left">업종</th>
          <th className="px-3 py-2 text-left">투자방식</th>
          <th className="px-3 py-2 text-right">투자금 총액</th>
          <th className="px-3 py-2 text-right">회수금액</th>
          <th className="px-3 py-2 text-center">회수완료</th>
          <th className="px-3 py-2 text-left">투자일자</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {investments.map(inv => (
          <tr key={inv.id} className="cursor-pointer hover:bg-gray-50"
              onClick={() => navigate(`/investments/${inv.id}`)}>
            <td className="px-3 py-2 font-medium">{inv.company_name}</td>
            <td className="px-3 py-2 text-gray-500">{inv.company_founded_date || '-'}</td>
            <td className="px-3 py-2 text-gray-500">{inv.industry || '-'}</td>
            <td className="px-3 py-2">{inv.instrument || '-'}</td>
            <td className="px-3 py-2 text-right">{formatKRW(inv.amount)}</td>
            <td className="px-3 py-2 text-right">{formatKRW(inv.recovered_amount || 0)}</td>
            <td className="px-3 py-2 text-center">{inv.status === 'exited' ? '✓' : '-'}</td>
            <td className="px-3 py-2 text-gray-500">{inv.investment_date || '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
```

This requires the `InvestmentListItem` response to include company details. Either:
- Enrich the existing investment list endpoint to include `company_name`, `company_founded_date`, `industry`
- Or fetch company data separately

**Backend update needed** — `InvestmentListItem` should include:
```python
class InvestmentListItem(BaseModel):
    # ... existing fields ...
    company_founded_date: date | None = None  # ADD
    industry: str | None = None               # ADD
```

Update the corresponding router to join PortfolioCompany and populate these fields.

### 5.3 Capital Contribution Method (출자방식) — Installment Tracking

**File:** `backend/models/fund.py` + `frontend/src/pages/FundDetailPage.tsx`

This is a significant new feature. Each fund needs to track its capital contribution method and installment history.

#### 5.3.1 Backend: New Model Fields/Table

**Option: Use existing CapitalCall model**

Check if `CapitalCall` model already exists (it likely does from seed data). The model should track:

```python
# backend/models/fund.py — CapitalCall model (may already exist)
class CapitalCall(Base):
    __tablename__ = "capital_calls"

    id = Column(Integer, primary_key=True, index=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    call_number = Column(Integer, nullable=False)      # 차수 (1차, 2차, ...)
    call_date = Column(Date, nullable=True)             # 납입일
    call_amount = Column(Float, nullable=True)           # 납입금액
    call_ratio = Column(Float, nullable=True)            # 납입비율 (% of commitment)
    contribution_type = Column(String, nullable=True)    # 출자방식: "일시납", "분할납", "수시납"
    memo = Column(String, nullable=True)

    fund = relationship("Fund", back_populates="capital_calls")
    items = relationship("CapitalCallItem", back_populates="capital_call", cascade="all, delete-orphan")
```

**Add `contribution_type` to Fund model:**

```python
# In Fund model, add:
contribution_type = Column(String, nullable=True)  # "일시납", "분할납", "수시납"
```

This should be set when the fund is first created and displayed in the fund form.

#### 5.3.2 Frontend: Contribution Method UI

**File:** `frontend/src/pages/FundDetailPage.tsx`

Add a "출자방식" section showing:

1. **Contribution type selector** (in fund form):
```tsx
<select value={fund.contribution_type || ''} onChange={e => updateFund({ contribution_type: e.target.value })}>
  <option value="">출자방식 선택</option>
  <option value="일시납">일시납</option>
  <option value="분할납">분할납</option>
  <option value="수시납">수시납</option>
</select>
```

2. **Installment history table** (for 분할납/수시납):
```tsx
// Capital call history section
<div className="mt-4">
  <h4 className="font-semibold text-sm mb-2">출자 이력</h4>
  <table className="w-full text-sm">
    <thead className="bg-gray-50">
      <tr>
        <th className="px-3 py-2 text-left">차수</th>
        <th className="px-3 py-2 text-left">납입일</th>
        <th className="px-3 py-2 text-right">납입금액</th>
        <th className="px-3 py-2 text-right">납입비율</th>
        <th className="px-3 py-2 text-left">비고</th>
      </tr>
    </thead>
    <tbody className="divide-y">
      {/* First row: initial formation */}
      <tr>
        <td className="px-3 py-2">최초 결성</td>
        <td className="px-3 py-2">{fund.formation_date}</td>
        <td className="px-3 py-2 text-right">{formatKRW(initialPaidIn)}</td>
        <td className="px-3 py-2 text-right">
          {fund.commitment_total ? ((initialPaidIn / fund.commitment_total) * 100).toFixed(1) + '%' : '-'}
        </td>
        <td className="px-3 py-2 text-gray-500">최초 납입</td>
      </tr>
      {/* Subsequent capital calls */}
      {capitalCalls.map(call => (
        <tr key={call.id}>
          <td className="px-3 py-2">{call.call_number}차 캐피탈콜</td>
          <td className="px-3 py-2">{call.call_date}</td>
          <td className="px-3 py-2 text-right">{formatKRW(call.call_amount)}</td>
          <td className="px-3 py-2 text-right">{call.call_ratio}%</td>
          <td className="px-3 py-2 text-gray-500">{call.memo}</td>
        </tr>
      ))}
      {/* Footer: total */}
      <tr className="bg-gray-50 font-semibold">
        <td className="px-3 py-2" colSpan={2}>합계</td>
        <td className="px-3 py-2 text-right">{formatKRW(totalPaidIn)}</td>
        <td className="px-3 py-2 text-right">
          {fund.commitment_total ? ((totalPaidIn / fund.commitment_total) * 100).toFixed(1) + '%' : '-'}
        </td>
        <td></td>
      </tr>
    </tbody>
  </table>
</div>
```

#### 5.3.3 Workflow Integration for Capital Calls

When a workflow instance is created with a capital call template:
- The workflow name should include the call number (e.g., "2차 캐피탈콜")
- After the workflow completes (or at a specific step), the capital call amount should be recorded

This is informational linkage — the workflow `memo` or `name` field already carries context. The user manually completes the capital call record after the workflow finishes. No automatic amount recording is needed in this phase.

**Helper text in workflow creation:**

When creating a workflow from the task board (Part 1.2) with a capital call template:
```tsx
// Show fund's notice period for capital calls
{selectedFundId && selectedTemplateId && isCapitalCallTemplate && (
  <p className="mt-1 text-xs text-amber-600">
    ⚠ {fundName}: 캐피탈콜 최소 {capitalCallNoticeDays}영업일 전 통지 필요
  </p>
)}
```

---

## Part 6: Business Reports (BizReportsPage) — Task Board Linkage

### 6.1 Link Report Creation to Task Board

**File:** `frontend/src/pages/BizReportsPage.tsx`

Add ability to create a task from a business report. Each report card should have a "업무 추가" button that creates a task linked to the report's fund:

```tsx
// In each report card:
<button onClick={() => {
  const taskTitle = `${report.fund_name} ${report.report_year} 영업보고서 작성`;
  createTask({
    title: taskTitle,
    fund_id: report.fund_id,
    category: 'LP보고',
    quadrant: 'Q1',
    deadline: report.submission_date || undefined,
  });
  toast.success('업무가 생성되었습니다');
}}
className="text-xs text-blue-600 hover:underline">
  업무 추가
</button>
```

### 6.2 Show Related Tasks on Report Card

**File:** `frontend/src/pages/BizReportsPage.tsx`

Fetch tasks that are linked to the same fund and have category "LP보고":

```tsx
const { data: tasks } = useQuery({
  queryKey: ['tasks', { fund_id: report.fund_id, category: 'LP보고' }],
  queryFn: () => fetchTasks({ fund_id: report.fund_id }),
});

// Filter for LP보고 category
const relatedTasks = tasks?.filter(t =>
  t.fund_id === report.fund_id && t.category === 'LP보고'
) || [];

// Display in report card:
{relatedTasks.length > 0 && (
  <div className="mt-2 border-t pt-2">
    <p className="text-xs font-medium text-gray-500 mb-1">연관 업무</p>
    {relatedTasks.map(task => (
      <div key={task.id} className="flex items-center gap-1 text-xs">
        <span className={task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-700'}>
          {task.title}
        </span>
        <span className="text-gray-400">{task.estimated_time}</span>
      </div>
    ))}
  </div>
)}
```

**Backend:** The existing `GET /api/tasks` endpoint may need a `fund_id` query parameter filter. Check if it exists; if not, add it:

**File:** `backend/routers/tasks.py`

```python
@router.get("")
def list_tasks(
    quadrant: str | None = None,
    status: str | None = None,
    fund_id: int | None = None,      # ADD
    category: str | None = None,      # ADD
    db: Session = Depends(get_db),
):
    query = db.query(Task)
    if quadrant:
        query = query.filter(Task.quadrant == quadrant)
    if status:
        query = query.filter(Task.status == status)
    if fund_id:
        query = query.filter(Task.fund_id == fund_id)
    if category:
        query = query.filter(Task.category == category)
    # ... rest of logic
```

---

## Part 7: Workflow — Korean Encoding Fix

### 7.1 Check and Fix Korean Encoding

**Files:** All `.py` and `.tsx` files

Scan all source files for Korean text encoding issues. Common problems:

1. **Print statements with garbled Korean** — found in `WorkflowsPage.tsx` print functions
2. **Template strings with broken encoding** — check workflow template seed data
3. **PDF/Print output encoding** — ensure browser print CSS handles Korean fonts

**Fix approach:**

1. Open each file with a text editor that shows encoding
2. Ensure all files are saved as UTF-8 (without BOM)
3. For print functionality in WorkflowsPage.tsx, ensure the print stylesheet includes Korean font:

```tsx
// In the print function or print CSS:
const printStyles = `
  @media print {
    @page { margin: 20mm; }
    body {
      font-family: 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', sans-serif;
      -webkit-print-color-adjust: exact;
    }
  }
`;
```

4. Check `WorkflowsPage.tsx` for any string literals that appear garbled and fix them
5. Verify the backend sends proper `Content-Type: application/json; charset=utf-8` headers (FastAPI does this by default)

**Specific files to check:**
- `frontend/src/pages/WorkflowsPage.tsx` — print function Korean text
- `backend/scripts/seed_data.py` — Korean seed data
- `backend/services/workflow_service.py` — Korean holiday names or comments
- All frontend pages with Korean labels

---

## Part 8: Comprehensive QA — Full System Check

### 8.1 Backend Validation

1. **Run all API endpoints** — verify no 500 errors:
   ```bash
   python -m backend.scripts.api_smoke
   ```
   Update `api_smoke.py` to cover ALL endpoints including new ones from this phase.

2. **Check model-schema-router consistency:**
   - Every model field should have corresponding schema field
   - Every schema should be used by at least one router
   - All FK relationships should be valid

3. **Database integrity:**
   - Run `seed_all()` with `FORCE_SEED_RESET=1` to verify clean seed works
   - Check all foreign key constraints are satisfied
   - Verify no orphaned records

### 8.2 Frontend Validation

1. **Build check:**
   ```bash
   cd frontend && npm run build
   ```
   Must complete with 0 errors. Warnings are acceptable.

2. **Page-by-page verification** — visit each of the 19+ pages and verify:
   - No blank/empty pages
   - No JavaScript console errors
   - Korean text displays correctly (no mojibake/깨짐)
   - All buttons/links work
   - Forms submit correctly
   - Data loads from API

3. **Cross-reference checks:**
   - Dashboard task counts match task board
   - Fund overview totals match individual fund details
   - Workflow instance progress matches step completion
   - Investment counts in fund overview match fund detail

### 8.3 Integration Checks

1. **Task Board ↔ Dashboard:**
   - Create task on dashboard → appears on task board
   - Complete task on task board → appears in dashboard completed section
   - Undo complete → task returns to pending

2. **Fund ↔ Investment ↔ Task:**
   - Create investment → updates fund's investment count
   - Link task to fund → fund_name badge appears
   - Fund overview company count = distinct companies (not investment records)

3. **Workflow ↔ Task:**
   - Create workflow from task board → tasks auto-created with correct dates
   - Complete workflow step → corresponding task completed
   - Fund notice periods respected in date calculation

4. **Report ↔ Task:**
   - Create task from report → appears on task board with correct fund_id and category
   - Related tasks show on report card

### 8.4 Encoding & Display Checks

1. All 19+ pages: no garbled Korean characters
2. Print preview: Korean text renders correctly
3. Excel export: Korean text in cells is readable
4. API responses: proper UTF-8 encoding
5. Database: Korean text stored/retrieved correctly

---

## Files to Modify

### Backend (6+ files)
1. `backend/routers/funds.py` — Excel export endpoint, company count fix, FundListItem enrichment
2. `backend/routers/tasks.py` — Add fund_id/category query filters
3. `backend/schemas/fund.py` — FundListItem add formation_date, aum; Fund model contribution_type
4. `backend/schemas/investment.py` — InvestmentListItem add company_founded_date, industry
5. `backend/models/fund.py` — Add contribution_type to Fund model (ensure_fund_schema)
6. `backend/scripts/api_smoke.py` — Update for new endpoints and validations

### Frontend (7+ files)
7. `frontend/src/pages/TaskBoardPage.tsx` — Default view reset, enhanced AddTaskForm (fund + WF template), TaskDetailModal for calendar, highlight blink
8. `frontend/src/pages/DashboardPage.tsx` — Completed section move, quick-add buttons, section header popups, task click → detail popup + navigate with highlight
9. `frontend/src/pages/FundOverviewPage.tsx` — Excel download button, company count display
10. `frontend/src/pages/FundsPage.tsx` — Enhanced fund cards with key info
11. `frontend/src/pages/FundDetailPage.tsx` — Investment table view toggle, instrument dropdown, multi-instrument creation, contribution method & installment tracking
12. `frontend/src/pages/BizReportsPage.tsx` — Task creation from report, related tasks display
13. `frontend/src/pages/WorkflowsPage.tsx` — Korean encoding fix in print

### Dependencies
14. `backend/requirements.txt` — Add `openpyxl>=3.1.0`

---

## Acceptance Criteria

### Part 1: Task Board Default View & Enhanced Creation
- [ ] AC-1: Navigating away from task board and returning always shows board view (not calendar)
- [ ] AC-2: AddTaskForm has fund dropdown populated with all funds
- [ ] AC-3: AddTaskForm has workflow template dropdown populated with all templates
- [ ] AC-4: Selecting a workflow template + fund + trigger date → creates workflow instance with auto-calculated step dates
- [ ] AC-5: Helper text appears when fund + template selected, mentioning notice period awareness
- [ ] AC-6: Creating a single task (no template) with fund_id correctly links the task to the fund

### Part 2: Calendar Task Detail
- [ ] AC-7: Clicking a task in calendar view opens TaskDetailModal with all task fields
- [ ] AC-8: TaskDetailModal shows: title, deadline, estimated time, fund, company, category, quadrant, memo, delegate
- [ ] AC-9: "완료" button in modal triggers complete flow
- [ ] AC-10: "수정" button opens EditTaskModal

### Part 3: Dashboard UX
- [ ] AC-11: Completed tasks section positioned with space-y-3, showing count and undo button
- [ ] AC-12: Today and tomorrow cards have "+" quick-add button
- [ ] AC-13: Quick-add from today card auto-sets deadline to today with Q1 default
- [ ] AC-14: Quick-add from tomorrow card auto-sets deadline to tomorrow
- [ ] AC-15: Clicking section headers (오늘, 내일, 이번주, 워크플로, 서류, 보고, 완료) opens popup modal
- [ ] AC-16: Popup modal shows full list (not truncated), scrollable
- [ ] AC-17: Clicking a specific task opens TaskDetailModal (not page navigation)
- [ ] AC-18: TaskDetailModal has "업무보드에서 확인" button
- [ ] AC-19: Navigating to task board with highlightTaskId → task blinks for 3 seconds
- [ ] AC-20: Task auto-scrolls into view when highlighted

### Part 4: Fund Overview & Investment Instruments
- [ ] AC-21: "엑셀 다운로드" button on fund overview page
- [ ] AC-22: Downloaded Excel has same columns as comparison table, with Korean headers
- [ ] AC-23: Excel has proper formatting (borders, header colors, number formats)
- [ ] AC-24: Investment instrument field uses dropdown with predefined options
- [ ] AC-25: Multi-instrument creation: can add 2+ instrument-amount pairs for same company
- [ ] AC-26: Fund overview company_count = distinct companies (same company with 2 instruments = 1 company)
- [ ] AC-27: Fund detail investment list shows each instrument separately

### Part 5: Fund Management
- [ ] AC-28: FundsPage cards show: formation_date, commitment_total (or AUM), investment count
- [ ] AC-29: Fund detail has investment table view toggle (cards ↔ table)
- [ ] AC-30: Investment table shows: company name, founded date, industry, instrument, amount, recovery, status, date
- [ ] AC-31: Fund has contribution_type field (일시납/분할납/수시납) in form
- [ ] AC-32: Capital call history table shows: call number, date, amount, ratio, memo
- [ ] AC-33: Initial formation shown as first row with paid-in percentage
- [ ] AC-34: Total row at bottom sums amounts and shows cumulative percentage

### Part 6: Business Reports
- [ ] AC-35: Each report card has "업무 추가" button
- [ ] AC-36: Created task has correct fund_id, category='LP보고', title includes fund name
- [ ] AC-37: Related tasks (same fund + LP보고 category) shown on report card
- [ ] AC-38: Tasks endpoint accepts fund_id and category query parameters

### Part 7: Korean Encoding
- [ ] AC-39: WorkflowsPage print output shows Korean correctly
- [ ] AC-40: All .py and .tsx files are UTF-8 encoded
- [ ] AC-41: No garbled Korean (mojibake) on any page

### Part 8: Full QA
- [ ] AC-42: `npm run build` completes with 0 errors
- [ ] AC-43: `api_smoke.py` passes all endpoints
- [ ] AC-44: All 19+ pages load without JavaScript errors
- [ ] AC-45: Dashboard task counts match task board
- [ ] AC-46: Fund overview totals match sum of individual fund values
- [ ] AC-47: Workflow → task linkage works end-to-end
- [ ] AC-48: Report → task linkage works
- [ ] AC-49: Excel export Korean text readable
- [ ] AC-50: No orphaned records in database after seed reset
