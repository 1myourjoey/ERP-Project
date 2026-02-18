class TestTransactions:
    def test_transaction_crud_and_filters(self, client, sample_investment):
        create_response = client.post(
            "/api/transactions",
            json={
                "investment_id": sample_investment["id"],
                "fund_id": sample_investment["fund_id"],
                "company_id": sample_investment["company_id"],
                "transaction_date": "2025-06-15",
                "type": "investment",
                "amount": 1_000_000_000,
            },
        )
        assert create_response.status_code == 201
        tx = create_response.json()
        tx_id = tx["id"]
        assert tx["balance_before"] is not None
        assert tx["balance_after"] is not None

        list_response = client.get(
            "/api/transactions",
            params={"investment_id": sample_investment["id"]},
        )
        assert list_response.status_code == 200
        assert any(row["id"] == tx_id for row in list_response.json())

        by_investment = client.get(f"/api/investments/{sample_investment['id']}/transactions")
        assert by_investment.status_code == 200
        assert any(row["id"] == tx_id for row in by_investment.json())

        get_response = client.get(f"/api/transactions/{tx_id}")
        assert get_response.status_code == 200
        assert get_response.json()["id"] == tx_id

        update_response = client.put(
            f"/api/transactions/{tx_id}",
            json={"amount": 1_200_000_000, "type": "follow_on"},
        )
        assert update_response.status_code == 200
        assert update_response.json()["amount"] == 1_200_000_000
        assert update_response.json()["type"] == "follow_on"

        delete_response = client.delete(f"/api/transactions/{tx_id}")
        assert delete_response.status_code == 204

        deleted = client.get(f"/api/transactions/{tx_id}")
        assert deleted.status_code == 404

    def test_transaction_validation_error(self, client):
        response = client.post("/api/transactions", json={"amount": 1000})
        assert response.status_code == 422

    def test_transaction_not_found(self, client):
        response = client.get("/api/transactions/99999")
        assert response.status_code == 404
