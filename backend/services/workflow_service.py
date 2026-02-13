from datetime import date, timedelta
from sqlalchemy.orm import Session

from models.investment import InvestmentDocument
from models.task import Task
from models.workflow import Workflow
from models.workflow_instance import WorkflowInstance, WorkflowStepInstance


def skip_weekends(d: date) -> date:
    while d.weekday() >= 5:  # 5=토, 6=일
        d += timedelta(days=1)
    return d


def calculate_step_date(trigger_date: date, offset_days: int) -> date:
    result = trigger_date + timedelta(days=offset_days)
    # TODO: 공휴일(국경일/대체공휴일) 제외 로직 추가
    return skip_weekends(result)


def instantiate_workflow(
    db: Session,
    workflow: Workflow,
    name: str,
    trigger_date: date,
    memo: str | None = None,
    investment_id: int | None = None,
    company_id: int | None = None,
    fund_id: int | None = None,
) -> WorkflowInstance:
    instance = WorkflowInstance(
        workflow_id=workflow.id,
        name=name,
        trigger_date=trigger_date,
        memo=memo,
        investment_id=investment_id,
        company_id=company_id,
        fund_id=fund_id,
    )
    db.add(instance)
    db.flush()  # ID 확보

    for step in workflow.steps:
        calc_date = calculate_step_date(trigger_date, step.timing_offset_days)

        # 자동 Task 생성
        task = Task(
            title=f"[{name}] {step.name}",
            deadline=calc_date,
            estimated_time=step.estimated_time,
            quadrant=step.quadrant,
            memo=step.memo,
            status="pending",
            workflow_instance_id=instance.id,
            workflow_step_order=step.order,
        )
        db.add(task)
        db.flush()

        step_instance = WorkflowStepInstance(
            instance_id=instance.id,
            workflow_step_id=step.id,
            calculated_date=calc_date,
            task_id=task.id,
        )
        db.add(step_instance)

    if investment_id:
        for doc in workflow.documents:
            existing = (
                db.query(InvestmentDocument)
                .filter(
                    InvestmentDocument.investment_id == investment_id,
                    InvestmentDocument.name == doc.name,
                )
                .first()
            )
            if existing:
                continue
            db.add(
                InvestmentDocument(
                    investment_id=investment_id,
                    name=doc.name,
                    doc_type=doc.timing or None,
                    status="pending",
                    note=f"워크플로우 자동생성: {workflow.name}",
                )
            )

    db.commit()
    db.refresh(instance)
    return instance
