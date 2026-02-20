from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from database import Base


class LPAddressBook(Base):
    __tablename__ = "lp_address_books"
    __table_args__ = (
        UniqueConstraint("business_number", name="uq_lp_address_books_business_number"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    contact = Column(String, nullable=True)
    business_number = Column(String, nullable=True)
    address = Column(String, nullable=True)
    memo = Column(Text, nullable=True)
    gp_entity_id = Column(Integer, ForeignKey("gp_entities.id"), nullable=True)
    is_active = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    lps = relationship("LP", back_populates="address_book")
