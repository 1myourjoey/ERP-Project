from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from models.attachment import Attachment
from services.document_builders.contribution_cert import build_contribution_cert
from services.document_builders.doc_request_letter import build_doc_request_letter
from services.document_builders.follow_up_report import build_follow_up_report
from services.document_builders.internal_review_report import build_internal_review_report
from services.document_builders.irc_minutes import build_irc_minutes
from services.document_builders.operation_instruction import build_operation_instruction
from services.generated_attachment_service import sanitize_generated_filename, store_generated_attachment

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

BUILDER_LABELS: dict[str, str] = {
    "follow_up_report": "후속관리보고서",
    "operation_instruction": "운용지시서",
    "contribution_cert": "출자증서",
    "irc_minutes": "투심위 의사록",
    "internal_review_report": "내부보고회 통합보고서",
    "doc_request_letter": "피투자사 서류요청 공문",
}


def _require_int(params: dict[str, Any], key: str) -> int:
    if key not in params:
        raise ValueError(f"필수 파라미터가 없습니다: {key}")
    value = params.get(key)
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"파라미터 형식이 올바르지 않습니다: {key}") from exc
    return parsed


def _sanitize_filename(value: str) -> str:
    return sanitize_generated_filename(value, fallback="generated_document.docx")


def _build_filename(builder: str, params: dict[str, Any]) -> str:
    today = datetime.now().strftime("%Y%m%d")
    if builder == "follow_up_report":
        return _sanitize_filename(f"후속관리보고서_CR{_require_int(params, 'company_review_id')}_{today}.docx")
    if builder == "operation_instruction":
        return _sanitize_filename(f"운용지시서_TX{_require_int(params, 'transaction_id')}_{today}.docx")
    if builder == "contribution_cert":
        fund_id = _require_int(params, "fund_id")
        lp_id = _require_int(params, "lp_id")
        return _sanitize_filename(f"출자증서_F{fund_id}_LP{lp_id}_{today}.docx")
    if builder == "irc_minutes":
        return _sanitize_filename(f"투심위의사록_IR{_require_int(params, 'investment_review_id')}_{today}.docx")
    if builder == "internal_review_report":
        return _sanitize_filename(f"내부보고회통합보고서_R{_require_int(params, 'internal_review_id')}_{today}.docx")
    if builder == "doc_request_letter":
        fund_id = _require_int(params, "fund_id")
        investment_id = _require_int(params, "investment_id")
        year = _require_int(params, "year")
        quarter = _require_int(params, "quarter")
        return _sanitize_filename(f"서류요청공문_F{fund_id}_I{investment_id}_{year}Q{quarter}.docx")
    raise ValueError("지원하지 않는 문서 빌더입니다.")


def _build_bytes(builder: str, params: dict[str, Any], db: Session) -> bytes:
    if builder == "follow_up_report":
        return build_follow_up_report(_require_int(params, "company_review_id"), db)
    if builder == "operation_instruction":
        return build_operation_instruction(_require_int(params, "transaction_id"), db)
    if builder == "contribution_cert":
        return build_contribution_cert(_require_int(params, "fund_id"), _require_int(params, "lp_id"), db)
    if builder == "irc_minutes":
        return build_irc_minutes(_require_int(params, "investment_review_id"), db)
    if builder == "internal_review_report":
        return build_internal_review_report(_require_int(params, "internal_review_id"), db)
    if builder == "doc_request_letter":
        return build_doc_request_letter(
            fund_id=_require_int(params, "fund_id"),
            investment_id=_require_int(params, "investment_id"),
            year=_require_int(params, "year"),
            quarter=_require_int(params, "quarter"),
            db=db,
        )
    raise ValueError("지원하지 않는 문서 빌더입니다.")


def _extract_entity_id(params: dict[str, Any]) -> int | None:
    for key in (
        "internal_review_id",
        "company_review_id",
        "investment_review_id",
        "transaction_id",
        "investment_id",
        "lp_id",
        "fund_id",
    ):
        if key not in params:
            continue
        try:
            return int(params[key])
        except (TypeError, ValueError):
            continue
    return None


def generate_and_store_document(builder: str, params: dict[str, Any], db: Session) -> dict[str, Any]:
    if builder not in BUILDER_LABELS:
        raise ValueError("지원하지 않는 문서 빌더입니다.")

    filename = _build_filename(builder, params)
    payload = _build_bytes(builder, params, db)
    if not payload:
        raise RuntimeError("문서 생성 결과가 비어 있습니다.")

    attachment = store_generated_attachment(
        db=db,
        payload=payload,
        original_filename=filename,
        mime_type=DOCX_MIME,
        entity_type=f"generated_document:{builder}",
        entity_id=_extract_entity_id(params),
        commit=False,
    )
    try:
        db.commit()
    except Exception:
        db.rollback()
        from pathlib import Path

        Path(attachment.file_path).unlink(missing_ok=True)
        raise

    db.refresh(attachment)
    return {
        "document_id": attachment.id,
        "filename": attachment.original_filename,
        "download_url": f"/api/documents/{attachment.id}/download",
    }


def list_generated_documents(db: Session, builder: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
    safe_limit = max(1, min(int(limit or 100), 500))
    query = db.query(Attachment).filter(Attachment.entity_type.like("generated_document:%"))
    if builder:
        query = query.filter(Attachment.entity_type == f"generated_document:{builder}")

    rows = query.order_by(Attachment.id.desc()).limit(safe_limit).all()
    result: list[dict[str, Any]] = []
    for row in rows:
        raw = row.entity_type or ""
        parsed_builder = raw.split(":", 1)[1] if ":" in raw else "unknown"
        result.append(
            {
                "id": row.id,
                "builder": parsed_builder,
                "builder_label": BUILDER_LABELS.get(parsed_builder, parsed_builder),
                "filename": row.original_filename,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "download_url": f"/api/documents/{row.id}/download",
            }
        )
    return result
