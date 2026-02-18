class TestExitCommitteeAndTrade:
    def test_exit_committee_and_trade_crud(self, client, sample_investment):
        company_id = sample_investment["company_id"]
        fund_id = sample_investment["fund_id"]
        investment_id = sample_investment["id"]

        committee_create = client.post(
            "/api/exit-committees",
            json={
                "company_id": company_id,
                "meeting_date": "2025-11-10",
                "status": "scheduled",
                "agenda": "회수 전략 논의",
            },
        )
        assert committee_create.status_code == 201
        committee = committee_create.json()
        committee_id = committee["id"]

        committee_list = client.get("/api/exit-committees", params={"company_id": company_id})
        assert committee_list.status_code == 200
        assert any(row["id"] == committee_id for row in committee_list.json())

        committee_update = client.put(
            f"/api/exit-committees/{committee_id}",
            json={"status": "completed", "vote_result": "승인"},
        )
        assert committee_update.status_code == 200
        assert committee_update.json()["status"] == "completed"

        committee_fund_create = client.post(
            f"/api/exit-committees/{committee_id}/funds",
            json={"fund_id": fund_id, "investment_id": investment_id},
        )
        assert committee_fund_create.status_code == 201
        committee_fund_id = committee_fund_create.json()["id"]

        committee_fund_update = client.put(
            f"/api/exit-committees/{committee_id}/funds/{committee_fund_id}",
            json={"fund_id": fund_id, "investment_id": investment_id},
        )
        assert committee_fund_update.status_code == 200

        trade_create = client.post(
            "/api/exit-trades",
            json={
                "exit_committee_id": committee_id,
                "investment_id": investment_id,
                "fund_id": fund_id,
                "company_id": company_id,
                "exit_type": "M&A",
                "trade_date": "2025-12-31",
                "amount": 1_500_000_000,
                "fees": 50_000_000,
                "realized_gain": 300_000_000,
            },
        )
        assert trade_create.status_code == 201
        trade = trade_create.json()
        trade_id = trade["id"]
        assert trade["net_amount"] == 1_450_000_000

        trade_list = client.get("/api/exit-trades", params={"fund_id": fund_id})
        assert trade_list.status_code == 200
        assert any(row["id"] == trade_id for row in trade_list.json())

        trade_update = client.put(
            f"/api/exit-trades/{trade_id}",
            json={"fees": 70_000_000, "amount": 1_600_000_000},
        )
        assert trade_update.status_code == 200
        assert trade_update.json()["net_amount"] == 1_530_000_000

        tx_list = client.get("/api/transactions", params={"type": "exit"})
        assert tx_list.status_code == 200
        assert any(tx["investment_id"] == investment_id for tx in tx_list.json())

        trade_delete = client.delete(f"/api/exit-trades/{trade_id}")
        assert trade_delete.status_code == 204

        get_deleted_trade = client.get(f"/api/exit-trades/{trade_id}")
        assert get_deleted_trade.status_code == 404

        committee_fund_delete = client.delete(
            f"/api/exit-committees/{committee_id}/funds/{committee_fund_id}"
        )
        assert committee_fund_delete.status_code == 204

        committee_delete = client.delete(f"/api/exit-committees/{committee_id}")
        assert committee_delete.status_code == 204

    def test_exit_committee_validation_error(self, client):
        response = client.post(
            "/api/exit-committees",
            json={"company_id": 1},
        )
        assert response.status_code == 422

    def test_exit_trade_not_found(self, client):
        response = client.get("/api/exit-trades/99999")
        assert response.status_code == 404
