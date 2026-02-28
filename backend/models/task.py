from sqlalchemy import Boolean, Column, Integer, String, Text, DateTime, ForeignKey, func
from database import Base


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)
    deadline = Column(DateTime, nullable=True, index=True)
    estimated_time = Column(String, nullable=True)
    quadrant = Column(String, nullable=False)  # Q1, Q2, Q3, Q4
    memo = Column(Text, nullable=True)
    status = Column(String, default="pending", index=True)  # pending, in_progress, completed
    delegate_to = Column(String, nullable=True)  # Q3 delegation
    created_at = Column(DateTime, default=func.now())
    completed_at = Column(DateTime, nullable=True)
    actual_time = Column(String, nullable=True)

    workflow_instance_id = Column(Integer, ForeignKey("workflow_instances.id", ondelete="SET NULL"), nullable=True, index=True)
    workflow_step_order = Column(Integer, nullable=True)

    # Phase 10
    category = Column(String, nullable=True, index=True)
    fund_id = Column(Integer, ForeignKey("funds.id", ondelete="SET NULL"), nullable=True, index=True)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=True)
    gp_entity_id = Column(Integer, ForeignKey("gp_entities.id"), nullable=True)
    obligation_id = Column(Integer, ForeignKey("compliance_obligations.id"), nullable=True, index=True)
    auto_generated = Column(Boolean, nullable=False, default=False)
    source = Column(String, nullable=True)
    is_notice = Column(Boolean, nullable=False, default=False, index=True)
    is_report = Column(Boolean, nullable=False, default=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
