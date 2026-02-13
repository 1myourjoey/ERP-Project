from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund
from models.regular_report import RegularReport
from schemas.regular_report import RegularReportCreate, RegularReportUpdate

router = APIRouter(prefix="/api/regular-reports", tags=["regular-reports"])

DATE_FIELDS = ["due_date", "submitted_date", "created_at"]
STATUS_COMPAT_MAP: dict[str, list[str]] = {
    "예정": ["예정", "미작성"],
    "준비중": ["준비중", "작성중", "검수중"],
    "제출완료": ["제출완료", "전송완료"],
    "확인완료": ["확인완료"],
    "미작성": ["미작성", "예정"],
    "작성중": ["작성중", "준비중"],
    "검수중": ["검수중", "준비중"],
    "전송완료": ["전송완료", "제출완료"],
    "실패": ["실패"],
}


def _to_primitive(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _serialize_report(report: RegularReport, fund_name: str | None = None) -> dict:
    data = {column.name: _to_primitive(getattr(report, column.name)) for column in report.__table__.columns}
    data["fund_name"] = fund_name
    data["days_remaining"] = (report.due_date - date.today()).days if report.due_date else None
    for field in DATE_FIELDS:
        if field in data and data[field] is not None:
            data[field] = str(data[field])
    return data


@router.get("")
def list_regular_reports(
    report_target: str | None = None,
    fund_id: int | None = None,
    status: str | None = None,
    period: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(RegularReport)
    if report_target:
        query = query.filter(RegularReport.report_target == report_target)
    if fund_id:
        query = query.filter(RegularReport.fund_id == fund_id)
    if status:
        status_values = STATUS_COMPAT_MAP.get(status, [status])
        query = query.filter(RegularReport.status.in_(status_values))
    if period:
        query = query.filter(RegularReport.period == period)

    reports = query.order_by(RegularReport.created_at.desc(), RegularReport.id.desc()).all()
    result = []
    for report in reports:
        fund = db.get(Fund, report.fund_id) if report.fund_id else None
        result.append(_serialize_report(report, fund.name if fund else None))
    return result


@router.get("/{report_id}")
def get_regular_report(report_id: int, db: Session = Depends(get_db)):
    report = db.get(RegularReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="정기보고를 찾을 수 없습니다")
    fund = db.get(Fund, report.fund_id) if report.fund_id else None
    return _serialize_report(report, fund.name if fund else None)


@router.post("", status_code=201)
def create_regular_report(data: RegularReportCreate, db: Session = Depends(get_db)):
    if data.fund_id and not db.get(Fund, data.fund_id):
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")

    report = RegularReport(**data.model_dump())
    db.add(report)
    db.commit()
    db.refresh(report)
    fund = db.get(Fund, report.fund_id) if report.fund_id else None
    return _serialize_report(report, fund.name if fund else None)


@router.put("/{report_id}")
def update_regular_report(report_id: int, data: RegularReportUpdate, db: Session = Depends(get_db)):
    report = db.get(RegularReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="정기보고를 찾을 수 없습니다")

    payload = data.model_dump(exclude_unset=True)
    next_fund_id = payload.get("fund_id", report.fund_id)
    if next_fund_id and not db.get(Fund, next_fund_id):
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")

    for key, value in payload.items():
        setattr(report, key, value)

    db.commit()
    db.refresh(report)
    fund = db.get(Fund, report.fund_id) if report.fund_id else None
    return _serialize_report(report, fund.name if fund else None)


@router.delete("/{report_id}")
def delete_regular_report(report_id: int, db: Session = Depends(get_db)):
    report = db.get(RegularReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="정기보고를 찾을 수 없습니다")
    db.delete(report)
    db.commit()
    return {"ok": True}
