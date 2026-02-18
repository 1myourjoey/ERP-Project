from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from database import Base


class WorkflowInstance(Base):
    __tablename__ = "workflow_instances"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workflow_id = Column(Integer, ForeignKey("workflows.id"))
    name = Column(String, nullable=False)
    trigger_date = Column(Date, nullable=False)
    status = Column(String, default="active")  # active, completed, cancelled
    created_at = Column(DateTime, default=func.now())
    completed_at = Column(DateTime, nullable=True)
    memo = Column(Text, nullable=True)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=True)
    company_id = Column(Integer, ForeignKey("portfolio_companies.id"), nullable=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=True)
    gp_entity_id = Column(Integer, ForeignKey("gp_entities.id"), nullable=True)

    workflow = relationship("Workflow")
    investment = relationship("Investment")
    company = relationship("PortfolioCompany")
    fund = relationship("Fund")
    gp_entity = relationship("GPEntity")
    step_instances = relationship("WorkflowStepInstance", back_populates="instance",
                                  cascade="all, delete-orphan",
                                  order_by="WorkflowStepInstance.calculated_date")


class WorkflowStepInstance(Base):
    __tablename__ = "workflow_step_instances"

    id = Column(Integer, primary_key=True, autoincrement=True)
    instance_id = Column(Integer, ForeignKey("workflow_instances.id"))
    workflow_step_id = Column(Integer, ForeignKey("workflow_steps.id"))
    calculated_date = Column(Date, nullable=False)
    status = Column(String, default="pending")  # pending, in_progress, completed, skipped
    completed_at = Column(DateTime, nullable=True)
    actual_time = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)

    instance = relationship("WorkflowInstance", back_populates="step_instances")
    step = relationship("WorkflowStep")
    task = relationship("Task")
