from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.biz_report import BizReport
from models.fund import Fund
from schemas.biz_report import BizReportCreate, BizReportResponse, BizReportUpdate

router = APIRouter(prefix="/api/biz-reports", tags=["biz-reports"])

NUMERIC_FIELDS = [
    "total_commitment",
    "total_paid_in",
    "total_invested",
    "total_distributed",
    "fund_nav",
    "irr",
    "tvpi",
    "dpi",
]
DATE_FIELDS = ["submission_date", "created_at"]


def _to_primitive(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _serialize_report(report: BizReport, fund_name: str | None = None) -> dict:
    data = {
        column.name: _to_primitive(getattr(report, column.name))
        for column in report.__table__.columns
    }
    data["fund_name"] = fund_name

    for field in NUMERIC_FIELDS:
        value = data.get(field)
        if value is not None:
            data[field] = float(value)

    for field in DATE_FIELDS:
        if field in data and data[field] is not None:
            data[field] = str(data[field])

    return data


@router.get("", response_model=list[BizReportResponse])
def list_biz_reports(
    fund_id: int | None = None,
    year: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(BizReport)
    if fund_id:
        query = query.filter(BizReport.fund_id == fund_id)
    if year:
        query = query.filter(BizReport.report_year == year)
    if status:
        query = query.filter(BizReport.status == status)

    reports = query.order_by(BizReport.report_year.desc(), BizReport.created_at.desc(), BizReport.id.desc()).all()
    result = []
    for report in reports:
        fund = db.get(Fund, report.fund_id)
        result.append(_serialize_report(report, fund.name if fund else None))
    return result


@router.get("/{report_id}", response_model=BizReportResponse)
def get_biz_report(report_id: int, db: Session = Depends(get_db)):
    report = db.get(BizReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="영업보고를 찾을 수 없습니다")
    fund = db.get(Fund, report.fund_id)
    return _serialize_report(report, fund.name if fund else None)


@router.post("", response_model=BizReportResponse, status_code=201)
def create_biz_report(data: BizReportCreate, db: Session = Depends(get_db)):
    fund = db.get(Fund, data.fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")

    report = BizReport(**data.model_dump())
    db.add(report)
    db.commit()
    db.refresh(report)
    return _serialize_report(report, fund.name)


@router.put("/{report_id}", response_model=BizReportResponse)
def update_biz_report(report_id: int, data: BizReportUpdate, db: Session = Depends(get_db)):
    report = db.get(BizReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="영업보고를 찾을 수 없습니다")

    payload = data.model_dump(exclude_unset=True)
    next_fund_id = payload.get("fund_id", report.fund_id)
    fund = db.get(Fund, next_fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")

    for key, value in payload.items():
        setattr(report, key, value)

    db.commit()
    db.refresh(report)
    return _serialize_report(report, fund.name)


@router.delete("/{report_id}")
def delete_biz_report(report_id: int, db: Session = Depends(get_db)):
    report = db.get(BizReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="영업보고를 찾을 수 없습니다")
    db.delete(report)
    db.commit()
    return {"ok": True}

