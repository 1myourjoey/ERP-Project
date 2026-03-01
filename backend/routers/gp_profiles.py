from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from database import get_db
from models.gp_profile import GPProfile

router = APIRouter(tags=["gp_profiles"])


class GPProfileBase(BaseModel):
    company_name: str = Field(min_length=1)
    company_name_en: str | None = None
    representative: str = Field(min_length=1)
    business_number: str | None = None
    corporate_number: str | None = None
    address: str | None = None
    address_en: str | None = None
    phone: str | None = None
    fax: str | None = None
    email: str | None = None
    seal_image_path: str | None = None
    signature_image_path: str | None = None
    vc_registration_number: str | None = None
    fss_code: str | None = None
    memo: str | None = None


class GPProfileCreate(GPProfileBase):
    pass


class GPProfileUpdate(BaseModel):
    company_name: str | None = None
    company_name_en: str | None = None
    representative: str | None = None
    business_number: str | None = None
    corporate_number: str | None = None
    address: str | None = None
    address_en: str | None = None
    phone: str | None = None
    fax: str | None = None
    email: str | None = None
    seal_image_path: str | None = None
    signature_image_path: str | None = None
    vc_registration_number: str | None = None
    fss_code: str | None = None
    memo: str | None = None


class GPProfileResponse(GPProfileBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime | None = None
    updated_at: datetime | None = None


@router.get("/api/gp-profiles", response_model=list[GPProfileResponse])
def list_gp_profiles(db: Session = Depends(get_db)):
    return db.query(GPProfile).order_by(GPProfile.id.desc()).all()


@router.get("/api/gp-profiles/{profile_id}", response_model=GPProfileResponse)
def get_gp_profile(profile_id: int, db: Session = Depends(get_db)):
    row = db.get(GPProfile, profile_id)
    if not row:
        raise HTTPException(status_code=404, detail="GP profile not found")
    return row


@router.post("/api/gp-profiles", response_model=GPProfileResponse, status_code=201)
def create_gp_profile(data: GPProfileCreate, db: Session = Depends(get_db)):
    row = GPProfile(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/api/gp-profiles/{profile_id}", response_model=GPProfileResponse)
def update_gp_profile(profile_id: int, data: GPProfileUpdate, db: Session = Depends(get_db)):
    row = db.get(GPProfile, profile_id)
    if not row:
        raise HTTPException(status_code=404, detail="GP profile not found")

    payload = data.model_dump(exclude_unset=True)
    if "company_name" in payload and not str(payload["company_name"] or "").strip():
        raise HTTPException(status_code=400, detail="company_name must not be empty")
    if "representative" in payload and not str(payload["representative"] or "").strip():
        raise HTTPException(status_code=400, detail="representative must not be empty")

    for key, value in payload.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    return row

