# Phase 13: Fund Operations UX · Workflow Enhancements · Fund Card Display · Search Shortcut

> **Priority:** P0

---

## Table of Contents

1. [Part 1 — Fund Operations: Merge into Fund Management or optimize](#part-1--fund-operations-merge-into-fund-management-or-optimize)
2. [Part 2 — Fund Operations: Prominent fund selector above performance cards](#part-2--fund-operations-prominent-fund-selector-above-performance-cards)
3. [Part 3 — Workflow: Edit active instances + undo step completion + template checkbox](#part-3--workflow-edit-active-instances--undo-step-completion--template-checkbox)
4. [Part 4 — Fund Management cards: Full number display + auto-date + fund type dropdown](#part-4--fund-management-cards-full-number-display--auto-date--fund-type-dropdown)
5. [Part 5 — Search bar: Change shortcut to Ctrl+Space](#part-5--search-bar-change-shortcut-to-ctrlspace)
6. [Files to modify](#files-to-modify)
7. [Acceptance Criteria](#acceptance-criteria)

---

## Part 1 — Fund Operations: Merge into Fund Management or optimize

### Context

Currently, "조합 관리" (Fund Management, `/funds`) and "조합 운영" (Fund Operations, `/fund-operations`) are separate sidebar navigation items and separate pages:

- **FundsPage.tsx** (`/funds`): Fund list cards → click to open FundDetailPage (`/funds/:id`)
- **FundOperationsPage.tsx** (`/fund-operations`): Capital calls, distributions, assemblies, performance metrics — all scoped to a selected fund

### Decision: Keep separate, but add cross-links

After analysis, **keeping them separate is more efficient** because:
- FundOperationsPage is already 541 lines with complex CRUD for 3 entity types + performance
- FundDetailPage is already 898 lines managing fund info, LPs, investments, notices, key terms
- Merging would create an unwieldy 1400+ line component

**Instead, improve discoverability by adding cross-links:**

1. In `FundDetailPage.tsx`: Add a **"조합 운영으로 이동"** button (links to `/fund-operations` with the fund pre-selected via query param or state)
2. In `FundOperationsPage.tsx`: Add a **"조합 상세 보기"** button (links to `/funds/:id`)

**Implementation:**

In `FundDetailPage.tsx`, add near the top of the page (after the header):
```tsx
<button
  onClick={() => navigate('/fund-operations', { state: { fundId: fund.id } })}
  className="secondary-btn inline-flex items-center gap-1 text-sm"
>
  <Landmark size={14} /> 조합 운영으로 이동
</button>
```

In `FundOperationsPage.tsx`, add near the fund selector:
```tsx
{selectedFundId && (
  <button
    onClick={() => navigate(`/funds/${selectedFundId}`)}
    className="secondary-btn text-sm"
  >
    조합 상세 보기
  </button>
)}
```

Also, `FundOperationsPage` should read `location.state?.fundId` to auto-select the fund when navigated from FundDetailPage:
```tsx
const location = useLocation()
const initialFundId = (location.state as { fundId?: number } | null)?.fundId
// Use initialFundId to set initial fundId state
```

---

## Part 2 — Fund Operations: Prominent fund selector above performance cards

### Current state

The fund selector in `FundOperationsPage.tsx` is a small `<select>` in the page header (line 319), barely visible.

### Required change

Move the fund selector to a **prominent, visually distinct card** positioned **directly above** the performance metrics section. It should be immediately obvious and easy to use.

### Implementation

Replace the small `<select>` in the header area with a full-width styled card:

```tsx
{/* Fund Selector — prominent card above performance */}
<div className="rounded-xl border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
  <div className="flex items-center gap-3">
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white">
      <Landmark size={20} />
    </div>
    <div className="flex-1">
      <label className="text-xs font-medium text-blue-600 mb-1 block">조합 선택</label>
      <select
        value={selectedFundId || ''}
        onChange={(e) => setFundId(Number(e.target.value) || null)}
        className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
      >
        {funds?.map((fund) => (
          <option key={fund.id} value={fund.id}>{fund.name}</option>
        ))}
      </select>
    </div>
    {selectedFundId && (
      <button
        onClick={() => navigate(`/funds/${selectedFundId}`)}
        className="secondary-btn text-sm whitespace-nowrap"
      >
        조합 상세 보기
      </button>
    )}
  </div>
</div>
```

Remove the old `<select>` from the page header div (line 319).

---

## Part 3 — Workflow: Edit active instances + undo step completion + template checkbox

### 3-A. Allow editing active workflow instances

**Current state:** Active workflow instances in `WorkflowsPage.tsx` → `InstanceList` component only allow step completion and cancellation. No way to edit instance name, trigger date, or associated fund/company.

**Required change:** Add an "수정" (Edit) button for active instances that opens an inline edit form.

**Implementation:**

In `InstanceList` component (around line 490), add an edit button next to the Print button:

```tsx
<button
  onClick={(event) => {
    event.stopPropagation()
    toggleInstanceEdit(inst)
  }}
  className="secondary-btn text-sm"
>
  수정
</button>
```

Add state and inline form for editing:
```tsx
const [editingInstanceId, setEditingInstanceId] = useState<number | null>(null)
const [editInstance, setEditInstance] = useState<{ name: string; trigger_date: string; memo: string } | null>(null)

const toggleInstanceEdit = (inst: WorkflowInstance) => {
  if (editingInstanceId === inst.id) {
    setEditingInstanceId(null)
    setEditInstance(null)
    return
  }
  setEditingInstanceId(inst.id)
  setEditInstance({ name: inst.name, trigger_date: inst.trigger_date, memo: inst.memo || '' })
}
```

Add API: `updateWorkflowInstance(instanceId, data)` in `api.ts` and create corresponding backend endpoint if not existing.

### 3-B. Undo step completion + timestamp on completion

**Current state:** In `InstanceList`, clicking the circle button immediately marks a step as completed (`completeWorkflowStep`). There is no way to undo, and no completion timestamp shown.

**Required change:**
1. When a step is marked complete, record current time and display it next to the step
2. Add an "undo" button (small "되돌리기" or circular undo icon) next to completed steps to revert them back to pending
3. The step should NOT visually disappear immediately — it stays visible with a completed state

**Implementation:**

Backend: Add `completed_at` field to `WorkflowStepInstance` model if not already present.

Add undo mutation:
```tsx
const undoStepMut = useMutation({
  mutationFn: ({ instanceId, stepId }: { instanceId: number; stepId: number }) =>
    undoWorkflowStep(instanceId, stepId),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
    addToast('success', '단계 완료가 취소되었습니다.')
  },
})
```

Backend API: `PUT /api/workflow-instances/{instance_id}/steps/{step_id}/undo` → set step status back to 'pending', clear `completed_at`.

Frontend API: Add `undoWorkflowStep(instanceId, stepId)` to `api.ts`.

Modify step rendering to show:
```tsx
{step.status === 'completed' ? (
  <div className="flex items-center gap-1">
    <Check size={14} className="text-emerald-600" />
    <button onClick={() => undoStepMut.mutate({ instanceId: inst.id, stepId: step.id })}
      className="text-[10px] text-gray-400 hover:text-blue-600">되돌리기</button>
  </div>
) : (
  <button onClick={() => completeMut.mutate({ instanceId: inst.id, stepId: step.id, estimated: step.estimated_time })}
    className="w-4 h-4 rounded-full border-2 border-gray-300 hover:border-green-500" />
)}

{/* Show completion timestamp */}
{step.completed_at && (
  <span className="text-[10px] text-gray-400">
    {new Date(step.completed_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
  </span>
)}
```

### 3-C. Template card: Round checkbox indicator

**Current state:** Template cards in the template list (lines 638–656) have no visual checkbox indicator.

**Required change:** Add a **round checkbox** in the top-right corner of each template card. Clicking toggles check/uncheck state visually. This is for visual tracking only (selecting templates for batch operations or quick visual marking).

**Implementation:**

Add state:
```tsx
const [checkedTemplates, setCheckedTemplates] = useState<Set<number>>(new Set())

const toggleCheck = (id: number) => {
  setCheckedTemplates(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}
```

In each template card div, add at top-right:
```tsx
<div className="flex items-start justify-between">
  <button onClick={() => setSelectedId(row.id)} className="w-full text-left">
    <p className="text-sm font-medium text-gray-800">{row.name}</p>
    <p className="text-xs text-gray-500">{row.step_count} 단계{row.total_duration ? ` · ${row.total_duration}` : ''}</p>
  </button>
  <button
    onClick={(e) => { e.stopPropagation(); toggleCheck(row.id) }}
    className={`ml-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
      checkedTemplates.has(row.id)
        ? 'border-emerald-500 bg-emerald-500 text-white'
        : 'border-gray-300 bg-white hover:border-gray-400'
    }`}
  >
    {checkedTemplates.has(row.id) && <Check size={12} />}
  </button>
</div>
```

---

## Part 4 — Fund Management cards: Full number display + auto-date + fund type dropdown

### 4-A. Full number display with Korean notation

**Current state:**  
`formatKRW()` in `labels.ts` (line 43–48) abbreviates numbers:
- `>= 1억` → `"1.0억"`
- `>= 1만` → `"10,000만"`
- else → raw `toLocaleString()`

Fund cards in `FundsPage.tsx` only show the abbreviated form (e.g., "100.0억").

**Required change:**  
Display **both** the full number AND the Korean notation together, aesthetically aligned. Input fields must always accept full raw numbers (no abbreviation in input).

**Implementation:**

1. Add a new helper function in `labels.ts`:

```tsx
export const formatKRWFull = (amount: number | null): { full: string; label: string } => {
  if (amount == null) return { full: '-', label: '' }
  const full = amount.toLocaleString() + '원'
  let label = ''
  if (amount >= 100_000_000) label = `${(amount / 100_000_000).toFixed(1)}억원`
  else if (amount >= 10_000) label = `${Math.round(amount / 10_000).toLocaleString()}만원`
  return { full, label }
}
```

2. Update `FundsPage.tsx` fund card rendering:

```tsx
{fund.commitment_total != null && (() => {
  const fmt = formatKRWFull(fund.commitment_total)
  return (
    <div className="text-gray-500">
      <span className="text-xs">약정총액</span>
      <p className="font-medium text-gray-700">{fmt.full}</p>
      {fmt.label && <p className="text-[11px] text-gray-400">{fmt.label}</p>}
    </div>
  )
})()}
```

3. Ensure all number input fields (`commitment_total`, `aum`, etc.) use `type="number"` and store the full raw number — no abbreviation in input. This is already the case.

### 4-B. Auto-date display based on fund status

**Current state:**  
Fund cards show `결성일` from `fund.formation_date`. No dynamic date logic based on fund status.

**Required change:**  
Below the fund name, show a date label that changes based on fund status:
- `forming` → "결성예정" + `formation_date`
- `active` → "운용 중" + current date (auto-calculated, show how many days since formation)
- `dissolved` / `liquidated` → "해산/청산 완료" + `maturity_date` (expiry date)

**Implementation:**

```tsx
const fundDateInfo = (fund: Fund): { label: string; date: string } => {
  if (fund.status === 'forming') {
    return { label: '결성예정', date: fund.formation_date || '-' }
  }
  if (fund.status === 'active') {
    const today = new Date().toLocaleDateString('ko-KR')
    const days = fund.formation_date
      ? Math.floor((Date.now() - new Date(fund.formation_date).getTime()) / 86400000)
      : null
    return { label: '운용 중', date: `${today}${days != null ? ` (${days}일차)` : ''}` }
  }
  // dissolved, liquidated, etc.
  return { label: '해산/청산 완료', date: fund.maturity_date || fund.dissolution_date || '-' }
}
```

In the card, below `fund.name`:
```tsx
<p className="mt-0.5 text-xs text-gray-500">
  {fund.type} | {dateInfo.label}: {dateInfo.date}
</p>
```

> **Note:** If `maturity_date` or `dissolution_date` fields do not exist on the Fund model, add them to the backend model and API.

### 4-C. Fund type dropdown

**Current state:**  
`FundsPage.tsx` `FundForm` component uses a plain text `<input>` for fund type (line 48: `placeholder="조합 유형"`).

**Required change:**  
Replace with a `<select>` dropdown listing common fund types.

**Implementation:**

```tsx
const FUND_TYPE_OPTIONS = [
  '투자조합',
  '벤처투자조합',
  '신기술투자조합',
  '사모투자합자회사(PEF)',
  '창업투자조합',
  '기타',
]

// In FundForm, replace the type input:
<select
  value={form.type}
  onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
  className="px-3 py-2 text-sm border rounded-lg"
>
  {FUND_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
</select>
```

---

## Part 5 — Search bar: Change shortcut to Ctrl+Space

### Current state

- `Layout.tsx` line 121: `event.key.toLowerCase() === 'k'` listens for Ctrl+K
- `Layout.tsx` line 236: Shows `<kbd>Ctrl+K</kbd>` hint
- `SearchModal.tsx` line 128: Shows help text `"언제든지 Ctrl+K 또는 Cmd+K로 검색할 수 있습니다."`

### Required change

Change from Ctrl+K / Cmd+K to **Ctrl+Space / Cmd+Space** everywhere.

### Implementation

1. **Layout.tsx** (line 121):
```tsx
// Before:
const isSearchShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'
// After:
const isSearchShortcut = (event.ctrlKey || event.metaKey) && event.key === ' '
```

2. **Layout.tsx** (line 236):
```tsx
// Before:
<kbd ...>Ctrl+K</kbd>
// After:
<kbd ...>Ctrl+Space</kbd>
```

3. **SearchModal.tsx** (line 128):
```tsx
// Before:
"언제든지 Ctrl+K 또는 Cmd+K로 검색할 수 있습니다."
// After:
"언제든지 Ctrl+Space 또는 Cmd+Space로 검색할 수 있습니다."
```

---

## Files to modify

| # | File | Changes |
|---|------|---------|
| 1 | `frontend/src/pages/FundOperationsPage.tsx` | Replace small fund select with prominent card; add "조합 상세 보기" link; read `location.state.fundId` |
| 2 | `frontend/src/pages/FundDetailPage.tsx` | Add "조합 운영으로 이동" button linking to `/fund-operations` with fund state |
| 3 | `frontend/src/pages/WorkflowsPage.tsx` | Active instance edit UI; step undo + completion timestamp; template round checkbox |
| 4 | `frontend/src/pages/FundsPage.tsx` | Full number + Korean notation display; auto-date by status; fund type dropdown |
| 5 | `frontend/src/lib/labels.ts` | Add `formatKRWFull()` helper |
| 6 | `frontend/src/lib/api.ts` | Add `updateWorkflowInstance()`, `undoWorkflowStep()` |
| 7 | `frontend/src/components/Layout.tsx` | Change shortcut from Ctrl+K to Ctrl+Space (lines 121, 236) |
| 8 | `frontend/src/components/SearchModal.tsx` | Update help text from Ctrl+K to Ctrl+Space (line 128) |
| 9 | `backend/routers/workflows.py` | Add `PUT /instances/{id}` edit endpoint; add `PUT /instances/{id}/steps/{step_id}/undo` endpoint |
| 10 | `backend/models.py` | Add `completed_at` field to `WorkflowStepInstance` if missing; add `maturity_date`/`dissolution_date` to `Fund` if missing |

---

## Acceptance Criteria

### Part 1: Fund Operations ↔ Fund Management cross-links
- [ ] AC-01: FundDetailPage has a "조합 운영으로 이동" button that navigates to `/fund-operations` with the fund pre-selected
- [ ] AC-02: FundOperationsPage has a "조합 상세 보기" button that navigates to `/funds/:id`
- [ ] AC-03: FundOperationsPage reads `location.state.fundId` to auto-select the fund

### Part 2: Prominent fund selector
- [ ] AC-04: Fund selector is a visually prominent card with icon, label "조합 선택", and styled select box
- [ ] AC-05: The old small `<select>` in the page header is removed

### Part 3: Workflow enhancements
- [ ] AC-06: Active workflow instances have an "수정" button that opens inline edit for name, trigger date, memo
- [ ] AC-07: Completed steps show a "되돌리기" button/link to undo completion
- [ ] AC-08: Completing a step records `completed_at` timestamp and displays it (e.g., "2/15 14:30")
- [ ] AC-09: Template cards have a round checkbox in the top-right corner that toggles check/uncheck

### Part 4: Fund Management cards
- [ ] AC-10: Fund cards show **full number** (e.g., "5,000,000,000원") with Korean notation below (e.g., "50.0억원")
- [ ] AC-11: Fund cards show auto-date based on status: "결성예정" / "운용 중 (N일차)" / "해산/청산 완료"
- [ ] AC-12: FundForm uses a `<select>` dropdown for fund type instead of free-text input

### Part 5: Search shortcut
- [ ] AC-13: Pressing Ctrl+Space (or Cmd+Space) opens the search modal
- [ ] AC-14: Ctrl+K no longer triggers the search modal
- [ ] AC-15: UI hints show "Ctrl+Space" instead of "Ctrl+K"

---

**Last updated:** 2026-02-15
