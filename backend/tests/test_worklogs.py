class TestWorklogs:
    def test_worklog_crud(self, client):
        categories_response = client.get("/api/worklogs/categories")
        assert categories_response.status_code == 200
        assert isinstance(categories_response.json(), list)

        create_response = client.post(
            "/api/worklogs",
            json={
                "date": "2025-10-24",
                "category": "정기 업무",
                "title": "업무기록 생성",
                "content": "기록 내용",
                "status": "완료",
                "estimated_time": "1h",
                "actual_time": "45m",
                "details": [{"content": "상세 내용 1"}],
                "lessons": [{"content": "회고 1"}],
                "follow_ups": [{"content": "후속작업", "target_date": "2025-10-30"}],
            },
        )
        assert create_response.status_code == 201
        worklog = create_response.json()
        worklog_id = worklog["id"]
        assert len(worklog["details"]) == 1
        assert len(worklog["lessons"]) == 1
        assert len(worklog["follow_ups"]) == 1

        list_response = client.get("/api/worklogs")
        assert list_response.status_code == 200
        assert any(row["id"] == worklog_id for row in list_response.json())

        get_response = client.get(f"/api/worklogs/{worklog_id}")
        assert get_response.status_code == 200
        assert get_response.json()["title"] == "업무기록 생성"

        update_response = client.put(
            f"/api/worklogs/{worklog_id}",
            json={
                "title": "업무기록 수정",
                "status": "진행중",
                "details": [{"content": "수정 상세", "order": 0}],
            },
        )
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["title"] == "업무기록 수정"
        assert updated["status"] == "진행중"
        assert updated["details"][0]["content"] == "수정 상세"

        stats_response = client.get("/api/worklogs/stats")
        assert stats_response.status_code == 200
        stats = stats_response.json()
        assert stats["total"] >= 1

        delete_response = client.delete(f"/api/worklogs/{worklog_id}")
        assert delete_response.status_code == 204

        deleted = client.get(f"/api/worklogs/{worklog_id}")
        assert deleted.status_code == 404

    def test_worklog_validation_error(self, client):
        response = client.post(
            "/api/worklogs",
            json={"title": "누락"},
        )
        assert response.status_code == 422
