from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, func

from database import Base


class BankTransaction(Base):
    """Raw bank statement transaction row per fund/month."""

    __tablename__ = "bank_transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id", ondelete="CASCADE"), nullable=False)

    transaction_date = Column(DateTime, nullable=False)
    withdrawal = Column(Numeric, nullable=False, default=0)
    deposit = Column(Numeric, nullable=False, default=0)
    balance_after = Column(Numeric, nullable=True)
    description = Column(String, nullable=True)
    counterparty = Column(String, nullable=True)
    bank_branch = Column(String, nullable=True)
    account_number = Column(String, nullable=True)

    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=True)
    auto_mapped = Column(Boolean, nullable=False, default=False)
    mapping_rule_id = Column(Integer, ForeignKey("auto_mapping_rules.id"), nullable=True)

    year_month = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
