from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from models.compliance import ComplianceCheck, FundComplianceRule
from models.fund import Fund
from models.task import Task


class ComplianceHistoryAnalyzer:
    """Analyze compliance check history for monitoring and reporting."""

    VIOLATION_RESULTS = {"fail", "error"}

    def analyze_violation_patterns(self, fund_id: int, db: Session, months: int = 6) -> dict[str, Any]:
        """Analyze recurring violations and trend areas for a fund."""
        months = max(1, min(int(months or 6), 24))
        since = self._month_start(datetime.utcnow() - timedelta(days=months * 31))

        checks = (
            db.query(ComplianceCheck)
            .filter(
                ComplianceCheck.fund_id == fund_id,
                ComplianceCheck.checked_at >= since,
            )
            .order_by(ComplianceCheck.checked_at.asc(), ComplianceCheck.id.asc())
            .all()
        )

        rule_violations: dict[int, list[str]] = defaultdict(list)
        for check in checks:
            if check.rule_id and check.checked_at and check.result in self.VIOLATION_RESULTS:
                rule_violations[check.rule_id].append(check.checked_at.strftime("%Y-%m"))

        recurring_violations: list[dict[str, Any]] = []
        for rule_id, months_list in rule_violations.items():
            unique_months = sorted(set(months_list))
            if len(unique_months) < 2:
                continue

            rule = db.get(FundComplianceRule, rule_id)
            if not rule:
                continue

            unique_count = len(unique_months)
            recurring_violations.append(
                {
                    "rule_id": rule.id,
                    "rule_code": rule.rule_code,
                    "rule_name": rule.rule_name,
                    "violation_count": len(months_list),
                    "months_violated": unique_months,
                    "severity": rule.severity,
                    "pattern": self._detect_pattern(unique_months),
                    "recommendation": self._generate_recommendation(rule_name=rule.rule_name, month_count=unique_count),
                }
            )

        recurring_violations.sort(key=lambda row: row["violation_count"], reverse=True)

        return {
            "fund_id": fund_id,
            "months": months,
            "since": since.date().isoformat(),
            "recurring_violations": recurring_violations,
            "improving_areas": self._find_improving(checks=checks, months=months, db=db),
            "worsening_areas": self._find_worsening(checks=checks, months=months, db=db),
        }

    def suggest_rule_adjustments(self, db: Session, fund_id: int | None = None) -> list[dict[str, Any]]:
        """Suggest rule-level adjustments from six-month history."""
        six_months_ago = datetime.utcnow() - timedelta(days=180)

        query = db.query(FundComplianceRule).filter(FundComplianceRule.is_active == True)
        if fund_id is not None:
            query = query.filter(
                (FundComplianceRule.fund_id == fund_id) | (FundComplianceRule.fund_id.is_(None))
            )
        rules = query.order_by(FundComplianceRule.rule_code.asc()).all()

        suggestions: list[dict[str, Any]] = []
        for rule in rules:
            total_checks = (
                db.query(ComplianceCheck)
                .filter(
                    ComplianceCheck.rule_id == rule.id,
                    ComplianceCheck.checked_at >= six_months_ago,
                )
                .count()
            )
            violation_count = (
                db.query(ComplianceCheck)
                .filter(
                    ComplianceCheck.rule_id == rule.id,
                    ComplianceCheck.checked_at >= six_months_ago,
                    ComplianceCheck.result.in_(list(self.VIOLATION_RESULTS)),
                )
                .count()
            )

            if total_checks >= 10 and violation_count == 0:
                suggestions.append(
                    {
                        "rule_id": rule.id,
                        "fund_id": rule.fund_id,
                        "rule_code": rule.rule_code,
                        "rule_name": rule.rule_name,
                        "current_level": rule.level,
                        "current_severity": rule.severity,
                        "suggestion": "frequency_reduce",
                        "detail": (
                            f"No violations in {total_checks} checks during the last 6 months. "
                            "Consider reducing check frequency."
                        ),
                    }
                )
            elif violation_count >= 5:
                next_severity = self._next_severity(rule.severity)
                suggestions.append(
                    {
                        "rule_id": rule.id,
                        "fund_id": rule.fund_id,
                        "rule_code": rule.rule_code,
                        "rule_name": rule.rule_name,
                        "current_level": rule.level,
                        "current_severity": rule.severity,
                        "suggestion": "severity_upgrade",
                        "detail": (
                            f"{violation_count} violations in the last 6 months. "
                            f"Consider severity escalation ({rule.severity} -> {next_severity})."
                        ),
                        "recommended_severity": next_severity,
                        "violation_count": violation_count,
                    }
                )

        def _sort_key(item: dict[str, Any]) -> tuple[int, int]:
            suggestion = str(item.get("suggestion") or "")
            priority = 0 if suggestion == "severity_upgrade" else 1
            count = int(item.get("violation_count") or 0)
            return (priority, -count)

        suggestions.sort(key=_sort_key)
        return suggestions

    def get_remediation_stats(self, fund_id: int | None, db: Session) -> dict[str, Any]:
        """Return remediation task tracking statistics."""
        query = db.query(ComplianceCheck).filter(ComplianceCheck.remediation_task_id.isnot(None))
        if fund_id is not None:
            query = query.filter(ComplianceCheck.fund_id == fund_id)

        checks_with_tasks = (
            query.order_by(ComplianceCheck.checked_at.asc(), ComplianceCheck.id.asc()).all()
        )

        first_check_by_task: dict[int, ComplianceCheck] = {}
        for check in checks_with_tasks:
            if not check.remediation_task_id:
                continue
            first_check_by_task.setdefault(check.remediation_task_id, check)

        task_ids = list(first_check_by_task.keys())
        if task_ids:
            tasks = db.query(Task).filter(Task.id.in_(task_ids)).all()
            task_map = {task.id: task for task in tasks}
        else:
            task_map = {}

        now = datetime.utcnow()
        total_tasks = len(first_check_by_task)
        completed = 0
        resolution_days: list[float] = []
        overdue_tasks: list[dict[str, Any]] = []

        for task_id, check in first_check_by_task.items():
            task = task_map.get(task_id)
            completed_at = check.resolved_at
            if completed_at is None and task is not None and task.status == "completed":
                completed_at = task.completed_at

            if completed_at is not None:
                completed += 1
                if check.checked_at is not None:
                    delta_days = (completed_at - check.checked_at).total_seconds() / 86400
                    resolution_days.append(max(0.0, delta_days))
                continue

            checked_at = check.checked_at or now
            days_open = max(0, (now - checked_at).days)
            deadline_overdue = bool(task and task.deadline and task.deadline < now)
            stale_open = days_open > 7
            if not (deadline_overdue or stale_open):
                continue

            rule = db.get(FundComplianceRule, check.rule_id) if check.rule_id else None
            overdue_tasks.append(
                {
                    "task_id": task_id,
                    "task_title": task.title if task else None,
                    "days_open": days_open,
                    "deadline": task.deadline.isoformat() if task and task.deadline else None,
                    "rule_id": check.rule_id,
                    "rule_name": rule.rule_name if rule else None,
                    "fund_id": check.fund_id,
                    "checked_at": check.checked_at.isoformat() if check.checked_at else None,
                }
            )

        overdue_tasks.sort(key=lambda row: int(row["days_open"]), reverse=True)
        pending = total_tasks - completed
        avg_days = (sum(resolution_days) / len(resolution_days)) if resolution_days else 0.0

        return {
            "fund_id": fund_id,
            "total_tasks": total_tasks,
            "completed": completed,
            "pending": pending,
            "completion_rate": round((completed / total_tasks) * 100, 1) if total_tasks else 0.0,
            "avg_resolution_days": round(avg_days, 1),
            "overdue_tasks": overdue_tasks,
        }

    def generate_monthly_report(self, fund_id: int, year_month: str, db: Session) -> dict[str, Any]:
        """Generate a monthly compliance report payload."""
        start_date, end_date = self._parse_month_range(year_month)

        fund = db.get(Fund, fund_id)
        if not fund:
            raise ValueError("fund not found")

        checks = (
            db.query(ComplianceCheck)
            .filter(
                ComplianceCheck.fund_id == fund_id,
                ComplianceCheck.checked_at >= start_date,
                ComplianceCheck.checked_at < end_date,
            )
            .order_by(ComplianceCheck.checked_at.asc(), ComplianceCheck.id.asc())
            .all()
        )

        summary = {
            "total_checks": len(checks),
            "pass": sum(1 for check in checks if check.result == "pass"),
            "fail": sum(1 for check in checks if check.result in self.VIOLATION_RESULTS),
            "warning": sum(1 for check in checks if check.result == "warning"),
        }

        rule_cache: dict[int, FundComplianceRule | None] = {}

        def get_rule(rule_id: int | None) -> FundComplianceRule | None:
            if rule_id is None:
                return None
            if rule_id not in rule_cache:
                rule_cache[rule_id] = db.get(FundComplianceRule, rule_id)
            return rule_cache[rule_id]

        violations: list[dict[str, Any]] = []
        for check in checks:
            if check.result not in self.VIOLATION_RESULTS:
                continue
            rule = get_rule(check.rule_id)
            violations.append(
                {
                    "check_id": check.id,
                    "rule_id": check.rule_id,
                    "rule_code": rule.rule_code if rule else None,
                    "rule_name": rule.rule_name if rule else None,
                    "result": check.result,
                    "detail": check.detail,
                    "checked_at": check.checked_at.isoformat() if check.checked_at else None,
                }
            )

        recurring_patterns = self.analyze_violation_patterns(fund_id=fund_id, db=db, months=3)[
            "recurring_violations"
        ]
        remediation_status = self.get_remediation_stats(fund_id=fund_id, db=db)
        recommendations = self.suggest_rule_adjustments(db=db, fund_id=fund_id)
        trend_vs_last_month = self._trend_vs_last_month(
            fund_id=fund_id,
            current_start=start_date,
            current_end=end_date,
            db=db,
        )

        return {
            "fund_id": fund_id,
            "fund_name": fund.name,
            "period": year_month,
            "generated_at": datetime.utcnow().isoformat(),
            "summary": summary,
            "violations": violations,
            "recurring_patterns": recurring_patterns,
            "remediation_status": remediation_status,
            "recommendations": recommendations,
            "trend_vs_last_month": trend_vs_last_month,
        }

    def build_monthly_report_text(self, report: dict[str, Any]) -> str:
        """Convert report payload to text for file download."""
        summary = report.get("summary") or {}
        remediation = report.get("remediation_status") or {}
        trend = report.get("trend_vs_last_month") or {}

        lines: list[str] = [
            "V:ON ERP Monthly Compliance Report",
            "=" * 42,
            f"Fund: {report.get('fund_name') or '-'}",
            f"Period: {report.get('period') or '-'}",
            f"Generated At (UTC): {report.get('generated_at') or '-'}",
            "",
            "[Summary]",
            f"Total Checks: {summary.get('total_checks', 0)}",
            f"Pass: {summary.get('pass', 0)}",
            f"Fail/Error: {summary.get('fail', 0)}",
            f"Warning: {summary.get('warning', 0)}",
            "",
            "[Remediation]",
            f"Total Tasks: {remediation.get('total_tasks', 0)}",
            f"Completed: {remediation.get('completed', 0)}",
            f"Pending: {remediation.get('pending', 0)}",
            f"Completion Rate: {remediation.get('completion_rate', 0)}%",
            f"Avg Resolution Days: {remediation.get('avg_resolution_days', 0)}",
            "",
            "[Trend vs Last Month]",
            f"Improved: {trend.get('improved', 0)}",
            f"Worsened: {trend.get('worsened', 0)}",
            f"Unchanged: {trend.get('unchanged', 0)}",
            "",
            "[Violations]",
        ]

        violations = report.get("violations") or []
        if violations:
            for item in violations:
                lines.append(
                    f"- {item.get('rule_code') or '-'} | {item.get('rule_name') or '-'} | "
                    f"{item.get('result') or '-'} | {item.get('detail') or '-'}"
                )
        else:
            lines.append("- No violations in this period")

        lines.append("")
        lines.append("[Recurring Patterns]")
        recurring_patterns = report.get("recurring_patterns") or []
        if recurring_patterns:
            for item in recurring_patterns:
                lines.append(
                    f"- {item.get('rule_code') or '-'} | months={','.join(item.get('months_violated') or [])} | "
                    f"count={item.get('violation_count', 0)} | {item.get('recommendation') or '-'}"
                )
        else:
            lines.append("- No recurring pattern detected")

        lines.append("")
        lines.append("[Rule Adjustment Suggestions]")
        suggestions = report.get("recommendations") or []
        if suggestions:
            for item in suggestions:
                lines.append(
                    f"- {item.get('rule_code') or '-'} | {item.get('suggestion') or '-'} | {item.get('detail') or '-'}"
                )
        else:
            lines.append("- No adjustment suggestion")

        return "\n".join(lines).strip() + "\n"

    def _find_improving(
        self,
        *,
        checks: list[ComplianceCheck],
        months: int,
        db: Session,
    ) -> list[dict[str, Any]]:
        return self._find_trend_areas(checks=checks, months=months, db=db, improving=True)

    def _find_worsening(
        self,
        *,
        checks: list[ComplianceCheck],
        months: int,
        db: Session,
    ) -> list[dict[str, Any]]:
        return self._find_trend_areas(checks=checks, months=months, db=db, improving=False)

    def _find_trend_areas(
        self,
        *,
        checks: list[ComplianceCheck],
        months: int,
        db: Session,
        improving: bool,
    ) -> list[dict[str, Any]]:
        month_keys = self._rolling_month_keys(months)
        violation_counter: Counter[tuple[int, str]] = Counter()

        for check in checks:
            if (
                check.rule_id
                and check.checked_at
                and check.result in self.VIOLATION_RESULTS
                and check.checked_at.strftime("%Y-%m") in month_keys
            ):
                key = (check.rule_id, check.checked_at.strftime("%Y-%m"))
                violation_counter[key] += 1

        rule_ids = sorted({rule_id for (rule_id, _) in violation_counter.keys()})
        trend_rows: list[dict[str, Any]] = []

        split = max(1, len(month_keys) // 2)
        early_months = month_keys[:split]
        recent_months = month_keys[split:]

        for rule_id in rule_ids:
            early_total = sum(violation_counter.get((rule_id, key), 0) for key in early_months)
            recent_total = sum(violation_counter.get((rule_id, key), 0) for key in recent_months)
            delta = recent_total - early_total

            should_include = delta < 0 if improving else delta > 0
            if not should_include:
                continue

            rule = db.get(FundComplianceRule, rule_id)
            trend_rows.append(
                {
                    "rule_id": rule_id,
                    "rule_code": rule.rule_code if rule else None,
                    "rule_name": rule.rule_name if rule else None,
                    "early_period_violations": early_total,
                    "recent_period_violations": recent_total,
                    "delta": delta,
                    "trend": "improving" if improving else "worsening",
                }
            )

        trend_rows.sort(
            key=lambda row: abs(int(row.get("delta") or 0)),
            reverse=True,
        )
        return trend_rows

    @staticmethod
    def _detect_pattern(months: list[str]) -> str:
        if len(months) >= 6:
            return "persistent_recurrence_6m_plus"
        if len(months) >= 3:
            return "monthly_recurrence" if ComplianceHistoryAnalyzer._is_consecutive(months) else "intermittent_recurrence"
        return "two_time_recurrence"

    @staticmethod
    def _is_consecutive(months: list[str]) -> bool:
        if len(months) <= 1:
            return True
        for idx in range(1, len(months)):
            y1, m1 = map(int, months[idx - 1].split("-"))
            y2, m2 = map(int, months[idx].split("-"))
            prev_serial = y1 * 12 + m1
            cur_serial = y2 * 12 + m2
            if cur_serial != prev_serial + 1:
                return False
        return True

    @staticmethod
    def _generate_recommendation(*, rule_name: str, month_count: int) -> str:
        if month_count >= 5:
            return f"{rule_name}: frequent recurrence detected. Root cause analysis and process change are recommended."
        if month_count >= 3:
            return f"{rule_name}: recurring trend detected. Focused team training or automation is recommended."
        return f"{rule_name}: monitor closely."

    @staticmethod
    def _next_severity(current: str | None) -> str:
        levels = ["info", "warning", "error", "critical"]
        normalized = str(current or "warning").strip().lower()
        if normalized not in levels:
            return "error"
        idx = levels.index(normalized)
        return levels[min(idx + 1, len(levels) - 1)]

    @staticmethod
    def _month_start(value: datetime) -> datetime:
        return datetime(value.year, value.month, 1)

    @staticmethod
    def _rolling_month_keys(months: int) -> list[str]:
        now = datetime.utcnow()
        keys: list[str] = []
        year = now.year
        month = now.month

        for _ in range(months):
            keys.append(f"{year:04d}-{month:02d}")
            month -= 1
            if month == 0:
                month = 12
                year -= 1

        keys.reverse()
        return keys

    @staticmethod
    def _parse_month_range(year_month: str) -> tuple[datetime, datetime]:
        normalized = str(year_month or "").strip()
        parts = normalized.split("-")
        if len(parts) != 2:
            raise ValueError("year_month must be in YYYY-MM format")

        year = int(parts[0])
        month = int(parts[1])
        if year < 2000 or year > 2100 or month < 1 or month > 12:
            raise ValueError("year_month must be in YYYY-MM format")

        start = datetime(year, month, 1)
        if month == 12:
            end = datetime(year + 1, 1, 1)
        else:
            end = datetime(year, month + 1, 1)
        return start, end

    def _trend_vs_last_month(
        self,
        *,
        fund_id: int,
        current_start: datetime,
        current_end: datetime,
        db: Session,
    ) -> dict[str, Any]:
        previous_end = current_start
        if current_start.month == 1:
            previous_start = datetime(current_start.year - 1, 12, 1)
        else:
            previous_start = datetime(current_start.year, current_start.month - 1, 1)

        current_checks = (
            db.query(ComplianceCheck)
            .filter(
                ComplianceCheck.fund_id == fund_id,
                ComplianceCheck.checked_at >= current_start,
                ComplianceCheck.checked_at < current_end,
            )
            .all()
        )
        previous_checks = (
            db.query(ComplianceCheck)
            .filter(
                ComplianceCheck.fund_id == fund_id,
                ComplianceCheck.checked_at >= previous_start,
                ComplianceCheck.checked_at < previous_end,
            )
            .all()
        )

        rank_map = {"pass": 0, "warning": 1, "fail": 2, "error": 3}

        def worst_by_rule(checks: list[ComplianceCheck]) -> dict[int, int]:
            result: dict[int, int] = {}
            for check in checks:
                if not check.rule_id:
                    continue
                rank = rank_map.get(check.result, 1)
                prev = result.get(check.rule_id)
                if prev is None or rank > prev:
                    result[check.rule_id] = rank
            return result

        current_rank = worst_by_rule(current_checks)
        previous_rank = worst_by_rule(previous_checks)

        improved = 0
        worsened = 0
        unchanged = 0

        for rule_id in set(current_rank.keys()) | set(previous_rank.keys()):
            cur = current_rank.get(rule_id)
            prev = previous_rank.get(rule_id)

            if prev is None and cur is None:
                continue
            if prev is None:
                if (cur or 0) > 0:
                    worsened += 1
                else:
                    unchanged += 1
                continue
            if cur is None:
                if prev > 0:
                    improved += 1
                else:
                    unchanged += 1
                continue

            if cur < prev:
                improved += 1
            elif cur > prev:
                worsened += 1
            else:
                unchanged += 1

        return {
            "period": current_start.strftime("%Y-%m"),
            "previous_period": previous_start.strftime("%Y-%m"),
            "improved": improved,
            "worsened": worsened,
            "unchanged": unchanged,
        }
