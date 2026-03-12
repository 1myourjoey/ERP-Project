from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.compliance import ComplianceObligation
from models.fund import Fund, LP
from models.investment import Investment, InvestmentDocument, PortfolioCompany
from models.task import Task
from models.transaction import Transaction
from models.user import User
from models.valuation import Valuation
from models.workflow import Workflow, WorkflowStep
from models.workflow_instance import WorkflowInstance, WorkflowStepInstance, WorkflowStepInstanceDocument


def build_name_map(rows: list[Any], value_attr: str = "name") -> dict[int, str | None]:
    result: dict[int, str | None] = {}
    for row in rows:
        result[getattr(row, "id")] = getattr(row, value_attr, None)
    return result


def load_reference_maps(
    db: Session,
    *,
    include: set[str] | None = None,
) -> dict[str, dict[int, Any]]:
    requested = include or {"fund", "company", "investment", "workflow", "workflow_step", "user", "lp"}
    result: dict[str, dict[int, Any]] = {}
    if "fund" in requested:
        result["fund"] = {row.id: row for row in db.query(Fund).all()}
    if "company" in requested:
        result["company"] = {row.id: row for row in db.query(PortfolioCompany).all()}
    if "investment" in requested:
        result["investment"] = {row.id: row for row in db.query(Investment).all()}
    if "workflow" in requested:
        result["workflow"] = {row.id: row for row in db.query(Workflow).all()}
    if "workflow_step" in requested:
        result["workflow_step"] = {row.id: row for row in db.query(WorkflowStep).all()}
    if "user" in requested:
        result["user"] = {row.id: row for row in db.query(User).all()}
    if "lp" in requested:
        result["lp"] = {row.id: row for row in db.query(LP).all()}
    return result


def group_sum(rows: list[Any], key_attr: str, value_attr: str) -> dict[int, float]:
    result: dict[int, float] = defaultdict(float)
    for row in rows:
        key = getattr(row, key_attr, None)
        if key is None:
            continue
        result[int(key)] += float(getattr(row, value_attr, 0) or 0)
    return dict(result)


def group_count(rows: list[Any], key_attr: str, predicate=None) -> dict[int, int]:
    result: dict[int, int] = defaultdict(int)
    for row in rows:
        if predicate and not predicate(row):
            continue
        key = getattr(row, key_attr, None)
        if key is None:
            continue
        result[int(key)] += 1
    return dict(result)


def group_distinct_count(rows: list[Any], key_attr: str, distinct_attr: str) -> dict[int, int]:
    buckets: dict[int, set[Any]] = defaultdict(set)
    for row in rows:
        key = getattr(row, key_attr, None)
        value = getattr(row, distinct_attr, None)
        if key is None or value is None:
            continue
        buckets[int(key)].add(value)
    return {key: len(values) for key, values in buckets.items()}


def latest_valuation_by_investment(db: Session) -> dict[int, Any]:
    rows = db.query(Valuation).order_by(Valuation.investment_id.asc(), Valuation.as_of_date.desc(), Valuation.id.desc()).all()
    result: dict[int, Any] = {}
    for row in rows:
        if row.investment_id not in result:
            result[row.investment_id] = row
    return result


def latest_valuation_totals_by_fund(db: Session) -> dict[int, float]:
    latest_map = latest_valuation_by_investment(db)
    totals: dict[int, float] = defaultdict(float)
    for row in latest_map.values():
        totals[int(row.fund_id)] += float(row.total_fair_value or row.value or 0)
    return dict(totals)


def active_workflow_counts_by_fund(db: Session) -> dict[int, int]:
    return {
        int(fund_id): int(count or 0)
        for fund_id, count in db.query(WorkflowInstance.fund_id, func.count(WorkflowInstance.id))
        .filter(WorkflowInstance.status == "active", WorkflowInstance.fund_id.isnot(None))
        .group_by(WorkflowInstance.fund_id)
        .all()
    }


def active_workflow_counts_by_investment(db: Session) -> dict[int, int]:
    return {
        int(investment_id): int(count or 0)
        for investment_id, count in db.query(WorkflowInstance.investment_id, func.count(WorkflowInstance.id))
        .filter(WorkflowInstance.status == "active", WorkflowInstance.investment_id.isnot(None))
        .group_by(WorkflowInstance.investment_id)
        .all()
    }


def open_task_counts_by_fund(db: Session) -> dict[int, int]:
    return {
        int(fund_id): int(count or 0)
        for fund_id, count in db.query(Task.fund_id, func.count(Task.id))
        .filter(Task.fund_id.isnot(None), Task.status != "completed")
        .group_by(Task.fund_id)
        .all()
    }


def open_task_counts_by_investment(db: Session) -> dict[int, int]:
    return {
        int(investment_id): int(count or 0)
        for investment_id, count in db.query(Task.investment_id, func.count(Task.id))
        .filter(Task.investment_id.isnot(None), Task.status != "completed")
        .group_by(Task.investment_id)
        .all()
    }


def overdue_task_counts_by_fund(db: Session) -> dict[int, int]:
    today = date.today()
    return {
        int(fund_id): int(count or 0)
        for fund_id, count in db.query(Task.fund_id, func.count(Task.id))
        .filter(
            Task.fund_id.isnot(None),
            Task.deadline.isnot(None),
            Task.status != "completed",
            func.date(Task.deadline) < today,
        )
        .group_by(Task.fund_id)
        .all()
    }


def overdue_document_counts_by_investment(db: Session) -> dict[int, int]:
    today = date.today()
    return {
        int(investment_id): int(count or 0)
        for investment_id, count in db.query(InvestmentDocument.investment_id, func.count(InvestmentDocument.id))
        .filter(
            InvestmentDocument.investment_id.isnot(None),
            InvestmentDocument.due_date.isnot(None),
            InvestmentDocument.status != "completed",
            InvestmentDocument.due_date < today,
        )
        .group_by(InvestmentDocument.investment_id)
        .all()
    }


def overdue_document_counts_by_fund(db: Session) -> dict[int, int]:
    today = date.today()
    return {
        int(fund_id): int(count or 0)
        for fund_id, count in db.query(Investment.fund_id, func.count(InvestmentDocument.id))
        .join(Investment, Investment.id == InvestmentDocument.investment_id)
        .filter(
            Investment.fund_id.isnot(None),
            InvestmentDocument.due_date.isnot(None),
            InvestmentDocument.status != "completed",
            InvestmentDocument.due_date < today,
        )
        .group_by(Investment.fund_id)
        .all()
    }


def compliance_counts_by_fund(db: Session) -> tuple[dict[int, int], dict[int, int]]:
    open_counts = {
        int(fund_id): int(count or 0)
        for fund_id, count in db.query(ComplianceObligation.fund_id, func.count(ComplianceObligation.id))
        .filter(ComplianceObligation.fund_id.isnot(None), ComplianceObligation.status != "completed")
        .group_by(ComplianceObligation.fund_id)
        .all()
    }
    overdue_counts = {
        int(fund_id): int(count or 0)
        for fund_id, count in db.query(ComplianceObligation.fund_id, func.count(ComplianceObligation.id))
        .filter(ComplianceObligation.fund_id.isnot(None), ComplianceObligation.status == "overdue")
        .group_by(ComplianceObligation.fund_id)
        .all()
    }
    return open_counts, overdue_counts


def compliance_counts_by_investment(db: Session) -> dict[int, int]:
    return {
        int(investment_id): int(count or 0)
        for investment_id, count in db.query(ComplianceObligation.investment_id, func.count(ComplianceObligation.id))
        .filter(
            ComplianceObligation.investment_id.isnot(None),
            ComplianceObligation.status != "completed",
        )
        .group_by(ComplianceObligation.investment_id)
        .all()
    }


def workflow_step_doc_stats(db: Session) -> tuple[dict[int, int], dict[int, int]]:
    checked = {
        int(step_instance_id): int(count or 0)
        for step_instance_id, count in db.query(
            WorkflowStepInstanceDocument.step_instance_id,
            func.count(WorkflowStepInstanceDocument.id),
        )
        .filter(
            WorkflowStepInstanceDocument.step_instance_id.isnot(None),
            WorkflowStepInstanceDocument.checked == True,
        )
        .group_by(WorkflowStepInstanceDocument.step_instance_id)
        .all()
    }
    required_unchecked = {
        int(step_instance_id): int(count or 0)
        for step_instance_id, count in db.query(
            WorkflowStepInstanceDocument.step_instance_id,
            func.count(WorkflowStepInstanceDocument.id),
        )
        .filter(
            WorkflowStepInstanceDocument.step_instance_id.isnot(None),
            WorkflowStepInstanceDocument.required == True,
            WorkflowStepInstanceDocument.checked == False,
        )
        .group_by(WorkflowStepInstanceDocument.step_instance_id)
        .all()
    }
    return checked, required_unchecked


def transaction_counts_by_investment(db: Session) -> dict[int, int]:
    return {
        int(investment_id): int(count or 0)
        for investment_id, count in db.query(Transaction.investment_id, func.count(Transaction.id))
        .filter(Transaction.investment_id.isnot(None))
        .group_by(Transaction.investment_id)
        .all()
    }


def realized_gain_by_investment(db: Session) -> dict[int, float]:
    return {
        int(investment_id): float(total or 0)
        for investment_id, total in db.query(
            Transaction.investment_id,
            func.coalesce(func.sum(Transaction.realized_gain), 0),
        )
        .filter(Transaction.investment_id.isnot(None))
        .group_by(Transaction.investment_id)
        .all()
    }

