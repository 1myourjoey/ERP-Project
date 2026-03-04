from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from models.accounting import JournalEntry
from models.compliance import ComplianceCheck, ComplianceObligation
from models.fund import Fund
from models.investment import InvestmentDocument
from models.investment_review import InvestmentReview
from models.phase3 import CapitalCall, CapitalCallDetail
from models.regular_report import RegularReport
from models.task import Task
from models.valuation import Valuation


def _to_date(value: date | datetime | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    return value


def _severity(score: int) -> str:
    if score >= 90:
        return "good"
    if score >= 70:
        return "warning"
    return "danger"


def _clamp_score(value: int) -> int:
    return max(0, min(100, int(value)))


def calc_task_score(db: Session, today: date) -> dict[str, Any]:
    week_end = today + timedelta(days=6)
    open_tasks = db.query(Task).filter(Task.status.in_(["pending", "in_progress"])).all()

    overdue_count = 0
    today_due_count = 0
    week_due_count = 0
    stale_count = 0

    stale_cutoff = datetime.combine(today - timedelta(days=3), datetime.min.time())
    for task in open_tasks:
        deadline = _to_date(task.deadline)
        if deadline is not None:
            if deadline < today:
                overdue_count += 1
            elif deadline == today:
                today_due_count += 1
            elif deadline <= week_end:
                week_due_count += 1

        if task.status == "pending" and task.created_at and task.created_at <= stale_cutoff:
            stale_count += 1

    score = 100 - (overdue_count * 12) - (today_due_count * 5) - (week_due_count * 2) - (stale_count * 3)
    score = _clamp_score(score)

    if overdue_count > 0:
        label = f"지연 {overdue_count}건"
    elif today_due_count > 0:
        label = f"오늘 {today_due_count}건"
    else:
        label = f"대기 {len(open_tasks)}건"

    return {
        "score": score,
        "factors": {
            "overdue_count": overdue_count,
            "today_due_count": today_due_count,
            "week_due_count": week_due_count,
            "stale_count": stale_count,
        },
        "label": label,
        "severity": _severity(score),
    }


def calc_fund_score(db: Session, today: date) -> dict[str, Any]:
    active_count = int(
        db.query(func.count(Fund.id))
        .filter(func.lower(func.coalesce(Fund.status, "")) == "active")
        .scalar()
        or 0
    )

    unpaid_lp_ids = {
        row.lp_id
        for row in db.query(CapitalCallDetail).filter(
            or_(
                CapitalCallDetail.status != "완납",
                CapitalCallDetail.paid_amount < CapitalCallDetail.call_amount,
            )
        ).all()
        if row.lp_id is not None
    }
    unpaid_lp_count = len(unpaid_lp_ids)

    capital_call_overdue_count = int(
        db.query(func.count(CapitalCallDetail.id))
        .join(CapitalCall, CapitalCall.id == CapitalCallDetail.capital_call_id)
        .filter(
            CapitalCall.call_date < today,
            or_(
                CapitalCallDetail.status != "완납",
                CapitalCallDetail.paid_amount < CapitalCallDetail.call_amount,
            ),
        )
        .scalar()
        or 0
    )

    latest_valuation_date = db.query(func.max(Valuation.as_of_date)).scalar()
    nav_stale = bool(latest_valuation_date and (today - latest_valuation_date).days > 30)

    score = 100 - (unpaid_lp_count * 8) - (capital_call_overdue_count * 10) - (15 if nav_stale else 0)
    score = _clamp_score(score)

    if unpaid_lp_count > 0:
        label = f"미납 {unpaid_lp_count}건"
    else:
        label = f"활성 {active_count}개"

    return {
        "score": score,
        "factors": {
            "active_count": active_count,
            "unpaid_lp_count": unpaid_lp_count,
            "nav_stale": nav_stale,
            "capital_call_overdue_count": capital_call_overdue_count,
        },
        "label": label,
        "severity": _severity(score),
    }


def calc_investment_score(db: Session, today: date) -> dict[str, Any]:
    active_reviews = (
        db.query(InvestmentReview)
        .filter(InvestmentReview.status.notin_(["완료", "중단"]))
        .all()
    )

    stale_cutoff = datetime.combine(today - timedelta(days=14), datetime.min.time())
    stale_count = 0
    overdue_dd_count = 0
    no_reviewer_count = 0
    by_stage: dict[str, int] = {}

    for review in active_reviews:
        stage_name = (review.status or review.stage or "기타").strip() or "기타"
        by_stage[stage_name] = by_stage.get(stage_name, 0) + 1

        if review.updated_at and review.updated_at <= stale_cutoff:
            stale_count += 1
        if review.dd_start_date and (today - review.dd_start_date).days > 14:
            overdue_dd_count += 1
        if not (review.reviewer or "").strip():
            no_reviewer_count += 1

    score = 100 - (stale_count * 8) - (overdue_dd_count * 12) - (no_reviewer_count * 5)
    score = _clamp_score(score)

    return {
        "score": score,
        "factors": {
            "pipeline_count": len(active_reviews),
            "stale_count": stale_count,
            "overdue_dd_count": overdue_dd_count,
            "no_reviewer_assigned_count": no_reviewer_count,
            "by_stage": by_stage,
        },
        "label": f"심의 {len(active_reviews)}건",
        "severity": _severity(score),
    }


def calc_compliance_score(db: Session, today: date) -> dict[str, Any]:
    open_rows = (
        db.query(ComplianceObligation)
        .filter(ComplianceObligation.status.notin_(["completed", "waived"]))
        .all()
    )

    overdue_count = 0
    approaching_count = 0
    for row in open_rows:
        if row.due_date < today:
            overdue_count += 1
        elif row.due_date <= today + timedelta(days=3):
            approaching_count += 1

    violation_count = int(
        db.query(func.count(ComplianceCheck.id))
        .filter(
            ComplianceCheck.result.in_(["fail", "error"]),
            ComplianceCheck.resolved_at.is_(None),
        )
        .scalar()
        or 0
    )

    total_obligations = int(db.query(func.count(ComplianceObligation.id)).scalar() or 0)
    completed_obligations = int(
        db.query(func.count(ComplianceObligation.id))
        .filter(ComplianceObligation.status.in_(["completed", "waived"]))
        .scalar()
        or 0
    )

    score = 100 - (violation_count * 20) - (approaching_count * 8) - (overdue_count * 15)
    score = _clamp_score(score)

    if violation_count > 0:
        label = f"위반 {violation_count}건"
    elif overdue_count > 0:
        label = f"지연 {overdue_count}건"
    else:
        label = f"의무 {len(open_rows)}건"

    return {
        "score": score,
        "factors": {
            "violation_count": violation_count,
            "overdue_count": overdue_count,
            "approaching_count": approaching_count,
            "total_obligations": total_obligations,
            "completed_obligations": completed_obligations,
        },
        "label": label,
        "severity": _severity(score),
    }


def calc_report_score(db: Session, today: date) -> dict[str, Any]:
    submitted_statuses = {"제출완료", "전송완료", "submitted", "sent"}
    report_rows = (
        db.query(RegularReport)
        .filter(
            RegularReport.due_date.isnot(None),
            RegularReport.status.notin_(list(submitted_statuses)),
        )
        .all()
    )

    overdue_count = 0
    approaching_count = 0
    not_started_count = 0
    for row in report_rows:
        due_date = row.due_date
        if due_date is None:
            continue
        if due_date < today:
            overdue_count += 1
        elif due_date <= today + timedelta(days=3):
            approaching_count += 1

        status = (row.status or "").strip().lower()
        if due_date <= today + timedelta(days=7) and status in {"", "예정", "planned", "pending", "미착수", "draft"}:
            not_started_count += 1

    score = 100 - (overdue_count * 15) - (approaching_count * 5) - (not_started_count * 8)
    score = _clamp_score(score)

    return {
        "score": score,
        "factors": {
            "overdue_count": overdue_count,
            "approaching_count": approaching_count,
            "not_started_count": not_started_count,
        },
        "label": f"마감 {overdue_count + approaching_count}건",
        "severity": _severity(score),
    }


def calc_document_score(db: Session, today: date) -> dict[str, Any]:
    doc_rows = (
        db.query(InvestmentDocument)
        .filter(
            InvestmentDocument.due_date.isnot(None),
            InvestmentDocument.status != "collected",
        )
        .all()
    )

    overdue_count = 0
    approaching_count = 0
    long_overdue_count = 0

    for row in doc_rows:
        if row.due_date is None:
            continue
        if row.due_date < today:
            overdue_count += 1
            if row.due_date < today - timedelta(days=7):
                long_overdue_count += 1
        elif row.due_date <= today + timedelta(days=3):
            approaching_count += 1

    score = 100 - (overdue_count * 12) - (approaching_count * 5) - (long_overdue_count * 5)
    score = _clamp_score(score)

    return {
        "score": score,
        "factors": {
            "overdue_count": overdue_count,
            "approaching_count": approaching_count,
            "long_overdue_count": long_overdue_count,
        },
        "label": f"미수 {overdue_count + approaching_count}건",
        "severity": _severity(score),
    }


def calc_overall_score(domains: dict[str, dict[str, Any]]) -> int:
    weights = {
        "tasks": 0.15,
        "funds": 0.20,
        "investment_review": 0.10,
        "compliance": 0.25,
        "reports": 0.15,
        "documents": 0.15,
    }
    weighted_sum = 0.0
    for key, weight in weights.items():
        weighted_sum += float(domains.get(key, {}).get("score", 0)) * weight
    return _clamp_score(round(weighted_sum))


def build_dashboard_health(db: Session, today: date) -> dict[str, Any]:
    domains = {
        "tasks": calc_task_score(db, today),
        "funds": calc_fund_score(db, today),
        "investment_review": calc_investment_score(db, today),
        "compliance": calc_compliance_score(db, today),
        "reports": calc_report_score(db, today),
        "documents": calc_document_score(db, today),
    }
    overall_score = calc_overall_score(domains)

    alerts: list[dict[str, str]] = []
    seen_types: set[str] = set()

    domain_labels = {
        "tasks": ("업무", "/tasks"),
        "funds": ("펀드", "/funds"),
        "investment_review": ("투자 심의", "/investment-review"),
        "compliance": ("컴플라이언스", "/compliance"),
        "reports": ("보고", "/reports"),
        "documents": ("서류", "/documents"),
    }

    for domain_key, payload in domains.items():
        score = int(payload.get("score", 0))
        if score >= 70:
            continue
        label, action_url = domain_labels.get(domain_key, (domain_key, "/dashboard"))
        alert_type = f"{domain_key}_risk"
        if alert_type in seen_types:
            continue
        seen_types.add(alert_type)
        alerts.append(
            {
                "type": alert_type,
                "message": f"{label} 건강 점수 {score}점",
                "domain": domain_key,
                "action_url": action_url,
            }
        )

    violation_count = int(domains["compliance"]["factors"].get("violation_count", 0))
    if violation_count > 0:
        alerts.append(
            {
                "type": "compliance_violation",
                "message": f"컴플라이언스 위반 {violation_count}건",
                "domain": "compliance",
                "action_url": "/compliance",
            }
        )

    long_overdue_count = int(domains["documents"]["factors"].get("long_overdue_count", 0))
    if long_overdue_count > 0:
        alerts.append(
            {
                "type": "document_long_overdue",
                "message": f"7일 이상 기한초과 서류 {long_overdue_count}건",
                "domain": "documents",
                "action_url": "/documents",
            }
        )

    journal_pending_count = int(
        db.query(func.count(JournalEntry.id))
        .filter(JournalEntry.status == "미결재")
        .scalar()
        or 0
    )
    if journal_pending_count >= 5:
        alerts.append(
            {
                "type": "journal_pending",
                "message": f"분개 미결재 {journal_pending_count}건",
                "domain": "accounting",
                "action_url": "/accounting",
            }
        )

    unpaid_lp_count = int(domains["funds"]["factors"].get("unpaid_lp_count", 0))
    if unpaid_lp_count > 0:
        alerts.append(
            {
                "type": "lp_unpaid",
                "message": f"LP 미납 {unpaid_lp_count}건",
                "domain": "funds",
                "action_url": "/funds",
            }
        )

    deduped_alerts: list[dict[str, str]] = []
    seen_types.clear()
    for row in alerts:
        row_type = row["type"]
        if row_type in seen_types:
            continue
        seen_types.add(row_type)
        deduped_alerts.append(row)

    return {
        "overall_score": overall_score,
        "domains": domains,
        "alerts": deduped_alerts,
    }
