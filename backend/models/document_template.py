from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from database import Base


class DocumentTemplate(Base):
    __tablename__ = "document_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    file_path = Column(String, nullable=True, default="")
    builder_name = Column(String, nullable=True)
    description = Column(Text, default="")
    variables = Column(Text, default="[]")
    custom_data = Column(Text, default="{}")
    workflow_step_label = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
