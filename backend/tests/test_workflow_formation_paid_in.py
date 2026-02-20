def _formation_workflow_payload() -> dict:
    return {
        "name": "Formation Payment Workflow",
        "category": "Formation",
        "trigger_description": "Formation paid-in sync",
        "steps": [
            {
                "order": 1,
                "name": "Prep",
                "timing": "D-1",
                "timing_offset_days": -1,
                "estimated_time": "1h",
                "quadrant": "Q1",
            },
            {
                "order": 2,
                "name": "Payment Check",
                "timing": "D-day",
                "timing_offset_days": 0,
                "estimated_time": "1h",
                "quadrant": "Q1",
            },
            {
                "order": 3,
                "name": "Close",
                "timing": "D+1",
                "timing_offset_days": 1,
                "estimated_time": "1h",
                "quadrant": "Q2",
            },
        ],
        "documents": [],
        "warnings": [],
    }


def _create_fund(client, *, name: str, commitment_total: int) -> dict:
    response = client.post(
        "/api/funds",
        json={
            "name": name,
            "type": "벤처투자조합",
            "status": "forming",
            "formation_date": "2025-10-24",
            "commitment_total": commitment_total,
        },
    )
    assert response.status_code == 201
    return response.json()


def _create_lp(client, fund_id: int, *, name: str, commitment: int) -> dict:
    response = client.post(
        f"/api/funds/{fund_id}/lps",
        json={
            "name": name,
            "type": "기관투자자",
            "commitment": commitment,
            "paid_in": 0,
        },
    )
    assert response.status_code == 201
    return response.json()


def _create_instance(client, fund_id: int) -> dict:
    workflow_response = client.post("/api/workflows", json=_formation_workflow_payload())
    assert workflow_response.status_code == 201
    workflow_id = workflow_response.json()["id"]

    instance_response = client.post(
        f"/api/workflows/{workflow_id}/instantiate",
        json={
            "name": "Formation Instance",
            "trigger_date": "2025-10-24",
            "fund_id": fund_id,
        },
    )
    assert instance_response.status_code == 200
    return instance_response.json()


def _list_lps(client, fund_id: int) -> list[dict]:
    response = client.get(f"/api/funds/{fund_id}/lps")
    assert response.status_code == 200
    return response.json()


def _lp_paid_in_map(rows: list[dict]) -> dict[int, int]:
    return {
        int(row["id"]): int(row.get("paid_in") or 0)
        for row in rows
    }


def test_formation_payment_step_applies_paid_in_and_undo_restores(client):
    fund = _create_fund(client, name="Formation Sync Fund", commitment_total=300)
    lp1 = _create_lp(client, fund["id"], name="LP-A", commitment=200)
    lp2 = _create_lp(client, fund["id"], name="LP-B", commitment=100)
    instance = _create_instance(client, fund["id"])
    steps = instance["step_instances"]
    assert len(steps) == 3

    first_step_id = steps[0]["id"]
    payment_step_id = steps[1]["id"]

    first_complete = client.patch(
        f"/api/workflow-instances/{instance['id']}/steps/{first_step_id}/complete",
        json={"actual_time": "30m"},
    )
    assert first_complete.status_code == 200

    payment_complete = client.patch(
        f"/api/workflow-instances/{instance['id']}/steps/{payment_step_id}/complete",
        json={
            "actual_time": "30m",
            "lp_paid_in_updates": [
                {"lp_id": lp1["id"], "paid_in": 120},
                {"lp_id": lp2["id"], "paid_in": 80},
            ],
        },
    )
    assert payment_complete.status_code == 200

    paid_map = _lp_paid_in_map(_list_lps(client, fund["id"]))
    assert paid_map[lp1["id"]] == 120
    assert paid_map[lp2["id"]] == 80

    undo_response = client.put(
        f"/api/workflow-instances/{instance['id']}/steps/{payment_step_id}/undo"
    )
    assert undo_response.status_code == 200

    restored_map = _lp_paid_in_map(_list_lps(client, fund["id"]))
    assert restored_map[lp1["id"]] == 0
    assert restored_map[lp2["id"]] == 0


def test_formation_payment_step_rejects_paid_in_over_commitment(client):
    fund = _create_fund(client, name="Formation Validation Fund", commitment_total=200)
    lp = _create_lp(client, fund["id"], name="LP-Limit", commitment=100)
    instance = _create_instance(client, fund["id"])
    steps = instance["step_instances"]
    assert len(steps) == 3

    first_complete = client.patch(
        f"/api/workflow-instances/{instance['id']}/steps/{steps[0]['id']}/complete",
        json={"actual_time": "10m"},
    )
    assert first_complete.status_code == 200

    over_limit = client.patch(
        f"/api/workflow-instances/{instance['id']}/steps/{steps[1]['id']}/complete",
        json={
            "actual_time": "10m",
            "lp_paid_in_updates": [
                {"lp_id": lp["id"], "paid_in": 150},
            ],
        },
    )
    assert over_limit.status_code == 400
    detail = over_limit.json().get("detail")
    assert isinstance(detail, str)
    assert detail
