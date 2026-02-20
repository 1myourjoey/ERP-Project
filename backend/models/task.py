from sqlalchemy import Boolean, Column, Integer, String, Text, DateTime, ForeignKey, func
from database import Base


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)
    deadline = Column(DateTime, nullable=True)
    estimated_time = Column(String, nullable=True)
    quadrant = Column(String, nullable=False)  # Q1, Q2, Q3, Q4
    memo = Column(Text, nullable=True)
    status = Column(String, default="pending")  # pending, in_progress, completed
    delegate_to = Column(String, nullable=True)  # Q3 delegation
    created_at = Column(DateTime, default=func.now())
    completed_at = Column(DateTime, nullable=True)
    actual_time = Column(String, nullable=True)

    workflow_instance_id = Column(Integer, ForeignKey("workflow_instances.id", ondelete="SET NULL"), nullable=True)
    workflow_step_order = Column(Integer, nullable=True)

    # Phase 10
    category = Column(String, nullable=True)
    fund_id = Column(Integer, ForeignKey("funds.id", ondelete="SET NULL"), nullable=True)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=True)
    gp_entity_id = Column(Integer, ForeignKey("gp_entities.id"), nullable=True)
    is_notice = Column(Boolean, nullable=False, default=False)
    is_report = Column(Boolean, nullable=False, default=False)
