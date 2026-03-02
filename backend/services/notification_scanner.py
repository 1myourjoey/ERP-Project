from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.accounting import JournalEntry
from models.biz_report import BizReportRequest
from models.compliance import ComplianceObligation
from models.fee import ManagementFee
from models.investment import InvestmentDocument
from models.phase3 import CapitalCall, CapitalCallDetail, CapitalCallItem, Distribution
from models.task import Task
from services.notification_service import create_notifications_for_active_users


async def scan_task_deadlines(db: Session) -> int:
    today = date.today()
    tomorrow = today + timedelta(days=1)

    rows = (
        db.query(Task)
        .filter(
            Task.status.in_(["pending", "in_progress"]),
            Task.deadline.isnot(None),
        )
        .all()
    )

    created = 0
    for row in rows:
        deadline = row.deadline.date() if isinstance(row.deadline, datetime) else row.deadline
        if deadline is None:
            continue
        d_day = (deadline - today).days
        severity = None
        label = None
        if d_day < 0:
            severity = "urgent"
            label = f"D+{abs(d_day)}"
        elif d_day == 0:
            severity = "warning"
            label = "D-day"
        elif deadline == tomorrow:
            severity = "warning"
            label = "D-1"

        if not severity or not label:
            continue

        created += await create_notifications_for_active_users(
            db,
            category="task",
            severity=severity,
            title=f"태스크 마감 {label}: {row.title}",
            message="마감 태스크를 확인해 주세요.",
            target_type="task",
            target_id=row.id,
            action_url="/tasks",
        )
    return created


async def scan_compliance_deadlines(db: Session) -> int:
    today = date.today()
    rows = (
        db.query(ComplianceObligation)
        .filter(ComplianceObligation.status.in_(["pending", "in_progress", "overdue"]))
        .all()
    )

    created = 0
    for row in rows:
        if not row.due_date:
            continue
        d_day = (row.due_date - today).days
        severity = None
        label = None
        if d_day < 0:
            severity = "urgent"
            label = f"D+{abs(d_day)}"
        elif d_day <= 3:
            severity = "warning"
            label = f"D-{d_day}" if d_day > 0 else "D-day"
        elif d_day <= 7:
            severity = "info"
            label = f"D-{d_day}"

        if not severity or not label:
            continue

        created += await create_notifications_for_active_users(
            db,
            category="compliance",
            severity=severity,
            title=f"의무사항 마감 {label}: #{row.id}",
            message="컴플라이언스 의무사항 검토가 필요합니다.",
            target_type="compliance_obligation",
            target_id=row.id,
            action_url="/compliance",
        )
    return created


async def scan_capital_call_deadlines(db: Session) -> int:
    today = date.today()
    calls = db.query(CapitalCall).order_by(CapitalCall.call_date.asc()).all()

    created = 0
    for call in calls:
        unpaid_count = 0
        detail_rows = (
            db.query(CapitalCallDetail)
            .filter(CapitalCallDetail.capital_call_id == call.id)
            .all()
        )
        if detail_rows:
            unpaid_count = sum(
                1
                for detail in detail_rows
                if (detail.status or "") != "완납"
                or float(detail.paid_amount or 0) < float(detail.call_amount or 0)
            )
        else:
            item_rows = (
                db.query(CapitalCallItem)
                .filter(CapitalCallItem.capital_call_id == call.id)
                .all()
            )
            unpaid_count = sum(1 for item in item_rows if int(item.paid or 0) == 0)

        if unpaid_count <= 0:
            continue

        d_day = (call.call_date - today).days
        severity = None
        label = None
        if d_day < 0:
            severity = "urgent"
            label = f"D+{abs(d_day)}"
        elif d_day <= 5:
            severity = "warning"
            label = f"D-{d_day}" if d_day > 0 else "D-day"

        if not severity or not label:
            continue

        created += await create_notifications_for_active_users(
            db,
            category="capital",
            severity=severity,
            title=f"콜 납입 마감 {label}: {unpaid_count}건 미납",
            message="미납 LP 납입 내역을 확인해 주세요.",
            target_type="capital_call",
            target_id=call.id,
            action_url=f"/funds/{call.fund_id}",
        )
    return created


async def scan_document_expiry(db: Session) -> int:
    today = date.today()
    created = 0

    docs = (
        db.query(InvestmentDocument)
        .filter(InvestmentDocument.status != "collected", InvestmentDocument.due_date.isnot(None))
        .all()
    )
    for doc in docs:
        if not doc.due_date:
            continue
        d_day = (doc.due_date - today).days
        severity = None
        label = None
        if d_day < 0:
            severity = "urgent"
            label = f"D+{abs(d_day)}"
        elif d_day <= 7:
            severity = "warning"
            label = f"D-{d_day}" if d_day > 0 else "D-day"
        elif d_day <= 30:
            severity = "info"
            label = f"D-{d_day}"

        if not severity or not label:
            continue

        created += await create_notifications_for_active_users(
            db,
            category="document",
            severity=severity,
            title=f"서류 기한 {label}: {doc.name}",
            message="미수집 서류 기한을 확인해 주세요.",
            target_type="investment_document",
            target_id=doc.id,
            action_url="/documents",
        )

    pending_request_count = int(
        db.query(func.count(BizReportRequest.id))
        .filter(BizReportRequest.status.in_(["요청", "요청중", "검토중"]))
        .scalar()
        or 0
    )
    if pending_request_count > 0:
        created += await create_notifications_for_active_users(
            db,
            category="document",
            severity="info",
            title=f"사업보고 서류 미수신 {pending_request_count}건",
            message="사업보고 서류 수집 현황을 확인해 주세요.",
            target_type="biz_report_request",
            target_id=None,
            action_url="/biz-reports",
        )

    return created


async def scan_pending_approvals(db: Session) -> int:
    created = 0

    pending_journal = int(
        db.query(func.count(JournalEntry.id))
        .filter(JournalEntry.status == "미결재")
        .scalar()
        or 0
    )
    if pending_journal > 0:
        created += await create_notifications_for_active_users(
            db,
            category="approval",
            severity="warning",
            title=f"승인 대기: 분개 {pending_journal}건",
            message="미결재 분개를 확인해 주세요.",
            target_type="journal_entry",
            target_id=None,
            action_url="/accounting",
        )

    draft_distribution = int(
        db.query(func.count(Distribution.id))
        .filter(
            (Distribution.dist_type == "exit")
            | (Distribution.memo.like("%draft%"))
            | (Distribution.memo.like("%자동 배분%"))
            | (Distribution.memo.like("%자동배분%"))
        )
        .scalar()
        or 0
    )
    if draft_distribution > 0:
        created += await create_notifications_for_active_users(
            db,
            category="approval",
            severity="info",
            title=f"승인 대기: 배분 {draft_distribution}건",
            message="배분 초안을 확인해 주세요.",
            target_type="distribution",
            target_id=None,
            action_url="/funds",
        )

    pending_fees = int(
        db.query(func.count(ManagementFee.id))
        .filter(
            ManagementFee.status.in_(["계산완료", "calculated", "미청구"])
        )
        .scalar()
        or 0
    )
    if pending_fees > 0:
        created += await create_notifications_for_active_users(
            db,
            category="approval",
            severity="info",
            title=f"승인 대기: 보수 {pending_fees}건",
            message="관리/성과보수 항목을 확인해 주세요.",
            target_type="management_fee",
            target_id=None,
            action_url="/fee-management",
        )

    return created


async def run_all_scans(db: Session) -> dict:
    results = {
        "task_alerts": await scan_task_deadlines(db),
        "compliance_alerts": await scan_compliance_deadlines(db),
        "capital_call_alerts": await scan_capital_call_deadlines(db),
        "document_alerts": await scan_document_expiry(db),
        "approval_alerts": await scan_pending_approvals(db),
    }
    results["total"] = sum(results.values())
    return results
