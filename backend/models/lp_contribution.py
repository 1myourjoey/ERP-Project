from datetime import datetime

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


class LPContribution(Base):
    """LP별 납입 이력 레코드. 납입 1회 = 1행."""

    __tablename__ = "lp_contributions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id", ondelete="CASCADE"), nullable=False, index=True)
    lp_id = Column(Integer, ForeignKey("lps.id", ondelete="CASCADE"), nullable=False, index=True)

    due_date = Column(Date, nullable=False)  # 납입기일(예정일)
    amount = Column(Float, nullable=False, default=0)
    commitment_ratio = Column(Float, nullable=True)
    round_no = Column(Integer, nullable=True)

    actual_paid_date = Column(Date, nullable=True)
    memo = Column(Text, nullable=True)

    capital_call_id = Column(Integer, ForeignKey("capital_calls.id", ondelete="SET NULL"), nullable=True, index=True)
    source = Column(String, nullable=False, default="manual")  # manual | capital_call | migration

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    fund = relationship("Fund")
    lp = relationship("LP", back_populates="contributions")
    capital_call = relationship("CapitalCall")
