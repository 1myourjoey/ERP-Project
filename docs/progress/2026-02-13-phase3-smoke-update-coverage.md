# 2026-02-13 Phase3 Smoke Update Coverage

## Scope
- Expand phase3 smoke checks from create/list coverage to update + synchronization coverage.

## Updated
- `backend/scripts/api_smoke.py`
  - Added update assertions for:
    - capital call
    - capital call item
    - distribution
    - distribution item
    - assembly
    - exit committee
    - exit committee fund link
    - exit trade
  - Added committee-fund list endpoint presence check.
  - Added transaction ledger sync value checks after exit trade update:
    - `amount`
    - `shares_change`
    - `realized_gain`

## Intent
- Reduce regression risk where update endpoints exist but field synchronization (especially exit-trade to transaction sync) silently breaks.

## Notes
- Runtime execution of smoke script was not performed in this environment because `python` command is unavailable.
