from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth import get_current_user
from models.accounting import JournalEntry
from models.calendar_event import CalendarEvent
from models.compliance import ComplianceObligation
from models.fee import ManagementFee
from models.fund import Fund
from models.notification import Notification
from models.phase3 import CapitalCall, Distribution
from models.task import Task
from models.user import User

router = APIRouter(tags=["dashboard_summary"])


@router.get("/api/dashboard/summary")
async def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    week_end = today + timedelta(days=6)

    urgent_notifications = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.severity == "urgent",
        )
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(5)
        .all()
    )

    today_tasks_total = int(
        db.query(func.count(Task.id))
        .filter(Task.deadline.isnot(None), func.date(Task.deadline) == today)
        .scalar()
        or 0
    )
    today_tasks_completed = int(
        db.query(func.count(Task.id))
        .filter(Task.status == "completed", Task.completed_at.isnot(None), func.date(Task.completed_at) == today)
        .scalar()
        or 0
    )
    today_tasks_in_progress = int(
        db.query(func.count(Task.id))
        .filter(Task.status == "in_progress")
        .scalar()
        or 0
    )

    pending_journals = int(
        db.query(func.count(JournalEntry.id))
        .filter(JournalEntry.status == "미결재")
        .scalar()
        or 0
    )
    pending_distributions = int(
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
    pending_fees = int(
        db.query(func.count(ManagementFee.id))
        .filter(ManagementFee.status.in_(["계산완료", "calculated", "미청구"]))
        .scalar()
        or 0
    )

    deadline_tasks = (
        db.query(Task)
        .filter(
            Task.status.in_(["pending", "in_progress"]),
            Task.deadline.isnot(None),
            func.date(Task.deadline) >= today,
            func.date(Task.deadline) <= week_end,
        )
        .order_by(Task.deadline.asc())
        .limit(10)
        .all()
    )

    compliance_deadlines = (
        db.query(ComplianceObligation)
        .filter(
            ComplianceObligation.status.in_(["pending", "in_progress", "overdue"]),
            ComplianceObligation.due_date >= today,
            ComplianceObligation.due_date <= week_end,
        )
        .order_by(ComplianceObligation.due_date.asc())
        .limit(10)
        .all()
    )

    deadlines_this_week = [
        {
            "type": "task",
            "id": row.id,
            "title": row.title,
            "due_date": (row.deadline.date() if hasattr(row.deadline, "date") else row.deadline).isoformat() if row.deadline else None,
        }
        for row in deadline_tasks
    ] + [
        {
            "type": "compliance",
            "id": row.id,
            "title": f"의무사항 #{row.id}",
            "due_date": row.due_date.isoformat() if row.due_date else None,
        }
        for row in compliance_deadlines
    ]

    weekly_events_rows = (
        db.query(CalendarEvent)
        .filter(CalendarEvent.date >= today, CalendarEvent.date <= week_end)
        .order_by(CalendarEvent.date.asc(), CalendarEvent.id.asc())
        .all()
    )
    weekly_events = [
        {
            "id": row.id,
            "title": row.title,
            "date": row.date.isoformat() if row.date else None,
            "type": "calendar_event",
            "status": row.status,
        }
        for row in weekly_events_rows
    ]

    active_funds = (
        db.query(Fund)
        .filter(func.lower(func.coalesce(Fund.status, "")) == "active")
        .all()
    )
    total_aum = float(sum(float(row.aum or 0) for row in active_funds))
    next_call = (
        db.query(CapitalCall)
        .filter(CapitalCall.call_date >= today)
        .order_by(CapitalCall.call_date.asc(), CapitalCall.id.asc())
        .first()
    )

    return {
        "urgent_notifications": [
            {
                "id": row.id,
                "title": row.title,
                "message": row.message,
                "action_url": row.action_url,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in urgent_notifications
        ],
        "today_tasks": {
            "total": today_tasks_total,
            "completed": today_tasks_completed,
            "in_progress": today_tasks_in_progress,
        },
        "pending_approvals": {
            "journals": pending_journals,
            "distributions": pending_distributions,
            "fees": pending_fees,
        },
        "deadlines_this_week": deadlines_this_week[:12],
        "weekly_events": weekly_events,
        "fund_overview": {
            "active_funds": len(active_funds),
            "total_aum": total_aum,
            "next_call": {
                "id": next_call.id,
                "fund_id": next_call.fund_id,
                "call_date": next_call.call_date.isoformat(),
                "total_amount": float(next_call.total_amount or 0),
            }
            if next_call
            else None,
        },
    }
