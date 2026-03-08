# ERP UX/UI Audit Snapshot

## Current Shared Patterns
- `page-header`
- `card-base`
- `DataFilterBar`
- `DataTable`
- `StatusBadge`

## Domain Buckets
- Interactive work surfaces:
  - dashboard
  - task board
  - workflows
  - work logs
  - calendar
- Fund and LP operations:
  - funds
  - fund overview
  - fund detail
  - LP management
  - LP address book
- Investment and finance:
  - investments
  - investment detail
  - transactions
  - valuations
  - exits
  - accounting
  - fee management
  - cash flow
  - provisional FS
- Compliance and admin:
  - compliance
  - documents
  - template management
  - reports
  - internal review
  - users
  - my profile

## Main Issues Observed
- Header and control strip grammar was inconsistent across pages.
- Tables mixed uppercase, loose spacing, and repeated local styling.
- Some pages used stacked cards where dense list-detail layouts were better suited.
- Several empty states still followed legacy emoji-era affordances.
- Sub-tabs and view toggles used inconsistent size and alignment rules.

## First-Wave Remediation
- Added page primitives:
  - `PageHeader`
  - `PageControlStrip`
  - `PageMetricStrip`
  - `SectionScaffold`
  - `WorkbenchSplit`
- Normalized page shell rhythm in global CSS.
- Refined shared table and filter primitives for dense ERP use.
- Began migration on operational pages with simpler structures first.
