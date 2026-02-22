from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
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
    fund_id = Column(Integer, ForeignKey("funds.id", ondelete="SET NULL"), nullable=True)
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
    __table_args__ = (
        UniqueConstraint("instance_id", "workflow_step_id", name="uq_step_instance"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    instance_id = Column(Integer, ForeignKey("workflow_instances.id", ondelete="CASCADE"), index=True)
    workflow_step_id = Column(Integer, ForeignKey("workflow_steps.id"))
    calculated_date = Column(Date, nullable=False)
    status = Column(String, default="pending")  # pending, in_progress, completed, skipped
    completed_at = Column(DateTime, nullable=True)
    actual_time = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True)

    instance = relationship("WorkflowInstance", back_populates="step_instances")
    step = relationship("WorkflowStep")
    task = relationship("Task")
    step_documents = relationship(
        "WorkflowStepInstanceDocument",
        back_populates="step_instance",
        cascade="all, delete-orphan",
        order_by="WorkflowStepInstanceDocument.id",
    )


class WorkflowStepInstanceDocument(Base):
    __tablename__ = "workflow_step_instance_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    step_instance_id = Column(
        Integer,
        ForeignKey("workflow_step_instances.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workflow_step_document_id = Column(Integer, ForeignKey("workflow_step_documents.id"), nullable=True)
    document_template_id = Column(Integer, ForeignKey("document_templates.id"), nullable=True)
    name = Column(String, nullable=False)
    required = Column(Boolean, nullable=False, default=True)
    timing = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    checked = Column(Boolean, nullable=False, default=False)

    step_instance = relationship("WorkflowStepInstance", back_populates="step_documents")
    source_document = relationship("WorkflowStepDocument")
    document_template = relationship("DocumentTemplate", lazy="joined")

    @property
    def template_name(self) -> str | None:
        if not self.document_template:
            return None
        return self.document_template.name

    @property
    def template_category(self) -> str | None:
        if not self.document_template:
            return None
        return self.document_template.category
