from __future__ import annotations

import os
from datetime import datetime
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from services.law_amendment_monitor import LawAmendmentMonitor
from services.periodic_compliance_scanner import PeriodicComplianceScanner


class SchedulerService:
    """Background scheduler for periodic compliance jobs."""

    def __init__(self):
        timezone = ZoneInfo(os.getenv("SCHEDULER_TIMEZONE", "Asia/Seoul"))
        self.scheduler = AsyncIOScheduler(timezone=timezone)
        self._is_started = False
        self._last_run_at: dict[str, datetime | None] = {
            "daily_compliance_scan": None,
            "weekly_law_amendment_check": None,
            "monthly_full_audit": None,
        }

    def start(self):
        if self._is_started:
            return

        self.scheduler.add_job(
            self._daily_compliance_scan,
            CronTrigger(hour=9, minute=0),
            id="daily_compliance_scan",
            name="일간 준법감시 스캔 (L1~L3)",
            replace_existing=True,
        )
        self.scheduler.add_job(
            self._weekly_law_amendment_check,
            CronTrigger(day_of_week="mon", hour=8, minute=0),
            id="weekly_law_amendment_check",
            name="주간 법률 개정 체크",
            replace_existing=True,
        )
        self.scheduler.add_job(
            self._monthly_full_audit,
            CronTrigger(day=1, hour=7, minute=0),
            id="monthly_full_audit",
            name="월간 전체 감사 스캔",
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
            ("daily_compliance_scan", "일간 스캔", "매일 09:00"),
            ("weekly_law_amendment_check", "주간 법률 체크", "매주 월요일 08:00"),
            ("monthly_full_audit", "월간 전체 감사", "매월 1일 07:00"),
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


_scheduler_service: SchedulerService | None = None


def get_scheduler_service() -> SchedulerService:
    global _scheduler_service
    if _scheduler_service is None:
        _scheduler_service = SchedulerService()
    return _scheduler_service
