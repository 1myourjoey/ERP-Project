from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.pre_report_check import PreReportCheck
from models.regular_report import RegularReport
from schemas.pre_report_check import PreReportCheckResponse
from services.pre_report_checker import PreReportChecker

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.post("/{report_id}/pre-check", response_model=PreReportCheckResponse)
def run_pre_report_check(
    report_id: int,
    db: Session = Depends(get_db),
):
    report = db.get(RegularReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="정기보고를 찾을 수 없습니다")

    checker = PreReportChecker()
    try:
        row = checker.check_all(report_id=report_id, db=db, created_by=None)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return checker.serialize(row)


@router.get("/{report_id}/pre-checks", response_model=list[PreReportCheckResponse])
def get_pre_report_checks(
    report_id: int,
    db: Session = Depends(get_db),
):
    report = db.get(RegularReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="정기보고를 찾을 수 없습니다")

    rows = (
        db.query(PreReportCheck)
        .filter(PreReportCheck.report_id == report_id)
        .order_by(PreReportCheck.checked_at.desc(), PreReportCheck.id.desc())
        .all()
    )
    checker = PreReportChecker()
    return [checker.serialize(row) for row in rows]
