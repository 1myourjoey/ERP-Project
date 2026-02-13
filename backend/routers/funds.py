from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund, LP
from schemas.fund import (
    FundCreate,
    FundUpdate,
    FundListItem,
    FundResponse,
    LPCreate,
    LPUpdate,
    LPResponse,
)

router = APIRouter(tags=["funds"])


@router.get("/api/funds", response_model=list[FundListItem])
def list_funds(db: Session = Depends(get_db)):
    funds = db.query(Fund).order_by(Fund.id.desc()).all()
    return [
        FundListItem(
            id=f.id,
            name=f.name,
            type=f.type,
            status=f.status,
            commitment_total=f.commitment_total,
            aum=f.aum,
            lp_count=len(f.lps),
        )
        for f in funds
    ]


@router.get("/api/funds/{fund_id}", response_model=FundResponse)
def get_fund(fund_id: int, db: Session = Depends(get_db)):
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")
    return fund


@router.post("/api/funds", response_model=FundResponse, status_code=201)
def create_fund(data: FundCreate, db: Session = Depends(get_db)):
    fund = Fund(**data.model_dump())
    db.add(fund)
    db.commit()
    db.refresh(fund)
    return fund


@router.put("/api/funds/{fund_id}", response_model=FundResponse)
def update_fund(fund_id: int, data: FundUpdate, db: Session = Depends(get_db)):
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")

    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(fund, key, val)

    db.commit()
    db.refresh(fund)
    return fund


@router.delete("/api/funds/{fund_id}", status_code=204)
def delete_fund(fund_id: int, db: Session = Depends(get_db)):
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")
    db.delete(fund)
    db.commit()


@router.get("/api/funds/{fund_id}/lps", response_model=list[LPResponse])
def list_lps(fund_id: int, db: Session = Depends(get_db)):
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")
    return db.query(LP).filter(LP.fund_id == fund_id).order_by(LP.id.desc()).all()


@router.post("/api/funds/{fund_id}/lps", response_model=LPResponse, status_code=201)
def create_lp(fund_id: int, data: LPCreate, db: Session = Depends(get_db)):
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")

    lp = LP(fund_id=fund_id, **data.model_dump())
    db.add(lp)
    db.commit()
    db.refresh(lp)
    return lp


@router.put("/api/funds/{fund_id}/lps/{lp_id}", response_model=LPResponse)
def update_lp(fund_id: int, lp_id: int, data: LPUpdate, db: Session = Depends(get_db)):
    lp = db.get(LP, lp_id)
    if not lp or lp.fund_id != fund_id:
        raise HTTPException(status_code=404, detail="LP를 찾을 수 없습니다")

    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(lp, key, val)

    db.commit()
    db.refresh(lp)
    return lp


@router.delete("/api/funds/{fund_id}/lps/{lp_id}", status_code=204)
def delete_lp(fund_id: int, lp_id: int, db: Session = Depends(get_db)):
    lp = db.get(LP, lp_id)
    if not lp or lp.fund_id != fund_id:
        raise HTTPException(status_code=404, detail="LP를 찾을 수 없습니다")

    db.delete(lp)
    db.commit()


