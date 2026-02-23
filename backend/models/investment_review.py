from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class InvestmentReview(Base):
    __tablename__ = "investment_reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)
    company_name = Column(String, nullable=False)
    sector = Column(String, nullable=True)
    stage = Column(String, nullable=True)
    deal_source = Column(String, nullable=True)
    reviewer = Column(String, nullable=True)
    status = Column(String, nullable=False, default="소싱")

    target_amount = Column(Numeric, nullable=True)
    pre_valuation = Column(Numeric, nullable=True)
    post_valuation = Column(Numeric, nullable=True)
    instrument = Column(String, nullable=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=True, index=True)

    review_start_date = Column(Date, nullable=True)
    dd_start_date = Column(Date, nullable=True)
    committee_date = Column(Date, nullable=True)
    decision_date = Column(Date, nullable=True)
    execution_date = Column(Date, nullable=True)

    review_opinion = Column(Text, nullable=True)
    committee_opinion = Column(Text, nullable=True)
    decision_result = Column(String, nullable=True)
    rejection_reason = Column(Text, nullable=True)

    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=True, index=True)

    created_at = Column(DateTime, nullable=False, server_default=func.now(), default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    comments = relationship("ReviewComment", back_populates="review", cascade="all, delete-orphan")
    investment = relationship("Investment", back_populates="reviews")


class ReviewComment(Base):
    __tablename__ = "review_comments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    review_id = Column(Integer, ForeignKey("investment_reviews.id", ondelete="CASCADE"), nullable=False, index=True)
    author = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    comment_type = Column(String, nullable=False, default="opinion")
    created_at = Column(DateTime, nullable=False, server_default=func.now(), default=datetime.utcnow)

    review = relationship("InvestmentReview", back_populates="comments")
