from __future__ import annotations

from io import BytesIO

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from services.excel_export import (
    export_compliance_report,
    export_fund_summary,
    export_investments,
    export_transactions,
    export_worklogs,
)

router = APIRouter(tags=["excel_export"])

_XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _stream_excel(data: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        BytesIO(data),
        media_type=_XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/api/export/fund/{fund_id}")
async def export_fund(
    fund_id: int,
    db: Session = Depends(get_db),
):
    data = await export_fund_summary(db, fund_id)
    return _stream_excel(data, f"fund_{fund_id}_summary.xlsx")


@router.get("/api/export/investments")
async def export_investments_excel(
    fund_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    data = await export_investments(db, {"fund_id": fund_id})
    suffix = f"_fund_{fund_id}" if fund_id is not None else ""
    return _stream_excel(data, f"investments{suffix}.xlsx")


@router.get("/api/export/transactions")
async def export_transactions_excel(
    fund_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    data = await export_transactions(db, {"fund_id": fund_id})
    suffix = f"_fund_{fund_id}" if fund_id is not None else ""
    return _stream_excel(data, f"transactions{suffix}.xlsx")


@router.get("/api/export/compliance/{fund_id}")
async def export_compliance_excel(
    fund_id: int,
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    data = await export_compliance_report(db, fund_id, year, month)
    return _stream_excel(data, f"compliance_fund_{fund_id}_{year}_{month:02d}.xlsx")


@router.get("/api/export/worklogs")
async def export_worklogs_excel(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    data = await export_worklogs(db, {"date_from": date_from, "date_to": date_to})
    return _stream_excel(data, "worklogs.xlsx")
