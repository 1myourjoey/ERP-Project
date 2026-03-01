from __future__ import annotations

from datetime import date, datetime, timedelta
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from models.compliance import (
    ComplianceCheck,
    ComplianceDocument,
    FundComplianceRule,
)
from models.fund import Fund, LP
from models.investment import Investment, PortfolioCompany
from models.regular_report import RegularReport
from models.task import Task


class ComplianceRuleEngine:
    """L1~L5 compliance rule evaluation engine."""

    def evaluate_rule(
        self,
        *,
        rule: FundComplianceRule,
        fund_id: int,
        db: Session,
        _visited: set[str] | None = None,
    ) -> ComplianceCheck:
        condition = self._safe_condition(rule.condition)
        rule_type = str(condition.get("type") or "").strip().lower()

        visited = _visited or set()
        if rule.rule_code:
            if rule.rule_code in visited:
                return self._result(
                    rule=rule,
                    fund_id=fund_id,
                    result="warning",
                    detail=f"Composite rule recursion detected: {rule.rule_code}",
                )
            visited = {*(visited or set()), rule.rule_code}

        if rule_type == "exists":
            return self._evaluate_l1_exists(rule=rule, fund_id=fund_id, condition=condition, db=db)
        if rule_type == "range":
            return self._evaluate_l2_range(rule=rule, fund_id=fund_id, condition=condition, db=db)
        if rule_type == "deadline":
            return self._evaluate_l3_deadline(rule=rule, fund_id=fund_id, condition=condition, db=db)
        if rule_type == "cross_validate":
            return self._evaluate_l4_cross(rule=rule, fund_id=fund_id, condition=condition, db=db)
        if rule_type == "composite":
            return self._evaluate_l5_composite(
                rule=rule,
                fund_id=fund_id,
                condition=condition,
                db=db,
                visited=visited,
            )

        return self._result(
            rule=rule,
            fund_id=fund_id,
            result="error",
            detail=f"Unknown rule type: {rule_type or '(empty)'}",
        )

    def evaluate_all(
        self,
        *,
        fund_id: int,
        db: Session,
        trigger_type: str = "manual",
        trigger_source: str | None = None,
        trigger_source_id: int | None = None,
    ) -> list[ComplianceCheck]:
        rules = (
            db.query(FundComplianceRule)
            .filter(
                or_(FundComplianceRule.fund_id == fund_id, FundComplianceRule.fund_id.is_(None)),
                FundComplianceRule.is_active == True,
            )
            .order_by(FundComplianceRule.id.asc())
            .all()
        )

        results: list[ComplianceCheck] = []
        try:
            for rule in rules:
                check = self.evaluate_rule(rule=rule, fund_id=fund_id, db=db)
                check.trigger_type = trigger_type
                check.trigger_source = trigger_source
                check.trigger_source_id = trigger_source_id
                db.add(check)
                db.flush()

                if check.result in {"fail", "error"} and bool(rule.auto_task):
                    self._create_remediation_task(
                        check=check,
                        rule=rule,
                        fund_id=fund_id,
                        trigger_source=trigger_source,
                        trigger_source_id=trigger_source_id,
                        db=db,
                    )
                results.append(check)

            db.commit()
        except Exception:
            db.rollback()
            raise

        return results

    def _evaluate_l1_exists(
        self,
        *,
        rule: FundComplianceRule,
        fund_id: int,
        condition: dict,
        db: Session,
    ) -> ComplianceCheck:
        target = str(condition.get("target") or "").strip().lower()
        if target == "document":
            needle = str(condition.get("document_type") or condition.get("document_name") or "").strip()
            query = db.query(ComplianceDocument).filter(ComplianceDocument.is_active == True)
            if needle:
                like = f"%{needle}%"
                query = query.filter(
                    or_(
                        ComplianceDocument.title.ilike(like),
                        ComplianceDocument.document_type.ilike(like),
                    )
                )
            exists = query.first() is not None
            if exists:
                return self._result(
                    rule=rule,
                    fund_id=fund_id,
                    result="pass",
                    actual_value=needle or "active_document_found",
                )
            return self._violation(
                rule=rule,
                fund_id=fund_id,
                actual_value="missing",
                threshold_value=needle or "document_exists",
                detail=f"Required compliance document not found: {needle or 'any active document'}",
            )

        if target == "investment":
            count = (
                db.query(func.count(Investment.id))
                .filter(Investment.fund_id == fund_id)
                .scalar()
                or 0
            )
            if int(count) > 0:
                return self._result(rule=rule, fund_id=fund_id, result="pass", actual_value=str(int(count)))
            return self._violation(
                rule=rule,
                fund_id=fund_id,
                actual_value="0",
                threshold_value=">=1",
                detail="No investment found for this fund.",
            )

        return self._result(
            rule=rule,
            fund_id=fund_id,
            result="warning",
            detail=f"L1 target is not supported: {target or '(empty)'}",
        )

    def _evaluate_l2_range(
        self,
        *,
        rule: FundComplianceRule,
        fund_id: int,
        condition: dict,
        db: Session,
    ) -> ComplianceCheck:
        target = str(condition.get("target") or "").strip().lower()
        max_val = self._to_float(condition.get("max"))
        min_val = self._to_float(condition.get("min"))

        if target == "investment_ratio":
            fund = db.get(Fund, fund_id)
            commitment_total = float((fund.commitment_total if fund else 0) or 0)
            if commitment_total <= 0:
                return self._violation(
                    rule=rule,
                    fund_id=fund_id,
                    actual_value="0",
                    threshold_value=f"max={max_val}",
                    detail="Fund commitment_total is missing or zero.",
                )

            rows = db.query(Investment).filter(Investment.fund_id == fund_id).all()
            worst_ratio = 0.0
            worst_name = ""
            for inv in rows:
                ratio = float(inv.amount or 0) / commitment_total
                if ratio >= worst_ratio:
                    worst_ratio = ratio
                    company = db.get(PortfolioCompany, inv.company_id)
                    worst_name = company.name if company else f"company#{inv.company_id}"

            if max_val is not None and worst_ratio > max_val:
                return self._violation(
                    rule=rule,
                    fund_id=fund_id,
                    actual_value=f"{worst_ratio:.2%}",
                    threshold_value=f"{max_val:.2%}",
                    detail=f"{worst_name} investment ratio {worst_ratio:.2%} exceeds limit {max_val:.2%}.",
                )
            if min_val is not None and worst_ratio < min_val:
                return self._violation(
                    rule=rule,
                    fund_id=fund_id,
                    actual_value=f"{worst_ratio:.2%}",
                    threshold_value=f"{min_val:.2%}",
                    detail=f"Highest investment ratio {worst_ratio:.2%} is below minimum {min_val:.2%}.",
                )

            threshold = f"{max_val:.2%}" if max_val is not None else (f"{min_val:.2%}" if min_val is not None else None)
            return self._result(
                rule=rule,
                fund_id=fund_id,
                result="pass",
                actual_value=f"{worst_ratio:.2%}",
                threshold_value=threshold,
                detail=f"Max single investment ratio is {worst_ratio:.2%}.",
            )

        return self._result(
            rule=rule,
            fund_id=fund_id,
            result="warning",
            detail=f"L2 target is not supported: {target or '(empty)'}",
        )

    def _evaluate_l3_deadline(
        self,
        *,
        rule: FundComplianceRule,
        fund_id: int,
        condition: dict,
        db: Session,
    ) -> ComplianceCheck:
        target = str(condition.get("target") or "").strip().lower()
        days_before = int(condition.get("days_before") or 0)
        today = date.today()

        if target in {"quarterly_report", "report"}:
            row = (
                db.query(RegularReport)
                .filter(RegularReport.fund_id == fund_id, RegularReport.due_date.isnot(None))
                .order_by(RegularReport.due_date.asc())
                .first()
            )
            if not row or not row.due_date:
                return self._result(
                    rule=rule,
                    fund_id=fund_id,
                    result="pass",
                    detail="No scheduled report due date found.",
                )

            days_left = (row.due_date - today).days
            if days_left <= days_before:
                if days_left < 0:
                    return self._violation(
                        rule=rule,
                        fund_id=fund_id,
                        actual_value=f"D+{abs(days_left)}",
                        threshold_value=f"D-{days_before}",
                        detail=f"Report deadline overdue by {abs(days_left)} day(s).",
                    )
                return self._violation(
                    rule=rule,
                    fund_id=fund_id,
                    actual_value=f"D-{days_left}",
                    threshold_value=f"D-{days_before}",
                    detail=f"Report due soon: {row.due_date.isoformat()} (D-{days_left}).",
                )

            return self._result(
                rule=rule,
                fund_id=fund_id,
                result="pass",
                actual_value=f"D-{days_left}",
                threshold_value=f"D-{days_before}",
                detail=f"Next report due {row.due_date.isoformat()}.",
            )

        return self._result(
            rule=rule,
            fund_id=fund_id,
            result="warning",
            detail=f"L3 target is not supported: {target or '(empty)'}",
        )

    def _evaluate_l4_cross(
        self,
        *,
        rule: FundComplianceRule,
        fund_id: int,
        condition: dict,
        db: Session,
    ) -> ComplianceCheck:
        source = str(condition.get("source") or "").strip().lower()
        target = str(condition.get("target") or "").strip().lower()
        tolerance = abs(self._to_float(condition.get("tolerance")) or 0.0)

        if source == "lp_commitment_sum" and target == "fund_commitment_total":
            lp_sum = float(
                db.query(func.coalesce(func.sum(LP.commitment), 0))
                .filter(LP.fund_id == fund_id)
                .scalar()
                or 0
            )
            fund = db.get(Fund, fund_id)
            fund_commitment = float((fund.commitment_total if fund else 0) or 0)
            diff = abs(lp_sum - fund_commitment)
            if diff > tolerance:
                return self._violation(
                    rule=rule,
                    fund_id=fund_id,
                    actual_value=f"{lp_sum:,.0f}",
                    threshold_value=f"{fund_commitment:,.0f}",
                    detail=f"LP commitment sum ({lp_sum:,.0f}) does not match fund commitment_total ({fund_commitment:,.0f}).",
                )
            return self._result(
                rule=rule,
                fund_id=fund_id,
                result="pass",
                actual_value=f"{lp_sum:,.0f}",
                threshold_value=f"{fund_commitment:,.0f}",
            )

        return self._result(
            rule=rule,
            fund_id=fund_id,
            result="warning",
            detail=f"L4 source/target is not supported: {source or '(empty)'} -> {target or '(empty)'}",
        )

    def _evaluate_l5_composite(
        self,
        *,
        rule: FundComplianceRule,
        fund_id: int,
        condition: dict,
        db: Session,
        visited: set[str],
    ) -> ComplianceCheck:
        rule_codes = [str(item).strip() for item in (condition.get("rules") or []) if str(item).strip()]
        logic = str(condition.get("logic") or "AND").strip().upper()

        if not rule_codes:
            return self._result(
                rule=rule,
                fund_id=fund_id,
                result="warning",
                detail="Composite rule has no child rules.",
            )

        child_rules = (
            db.query(FundComplianceRule)
            .filter(FundComplianceRule.rule_code.in_(rule_codes), FundComplianceRule.is_active == True)
            .all()
        )
        child_map = {row.rule_code: row for row in child_rules}
        missing_codes = [code for code in rule_codes if code not in child_map]
        if missing_codes:
            return self._result(
                rule=rule,
                fund_id=fund_id,
                result="warning",
                detail=f"Composite child rules not found: {', '.join(missing_codes)}",
            )

        child_checks: list[ComplianceCheck] = []
        for code in rule_codes:
            child = child_map[code]
            child_checks.append(
                self.evaluate_rule(rule=child, fund_id=fund_id, db=db, _visited=visited)
            )

        child_pass = [check.result == "pass" for check in child_checks]
        if logic == "OR":
            violated = not any(child_pass)
        else:
            violated = not all(child_pass)

        if violated:
            details = ", ".join(f"{c.rule_id}:{c.result}" for c in child_checks)
            return self._violation(
                rule=rule,
                fund_id=fund_id,
                actual_value=details,
                threshold_value=f"logic={logic}",
                detail=f"Composite condition failed ({logic}).",
            )

        return self._result(
            rule=rule,
            fund_id=fund_id,
            result="pass",
            actual_value=f"logic={logic}",
            detail="Composite condition passed.",
        )

    def _create_remediation_task(
        self,
        *,
        check: ComplianceCheck,
        rule: FundComplianceRule,
        fund_id: int,
        trigger_source: str | None,
        trigger_source_id: int | None,
        db: Session,
    ) -> None:
        existing = (
            db.query(Task)
            .filter(
                Task.fund_id == fund_id,
                Task.source == "compliance_rule_engine",
                Task.status.in_(["pending", "in_progress"]),
                Task.title == f"[Compliance] {rule.rule_name} remediation",
            )
            .order_by(Task.id.desc())
            .first()
        )
        if existing:
            check.remediation_task_id = existing.id
            return

        task = Task(
            title=f"[Compliance] {rule.rule_name} remediation",
            memo=check.detail,
            deadline=datetime.utcnow() + timedelta(days=3),
            estimated_time="1h",
            quadrant="Q1",
            status="pending",
            category="compliance",
            fund_id=fund_id,
            investment_id=(trigger_source_id if trigger_source == "investment_create" else None),
            auto_generated=True,
            source="compliance_rule_engine",
        )
        db.add(task)
        db.flush()
        check.remediation_task_id = task.id

    @staticmethod
    def _safe_condition(value: object) -> dict:
        return value if isinstance(value, dict) else {}

    @staticmethod
    def _to_float(value: object) -> float | None:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _severity_to_result(severity: str | None) -> str:
        mapping = {
            "critical": "error",
            "error": "error",
            "warning": "warning",
            "info": "warning",
        }
        return mapping.get(str(severity or "warning").strip().lower(), "warning")

    def _violation(
        self,
        *,
        rule: FundComplianceRule,
        fund_id: int,
        actual_value: str | None = None,
        threshold_value: str | None = None,
        detail: str | None = None,
    ) -> ComplianceCheck:
        return self._result(
            rule=rule,
            fund_id=fund_id,
            result=self._severity_to_result(rule.severity),
            actual_value=actual_value,
            threshold_value=threshold_value,
            detail=detail,
        )

    @staticmethod
    def _result(
        *,
        rule: FundComplianceRule,
        fund_id: int,
        result: str,
        actual_value: str | None = None,
        threshold_value: str | None = None,
        detail: str | None = None,
    ) -> ComplianceCheck:
        return ComplianceCheck(
            rule_id=rule.id,
            fund_id=fund_id,
            result=result,
            actual_value=actual_value,
            threshold_value=threshold_value,
            detail=detail,
        )
