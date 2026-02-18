class TestChecklists:
    def test_checklist_and_items_crud(self, client, sample_investment):
        create_response = client.post(
            "/api/checklists",
            json={
                "name": "투자 후 관리 체크리스트",
                "category": "사후관리",
                "investment_id": sample_investment["id"],
                "items": [
                    {"order": 1, "name": "월간 리포트 수령", "required": True},
                    {"order": 2, "name": "재무제표 검토", "required": True},
                ],
            },
        )
        assert create_response.status_code == 201
        checklist = create_response.json()
        checklist_id = checklist["id"]
        assert len(checklist["items"]) == 2

        list_response = client.get(
            "/api/checklists",
            params={"investment_id": sample_investment["id"]},
        )
        assert list_response.status_code == 200
        assert any(row["id"] == checklist_id for row in list_response.json())

        get_response = client.get(f"/api/checklists/{checklist_id}")
        assert get_response.status_code == 200
        assert get_response.json()["name"] == "투자 후 관리 체크리스트"

        update_response = client.put(
            f"/api/checklists/{checklist_id}",
            json={"name": "투자 사후관리 체크리스트(수정)"},
        )
        assert update_response.status_code == 200
        assert update_response.json()["name"] == "투자 사후관리 체크리스트(수정)"

        item_create = client.post(
            f"/api/checklists/{checklist_id}/items",
            json={
                "order": 3,
                "name": "분기 미팅 진행",
                "required": False,
                "checked": False,
            },
        )
        assert item_create.status_code == 201
        item = item_create.json()
        item_id = item["id"]

        item_update = client.put(
            f"/api/checklists/{checklist_id}/items/{item_id}",
            json={"checked": True, "notes": "완료"},
        )
        assert item_update.status_code == 200
        assert item_update.json()["checked"] is True

        item_delete = client.delete(f"/api/checklists/{checklist_id}/items/{item_id}")
        assert item_delete.status_code == 204

        delete_response = client.delete(f"/api/checklists/{checklist_id}")
        assert delete_response.status_code == 204

        deleted = client.get(f"/api/checklists/{checklist_id}")
        assert deleted.status_code == 404

    def test_checklist_validation_error(self, client):
        response = client.post("/api/checklists", json={"category": "누락"})
        assert response.status_code == 422

    def test_checklist_item_not_found(self, client):
        response = client.put("/api/checklists/1/items/99999", json={"checked": True})
        assert response.status_code == 404
