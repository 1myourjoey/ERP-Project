from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, func

from database import Base


class AutoMappingRule(Base):
    """Rule mapping bank statement keywords to journal debit/credit accounts."""

    __tablename__ = "auto_mapping_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=True)

    keyword = Column(String, nullable=False)
    direction = Column(String, nullable=False)  # deposit | withdrawal

    debit_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    credit_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)

    description_template = Column(String, nullable=True)
    priority = Column(Integer, nullable=False, default=0)
    use_count = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
