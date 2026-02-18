class TestRegularReports:
    def test_regular_report_crud(self, client, sample_fund):
        create_response = client.post(
            "/api/regular-reports",
            json={
                "report_target": "농금원",
                "fund_id": sample_fund["id"],
                "period": "2025-10",
                "due_date": "2025-11-05",
                "status": "예정",
                "memo": "정기 제출",
            },
        )
        assert create_response.status_code == 201
        report = create_response.json()
        report_id = report["id"]

        list_response = client.get("/api/regular-reports", params={"fund_id": sample_fund["id"]})
        assert list_response.status_code == 200
        assert any(row["id"] == report_id for row in list_response.json())

        get_response = client.get(f"/api/regular-reports/{report_id}")
        assert get_response.status_code == 200
        assert get_response.json()["report_target"] == "농금원"

        update_response = client.put(
            f"/api/regular-reports/{report_id}",
            json={"status": "제출완료"},
        )
        assert update_response.status_code == 200
        assert update_response.json()["status"] == "제출완료"

        delete_response = client.delete(f"/api/regular-reports/{report_id}")
        assert delete_response.status_code == 200
        assert delete_response.json()["ok"] is True

    def test_regular_report_validation_error(self, client):
        response = client.post("/api/regular-reports", json={"period": "2025-10"})
        assert response.status_code == 422


class TestBizReports:
    def test_biz_report_crud(self, client, sample_fund):
        create_response = client.post(
            "/api/biz-reports",
            json={
                "fund_id": sample_fund["id"],
                "report_year": 2025,
                "status": "작성중",
                "total_commitment": 10_000_000_000,
                "total_invested": 1_000_000_000,
            },
        )
        assert create_response.status_code == 201
        report = create_response.json()
        report_id = report["id"]

        list_response = client.get("/api/biz-reports", params={"fund_id": sample_fund["id"]})
        assert list_response.status_code == 200
        assert any(row["id"] == report_id for row in list_response.json())

        get_response = client.get(f"/api/biz-reports/{report_id}")
        assert get_response.status_code == 200
        assert get_response.json()["report_year"] == 2025

        update_response = client.put(
            f"/api/biz-reports/{report_id}",
            json={"status": "확정"},
        )
        assert update_response.status_code == 200
        assert update_response.json()["status"] == "확정"

        delete_response = client.delete(f"/api/biz-reports/{report_id}")
        assert delete_response.status_code == 200
        assert delete_response.json()["ok"] is True

    def test_biz_report_validation_error(self, client):
        response = client.post("/api/biz-reports", json={"report_year": 2025})
        assert response.status_code == 422

    def test_report_not_found(self, client):
        response_regular = client.get("/api/regular-reports/99999")
        assert response_regular.status_code == 404

        response_biz = client.get("/api/biz-reports/99999")
        assert response_biz.status_code == 404
