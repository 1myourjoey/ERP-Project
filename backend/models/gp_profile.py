from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from database import Base


class GPProfile(Base):
    """GP firm profile used by document variable resolution."""

    __tablename__ = "gp_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)

    company_name = Column(String, nullable=False)
    company_name_en = Column(String, nullable=True)
    representative = Column(String, nullable=False)
    business_number = Column(String, nullable=True)
    corporate_number = Column(String, nullable=True)

    address = Column(String, nullable=True)
    address_en = Column(String, nullable=True)

    phone = Column(String, nullable=True)
    fax = Column(String, nullable=True)
    email = Column(String, nullable=True)

    seal_image_path = Column(String, nullable=True)
    signature_image_path = Column(String, nullable=True)

    vc_registration_number = Column(String, nullable=True)
    fss_code = Column(String, nullable=True)

    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

