import json

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
    is_notice = Column(Boolean, nullable=False, default=False)
    is_report = Column(Boolean, nullable=False, default=False)

    workflow = relationship("Workflow", back_populates="steps")
    step_documents = relationship(
        "WorkflowStepDocument",
        back_populates="step",
        cascade="all, delete-orphan",
    )


class WorkflowStepDocument(Base):
    __tablename__ = "workflow_step_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workflow_step_id = Column(Integer, ForeignKey("workflow_steps.id"), nullable=False)
    document_template_id = Column(Integer, ForeignKey("document_templates.id"), nullable=True)
    name = Column(String, nullable=False)
    required = Column(Boolean, default=True)
    timing = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    attachment_ids_raw = Column("attachment_ids", Text, nullable=False, default="[]")

    step = relationship("WorkflowStep", back_populates="step_documents")
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

    @property
    def attachment_ids(self) -> list[int]:
        if not self.attachment_ids_raw:
            return []
        try:
            decoded = json.loads(self.attachment_ids_raw)
        except json.JSONDecodeError:
            return []
        if not isinstance(decoded, list):
            return []
        result: list[int] = []
        for item in decoded:
            try:
                parsed = int(item)
            except (TypeError, ValueError):
                continue
            if parsed > 0:
                result.append(parsed)
        return result

    @attachment_ids.setter
    def attachment_ids(self, value: list[int] | None) -> None:
        normalized: list[int] = []
        for item in value or []:
            try:
                parsed = int(item)
            except (TypeError, ValueError):
                continue
            if parsed > 0 and parsed not in normalized:
                normalized.append(parsed)
        self.attachment_ids_raw = json.dumps(normalized, ensure_ascii=False)


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
