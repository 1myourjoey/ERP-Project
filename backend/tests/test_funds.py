from datetime import date


class TestFundsCRUD:
    def test_create_fund(self, client):
        response = client.post(
            "/api/funds",
            json={
                "name": "신규 1호 조합",
                "type": "벤처투자조합",
                "status": "forming",
                "gp": "테스트GP(유)",
                "commitment_total": 5_000_000_000,
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "신규 1호 조합"
        assert data["status"] == "forming"
        assert data["commitment_total"] == 5_000_000_000
        assert "id" in data

    def test_list_funds(self, client, sample_fund):
        response = client.get("/api/funds")
        assert response.status_code == 200
        funds = response.json()
        assert any(fund["id"] == sample_fund["id"] for fund in funds)

    def test_get_fund_detail(self, client, sample_fund):
        response = client.get(f"/api/funds/{sample_fund['id']}")
        assert response.status_code == 200
        assert response.json()["name"] == sample_fund["name"]

    def test_update_fund(self, client, sample_fund):
        response = client.put(
            f"/api/funds/{sample_fund['id']}",
            json={
                "name": "수정된 조합명",
                "status": "active",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "수정된 조합명"
        assert data["status"] == "active"

    def test_delete_fund(self, client, sample_fund):
        response = client.delete(f"/api/funds/{sample_fund['id']}")
        assert response.status_code == 204

        response_after_delete = client.get(f"/api/funds/{sample_fund['id']}")
        assert response_after_delete.status_code == 404

    def test_get_nonexistent_fund(self, client):
        response = client.get("/api/funds/99999")
        assert response.status_code == 404

    def test_create_fund_validation_error(self, client):
        response = client.post(
            "/api/funds",
            json={
                "name": "유효성 실패 조합",
            },
        )
        assert response.status_code == 422


class TestFundLPs:
    def test_add_lp(self, client, sample_fund):
        response = client.post(
            f"/api/funds/{sample_fund['id']}/lps",
            json={
                "name": "신규 LP",
                "type": "법인",
                "commitment": 1_000_000_000,
            },
        )
        assert response.status_code == 201
        assert response.json()["name"] == "신규 LP"

    def test_list_lps(self, client, sample_fund_with_lps):
        response = client.get(f"/api/funds/{sample_fund_with_lps['id']}/lps")
        assert response.status_code == 200
        assert len(response.json()) == 3

    def test_update_lp(self, client, sample_fund):
        create_response = client.post(
            f"/api/funds/{sample_fund['id']}/lps",
            json={
                "name": "수정대상 LP",
                "type": "개인",
                "commitment": 500_000_000,
            },
        )
        assert create_response.status_code == 201
        lp_id = create_response.json()["id"]

        update_response = client.put(
            f"/api/funds/{sample_fund['id']}/lps/{lp_id}",
            json={"commitment": 800_000_000},
        )
        assert update_response.status_code == 200
        assert update_response.json()["commitment"] == 800_000_000

    def test_delete_lp(self, client, sample_fund):
        create_response = client.post(
            f"/api/funds/{sample_fund['id']}/lps",
            json={
                "name": "삭제대상 LP",
                "type": "개인",
                "commitment": 100_000_000,
            },
        )
        assert create_response.status_code == 201
        lp_id = create_response.json()["id"]

        delete_response = client.delete(f"/api/funds/{sample_fund['id']}/lps/{lp_id}")
        assert delete_response.status_code == 204

        list_response = client.get(f"/api/funds/{sample_fund['id']}/lps")
        lp_ids = [lp["id"] for lp in list_response.json()]
        assert lp_id not in lp_ids

    def test_create_lp_validation_error(self, client, sample_fund):
        response = client.post(
            f"/api/funds/{sample_fund['id']}/lps",
            json={"name": "누락"},
        )
        assert response.status_code == 422


class TestFundNoticeAndTerms:
    def test_notice_periods_and_deadline(self, client, sample_fund):
        response = client.put(
            f"/api/funds/{sample_fund['id']}/notice-periods",
            json=[
                {
                    "notice_type": "assembly",
                    "label": "총회 소집 통지",
                    "business_days": 14,
                    "memo": "규약 기준",
                },
                {
                    "notice_type": "distribution",
                    "label": "분배 통지",
                    "business_days": 5,
                },
            ],
        )
        assert response.status_code == 200
        periods = response.json()
        assert len(periods) == 2

        get_response = client.get(
            f"/api/funds/{sample_fund['id']}/notice-periods/assembly"
        )
        assert get_response.status_code == 200
        assert get_response.json()["business_days"] == 14

        deadline_response = client.get(
            f"/api/funds/{sample_fund['id']}/calculate-deadline",
            params={"target_date": "2025-10-24", "notice_type": "assembly"},
        )
        assert deadline_response.status_code == 200
        payload = deadline_response.json()
        assert payload["target_date"] == "2025-10-24"
        assert payload["notice_type"] == "assembly"
        assert payload["deadline"] < payload["target_date"]

    def test_key_terms(self, client, sample_fund):
        response = client.put(
            f"/api/funds/{sample_fund['id']}/key-terms",
            json=[
                {
                    "category": "수익배분",
                    "label": "성과보수율",
                    "value": "20%",
                    "article_ref": "제30조",
                },
                {
                    "category": "출자",
                    "label": "GP 출자율",
                    "value": "1%",
                },
            ],
        )
        assert response.status_code == 200
        rows = response.json()
        assert len(rows) == 2
        assert rows[0]["fund_id"] == sample_fund["id"]

    def test_fund_overview(self, client, sample_fund):
        response = client.get("/api/funds/overview")
        assert response.status_code == 200
        data = response.json()
        assert "reference_date" in data
        assert "funds" in data
        assert "totals" in data
        assert any(row["id"] == sample_fund["id"] for row in data["funds"])

    def test_fund_overview_export(self, client, sample_fund):
        response = client.get(
            "/api/funds/overview/export",
            params={"reference_date": date.today().isoformat()},
        )
        assert response.status_code == 200
        assert "spreadsheetml.sheet" in response.headers.get("content-type", "")
        assert len(response.content) > 0
