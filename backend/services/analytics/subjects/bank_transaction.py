from __future__ import annotations

from models.bank_transaction import BankTransaction
from services.analytics.common import apply_date_buckets
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import load_reference_maps


def load_rows(db):
    refs = load_reference_maps(db, include={"fund"})
    rows = db.query(BankTransaction).all()
    result = []
    for row in rows:
        fund = refs["fund"].get(row.fund_id)
        deposit_amount = float(row.deposit or 0)
        withdrawal_amount = float(row.withdrawal or 0)
        net_amount = deposit_amount - withdrawal_amount
        direction = "유입" if deposit_amount >= withdrawal_amount else "유출"
        item = {
            "id": row.id,
            "fund.name": fund.name if fund else None,
            "fund.type": fund.type if fund else None,
            "bank.transaction_date": row.transaction_date,
            "bank.year_month": row.year_month,
            "bank.direction": direction,
            "bank.description": row.description,
            "bank.counterparty": row.counterparty,
            "bank.branch": row.bank_branch,
            "bank.account_number": row.account_number,
            "bank.auto_mapped": bool(row.auto_mapped),
            "bank.deposit_amount": deposit_amount,
            "bank.withdrawal_amount": withdrawal_amount,
            "bank.net_amount": net_amount,
            "bank.balance_after": float(row.balance_after or 0),
        }
        item.update(apply_date_buckets(row.transaction_date, "bank.transaction_date"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="bank_transaction",
    label="은행거래",
    description="은행 거래 유입/유출과 자동매핑 현황을 분석합니다.",
    grain_label="은행거래 1건",
    fields=[
        dimension("fund.name", "조합명", "string", "기본 차원"),
        dimension("fund.type", "조합 유형", "string", "기본 차원"),
        dimension("bank.direction", "방향", "string", "기본 차원"),
        dimension("bank.description", "적요", "string", "기본 차원"),
        dimension("bank.counterparty", "거래상대방", "string", "기본 차원"),
        dimension("bank.auto_mapped", "자동매핑", "boolean", "기본 차원"),
        dimension("bank.transaction_date.day", "거래일", "date", "날짜 파생"),
        dimension("bank.transaction_date.year_month", "거래월", "string", "날짜 파생"),
        measure("bank.deposit_amount", "입금액", "number", "기본 지표"),
        measure("bank.withdrawal_amount", "출금액", "number", "기본 지표"),
        measure("bank.net_amount", "순변동", "number", "기본 지표"),
        measure("bank.balance_after", "거래 후 잔액", "number", "기본 지표", default_aggregate="avg"),
    ],
    default_table_fields=[
        "fund.name",
        "bank.transaction_date.day",
        "bank.direction",
        "bank.counterparty",
        "bank.deposit_amount",
        "bank.withdrawal_amount",
        "bank.balance_after",
    ],
    default_values=[{"key": "bank.net_amount", "aggregate": "sum"}],
    starter_views=[],
    load_rows=load_rows,
)
