from datetime import datetime

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from database import Base


class Valuation(Base):
    __tablename__ = "valuations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=False)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("portfolio_companies.id"), nullable=False)
    as_of_date = Column(Date, nullable=False)
    evaluator = Column(String, nullable=True)
    method = Column(String, nullable=True)
    instrument = Column(String, nullable=True)
    value = Column(Float, nullable=False, default=0)
    prev_value = Column(Float, nullable=True)
    change_amount = Column(Float, nullable=True)
    change_pct = Column(Float, nullable=True)
    basis = Column(Text, nullable=True)
    valuation_method = Column(String, nullable=True)
    instrument_type = Column(String, nullable=True)
    conversion_price = Column(Numeric, nullable=True)
    exercise_price = Column(Numeric, nullable=True)
    liquidation_pref = Column(Numeric, nullable=True)
    participation_cap = Column(Numeric, nullable=True)
    fair_value_per_share = Column(Numeric, nullable=True)
    total_fair_value = Column(Numeric, nullable=True)
    book_value = Column(Numeric, nullable=True)
    unrealized_gain_loss = Column(Numeric, nullable=True)
    valuation_date = Column(Date, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    investment = relationship("Investment", back_populates="valuations")
