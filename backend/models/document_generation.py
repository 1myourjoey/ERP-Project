from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from database import Base


class DocumentGeneration(Base):
    __tablename__ = "document_generations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    status = Column(String(20), nullable=False, default="pending", index=True)

    variables_json = Column(Text, nullable=False)
    stages = Column(String(20), nullable=True)

    output_path = Column(String(500), nullable=True)
    total_files = Column(Integer, nullable=False, default=0)
    success_count = Column(Integer, nullable=False, default=0)
    failed_count = Column(Integer, nullable=False, default=0)
    warnings_json = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)


class DocumentVariable(Base):
    __tablename__ = "document_variables"
    __table_args__ = (
        UniqueConstraint("fund_id", "name", name="uq_document_variables_fund_name"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    variables_json = Column(Text, nullable=False)
    is_default = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
