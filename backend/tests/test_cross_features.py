class TestFundFormationFlow:
    def test_full_formation_process(self, client):
        fund_response = client.post(
            "/api/funds",
            json={
                "name": "통합테스트 1호 조합",
                "type": "벤처투자조합",
                "status": "forming",
                "gp": "테스트GP(유)",
                "commitment_total": 10_000_000_000,
                "formation_date": "2025-10-24",
            },
        )
        assert fund_response.status_code == 201
        fund = fund_response.json()

        lp_response = client.post(
            f"/api/funds/{fund['id']}/lps",
            json={"name": "테스트LP", "type": "법인", "commitment": 5_000_000_000},
        )
        assert lp_response.status_code == 201

        templates_response = client.get("/api/workflows")
        assert templates_response.status_code == 200
        templates = templates_response.json()
        formation_template = next(
            (row for row in templates if "결성" in (row.get("name") or "")),
            None,
        )

        if not formation_template:
            formation_template_response = client.post(
                "/api/workflows",
                json={
                    "name": "결성총회",
                    "category": "조합결성",
                    "steps": [
                        {
                            "order": 1,
                            "name": "소집통지서 발송",
                            "timing": "D-7",
                            "timing_offset_days": -7,
                            "estimated_time": "1h",
                            "quadrant": "Q1",
                        },
                        {
                            "order": 2,
                            "name": "결성총회 개최",
                            "timing": "D-day",
                            "timing_offset_days": 0,
                            "estimated_time": "2h",
                            "quadrant": "Q1",
                        },
                    ],
                    "documents": [],
                    "warnings": [],
                },
            )
            assert formation_template_response.status_code == 201
            formation_template = formation_template_response.json()

        instance_response = client.post(
            f"/api/workflows/{formation_template['id']}/instantiate",
            json={
                "name": f"{fund['name']} 결성총회",
                "trigger_date": "2025-10-24",
                "fund_id": fund["id"],
            },
        )
        assert instance_response.status_code == 200
        instance = instance_response.json()

        doc_templates_response = client.get("/api/document-templates")
        assert doc_templates_response.status_code == 200
        doc_templates = doc_templates_response.json()
        for template in doc_templates:
            response = client.post(
                f"/api/document-templates/{template['id']}/generate",
                params={"fund_id": fund["id"], "assembly_date": "2025-10-24"},
            )
            assert response.status_code == 200
            assert "openxmlformats" in response.headers.get("content-type", "")

        for step in instance["step_instances"]:
            complete_response = client.patch(
                f"/api/workflow-instances/{instance['id']}/steps/{step['id']}/complete",
                json={"actual_time": "1h"},
            )
            assert complete_response.status_code == 200

        fund_check_response = client.get(f"/api/funds/{fund['id']}")
        assert fund_check_response.status_code == 200
        updated_fund = fund_check_response.json()
        assert updated_fund["status"] == "active"

        dashboard = client.get("/api/dashboard/today")
        assert dashboard.status_code == 200


class TestInvestmentFlow:
    def test_investment_to_valuation_flow(self, client, sample_fund):
        fund_id = sample_fund["id"]

        company_response = client.post(
            "/api/companies",
            json={"name": "테스트기업(주)", "industry": "바이오"},
        )
        assert company_response.status_code == 201
        company = company_response.json()

        investment_response = client.post(
            "/api/investments",
            json={
                "fund_id": fund_id,
                "company_id": company["id"],
                "investment_date": "2025-06-15",
                "amount": 1_000_000_000,
                "instrument": "보통주",
                "status": "active",
            },
        )
        assert investment_response.status_code == 201
        investment = investment_response.json()

        transaction_response = client.post(
            "/api/transactions",
            json={
                "investment_id": investment["id"],
                "fund_id": fund_id,
                "company_id": company["id"],
                "transaction_date": "2025-06-15",
                "type": "investment",
                "amount": 1_000_000_000,
            },
        )
        assert transaction_response.status_code == 201
        assert transaction_response.json()["amount"] == 1_000_000_000

        valuation_response = client.post(
            "/api/valuations",
            json={
                "investment_id": investment["id"],
                "fund_id": fund_id,
                "company_id": company["id"],
                "as_of_date": "2025-12-31",
                "method": "상대가치법",
                "value": 1_500_000_000,
            },
        )
        assert valuation_response.status_code == 201
        assert valuation_response.json()["value"] == 1_500_000_000

        checklist_response = client.post(
            "/api/checklists",
            json={
                "investment_id": investment["id"],
                "name": "투자 후 관리 체크리스트",
                "items": [],
            },
        )
        assert checklist_response.status_code == 201
        assert checklist_response.json()["investment_id"] == investment["id"]


class TestTaskWorkflowBridge:
    def test_task_completion_creates_worklog(self, client, sample_task):
        task_id = sample_task["id"]
        response = client.patch(
            f"/api/tasks/{task_id}/complete",
            json={
                "actual_time": "25m",
                "auto_worklog": True,
                "memo": "테스트 완료",
            },
        )
        assert response.status_code == 200

        worklogs = client.get("/api/worklogs").json()
        auto_logs = [row for row in worklogs if "테스트 업무" in row.get("title", "")]
        assert len(auto_logs) >= 1


class TestSearchIntegration:
    def test_search_finds_all_entities(self, client):
        fund_response = client.post(
            "/api/funds",
            json={
                "name": "통합검색 조합",
                "type": "벤처투자조합",
                "status": "forming",
            },
        )
        assert fund_response.status_code == 201
        fund = fund_response.json()

        task_response = client.post(
            "/api/tasks",
            json={
                "title": "통합검색 업무",
                "quadrant": "Q1",
                "estimated_time": "30m",
            },
        )
        assert task_response.status_code == 201
        task = task_response.json()
        assert task["title"] == "통합검색 업무"

        company_response = client.post(
            "/api/companies",
            json={"name": "통합검색 회사", "industry": "IT"},
        )
        assert company_response.status_code == 201
        company = company_response.json()

        investment_response = client.post(
            "/api/investments",
            json={
                "fund_id": fund["id"],
                "company_id": company["id"],
                "investment_date": "2025-07-01",
                "amount": 100_000_000,
                "status": "active",
            },
        )
        assert investment_response.status_code == 201
        investment = investment_response.json()
        assert investment["company_id"] == company["id"]

        workflow_response = client.post(
            "/api/workflows",
            json={
                "name": "통합검색 워크플로우",
                "steps": [
                    {
                        "order": 1,
                        "name": "통합검색 단계",
                        "timing": "D-day",
                        "timing_offset_days": 0,
                    }
                ],
                "documents": [],
                "warnings": [],
            },
        )
        assert workflow_response.status_code == 201
        workflow = workflow_response.json()
        instance_response = client.post(
            f"/api/workflows/{workflow['id']}/instantiate",
            json={"name": "통합검색 인스턴스", "trigger_date": "2025-10-24"},
        )
        assert instance_response.status_code == 200

        worklog_response = client.post(
            "/api/worklogs",
            json={
                "date": "2025-10-24",
                "category": "정기 업무",
                "title": "통합검색 업무기록",
            },
        )
        assert worklog_response.status_code == 201

        regular_report_response = client.post(
            "/api/regular-reports",
            json={
                "report_target": "통합검색기관",
                "fund_id": fund["id"],
                "period": "2025-10",
                "due_date": "2025-11-05",
            },
        )
        assert regular_report_response.status_code == 201

        biz_report_response = client.post(
            "/api/biz-reports",
            json={
                "fund_id": fund["id"],
                "report_year": 2025,
                "status": "작성중",
            },
        )
        assert biz_report_response.status_code == 201

        response = client.get("/api/search", params={"q": "통합검색"})
        assert response.status_code == 200
        types = {row.get("type") for row in response.json()}
        expected = {
            "task",
            "fund",
            "company",
            "investment",
            "workflow",
            "biz_report",
            "report",
            "worklog",
        }
        assert expected.issubset(types)
