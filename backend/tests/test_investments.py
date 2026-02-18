def _create_company(client, name: str = "신규회사") -> dict:
    response = client.post(
        "/api/companies",
        json={"name": name, "industry": "소프트웨어"},
    )
    assert response.status_code == 201
    return response.json()


class TestCompanyCRUD:
    def test_company_crud(self, client):
        create_response = client.post(
            "/api/companies",
            json={"name": "포트폴리오A", "industry": "바이오"},
        )
        assert create_response.status_code == 201
        company = create_response.json()
        company_id = company["id"]

        list_response = client.get("/api/companies")
        assert list_response.status_code == 200
        assert any(row["id"] == company_id for row in list_response.json())

        update_response = client.put(
            f"/api/companies/{company_id}",
            json={"industry": "핀테크"},
        )
        assert update_response.status_code == 200
        assert update_response.json()["industry"] == "핀테크"

        delete_response = client.delete(f"/api/companies/{company_id}")
        assert delete_response.status_code == 204

    def test_create_company_validation_error(self, client):
        response = client.post("/api/companies", json={"industry": "바이오"})
        assert response.status_code == 422

    def test_update_nonexistent_company(self, client):
        response = client.put("/api/companies/99999", json={"name": "없음"})
        assert response.status_code == 404


class TestInvestmentCRUD:
    def test_investment_crud(self, client, sample_fund, sample_company):
        create_response = client.post(
            "/api/investments",
            json={
                "fund_id": sample_fund["id"],
                "company_id": sample_company["id"],
                "investment_date": "2025-06-15",
                "amount": 1_000_000_000,
                "instrument": "보통주",
                "status": "active",
            },
        )
        assert create_response.status_code == 201
        investment = create_response.json()
        investment_id = investment["id"]

        list_response = client.get("/api/investments", params={"fund_id": sample_fund["id"]})
        assert list_response.status_code == 200
        assert any(row["id"] == investment_id for row in list_response.json())

        get_response = client.get(f"/api/investments/{investment_id}")
        assert get_response.status_code == 200
        assert get_response.json()["company_id"] == sample_company["id"]

        update_response = client.put(
            f"/api/investments/{investment_id}",
            json={"amount": 1_200_000_000, "status": "planned"},
        )
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["amount"] == 1_200_000_000
        assert updated["status"] == "planned"

        delete_response = client.delete(f"/api/investments/{investment_id}")
        assert delete_response.status_code == 204

        get_deleted = client.get(f"/api/investments/{investment_id}")
        assert get_deleted.status_code == 404

    def test_create_investment_validation_error(self, client):
        response = client.post("/api/investments", json={"fund_id": 1})
        assert response.status_code == 422


class TestInvestmentDocuments:
    def test_investment_document_crud(self, client, sample_investment):
        investment_id = sample_investment["id"]

        create_response = client.post(
            f"/api/investments/{investment_id}/documents",
            json={
                "name": "투자계약서",
                "doc_type": "계약",
                "status": "pending",
            },
        )
        assert create_response.status_code == 201
        document = create_response.json()
        document_id = document["id"]

        list_response = client.get(f"/api/investments/{investment_id}/documents")
        assert list_response.status_code == 200
        assert any(row["id"] == document_id for row in list_response.json())

        update_response = client.put(
            f"/api/investments/{investment_id}/documents/{document_id}",
            json={"status": "collected", "note": "수령 완료"},
        )
        assert update_response.status_code == 200
        assert update_response.json()["status"] == "collected"

        delete_response = client.delete(
            f"/api/investments/{investment_id}/documents/{document_id}"
        )
        assert delete_response.status_code == 204

    def test_delete_company_with_investment_conflict(self, client, sample_investment):
        response = client.delete(f"/api/companies/{sample_investment['company_id']}")
        assert response.status_code == 409
