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


def load_reference_maps(db: Session) -> dict[str, dict[int, Any]]:
    funds = db.query(Fund).all()
    companies = db.query(PortfolioCompany).all()
    investments = db.query(Investment).all()
    workflows = db.query(Workflow).all()
    steps = db.query(WorkflowStep).all()
    users = db.query(User).all()
    lps = db.query(LP).all()
    return {
        "fund": {row.id: row for row in funds},
        "company": {row.id: row for row in companies},
        "investment": {row.id: row for row in investments},
        "workflow": {row.id: row for row in workflows},
        "workflow_step": {row.id: row for row in steps},
        "user": {row.id: row for row in users},
        "lp": {row.id: row for row in lps},
    }


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
    rows = db.query(WorkflowInstance).filter(WorkflowInstance.status == "active", WorkflowInstance.fund_id.isnot(None)).all()
    return group_count(rows, "fund_id")


def active_workflow_counts_by_investment(db: Session) -> dict[int, int]:
    rows = db.query(WorkflowInstance).filter(WorkflowInstance.status == "active", WorkflowInstance.investment_id.isnot(None)).all()
    return group_count(rows, "investment_id")


def open_task_counts_by_fund(db: Session) -> dict[int, int]:
    rows = db.query(Task).filter(Task.fund_id.isnot(None), Task.status != "completed").all()
    return group_count(rows, "fund_id")


def open_task_counts_by_investment(db: Session) -> dict[int, int]:
    rows = db.query(Task).filter(Task.investment_id.isnot(None), Task.status != "completed").all()
    return group_count(rows, "investment_id")


def overdue_task_counts_by_fund(db: Session) -> dict[int, int]:
    today = date.today()
    rows = db.query(Task).filter(Task.fund_id.isnot(None), Task.deadline.isnot(None), Task.status != "completed").all()
    return group_count(rows, "fund_id", predicate=lambda row: row.deadline.date() < today if hasattr(row.deadline, "date") else row.deadline < today)


def overdue_document_counts_by_investment(db: Session) -> dict[int, int]:
    today = date.today()
    rows = db.query(InvestmentDocument).filter(InvestmentDocument.due_date.isnot(None)).all()
    return group_count(rows, "investment_id", predicate=lambda row: row.status != "completed" and row.due_date < today)


def overdue_document_counts_by_fund(db: Session) -> dict[int, int]:
    today = date.today()
    rows = db.query(InvestmentDocument, Investment).join(Investment, Investment.id == InvestmentDocument.investment_id).filter(InvestmentDocument.due_date.isnot(None)).all()
    result: dict[int, int] = defaultdict(int)
    for doc, investment in rows:
        if doc.status == "completed" or doc.due_date >= today:
            continue
        result[int(investment.fund_id)] += 1
    return dict(result)


def compliance_counts_by_fund(db: Session) -> tuple[dict[int, int], dict[int, int]]:
    rows = db.query(ComplianceObligation).all()
    open_counts = group_count(rows, "fund_id", predicate=lambda row: row.status != "completed")
    overdue_counts = group_count(rows, "fund_id", predicate=lambda row: row.status == "overdue")
    return open_counts, overdue_counts


def compliance_counts_by_investment(db: Session) -> dict[int, int]:
    rows = db.query(ComplianceObligation).filter(ComplianceObligation.investment_id.isnot(None)).all()
    return group_count(rows, "investment_id", predicate=lambda row: row.status != "completed")


def workflow_step_doc_stats(db: Session) -> tuple[dict[int, int], dict[int, int]]:
    rows = db.query(WorkflowStepInstanceDocument).all()
    checked = group_count(rows, "step_instance_id", predicate=lambda row: bool(row.checked))
    required_unchecked = group_count(rows, "step_instance_id", predicate=lambda row: bool(row.required) and not bool(row.checked))
    return checked, required_unchecked


def transaction_counts_by_investment(db: Session) -> dict[int, int]:
    rows = db.query(Transaction).all()
    return group_count(rows, "investment_id")


def realized_gain_by_investment(db: Session) -> dict[int, float]:
    rows = db.query(Transaction).all()
    return group_sum(rows, "investment_id", "realized_gain")

