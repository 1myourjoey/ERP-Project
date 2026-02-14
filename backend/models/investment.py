from sqlalchemy import Column, Integer, String, Date, ForeignKey, Boolean, Float, Text
from sqlalchemy.orm import relationship

from database import Base


class PortfolioCompany(Base):
    __tablename__ = "portfolio_companies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    business_number = Column(String, nullable=True)
    ceo = Column(String, nullable=True)
    address = Column(String, nullable=True)
    industry = Column(String, nullable=True)
    vics_registered = Column(Boolean, nullable=False, default=False)
    corp_number = Column(String, nullable=True)
    founded_date = Column(Date, nullable=True)
    analyst = Column(String, nullable=True)
    contact_name = Column(String, nullable=True)
    contact_email = Column(String, nullable=True)
    contact_phone = Column(String, nullable=True)
    memo = Column(Text, nullable=True)

    investments = relationship("Investment", back_populates="company", cascade="all, delete-orphan")


class Investment(Base):
    __tablename__ = "investments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("portfolio_companies.id"), nullable=False)
    investment_date = Column(Date, nullable=True)
    amount = Column(Float, nullable=True)
    shares = Column(Float, nullable=True)
    share_price = Column(Float, nullable=True)
    valuation = Column(Float, nullable=True)
    contribution_rate = Column(String, nullable=True)
    instrument = Column(String, nullable=True)
    status = Column(String, nullable=False, default="active")
    round = Column(String, nullable=True)
    valuation_pre = Column(Float, nullable=True)
    valuation_post = Column(Float, nullable=True)
    ownership_pct = Column(Float, nullable=True)
    board_seat = Column(String, nullable=True)

    company = relationship("PortfolioCompany", back_populates="investments")
    documents = relationship("InvestmentDocument", back_populates="investment", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="investment", cascade="all, delete-orphan")
    valuations = relationship("Valuation", back_populates="investment", cascade="all, delete-orphan")


class InvestmentDocument(Base):
    __tablename__ = "investment_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=False)
    name = Column(String, nullable=False)
    doc_type = Column(String, nullable=True)
    status = Column(String, nullable=False, default="pending")
    note = Column(String, nullable=True)
    due_date = Column(Date, nullable=True)

    investment = relationship("Investment", back_populates="documents")
