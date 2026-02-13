from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey
from sqlalchemy.orm import relationship

from database import Base


class Checklist(Base):
    __tablename__ = "checklists"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=True)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=True)

    items = relationship(
        "ChecklistItem",
        back_populates="checklist",
        cascade="all, delete-orphan",
        order_by="ChecklistItem.order",
    )


class ChecklistItem(Base):
    __tablename__ = "checklist_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    checklist_id = Column(Integer, ForeignKey("checklists.id"), nullable=False)
    order = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    required = Column(Boolean, nullable=False, default=True)
    checked = Column(Boolean, nullable=False, default=False)
    notes = Column(Text, nullable=True)

    checklist = relationship("Checklist", back_populates="items")
