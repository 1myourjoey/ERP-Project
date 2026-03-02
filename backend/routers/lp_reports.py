from __future__ import annotations

from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth import get_current_user
from models.attachment import Attachment
from models.document_generation import DocumentGeneration
from models.user import User
from services.lp_report_service import collect_lp_report_data, generate_lp_report_docx

router = APIRouter(tags=["lp_reports"])

_UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads" / "lp_reports"
_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@router.get("/api/funds/{fund_id}/lp-report/preview")
async def preview_lp_report_data(
    fund_id: int,
    year: int = Query(..., ge=2000, le=2100),
    quarter: int = Query(..., ge=1, le=4),
    db: Session = Depends(get_db),
):
    try:
        return await collect_lp_report_data(db, fund_id, year, quarter)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/api/funds/{fund_id}/lp-report/generate")
async def generate_lp_report(
    fund_id: int,
    year: int = Query(..., ge=2000, le=2100),
    quarter: int = Query(..., ge=1, le=4),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        docx_bytes = await generate_lp_report_docx(db, fund_id, year, quarter)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    filename = f"lp_report_fund{fund_id}_{year}Q{quarter}.docx"
    stored_name = f"{uuid4().hex}.docx"
    stored_path = _UPLOAD_DIR / stored_name
    stored_path.write_bytes(docx_bytes)

    attachment = Attachment(
        filename=stored_name,
        original_filename=filename,
        file_path=str(stored_path),
        file_size=len(docx_bytes),
        mime_type=_DOCX_MIME,
        entity_type="lp_report",
        entity_id=fund_id,
    )
    db.add(attachment)
    db.flush()

    generation = DocumentGeneration(
        fund_id=fund_id,
        created_by=current_user.id,
        created_at=datetime.utcnow(),
        status="draft",
        variables_json="{}",
        stages="lp_report",
        output_path=str(stored_path),
        total_files=1,
        success_count=1,
        failed_count=0,
        warnings_json=None,
        error_message=None,
    )
    db.add(generation)
    db.commit()
    db.refresh(generation)
    db.refresh(attachment)

    return {
        "generation_id": generation.id,
        "attachment_id": attachment.id,
        "download_url": f"/api/documents/{attachment.id}/download",
        "message": "LP 보고서 초안이 생성되었습니다.",
    }
