from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from models.compliance import ComplianceDocument, ComplianceDocumentChunk
from models.fund import Fund
from models.investment import Investment
from services.compliance_orchestrator import ComplianceOrchestrator
from services.document_ingestion import DocumentIngestionService
from services.erp_backbone import backbone_enabled, sync_compliance_document_registry
from services.vector_db import VectorDBService

router = APIRouter(tags=["legal_documents"])

PROJECT_ROOT = Path(__file__).resolve().parents[2]
LEGAL_UPLOAD_DIR = PROJECT_ROOT / "uploads" / "legal_documents"
LEGAL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_COLLECTIONS = set(VectorDBService.COLLECTIONS.keys())


def _sanitize_filename(filename: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]+', "_", filename).strip()
    return cleaned or "legal_document"


def _normalize_document_type(value: str) -> str:
    normalized = value.strip().lower()
    if normalized not in ALLOWED_COLLECTIONS:
        raise HTTPException(
            status_code=400,
            detail="document_type must be one of: laws, regulations, guidelines, agreements, internal",
        )
    return normalized


def _normalize_source_tier(value: str) -> str:
    normalized = value.strip().lower()
    if normalized not in {"law", "fund_bylaw", "special_guideline", "investment_contract"}:
        raise HTTPException(
            status_code=400,
            detail="source_tier must be one of: law, fund_bylaw, special_guideline, investment_contract",
        )
    return normalized


def _parse_optional_datetime(value: str | None, field_name: str) -> datetime | None:
    normalized = (value or "").strip()
    if not normalized:
        return None
    try:
        return datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{field_name} must be ISO datetime.") from exc


def _resolve_scope_fields(
    source_tier: str,
    fund_id: int | None,
    investment_id: int | None,
    fund_type_filter: str | None,
    db: Session,
) -> tuple[str, int | None, int | None, int | None, str | None]:
    normalized_fund_type = (fund_type_filter or "").strip() or None

    if source_tier == "law":
        return "global", None, None, None, None

    if source_tier in {"fund_bylaw", "special_guideline"}:
        if fund_id is None:
            raise HTTPException(status_code=400, detail=f"fund_id is required for {source_tier} documents.")
        fund = db.get(Fund, fund_id)
        if not fund:
            raise HTTPException(status_code=404, detail="Fund not found.")
        normalized_fund_type = normalized_fund_type or (fund.type or "").strip() or None
        return "fund", fund.id, None, None, normalized_fund_type

    if investment_id is None:
        raise HTTPException(
            status_code=400,
            detail="investment_id is required for investment_contract documents.",
        )
    investment = db.get(Investment, investment_id)
    if not investment:
        raise HTTPException(status_code=404, detail="Investment not found.")
    if fund_id is not None and int(fund_id) != int(investment.fund_id):
        raise HTTPException(status_code=400, detail="investment does not belong to the selected fund.")
    fund = db.get(Fund, investment.fund_id)
    return "investment", investment.fund_id, investment.id, investment.company_id, (fund.type or "").strip() if fund and fund.type else None


def _default_review_scenario(source_tier: str) -> str | None:
    if source_tier == "investment_contract":
        return "investment_precheck"
    if source_tier in {"fund_bylaw", "special_guideline"}:
        return "fund_document_check"
    return None


def _source_tier_label(source_tier: str | None) -> str:
    return {
        "law": "공통 법령",
        "fund_bylaw": "조합 규약",
        "special_guideline": "특별조합원 가이드라인",
        "investment_contract": "투자계약서",
    }.get((source_tier or "").strip(), source_tier or "-")


def _attribution_mode(row: ComplianceDocument) -> str:
    if row.source_tier == "law":
        return "global_law"
    if row.source_tier == "fund_bylaw":
        return "fund_policy"
    if row.source_tier == "special_guideline":
        return "special_guideline"
    if row.source_tier == "investment_contract":
        return "investment_contract"
    return "custom"


def _serialize_document(db: Session, row: ComplianceDocument, chunk_count: int | None = None) -> dict:
    investment = db.get(Investment, row.investment_id) if row.investment_id else None
    company = investment.company if investment and getattr(investment, "company", None) else None
    ownership_label = "-"
    if row.source_tier == "law":
        ownership_label = "전체 공통 기준"
    elif row.source_tier == "fund_bylaw":
        ownership_label = f"{row.fund.name if row.fund else f'조합 #{row.fund_id}'} 기준"
    elif row.source_tier == "special_guideline":
        owner = row.document_role or "특별조합원"
        ownership_label = f"{row.fund.name if row.fund else f'조합 #{row.fund_id}'} / {owner}"
    elif row.source_tier == "investment_contract":
        ownership_label = (
            f"{row.fund.name if row.fund else f'조합 #{row.fund_id}'} / "
            f"{company.name if company else f'투자건 #{row.investment_id}'}"
        )
    return {
        "id": row.id,
        "title": row.title,
        "document_type": row.document_type,
        "source_tier": row.source_tier,
        "source_tier_label": _source_tier_label(row.source_tier),
        "attribution_mode": _attribution_mode(row),
        "scope": row.scope,
        "fund_id": row.fund_id,
        "fund_name": row.fund.name if row.fund_id and row.fund else None,
        "investment_id": row.investment_id,
        "investment_label": company.name if company else (f"투자건 #{row.investment_id}" if row.investment_id else None),
        "company_id": row.company_id,
        "company_name": company.name if company else None,
        "document_role": row.document_role,
        "ownership_label": ownership_label,
        "fund_type_filter": row.fund_type_filter,
        "version": row.version,
        "effective_date": row.effective_date.isoformat() if row.effective_date else None,
        "effective_from": row.effective_from.isoformat() if row.effective_from else None,
        "effective_to": row.effective_to.isoformat() if row.effective_to else None,
        "content_summary": row.content_summary,
        "file_path": row.file_path,
        "ingest_status": row.ingest_status,
        "ocr_status": row.ocr_status,
        "index_status": row.index_status,
        "extraction_quality": row.extraction_quality,
        "is_active": bool(row.is_active),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "chunk_count": chunk_count,
    }


def _empty_stats_payload(error: str | None = None) -> dict:
    collections = {
        name: {
            "count": 0,
            "description": VectorDBService.COLLECTIONS.get(name, ""),
        }
        for name in sorted(ALLOWED_COLLECTIONS)
    }
    payload = {
        "collections": collections,
        "total_chunks": 0,
        "available": False,
    }
    if error:
        payload["error"] = error
    return payload


@router.post("/api/legal-documents/upload")
async def upload_legal_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    document_type: str = Form(...),
    source_tier: str = Form(default="law"),
    version: str | None = Form(default=None),
    fund_id: int | None = Form(default=None),
    investment_id: int | None = Form(default=None),
    fund_type_filter: str | None = Form(default=None),
    document_role: str | None = Form(default=None),
    effective_from: str | None = Form(default=None),
    effective_to: str | None = Form(default=None),
    supersedes_document_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required.")

    normalized_type = _normalize_document_type(document_type)
    normalized_tier = _normalize_source_tier(source_tier)
    normalized_role = (document_role or "").strip() or None
    scope, resolved_fund_id, resolved_investment_id, resolved_company_id, resolved_fund_type = _resolve_scope_fields(
        normalized_tier,
        fund_id,
        investment_id,
        fund_type_filter,
        db,
    )
    if normalized_tier == "special_guideline" and not normalized_role:
        raise HTTPException(status_code=400, detail="document_role is required for special_guideline documents.")
    if normalized_tier == "fund_bylaw" and normalized_role is None:
        normalized_role = "조합규약"
    if normalized_tier == "investment_contract" and normalized_role is None:
        normalized_role = "투자계약서"
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in {"pdf", "docx"}:
        raise HTTPException(status_code=400, detail="Only PDF and DOCX are supported.")
    if supersedes_document_id is not None and not db.get(ComplianceDocument, supersedes_document_id):
        raise HTTPException(status_code=404, detail="Superseded document not found.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    stored_name = f"{uuid4().hex}_{_sanitize_filename(file.filename)}"
    stored_path = LEGAL_UPLOAD_DIR / stored_name
    stored_path.write_bytes(file_bytes)
    relative_path = str(stored_path.relative_to(PROJECT_ROOT)).replace("\\", "/")

    row = ComplianceDocument(
        title=title.strip(),
        document_type=normalized_type,
        source_tier=normalized_tier,
        scope=scope,
        fund_id=resolved_fund_id,
        investment_id=resolved_investment_id,
        company_id=resolved_company_id,
        fund_type_filter=resolved_fund_type,
        version=(version or "").strip() or None,
        document_role=normalized_role,
        file_path=relative_path,
        effective_from=_parse_optional_datetime(effective_from, "effective_from"),
        effective_to=_parse_optional_datetime(effective_to, "effective_to"),
        supersedes_document_id=supersedes_document_id,
        ingest_status="uploaded",
        ocr_status="pending" if ext == "pdf" else "not_needed",
        index_status="pending",
        content_summary=None,
        is_active=True,
    )

    db.add(row)
    try:
        db.flush()
        if backbone_enabled():
            sync_compliance_document_registry(db, row)
        db.commit()
        db.refresh(row)
    except Exception:
        db.rollback()
        stored_path.unlink(missing_ok=True)
        raise

    try:
        ingestion = DocumentIngestionService()
        ingest_result = ingestion.ingest(
            file_bytes=file_bytes,
            filename=file.filename,
            collection_name=normalized_type,
            document_id=row.id,
            metadata={
                "document_id": row.id,
                "document_type": normalized_type,
                "source_tier": normalized_tier,
                "title": row.title,
                "version": row.version or "",
                "scope": scope,
                "fund_id": resolved_fund_id if resolved_fund_id is not None else "",
                "investment_id": resolved_investment_id if resolved_investment_id is not None else "",
                "company_id": resolved_company_id if resolved_company_id is not None else "",
                "fund_type_filter": resolved_fund_type or "",
                "document_role": row.document_role or "",
            },
            db=db,
        )
    except RuntimeError as exc:
        db.delete(row)
        db.commit()
        stored_path.unlink(missing_ok=True)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        db.delete(row)
        db.commit()
        stored_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        db.delete(row)
        db.commit()
        stored_path.unlink(missing_ok=True)
        raise

    row.ingest_status = ingest_result["ingest_status"]
    row.ocr_status = ingest_result["ocr_status"]
    row.index_status = ingest_result["index_status"]
    row.extraction_quality = ingest_result["extraction_quality"]
    row.content_summary = f"Indexed {ingest_result['chunk_count']} chunks"
    db.commit()
    db.refresh(row)

    auto_review = None
    auto_review_error = None
    review_scenario = _default_review_scenario(normalized_tier)
    if review_scenario and resolved_fund_id is not None:
        try:
            orchestrator = ComplianceOrchestrator()
            auto_review = await orchestrator.run_review(
                db=db,
                fund_id=resolved_fund_id,
                scenario=review_scenario,
                investment_id=resolved_investment_id,
                query=None,
                trigger_type="event",
                created_by=None,
                run_rule_engine=True,
            )
            db.commit()
        except Exception as exc:  # noqa: BLE001 - upload should succeed even if auto-review fails
            db.rollback()
            auto_review_error = str(exc)

    return {
        "document": _serialize_document(db, row, chunk_count=ingest_result["chunk_count"]),
        "chunk_count": ingest_result["chunk_count"],
        "collection": normalized_type,
        "auto_review": auto_review,
        "auto_review_error": auto_review_error,
    }


@router.delete("/api/legal-documents/{document_id}")
def delete_legal_document(document_id: int, db: Session = Depends(get_db)):
    row = db.get(ComplianceDocument, document_id)
    if not row:
        raise HTTPException(status_code=404, detail="Document not found.")

    if row.document_type in ALLOWED_COLLECTIONS:
        try:
            vector_db = VectorDBService()
            vector_db.delete_chunks_by_document(row.document_type, row.id)
        except RuntimeError:
            # Keep delete endpoint usable even when vector dependencies are unavailable.
            pass

    if row.file_path:
        candidate = Path(row.file_path)
        file_path = candidate if candidate.is_absolute() else (PROJECT_ROOT / candidate)
        file_path.unlink(missing_ok=True)

    (
        db.query(ComplianceDocumentChunk)
        .filter(ComplianceDocumentChunk.document_id == row.id)
        .delete(synchronize_session=False)
    )
    db.delete(row)
    db.commit()
    return {"deleted": True, "id": document_id}


@router.get("/api/legal-documents/search")
def search_legal_documents(
    query: str = Query(..., min_length=1),
    collection: str | None = Query(default=None),
    fund_id: int | None = Query(default=None, ge=1),
    investment_id: int | None = Query(default=None, ge=1),
    n_results: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
):
    selected_collection = collection.strip().lower() if collection else None
    if selected_collection and selected_collection not in ALLOWED_COLLECTIONS:
        raise HTTPException(status_code=400, detail="Unknown collection.")

    try:
        vector_db = VectorDBService()
        fund = db.get(Fund, fund_id) if fund_id else None
        if selected_collection:
            scoped_rows = vector_db.search_with_scope(
                query=query.strip(),
                fund_id=fund_id,
                fund_type=(fund.type or "").strip() if fund and fund.type else None,
                investment_id=investment_id,
                n_results=n_results,
            )
            rows = [row for row in scoped_rows if row.get("collection") == selected_collection]
        else:
            rows = vector_db.search_with_scope(
                query=query.strip(),
                fund_id=fund_id,
                fund_type=(fund.type or "").strip() if fund and fund.type else None,
                investment_id=investment_id,
                n_results=n_results,
            )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "query": query.strip(),
        "collection": selected_collection,
        "fund_id": fund_id,
        "investment_id": investment_id,
        "count": len(rows),
        "results": rows,
    }


@router.get("/api/legal-documents/stats")
def get_indexing_stats():
    try:
        vector_db = VectorDBService()
        stats = vector_db.get_stats()
        total_chunks = sum(int(item.get("count", 0)) for item in stats.values())
        return {"collections": stats, "total_chunks": total_chunks, "available": True}
    except RuntimeError as exc:
        # Keep UI functional when ChromaDB/OpenAI embedding dependencies are unavailable.
        return _empty_stats_payload(error=str(exc))


@router.get("/api/legal-documents")
def list_legal_documents(
    source_tier: str | None = Query(default=None),
    fund_id: int | None = Query(default=None, ge=1),
    investment_id: int | None = Query(default=None, ge=1),
    active_only: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    rows_query = db.query(ComplianceDocument).filter(
        ComplianceDocument.document_type.in_(sorted(ALLOWED_COLLECTIONS))
    )
    if source_tier:
        rows_query = rows_query.filter(ComplianceDocument.source_tier == source_tier.strip().lower())
    if fund_id is not None:
        rows_query = rows_query.filter(ComplianceDocument.fund_id == fund_id)
    if investment_id is not None:
        rows_query = rows_query.filter(ComplianceDocument.investment_id == investment_id)
    if active_only:
        rows_query = rows_query.filter(ComplianceDocument.is_active == True)
    rows = rows_query.order_by(ComplianceDocument.id.desc()).all()

    try:
        vector_db = VectorDBService()
    except RuntimeError:
        return [_serialize_document(db, row, chunk_count=None) for row in rows]

    items: list[dict] = []
    for row in rows:
        chunk_count = vector_db.count_chunks_for_document(row.document_type, row.id)
        items.append(_serialize_document(db, row, chunk_count=chunk_count))
    return items
