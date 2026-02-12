from sqlalchemy import Column, Integer, String, Date, ForeignKey
from sqlalchemy.orm import relationship

from database import Base


class Fund(Base):
    __tablename__ = "funds"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    formation_date = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="active")
    gp = Column(String, nullable=True)
    co_gp = Column(String, nullable=True)
    trustee = Column(String, nullable=True)
    commitment_total = Column(Integer, nullable=True)
    aum = Column(Integer, nullable=True)

    lps = relationship("LP", back_populates="fund", cascade="all, delete-orphan")


class LP(Base):
    __tablename__ = "lps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    commitment = Column(Integer, nullable=True)
    paid_in = Column(Integer, nullable=True)
    contact = Column(String, nullable=True)

    fund = relationship("Fund", back_populates="lps")
