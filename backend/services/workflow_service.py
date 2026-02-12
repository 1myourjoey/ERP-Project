from datetime import date, timedelta
from sqlalchemy.orm import Session

from models.task import Task
from models.workflow import Workflow
from models.workflow_instance import WorkflowInstance, WorkflowStepInstance


def skip_weekends(d: date) -> date:
    while d.weekday() >= 5:  # 5=토, 6=일
        d += timedelta(days=1)
    return d


def calculate_step_date(trigger_date: date, offset_days: int) -> date:
    result = trigger_date + timedelta(days=offset_days)
    return skip_weekends(result)


def instantiate_workflow(
    db: Session,
    workflow: Workflow,
    name: str,
    trigger_date: date,
    memo: str | None = None,
) -> WorkflowInstance:
    instance = WorkflowInstance(
        workflow_id=workflow.id,
        name=name,
        trigger_date=trigger_date,
        memo=memo,
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

    db.commit()
    db.refresh(instance)
    return instance
