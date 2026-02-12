from sqlalchemy import Column, Integer, String, Date, ForeignKey, Boolean
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

    investments = relationship("Investment", back_populates="company", cascade="all, delete-orphan")


class Investment(Base):
    __tablename__ = "investments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("portfolio_companies.id"), nullable=False)
    investment_date = Column(Date, nullable=True)
    amount = Column(Integer, nullable=True)
    shares = Column(Integer, nullable=True)
    share_price = Column(Integer, nullable=True)
    valuation = Column(Integer, nullable=True)
    contribution_rate = Column(String, nullable=True)
    instrument = Column(String, nullable=True)
    status = Column(String, nullable=False, default="active")

    company = relationship("PortfolioCompany", back_populates="investments")
    documents = relationship("InvestmentDocument", back_populates="investment", cascade="all, delete-orphan")


class InvestmentDocument(Base):
    __tablename__ = "investment_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=False)
    name = Column(String, nullable=False)
    doc_type = Column(String, nullable=True)
    status = Column(String, nullable=False, default="pending")
    note = Column(String, nullable=True)

    investment = relationship("Investment", back_populates="documents")
