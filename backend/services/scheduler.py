from __future__ import annotations

import os
from datetime import datetime
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from database import SessionLocal
from services.fee_auto_calculator import auto_calculate_all_funds
from services.law_amendment_monitor import LawAmendmentMonitor
from services.notification_scanner import run_all_scans
from services.notification_service import cleanup_old_notifications
from services.periodic_compliance_scanner import PeriodicComplianceScanner


class SchedulerService:
    """Background scheduler for periodic backend jobs."""

    def __init__(self):
        timezone = ZoneInfo(os.getenv("SCHEDULER_TIMEZONE", "Asia/Seoul"))
        self.scheduler = AsyncIOScheduler(timezone=timezone)
        self._is_started = False
        self._last_run_at: dict[str, datetime | None] = {
            "daily_compliance_scan": None,
            "weekly_law_amendment_check": None,
            "monthly_full_audit": None,
            "quarterly_fee_calculation": None,
            "daily_notification_scan": None,
            "notification_cleanup": None,
        }

    def start(self):
        if self._is_started:
            return

        self.scheduler.add_job(
            self._daily_compliance_scan,
            CronTrigger(hour=9, minute=0),
            id="daily_compliance_scan",
            name="Daily compliance scan",
            replace_existing=True,
        )
        self.scheduler.add_job(
            self._weekly_law_amendment_check,
            CronTrigger(day_of_week="mon", hour=8, minute=0),
            id="weekly_law_amendment_check",
            name="Weekly law amendment check",
            replace_existing=True,
        )
        self.scheduler.add_job(
            self._monthly_full_audit,
            CronTrigger(day=1, hour=7, minute=0),
            id="monthly_full_audit",
            name="Monthly full compliance audit",
            replace_existing=True,
        )
        self.scheduler.add_job(
            self._quarterly_fee_calculation,
            CronTrigger(month="1,4,7,10", day=1, hour=9, minute=0),
            id="quarterly_fee_calculation",
            name="Quarterly management fee calculation",
            replace_existing=True,
        )
        self.scheduler.add_job(
            self._daily_notification_scan,
            CronTrigger(hour=9, minute=0),
            id="daily_notification_scan",
            name="Daily notification scan",
            replace_existing=True,
        )
        self.scheduler.add_job(
            self._notification_cleanup,
            CronTrigger(hour=0, minute=0),
            id="notification_cleanup",
            name="Notification cleanup",
            replace_existing=True,
        )

        self.scheduler.start()
        self._is_started = True

    def stop(self):
        if not self._is_started:
            return
        self.scheduler.shutdown(wait=False)
        self._is_started = False

    def get_schedule_status(self) -> list[dict]:
        rows: list[dict] = []
        for job_id, label, cron in [
            ("daily_compliance_scan", "Daily compliance scan", "Every day 09:00"),
            ("weekly_law_amendment_check", "Weekly law amendment", "Mon 08:00"),
            ("monthly_full_audit", "Monthly full audit", "Day 1 07:00"),
            ("quarterly_fee_calculation", "Quarterly fee calculation", "Jan/Apr/Jul/Oct Day 1 09:00"),
            ("daily_notification_scan", "Daily notification scan", "Every day 09:00"),
            ("notification_cleanup", "Notification cleanup", "Every day 00:00"),
        ]:
            job = self.scheduler.get_job(job_id)
            rows.append(
                {
                    "job_id": job_id,
                    "label": label,
                    "cron": cron,
                    "next_run_at": (
                        job.next_run_time.isoformat()
                        if job and getattr(job, "next_run_time", None)
                        else None
                    ),
                    "last_run_at": (
                        self._last_run_at.get(job_id).isoformat()
                        if self._last_run_at.get(job_id) is not None
                        else None
                    ),
                    "enabled": self._is_started,
                }
            )
        return rows

    async def _daily_compliance_scan(self):
        self._last_run_at["daily_compliance_scan"] = datetime.utcnow()
        scanner = PeriodicComplianceScanner()
        await scanner.run_daily_scan(
            trigger_type="scheduled",
            trigger_source="daily_scan",
        )

    async def _weekly_law_amendment_check(self):
        self._last_run_at["weekly_law_amendment_check"] = datetime.utcnow()
        monitor = LawAmendmentMonitor()
        await monitor.check_amendments(
            days=7,
            trigger_source="weekly_law_amendment_check",
        )

    async def _monthly_full_audit(self):
        self._last_run_at["monthly_full_audit"] = datetime.utcnow()
        scanner = PeriodicComplianceScanner()
        await scanner.run_full_audit(
            trigger_type="scheduled",
            trigger_source="monthly_full_audit",
        )

    async def _quarterly_fee_calculation(self):
        self._last_run_at["quarterly_fee_calculation"] = datetime.utcnow()
        now = datetime.now(self.scheduler.timezone)
        year = now.year
        quarter = ((now.month - 1) // 3) + 1

        db = SessionLocal()
        try:
            await auto_calculate_all_funds(db, year, quarter)
        finally:
            db.close()

    async def _daily_notification_scan(self):
        self._last_run_at["daily_notification_scan"] = datetime.utcnow()
        db = SessionLocal()
        try:
            await run_all_scans(db)
        finally:
            db.close()

    async def _notification_cleanup(self):
        self._last_run_at["notification_cleanup"] = datetime.utcnow()
        db = SessionLocal()
        try:
            await cleanup_old_notifications(db, days=90)
        finally:
            db.close()


_scheduler_service: SchedulerService | None = None


def get_scheduler_service() -> SchedulerService:
    global _scheduler_service
    if _scheduler_service is None:
        _scheduler_service = SchedulerService()
    return _scheduler_service
