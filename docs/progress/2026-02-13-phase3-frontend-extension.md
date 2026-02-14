# 2026-02-13 Phase3 Frontend Extension

## Scope
- Finish frontend integration for phase3 domain APIs.
- Add operational screens for transactions, fund operations, and exits.
- Add update flows (not only create/delete) for newly added operations.

## Added
- `frontend/src/pages/TransactionsPage.tsx`
  - transaction list/filter/create/update/delete
  - fund/company/investment linked form controls
- `frontend/src/pages/ValuationsPage.tsx`
  - valuation list/filter/create/update/delete
  - fund/company/investment linked form controls
  - evaluator/method/instrument/value/change fields
- `frontend/src/pages/FundOperationsPage.tsx`
  - capital call/distribution/assembly list/create/delete
  - capital call/distribution item list/create/delete
  - fund performance query panel
  - update actions for calls, call items, distributions, distribution items, assemblies
- `frontend/src/pages/ExitsPage.tsx`
  - exit committee/fund-link/trade list/create/delete
  - update actions for committee, committee fund link, and trade

## Updated
- `frontend/src/App.tsx`
  - routes added:
    - `/transactions`
    - `/valuations`
    - `/fund-operations`
    - `/exits`
- `frontend/src/components/Layout.tsx`
  - navigation entries added for new phase3 pages (`Transaction Ledger`, `Valuations`, `Fund Operations`, `Exit Management`)

## Validation
- Frontend build command:
  - `cd frontend && npm.cmd run build`
  - Result: PASS

## Additional UX Update
- `frontend/src/pages/FundOperationsPage.tsx`
  - Replaced prompt-based edit with inline row edit mode for:
    - capital calls
    - capital call items
    - distributions
    - distribution items
    - assemblies
- `frontend/src/pages/ExitsPage.tsx`
  - Replaced prompt-based edit with inline row edit mode for:
    - exit committees
    - committee fund links
    - exit trades

## Edit-State Hardening
- `frontend/src/pages/FundOperationsPage.tsx`
  - Separated create form state (`new*`) from edit form state (`edit*`) for:
    - capital calls
    - capital call items
    - distributions
    - distribution items
    - assemblies
  - Edit button now initializes row/item-scoped edit state before rendering controls.
  - Save handlers now use edit state only, preventing stale create-form values from leaking into update payloads.
  - Added explicit cancel actions that clear edit state.
- `frontend/src/pages/ExitsPage.tsx`
  - Separated create form state (`new*`) from edit form state (`edit*`) for:
    - committees
    - committee fund links
    - exit trades
  - Edit button now initializes row/item-scoped edit state before rendering controls.
  - Save handlers now use edit state only, preventing stale create-form values from leaking into update payloads.
  - Added explicit cancel actions that clear edit state.

## Notes
- Build requires elevated execution in this environment due `esbuild` spawn permission (`EPERM`) under sandbox mode.
- Backend runtime import check was not executed here because `python` command is unavailable in the environment.
