from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


class Workflow(Base):
    __tablename__ = "workflows"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    trigger_description = Column(String, nullable=True)
    category = Column(String, nullable=True)
    total_duration = Column(String, nullable=True)

    steps = relationship("WorkflowStep", back_populates="workflow",
                         cascade="all, delete-orphan", order_by="WorkflowStep.order")
    documents = relationship("WorkflowDocument", back_populates="workflow",
                             cascade="all, delete-orphan")
    warnings = relationship("WorkflowWarning", back_populates="workflow",
                            cascade="all, delete-orphan")


class WorkflowStep(Base):
    __tablename__ = "workflow_steps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workflow_id = Column(Integer, ForeignKey("workflows.id"))
    order = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    timing = Column(String, nullable=False)  # D-7, D-day, D+2
    timing_offset_days = Column(Integer, nullable=False)
    estimated_time = Column(String, nullable=True)
    quadrant = Column(String, default="Q1")
    memo = Column(Text, nullable=True)

    workflow = relationship("Workflow", back_populates="steps")


class WorkflowDocument(Base):
    __tablename__ = "workflow_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workflow_id = Column(Integer, ForeignKey("workflows.id"))
    name = Column(String, nullable=False)
    required = Column(Boolean, default=True)
    timing = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    workflow = relationship("Workflow", back_populates="documents")


class WorkflowWarning(Base):
    __tablename__ = "workflow_warnings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workflow_id = Column(Integer, ForeignKey("workflows.id"))
    content = Column(Text, nullable=False)
    category = Column(String, nullable=True, default="warning")

    workflow = relationship("Workflow", back_populates="warnings")
