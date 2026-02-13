from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from database import Base


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=True)
    code = Column(String, nullable=False, default="")
    name = Column(String, nullable=False, default="")
    category = Column(String, nullable=False, default="")
    sub_category = Column(String, nullable=True)
    normal_side = Column(String, nullable=True)
    is_active = Column(String, nullable=False, default="true")
    display_order = Column(Integer, nullable=False, default=0)


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True, index=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    entry_date = Column(Date, nullable=False)
    entry_type = Column(String, nullable=False, default="일반분개")
    description = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="미결재")
    source_type = Column(String, nullable=True)
    source_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    lines = relationship("JournalEntryLine", back_populates="journal_entry", cascade="all, delete-orphan")


class JournalEntryLine(Base):
    __tablename__ = "journal_entry_lines"

    id = Column(Integer, primary_key=True, index=True)
    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    debit = Column(Numeric, nullable=False, default=0)
    credit = Column(Numeric, nullable=False, default=0)
    memo = Column(String, nullable=True)

    journal_entry = relationship("JournalEntry", back_populates="lines")
