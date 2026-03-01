from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from models.compliance import FundComplianceRule
from models.fund import Fund, LP
from models.investment import Investment, PortfolioCompany
from models.pre_report_check import PreReportCheck
from models.regular_report import RegularReport
from models.task import Task
from services.compliance_rule_engine import ComplianceRuleEngine


class PreReportChecker:
    """Run pre-submission validation for regular reports."""

    APPROVED_STATUSES = {"제출완료", "확인완료", "전송완료", "approved", "submitted"}
    LEGAL_RULE_PREFIXES = ("INV-LIMIT", "RPT-DEADLINE", "CAP-CROSS", "DOC-EXIST", "CMP-")

    def __init__(self):
        self.rule_engine = ComplianceRuleEngine()

    def check_all(
        self,
        *,
        report_id: int,
        db: Session,
        created_by: int | None = None,
    ) -> PreReportCheck:
        report = db.get(RegularReport, report_id)
        if not report:
            raise ValueError("정기보고를 찾을 수 없습니다.")
        if report.fund_id is None:
            raise ValueError("조합이 지정되지 않은 보고서는 사전 검증을 실행할 수 없습니다.")

        fund = db.get(Fund, report.fund_id)
        if not fund:
            raise ValueError("보고서에 연결된 조합을 찾을 수 없습니다.")

        legal_findings = self._check_legal(report=report, fund=fund, db=db)
        cross_findings = self._check_cross_validation(report=report, fund=fund, db=db)
        guideline_findings = self._check_guideline(report=report, fund=fund, db=db)
        contract_findings = self._check_contract(report=report, fund=fund, db=db)

        all_findings = [
            *legal_findings,
            *cross_findings,
            *guideline_findings,
            *contract_findings,
        ]

        errors = [row for row in all_findings if str(row.get("severity")) == "error"]
        warnings = [row for row in all_findings if str(row.get("severity")) == "warning"]
        infos = [row for row in all_findings if str(row.get("severity")) == "info"]
        overall_status = "error" if errors else ("warning" if warnings else "pass")

        tasks_created = 0
        try:
            if errors:
                tasks_created = self._create_remediation_tasks(
                    errors=errors,
                    fund_id=fund.id,
                    report_id=report.id,
                    db=db,
                )

            record = PreReportCheck(
                report_id=report.id,
                fund_id=fund.id,
                overall_status=overall_status,
                legal_check=legal_findings,
                cross_check=cross_findings,
                guideline_check=guideline_findings,
                contract_check=contract_findings,
                total_errors=len(errors),
                total_warnings=len(warnings),
                total_info=len(infos),
                tasks_created=tasks_created,
                created_by=created_by,
            )
            db.add(record)
            db.commit()
            db.refresh(record)
            return record
        except Exception:
            db.rollback()
            raise

    def _check_legal(self, *, report: RegularReport, fund: Fund, db: Session) -> list[dict[str, Any]]:
        findings: list[dict[str, Any]] = []
        commitment_total = float(fund.commitment_total or 0)

        if commitment_total > 0:
            investments = db.query(Investment).filter(Investment.fund_id == fund.id).all()
            for inv in investments:
                ratio = float(inv.amount or 0) / commitment_total
                if ratio <= 0.20:
                    continue
                company = db.get(PortfolioCompany, inv.company_id)
                company_name = company.name if company else f"기업#{inv.company_id}"
                findings.append(
                    {
                        "type": "legal",
                        "severity": "error",
                        "title": "동일기업 투자한도 초과",
                        "detail": f"{company_name}: {ratio:.1%} (한도 20%)",
                        "reference": "자본시장법 제81조",
                        "source": "hard_rule",
                    }
                )
        else:
            findings.append(
                {
                    "type": "legal",
                    "severity": "warning",
                    "title": "약정총액 미설정",
                    "detail": "조합 약정총액(commitment_total)이 없어 투자한도 검증 정확도가 낮습니다.",
                    "reference": None,
                    "source": "hard_rule",
                }
            )

        prefix_filters = [
            FundComplianceRule.rule_code.like(f"{prefix}%")
            for prefix in self.LEGAL_RULE_PREFIXES
        ]
        rules = (
            db.query(FundComplianceRule)
            .filter(
                FundComplianceRule.is_active == True,
                or_(FundComplianceRule.fund_id == fund.id, FundComplianceRule.fund_id.is_(None)),
                or_(*prefix_filters),
            )
            .order_by(FundComplianceRule.rule_code.asc())
            .all()
        )
        for rule in rules:
            check = self.rule_engine.evaluate_rule(rule=rule, fund_id=fund.id, db=db)
            if check.result == "pass":
                continue
            severity = "error" if check.result in {"error", "fail"} else "warning"
            findings.append(
                {
                    "type": "legal",
                    "severity": severity,
                    "title": rule.rule_name,
                    "detail": check.detail or f"{rule.rule_code} 규칙 위반 가능성이 있습니다.",
                    "reference": self._rule_reference(rule.rule_code),
                    "rule_code": rule.rule_code,
                    "source": "rule_engine",
                }
            )

        return self._dedupe_findings(findings)

    def _check_cross_validation(self, *, report: RegularReport, fund: Fund, db: Session) -> list[dict[str, Any]]:
        findings: list[dict[str, Any]] = []
        commitment_total = float(fund.commitment_total or 0)
        lp_sum = float(
            db.query(func.coalesce(func.sum(LP.commitment), 0))
            .filter(LP.fund_id == fund.id)
            .scalar()
            or 0
        )
        if commitment_total > 0:
            diff = abs(lp_sum - commitment_total)
            if diff > 1:
                findings.append(
                    {
                        "type": "cross",
                        "severity": "error",
                        "title": "LP 출자약정 합계 불일치",
                        "detail": f"LP 합계: {lp_sum:,.0f} ≠ 약정총액: {commitment_total:,.0f}",
                        "difference": diff,
                        "source": "cross_validation",
                    }
                )

            inv_total = float(
                db.query(func.coalesce(func.sum(Investment.amount), 0))
                .filter(Investment.fund_id == fund.id)
                .scalar()
                or 0
            )
            if inv_total > commitment_total:
                findings.append(
                    {
                        "type": "cross",
                        "severity": "warning",
                        "title": "투자 합계 > 약정총액",
                        "detail": f"투자합계: {inv_total:,.0f} > 약정총액: {commitment_total:,.0f}",
                        "difference": inv_total - commitment_total,
                        "source": "cross_validation",
                    }
                )

        if report.due_date and report.submitted_date and report.submitted_date < report.due_date:
            findings.append(
                {
                    "type": "cross",
                    "severity": "info",
                    "title": "조기 제출",
                    "detail": "제출일이 마감일보다 앞섭니다. 일정상 문제는 없습니다.",
                    "source": "cross_validation",
                }
            )

        return findings

    def _check_guideline(self, *, report: RegularReport, fund: Fund, db: Session) -> list[dict[str, Any]]:
        findings: list[dict[str, Any]] = []
        status = str(report.status or "").strip()
        if status not in self.APPROVED_STATUSES:
            findings.append(
                {
                    "type": "guideline",
                    "severity": "warning",
                    "title": "보고서 미승인 상태",
                    "detail": f"현재 상태: {status or '미지정'} — 제출 전 승인 절차를 확인하세요.",
                    "source": "guideline",
                }
            )

        if not str(report.period or "").strip():
            findings.append(
                {
                    "type": "guideline",
                    "severity": "warning",
                    "title": "보고 기간 누락",
                    "detail": "보고 기간(period)이 비어 있습니다.",
                    "source": "guideline",
                }
            )

        if report.due_date is None:
            findings.append(
                {
                    "type": "guideline",
                    "severity": "warning",
                    "title": "마감일 미입력",
                    "detail": "마감일(due_date) 정보가 없어 제출 기한 점검이 제한됩니다.",
                    "source": "guideline",
                }
            )
        return findings

    def _check_contract(self, *, report: RegularReport, fund: Fund, db: Session) -> list[dict[str, Any]]:
        findings: list[dict[str, Any]] = []
        today = date.today()

        if fund.dissolution_date and fund.dissolution_date < today:
            findings.append(
                {
                    "type": "contract",
                    "severity": "warning",
                    "title": "조합 존속기한 경과",
                    "detail": f"존속기한: {fund.dissolution_date.isoformat()} — 연장 결의 필요 여부를 확인하세요.",
                    "source": "contract",
                }
            )

        if fund.maturity_date and report.due_date and report.due_date > fund.maturity_date:
            findings.append(
                {
                    "type": "contract",
                    "severity": "warning",
                    "title": "보고 마감일-만기일 불일치",
                    "detail": (
                        f"보고 마감일({report.due_date.isoformat()})이 "
                        f"조합 만기일({fund.maturity_date.isoformat()}) 이후입니다."
                    ),
                    "source": "contract",
                }
            )

        return findings

    def _create_remediation_tasks(
        self,
        *,
        errors: list[dict[str, Any]],
        fund_id: int,
        report_id: int,
        db: Session,
    ) -> int:
        created_count = 0
        for error in errors:
            title = f"[보고서 사전검증] {str(error.get('title') or '오류').strip()}"
            existing = (
                db.query(Task)
                .filter(
                    Task.fund_id == fund_id,
                    Task.source == "pre_report_check",
                    Task.status.in_(["pending", "in_progress"]),
                    Task.title == title,
                )
                .order_by(Task.id.desc())
                .first()
            )
            if existing:
                continue

            detail = str(error.get("detail") or "").strip()
            reference = str(error.get("reference") or "").strip()
            task = Task(
                title=title,
                memo=(
                    f"[보고서 ID] {report_id}\n"
                    f"[검증유형] {error.get('type')}\n"
                    f"[상세] {detail}\n"
                    f"[근거] {reference if reference else '-'}"
                ),
                deadline=datetime.utcnow() + timedelta(days=3),
                estimated_time="1h",
                quadrant="Q1",
                status="pending",
                category="보고서검증",
                fund_id=fund_id,
                auto_generated=True,
                source="pre_report_check",
                is_report=True,
            )
            db.add(task)
            db.flush()
            created_count += 1
        return created_count

    @staticmethod
    def serialize(row: PreReportCheck) -> dict[str, Any]:
        return {
            "id": row.id,
            "report_id": row.report_id,
            "fund_id": row.fund_id,
            "checked_at": row.checked_at.isoformat() if row.checked_at else None,
            "overall_status": row.overall_status,
            "legal_check": row.legal_check if isinstance(row.legal_check, list) else [],
            "cross_check": row.cross_check if isinstance(row.cross_check, list) else [],
            "guideline_check": row.guideline_check if isinstance(row.guideline_check, list) else [],
            "contract_check": row.contract_check if isinstance(row.contract_check, list) else [],
            "total_errors": int(row.total_errors or 0),
            "total_warnings": int(row.total_warnings or 0),
            "total_info": int(row.total_info or 0),
            "tasks_created": int(row.tasks_created or 0),
            "created_by": row.created_by,
        }

    @staticmethod
    def _rule_reference(rule_code: str | None) -> str | None:
        code = str(rule_code or "")
        if code.startswith("INV-LIMIT"):
            return "자본시장법 제81조"
        if code.startswith("RPT-DEADLINE"):
            return "관련 보고의무 지침"
        if code.startswith("CAP-CROSS"):
            return "출자약정 정합성 내부통제 기준"
        if code.startswith("DOC-EXIST"):
            return "수탁계약 필수 보관 규정"
        return None

    @staticmethod
    def _dedupe_findings(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
        seen: set[tuple[str, str, str]] = set()
        deduped: list[dict[str, Any]] = []
        for row in findings:
            key = (
                str(row.get("type") or ""),
                str(row.get("title") or ""),
                str(row.get("detail") or ""),
            )
            if key in seen:
                continue
            seen.add(key)
            deduped.append(row)
        return deduped
