from datetime import date, datetime

from models.task import Task
from models.workflow import Workflow, WorkflowStep
from models.workflow_instance import WorkflowInstance
from services.workflow_service import instantiate_workflow


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


class TestFundDeleteLifecycle:
    def test_delete_fund_keeps_completed_history_and_removes_in_progress_data(
        self,
        client,
        db_session,
        sample_fund,
    ):
        fund_id = sample_fund["id"]

        workflow = Workflow(
            name="조합 삭제 라이프사이클 테스트",
            category="테스트",
            trigger_description="삭제 시나리오",
            total_duration="2일",
        )
        workflow.steps = [
            WorkflowStep(
                order=1,
                name="1. 검토",
                timing="D-day",
                timing_offset_days=0,
                estimated_time="1h",
                quadrant="Q1",
            ),
            WorkflowStep(
                order=2,
                name="2. 확인",
                timing="D+1",
                timing_offset_days=1,
                estimated_time="1h",
                quadrant="Q1",
            ),
        ]
        db_session.add(workflow)
        db_session.commit()
        db_session.refresh(workflow)

        active_instance = instantiate_workflow(
            db_session,
            workflow,
            name="[테스트] 진행 워크플로",
            trigger_date=date(2025, 10, 24),
            fund_id=fund_id,
            auto_commit=False,
        )
        completed_instance = instantiate_workflow(
            db_session,
            workflow,
            name="[테스트] 완료 워크플로",
            trigger_date=date(2025, 10, 24),
            fund_id=fund_id,
            auto_commit=False,
        )
        db_session.flush()

        active_steps = sorted(
            active_instance.step_instances,
            key=lambda row: ((row.step.order if row.step else 10**9), (row.id or 0)),
        )
        assert len(active_steps) >= 2

        active_first_step = active_steps[0]
        active_second_step = active_steps[1]
        active_first_task_id = active_first_step.task_id
        active_second_task_id = active_second_step.task_id
        assert active_first_task_id is not None
        assert active_second_task_id is not None

        active_first_task = db_session.get(Task, active_first_task_id)
        active_second_task = db_session.get(Task, active_second_task_id)
        assert active_first_task is not None
        assert active_second_task is not None

        active_first_step.status = "completed"
        active_first_task.status = "completed"
        active_first_task.completed_at = datetime.utcnow()
        active_second_step.status = "in_progress"
        active_second_task.status = "in_progress"

        completed_workflow_task_id = None
        for step in completed_instance.step_instances:
            step.status = "completed"
            if step.task_id is None:
                continue
            task = db_session.get(Task, step.task_id)
            if task:
                task.status = "completed"
                task.completed_at = datetime.utcnow()
                completed_workflow_task_id = completed_workflow_task_id or task.id
        completed_instance.status = "completed"
        completed_instance.completed_at = datetime.utcnow()
        assert completed_workflow_task_id is not None

        standalone_completed = Task(
            title="완료 단독 업무",
            quadrant="Q1",
            status="completed",
            fund_id=fund_id,
        )
        standalone_pending = Task(
            title="미완료 단독 업무",
            quadrant="Q1",
            status="pending",
            fund_id=fund_id,
        )
        db_session.add_all([standalone_completed, standalone_pending])
        db_session.commit()

        active_instance_id = active_instance.id
        completed_instance_id = completed_instance.id
        standalone_completed_id = standalone_completed.id
        standalone_pending_id = standalone_pending.id

        response = client.delete(f"/api/funds/{fund_id}")
        assert response.status_code == 204

        assert db_session.get(WorkflowInstance, active_instance_id) is None

        kept_completed_instance = db_session.get(WorkflowInstance, completed_instance_id)
        assert kept_completed_instance is not None
        assert kept_completed_instance.fund_id is None

        kept_active_completed_task = db_session.get(Task, active_first_task_id)
        assert kept_active_completed_task is not None
        assert kept_active_completed_task.fund_id is None
        assert kept_active_completed_task.workflow_instance_id is None

        assert db_session.get(Task, active_second_task_id) is None

        kept_completed_workflow_task = db_session.get(Task, completed_workflow_task_id)
        assert kept_completed_workflow_task is not None
        assert kept_completed_workflow_task.fund_id is None
        assert kept_completed_workflow_task.workflow_instance_id == completed_instance_id

        kept_standalone_completed = db_session.get(Task, standalone_completed_id)
        assert kept_standalone_completed is not None
        assert kept_standalone_completed.fund_id is None
        assert db_session.get(Task, standalone_pending_id) is None


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
