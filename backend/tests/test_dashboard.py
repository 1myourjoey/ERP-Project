from datetime import date, timedelta


def _create_notice_workflow_template(client) -> int:
    response = client.post(
        "/api/workflows",
        json={
            "name": "공지 테스트 워크플로우",
            "category": "조합결성",
            "steps": [
                {
                    "order": 1,
                    "name": "assembly notice",
                    "timing": "assembly",
                    "timing_offset_days": 0,
                    "estimated_time": "1h",
                    "quadrant": "Q1",
                }
            ],
            "documents": [],
            "warnings": [],
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


class TestDashboard:
    def test_today_dashboard_structure(self, client):
        response = client.get("/api/dashboard/today")
        assert response.status_code == 200
        payload = response.json()
        assert "date" in payload
        assert "today" in payload
        assert "tomorrow" in payload
        assert "this_week" in payload
        assert "active_workflows" in payload
        assert "fund_summary" in payload

    def test_dashboard_completed_counts(self, client, sample_task):
        complete_response = client.patch(
            f"/api/tasks/{sample_task['id']}/complete",
            json={"actual_time": "20m", "auto_worklog": False},
        )
        assert complete_response.status_code == 200

        dashboard = client.get("/api/dashboard/today")
        assert dashboard.status_code == 200
        data = dashboard.json()
        assert data["completed_today_count"] >= 1

    def test_split_dashboard_endpoints(self, client):
        base = client.get("/api/dashboard/base")
        assert base.status_code == 200
        base_payload = base.json()
        assert "date" in base_payload
        assert "today" in base_payload
        assert "no_deadline" in base_payload

        workflows = client.get("/api/dashboard/workflows")
        assert workflows.status_code == 200
        assert "active_workflows" in workflows.json()

        sidebar = client.get("/api/dashboard/sidebar")
        assert sidebar.status_code == 200
        sidebar_payload = sidebar.json()
        assert "fund_summary" in sidebar_payload
        assert "missing_documents" in sidebar_payload
        assert "upcoming_reports" in sidebar_payload

        completed = client.get("/api/dashboard/completed")
        assert completed.status_code == 200
        completed_payload = completed.json()
        assert "completed_today" in completed_payload
        assert "completed_today_count" in completed_payload

    def test_upcoming_notices(self, client, sample_fund):
        notice_response = client.put(
            f"/api/funds/{sample_fund['id']}/notice-periods",
            json=[
                {
                    "notice_type": "assembly",
                    "label": "총회 소집 통지",
                    "business_days": 7,
                }
            ],
        )
        assert notice_response.status_code == 200

        workflow_id = _create_notice_workflow_template(client)
        trigger_date = (date.today() + timedelta(days=20)).isoformat()
        instantiate_response = client.post(
            f"/api/workflows/{workflow_id}/instantiate",
            json={
                "name": "공지연동 인스턴스",
                "trigger_date": trigger_date,
                "fund_id": sample_fund["id"],
            },
        )
        assert instantiate_response.status_code == 200

        upcoming = client.get("/api/dashboard/upcoming-notices", params={"days": 30})
        assert upcoming.status_code == 200
        rows = upcoming.json()
        assert any(row["fund_name"] == sample_fund["name"] for row in rows)
