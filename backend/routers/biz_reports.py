from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund
from models.biz_report import BizReport
from models.investment import PortfolioCompany
from schemas.biz_report import BizReportCreate, BizReportUpdate

router = APIRouter(prefix="/api/biz-reports", tags=["biz-reports"])

NUMERIC_FIELDS = [
    "revenue",
    "operating_income",
    "net_income",
    "total_assets",
    "total_liabilities",
]
DATE_FIELDS = ["requested_date", "received_date", "reviewed_date", "created_at"]


def _to_primitive(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _serialize_report(
    report: BizReport,
    company_name: str | None = None,
    fund_name: str | None = None,
) -> dict:
    data = {column.name: _to_primitive(getattr(report, column.name)) for column in report.__table__.columns}
    data["company_name"] = company_name
    data["fund_name"] = fund_name
    for field in NUMERIC_FIELDS:
        value = data.get(field)
        if value is not None:
            data[field] = float(value)
    for field in DATE_FIELDS:
        if field in data and data[field] is not None:
            data[field] = str(data[field])
    return data


@router.get("")
def list_biz_reports(
    company_id: int | None = None,
    fund_id: int | None = None,
    report_type: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(BizReport)
    if company_id:
        query = query.filter(BizReport.company_id == company_id)
    if fund_id:
        query = query.filter(BizReport.fund_id == fund_id)
    if report_type:
        query = query.filter(BizReport.report_type == report_type)
    if status:
        query = query.filter(BizReport.status == status)

    reports = query.order_by(BizReport.created_at.desc(), BizReport.id.desc()).all()
    result = []
    for report in reports:
        company = db.get(PortfolioCompany, report.company_id)
        fund = db.get(Fund, report.fund_id) if report.fund_id else None
        result.append(_serialize_report(report, company.name if company else None, fund.name if fund else None))
    return result


@router.get("/{report_id}")
def get_biz_report(report_id: int, db: Session = Depends(get_db)):
    report = db.get(BizReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="영업보고를 찾을 수 없습니다")
    company = db.get(PortfolioCompany, report.company_id)
    fund = db.get(Fund, report.fund_id) if report.fund_id else None
    return _serialize_report(report, company.name if company else None, fund.name if fund else None)


@router.post("", status_code=201)
def create_biz_report(data: BizReportCreate, db: Session = Depends(get_db)):
    company = db.get(PortfolioCompany, data.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="피투자사를 찾을 수 없습니다")
    if data.fund_id and not db.get(Fund, data.fund_id):
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")

    report = BizReport(**data.model_dump())
    db.add(report)
    db.commit()
    db.refresh(report)
    fund = db.get(Fund, report.fund_id) if report.fund_id else None
    return _serialize_report(report, company.name, fund.name if fund else None)


@router.put("/{report_id}")
def update_biz_report(report_id: int, data: BizReportUpdate, db: Session = Depends(get_db)):
    report = db.get(BizReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="영업보고를 찾을 수 없습니다")

    payload = data.model_dump(exclude_unset=True)
    next_fund_id = payload.get("fund_id", report.fund_id)
    if next_fund_id and not db.get(Fund, next_fund_id):
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")
    for key, value in payload.items():
        setattr(report, key, value)

    db.commit()
    db.refresh(report)
    company = db.get(PortfolioCompany, report.company_id)
    fund = db.get(Fund, report.fund_id) if report.fund_id else None
    return _serialize_report(report, company.name if company else None, fund.name if fund else None)


@router.delete("/{report_id}")
def delete_biz_report(report_id: int, db: Session = Depends(get_db)):
    report = db.get(BizReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="영업보고를 찾을 수 없습니다")
    db.delete(report)
    db.commit()
    return {"ok": True}
