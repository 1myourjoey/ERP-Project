from datetime import date as dt_date

from sqlalchemy import Column, Integer, String, Date, Float, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from database import Base

STANDARD_NOTICE_TYPES = [
    {"notice_type": "assembly", "label": "총회 소집 통지", "default_days": 14},
    {"notice_type": "capital_call_initial", "label": "최초 출자금 납입 요청", "default_days": 10},
    {"notice_type": "capital_call_additional", "label": "수시 출자금 납입 요청", "default_days": 10},
    {"notice_type": "ic_agenda", "label": "투자심의위원회 안건 통지", "default_days": 7},
    {"notice_type": "distribution", "label": "분배 통지", "default_days": 5},
    {"notice_type": "dissolution", "label": "해산/청산 통지", "default_days": 30},
    {"notice_type": "lp_report", "label": "조합원 보고", "default_days": 0},
    {"notice_type": "amendment", "label": "규약 변경 통지", "default_days": 14},
]


class Fund(Base):
    __tablename__ = "funds"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    formation_date = Column(Date, nullable=True)
    registration_number = Column(String, nullable=True)
    registration_date = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="active")
    gp = Column(String, nullable=True)
    fund_manager = Column(String, nullable=True)
    co_gp = Column(String, nullable=True)
    trustee = Column(String, nullable=True)
    commitment_total = Column(Float, nullable=True)
    gp_commitment = Column(Float, nullable=True)
    contribution_type = Column(String, nullable=True)
    aum = Column(Float, nullable=True)
    investment_period_end = Column(Date, nullable=True)
    maturity_date = Column(Date, nullable=True)
    dissolution_date = Column(Date, nullable=True)
    mgmt_fee_rate = Column(Float, nullable=True)
    performance_fee_rate = Column(Float, nullable=True)
    hurdle_rate = Column(Float, nullable=True)
    account_number = Column(String, nullable=True)

    lps = relationship("LP", back_populates="fund", cascade="all, delete-orphan")
    lp_transfers = relationship("LPTransfer", back_populates="fund", cascade="all, delete-orphan")
    notice_periods = relationship("FundNoticePeriod", back_populates="fund", cascade="all, delete-orphan")
    key_terms = relationship("FundKeyTerm", back_populates="fund", cascade="all, delete-orphan")
    biz_reports = relationship("BizReport", backref="fund", cascade="all, delete-orphan")


class LP(Base):
    __tablename__ = "lps"
    __table_args__ = (
        UniqueConstraint("fund_id", "address_book_id", name="uq_lps_fund_address_book"),
        UniqueConstraint("fund_id", "business_number", name="uq_lps_fund_business_number"),
        UniqueConstraint("fund_id", "name", name="uq_lps_fund_name"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    address_book_id = Column(Integer, ForeignKey("lp_address_books.id"), nullable=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    commitment = Column(Integer, nullable=True)
    paid_in = Column(Integer, nullable=True)
    contact = Column(String, nullable=True)
    business_number = Column(String, nullable=True)
    address = Column(String, nullable=True)

    fund = relationship("Fund", back_populates="lps")
    address_book = relationship("LPAddressBook", back_populates="lps")
    transfers_from = relationship("LPTransfer", foreign_keys="LPTransfer.from_lp_id", back_populates="from_lp")
    transfers_to = relationship("LPTransfer", foreign_keys="LPTransfer.to_lp_id", back_populates="to_lp")


class LPTransfer(Base):
    __tablename__ = "lp_transfers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    from_lp_id = Column(Integer, ForeignKey("lps.id"), nullable=False)
    to_lp_id = Column(Integer, ForeignKey("lps.id"), nullable=True)
    to_lp_name = Column(String, nullable=True)
    to_lp_type = Column(String, nullable=True)
    to_lp_business_number = Column(String, nullable=True)
    to_lp_address = Column(String, nullable=True)
    to_lp_contact = Column(String, nullable=True)
    transfer_amount = Column(Integer, nullable=False)
    transfer_date = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="pending")
    workflow_instance_id = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(Date, nullable=True, default=dt_date.today)

    fund = relationship("Fund", back_populates="lp_transfers")
    from_lp = relationship("LP", foreign_keys=[from_lp_id], back_populates="transfers_from")
    to_lp = relationship("LP", foreign_keys=[to_lp_id], back_populates="transfers_to")


class FundNoticePeriod(Base):
    __tablename__ = "fund_notice_periods"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    notice_type = Column(String, nullable=False)
    label = Column(String, nullable=False)
    business_days = Column(Integer, nullable=False)
    day_basis = Column(String, nullable=False, default="business")
    memo = Column(Text, nullable=True)

    fund = relationship("Fund", back_populates="notice_periods")


class FundKeyTerm(Base):
    __tablename__ = "fund_key_terms"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    category = Column(String, nullable=False)
    label = Column(String, nullable=False)
    value = Column(String, nullable=False)
    article_ref = Column(String, nullable=True)

    fund = relationship("Fund", back_populates="key_terms")
