# Phase 13-1: Fund Management Fixes · Workflow Checkbox Linkage · Task Board Completion UX

> **Priority:** P0

---

## Table of Contents

1. [Part 1 — Fund Management: Status-date linkage fix + Remove AUM + Type dropdown fix](#part-1--fund-management-status-date-linkage-fix--remove-aum--type-dropdown-fix)
2. [Part 2 — Workflow: Round checkbox linked to template selection (single select)](#part-2--workflow-round-checkbox-linked-to-template-selection-single-select)
3. [Part 3 — Task Board: Replace checkbox with explicit Complete + Edit buttons](#part-3--task-board-replace-checkbox-with-explicit-complete--edit-buttons)
4. [Files to modify](#files-to-modify)
5. [Acceptance Criteria](#acceptance-criteria)

---

## Part 1 — Fund Management: Status-date linkage fix + Remove AUM + Type dropdown fix

### 1-A. Fix status-date organic linkage

**Current state:**  
`FundsPage.tsx` has `fundDateInfo()` (lines 30–46) that maps fund status to a date label, and the card displays it (line 162). However, the **FundForm** component (line 82) still uses a plain text `<input>` for `status`:

```tsx
// Line 82 — current (broken)
<input value={form.status || ''} onChange={...} placeholder="상태(예: active)" className="..." />
```

This means:
- Users must type "active", "forming", "dissolved" etc. manually — error-prone
- There is **no organic linkage** between status + dates (formation_date, maturity_date, dissolution_date)

**Required changes:**

1. Replace the status text input with a **`<select>` dropdown**:

```tsx
const FUND_STATUS_OPTIONS = [
  { value: 'forming', label: '결성예정' },
  { value: 'active', label: '운용 중' },
  { value: 'dissolved', label: '해산' },
  { value: 'liquidated', label: '청산 완료' },
]

// In FundForm:
<select
  value={form.status || 'active'}
  onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))}
  className="px-3 py-2 text-sm border rounded-lg"
>
  {FUND_STATUS_OPTIONS.map(opt => (
    <option key={opt.value} value={opt.value}>{opt.label}</option>
  ))}
</select>
```

2. Add **conditional date fields** based on selected status in FundForm:

```tsx
{/* Show formation_date for all statuses */}
<input type="date" value={form.formation_date || ''} onChange={...}
  className="px-3 py-2 text-sm border rounded-lg" placeholder="결성일" />

{/* Show maturity_date only for active/dissolved/liquidated */}
{form.status !== 'forming' && (
  <input type="date" value={form.maturity_date || ''} onChange={...}
    className="px-3 py-2 text-sm border rounded-lg" placeholder="만기일" />
)}

{/* Show dissolution_date only for dissolved/liquidated */}
{(form.status === 'dissolved' || form.status === 'liquidated') && (
  <input type="date" value={form.dissolution_date || ''} onChange={...}
    className="px-3 py-2 text-sm border rounded-lg" placeholder="해산/청산일" />
)}
```

3. Add `maturity_date` and `dissolution_date` to `FundInput` type in `api.ts` if not already present.

4. Also apply the same status dropdown + conditional date fields in `FundDetailPage.tsx` FundForm component.

### 1-B. Remove AUM (운용규모) field

**Reason:** AUM (운용규모) = 약정총액 (commitment_total). It is a redundant field.

**Changes:**

1. **`FundsPage.tsx`:**
   - Remove `aum` from `EMPTY_FUND` (line 27)
   - Remove `aum` input from `FundForm` (line 87)
   - Remove the `fund.aum` card section (lines 178–184)
   - Remove `const aumFmt = formatKRWFull(fund.aum)` (line 150)

2. **`FundDetailPage.tsx`:**
   - Remove `aum` input from the fund edit form if present
   - Remove AUM display from fund detail view if present

3. **`FundInput` type in `api.ts`:**
   - Remove `aum` field from `FundInput` type

> **Note:** Do NOT remove `aum` from the backend model or database yet — just remove it from the frontend UI so it is no longer displayed or editable. Keeping backend compatibility.

### 1-C. Verify fund type dropdown

**Current state:** The fund type dropdown is already implemented in `FundsPage.tsx` (lines 9–16 `FUND_TYPE_OPTIONS`, lines 72–80 `<select>`).

**Check:** Verify the same dropdown is also used in `FundDetailPage.tsx` when editing a fund. If `FundDetailPage.tsx` still uses a text input for fund type, replace it with the same `FUND_TYPE_OPTIONS` dropdown.

---

## Part 2 — Workflow: Round checkbox linked to template selection (single select)

### Current state

Phase 13 added round checkboxes (top-right of template cards) with a `checkedTemplates: Set<number>` state in `WorkflowsPage.tsx`. However, the checkbox is independent from the template selection (`selectedId`).

### Required change

- **Link the round checkbox to template selection**: clicking the checkbox should set `selectedId` to that template (selecting it) or clear `selectedId` (deselecting it)
- **Single select only**: only one template can be checked at a time (not multi-select)
- Remove the separate `checkedTemplates` Set state — use `selectedId` as the single source of truth

### Implementation

1. Remove `checkedTemplates` state entirely.
2. Change the checkbox onClick handler:

```tsx
<button
  onClick={(e) => {
    e.stopPropagation()
    // Toggle: if already selected, deselect; otherwise select
    setSelectedId(selectedId === row.id ? null : row.id)
  }}
  className={`ml-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
    selectedId === row.id
      ? 'border-emerald-500 bg-emerald-500 text-white'
      : 'border-gray-300 bg-white hover:border-gray-400'
  }`}
>
  {selectedId === row.id && <Check size={12} />}
</button>
```

3. Ensure clicking the checkbox also opens the `WorkflowDetail` panel on the right (since `selectedId` is set).
4. Ensure clicking the checkbox again (when already checked) deselects the template and closes the detail panel.

---

## Part 3 — Task Board: Replace checkbox with explicit Complete + Edit buttons

### Current state

In `TaskBoardPage.tsx`, the `TaskItem` component (lines 99–163) uses:
- **Left side:** Round checkbox (lines 128–132) → clicking opens `CompleteModal`
- **Right side:** Pencil + Trash icons appear on hover (lines 153–160)

### Required change

Remove the left-side round checkbox. Instead, add **explicit buttons on the right side** that are **always visible** (not hover-only):
- **"완료" button** — opens the complete modal
- **"수정" button** — opens the edit modal
- Keep the delete button (trash icon) on hover

### Implementation

Replace the `TaskItem` component body:

```tsx
function TaskItem({
  task, onComplete, onDelete, onEdit, isBlinking = false,
}: {
  task: Task
  onComplete: (task: Task) => void
  onDelete: (id: number) => void
  onEdit: (task: Task) => void
  isBlinking?: boolean
}) {
  const deadlineStr = task.deadline
    ? new Date(task.deadline).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    : null

  return (
    <div
      id={`task-${task.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('taskId', String(task.id))
        e.dataTransfer.setData('fromQuadrant', task.quadrant)
      }}
      className={`group flex items-start gap-2 rounded-md border border-gray-200 bg-white p-2.5 transition-shadow hover:shadow-sm ${
        isBlinking ? 'animate-pulse ring-2 ring-blue-400' : ''
      }`}
    >
      {/* Left: task content (clickable for edit) */}
      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onEdit(task)}>
        <p className="text-sm leading-snug text-gray-800">{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          {deadlineStr && <span>{deadlineStr}</span>}
          {task.estimated_time && (
            <span className="flex items-center gap-0.5">
              <Clock size={11} /> {task.estimated_time}
            </span>
          )}
          {task.workflow_instance_id && <span className="text-indigo-500">WF</span>}
          {task.category && (
            <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${categoryBadgeClass(task.category)}`}>
              {task.category}
            </span>
          )}
          {task.fund_name && (
            <span className="rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-600">{task.fund_name}</span>
          )}
        </div>
      </div>

      {/* Right: action buttons — always visible */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onComplete(task)}
          className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
        >
          완료
        </button>
        <button
          onClick={() => onEdit(task)}
          className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
        >
          수정
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
          title="삭제"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
```

Key changes:
- **Removed** the round checkbox (`<button>` at lines 128–132)
- **Added** always-visible "완료" (emerald) and "수정" (blue) buttons on the right
- **Kept** delete (Trash2) icon as hover-only
- Task title area still clickable for edit (unchanged)

---

## Files to modify

| # | File | Changes |
|---|------|---------|
| 1 | `frontend/src/pages/FundsPage.tsx` | Status → dropdown; remove AUM from EMPTY_FUND, FundForm, cards; add conditional date fields |
| 2 | `frontend/src/pages/FundDetailPage.tsx` | Status → dropdown; remove AUM; verify fund type dropdown; add conditional dates |
| 3 | `frontend/src/lib/api.ts` | Add `maturity_date`, `dissolution_date` to `FundInput` if missing; remove `aum` from `FundInput` |
| 4 | `frontend/src/pages/WorkflowsPage.tsx` | Remove `checkedTemplates` state; link checkbox to `selectedId` (single select) |
| 5 | `frontend/src/pages/TaskBoardPage.tsx` | Replace TaskItem left checkbox with right-side "완료" + "수정" buttons |

---

## Acceptance Criteria

### Part 1: Fund Management fixes
- [ ] AC-01: FundForm status field is a `<select>` dropdown with options: 결성예정/운용 중/해산/청산 완료
- [ ] AC-02: FundForm shows conditional date inputs based on status (만기일 for active+, 해산일 for dissolved/liquidated)
- [ ] AC-03: Fund cards show auto-date from `fundDateInfo()` linked to the status dropdown value
- [ ] AC-04: AUM (운용규모) field is completely removed from FundsPage UI (EMPTY_FUND, FundForm, cards)
- [ ] AC-05: AUM field is also removed from FundDetailPage UI
- [ ] AC-06: Fund type dropdown is verified in both FundsPage and FundDetailPage

### Part 2: Workflow checkbox
- [ ] AC-07: Clicking template round checkbox sets `selectedId` (opens detail panel)
- [ ] AC-08: Clicking again deselects (closes detail panel)
- [ ] AC-09: Only one template can be checked at a time (single select, no multi-select)

### Part 3: Task Board completion UX
- [ ] AC-10: TaskItem no longer has a left-side round checkbox
- [ ] AC-11: TaskItem has an always-visible "완료" button (emerald) on the right
- [ ] AC-12: TaskItem has an always-visible "수정" button (blue) on the right
- [ ] AC-13: "완료" button opens CompleteModal; "수정" button opens EditTaskModal
- [ ] AC-14: Delete (trash) icon remains hover-only

---

**Last updated:** 2026-02-15
