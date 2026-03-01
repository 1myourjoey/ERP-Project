from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from models.accounting import JournalEntry, JournalEntryLine
from models.auto_mapping_rule import AutoMappingRule
from models.bank_transaction import BankTransaction


class AutoJournalService:
    """Create journal entries from bank transactions with keyword mapping rules."""

    def auto_map(self, bank_txns: list[BankTransaction], fund_id: int, db: Session) -> dict:
        rules = self._get_rules(fund_id, db)

        mapped: list[dict] = []
        unmapped: list[dict] = []

        for txn in bank_txns:
            if txn.journal_entry_id:
                mapped.append(self._serialize_txn(txn))
                continue

            matched_rule = self._find_matching_rule(txn, rules)
            if not matched_rule:
                unmapped.append(self._serialize_txn(txn))
                continue

            entry = self._create_entry(
                txn=txn,
                debit_account_id=matched_rule.debit_account_id,
                credit_account_id=matched_rule.credit_account_id,
                description=(matched_rule.description_template or txn.description or txn.counterparty),
                source_label="auto",
                db=db,
            )
            txn.auto_mapped = True
            txn.mapping_rule_id = matched_rule.id
            matched_rule.use_count = int(matched_rule.use_count or 0) + 1
            mapped.append({**self._serialize_txn(txn), "journal_entry_id": entry.id})

        db.commit()

        return {
            "mapped": mapped,
            "unmapped": unmapped,
            "total": len(bank_txns),
            "mapped_count": len(mapped),
            "unmapped_count": len(unmapped),
        }

    def learn_mapping(
        self,
        txn_id: int,
        debit_account_id: int,
        credit_account_id: int,
        db: Session,
        *,
        learn: bool = True,
        description: str | None = None,
    ) -> dict:
        txn = db.get(BankTransaction, txn_id)
        if not txn:
            raise ValueError("bank transaction not found")

        entry = self._create_entry(
            txn=txn,
            debit_account_id=debit_account_id,
            credit_account_id=credit_account_id,
            description=(description or txn.description or txn.counterparty),
            source_label="manual",
            db=db,
        )

        created_rule_id: int | None = None
        if learn:
            keyword = (txn.counterparty or txn.description or "").strip()
            if keyword:
                direction = self._direction(txn)
                rule = (
                    db.query(AutoMappingRule)
                    .filter(
                        AutoMappingRule.fund_id == txn.fund_id,
                        AutoMappingRule.keyword == keyword,
                        AutoMappingRule.direction == direction,
                    )
                    .first()
                )
                if not rule:
                    rule = AutoMappingRule(
                        fund_id=txn.fund_id,
                        keyword=keyword,
                        direction=direction,
                        debit_account_id=debit_account_id,
                        credit_account_id=credit_account_id,
                        description_template=description or txn.description,
                        priority=100,
                        use_count=1,
                        is_active=True,
                    )
                    db.add(rule)
                    db.flush()
                else:
                    rule.debit_account_id = debit_account_id
                    rule.credit_account_id = credit_account_id
                    if description:
                        rule.description_template = description
                    rule.use_count = int(rule.use_count or 0) + 1

                txn.mapping_rule_id = rule.id
                created_rule_id = rule.id

        db.commit()

        return {
            "txn_id": txn.id,
            "journal_entry_id": entry.id,
            "rule_id": created_rule_id,
        }

    def _get_rules(self, fund_id: int, db: Session) -> list[AutoMappingRule]:
        return (
            db.query(AutoMappingRule)
            .filter(
                AutoMappingRule.is_active.is_(True),
                or_(AutoMappingRule.fund_id == fund_id, AutoMappingRule.fund_id.is_(None)),
            )
            .order_by(desc(AutoMappingRule.priority), desc(AutoMappingRule.use_count), AutoMappingRule.id.asc())
            .all()
        )

    def _find_matching_rule(self, txn: BankTransaction, rules: list[AutoMappingRule]) -> AutoMappingRule | None:
        direction = self._direction(txn)
        haystacks = [
            (txn.counterparty or "").lower(),
            (txn.description or "").lower(),
        ]
        for rule in rules:
            if rule.direction != direction:
                continue
            keyword = (rule.keyword or "").strip().lower()
            if not keyword:
                continue
            if any(keyword in hay for hay in haystacks):
                return rule
        return None

    def _create_entry(
        self,
        *,
        txn: BankTransaction,
        debit_account_id: int,
        credit_account_id: int,
        description: str | None,
        source_label: str,
        db: Session,
    ) -> JournalEntry:
        amount = self._amount(txn)
        if amount <= 0:
            raise ValueError("transaction amount must be positive")

        entry = JournalEntry(
            fund_id=txn.fund_id,
            entry_date=self._entry_date(txn),
            entry_type="자동분개" if source_label == "auto" else "수동분개",
            description=description,
            status="결재완료",
            source_type="bank_transaction",
            source_id=txn.id,
        )
        db.add(entry)
        db.flush()

        db.add(
            JournalEntryLine(
                journal_entry_id=entry.id,
                account_id=debit_account_id,
                debit=amount,
                credit=0,
                memo=txn.description,
            )
        )
        db.add(
            JournalEntryLine(
                journal_entry_id=entry.id,
                account_id=credit_account_id,
                debit=0,
                credit=amount,
                memo=txn.counterparty,
            )
        )

        txn.journal_entry_id = entry.id
        return entry

    def _amount(self, txn: BankTransaction) -> float:
        deposit = self._to_float(txn.deposit)
        withdrawal = self._to_float(txn.withdrawal)
        return deposit if deposit > 0 else withdrawal

    def _direction(self, txn: BankTransaction) -> str:
        return "deposit" if self._to_float(txn.deposit) > 0 else "withdrawal"

    def _entry_date(self, txn: BankTransaction) -> date:
        value = txn.transaction_date
        if hasattr(value, "date"):
            return value.date()
        return value

    def _to_float(self, value) -> float:
        if value is None:
            return 0.0
        if isinstance(value, Decimal):
            return float(value)
        return float(value)

    def _serialize_txn(self, txn: BankTransaction) -> dict:
        return {
            "id": txn.id,
            "fund_id": txn.fund_id,
            "transaction_date": txn.transaction_date.isoformat() if txn.transaction_date else None,
            "withdrawal": self._to_float(txn.withdrawal),
            "deposit": self._to_float(txn.deposit),
            "description": txn.description,
            "counterparty": txn.counterparty,
            "year_month": txn.year_month,
            "journal_entry_id": txn.journal_entry_id,
            "auto_mapped": bool(txn.auto_mapped),
            "mapping_rule_id": txn.mapping_rule_id,
        }
