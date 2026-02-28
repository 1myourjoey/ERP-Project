from datetime import datetime

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from database import Base


class InternalReview(Base):
    """Internal quarterly review master."""

    __tablename__ = "internal_reviews"
    __table_args__ = (
        UniqueConstraint("fund_id", "year", "quarter", name="uq_internal_review_period"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    quarter = Column(Integer, nullable=False, index=True)

    reference_date = Column(Date, nullable=True)
    review_date = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="preparing")

    attendees_json = Column(Text, nullable=True)
    compliance_opinion = Column(Text, nullable=True)
    compliance_officer = Column(String, nullable=True)
    minutes_document_id = Column(Integer, nullable=True)
    obligation_id = Column(Integer, ForeignKey("compliance_obligations.id"), nullable=True, index=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    company_reviews = relationship("CompanyReview", back_populates="review", cascade="all, delete-orphan")


class CompanyReview(Base):
    """Company-level quarterly review record under internal review."""

    __tablename__ = "company_reviews"
    __table_args__ = (
        UniqueConstraint("review_id", "investment_id", name="uq_company_review_investment"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    review_id = Column(Integer, ForeignKey("internal_reviews.id", ondelete="CASCADE"), nullable=False, index=True)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=False, index=True)

    quarterly_revenue = Column(Float, nullable=True)
    quarterly_operating_income = Column(Float, nullable=True)
    quarterly_net_income = Column(Float, nullable=True)
    total_assets = Column(Float, nullable=True)
    total_liabilities = Column(Float, nullable=True)
    total_equity = Column(Float, nullable=True)
    cash_and_equivalents = Column(Float, nullable=True)
    paid_in_capital = Column(Float, nullable=True)

    employee_count = Column(Integer, nullable=True)
    employee_change = Column(Integer, nullable=True)

    asset_rating = Column(String, nullable=True)
    rating_reason = Column(Text, nullable=True)

    impairment_type = Column(String, nullable=True)
    impairment_amount = Column(Float, nullable=True)
    impairment_flags_json = Column(Text, nullable=True)

    key_issues = Column(Text, nullable=True)
    follow_up_actions = Column(Text, nullable=True)
    board_attendance = Column(String, nullable=True)
    investment_opinion = Column(String, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    review = relationship("InternalReview", back_populates="company_reviews")
