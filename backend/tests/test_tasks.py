from datetime import datetime, timedelta


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

    def test_completion_check_blocks_required_workflow_document(self, client):
        template_response = client.post(
            "/api/workflows",
            json={
                "name": "필수서류 검증 템플릿",
                "category": "조합결성",
                "trigger_description": "검증",
                "steps": [
                    {
                        "order": 1,
                        "name": "필수서류 단계",
                        "timing": "D-day",
                        "timing_offset_days": 0,
                        "estimated_time": "30m",
                        "quadrant": "Q1",
                        "step_documents": [
                            {
                                "name": "조합원 명부 (PDF)",
                                "required": True,
                            },
                        ],
                    },
                ],
                "documents": [],
                "warnings": [],
            },
        )
        assert template_response.status_code == 201
        template_id = template_response.json()["id"]

        instance_response = client.post(
            f"/api/workflows/{template_id}/instantiate",
            json={
                "name": "필수서류 검증 인스턴스",
                "trigger_date": "2025-10-24",
            },
        )
        assert instance_response.status_code == 200
        step_task_id = instance_response.json()["step_instances"][0]["task_id"]
        assert step_task_id is not None

        check_response = client.get(f"/api/tasks/{step_task_id}/completion-check")
        assert check_response.status_code == 200
        payload = check_response.json()
        assert payload["can_complete"] is False
        assert "조합원 명부 (PDF)" in payload["missing_documents"]

    def test_completion_check_returns_capital_call_warning(self, client):
        task = _create_task(client, "캐피탈콜 납입 확인")
        update_response = client.put(
            f"/api/tasks/{task['id']}",
            json={
                "title": "캐피탈콜 납입 확인",
                "quadrant": "Q1",
                "category": "투자실행",
            },
        )
        assert update_response.status_code == 200

        check_response = client.get(f"/api/tasks/{task['id']}/completion-check")
        assert check_response.status_code == 200
        payload = check_response.json()
        assert payload["can_complete"] is True
        assert len(payload["warnings"]) >= 1

    def test_bulk_complete_tasks(self, client):
        first = _create_task(client, "일괄 완료 1")
        second = _create_task(client, "일괄 완료 2")

        response = client.post(
            "/api/tasks/bulk-complete",
            json={
                "task_ids": [first["id"], second["id"]],
                "actual_time": "30m",
                "auto_worklog": True,
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["completed_count"] == 2
        assert payload["skipped_count"] == 0

        first_detail = client.get(f"/api/tasks/{first['id']}")
        second_detail = client.get(f"/api/tasks/{second['id']}")
        assert first_detail.status_code == 200
        assert second_detail.status_code == 200
        assert first_detail.json()["status"] == "completed"
        assert second_detail.json()["status"] == "completed"

    def test_bulk_delete_tasks(self, client):
        first = _create_task(client, "일괄 삭제 1")
        second = _create_task(client, "일괄 삭제 2")

        response = client.post(
            "/api/tasks/bulk-delete",
            json={"task_ids": [first["id"], second["id"]]},
        )
        assert response.status_code == 200
        assert response.json()["deleted_count"] == 2

        first_detail = client.get(f"/api/tasks/{first['id']}")
        second_detail = client.get(f"/api/tasks/{second['id']}")
        assert first_detail.status_code == 404
        assert second_detail.status_code == 404


class TestTaskBoardAndReminders:
    def test_task_board(self, client):
        task = _create_task(client, "보드 확인 업무")
        board_response = client.get("/api/tasks/board")
        assert board_response.status_code == 200
        board = board_response.json()
        assert "summary" in board
        assert isinstance(board["summary"].get("overdue_count"), int)
        assert isinstance(board["summary"].get("work_score"), int)
        assert "Q1" in board
        matched = next((row for row in board["Q1"] if row["id"] == task["id"]), None)
        assert matched is not None
        assert "stale_days" in matched
        assert "workflow_name" in matched

    def test_task_board_pending_includes_in_progress(self, client):
        pending_task = _create_task(client, "보드 대기 업무")
        in_progress_task = _create_task(client, "보드 진행 업무")

        update_response = client.put(
            f"/api/tasks/{in_progress_task['id']}",
            json={"status": "in_progress"},
        )
        assert update_response.status_code == 200
        assert update_response.json()["status"] == "in_progress"

        board_response = client.get("/api/tasks/board")
        assert board_response.status_code == 200
        board = board_response.json()
        visible_rows = [*board["Q1"], *board["Q2"], *board["Q3"], *board["Q4"]]
        visible_ids = {row["id"] for row in visible_rows}

        assert pending_task["id"] in visible_ids
        assert in_progress_task["id"] in visible_ids
        in_progress_row = next((row for row in visible_rows if row["id"] == in_progress_task["id"]), None)
        assert in_progress_row is not None
        assert in_progress_row["status"] == "in_progress"

    def test_task_board_summary_counts_workflow_as_single_unit(self, client):
        template_response = client.post(
            "/api/workflows",
            json={
                "name": "집계 단위 테스트 템플릿",
                "category": "조합결성",
                "trigger_description": "집계 검증",
                "steps": [
                    {
                        "order": 1,
                        "name": "현재 단계(5일 후)",
                        "timing": "D-day",
                        "timing_offset_days": 5,
                        "estimated_time": "30m",
                        "quadrant": "Q1",
                    },
                    {
                        "order": 2,
                        "name": "후속 단계(오늘)",
                        "timing": "D-day",
                        "timing_offset_days": 0,
                        "estimated_time": "30m",
                        "quadrant": "Q1",
                    },
                    {
                        "order": 3,
                        "name": "후속 단계(1일 후)",
                        "timing": "D-day",
                        "timing_offset_days": 1,
                        "estimated_time": "30m",
                        "quadrant": "Q1",
                    },
                ],
                "documents": [],
                "warnings": [],
            },
        )
        assert template_response.status_code == 201
        template_id = template_response.json()["id"]

        today = datetime.now().date().isoformat()
        instantiate_response = client.post(
            f"/api/workflows/{template_id}/instantiate",
            json={
                "name": "집계 단위 테스트 인스턴스",
                "trigger_date": today,
            },
        )
        assert instantiate_response.status_code == 200

        standalone_response = client.post(
            "/api/tasks",
            json={
                "title": "단독 업무(원거리 기한)",
                "quadrant": "Q1",
                "estimated_time": "30m",
                "category": "fund_mgmt",
                "deadline": (datetime.now() + timedelta(days=15)).replace(microsecond=0).isoformat(),
            },
        )
        assert standalone_response.status_code == 201

        board_response = client.get("/api/tasks/board")
        assert board_response.status_code == 200
        summary = board_response.json()["summary"]

        # 워크플로우(3단계)는 1건으로, 단독 업무 1건과 합쳐 총 2건
        assert summary["total_pending_count"] == 2
        # 현재 단계(order=1, +5일) 기준으로 this_week만 1건 반영
        assert summary["today_count"] == 0
        assert summary["this_week_count"] == 1
        assert summary["overdue_count"] == 0

    def test_task_board_progress_is_100_when_no_due_by_today_scope(self, client):
        create_response = client.post(
            "/api/tasks",
            json={
                "title": "future-scope-only",
                "quadrant": "Q1",
                "estimated_time": "30m",
                "category": "fund_mgmt",
                "deadline": (datetime.now() + timedelta(days=3)).replace(microsecond=0).isoformat(),
            },
        )
        assert create_response.status_code == 201

        board_response = client.get("/api/tasks/board")
        assert board_response.status_code == 200
        summary = board_response.json()["summary"]
        assert summary["progress_count_pct"] == 100
        assert summary["progress_time_pct"] == 100

    def test_task_board_progress_uses_due_by_today_scope(self, client):
        overdue_response = client.post(
            "/api/tasks",
            json={
                "title": "overdue-pending",
                "quadrant": "Q1",
                "estimated_time": "30m",
                "category": "fund_mgmt",
                "deadline": (datetime.now() - timedelta(days=1)).replace(microsecond=0).isoformat(),
            },
        )
        assert overdue_response.status_code == 201

        due_today_response = client.post(
            "/api/tasks",
            json={
                "title": "due-today-completed",
                "quadrant": "Q1",
                "estimated_time": "30m",
                "category": "fund_mgmt",
                "deadline": datetime.now().replace(microsecond=0).isoformat(),
            },
        )
        assert due_today_response.status_code == 201

        complete_today_response = client.patch(
            f"/api/tasks/{due_today_response.json()['id']}/complete",
            json={"actual_time": "30m", "auto_worklog": False},
        )
        assert complete_today_response.status_code == 200

        board_response = client.get("/api/tasks/board")
        assert board_response.status_code == 200
        summary = board_response.json()["summary"]

        assert summary["progress_count_pct"] == 50
        assert summary["progress_time_pct"] == 50

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
