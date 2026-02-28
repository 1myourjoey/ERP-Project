from __future__ import annotations

from pathlib import Path
from urllib.parse import unquote
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth import get_current_user
from models.attachment import Attachment
from models.user import User
from schemas.attachment import AttachmentLinkUpdate, AttachmentResponse

router = APIRouter(tags=["attachments"])

_UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads"
_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _attachment_to_response(row: Attachment) -> AttachmentResponse:
    return AttachmentResponse(
        id=row.id,
        filename=row.filename,
        original_filename=row.original_filename,
        file_size=row.file_size,
        mime_type=row.mime_type,
        entity_type=row.entity_type,
        entity_id=row.entity_id,
        created_at=row.created_at,
        url=f"/api/attachments/{row.id}",
    )


@router.post("/api/attachments", response_model=AttachmentResponse, status_code=201)
async def upload_attachment(
    request: Request,
    x_file_name: str | None = Header(default=None, alias="X-File-Name"),
    entity_type: str | None = Query(default=None),
    entity_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    original_name = unquote((x_file_name or "").strip())
    if not original_name:
        raise HTTPException(status_code=400, detail="파일명이 비어 있습니다")

    suffix = Path(original_name).suffix.lower()
    stored_name = f"{uuid4().hex}{suffix}"
    stored_path = _UPLOAD_DIR / stored_name

    payload = await request.body()
    if not payload:
        raise HTTPException(status_code=400, detail="빈 파일은 업로드할 수 없습니다")

    with stored_path.open("wb") as out:
        out.write(payload)

    row = Attachment(
        filename=stored_name,
        original_filename=original_name,
        file_path=str(stored_path),
        file_size=len(payload),
        mime_type=request.headers.get("content-type"),
        entity_type=entity_type,
        entity_id=entity_id,
        uploaded_by=current_user.id,
    )
    db.add(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        if stored_path.exists():
            stored_path.unlink(missing_ok=True)
        raise
    db.refresh(row)
    return _attachment_to_response(row)


@router.get("/api/attachments", response_model=list[AttachmentResponse])
def list_attachments(
    ids: str | None = Query(default=None, description="콤마 구분 attachment id 목록"),
    db: Session = Depends(get_db),
):
    query = db.query(Attachment)
    if ids:
        parsed_ids: list[int] = []
        for token in ids.split(","):
            token = token.strip()
            if not token:
                continue
            try:
                parsed = int(token)
            except ValueError:
                continue
            if parsed > 0:
                parsed_ids.append(parsed)
        if not parsed_ids:
            return []
        query = query.filter(Attachment.id.in_(parsed_ids))
    rows = query.order_by(Attachment.id.desc()).all()
    return [_attachment_to_response(row) for row in rows]


@router.get("/api/attachments/{attachment_id}", response_class=FileResponse)
def download_attachment(attachment_id: int, db: Session = Depends(get_db)):
    row = db.get(Attachment, attachment_id)
    if not row:
        raise HTTPException(status_code=404, detail="첨부 파일을 찾을 수 없습니다")

    path = Path(row.file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="첨부 파일 경로를 찾을 수 없습니다")

    return FileResponse(
        path=str(path),
        media_type=row.mime_type or "application/octet-stream",
        filename=row.original_filename,
    )


@router.patch("/api/attachments/{attachment_id}/link", response_model=AttachmentResponse)
def link_attachment(
    attachment_id: int,
    data: AttachmentLinkUpdate,
    db: Session = Depends(get_db),
):
    row = db.get(Attachment, attachment_id)
    if not row:
        raise HTTPException(status_code=404, detail="첨부 파일을 찾을 수 없습니다")
    row.entity_type = data.entity_type
    row.entity_id = data.entity_id
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return _attachment_to_response(row)


@router.delete("/api/attachments/{attachment_id}", status_code=204)
def delete_attachment(attachment_id: int, db: Session = Depends(get_db)):
    row = db.get(Attachment, attachment_id)
    if not row:
        raise HTTPException(status_code=404, detail="첨부 파일을 찾을 수 없습니다")

    path = Path(row.file_path)
    db.delete(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    if path.exists():
        path.unlink(missing_ok=True)
