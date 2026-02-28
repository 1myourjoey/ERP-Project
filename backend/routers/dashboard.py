import re
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
from models.biz_report import BizReport, BizReportRequest
from models.compliance import ComplianceObligation, ComplianceRule
from models.fee import ManagementFee
from models.fund import Fund, FundNoticePeriod
from models.gp_entity import GPEntity
from models.investment import Investment, InvestmentDocument, PortfolioCompany
from models.internal_review import InternalReview
from models.investment_review import InvestmentReview
from models.phase3 import CapitalCallDetail, CapitalCallItem
from models.regular_report import RegularReport
from models.task import Task
from models.valuation import Valuation
from models.workflow_instance import WorkflowInstance
from schemas.dashboard import (
    DashboardBaseResponse,
    DashboardCompletedResponse,
    DashboardSidebarResponse,
    DashboardTodayResponse,
    DashboardWorkflowsResponse,
    UpcomingNoticeItem,
)
from schemas.task import TaskResponse
from services.workflow_service import reconcile_workflow_instance_state

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
MONTHLY_REMINDER_TITLES = (
    "?띻툑???붾낫怨?({year_month})",
    "踰ㅼ쿂?묓쉶 VICS ?붾낫怨?({year_month})",
)
DOC_STATUS_COLUMNS = [
    "doc_financial_statement",
    "doc_biz_registration",
    "doc_shareholder_list",
    "doc_corp_registry",
    "doc_insurance_cert",
    "doc_credit_report",
    "doc_other_changes",
]
PRIORITY_URGENCY_RANK = {
    "overdue": 0,
    "today": 1,
    "tomorrow": 2,
    "this_week": 3,
    "upcoming": 4,
}


def _quarter_label(target: date) -> str:
    quarter = ((target.month - 1) // 3) + 1
    return f"{target.year}-Q{quarter}"


def _report_quarter(report: BizReport) -> int:
    base = report.created_at.date() if report.created_at else date.today()
    return ((base.month - 1) // 3) + 1


def _request_received_count(row: BizReportRequest) -> int:
    received = 0
    for column in DOC_STATUS_COLUMNS:
        status = getattr(row, column, None)
        if status in {"received", "verified"}:
            received += 1
    return received


def _internal_review_due_date(review: InternalReview) -> date:
    quarter_end_map = {
        1: date(review.year, 3, 31),
        2: date(review.year, 6, 30),
        3: date(review.year, 9, 30),
    }
    quarter_end = quarter_end_map.get(review.quarter, date(review.year, 12, 31))
    # Quarter-end review is due by the end of the following month.
    return quarter_end + timedelta(days=31)


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
    week_start = target - timedelta(days=target.weekday())
    week_end = week_start + timedelta(days=6)
    return week_start, week_end


def _task_deadline_value(task: Task) -> date | None:
    if task.deadline is None:
        return None
    if isinstance(task.deadline, datetime):
        return task.deadline.date()
    return task.deadline


def _classify_task_urgency(
    deadline: date | None,
    *,
    today: date,
    tomorrow: date,
    week_end: date,
) -> tuple[str, int | None]:
    if deadline is None:
        return ("upcoming", None)
    if deadline < today:
        return ("overdue", (deadline - today).days)
    if deadline == today:
        return ("today", 0)
    if deadline == tomorrow:
        return ("tomorrow", 1)
    if deadline <= week_end:
        return ("this_week", (deadline - today).days)
    return ("upcoming", (deadline - today).days)


def _normalize_task_source(task: Task) -> str:
    source = (task.source or "").strip().lower()
    if source in {"workflow", "compliance", "manual"}:
        return source
    if task.obligation_id is not None:
        return "compliance"
    if task.workflow_instance_id is not None:
        return "workflow"
    return "manual"


def _build_workflow_priority_info(
    db: Session,
    task: Task,
    lookup_context: dict[str, dict[int, object]],
) -> dict | None:
    if task.workflow_instance_id is None:
        return None

    instance_map = lookup_context.get("instances", {})
    instance = instance_map.get(task.workflow_instance_id) if instance_map else None
    if instance is None:
        instance = db.get(WorkflowInstance, task.workflow_instance_id)
    if instance is None:
        return None

    ordered_steps = sorted(instance.step_instances, key=_step_instance_order_key)
    if not ordered_steps:
        return {
            "name": instance.name,
            "step": "0/0",
            "step_name": "-",
        }

    current_step = next(
        (row for row in ordered_steps if row.status in ("in_progress", "pending")),
        ordered_steps[-1],
    )
    total_steps = len(ordered_steps)
    step_order = 1
    if current_step and current_step.step and current_step.step.order is not None:
        step_order = int(current_step.step.order)
    step_order = max(1, min(step_order, total_steps))
    step_name = current_step.step.name if current_step and current_step.step else "-"

    return {
        "name": instance.name,
        "step": f"{step_order}/{total_steps}",
        "step_name": step_name,
    }


def _build_prioritized_tasks(
    db: Session,
    *,
    today: date,
    tomorrow: date,
    week_end: date,
    tasks: list[Task],
    lookup_context: dict[str, dict[int, object]],
) -> list[dict]:
    sorted_payload: list[tuple[tuple, dict]] = []
    source_rank = {"workflow": 0, "compliance": 1, "manual": 2}

    for task in tasks:
        task_resp = _task_response(db, task, lookup_context)
        deadline = _task_deadline_value(task)
        urgency, d_day = _classify_task_urgency(
            deadline,
            today=today,
            tomorrow=tomorrow,
            week_end=week_end,
        )
        workflow_info = _build_workflow_priority_info(db, task, lookup_context)
        source = _normalize_task_source(task)
        deadline_order = d_day if d_day is not None else 10**6
        sort_key = (
            PRIORITY_URGENCY_RANK.get(urgency, 99),
            deadline_order,
            source_rank.get(source, 9),
            0 if workflow_info else 1,
            (task.deadline.isoformat() if task.deadline else "9999-12-31"),
            task.id,
        )
        sorted_payload.append(
            (
                sort_key,
                {
                    "task": task_resp,
                    "urgency": urgency,
                    "d_day": d_day,
                    "workflow_info": workflow_info,
                    "source": source,
                },
            )
        )

    sorted_payload.sort(key=lambda row: row[0])
    return [row[1] for row in sorted_payload]


def _step_instance_order_key(step_instance) -> tuple[int, int]:
    step_order = (
        step_instance.step.order
        if step_instance.step and step_instance.step.order is not None
        else 10**9
    )
    return (step_order, step_instance.id or 0)


def _build_task_lookup_context(db: Session, tasks: list[Task]) -> dict[str, dict[int, object]]:
    investment_ids = {row.investment_id for row in tasks if row.investment_id is not None}
    workflow_instance_ids = {row.workflow_instance_id for row in tasks if row.workflow_instance_id is not None}
    fund_ids = {row.fund_id for row in tasks if row.fund_id is not None}
    gp_entity_ids = {row.gp_entity_id for row in tasks if row.gp_entity_id is not None}
    company_ids: set[int] = set()

    investments: list[Investment] = []
    if investment_ids:
        investments = db.query(Investment).filter(Investment.id.in_(investment_ids)).all()
        fund_ids.update(row.fund_id for row in investments if row.fund_id is not None)
        company_ids.update(row.company_id for row in investments if row.company_id is not None)

    instances: list[WorkflowInstance] = []
    if workflow_instance_ids:
        instances = db.query(WorkflowInstance).filter(WorkflowInstance.id.in_(workflow_instance_ids)).all()
        fund_ids.update(row.fund_id for row in instances if row.fund_id is not None)
        gp_entity_ids.update(row.gp_entity_id for row in instances if row.gp_entity_id is not None)
        company_ids.update(row.company_id for row in instances if row.company_id is not None)

    funds: list[Fund] = []
    if fund_ids:
        funds = db.query(Fund).filter(Fund.id.in_(fund_ids)).all()

    gp_entities: list[GPEntity] = []
    if gp_entity_ids:
        gp_entities = db.query(GPEntity).filter(GPEntity.id.in_(gp_entity_ids)).all()

    companies: list[PortfolioCompany] = []
    if company_ids:
        companies = db.query(PortfolioCompany).filter(PortfolioCompany.id.in_(company_ids)).all()

    return {
        "investments": {row.id: row for row in investments},
        "instances": {row.id: row for row in instances},
        "funds": {row.id: row for row in funds},
        "gp_entities": {row.id: row for row in gp_entities},
        "companies": {row.id: row for row in companies},
    }


def _task_response(
    db: Session,
    task: Task,
    lookup_context: dict[str, dict[int, object]] | None = None,
) -> TaskResponse:
    context = lookup_context or {}
    investment_by_id: dict[int, Investment] = context.get("investments", {})  # type: ignore[assignment]
    instance_by_id: dict[int, WorkflowInstance] = context.get("instances", {})  # type: ignore[assignment]
    fund_by_id: dict[int, Fund] = context.get("funds", {})  # type: ignore[assignment]
    gp_entity_by_id: dict[int, GPEntity] = context.get("gp_entities", {})  # type: ignore[assignment]
    company_by_id: dict[int, PortfolioCompany] = context.get("companies", {})  # type: ignore[assignment]

    payload = TaskResponse.model_validate(task).model_dump()

    investment = None
    if task.investment_id:
        investment = investment_by_id.get(task.investment_id) or db.get(Investment, task.investment_id)

    fund_id = task.fund_id or (investment.fund_id if investment else None)
    gp_entity_id = task.gp_entity_id

    fund_name = None
    if fund_id:
        fund = fund_by_id.get(fund_id) or db.get(Fund, fund_id)
        fund_name = fund.name if fund else None

    gp_entity_name = None
    if gp_entity_id:
        gp_entity = gp_entity_by_id.get(gp_entity_id) or db.get(GPEntity, gp_entity_id)
        gp_entity_name = gp_entity.name if gp_entity else None

    company_name = None
    if investment:
        company = company_by_id.get(investment.company_id) or db.get(PortfolioCompany, investment.company_id)
        company_name = company.name if company else None

    if (not fund_name or not company_name or not gp_entity_name) and task.workflow_instance_id:
        instance = (
            instance_by_id.get(task.workflow_instance_id)
            or db.get(WorkflowInstance, task.workflow_instance_id)
        )
        if instance:
            if not fund_name and instance.fund_id:
                wf_fund = fund_by_id.get(instance.fund_id) or db.get(Fund, instance.fund_id)
                fund_name = wf_fund.name if wf_fund else None
                if fund_id is None:
                    fund_id = instance.fund_id
            if not gp_entity_name and instance.gp_entity_id:
                gp_entity = (
                    gp_entity_by_id.get(instance.gp_entity_id)
                    or db.get(GPEntity, instance.gp_entity_id)
                )
                gp_entity_name = gp_entity.name if gp_entity else None
                if gp_entity_id is None:
                    gp_entity_id = instance.gp_entity_id
            if not company_name and instance.company_id:
                wf_company = (
                    company_by_id.get(instance.company_id)
                    or db.get(PortfolioCompany, instance.company_id)
                )
                company_name = wf_company.name if wf_company else None

    payload["fund_id"] = fund_id
    payload["gp_entity_id"] = gp_entity_id
    payload["fund_name"] = fund_name or gp_entity_name
    payload["gp_entity_name"] = gp_entity_name
    payload["company_name"] = company_name
    return TaskResponse(**payload)


def _sync_workflow_state(db: Session) -> None:
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
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise


def _dashboard_base_payload(db: Session, today: date) -> dict:
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

    _sync_workflow_state(db)

    try:
        investment_review_active_count = int(
            db.query(func.count(InvestmentReview.id))
            .filter(InvestmentReview.status.notin_(["완료", "중단"]))
            .scalar()
            or 0
        )
    except Exception:
        investment_review_active_count = 0

    total_nav = 0.0
    try:
        valuation_rows = (
            db.query(Valuation)
            .order_by(Valuation.as_of_date.desc(), Valuation.id.desc())
            .all()
        )
        latest_by_investment: dict[int, Valuation] = {}
        for row in valuation_rows:
            if row.investment_id not in latest_by_investment:
                latest_by_investment[row.investment_id] = row
        total_nav = sum(
            float(row.total_fair_value or row.value or 0)
            for row in latest_by_investment.values()
        )
    except Exception:
        total_nav = 0.0

    unpaid_lp_count = 0
    try:
        unpaid_lp_ids = {
            row.lp_id
            for row in db.query(CapitalCallDetail)
            .filter(
                (CapitalCallDetail.status != "완납")
                | (CapitalCallDetail.paid_amount < CapitalCallDetail.call_amount)
            )
            .all()
            if row.lp_id is not None
        }
        unpaid_lp_count = len(unpaid_lp_ids)
    except Exception:
        try:
            unpaid_lp_ids = {
                row.lp_id
                for row in db.query(CapitalCallItem).filter(CapitalCallItem.paid == 0).all()
                if row.lp_id is not None
            }
            unpaid_lp_count = len(unpaid_lp_ids)
        except Exception:
            unpaid_lp_count = 0

    pending_fee_count = 0
    try:
        pending_fee_count = int(
            db.query(func.count(ManagementFee.id))
            .filter(ManagementFee.status != "수령")
            .scalar()
            or 0
        )
    except Exception:
        pending_fee_count = 0

    biz_report_in_progress_count = 0
    try:
        biz_report_in_progress_count = int(
            db.query(func.count(BizReport.id))
            .filter(BizReport.status.notin_(["완료", "확인완료", "전송완료"]))
            .scalar()
            or 0
        )
    except Exception:
        biz_report_in_progress_count = 0

    pending_tasks = (
        db.query(Task)
        .filter(Task.status.in_(["pending", "in_progress"]))
        .order_by(Task.deadline.asc().nullslast())
        .all()
    )
    pending_task_context = _build_task_lookup_context(db, pending_tasks)

    today_tasks: list[TaskResponse] = []
    tomorrow_tasks: list[TaskResponse] = []
    week_tasks: list[TaskResponse] = []
    upcoming_tasks: list[TaskResponse] = []
    no_deadline_tasks: list[TaskResponse] = []

    for task in pending_tasks:
        task_resp = _task_response(db, task, pending_task_context)
        deadline = task.deadline.date() if isinstance(task.deadline, datetime) else task.deadline
        if deadline is None:
            no_deadline_tasks.append(task_resp)
            continue

        if deadline <= today:
            today_tasks.append(task_resp)
        elif deadline == tomorrow:
            tomorrow_tasks.append(task_resp)
        elif week_end < deadline <= upcoming_end:
            upcoming_tasks.append(task_resp)

        if week_start <= deadline <= week_end and task_resp not in week_tasks:
            week_tasks.append(task_resp)

        if task.memo:
            memo_dates = _parse_memo_dates(task.memo, today.year)
            for memo_date in memo_dates:
                if week_start <= memo_date <= week_end and task_resp not in week_tasks:
                    week_tasks.append(task_resp)
                    break

    prioritized_tasks = _build_prioritized_tasks(
        db,
        today=today,
        tomorrow=tomorrow,
        week_end=week_end,
        tasks=pending_tasks,
        lookup_context=pending_task_context,
    )

    compliance_summary = {
        "overdue_count": 0,
        "due_this_week": 0,
        "due_this_month": 0,
    }
    try:
        if today.month == 12:
            month_end = date(today.year, 12, 31)
        else:
            month_end = date(today.year, today.month + 1, 1) - timedelta(days=1)

        active_obligation_query = db.query(ComplianceObligation).filter(
            ComplianceObligation.status.notin_(["completed", "waived"])
        )
        compliance_summary["overdue_count"] = int(
            active_obligation_query
            .filter(ComplianceObligation.due_date < today)
            .count()
        )
        compliance_summary["due_this_week"] = int(
            active_obligation_query
            .filter(ComplianceObligation.due_date >= today, ComplianceObligation.due_date <= week_end)
            .count()
        )
        compliance_summary["due_this_month"] = int(
            active_obligation_query
            .filter(ComplianceObligation.due_date >= today, ComplianceObligation.due_date <= month_end)
            .count()
        )
    except Exception:
        compliance_summary = {"overdue_count": 0, "due_this_week": 0, "due_this_month": 0}

    current_quarter_num = ((today.month - 1) // 3) + 1
    doc_collection_summary = {
        "current_quarter": _quarter_label(today),
        "completion_pct": 0.0,
        "pending_companies": 0,
    }
    try:
        quarter_reports = [
            row
            for row in db.query(BizReport)
            .filter(BizReport.report_year == today.year)
            .order_by(BizReport.created_at.desc(), BizReport.id.desc())
            .all()
            if _report_quarter(row) == current_quarter_num
        ]
        report_ids = [row.id for row in quarter_reports]
        if report_ids:
            request_rows = (
                db.query(BizReportRequest)
                .filter(BizReportRequest.biz_report_id.in_(report_ids))
                .all()
            )
            total_companies = len(request_rows)
            completed_companies = sum(1 for row in request_rows if _request_received_count(row) >= len(DOC_STATUS_COLUMNS))
            pending_companies = max(0, total_companies - completed_companies)
            completion_pct = round((completed_companies / total_companies * 100), 1) if total_companies else 0.0
            doc_collection_summary = {
                "current_quarter": _quarter_label(today),
                "completion_pct": completion_pct,
                "pending_companies": pending_companies,
            }
    except Exception:
        doc_collection_summary = {
            "current_quarter": _quarter_label(today),
            "completion_pct": 0.0,
            "pending_companies": 0,
        }

    urgent_alerts: list[dict] = []
    try:
        overdue_rows = (
            db.query(ComplianceObligation)
            .filter(
                ComplianceObligation.status.notin_(["completed", "waived"]),
                ComplianceObligation.due_date < today,
            )
            .order_by(ComplianceObligation.due_date.asc(), ComplianceObligation.id.asc())
            .limit(5)
            .all()
        )
        for row in overdue_rows:
            rule = db.get(ComplianceRule, row.rule_id)
            fund = db.get(Fund, row.fund_id)
            overdue_days = (today - row.due_date).days if row.due_date else 0
            urgent_alerts.append(
                {
                    "type": "overdue",
                    "message": f"{(rule.rule_code if rule else '의무')} ({fund.name if fund else f'Fund #{row.fund_id}'}) D+{overdue_days} 기한 초과",
                    "due_date": row.due_date.isoformat() if row.due_date else None,
                }
            )
    except Exception:
        pass

    try:
        adhoc_tasks = (
            db.query(Task)
            .filter(
                Task.status.in_(["pending", "in_progress"]),
                Task.deadline.isnot(None),
                or_(Task.title.like("%수시%"), Task.category.like("%수시%")),
            )
            .order_by(Task.deadline.asc(), Task.id.asc())
            .limit(5)
            .all()
        )
        for task in adhoc_tasks:
            deadline = task.deadline.date() if isinstance(task.deadline, datetime) else task.deadline
            if deadline is None:
                continue
            urgent_alerts.append(
                {
                    "type": "adhoc",
                    "message": f"수시보고: {task.title} 마감 {deadline.strftime('%m/%d')}",
                    "due_date": deadline.isoformat(),
                }
            )
    except Exception:
        pass

    try:
        overdue_reviews = (
            db.query(InternalReview)
            .filter(InternalReview.status != "completed")
            .order_by(InternalReview.year.asc(), InternalReview.quarter.asc(), InternalReview.id.asc())
            .all()
        )
        for review in overdue_reviews:
            due_date = _internal_review_due_date(review)
            if due_date >= today:
                continue
            fund = db.get(Fund, review.fund_id)
            overdue_days = (today - due_date).days
            quarter_label = f"{review.quarter}Q{str(review.year)[-2:]}"
            urgent_alerts.append(
                {
                    "type": "internal_review",
                    "message": f"내부보고회 ({fund.name if fund else f'Fund #{review.fund_id}'}) {quarter_label} 미완료 D+{overdue_days}",
                    "due_date": due_date.isoformat(),
                }
            )
            if len(urgent_alerts) >= 12:
                break
    except Exception:
        pass

    return {
        "monthly_reminder": monthly_reminder,
        "investment_review_active_count": investment_review_active_count,
        "total_nav": total_nav,
        "unpaid_lp_count": unpaid_lp_count,
        "pending_fee_count": pending_fee_count,
        "biz_report_in_progress_count": biz_report_in_progress_count,
        "today": {"tasks": today_tasks, "total_estimated_time": _sum_time(today_tasks)},
        "tomorrow": {"tasks": tomorrow_tasks, "total_estimated_time": _sum_time(tomorrow_tasks)},
        "this_week": week_tasks,
        "upcoming": upcoming_tasks,
        "no_deadline": no_deadline_tasks,
        "prioritized_tasks": prioritized_tasks,
        "compliance": compliance_summary,
        "doc_collection": doc_collection_summary,
        "urgent_alerts": urgent_alerts[:12],
    }


def _dashboard_workflows_payload(db: Session) -> dict:
    active_instances = db.query(WorkflowInstance).filter(WorkflowInstance.status == "active").all()
    active_workflows: list[dict] = []

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

    return {"active_workflows": active_workflows}


def _dashboard_sidebar_payload(db: Session, today: date) -> dict:
    fund_summary: list[dict] = []
    funds = db.query(Fund).order_by(Fund.id.desc()).all()
    for fund in funds:
        investment_count = db.query(Investment).filter(Investment.fund_id == fund.id).count()
        compliance_overdue = int(
            db.query(func.count(ComplianceObligation.id))
            .filter(
                ComplianceObligation.fund_id == fund.id,
                ComplianceObligation.status.notin_(["completed", "waived"]),
                ComplianceObligation.due_date < today,
            )
            .scalar()
            or 0
        )

        latest_report = (
            db.query(BizReport)
            .filter(BizReport.fund_id == fund.id)
            .order_by(BizReport.created_at.desc(), BizReport.id.desc())
            .first()
        )
        doc_collection_progress = None
        if latest_report:
            report_requests = (
                db.query(BizReportRequest)
                .filter(BizReportRequest.biz_report_id == latest_report.id)
                .all()
            )
            if report_requests:
                completed = sum(
                    1 for row in report_requests if _request_received_count(row) >= len(DOC_STATUS_COLUMNS)
                )
                doc_collection_progress = f"{completed}/{len(report_requests)}"
            else:
                doc_collection_progress = "0/0"

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
                "compliance_overdue": compliance_overdue,
                "doc_collection_progress": doc_collection_progress,
            }
        )

    missing_documents: list[dict] = []
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

    submitted_statuses = ["제출완료", "전송완료", "submitted", "sent"]
    upcoming_reports: list[dict] = []
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
                "source_label": "[조합규약]",
            }
        )

    active_instances = db.query(WorkflowInstance).filter(WorkflowInstance.status == "active").all()
    for instance in active_instances:
        fund_name = None
        if instance.fund_id is not None:
            fund = db.get(Fund, instance.fund_id)
            fund_name = fund.name if fund else None
        if fund_name is None and instance.gp_entity_id is not None:
            gp_entity = db.get(GPEntity, instance.gp_entity_id)
            fund_name = gp_entity.name if gp_entity else None

        for step_instance in instance.step_instances:
            if step_instance.status in ("completed", "skipped"):
                continue
            if not step_instance.step or not step_instance.step.is_report:
                continue
            if step_instance.calculated_date is None:
                continue
            if step_instance.calculated_date > today + timedelta(days=7):
                continue

            upcoming_reports.append(
                {
                    "id": -1_000_000 - step_instance.id,
                    "report_target": step_instance.step.name or "워크플로 보고 단계",
                    "fund_id": instance.fund_id,
                    "fund_name": fund_name,
                    "period": "워크플로 단계",
                    "due_date": step_instance.calculated_date.isoformat(),
                    "status": step_instance.status,
                    "days_remaining": (step_instance.calculated_date - today).days,
                    "task_id": step_instance.task_id,
                    "source_label": "[워크플로]",
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
    report_task_context = _build_task_lookup_context(db, report_tasks)
    for task in report_tasks:
        deadline_date = task.deadline.date() if isinstance(task.deadline, datetime) else task.deadline
        if deadline_date is None:
            continue
        task_payload = _task_response(db, task, report_task_context)
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
                "source_label": "[업무]",
            }
        )
    upcoming_reports.sort(
        key=lambda row: (
            row["days_remaining"] if row["days_remaining"] is not None else 999,
            row["due_date"] or "9999-12-31",
        )
    )

    return {
        "fund_summary": fund_summary,
        "missing_documents": missing_documents,
        "upcoming_reports": upcoming_reports[:20],
    }


def _dashboard_completed_payload(db: Session, today: date) -> dict:
    week_start, week_end = _dashboard_week_bounds(today)

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
    completed_context = _build_task_lookup_context(
        db,
        [*completed_today, *completed_this_week, *completed_last_week],
    )

    return {
        "completed_today": [_task_response(db, task, completed_context) for task in completed_today],
        "completed_this_week": [_task_response(db, task, completed_context) for task in completed_this_week],
        "completed_last_week": [_task_response(db, task, completed_context) for task in completed_last_week],
        "completed_today_count": len(completed_today),
        "completed_this_week_count": len(completed_this_week),
    }


@router.get("/base", response_model=DashboardBaseResponse)
def get_dashboard_base(db: Session = Depends(get_db)):
    today = date.today()
    return {
        "date": today.isoformat(),
        "day_of_week": WEEKDAYS[today.weekday()],
        **_dashboard_base_payload(db, today),
    }


@router.get("/workflows", response_model=DashboardWorkflowsResponse)
def get_dashboard_workflows(db: Session = Depends(get_db)):
    return _dashboard_workflows_payload(db)


@router.get("/sidebar", response_model=DashboardSidebarResponse)
def get_dashboard_sidebar(db: Session = Depends(get_db)):
    today = date.today()
    return _dashboard_sidebar_payload(db, today)


@router.get("/completed", response_model=DashboardCompletedResponse)
def get_dashboard_completed(db: Session = Depends(get_db)):
    today = date.today()
    return _dashboard_completed_payload(db, today)


@router.get("/today", response_model=DashboardTodayResponse)
def get_today_dashboard(db: Session = Depends(get_db)):
    today = date.today()
    return {
        "date": today.isoformat(),
        "day_of_week": WEEKDAYS[today.weekday()],
        **_dashboard_base_payload(db, today),
        **_dashboard_workflows_payload(db),
        **_dashboard_sidebar_payload(db, today),
        **_dashboard_completed_payload(db, today),
    }


@router.get("/upcoming-notices", response_model=list[UpcomingNoticeItem])
def upcoming_notices(days: int = 30, db: Session = Depends(get_db)):
    today = date.today()
    horizon = today + timedelta(days=max(0, days))

    active_instances = db.query(WorkflowInstance).filter(WorkflowInstance.status == "active").all()

    notice_cache: dict[int, dict[str, FundNoticePeriod]] = {}
    fund_name_cache: dict[int, str] = {}
    results: list[dict] = []
    seen_keys: set[tuple] = set()

    def append_notice(row: dict) -> None:
        key = (
            row.get("source_label"),
            row.get("workflow_instance_id"),
            row.get("task_id"),
            row.get("deadline"),
            row.get("notice_label"),
        )
        if key in seen_keys:
            return
        seen_keys.add(key)
        results.append(row)

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

        if fund_id not in fund_name_cache:
            fund = db.get(Fund, fund_id)
            fund_name_cache[fund_id] = fund.name if fund else f"Fund #{fund_id}"
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

            if notice_map:
                matched_notice_type = _match_notice_type(step_name, step_timing, notice_map)
                if matched_notice_type:
                    notice = notice_map[matched_notice_type]
                    append_notice(
                        {
                            "fund_name": fund_name,
                            "notice_label": notice.label,
                            "deadline": deadline.isoformat(),
                            "days_remaining": (deadline - today).days,
                            "workflow_instance_name": instance.name,
                            "workflow_instance_id": instance.id,
                            "task_id": None,
                            "source_label": "[조합규약]",
                        }
                    )

            if not step_instance.step or not step_instance.step.is_notice:
                continue

            append_notice(
                {
                    "fund_name": fund_name,
                    "notice_label": step_name or "통지 단계",
                    "deadline": deadline.isoformat(),
                    "days_remaining": (deadline - today).days,
                    "workflow_instance_name": instance.name,
                    "workflow_instance_id": instance.id,
                    "task_id": step_instance.task_id,
                    "source_label": "[워크플로]",
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
    notice_task_context = _build_task_lookup_context(db, notice_tasks)
    for task in notice_tasks:
        deadline = task.deadline.date() if isinstance(task.deadline, datetime) else task.deadline
        if deadline is None:
            continue
        task_payload = _task_response(db, task, notice_task_context)
        append_notice(
            {
                "fund_name": task_payload.fund_name or task_payload.gp_entity_name or "업무",
                "notice_label": task.title,
                "deadline": deadline.isoformat(),
                "days_remaining": (deadline - today).days,
                "workflow_instance_name": "업무",
                "workflow_instance_id": task.workflow_instance_id,
                "task_id": task.id,
                "source_label": "[업무]",
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
