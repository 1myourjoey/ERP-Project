# Phase 6: Top Navigation Bar + UI/UX Consistency Overhaul

## Context

This is a 1-person VC back-office ERP (Trigger Investment Partners).
- Stack: React 18 + Vite + TailwindCSS v4 + React Query + react-router-dom
- Current layout: 264px left sidebar with 6 groups / 18 menu items
- Design system: Apple-style gray palette, system font stack, rounded-xl corners

## Objective

Replace the left sidebar navigation with a **top navigation bar + dropdown menus**, and standardize all page layouts for consistency and maximum screen real estate.

---

## Part 1: Top Navigation Bar

### 1.1 Remove Sidebar, Add Top Navbar

**File:** `frontend/src/components/Layout.tsx`

Replace the current `<aside>` sidebar + top header with a single top navigation bar.

#### Structure

```
┌──────────────────────────────────────────────────────────────┐
│  VC ERP (logo)    대시보드   업무▾   조합·투자▾   재무▾   관리▾   🔍  │
└──────────────────────────────────────────────────────────────┘
│                                                              │
│                     <main> full width                        │
│                                                              │
```

#### Nav Groups (reorganized from 6 → 5)

```typescript
const NAV_GROUPS = [
  {
    label: '대시보드',
    to: '/dashboard',         // direct link, no dropdown
    icon: LayoutDashboard,
  },
  {
    label: '업무',
    items: [
      { to: '/tasks', label: '업무 보드', icon: KanbanSquare },
      { to: '/worklogs', label: '업무 기록', icon: BookOpen },
      { to: '/checklists', label: '체크리스트', icon: CheckSquare },
    ],
  },
  {
    label: '조합·투자',
    items: [
      { to: '/funds', label: '조합 관리', icon: Building2 },
      { to: '/investments', label: '투자 관리', icon: PieChart },
      { to: '/workflows', label: '워크플로우', icon: GitBranch },
      { to: '/exits', label: '회수 관리', icon: TrendingDown },
    ],
  },
  {
    label: '재무',
    items: [
      { to: '/transactions', label: '거래원장', icon: ListTree },
      { to: '/valuations', label: '가치평가', icon: LineChart },
      { to: '/accounting', label: '회계 관리', icon: Calculator },
    ],
  },
  {
    label: '관리',
    items: [
      { to: '/biz-reports', label: '영업보고', icon: FileText },
      { to: '/reports', label: '보고공시', icon: Send },
      { to: '/fund-operations', label: '조합 운영', icon: Landmark },
      { to: '/documents', label: '서류 현황', icon: Files },
    ],
  },
]
```

#### Navbar Styling

- Height: `h-14` (56px)
- Background: `bg-white border-b border-gray-200`
- Left side: Logo text "VC ERP" with `text-lg font-semibold`
- Center/Right: Nav group labels as horizontal buttons
- Right end: Search button with `Ctrl+K` shortcut (keep existing SearchModal)
- Active page's parent group: `text-blue-600 font-medium`
- Dropdown trigger: click (not hover) for reliability

#### Dropdown Menu Styling

- Appear below the nav group label on click
- `bg-white border border-gray-200 rounded-xl shadow-lg`
- Min-width: `min-w-[200px]`
- Each item: icon (16px) + label, `px-4 py-2.5 text-sm`
- Active item: `bg-blue-50 text-blue-600`
- Hover: `bg-gray-50`
- Close on: click outside, click item, press Escape
- Animate: `transition-all duration-150` opacity + translateY

#### Mobile (< md breakpoint)

- Replace nav groups with hamburger menu icon (left side)
- Hamburger opens a **full-screen overlay** with all items listed vertically (grouped)
- Logo stays visible on mobile
- Search button stays visible on mobile

### 1.2 Layout Structure Change

**Before (sidebar):**
```tsx
<div className="flex h-screen">
  <aside className="w-64">...</aside>
  <div className="flex-1 flex-col">
    <header>...</header>
    <main>...</main>
  </div>
</div>
```

**After (top nav):**
```tsx
<div className="flex flex-col h-screen">
  <nav className="h-14 ...">...</nav>
  <main className="flex-1 overflow-auto">
    <Outlet />
  </main>
</div>
```

- Remove the `<header>` bar that showed "현재 페이지" — this is redundant when each page has its own title
- `<main>` now gets full width and full remaining height

---

## Part 2: Page Layout Standardization

### 2.1 Consistent Page Container

Every page MUST use the same wrapper pattern:

```tsx
<div className="mx-auto max-w-7xl px-6 py-6">
  {/* Page header */}
  <div className="flex items-center justify-between mb-6">
    <div>
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>  {/* optional */}
    </div>
    <div className="flex items-center gap-2">
      {/* Action buttons here */}
    </div>
  </div>

  {/* Page content */}
  ...
</div>
```

**Rules:**
- Max width: `max-w-7xl` for all pages (consistent)
- Padding: `px-6 py-6`
- Page title: `text-xl font-semibold` (h2)
- Action buttons: always top-right, aligned with title
- Subtitle: optional `text-sm text-gray-500`

### 2.2 Apply to Each Page

Update these pages to match the standard container pattern:

| Page | Current padding | Fix |
|------|----------------|-----|
| DashboardPage | `p-6 max-w-6xl` | → `mx-auto max-w-7xl px-6 py-6` |
| TaskBoardPage | `p-6` | → `mx-auto max-w-7xl px-6 py-6` |
| FundsPage | `p-6 max-w-5xl` | → `mx-auto max-w-7xl px-6 py-6` |
| InvestmentsPage | `p-6 max-w-7xl` | → `mx-auto max-w-7xl px-6 py-6` |
| WorkflowsPage | `p-6 max-w-7xl` | → `mx-auto max-w-7xl px-6 py-6` |
| TransactionsPage | `max-w-7xl p-6` | → `mx-auto max-w-7xl px-6 py-6` |
| All other pages | various | → `mx-auto max-w-7xl px-6 py-6` |

### 2.3 Consistent Card Component Pattern

All content sections should use the same card style:

```tsx
<div className="rounded-2xl border border-gray-200 bg-white p-5">
  ...
</div>
```

- Border radius: `rounded-2xl` (not mix of xl/2xl)
- Border: `border border-gray-200`
- Background: `bg-white`
- Padding: `p-5`

### 2.4 Consistent Button Styles

**Primary action** (create/add):
```
bg-blue-600 text-white hover:bg-blue-700 rounded-xl px-4 py-2 text-sm font-medium
```

**Secondary action** (filter/cancel):
```
border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl px-4 py-2 text-sm
```

**Danger action** (delete):
```
text-red-600 hover:bg-red-50 rounded-xl px-3 py-1.5 text-sm
```

Standardize across ALL pages.

### 2.5 Consistent Modal Pattern

All modals (create/edit forms that overlay) should follow:

```tsx
{/* Backdrop */}
<div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />

{/* Modal */}
<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
    {/* Header */}
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold">{title}</h3>
      <button onClick={onClose}>
        <X size={20} className="text-gray-400 hover:text-gray-600" />
      </button>
    </div>
    {/* Body */}
    ...
    {/* Footer */}
    <div className="flex justify-end gap-2 mt-6">
      <button className="secondary-btn" onClick={onClose}>취소</button>
      <button className="primary-btn" onClick={onSubmit}>저장</button>
    </div>
  </div>
</div>
```

- Max widths: `max-w-sm` (simple), `max-w-lg` (standard), `max-w-2xl` (complex/wide)
- Always include close button (X) in header
- Always include cancel + submit in footer
- Z-index: 50

---

## Part 3: Additional UX Improvements

### 3.1 Breadcrumb for Detail Pages

For pages with detail views (FundDetailPage, InvestmentDetailPage), add a simple breadcrumb:

```tsx
<div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
  <Link to="/funds" className="hover:text-blue-600">조합 관리</Link>
  <span>/</span>
  <span className="text-gray-900">{fund.name}</span>
</div>
```

### 3.2 Empty State

When a list/table has no data, show a consistent empty state:

```tsx
<div className="flex flex-col items-center justify-center py-16 text-gray-400">
  <Icon size={40} className="mb-3" />
  <p className="text-sm">{message}</p>
  <button className="mt-3 primary-btn text-sm">+ {addLabel}</button>
</div>
```

### 3.3 Loading State

Consistent loading indicator:

```tsx
<div className="flex items-center justify-center py-16">
  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
</div>
```

---

## Files to Modify

1. `frontend/src/components/Layout.tsx` — Complete rewrite (sidebar → top nav)
2. `frontend/src/index.css` — No major changes needed, keep existing styles
3. `frontend/src/pages/DashboardPage.tsx` — Container standardization
4. `frontend/src/pages/TaskBoardPage.tsx` — Container standardization
5. `frontend/src/pages/FundsPage.tsx` — Container + button standardization
6. `frontend/src/pages/FundDetailPage.tsx` — Container + breadcrumb
7. `frontend/src/pages/InvestmentsPage.tsx` — Container standardization
8. `frontend/src/pages/InvestmentDetailPage.tsx` — Container + breadcrumb
9. `frontend/src/pages/WorkflowsPage.tsx` — Container standardization
10. `frontend/src/pages/WorkLogsPage.tsx` — Container standardization
11. `frontend/src/pages/TransactionsPage.tsx` — Container standardization
12. `frontend/src/pages/ValuationsPage.tsx` — Container standardization
13. `frontend/src/pages/AccountingPage.tsx` — Container standardization
14. `frontend/src/pages/BizReportsPage.tsx` — Container standardization
15. `frontend/src/pages/ReportsPage.tsx` — Container standardization
16. `frontend/src/pages/ExitsPage.tsx` — Container standardization
17. `frontend/src/pages/FundOperationsPage.tsx` — Container standardization
18. `frontend/src/pages/ChecklistsPage.tsx` — Container standardization
19. `frontend/src/pages/DocumentsPage.tsx` — Container standardization
20. `frontend/src/pages/CalendarPage.tsx` — Container standardization (if it exists as a standalone page)

## Files NOT to Modify

- `frontend/src/App.tsx` — Routes stay the same
- `backend/**` — No backend changes needed
- `frontend/src/components/SearchModal.tsx` — Keep as-is

---

## Acceptance Criteria

1. Left sidebar is completely removed
2. Top navbar displays with 5 groups: 대시보드 (direct link) + 4 dropdown groups
3. Dropdowns open on click, close on click-outside / Escape / item-click
4. Active page's parent group is visually highlighted in the navbar
5. Mobile: hamburger menu with full-screen overlay listing all items
6. `Ctrl+K` search shortcut still works
7. All pages use `mx-auto max-w-7xl px-6 py-6` container
8. All pages have consistent header (title left, actions right)
9. All cards use `rounded-2xl border border-gray-200 bg-white p-5`
10. All primary buttons use `bg-blue-600 ... rounded-xl` style
11. Detail pages have breadcrumbs
12. Empty states and loading states are consistent
13. No visual regressions — all existing functionality preserved
14. `<main>` content area uses 100% available width (no sidebar eating space)
