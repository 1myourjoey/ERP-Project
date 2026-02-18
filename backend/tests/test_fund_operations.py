from datetime import date, timedelta


def _latest_lp_id(client, fund_id: int) -> int:
    response = client.get(f"/api/funds/{fund_id}/lps")
    assert response.status_code == 200
    lps = response.json()
    assert len(lps) > 0
    return lps[0]["id"]


class TestCapitalCalls:
    def test_capital_call_and_items_crud(self, client, sample_fund_with_lps):
        fund_id = sample_fund_with_lps["id"]

        create_response = client.post(
            "/api/capital-calls",
            json={
                "fund_id": fund_id,
                "call_date": "2025-10-24",
                "call_type": "최초출자",
                "total_amount": 1_000_000_000,
                "request_percent": 10,
                "memo": "1차 출자요청",
            },
        )
        assert create_response.status_code == 201
        capital_call = create_response.json()
        call_id = capital_call["id"]
        assert capital_call["request_percent"] == 10

        list_response = client.get("/api/capital-calls", params={"fund_id": fund_id})
        assert list_response.status_code == 200
        assert any(row["id"] == call_id for row in list_response.json())

        get_response = client.get(f"/api/capital-calls/{call_id}")
        assert get_response.status_code == 200

        update_response = client.put(
            f"/api/capital-calls/{call_id}",
            json={"memo": "메모 수정", "total_amount": 1_100_000_000, "request_percent": 11},
        )
        assert update_response.status_code == 200
        assert update_response.json()["total_amount"] == 1_100_000_000
        assert update_response.json()["request_percent"] == 11

        lp_id = _latest_lp_id(client, fund_id)
        item_create = client.post(
            f"/api/capital-calls/{call_id}/items",
            json={
                "lp_id": lp_id,
                "amount": 300_000_000,
                "paid": False,
            },
        )
        assert item_create.status_code == 201
        item_id = item_create.json()["id"]

        item_list = client.get(f"/api/capital-calls/{call_id}/items")
        assert item_list.status_code == 200
        assert any(row["id"] == item_id for row in item_list.json())

        item_update = client.put(
            f"/api/capital-calls/{call_id}/items/{item_id}",
            json={"paid": True, "paid_date": "2025-10-25"},
        )
        assert item_update.status_code == 200
        assert item_update.json()["paid"] is True
        lps_after_paid = client.get(f"/api/funds/{fund_id}/lps").json()
        paid_lp = next((lp for lp in lps_after_paid if lp["id"] == lp_id), None)
        assert paid_lp is not None
        assert paid_lp["paid_in"] == 300_000_000

        funds_after_paid = client.get("/api/funds").json()
        fund_row = next((row for row in funds_after_paid if row["id"] == fund_id), None)
        assert fund_row is not None
        assert fund_row["paid_in_total"] >= 300_000_000

        unpaid_update = client.put(
            f"/api/capital-calls/{call_id}/items/{item_id}",
            json={"paid": False, "paid_date": None},
        )
        assert unpaid_update.status_code == 200
        lps_after_unpaid = client.get(f"/api/funds/{fund_id}/lps").json()
        unpaid_lp = next((lp for lp in lps_after_unpaid if lp["id"] == lp_id), None)
        assert unpaid_lp is not None
        assert (unpaid_lp["paid_in"] or 0) == 0

        item_repaid = client.put(
            f"/api/capital-calls/{call_id}/items/{item_id}",
            json={"paid": True, "paid_date": "2025-10-26"},
        )
        assert item_repaid.status_code == 200
        summary_after_repaid = client.get(f"/api/capital-calls/summary/{fund_id}")
        assert summary_after_repaid.status_code == 200
        repaid_call = next((row for row in summary_after_repaid.json()["calls"] if row["id"] == call_id), None)
        assert repaid_call is not None
        assert repaid_call["is_fully_paid"] is True
        assert repaid_call["paid_on_time"] is False
        assert repaid_call["is_overdue_unpaid"] is False

        item_delete = client.delete(f"/api/capital-calls/{call_id}/items/{item_id}")
        assert item_delete.status_code == 204
        lps_after_delete = client.get(f"/api/funds/{fund_id}/lps").json()
        deleted_lp = next((lp for lp in lps_after_delete if lp["id"] == lp_id), None)
        assert deleted_lp is not None
        assert (deleted_lp["paid_in"] or 0) == 0

        delete_response = client.delete(f"/api/capital-calls/{call_id}")
        assert delete_response.status_code == 204

    def test_capital_call_validation_error(self, client):
        response = client.post("/api/capital-calls", json={"fund_id": 1})
        assert response.status_code == 422

    def test_capital_call_batch_and_summary(self, client, sample_fund_with_lps):
        fund_id = sample_fund_with_lps["id"]
        lps = client.get(f"/api/funds/{fund_id}/lps").json()
        assert len(lps) >= 2
        lp1 = lps[0]
        lp2 = lps[1]

        batch_response = client.post(
            "/api/capital-calls/batch",
            json={
                "fund_id": fund_id,
                "call_date": "2026-03-15",
                "call_type": "additional",
                "total_amount": 900_000_000,
                "request_percent": 9,
                "memo": "9% 출자 요청",
                "items": [
                    {"lp_id": lp1["id"], "amount": 600_000_000, "paid": True, "paid_date": "2026-03-15"},
                    {"lp_id": lp2["id"], "amount": 300_000_000, "paid": False},
                ],
            },
        )
        assert batch_response.status_code == 201
        call = batch_response.json()
        assert call["request_percent"] == 9

        summary_response = client.get(f"/api/capital-calls/summary/{fund_id}")
        assert summary_response.status_code == 200
        summary = summary_response.json()
        assert summary["fund_id"] == fund_id
        assert summary["commitment_total"] == sample_fund_with_lps["commitment_total"]
        assert summary["total_paid_in"] >= 600_000_000
        target = next((row for row in summary["calls"] if row["id"] == call["id"]), None)
        assert target is not None
        assert target["request_percent"] == 9
        assert target["total_count"] == 2
        assert target["paid_count"] == 1
        assert target["paid_amount"] == 600_000_000
        assert target["is_fully_paid"] is False
        assert isinstance(target["is_overdue_unpaid"], bool)


class TestDistributions:
    def test_distribution_and_items_crud(self, client, sample_fund_with_lps):
        fund_id = sample_fund_with_lps["id"]
        create_response = client.post(
            "/api/distributions",
            json={
                "fund_id": fund_id,
                "dist_date": "2025-12-31",
                "dist_type": "중간분배",
                "principal_total": 200_000_000,
                "profit_total": 50_000_000,
            },
        )
        assert create_response.status_code == 201
        distribution_id = create_response.json()["id"]

        list_response = client.get("/api/distributions", params={"fund_id": fund_id})
        assert list_response.status_code == 200
        assert any(row["id"] == distribution_id for row in list_response.json())

        update_response = client.put(
            f"/api/distributions/{distribution_id}",
            json={"performance_fee": 5_000_000},
        )
        assert update_response.status_code == 200
        assert update_response.json()["performance_fee"] == 5_000_000

        item_create = client.post(
            f"/api/distributions/{distribution_id}/items",
            json={
                "lp_id": _latest_lp_id(client, fund_id),
                "principal": 150_000_000,
                "profit": 30_000_000,
            },
        )
        assert item_create.status_code == 201
        item_id = item_create.json()["id"]

        item_update = client.put(
            f"/api/distributions/{distribution_id}/items/{item_id}",
            json={"profit": 35_000_000},
        )
        assert item_update.status_code == 200
        assert item_update.json()["profit"] == 35_000_000

        item_delete = client.delete(f"/api/distributions/{distribution_id}/items/{item_id}")
        assert item_delete.status_code == 204

        delete_response = client.delete(f"/api/distributions/{distribution_id}")
        assert delete_response.status_code == 204


class TestAssemblies:
    def test_assembly_crud(self, client, sample_fund):
        create_response = client.post(
            "/api/assemblies",
            json={
                "fund_id": sample_fund["id"],
                "type": "결성총회",
                "date": "2025-10-24",
                "agenda": "정관 승인",
                "status": "planned",
                "minutes_completed": False,
            },
        )
        assert create_response.status_code == 201
        assembly = create_response.json()
        assembly_id = assembly["id"]

        list_response = client.get("/api/assemblies", params={"fund_id": sample_fund["id"]})
        assert list_response.status_code == 200
        assert any(row["id"] == assembly_id for row in list_response.json())

        update_response = client.put(
            f"/api/assemblies/{assembly_id}",
            json={"status": "completed", "minutes_completed": True},
        )
        assert update_response.status_code == 200
        assert update_response.json()["status"] == "completed"
        assert update_response.json()["minutes_completed"] is True

        delete_response = client.delete(f"/api/assemblies/{assembly_id}")
        assert delete_response.status_code == 204


class TestFundPerformance:
    def test_fund_performance(self, client, sample_fund):
        response = client.get(
            f"/api/funds/{sample_fund['id']}/performance",
            params={"as_of_date": (date.today() + timedelta(days=1)).isoformat()},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["fund_id"] == sample_fund["id"]
        assert "tvpi" in data
        assert "irr" in data

    def test_fund_performance_404(self, client):
        response = client.get("/api/funds/99999/performance")
        assert response.status_code == 404
