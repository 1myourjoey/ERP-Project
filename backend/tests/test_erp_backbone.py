from datetime import date

from models.document_template import DocumentTemplate
from models.erp_backbone import ErpDocumentRecord, ErpEvent, ErpSubject
from models.fund import Fund
from models.gp_entity import GPEntity
from models.investment import Investment, InvestmentDocument, PortfolioCompany
from models.workflow import Workflow, WorkflowStep, WorkflowStepDocument
from services.erp_backbone import (
    SUBJECT_INVESTMENT,
    SUBJECT_WORKFLOW_INSTANCE,
    SUBJECT_WORKFLOW_STEP,
    backfill_backbone,
    get_subject,
)
from services.workflow_service import instantiate_workflow


def test_backfill_builds_subjects_and_document_registry(db_session):
    gp = GPEntity(name="Backfill GP", entity_type="general")
    db_session.add(gp)
    db_session.flush()

    fund = Fund(
        name="Backfill Fund",
        type="venture",
        status="active",
        gp="Backfill GP",
        gp_entity_id=gp.id,
    )
    company = PortfolioCompany(name="Backfill Company", industry="software")
    db_session.add_all([fund, company])
    db_session.flush()

    investment = Investment(
        fund_id=fund.id,
        company_id=company.id,
        investment_date=date(2025, 6, 1),
        amount=1000000,
        instrument="equity",
        status="active",
    )
    db_session.add(investment)
    db_session.flush()

    document = InvestmentDocument(
        investment_id=investment.id,
        name="Investment Memo",
        doc_type="memo",
        status="pending",
    )
    db_session.add(document)
    db_session.commit()

    stats = backfill_backbone(db_session, emit_seed_events=True)
    db_session.commit()

    assert stats["subjects_created"] > 0
    assert get_subject(db_session, SUBJECT_INVESTMENT, investment.id) is not None
    assert (
        db_session.query(ErpDocumentRecord)
        .filter(
            ErpDocumentRecord.origin_model == "investment_document",
            ErpDocumentRecord.origin_id == document.id,
        )
        .count()
        == 1
    )


def test_entity_graph_context_endpoint_includes_related_subjects_and_documents(client, sample_investment):
    investment_id = sample_investment["id"]
    create_doc_response = client.post(
        f"/api/investments/{investment_id}/documents",
        json={
            "name": "Closing Checklist",
            "doc_type": "closing",
            "status": "pending",
        },
    )
    assert create_doc_response.status_code == 201

    response = client.get(
        "/api/entity-graph/context",
        params={"subject_type": "investment", "native_id": investment_id},
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["subject"]["subject_type"] == "investment"
    related_types = {row["subject_type"] for row in payload["related_subjects"]}
    assert "fund" in related_types
    assert "company" in related_types
    assert any(doc["title"] == "Closing Checklist" for doc in payload["documents"])


def test_task_completion_emits_backbone_event(client, db_session, sample_task):
    task_id = sample_task["id"]

    response = client.patch(
        f"/api/tasks/{task_id}/complete",
        json={"actual_time": "20m", "auto_worklog": False},
    )
    assert response.status_code == 200

    event = (
        db_session.query(ErpEvent)
        .join(ErpSubject, ErpSubject.id == ErpEvent.subject_id)
        .filter(
            ErpSubject.subject_type == "task",
            ErpSubject.native_id == task_id,
            ErpEvent.event_type == "task.completed",
        )
        .first()
    )
    assert event is not None


def test_workflow_instantiation_syncs_backbone_and_step_documents(db_session, sample_fund):
    fund_id = sample_fund["id"]
    template = db_session.query(DocumentTemplate).first()

    workflow = Workflow(
        name="Backbone Workflow",
        category="operations",
        trigger_description="event",
        total_duration="3d",
    )
    step = WorkflowStep(
        order=1,
        name="Prepare",
        timing="D-day",
        timing_offset_days=0,
        estimated_time="1h",
        quadrant="Q1",
    )
    step.step_documents.append(
        WorkflowStepDocument(
            name="Required Attachment",
            required=True,
            timing="before",
            document_template_id=template.id if template else None,
        )
    )
    workflow.steps = [step]
    db_session.add(workflow)
    db_session.commit()

    instance = instantiate_workflow(
        db_session,
        workflow,
        name="Backbone Workflow Instance",
        trigger_date=date(2025, 10, 24),
        fund_id=fund_id,
        auto_commit=False,
    )
    db_session.commit()

    assert get_subject(db_session, SUBJECT_WORKFLOW_INSTANCE, instance.id) is not None
    assert len(instance.step_instances) == 1
    step_instance = instance.step_instances[0]
    assert get_subject(db_session, SUBJECT_WORKFLOW_STEP, step_instance.id) is not None
    assert (
        db_session.query(ErpDocumentRecord)
        .filter(
            ErpDocumentRecord.origin_model == "workflow_step_instance_document",
            ErpDocumentRecord.origin_id == step_instance.step_documents[0].id,
        )
        .count()
        == 1
    )
    assert (
        db_session.query(ErpEvent)
        .join(ErpSubject, ErpSubject.id == ErpEvent.subject_id)
        .filter(
            ErpSubject.subject_type == "workflow_instance",
            ErpSubject.native_id == instance.id,
            ErpEvent.event_type == "workflow_instance.created",
        )
        .count()
        == 1
    )
