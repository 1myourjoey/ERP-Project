class TestSearch:
    def test_search_returns_entities(self, client, sample_fund, sample_task):
        response = client.get("/api/search", params={"q": "테스트"})
        assert response.status_code == 200
        results = response.json()
        types = {row.get("type") for row in results}
        assert "fund" in types
        assert "task" in types

    def test_search_empty_keyword_returns_empty(self, client):
        response = client.get("/api/search", params={"q": "   "})
        assert response.status_code == 200
        assert response.json() == []

    def test_search_finds_workflow(self, client):
        template_response = client.post(
            "/api/workflows",
            json={
                "name": "검색용 템플릿",
                "steps": [
                    {
                        "order": 1,
                        "name": "검색 단계",
                        "timing": "D-day",
                        "timing_offset_days": 0,
                    }
                ],
            },
        )
        assert template_response.status_code == 201
        template_id = template_response.json()["id"]

        instance_response = client.post(
            f"/api/workflows/{template_id}/instantiate",
            json={
                "name": "검색용 인스턴스",
                "trigger_date": "2025-10-24",
            },
        )
        assert instance_response.status_code == 200

        search_response = client.get("/api/search", params={"q": "검색용 인스턴스"})
        assert search_response.status_code == 200
        assert any(row.get("type") == "workflow" for row in search_response.json())
