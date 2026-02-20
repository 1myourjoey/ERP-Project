from datetime import datetime
import re

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund, LP
from models.phase3 import CapitalCall, CapitalCallItem
from models.workflow_instance import WorkflowInstance

router = APIRouter(tags=["admin"])


CAPITAL_CALL_ID_PATTERNS = [
    re.compile(r"\[linked\s*capitalcall\s*:\s*#?(\d+)\]", re.IGNORECASE),
    re.compile(r"\[capitalcall\s*:\s*#?(\d+)\]", re.IGNORECASE),
    re.compile(r"capital_call_id\s*[:=]\s*(\d+)", re.IGNORECASE),
]


def _extract_capital_call_id(memo: str | None) -> int | None:
    if not memo:
        return None
    for pattern in CAPITAL_CALL_ID_PATTERNS:
        matched = pattern.search(memo)
        if not matched:
            continue
        try:
            return int(matched.group(1))
        except (TypeError, ValueError):
            continue
    return None


def _looks_like_capital_call_process(instance: WorkflowInstance) -> bool:
    template_name = instance.workflow.name if instance.workflow else ""
    template_category = instance.workflow.category if instance.workflow else ""
    text = " ".join(
        [
            instance.name or "",
            instance.memo or "",
            template_name or "",
            template_category or "",
        ]
    ).lower()
    return any(token in text for token in ("capital call", "출자", "납입"))


@router.get("/api/admin/integrity-check")
def run_integrity_check(db: Session = Depends(get_db)):
    lp_paid_rows = (
        db.query(
            CapitalCallItem.lp_id.label("lp_id"),
            func.coalesce(func.sum(CapitalCallItem.amount), 0).label("paid_total"),
        )
        .join(CapitalCall, CapitalCall.id == CapitalCallItem.capital_call_id)
        .filter(CapitalCallItem.paid == 1)
        .group_by(CapitalCallItem.lp_id)
        .all()
    )
    paid_by_lp = {int(row.lp_id): int(row.paid_total or 0) for row in lp_paid_rows}

    lp_mismatches: list[dict] = []
    for lp in db.query(LP).order_by(LP.fund_id.asc(), LP.id.asc()).all():
        expected = paid_by_lp.get(lp.id, 0)
        actual = int(lp.paid_in or 0)
        if actual == expected:
            continue
        lp_mismatches.append(
            {
                "lp_id": lp.id,
                "fund_id": lp.fund_id,
                "lp_name": lp.name,
                "paid_in": actual,
                "sum_paid_items": expected,
                "delta": actual - expected,
            }
        )

    lp_totals_by_fund_rows = (
        db.query(
            LP.fund_id.label("fund_id"),
            func.coalesce(func.sum(LP.paid_in), 0).label("lp_total"),
        )
        .group_by(LP.fund_id)
        .all()
    )
    lp_totals_by_fund = {int(row.fund_id): int(row.lp_total or 0) for row in lp_totals_by_fund_rows}

    paid_item_totals_by_fund_rows = (
        db.query(
            CapitalCall.fund_id.label("fund_id"),
            func.coalesce(func.sum(CapitalCallItem.amount), 0).label("item_total"),
        )
        .join(CapitalCallItem, CapitalCallItem.capital_call_id == CapitalCall.id)
        .filter(CapitalCallItem.paid == 1)
        .group_by(CapitalCall.fund_id)
        .all()
    )
    paid_item_totals_by_fund = {
        int(row.fund_id): int(row.item_total or 0)
        for row in paid_item_totals_by_fund_rows
    }

    fund_mismatches: list[dict] = []
    for fund in db.query(Fund).order_by(Fund.id.asc()).all():
        lp_total = lp_totals_by_fund.get(fund.id, 0)
        paid_item_total = paid_item_totals_by_fund.get(fund.id, 0)
        if lp_total == paid_item_total:
            continue
        fund_mismatches.append(
            {
                "fund_id": fund.id,
                "fund_name": fund.name,
                "sum_lp_paid_in": lp_total,
                "sum_paid_items": paid_item_total,
                "delta": lp_total - paid_item_total,
            }
        )

    workflow_instances = db.query(WorkflowInstance).order_by(WorkflowInstance.id.asc()).all()
    workflow_by_call_id: dict[int, list[WorkflowInstance]] = {}
    for instance in workflow_instances:
        call_id = _extract_capital_call_id(instance.memo)
        if call_id is None:
            continue
        workflow_by_call_id.setdefault(call_id, []).append(instance)

    orphan_capital_calls: list[dict] = []
    for call in db.query(CapitalCall).order_by(CapitalCall.id.asc()).all():
        linked_instance = None
        if call.linked_workflow_instance_id is not None:
            linked_instance = db.get(WorkflowInstance, call.linked_workflow_instance_id)

        found_instances = workflow_by_call_id.get(call.id, [])
        if linked_instance is None and not found_instances:
            orphan_capital_calls.append(
                {
                    "capital_call_id": call.id,
                    "fund_id": call.fund_id,
                    "call_type": call.call_type,
                    "call_date": call.call_date.isoformat() if call.call_date else None,
                    "reason": "No linked workflow instance",
                }
            )

    orphan_workflows: list[dict] = []
    for instance in workflow_instances:
        call_id = _extract_capital_call_id(instance.memo)
        if call_id is None:
            if _looks_like_capital_call_process(instance):
                orphan_workflows.append(
                    {
                        "workflow_instance_id": instance.id,
                        "workflow_name": instance.name,
                        "status": instance.status,
                        "reason": "Capital-call-like workflow without capital_call_id in memo",
                    }
                )
            continue

        if db.get(CapitalCall, call_id) is None:
            orphan_workflows.append(
                {
                    "workflow_instance_id": instance.id,
                    "workflow_name": instance.name,
                    "status": instance.status,
                    "capital_call_id": call_id,
                    "reason": "Referenced capital call does not exist",
                }
            )

    return {
        "checked_at": datetime.utcnow().isoformat(),
        "lp_paid_in_mismatches": lp_mismatches,
        "fund_total_mismatches": fund_mismatches,
        "orphan_capital_calls": orphan_capital_calls,
        "orphan_workflows": orphan_workflows,
        "summary": {
            "lp_mismatch_count": len(lp_mismatches),
            "fund_mismatch_count": len(fund_mismatches),
            "orphan_capital_call_count": len(orphan_capital_calls),
            "orphan_workflow_count": len(orphan_workflows),
        },
    }
