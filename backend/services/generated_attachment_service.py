from __future__ import annotations

import re
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from models.attachment import Attachment

UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def sanitize_generated_filename(value: str, fallback: str = "generated_document") -> str:
    sanitized = re.sub(r'[\\/:*?"<>|]+', "_", value).strip()
    return sanitized or fallback


def cleanup_generated_attachment(attachment: Attachment | None) -> None:
    if attachment is None:
        return
    try:
        Path(attachment.file_path).unlink(missing_ok=True)
    except OSError:
        pass


def store_generated_attachment(
    *,
    db: Session,
    payload: bytes,
    original_filename: str,
    mime_type: str,
    entity_type: str,
    entity_id: int | None = None,
    uploaded_by: int | None = None,
    commit: bool = True,
) -> Attachment:
    suffix = Path(original_filename).suffix or ""
    stored_name = f"{uuid4().hex}{suffix}"
    stored_path = UPLOAD_DIR / stored_name
    stored_path.write_bytes(payload)

    attachment = Attachment(
        filename=stored_name,
        original_filename=original_filename,
        file_path=str(stored_path),
        file_size=len(payload),
        mime_type=mime_type,
        entity_type=entity_type,
        entity_id=entity_id,
        uploaded_by=uploaded_by,
    )
    db.add(attachment)
    if commit:
        try:
            db.commit()
        except Exception:
            db.rollback()
            stored_path.unlink(missing_ok=True)
            raise
        db.refresh(attachment)
    return attachment
