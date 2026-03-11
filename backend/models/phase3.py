from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


class CapitalCall(Base):
    __tablename__ = "capital_calls"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    linked_workflow_instance_id = Column(
        Integer,
        ForeignKey("workflow_instances.id", ondelete="SET NULL"),
        nullable=True,
    )
    call_date = Column(Date, nullable=False)
    call_type = Column(String, nullable=False)
    total_amount = Column(Float, nullable=False, default=0)
    request_percent = Column(Float, nullable=True)
    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    items = relationship("CapitalCallItem", back_populates="capital_call", cascade="all, delete-orphan")
    details = relationship("CapitalCallDetail", back_populates="capital_call", cascade="all, delete-orphan")
    linked_workflow_instance = relationship("WorkflowInstance")


class CapitalCallItem(Base):
    __tablename__ = "capital_call_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    capital_call_id = Column(Integer, ForeignKey("capital_calls.id"), nullable=False)
    lp_id = Column(Integer, ForeignKey("lps.id"), nullable=False)
    amount = Column(Integer, nullable=False, default=0)
    paid = Column(Integer, nullable=False, default=0)  # 0/1
    paid_date = Column(Date, nullable=True)
    memo = Column(Text, nullable=True)

    capital_call = relationship("CapitalCall", back_populates="items")


class CapitalCallDetail(Base):
    __tablename__ = "capital_call_details"

    id = Column(Integer, primary_key=True, autoincrement=True)
    capital_call_id = Column(Integer, ForeignKey("capital_calls.id", ondelete="CASCADE"), nullable=False, index=True)
    lp_id = Column(Integer, ForeignKey("lps.id"), nullable=False, index=True)
    commitment_ratio = Column(Float, nullable=True)
    call_amount = Column(Float, nullable=False, default=0)
    paid_amount = Column(Float, nullable=False, default=0)
    paid_date = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="미납입")
    reminder_sent = Column(Boolean, nullable=False, default=False)

    capital_call = relationship("CapitalCall", back_populates="details")


class Distribution(Base):
    __tablename__ = "distributions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    dist_date = Column(Date, nullable=False)
    dist_type = Column(String, nullable=False)
    principal_total = Column(Float, nullable=False, default=0)
    profit_total = Column(Float, nullable=False, default=0)
    performance_fee = Column(Integer, nullable=False, default=0)
    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    items = relationship("DistributionItem", back_populates="distribution", cascade="all, delete-orphan")
    details = relationship("DistributionDetail", back_populates="distribution", cascade="all, delete-orphan")


class DistributionItem(Base):
    __tablename__ = "distribution_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    distribution_id = Column(Integer, ForeignKey("distributions.id"), nullable=False)
    lp_id = Column(Integer, ForeignKey("lps.id"), nullable=False)
    principal = Column(Integer, nullable=False, default=0)
    profit = Column(Integer, nullable=False, default=0)

    distribution = relationship("Distribution", back_populates="items")


class DistributionDetail(Base):
    __tablename__ = "distribution_details"

    id = Column(Integer, primary_key=True, autoincrement=True)
    distribution_id = Column(Integer, ForeignKey("distributions.id", ondelete="CASCADE"), nullable=False, index=True)
    lp_id = Column(Integer, ForeignKey("lps.id"), nullable=False, index=True)
    distribution_amount = Column(Float, nullable=False, default=0)
    distribution_type = Column(String, nullable=False, default="수익배분")
    paid = Column(Boolean, nullable=False, default=False)

    distribution = relationship("Distribution", back_populates="details")


class Assembly(Base):
    __tablename__ = "assemblies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    type = Column(String, nullable=False)
    date = Column(Date, nullable=False)
    agenda = Column(Text, nullable=True)
    meeting_time = Column(String, nullable=True)
    meeting_method = Column(String, nullable=True)
    location = Column(String, nullable=True)
    chair_name = Column(String, nullable=True)
    document_number = Column(String, nullable=True)
    packet_type = Column(String, nullable=True)
    include_bylaw_amendment = Column(Boolean, nullable=False, default=False)
    status = Column(String, nullable=False, default="planned")
    minutes_completed = Column(Integer, nullable=False, default=0)  # 0/1
    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    agenda_items = relationship("AssemblyAgendaItem", back_populates="assembly", cascade="all, delete-orphan", order_by="AssemblyAgendaItem.sort_order")
    meeting_packet_runs = relationship("MeetingPacketRun", back_populates="assembly", cascade="all, delete-orphan", order_by="MeetingPacketRun.id.desc()")


class ExitCommittee(Base):
    __tablename__ = "exit_committees"

    id = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("portfolio_companies.id"), nullable=False)
    status = Column(String, nullable=False, default="scheduled")
    meeting_date = Column(Date, nullable=False)
    location = Column(String, nullable=True)
    agenda = Column(Text, nullable=True)
    exit_strategy = Column(String, nullable=True)
    analyst_opinion = Column(Text, nullable=True)
    vote_result = Column(String, nullable=True)
    performance_fee = Column(Float, nullable=True)
    agenda_summary = Column(Text, nullable=True)
    resolution = Column(Text, nullable=True)
    attendees = Column(Text, nullable=True)
    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    funds = relationship("ExitCommitteeFund", back_populates="committee", cascade="all, delete-orphan")


class ExitCommitteeFund(Base):
    __tablename__ = "exit_committee_funds"

    id = Column(Integer, primary_key=True, autoincrement=True)
    exit_committee_id = Column(Integer, ForeignKey("exit_committees.id"), nullable=False)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=False)

    committee = relationship("ExitCommittee", back_populates="funds")


class ExitTrade(Base):
    __tablename__ = "exit_trades"

    id = Column(Integer, primary_key=True, autoincrement=True)
    exit_committee_id = Column(Integer, ForeignKey("exit_committees.id"), nullable=True)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=False)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("portfolio_companies.id"), nullable=False)
    exit_type = Column(String, nullable=False)
    trade_date = Column(Date, nullable=False)
    amount = Column(Integer, nullable=False, default=0)
    shares_sold = Column(Integer, nullable=True)
    price_per_share = Column(Integer, nullable=True)
    fees = Column(Integer, nullable=False, default=0)
    net_amount = Column(Integer, nullable=True)
    realized_gain = Column(Integer, nullable=True)
    settlement_status = Column(String, nullable=False, default="미정산")
    settlement_date = Column(Date, nullable=True)
    settlement_amount = Column(Float, nullable=True)
    related_transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True, index=True)
    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
