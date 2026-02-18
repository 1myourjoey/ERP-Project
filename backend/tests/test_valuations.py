class TestValuations:
    def test_valuation_crud_and_filters(self, client, sample_investment):
        create_response = client.post(
            "/api/valuations",
            json={
                "investment_id": sample_investment["id"],
                "fund_id": sample_investment["fund_id"],
                "company_id": sample_investment["company_id"],
                "as_of_date": "2025-12-31",
                "method": "상대가치법",
                "value": 1_500_000_000,
            },
        )
        assert create_response.status_code == 201
        valuation = create_response.json()
        valuation_id = valuation["id"]
        assert valuation["value"] == 1_500_000_000

        list_response = client.get(
            "/api/valuations",
            params={"investment_id": sample_investment["id"]},
        )
        assert list_response.status_code == 200
        assert any(row["id"] == valuation_id for row in list_response.json())

        by_investment = client.get(f"/api/investments/{sample_investment['id']}/valuations")
        assert by_investment.status_code == 200
        assert any(row["id"] == valuation_id for row in by_investment.json())

        get_response = client.get(f"/api/valuations/{valuation_id}")
        assert get_response.status_code == 200
        assert get_response.json()["id"] == valuation_id

        update_response = client.put(
            f"/api/valuations/{valuation_id}",
            json={"value": 1_700_000_000, "method": "DCF"},
        )
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["value"] == 1_700_000_000
        assert updated["method"] == "DCF"

        delete_response = client.delete(f"/api/valuations/{valuation_id}")
        assert delete_response.status_code == 204

        deleted = client.get(f"/api/valuations/{valuation_id}")
        assert deleted.status_code == 404

    def test_valuation_validation_error(self, client):
        response = client.post("/api/valuations", json={"value": 1000})
        assert response.status_code == 422

    def test_valuation_not_found(self, client):
        response = client.get("/api/valuations/99999")
        assert response.status_code == 404
