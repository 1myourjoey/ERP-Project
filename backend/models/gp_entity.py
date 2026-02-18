from sqlalchemy import Column, Date, Float, Integer, String, Text

from database import Base


class GPEntity(Base):
    """GP 법인(고유계정) 정보"""

    __tablename__ = "gp_entities"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    entity_type = Column(String, nullable=False)  # vc / llc_vc / nksa / other
    business_number = Column(String, nullable=True)
    registration_number = Column(String, nullable=True)
    representative = Column(String, nullable=True)
    address = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    founding_date = Column(Date, nullable=True)
    license_date = Column(Date, nullable=True)
    capital = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    is_primary = Column(Integer, nullable=False, default=1)
