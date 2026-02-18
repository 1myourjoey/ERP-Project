def _workflow_payload(name: str = "결성총회 테스트", category: str = "조합결성") -> dict:
    return {
        "name": name,
        "category": category,
        "trigger_description": "결성 총회 진행",
        "steps": [
            {
                "order": 1,
                "name": "안건 준비",
                "timing": "D-14",
                "timing_offset_days": -14,
                "estimated_time": "2h",
                "quadrant": "Q1",
            },
            {
                "order": 2,
                "name": "소집통지서 발송",
                "timing": "D-7",
                "timing_offset_days": -7,
                "estimated_time": "1h",
                "quadrant": "Q1",
            },
            {
                "order": 3,
                "name": "결성총회 개최",
                "timing": "D-day",
                "timing_offset_days": 0,
                "estimated_time": "3h",
                "quadrant": "Q1",
            },
        ],
        "documents": [
            {"name": "출자이행 공문", "required": True, "timing": "D-7"},
        ],
        "warnings": [
            {"content": "출자 이행 일정을 사전 확인", "category": "warning"},
        ],
    }


class TestWorkflowTemplateCRUD:
    def test_template_crud(self, client):
        create_response = client.post("/api/workflows", json=_workflow_payload())
        assert create_response.status_code == 201
        template = create_response.json()
        template_id = template["id"]

        list_response = client.get("/api/workflows")
        assert list_response.status_code == 200
        assert any(row["id"] == template_id for row in list_response.json())

        get_response = client.get(f"/api/workflows/{template_id}")
        assert get_response.status_code == 200
        assert get_response.json()["name"] == "결성총회 테스트"

        update_payload = _workflow_payload(name="결성총회 테스트(수정)")
        update_response = client.put(f"/api/workflows/{template_id}", json=update_payload)
        assert update_response.status_code == 200
        assert update_response.json()["name"] == "결성총회 테스트(수정)"

        delete_response = client.delete(f"/api/workflows/{template_id}")
        assert delete_response.status_code == 200
        assert delete_response.json()["ok"] is True

    def test_create_workflow_validation_error(self, client):
        response = client.post(
            "/api/workflows",
            json={
                "name": "유효성 실패",
                "steps": [{"name": "누락"}],
            },
        )
        assert response.status_code == 422

    def test_get_nonexistent_workflow(self, client):
        response = client.get("/api/workflows/99999")
        assert response.status_code == 404


class TestWorkflowLifecycle:
    def test_full_workflow_lifecycle(self, client):
        template_response = client.post("/api/workflows", json=_workflow_payload())
        assert template_response.status_code == 201
        template_id = template_response.json()["id"]

        fund_response = client.post(
            "/api/funds",
            json={
                "name": "워크플로우 연동 조합",
                "type": "벤처투자조합",
                "status": "forming",
                "gp": "테스트GP",
                "formation_date": "2025-10-24",
            },
        )
        assert fund_response.status_code == 201
        fund_id = fund_response.json()["id"]

        instantiate_response = client.post(
            f"/api/workflows/{template_id}/instantiate",
            json={
                "name": "워크플로우 인스턴스",
                "trigger_date": "2025-10-24",
                "fund_id": fund_id,
            },
        )
        assert instantiate_response.status_code == 200
        instance = instantiate_response.json()
        instance_id = instance["id"]
        step_instances = instance["step_instances"]
        assert len(step_instances) == 3

        first_step_id = step_instances[0]["id"]
        complete_first = client.patch(
            f"/api/workflow-instances/{instance_id}/steps/{first_step_id}/complete",
            json={"actual_time": "1h 30m", "notes": "진행 완료"},
        )
        assert complete_first.status_code == 200

        undo_first = client.put(
            f"/api/workflow-instances/{instance_id}/steps/{first_step_id}/undo"
        )
        assert undo_first.status_code == 200
        undone_step = next(
            row for row in undo_first.json()["step_instances"] if row["id"] == first_step_id
        )
        assert undone_step["status"] == "pending"
        assert undo_first.json()["status"] == "active"

        latest_instance = client.get(f"/api/workflow-instances/{instance_id}").json()
        for step in latest_instance["step_instances"]:
            response = client.patch(
                f"/api/workflow-instances/{instance_id}/steps/{step['id']}/complete",
                json={"actual_time": "1h"},
            )
            assert response.status_code == 200

        instance_check = client.get(f"/api/workflow-instances/{instance_id}")
        assert instance_check.status_code == 200
        assert instance_check.json()["status"] == "completed"

        fund_check = client.get(f"/api/funds/{fund_id}")
        assert fund_check.status_code == 200
        assert fund_check.json()["status"] == "active"

    def test_delete_workflow_with_instance_conflict(self, client, sample_fund):
        template_response = client.post("/api/workflows", json=_workflow_payload())
        assert template_response.status_code == 201
        template_id = template_response.json()["id"]

        instantiate_response = client.post(
            f"/api/workflows/{template_id}/instantiate",
            json={
                "name": "삭제충돌 테스트",
                "trigger_date": "2025-10-24",
                "fund_id": sample_fund["id"],
            },
        )
        assert instantiate_response.status_code == 200

        delete_response = client.delete(f"/api/workflows/{template_id}")
        assert delete_response.status_code == 409

    def test_cancel_instance(self, client):
        template_response = client.post("/api/workflows", json=_workflow_payload(name="취소 테스트"))
        assert template_response.status_code == 201
        template_id = template_response.json()["id"]

        instantiate_response = client.post(
            f"/api/workflows/{template_id}/instantiate",
            json={
                "name": "취소 대상",
                "trigger_date": "2025-10-24",
            },
        )
        assert instantiate_response.status_code == 200
        instance_id = instantiate_response.json()["id"]

        cancel_response = client.patch(f"/api/workflow-instances/{instance_id}/cancel")
        assert cancel_response.status_code == 200
        assert cancel_response.json()["status"] == "cancelled"
