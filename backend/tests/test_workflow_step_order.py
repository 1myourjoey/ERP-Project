def _workflow_payload(name: str = "Step Order Workflow") -> dict:
    return {
        "name": name,
        "category": "Fund Operations",
        "trigger_description": "Step order enforcement test",
        "steps": [
            {
                "order": 1,
                "name": "Step 1",
                "timing": "D-1",
                "timing_offset_days": -1,
                "estimated_time": "1h",
                "quadrant": "Q1",
            },
            {
                "order": 2,
                "name": "Step 2",
                "timing": "D-day",
                "timing_offset_days": 0,
                "estimated_time": "1h",
                "quadrant": "Q1",
            },
            {
                "order": 3,
                "name": "Step 3",
                "timing": "D+1",
                "timing_offset_days": 1,
                "estimated_time": "1h",
                "quadrant": "Q1",
            },
        ],
        "documents": [],
        "warnings": [],
    }


def _create_instance(client, fund_id: int) -> dict:
    template_response = client.post("/api/workflows", json=_workflow_payload())
    assert template_response.status_code == 201
    template_id = template_response.json()["id"]

    instantiate_response = client.post(
        f"/api/workflows/{template_id}/instantiate",
        json={
            "name": "Order Check Instance",
            "trigger_date": "2025-10-24",
            "fund_id": fund_id,
        },
    )
    assert instantiate_response.status_code == 200
    return instantiate_response.json()


def test_complete_step_requires_previous_completion(client, sample_fund):
    instance = _create_instance(client, sample_fund["id"])
    instance_id = instance["id"]
    steps = instance["step_instances"]
    assert len(steps) == 3

    second_step_id = steps[1]["id"]
    out_of_order_response = client.patch(
        f"/api/workflow-instances/{instance_id}/steps/{second_step_id}/complete",
        json={"actual_time": "30m"},
    )
    assert out_of_order_response.status_code == 400
    detail = out_of_order_response.json().get("detail")
    assert isinstance(detail, str)
    assert detail

    first_step_id = steps[0]["id"]
    first_complete_response = client.patch(
        f"/api/workflow-instances/{instance_id}/steps/{first_step_id}/complete",
        json={"actual_time": "30m"},
    )
    assert first_complete_response.status_code == 200

    second_complete_response = client.patch(
        f"/api/workflow-instances/{instance_id}/steps/{second_step_id}/complete",
        json={"actual_time": "30m"},
    )
    assert second_complete_response.status_code == 200
