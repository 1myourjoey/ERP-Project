from datetime import datetime


def _create_task(client, title: str = "테스트 업무") -> dict:
    response = client.post(
        "/api/tasks",
        json={
            "title": title,
            "quadrant": "Q1",
            "estimated_time": "30m",
            "category": "fund_mgmt",
            "deadline": "2025-10-24T09:00:00",
        },
    )
    assert response.status_code == 201
    return response.json()


class TestTaskCRUD:
    def test_create_task(self, client):
        task = _create_task(client, "생성 테스트 업무")
        assert task["title"] == "생성 테스트 업무"
        assert task["status"] == "pending"
        assert task["quadrant"] == "Q1"

    def test_list_tasks(self, client, sample_task):
        response = client.get("/api/tasks")
        assert response.status_code == 200
        tasks = response.json()
        assert any(task["id"] == sample_task["id"] for task in tasks)

    def test_get_task_detail(self, client, sample_task):
        response = client.get(f"/api/tasks/{sample_task['id']}")
        assert response.status_code == 200
        assert response.json()["id"] == sample_task["id"]

    def test_update_task(self, client, sample_task):
        response = client.put(
            f"/api/tasks/{sample_task['id']}",
            json={
                "title": "수정된 업무",
                "quadrant": "Q2",
                "estimated_time": "1h",
                "deadline": "2025-11-01T10:00:00",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "수정된 업무"
        assert data["quadrant"] == "Q2"

    def test_move_task(self, client, sample_task):
        response = client.patch(
            f"/api/tasks/{sample_task['id']}/move",
            json={"quadrant": "Q3"},
        )
        assert response.status_code == 200
        assert response.json()["quadrant"] == "Q3"

    def test_delete_task(self, client, sample_task):
        response = client.delete(f"/api/tasks/{sample_task['id']}")
        assert response.status_code == 204

        get_response = client.get(f"/api/tasks/{sample_task['id']}")
        assert get_response.status_code == 404

    def test_create_task_validation_error(self, client):
        response = client.post(
            "/api/tasks",
            json={
                "title": "유효성 실패",
                "quadrant": "Q5",
            },
        )
        assert response.status_code == 422


class TestTaskCompletion:
    def test_complete_and_undo_task(self, client, sample_task):
        complete_response = client.patch(
            f"/api/tasks/{sample_task['id']}/complete",
            json={
                "actual_time": "25m",
                "auto_worklog": True,
                "memo": "테스트 완료",
            },
        )
        assert complete_response.status_code == 200
        completed = complete_response.json()
        assert completed["status"] == "completed"
        assert completed["actual_time"] == "25m"
        assert completed["completed_at"] is not None

        worklogs_response = client.get("/api/worklogs")
        assert worklogs_response.status_code == 200
        assert any(
            f"[완료] {sample_task['title']}" == worklog["title"]
            for worklog in worklogs_response.json()
        )

        undo_response = client.patch(f"/api/tasks/{sample_task['id']}/undo-complete")
        assert undo_response.status_code == 200
        undone = undo_response.json()
        assert undone["status"] == "pending"
        assert undone["completed_at"] is None
        assert undone["actual_time"] is None

    def test_undo_non_completed_task_returns_400(self, client, sample_task):
        response = client.patch(f"/api/tasks/{sample_task['id']}/undo-complete")
        assert response.status_code == 400

    def test_complete_nonexistent_task_returns_404(self, client):
        response = client.patch(
            "/api/tasks/99999/complete",
            json={"actual_time": "10m", "auto_worklog": False},
        )
        assert response.status_code == 404


class TestTaskBoardAndReminders:
    def test_task_board(self, client):
        task = _create_task(client, "보드 확인 업무")
        board_response = client.get("/api/tasks/board")
        assert board_response.status_code == 200
        board = board_response.json()
        assert "Q1" in board
        assert any(row["id"] == task["id"] for row in board["Q1"])

    def test_generate_monthly_reminders(self, client):
        now = datetime.now()
        year_month = f"{now.year}-{now.month:02d}"

        first = client.post(
            "/api/tasks/generate-monthly-reminders",
            params={"year_month": year_month},
        )
        assert first.status_code == 200
        first_payload = first.json()
        assert first_payload["year_month"] == year_month

        second = client.post(
            "/api/tasks/generate-monthly-reminders",
            params={"year_month": year_month},
        )
        assert second.status_code == 200
        second_payload = second.json()
        assert len(second_payload["skipped"]) >= 1

    def test_generate_monthly_reminders_invalid_format(self, client):
        response = client.post(
            "/api/tasks/generate-monthly-reminders",
            params={"year_month": "202510"},
        )
        assert response.status_code == 400
