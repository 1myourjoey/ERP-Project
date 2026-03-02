from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from services.excel_import import confirm_excel_import, parse_excel_preview

router = APIRouter(tags=["excel_import"])


@router.post("/api/import/excel/preview")
async def preview_excel_import(
    file: UploadFile = File(...),
    import_type: str = Form(...),
):
    payload = await file.read()
    return await parse_excel_preview(payload, import_type)


@router.post("/api/import/excel/confirm")
async def confirm_excel_import_api(
    file: UploadFile = File(...),
    import_type: str = Form(...),
    db: Session = Depends(get_db),
):
    payload = await file.read()
    return await confirm_excel_import(db, payload, import_type, options={})
