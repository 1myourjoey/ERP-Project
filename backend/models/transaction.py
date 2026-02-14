from datetime import datetime

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=False)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("portfolio_companies.id"), nullable=False)
    transaction_date = Column(Date, nullable=False)
    type = Column(String, nullable=False)
    amount = Column(Float, nullable=False, default=0)
    shares_change = Column(Integer, nullable=True)
    balance_before = Column(Float, nullable=True)
    balance_after = Column(Float, nullable=True)
    realized_gain = Column(Float, nullable=True)
    cumulative_gain = Column(Float, nullable=True)
    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    investment = relationship("Investment", back_populates="transactions")
