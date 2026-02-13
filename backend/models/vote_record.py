from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text, func

from database import Base


class VoteRecord(Base):
    __tablename__ = "vote_records"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("portfolio_companies.id"), nullable=False)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=True)
    vote_type = Column(String, nullable=False, default="")
    date = Column(Date, nullable=False)
    agenda = Column(Text, nullable=True)
    decision = Column(String, nullable=True)
    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
