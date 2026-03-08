# ERP UX/UI Consistency Contract

## Scope
- Applies to all authenticated internal pages under `frontend/src/pages/`
- Excludes authentication pages

## Page Grammar
1. `PageHeader`
2. `PageMetricStrip`
3. `PageControlStrip`
4. `SectionScaffold` and `WorkbenchSplit` for body layout

## Layout Rules
- Use a consistent start line across tabs and detail pages.
- Prefer dense enterprise layouts over decorative spacing.
- Use `WorkbenchSplit` for list-detail flows.
- Use `SectionScaffold` for titled blocks instead of ad hoc card headers.

## Visual Rules
- Base tone: deep navy, silver-blue surfaces, muted slate text
- Warning: amber
- Danger: muted wine
- Success: green
- No emoji-first status UI

## Interaction Rules
- Primary actions stay in page header or section header.
- Row/card hover actions should not be always visible unless needed for task speed.
- Filters should stay compact and one-line where possible.
- Detail actions belong in the opened or selected state.

## Table Rules
- Use sentence-case headers for Korean tables.
- Keep header/body rhythm dense and numerically aligned.
- Prefer sticky or compact table wrappers over oversized cards.

## Detail Rules
- Choose one detail pattern per page:
  - right rail
  - bottom expansion
  - full-width section

## Typography Rules
- Heading: Gmarket Sans
- Body: Pretendard
- Numeric/data cells: IBM Plex Sans KR
