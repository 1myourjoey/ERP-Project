import re
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund, FundNoticePeriod
from models.gp_entity import GPEntity
from models.investment import Investment, InvestmentDocument, PortfolioCompany
from models.regular_report import RegularReport
from models.task import Task
from models.workflow_instance import WorkflowInstance
from schemas.dashboard import DashboardTodayResponse, UpcomingNoticeItem
from schemas.task import TaskResponse
from services.workflow_service import reconcile_workflow_instance_state

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
MONTHLY_REMINDER_TITLES = (
    "농금원 월보고 ({year_month})",
    "벤처협회 VICS 월보고 ({year_month})",
)


def _parse_memo_dates(memo: str | None, year: int) -> list[date]:
    if not memo:
        return []

    dates: list[date] = []
    for match in re.finditer(r"(\d{1,2})/(\d{1,2})", memo):
        try:
            month, day = int(match.group(1)), int(match.group(2))
            dates.append(date(year, month, day))
        except ValueError:
            pass
    return dates


def _match_notice_type(step_name: str, step_timing: str, notice_map: dict[str, FundNoticePeriod]) -> str | None:
    lowered_name = step_name.lower()
    lowered_timing = step_timing.lower()

    for notice_type, notice in notice_map.items():
        if notice_type in lowered_name or notice_type in lowered_timing:
            return notice_type
        label = (notice.label or "").lower()
        if label and (label in lowered_name or label in lowered_timing):
            return notice_type
    return None


def _dashboard_week_bounds(target: date) -> tuple[date, date]:
    # Dashboard week is Monday-Sunday.
    week_start = target - timedelta(days=target.weekday())
    week_end = week_start + timedelta(days=6)
    return week_start, week_end


def _step_instance_order_key(step_instance) -> tuple[int, int]:
    step_order = (
        step_instance.step.order
        if step_instance.step and step_instance.step.order is not None
        else 10**9
    )
    return (step_order, step_instance.id or 0)


def _task_response(db: Session, task: Task) -> TaskResponse:
    payload = TaskResponse.model_validate(task).model_dump()

    investment = db.get(Investment, task.investment_id) if task.investment_id else None
    fund_id = task.fund_id or (investment.fund_id if investment else None)
    gp_entity_id = task.gp_entity_id

    fund_name = None
    if fund_id:
        fund = db.get(Fund, fund_id)
        fund_name = fund.name if fund else None

    gp_entity_name = None
    if gp_entity_id:
        gp_entity = db.get(GPEntity, gp_entity_id)
        gp_entity_name = gp_entity.name if gp_entity else None

    company_name = None
    if investment:
        company = db.get(PortfolioCompany, investment.company_id)
        company_name = company.name if company else None

    if (not fund_name or not company_name or not gp_entity_name) and task.workflow_instance_id:
        instance = db.get(WorkflowInstance, task.workflow_instance_id)
        if instance:
            if not fund_name and instance.fund_id:
                wf_fund = db.get(Fund, instance.fund_id)
                fund_name = wf_fund.name if wf_fund else None
                if fund_id is None:
                    fund_id = instance.fund_id
            if not gp_entity_name and instance.gp_entity_id:
                gp_entity = db.get(GPEntity, instance.gp_entity_id)
                gp_entity_name = gp_entity.name if gp_entity else None
                if gp_entity_id is None:
                    gp_entity_id = instance.gp_entity_id
            if not company_name and instance.company_id:
                wf_company = db.get(PortfolioCompany, instance.company_id)
                company_name = wf_company.name if wf_company else None

    payload["fund_id"] = fund_id
    payload["gp_entity_id"] = gp_entity_id
    payload["fund_name"] = fund_name or gp_entity_name
    payload["gp_entity_name"] = gp_entity_name
    payload["company_name"] = company_name
    return TaskResponse(**payload)


@router.get("/today", response_model=DashboardTodayResponse)
def get_today_dashboard(db: Session = Depends(get_db)):
    today = date.today()
    tomorrow = today + timedelta(days=1)
    current_year_month = today.strftime("%Y-%m")
    monthly_titles = [title.format(year_month=current_year_month) for title in MONTHLY_REMINDER_TITLES]
    monthly_task_count = db.query(Task).filter(Task.title.in_(monthly_titles)).count()
    monthly_reminder = monthly_task_count < len(monthly_titles)

    week_start, week_end = _dashboard_week_bounds(today)

    if today.month == 12:
        upcoming_end = date(today.year + 1, 2, 28)
    else:
        upcoming_month = today.month + 2
        upcoming_year = today.year
        if upcoming_month > 12:
            upcoming_month -= 12
            upcoming_year += 1
        upcoming_end = date(upcoming_year, upcoming_month, 28)

    # Heal legacy mismatches between task-completion and workflow status.
    sync_targets = (
        db.query(WorkflowInstance)
        .filter(WorkflowInstance.status.in_(["active", "completed"]))
        .all()
    )
    needs_commit = False
    for instance in sync_targets:
        if reconcile_workflow_instance_state(db, instance):
            needs_commit = True
    if needs_commit:
        db.commit()

    pending_tasks = (
        db.query(Task)
        .filter(Task.status.in_(["pending", "in_progress"]))
        .order_by(Task.deadline.asc().nullslast())
        .all()
    )

    today_tasks: list[TaskResponse] = []
    tomorrow_tasks: list[TaskResponse] = []
    week_tasks: list[TaskResponse] = []
    upcoming_tasks: list[TaskResponse] = []
    no_deadline_tasks: list[TaskResponse] = []

    for task in pending_tasks:
        task_resp = _task_response(db, task)
        deadline = task.deadline.date() if isinstance(task.deadline, datetime) else task.deadline
        if deadline is None:
            no_deadline_tasks.append(task_resp)
            continue

        # Overdue tasks stay visible in today's bucket so dashboard/task board counts align.
        if deadline <= today:
            today_tasks.append(task_resp)
        elif deadline == tomorrow:
            tomorrow_tasks.append(task_resp)
        elif week_end < deadline <= upcoming_end:
            upcoming_tasks.append(task_resp)

        # "이번 주" is calendar-week based (Mon-Sun), independent from today/tomorrow buckets.
        if week_start <= deadline <= week_end and task_resp not in week_tasks:
            week_tasks.append(task_resp)

        if task.memo:
            memo_dates = _parse_memo_dates(task.memo, today.year)
            for memo_date in memo_dates:
                if week_start <= memo_date <= week_end and task_resp not in week_tasks:
                    week_tasks.append(task_resp)
                    break

    active_instances = db.query(WorkflowInstance).filter(WorkflowInstance.status == "active").all()

    active_workflows = []
    for instance in active_instances:
        ordered_steps = sorted(instance.step_instances, key=_step_instance_order_key)
        total = len(ordered_steps)
        done = sum(1 for step in ordered_steps if step.status in ("completed", "skipped"))

        next_step_instance = next(
            (
                step_instance
                for step_instance in ordered_steps
                if step_instance.status in ("in_progress", "pending")
            ),
            None,
        )
        next_step = next_step_instance.step.name if next_step_instance and next_step_instance.step else None
        next_step_date = (
            next_step_instance.calculated_date.isoformat()
            if next_step_instance and next_step_instance.calculated_date
            else None
        )

        company_name = None
        fund_name = None
        gp_entity_name = None

        if instance.investment_id is not None:
            inv = db.get(Investment, instance.investment_id)
            if inv:
                company = db.get(PortfolioCompany, inv.company_id)
                fund = db.get(Fund, inv.fund_id)
                if company:
                    company_name = company.name
                if fund:
                    fund_name = fund.name

        if company_name is None and instance.company_id is not None:
            company = db.get(PortfolioCompany, instance.company_id)
            if company:
                company_name = company.name

        if fund_name is None and instance.fund_id is not None:
            fund = db.get(Fund, instance.fund_id)
            if fund:
                fund_name = fund.name
        if instance.gp_entity_id is not None:
            gp_entity = db.get(GPEntity, instance.gp_entity_id)
            if gp_entity:
                gp_entity_name = gp_entity.name

        active_workflows.append(
            {
                "id": instance.id,
                "name": instance.name,
                "progress": f"{done}/{total}",
                "next_step": next_step,
                "next_step_date": next_step_date,
                "company_name": company_name,
                "fund_name": fund_name or gp_entity_name,
                "gp_entity_name": gp_entity_name,
            }
        )

    fund_summary = []
    funds = db.query(Fund).order_by(Fund.id.desc()).all()
    for fund in funds:
        investment_count = db.query(Investment).filter(Investment.fund_id == fund.id).count()
        fund_summary.append(
            {
                "id": fund.id,
                "name": fund.name,
                "type": fund.type,
                "status": fund.status,
                "commitment_total": fund.commitment_total,
                "aum": fund.aum,
                "lp_count": len(fund.lps),
                "investment_count": investment_count,
            }
        )

    missing_documents = []
    docs = (
        db.query(InvestmentDocument)
        .filter(InvestmentDocument.status != "collected")
        .order_by(InvestmentDocument.id.desc())
        .limit(20)
        .all()
    )

    for doc in docs:
        investment = db.get(Investment, doc.investment_id)
        if not investment:
            continue

        company = db.get(PortfolioCompany, investment.company_id)
        fund = db.get(Fund, investment.fund_id)

        missing_documents.append(
            {
                "id": doc.id,
                "investment_id": investment.id,
                "document_name": doc.name,
                "document_type": doc.doc_type,
                "status": doc.status,
                "company_name": company.name if company else "",
                "fund_name": fund.name if fund else "",
                "due_date": doc.due_date.isoformat() if doc.due_date else None,
                "days_remaining": (doc.due_date - today).days if doc.due_date else None,
            }
        )

    submitted_statuses = ["제출완료", "전송완료"]
    upcoming_reports = []
    report_rows = (
        db.query(RegularReport)
        .filter(
            RegularReport.status.notin_(submitted_statuses),
            RegularReport.due_date.isnot(None),
            RegularReport.due_date <= today + timedelta(days=7),
        )
        .order_by(RegularReport.due_date.asc(), RegularReport.id.desc())
        .limit(20)
        .all()
    )
    for report in report_rows:
        fund = db.get(Fund, report.fund_id) if report.fund_id else None
        upcoming_reports.append(
            {
                "id": report.id,
                "report_target": report.report_target,
                "fund_id": report.fund_id,
                "fund_name": fund.name if fund else None,
                "period": report.period,
                "due_date": report.due_date.isoformat() if report.due_date else None,
                "status": report.status,
                "days_remaining": (report.due_date - today).days if report.due_date else None,
                "task_id": None,
            }
        )

    report_tasks = (
        db.query(Task)
        .filter(
            Task.is_report == True,
            Task.status.in_(["pending", "in_progress"]),
            Task.deadline.isnot(None),
            func.date(Task.deadline) <= today + timedelta(days=7),
        )
        .order_by(Task.deadline.asc(), Task.id.desc())
        .limit(20)
        .all()
    )
    for task in report_tasks:
        deadline_date = task.deadline.date() if isinstance(task.deadline, datetime) else task.deadline
        if deadline_date is None:
            continue
        task_payload = _task_response(db, task)
        upcoming_reports.append(
            {
                "id": -task.id,
                "report_target": task.title,
                "fund_id": task_payload.fund_id,
                "fund_name": task_payload.fund_name,
                "period": "업무",
                "due_date": deadline_date.isoformat(),
                "status": task.status,
                "days_remaining": (deadline_date - today).days,
                "task_id": task.id,
            }
        )
    upcoming_reports.sort(key=lambda row: (row["days_remaining"] if row["days_remaining"] is not None else 999, row["due_date"] or "9999-12-31"))
    upcoming_reports = upcoming_reports[:20]

    completed_today = (
        db.query(Task)
        .filter(
            Task.status == "completed",
            Task.completed_at.isnot(None),
            func.date(Task.completed_at) == today,
        )
        .order_by(Task.completed_at.desc())
        .all()
    )
    completed_this_week = (
        db.query(Task)
        .filter(
            Task.status == "completed",
            Task.completed_at.isnot(None),
            func.date(Task.completed_at) >= week_start,
            func.date(Task.completed_at) <= week_end,
        )
        .order_by(Task.completed_at.desc())
        .all()
    )
    last_week_start = week_start - timedelta(days=7)
    completed_last_week = (
        db.query(Task)
        .filter(
            Task.status == "completed",
            Task.completed_at.isnot(None),
            func.date(Task.completed_at) >= last_week_start,
            func.date(Task.completed_at) < week_start,
        )
        .order_by(Task.completed_at.desc())
        .all()
    )

    return {
        "date": today.isoformat(),
        "day_of_week": WEEKDAYS[today.weekday()],
        "monthly_reminder": monthly_reminder,
        "today": {"tasks": today_tasks, "total_estimated_time": _sum_time(today_tasks)},
        "tomorrow": {"tasks": tomorrow_tasks, "total_estimated_time": _sum_time(tomorrow_tasks)},
        "this_week": week_tasks,
        "upcoming": upcoming_tasks,
        "no_deadline": no_deadline_tasks,
        "active_workflows": active_workflows,
        "fund_summary": fund_summary,
        "missing_documents": missing_documents,
        "upcoming_reports": upcoming_reports,
        "completed_today": [_task_response(db, task) for task in completed_today],
        "completed_this_week": [_task_response(db, task) for task in completed_this_week],
        "completed_last_week": [_task_response(db, task) for task in completed_last_week],
        "completed_today_count": len(completed_today),
        "completed_this_week_count": len(completed_this_week),
    }


@router.get("/upcoming-notices", response_model=list[UpcomingNoticeItem])
def upcoming_notices(days: int = 30, db: Session = Depends(get_db)):
    today = date.today()
    horizon = today + timedelta(days=max(0, days))

    active_instances = db.query(WorkflowInstance).filter(WorkflowInstance.status == "active").all()

    notice_cache: dict[int, dict[str, FundNoticePeriod]] = {}
    fund_name_cache: dict[int, str] = {}
    results: list[dict] = []

    for instance in active_instances:
        fund_id = instance.fund_id
        if fund_id is None and instance.investment_id is not None:
            investment = db.get(Investment, instance.investment_id)
            if investment:
                fund_id = investment.fund_id
        if fund_id is None:
            continue

        if fund_id not in notice_cache:
            rows = db.query(FundNoticePeriod).filter(FundNoticePeriod.fund_id == fund_id).all()
            notice_cache[fund_id] = {row.notice_type.lower(): row for row in rows}

        notice_map = notice_cache[fund_id]
        if not notice_map:
            continue

        if fund_id not in fund_name_cache:
            fund = db.get(Fund, fund_id)
            fund_name_cache[fund_id] = fund.name if fund else f"조합 #{fund_id}"
        fund_name = fund_name_cache[fund_id]

        for step_instance in instance.step_instances:
            if step_instance.status in ("completed", "skipped"):
                continue
            if step_instance.calculated_date is None:
                continue

            deadline = step_instance.calculated_date
            if deadline < today or deadline > horizon:
                continue

            step_name = step_instance.step.name if step_instance.step else ""
            step_timing = step_instance.step.timing if step_instance.step else ""
            matched_notice_type = _match_notice_type(step_name, step_timing, notice_map)
            if not matched_notice_type:
                continue

            notice = notice_map[matched_notice_type]
            results.append(
                {
                    "fund_name": fund_name,
                    "notice_label": notice.label,
                    "deadline": deadline.isoformat(),
                    "days_remaining": (deadline - today).days,
                    "workflow_instance_name": instance.name,
                    "workflow_instance_id": instance.id,
                    "task_id": None,
                }
            )

    notice_tasks = (
        db.query(Task)
        .filter(
            Task.is_notice == True,
            Task.status.in_(["pending", "in_progress"]),
            Task.deadline.isnot(None),
            func.date(Task.deadline) >= today,
            func.date(Task.deadline) <= horizon,
        )
        .order_by(Task.deadline.asc(), Task.id.desc())
        .all()
    )
    for task in notice_tasks:
        deadline = task.deadline.date() if isinstance(task.deadline, datetime) else task.deadline
        if deadline is None:
            continue
        task_payload = _task_response(db, task)
        results.append(
            {
                "fund_name": task_payload.fund_name or task_payload.gp_entity_name or "업무",
                "notice_label": task.title,
                "deadline": deadline.isoformat(),
                "days_remaining": (deadline - today).days,
                "workflow_instance_name": "업무",
                "workflow_instance_id": task.workflow_instance_id,
                "task_id": task.id,
            }
        )

    results.sort(key=lambda row: (row["deadline"], row["fund_name"], row["notice_label"]))
    return results


def _sum_time(tasks: list[TaskResponse]) -> str:
    total_minutes = 0
    for task in tasks:
        total_minutes += _parse_time_to_minutes(task.estimated_time)

    if total_minutes == 0:
        return "0m"

    hours = total_minutes // 60
    mins = total_minutes % 60

    if hours and mins:
        return f"{hours}h {mins}m"
    if hours:
        return f"{hours}h"
    return f"{mins}m"


def _parse_time_to_minutes(value: str | None) -> int:
    if not value:
        return 0

    total = 0
    normalized = value.split("~")[0] if "~" in value else value

    h_match = re.search(r"(\d+)h", normalized)
    m_match = re.search(r"(\d+)m", normalized)
    d_match = re.search(r"(\d+)d", normalized)

    if h_match:
        total += int(h_match.group(1)) * 60
    if m_match:
        total += int(m_match.group(1))
    if d_match:
        total += int(d_match.group(1)) * 480

    return total
