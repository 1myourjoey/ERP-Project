from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.investment import Investment, PortfolioCompany
from models.vote_record import VoteRecord
from schemas.vote_record import VoteRecordCreate, VoteRecordUpdate

router = APIRouter(prefix="/api/vote-records", tags=["vote-records"])

DATE_FIELDS = ["date", "created_at"]


def _to_primitive(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _serialize_vote_record(record: VoteRecord, company_name: str | None = None, investment_name: str | None = None) -> dict:
    data = {column.name: _to_primitive(getattr(record, column.name)) for column in record.__table__.columns}
    data["company_name"] = company_name
    data["investment_name"] = investment_name
    for field in DATE_FIELDS:
        if field in data and data[field] is not None:
            data[field] = str(data[field])
    return data


@router.get("")
def list_vote_records(
    company_id: int | None = None,
    investment_id: int | None = None,
    vote_type: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(VoteRecord)
    if company_id:
        query = query.filter(VoteRecord.company_id == company_id)
    if investment_id:
        query = query.filter(VoteRecord.investment_id == investment_id)
    if vote_type:
        query = query.filter(VoteRecord.vote_type == vote_type)

    records = query.order_by(VoteRecord.date.desc(), VoteRecord.id.desc()).all()
    result = []
    for record in records:
        company = db.get(PortfolioCompany, record.company_id)
        investment = db.get(Investment, record.investment_id) if record.investment_id else None
        result.append(
            _serialize_vote_record(
                record,
                company.name if company else None,
                f"{investment.id}" if investment else None,
            )
        )
    return result


@router.post("", status_code=201)
def create_vote_record(data: VoteRecordCreate, db: Session = Depends(get_db)):
    company = db.get(PortfolioCompany, data.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="피투자사를 찾을 수 없습니다")
    investment = db.get(Investment, data.investment_id) if data.investment_id else None
    if data.investment_id and not investment:
        raise HTTPException(status_code=404, detail="투자를 찾을 수 없습니다")
    if investment and investment.company_id != data.company_id:
        raise HTTPException(status_code=400, detail="투자와 피투자사 정보가 일치하지 않습니다")

    record = VoteRecord(**data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return _serialize_vote_record(record, company.name, f"{investment.id}" if investment else None)


@router.put("/{record_id}")
def update_vote_record(record_id: int, data: VoteRecordUpdate, db: Session = Depends(get_db)):
    record = db.get(VoteRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="의결권 행사 이력을 찾을 수 없습니다")

    payload = data.model_dump(exclude_unset=True)
    next_company_id = payload.get("company_id", record.company_id)
    next_investment_id = payload.get("investment_id", record.investment_id)

    company = db.get(PortfolioCompany, next_company_id)
    if not company:
        raise HTTPException(status_code=404, detail="피투자사를 찾을 수 없습니다")
    investment = db.get(Investment, next_investment_id) if next_investment_id else None
    if next_investment_id and not investment:
        raise HTTPException(status_code=404, detail="투자를 찾을 수 없습니다")
    if investment and investment.company_id != next_company_id:
        raise HTTPException(status_code=400, detail="투자와 피투자사 정보가 일치하지 않습니다")

    for key, value in payload.items():
        setattr(record, key, value)

    db.commit()
    db.refresh(record)
    return _serialize_vote_record(record, company.name, f"{investment.id}" if investment else None)


@router.delete("/{record_id}")
def delete_vote_record(record_id: int, db: Session = Depends(get_db)):
    record = db.get(VoteRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="의결권 행사 이력을 찾을 수 없습니다")
    db.delete(record)
    db.commit()
    return {"ok": True}
