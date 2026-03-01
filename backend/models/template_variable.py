from sqlalchemy import Boolean, Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from database import Base


class TemplateVariable(Base):
    """Variable definition per document template."""

    __tablename__ = "template_variables"

    id = Column(Integer, primary_key=True, autoincrement=True)
    template_id = Column(
        Integer,
        ForeignKey("document_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    marker_name = Column(String, nullable=False)
    display_label = Column(String, nullable=True)
    source_type = Column(String, nullable=True)
    source_field = Column(String, nullable=True)
    default_value = Column(String, nullable=True)
    is_required = Column(Boolean, nullable=False, default=True)
    display_order = Column(Integer, nullable=False, default=0)

    template = relationship("DocumentTemplate", back_populates="template_variables")
