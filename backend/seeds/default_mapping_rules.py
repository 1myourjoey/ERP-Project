from __future__ import annotations

from sqlalchemy import or_
from sqlalchemy.orm import Session

from models.accounting import Account
from models.auto_mapping_rule import AutoMappingRule

DEFAULT_MAPPING_RULES = [
    # Deposit rules
    {"keyword": "모태", "direction": "deposit", "debit": "1110106", "credit": "3100300", "desc": "출자금 납입"},
    {"keyword": "예금이자", "direction": "deposit", "debit": "1110106", "credit": "4160206", "desc": "MMDA이자"},
    {"keyword": "이자", "direction": "deposit", "debit": "1110106", "credit": "4130100", "desc": "이자수익"},
    # Withdrawal rules
    {"keyword": "회계법인", "direction": "withdrawal", "debit": "4210400", "credit": "1110106", "desc": "회계감사수수료"},
    {"keyword": "감사법인", "direction": "withdrawal", "debit": "4210400", "credit": "1110106", "desc": "회계감사수수료"},
]


def _find_account_id(db: Session, fund_id: int, code: str) -> int | None:
    row = (
        db.query(Account)
        .filter(Account.code == code)
        .filter(or_(Account.fund_id == fund_id, Account.fund_id.is_(None)))
        .order_by(Account.fund_id.is_(None), Account.id.asc())
        .first()
    )
    return row.id if row else None


def seed_default_mapping_rules(db: Session, fund_id: int) -> int:
    """Seed default keyword mapping rules for a fund if missing."""

    created = 0
    for item in DEFAULT_MAPPING_RULES:
        exists = (
            db.query(AutoMappingRule)
            .filter(
                AutoMappingRule.fund_id == fund_id,
                AutoMappingRule.keyword == item["keyword"],
                AutoMappingRule.direction == item["direction"],
            )
            .first()
        )
        if exists:
            continue

        debit_account_id = _find_account_id(db, fund_id, item["debit"])
        credit_account_id = _find_account_id(db, fund_id, item["credit"])
        if not debit_account_id or not credit_account_id:
            continue

        db.add(
            AutoMappingRule(
                fund_id=fund_id,
                keyword=item["keyword"],
                direction=item["direction"],
                debit_account_id=debit_account_id,
                credit_account_id=credit_account_id,
                description_template=item["desc"],
                priority=10,
                is_active=True,
            )
        )
        created += 1

    if created:
        db.commit()

    return created
