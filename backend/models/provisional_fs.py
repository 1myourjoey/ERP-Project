from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, Text, func

from database import Base


class ProvisionalFS(Base):
    """Monthly provisional financial statements per fund."""

    __tablename__ = "provisional_fs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id", ondelete="CASCADE"), nullable=False)
    year_month = Column(String, nullable=False)

    status = Column(String, nullable=False, default="draft")  # draft | confirmed | exported

    sfp_data = Column(Text, nullable=True)
    is_data = Column(Text, nullable=True)

    total_assets = Column(Numeric, nullable=True)
    total_liabilities = Column(Numeric, nullable=True)
    total_equity = Column(Numeric, nullable=True)
    net_income = Column(Numeric, nullable=True)

    confirmed_at = Column(DateTime, nullable=True)
    confirmed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
