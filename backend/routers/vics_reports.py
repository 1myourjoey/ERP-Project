from __future__ import annotations

import json
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models.vics_report import VicsMonthlyReport
from services.vics_report_service import VicsReportService

router = APIRouter(tags=["vics-reports"])


class VicsGenerateBody(BaseModel):
    fund_id: int
    year: int = Field(..., ge=2000, le=2100)
    month: int = Field(..., ge=1, le=12)
    report_code: str


class VicsPatchBody(BaseModel):
    discrepancy_notes: str | None = None
    status: str | None = None


def _serialize(row: VicsMonthlyReport) -> dict:
    return {
        "id": row.id,
        "fund_id": row.fund_id,
        "year": row.year,
        "month": row.month,
        "report_code": row.report_code,
        "data_json": json.loads(row.data_json or "{}"),
        "status": row.status,
        "confirmed_at": row.confirmed_at.isoformat() if row.confirmed_at else None,
        "submitted_at": row.submitted_at.isoformat() if row.submitted_at else None,
        "discrepancy_notes": row.discrepancy_notes,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("/api/vics/reports")
def list_vics_reports(
    fund_id: int | None = None,
    year: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(VicsMonthlyReport)
    if fund_id is not None:
        query = query.filter(VicsMonthlyReport.fund_id == fund_id)
    if year is not None:
        query = query.filter(VicsMonthlyReport.year == year)
    if month is not None:
        query = query.filter(VicsMonthlyReport.month == month)
    rows = query.order_by(VicsMonthlyReport.year.desc(), VicsMonthlyReport.month.desc(), VicsMonthlyReport.id.desc()).all()
    return [_serialize(row) for row in rows]


@router.get("/api/vics/reports/{report_id}")
def get_vics_report(report_id: int, db: Session = Depends(get_db)):
    row = db.get(VicsMonthlyReport, report_id)
    if not row:
        raise HTTPException(status_code=404, detail="VICS 월보고를 찾을 수 없습니다.")
    return _serialize(row)


@router.post("/api/vics/reports/generate")
def generate_vics_report(body: VicsGenerateBody, db: Session = Depends(get_db)):
    service = VicsReportService(db)
    try:
        row = service.generate_report(
            fund_id=body.fund_id,
            year=body.year,
            month=body.month,
            report_code=body.report_code,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _serialize(row)


@router.post("/api/vics/reports/{report_id}/confirm")
def confirm_vics_report(report_id: int, db: Session = Depends(get_db)):
    row = db.get(VicsMonthlyReport, report_id)
    if not row:
        raise HTTPException(status_code=404, detail="VICS 월보고를 찾을 수 없습니다.")
    row.status = "confirmed"
    row.confirmed_at = datetime.utcnow()
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return _serialize(row)


@router.post("/api/vics/reports/{report_id}/submit")
def submit_vics_report(report_id: int, db: Session = Depends(get_db)):
    row = db.get(VicsMonthlyReport, report_id)
    if not row:
        raise HTTPException(status_code=404, detail="VICS 월보고를 찾을 수 없습니다.")
    row.status = "submitted"
    row.submitted_at = datetime.utcnow()
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return _serialize(row)


@router.patch("/api/vics/reports/{report_id}")
def patch_vics_report(report_id: int, body: VicsPatchBody, db: Session = Depends(get_db)):
    row = db.get(VicsMonthlyReport, report_id)
    if not row:
        raise HTTPException(status_code=404, detail="VICS 월보고를 찾을 수 없습니다.")
    if body.discrepancy_notes is not None:
        row.discrepancy_notes = body.discrepancy_notes
    if body.status is not None:
        row.status = body.status
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return _serialize(row)


@router.get("/api/vics/reports/{report_id}/export-xlsx")
def export_vics_report_xlsx(report_id: int, db: Session = Depends(get_db)):
    service = VicsReportService(db)
    try:
        payload = service.export_vics_xlsx(report_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    row = db.get(VicsMonthlyReport, report_id)
    filename = f"VICS_{row.report_code}_{row.year}_{row.month:02d}.xlsx" if row else "vics_report.xlsx"
    quoted_filename = quote(filename)
    return StreamingResponse(
        iter([payload]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quoted_filename}"},
    )
