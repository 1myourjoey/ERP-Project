from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import or_

from database import SessionLocal
from models.compliance import ComplianceDocument, FundComplianceRule
from models.fund import Fund
from services.compliance_rule_engine import ComplianceRuleEngine


@dataclass
class ScanResult:
    fund_id: int
    fund_name: str
    total_rules: int
    passed: int
    failed: int
    warnings: int
    new_violations: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        return {
            "fund_id": self.fund_id,
            "fund_name": self.fund_name,
            "total_rules": self.total_rules,
            "passed": self.passed,
            "failed": self.failed,
            "warnings": self.warnings,
            "new_violations": self.new_violations,
        }


class PeriodicComplianceScanner:
    """Scheduled compliance scanner across funds."""

    OPERATING_STATUSES = {"active", "운용중"}

    def __init__(self):
        self.engine = ComplianceRuleEngine()

    async def run_daily_scan(
        self,
        *,
        trigger_type: str = "scheduled",
        trigger_source: str = "daily_scan",
    ) -> dict[str, Any]:
        return self._run_scan(
            levels=["L1", "L2", "L3"],
            trigger_type=trigger_type,
            trigger_source=trigger_source,
            operating_only=True,
        )

    async def run_full_audit(
        self,
        *,
        trigger_type: str = "scheduled",
        trigger_source: str = "monthly_full_audit",
    ) -> dict[str, Any]:
        return self._run_scan(
            levels=None,
            trigger_type=trigger_type,
            trigger_source=trigger_source,
            operating_only=False,
        )

    async def run_fund_scan(
        self,
        *,
        fund_id: int,
        levels: list[str] | None = None,
        trigger_type: str = "manual",
        trigger_source: str = "manual_scan",
    ) -> dict[str, Any]:
        db = SessionLocal()
        try:
            fund = db.get(Fund, fund_id)
            if not fund:
                raise ValueError("fund not found")

            result = self._scan_fund(
                db=db,
                fund=fund,
                levels=levels,
                trigger_type=trigger_type,
                trigger_source=trigger_source,
            )
            self._create_scan_alerts(
                db=db,
                trigger_source=trigger_source,
                scan_results=[result],
            )
            db.commit()
            return self._build_scan_payload(
                trigger_source=trigger_source,
                trigger_type=trigger_type,
                scan_results=[result],
            )
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def _run_scan(
        self,
        *,
        levels: list[str] | None,
        trigger_type: str,
        trigger_source: str,
        operating_only: bool,
    ) -> dict[str, Any]:
        db = SessionLocal()
        try:
            funds_query = db.query(Fund)
            if operating_only:
                funds_query = funds_query.filter(Fund.status.in_(list(self.OPERATING_STATUSES)))
            funds = funds_query.order_by(Fund.id.asc()).all()
            if not funds and operating_only:
                # Fallback for environments where status values are not normalized.
                funds = db.query(Fund).order_by(Fund.id.asc()).all()

            scan_results = [
                self._scan_fund(
                    db=db,
                    fund=fund,
                    levels=levels,
                    trigger_type=trigger_type,
                    trigger_source=trigger_source,
                )
                for fund in funds
            ]

            self._create_scan_alerts(
                db=db,
                trigger_source=trigger_source,
                scan_results=scan_results,
            )
            db.commit()
            return self._build_scan_payload(
                trigger_source=trigger_source,
                trigger_type=trigger_type,
                scan_results=scan_results,
            )
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def _scan_fund(
        self,
        *,
        db,
        fund: Fund,
        levels: list[str] | None,
        trigger_type: str,
        trigger_source: str,
    ) -> ScanResult:
        rule_query = (
            db.query(FundComplianceRule)
            .filter(
                or_(FundComplianceRule.fund_id == fund.id, FundComplianceRule.fund_id.is_(None)),
                FundComplianceRule.is_active == True,
            )
            .order_by(FundComplianceRule.rule_code.asc())
        )
        if levels:
            rule_query = rule_query.filter(FundComplianceRule.level.in_(levels))
        rules = rule_query.all()

        passed = 0
        failed = 0
        warnings = 0
        violations: list[dict[str, Any]] = []

        for rule in rules:
            check = self.engine.evaluate_rule(rule=rule, fund_id=fund.id, db=db)
            check.trigger_type = trigger_type
            check.trigger_source = trigger_source
            check.trigger_source_id = fund.id
            db.add(check)
            db.flush()

            if check.result == "pass":
                passed += 1
            elif check.result in {"fail", "error"}:
                failed += 1
                violations.append(
                    {
                        "rule_code": rule.rule_code,
                        "rule_name": rule.rule_name,
                        "detail": check.detail,
                    }
                )
                if bool(rule.auto_task):
                    # Reuse Phase 49 task creation behavior to preserve consistency.
                    self.engine._create_remediation_task(
                        check=check,
                        rule=rule,
                        fund_id=fund.id,
                        trigger_source=trigger_source,
                        trigger_source_id=fund.id,
                        db=db,
                    )
            else:
                warnings += 1

        return ScanResult(
            fund_id=fund.id,
            fund_name=fund.name,
            total_rules=len(rules),
            passed=passed,
            failed=failed,
            warnings=warnings,
            new_violations=violations,
        )

    def _create_scan_alerts(
        self,
        *,
        db,
        trigger_source: str,
        scan_results: list[ScanResult],
    ) -> None:
        failed_funds = [row for row in scan_results if row.failed > 0]
        if not failed_funds:
            return

        now = datetime.utcnow()
        for row in failed_funds:
            db.add(
                ComplianceDocument(
                    title=f"[스캔경고] {row.fund_name} ({trigger_source})",
                    document_type="scan_alert",
                    version=now.strftime("%Y-%m-%d"),
                    effective_date=now,
                    content_summary=(
                        f"실패 {row.failed}건 / 경고 {row.warnings}건 / 총규칙 {row.total_rules}건"
                    ),
                    file_path=None,
                    is_active=True,
                )
            )

    @staticmethod
    def _build_scan_payload(
        *,
        trigger_source: str,
        trigger_type: str,
        scan_results: list[ScanResult],
    ) -> dict[str, Any]:
        return {
            "scan_type": trigger_source,
            "trigger_type": trigger_type,
            "executed_at": datetime.utcnow().isoformat(),
            "fund_count": len(scan_results),
            "total_rules": sum(item.total_rules for item in scan_results),
            "passed": sum(item.passed for item in scan_results),
            "failed": sum(item.failed for item in scan_results),
            "warnings": sum(item.warnings for item in scan_results),
            "results": [item.to_dict() for item in scan_results],
        }
