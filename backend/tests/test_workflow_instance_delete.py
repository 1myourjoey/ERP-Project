from datetime import date

from models.phase3 import CapitalCall
from models.task import Task
from models.workflow_instance import WorkflowInstance, WorkflowStepInstance


def _workflow_payload(name: str = "Delete Test Workflow") -> dict:
    return {
        "name": name,
        "category": "Fund Operations",
        "trigger_description": "Delete behavior test",
        "steps": [
            {
                "order": 1,
                "name": "Step A",
                "timing": "D-1",
                "timing_offset_days": -1,
                "estimated_time": "1h",
                "quadrant": "Q1",
            },
            {
                "order": 2,
                "name": "Step B",
                "timing": "D-day",
                "timing_offset_days": 0,
                "estimated_time": "1h",
                "quadrant": "Q1",
            },
        ],
        "documents": [],
        "warnings": [],
    }


def _create_active_instance(client, fund_id: int) -> tuple[int, list[dict]]:
    template_response = client.post("/api/workflows", json=_workflow_payload())
    assert template_response.status_code == 201
    template_id = template_response.json()["id"]

    instantiate_response = client.post(
        f"/api/workflows/{template_id}/instantiate",
        json={
            "name": "Delete Target Instance",
            "trigger_date": "2025-10-24",
            "fund_id": fund_id,
        },
    )
    assert instantiate_response.status_code == 200
    payload = instantiate_response.json()
    return payload["id"], payload["step_instances"]


def test_delete_active_instance_cleans_linked_data(client, db_session, sample_fund):
    instance_id, step_instances = _create_active_instance(client, sample_fund["id"])
    assert len(step_instances) == 2

    first_step_id = step_instances[0]["id"]
    first_task_id = step_instances[0]["task_id"]
    second_task_id = step_instances[1]["task_id"]
    assert first_task_id is not None
    assert second_task_id is not None

    complete_response = client.patch(
        f"/api/workflow-instances/{instance_id}/steps/{first_step_id}/complete",
        json={"actual_time": "30m"},
    )
    assert complete_response.status_code == 200

    capital_call = CapitalCall(
        fund_id=sample_fund["id"],
        linked_workflow_instance_id=instance_id,
        call_date=date(2025, 10, 24),
        call_type="initial",
        total_amount=1_000_000,
    )
    db_session.add(capital_call)
    db_session.commit()
    capital_call_id = capital_call.id

    delete_response = client.delete(f"/api/workflow-instances/{instance_id}")
    assert delete_response.status_code == 204

    assert db_session.get(WorkflowInstance, instance_id) is None
    assert (
        db_session.query(WorkflowStepInstance)
        .filter(WorkflowStepInstance.instance_id == instance_id)
        .count()
        == 0
    )

    completed_task = db_session.get(Task, first_task_id)
    assert completed_task is not None
    assert completed_task.status == "completed"
    assert completed_task.workflow_instance_id is None
    assert completed_task.workflow_step_order is None

    assert db_session.get(Task, second_task_id) is None

    refreshed_call = db_session.get(CapitalCall, capital_call_id)
    assert refreshed_call is not None
    assert refreshed_call.linked_workflow_instance_id is None


def test_delete_completed_instance_rejected(client, sample_fund):
    instance_id, _ = _create_active_instance(client, sample_fund["id"])
    instance_response = client.get(f"/api/workflow-instances/{instance_id}")
    assert instance_response.status_code == 200

    for step in instance_response.json()["step_instances"]:
        response = client.patch(
            f"/api/workflow-instances/{instance_id}/steps/{step['id']}/complete",
            json={"actual_time": "1h"},
        )
        assert response.status_code == 200

    delete_response = client.delete(f"/api/workflow-instances/{instance_id}")
    assert delete_response.status_code == 400
    detail = delete_response.json().get("detail")
    assert isinstance(detail, str)
    assert detail

