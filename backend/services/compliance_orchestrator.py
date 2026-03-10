from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from services.compliance_evidence_engine import ComplianceEvidenceEngine
from services.compliance_rule_engine import ComplianceRuleEngine


class ComplianceOrchestrator:
    """Combine deterministic rule checks and document-grounded evidence reviews."""

    def __init__(self):
        self.rule_engine = ComplianceRuleEngine()
        self.evidence_engine = ComplianceEvidenceEngine()

    async def run_review(
        self,
        *,
        db: Session,
        fund_id: int,
        scenario: str,
        query: str | None = None,
        investment_id: int | None = None,
        trigger_type: str = "manual",
        created_by: int | None = None,
        run_rule_engine: bool = True,
    ) -> dict[str, Any]:
        evidence_payload = await self.evidence_engine.run_review(
            db=db,
            fund_id=fund_id,
            scenario=scenario,
            query=query,
            investment_id=investment_id,
            trigger_type=trigger_type,
            created_by=created_by,
        )

        rule_summary: dict[str, Any] | None = None
        if run_rule_engine:
            checks = self.rule_engine.evaluate_all(
                fund_id=fund_id,
                db=db,
                trigger_type=trigger_type,
                trigger_source=scenario,
                trigger_source_id=investment_id or fund_id,
            )
            rule_summary = {
                "checked_count": len(checks),
                "failed_count": sum(1 for row in checks if row.result in {"fail", "error"}),
                "warning_count": sum(1 for row in checks if row.result == "warning"),
                "results": [
                    {
                        "rule_id": row.rule_id,
                        "result": row.result,
                        "detail": row.detail,
                        "actual_value": row.actual_value,
                        "threshold_value": row.threshold_value,
                    }
                    for row in checks
                ],
            }

            if rule_summary["failed_count"] > 0 and evidence_payload["result"] == "pass":
                evidence_payload["result"] = "warn"
                evidence_payload["summary"] = (
                    f"{evidence_payload['summary']} "
                    "정형 룰엔진 위반이 존재하므로 최종 확인이 필요합니다."
                ).strip()

        return {
            "review": evidence_payload,
            "rule_summary": rule_summary,
        }
