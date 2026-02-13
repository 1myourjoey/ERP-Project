from __future__ import annotations

import json
import sys
import threading
import time
import uuid
from datetime import date, timedelta
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import uvicorn

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import SessionLocal
from main import app
from models.task import Task
from models.workflow import Workflow, WorkflowDocument, WorkflowStep, WorkflowWarning
from models.workflow_instance import WorkflowInstance, WorkflowStepInstance

BASE_URL = "http://127.0.0.1:8111"


class SmokeFailure(RuntimeError):
    pass


def expect(condition: bool, message: str) -> None:
    if not condition:
        raise SmokeFailure(message)


def http_request(
    method: str,
    path: str,
    payload: dict[str, Any] | list[Any] | None = None,
    expected_status: tuple[int, ...] = (200,),
) -> tuple[int, Any, str]:
    body = None
    headers = {}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = Request(f"{BASE_URL}{path}", data=body, method=method, headers=headers)
    try:
        with urlopen(req, timeout=20) as res:
            status = res.getcode()
            text = res.read().decode("utf-8")
    except HTTPError as err:
        status = err.code
        text = err.read().decode("utf-8")

    parsed: Any
    if text:
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = text
    else:
        parsed = None

    if status not in expected_status:
        raise SmokeFailure(
            f"{method} {path} returned {status}, expected {expected_status}. body={parsed}"
        )
    return status, parsed, text


def find_calendar_event(events: list[dict[str, Any]], task_id: int) -> dict[str, Any] | None:
    for event in events:
        if event.get("task_id") == task_id:
            return event
    return None


def start_server() -> tuple[uvicorn.Server, threading.Thread]:
    config = uvicorn.Config(app, host="127.0.0.1", port=8111, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    for _ in range(120):
        if server.started:
            return server, thread
        time.sleep(0.1)
    raise SmokeFailure("Server did not start in time")


def stop_server(server: uvicorn.Server, thread: threading.Thread) -> None:
    server.should_exit = True
    thread.join(timeout=5)


def cleanup_workflow_artifacts(workflow_id: int | None, instance_id: int | None) -> None:
    db = SessionLocal()
    try:
        if instance_id is not None:
            db.query(Task).filter(Task.workflow_instance_id == instance_id).delete(
                synchronize_session=False
            )
            db.query(WorkflowStepInstance).filter(
                WorkflowStepInstance.instance_id == instance_id
            ).delete(synchronize_session=False)

            instance = db.get(WorkflowInstance, instance_id)
            if instance is not None:
                db.delete(instance)

        if workflow_id is not None:
            db.query(WorkflowWarning).filter(WorkflowWarning.workflow_id == workflow_id).delete(
                synchronize_session=False
            )
            db.query(WorkflowDocument).filter(
                WorkflowDocument.workflow_id == workflow_id
            ).delete(synchronize_session=False)
            db.query(WorkflowStep).filter(WorkflowStep.workflow_id == workflow_id).delete(
                synchronize_session=False
            )

            workflow = db.get(Workflow, workflow_id)
            if workflow is not None:
                db.delete(workflow)

        db.commit()
    finally:
        db.close()


def run_smoke() -> None:
    marker = f"smoke-{uuid.uuid4().hex[:8]}"
    today = date.today()

    created: dict[str, int | None] = {
        "task_id": None,
        "fund_id": None,
        "lp_id": None,
        "company_id": None,
        "investment_id": None,
        "document_id": None,
        "checklist_id": None,
        "checklist_item_id": None,
        "worklog_id": None,
        "workflow_id": None,
        "workflow_instance_id": None,
    }

    # 1) Health
    _, health, _ = http_request("GET", "/api/health")
    expect(isinstance(health, dict) and health.get("status") == "ok", "health check failed")
    print("[PASS] health check")

    # 2) Task <-> Calendar linkage
    deadline_day_1 = (today + timedelta(days=3)).isoformat()
    deadline_day_2 = (today + timedelta(days=4)).isoformat()
    deadline_1 = f"{deadline_day_1}T09:00:00"
    deadline_2 = f"{deadline_day_2}T15:30:00"

    _, task, _ = http_request(
        "POST",
        "/api/tasks",
        payload={
            "title": f"{marker}-task",
            "deadline": deadline_1,
            "estimated_time": "1h",
            "quadrant": "Q1",
            "memo": "smoke test",
        },
        expected_status=(201,),
    )
    created["task_id"] = int(task["id"])
    print("[PASS] create task")

    query_1 = urlencode({"date_from": deadline_day_1, "date_to": deadline_day_1})
    _, events_day_1, _ = http_request("GET", f"/api/calendar-events?{query_1}")
    expect(isinstance(events_day_1, list), "calendar list did not return list")
    linked_event = find_calendar_event(events_day_1, created["task_id"])
    expect(linked_event is not None, "calendar event not created from task deadline")
    print("[PASS] task deadline -> calendar event create")

    _, updated_task, _ = http_request(
        "PUT",
        f"/api/tasks/{created['task_id']}",
        payload={"title": f"{marker}-task-updated", "deadline": deadline_2},
    )
    expect(updated_task["title"].endswith("updated"), "task update did not apply")
    query_2 = urlencode({"date_from": deadline_day_2, "date_to": deadline_day_2})
    _, events_day_2, _ = http_request("GET", f"/api/calendar-events?{query_2}")
    moved_event = find_calendar_event(events_day_2, created["task_id"])
    expect(moved_event is not None, "calendar event not moved with task deadline update")
    expect(moved_event.get("title") == f"{marker}-task-updated", "calendar title did not sync")
    print("[PASS] task update -> calendar event sync")

    http_request(
        "PUT",
        f"/api/tasks/{created['task_id']}",
        payload={"deadline": None},
    )
    query_range = urlencode({"date_from": deadline_day_1, "date_to": deadline_day_2})
    _, events_after_clear, _ = http_request("GET", f"/api/calendar-events?{query_range}")
    expect(
        find_calendar_event(events_after_clear, created["task_id"]) is None,
        "calendar event should be removed when task deadline cleared",
    )
    print("[PASS] clear task deadline -> calendar event delete")

    http_request(
        "PUT",
        f"/api/tasks/{created['task_id']}",
        payload={"deadline": deadline_1},
    )
    _, events_before_task_delete, _ = http_request("GET", f"/api/calendar-events?{query_1}")
    expect(
        find_calendar_event(events_before_task_delete, created["task_id"]) is not None,
        "calendar event should reappear when deadline set again",
    )
    http_request("DELETE", f"/api/tasks/{created['task_id']}", expected_status=(204,))
    _, events_after_task_delete, _ = http_request("GET", f"/api/calendar-events?{query_1}")
    expect(
        find_calendar_event(events_after_task_delete, created["task_id"]) is None,
        "calendar event should be removed when task deleted",
    )
    created["task_id"] = None
    print("[PASS] delete task -> linked calendar event delete")

    # 3) Core CRUD (fund/company/investment/document/checklist/worklog)
    _, fund, _ = http_request(
        "POST",
        "/api/funds",
        payload={
            "name": f"{marker}-fund",
            "type": "vc_fund",
            "status": "active",
            "commitment_total": 1000000,
            "aum": 500000,
        },
        expected_status=(201,),
    )
    created["fund_id"] = int(fund["id"])

    _, fund_updated, _ = http_request(
        "PUT",
        f"/api/funds/{created['fund_id']}",
        payload={"status": "closed"},
    )
    expect(fund_updated.get("status") == "closed", "fund update failed")

    _, lp, _ = http_request(
        "POST",
        f"/api/funds/{created['fund_id']}/lps",
        payload={"name": f"{marker}-lp", "type": "institutional", "commitment": 300000, "paid_in": 100000},
        expected_status=(201,),
    )
    created["lp_id"] = int(lp["id"])
    http_request(
        "PUT",
        f"/api/funds/{created['fund_id']}/lps/{created['lp_id']}",
        payload={"paid_in": 150000},
    )
    print("[PASS] fund/lp CRUD")

    _, company, _ = http_request(
        "POST",
        "/api/companies",
        payload={"name": f"{marker}-company", "vics_registered": False},
        expected_status=(201,),
    )
    created["company_id"] = int(company["id"])
    http_request(
        "PUT",
        f"/api/companies/{created['company_id']}",
        payload={"industry": "SaaS", "vics_registered": True},
    )

    _, investment, _ = http_request(
        "POST",
        "/api/investments",
        payload={
            "fund_id": created["fund_id"],
            "company_id": created["company_id"],
            "investment_date": today.isoformat(),
            "amount": 250000,
            "shares": 120,
            "share_price": 2083.33,
            "status": "active",
            "instrument": "RCPS",
        },
        expected_status=(201,),
    )
    created["investment_id"] = int(investment["id"])
    http_request(
        "PUT",
        f"/api/investments/{created['investment_id']}",
        payload={"amount": 260000},
    )

    _, document, _ = http_request(
        "POST",
        f"/api/investments/{created['investment_id']}/documents",
        payload={"name": f"{marker}-doc", "doc_type": "term_sheet", "status": "pending"},
        expected_status=(201,),
    )
    created["document_id"] = int(document["id"])
    http_request(
        "PUT",
        f"/api/investments/{created['investment_id']}/documents/{created['document_id']}",
        payload={"status": "reviewing"},
    )
    _, document_status_rows, _ = http_request(
        "GET",
        f"/api/document-status?{urlencode({'fund_id': created['fund_id'], 'company_id': created['company_id']})}",
    )
    expect(
        isinstance(document_status_rows, list)
        and any(row.get("id") == created["document_id"] for row in document_status_rows),
        "document-status endpoint did not include created document",
    )
    print("[PASS] company/investment/document CRUD")

    _, checklist, _ = http_request(
        "POST",
        "/api/checklists",
        payload={
            "name": f"{marker}-checklist",
            "category": "smoke",
            "items": [{"order": 1, "name": "first", "required": True, "checked": False}],
        },
        expected_status=(201,),
    )
    created["checklist_id"] = int(checklist["id"])
    _, checklist_item, _ = http_request(
        "POST",
        f"/api/checklists/{created['checklist_id']}/items",
        payload={"order": 2, "name": "second", "required": False, "checked": False},
        expected_status=(201,),
    )
    created["checklist_item_id"] = int(checklist_item["id"])
    http_request(
        "PUT",
        f"/api/checklists/{created['checklist_id']}/items/{created['checklist_item_id']}",
        payload={"checked": True},
    )
    print("[PASS] checklist CRUD")

    _, categories, _ = http_request("GET", "/api/worklogs/categories")
    worklog_category = categories[0] if isinstance(categories, list) and categories else "smoke"
    _, worklog, _ = http_request(
        "POST",
        "/api/worklogs",
        payload={
            "date": today.isoformat(),
            "category": worklog_category,
            "title": f"{marker}-worklog",
            "content": "api smoke",
            "status": "done",
            "estimated_time": "1h",
            "actual_time": "45m",
            "details": [{"content": "detail-1"}],
            "lessons": [{"content": "lesson-1"}],
            "follow_ups": [{"content": "follow-1"}],
        },
        expected_status=(201,),
    )
    created["worklog_id"] = int(worklog["id"])
    http_request(
        "PUT",
        f"/api/worklogs/{created['worklog_id']}",
        payload={"content": "api smoke updated", "status": "in_progress"},
    )
    print("[PASS] worklog CRUD")

    # 4) Workflow linkage: completing current step activates next task
    _, workflow, _ = http_request(
        "POST",
        "/api/workflows",
        payload={
            "name": f"{marker}-workflow",
            "trigger_description": "smoke trigger",
            "category": "smoke",
            "total_duration": "2d",
            "steps": [
                {
                    "order": 1,
                    "name": "Step 1",
                    "timing": "T+0",
                    "timing_offset_days": 0,
                    "estimated_time": "30m",
                    "quadrant": "Q1",
                    "memo": "step1",
                },
                {
                    "order": 2,
                    "name": "Step 2",
                    "timing": "T+1",
                    "timing_offset_days": 1,
                    "estimated_time": "30m",
                    "quadrant": "Q2",
                    "memo": "step2",
                },
            ],
            "documents": [],
            "warnings": [{"content": "smoke warning", "category": "warning"}],
        },
        expected_status=(201,),
    )
    created["workflow_id"] = int(workflow["id"])

    _, instance, _ = http_request(
        "POST",
        f"/api/workflows/{created['workflow_id']}/instantiate",
        payload={"name": f"{marker}-instance", "trigger_date": today.isoformat(), "memo": "smoke"},
    )
    created["workflow_instance_id"] = int(instance["id"])
    step_instances = sorted(
        instance.get("step_instances", []),
        key=lambda si: si.get("calculated_date", ""),
    )
    expect(len(step_instances) >= 2, "workflow instantiate did not create enough step instances")

    first_step = step_instances[0]
    second_step = step_instances[1]
    http_request(
        "PATCH",
        f"/api/workflow-instances/{created['workflow_instance_id']}/steps/{first_step['id']}/complete",
        payload={"actual_time": "30m", "notes": "smoke complete"},
    )
    _, instance_after_complete, _ = http_request(
        "GET", f"/api/workflow-instances/{created['workflow_instance_id']}"
    )
    next_step = None
    for si in instance_after_complete.get("step_instances", []):
        if si.get("id") == second_step.get("id"):
            next_step = si
            break
    expect(next_step is not None, "could not find second step after completion")
    expect(
        next_step.get("status") == "in_progress",
        "next workflow step was not activated to in_progress",
    )
    if next_step.get("task_id") is not None:
        _, next_task, _ = http_request("GET", f"/api/tasks/{next_step['task_id']}")
        expect(next_task.get("status") == "in_progress", "next step task was not activated")
    print("[PASS] workflow step completion -> next task activation")

    # 5) Error response shape check
    _, missing_fund, _ = http_request(
        "GET", "/api/funds/999999999", expected_status=(404,)
    )
    expect(
        isinstance(missing_fund, dict) and "detail" in missing_fund,
        "404 error response does not include detail",
    )
    print("[PASS] error response shape (detail)")

    # Cleanup via API for regular entities.
    if created["worklog_id"] is not None:
        http_request("DELETE", f"/api/worklogs/{created['worklog_id']}", expected_status=(204, 404))
        created["worklog_id"] = None
    if created["checklist_item_id"] is not None and created["checklist_id"] is not None:
        http_request(
            "DELETE",
            f"/api/checklists/{created['checklist_id']}/items/{created['checklist_item_id']}",
            expected_status=(204, 404),
        )
        created["checklist_item_id"] = None
    if created["checklist_id"] is not None:
        http_request("DELETE", f"/api/checklists/{created['checklist_id']}", expected_status=(204, 404))
        created["checklist_id"] = None
    if created["document_id"] is not None and created["investment_id"] is not None:
        http_request(
            "DELETE",
            f"/api/investments/{created['investment_id']}/documents/{created['document_id']}",
            expected_status=(204, 404),
        )
        created["document_id"] = None
    if created["investment_id"] is not None:
        http_request("DELETE", f"/api/investments/{created['investment_id']}", expected_status=(204, 404))
        created["investment_id"] = None
    if created["company_id"] is not None:
        http_request("DELETE", f"/api/companies/{created['company_id']}", expected_status=(204, 404, 409))
        created["company_id"] = None
    if created["lp_id"] is not None and created["fund_id"] is not None:
        http_request(
            "DELETE",
            f"/api/funds/{created['fund_id']}/lps/{created['lp_id']}",
            expected_status=(204, 404),
        )
        created["lp_id"] = None
    if created["fund_id"] is not None:
        http_request("DELETE", f"/api/funds/{created['fund_id']}", expected_status=(204, 404, 409))
        created["fund_id"] = None

    # Cleanup workflow artifacts directly to avoid permanent smoke artifacts.
    cleanup_workflow_artifacts(created["workflow_id"], created["workflow_instance_id"])
    created["workflow_id"] = None
    created["workflow_instance_id"] = None

    print("[PASS] cleanup complete")
    print("[DONE] API smoke test completed")


def main() -> int:
    server = None
    thread = None
    try:
        server, thread = start_server()
        run_smoke()
        return 0
    except Exception as exc:  # noqa: BLE001
        print(f"[FAIL] {exc}")
        return 1
    finally:
        if server is not None and thread is not None:
            stop_server(server, thread)


if __name__ == "__main__":
    raise SystemExit(main())
