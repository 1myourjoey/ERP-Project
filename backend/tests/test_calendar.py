class TestCalendarEvents:
    def test_calendar_event_crud(self, client):
        create_response = client.post(
            "/api/calendar-events",
            json={
                "title": "캘린더 테스트 이벤트",
                "date": "2025-10-24",
                "time": "10:30:00",
                "duration": 60,
                "description": "테스트 일정",
                "status": "pending",
            },
        )
        assert create_response.status_code == 201
        event = create_response.json()
        event_id = event["id"]

        list_response = client.get("/api/calendar-events")
        assert list_response.status_code == 200
        assert any(row["id"] == event_id for row in list_response.json())

        get_response = client.get(f"/api/calendar-events/{event_id}")
        assert get_response.status_code == 200
        assert get_response.json()["title"] == "캘린더 테스트 이벤트"

        update_response = client.put(
            f"/api/calendar-events/{event_id}",
            json={"status": "completed", "title": "수정된 이벤트"},
        )
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["status"] == "completed"
        assert updated["title"] == "수정된 이벤트"

        delete_response = client.delete(f"/api/calendar-events/{event_id}")
        assert delete_response.status_code == 204

        get_deleted = client.get(f"/api/calendar-events/{event_id}")
        assert get_deleted.status_code == 404

    def test_calendar_include_tasks(self, client):
        create_task = client.post(
            "/api/tasks",
            json={
                "title": "캘린더 연동 업무",
                "quadrant": "Q1",
                "estimated_time": "45m",
                "deadline": "2025-10-25T11:00:00",
            },
        )
        assert create_task.status_code == 201
        task = create_task.json()

        response = client.get(
            "/api/calendar-events",
            params={
                "year": 2025,
                "month": 10,
                "include_tasks": True,
            },
        )
        assert response.status_code == 200
        rows = response.json()
        assert any(row.get("task_id") == task["id"] for row in rows)

    def test_calendar_event_validation_error(self, client):
        response = client.post(
            "/api/calendar-events",
            json={"date": "2025-10-24"},
        )
        assert response.status_code == 422
