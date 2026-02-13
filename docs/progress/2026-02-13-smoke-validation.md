# 2026-02-13 Smoke Validation

## Scope
- End-to-end API smoke for core CRUD flows
- Task-Calendar linkage validation
- Workflow step activation validation
- Build/import regression checks

## Added
- `backend/scripts/api_smoke.py`
  - Starts local API server in-process
  - Runs API-level smoke checks:
    - health
    - task create/update/delete + linked calendar sync
    - fund/lp CRUD
    - company/investment/document CRUD + document-status query
    - checklist CRUD
    - worklog CRUD
    - workflow instantiate + step-complete -> next step/task activation
    - 404 error response shape (`detail`)
  - Cleans up test artifacts at end

## Fixed
- `backend/routers/workflows.py`
  - In `complete_step`, added `db.flush()` before querying next pending step
  - Excluded current step with `WorkflowStepInstance.id != step_instance_id`
  - Reason: session has `autoflush=False`, so without flush current step could be re-selected as pending

## Execution Results
- Command: `python backend/scripts/api_smoke.py`
  - Result: PASS
- Command: `cd frontend && npm run build`
  - Result: PASS
- Command: `cd backend && python -c "from main import app; print('OK')"`
  - Result: PASS

## Notes
- Existing accidental smoke artifacts from a failed intermediate run were cleaned (`smoke-*` rows).
