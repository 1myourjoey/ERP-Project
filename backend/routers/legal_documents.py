from __future__ import annotations

import re
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from models.compliance import ComplianceDocument
from services.document_ingestion import DocumentIngestionService
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


def _serialize_document(row: ComplianceDocument, chunk_count: int | None = None) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "document_type": row.document_type,
        "version": row.version,
        "effective_date": row.effective_date.isoformat() if row.effective_date else None,
        "content_summary": row.content_summary,
        "file_path": row.file_path,
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
    version: str | None = Form(default=None),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required.")

    normalized_type = _normalize_document_type(document_type)
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in {"pdf", "docx"}:
        raise HTTPException(status_code=400, detail="Only PDF and DOCX are supported.")

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
        version=(version or "").strip() or None,
        file_path=relative_path,
        content_summary=None,
        is_active=True,
    )

    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except Exception:
        db.rollback()
        stored_path.unlink(missing_ok=True)
        raise

    try:
        ingestion = DocumentIngestionService()
        chunk_count = ingestion.ingest(
            file_bytes=file_bytes,
            filename=file.filename,
            collection_name=normalized_type,
            document_id=row.id,
            metadata={
                "document_id": row.id,
                "document_type": normalized_type,
                "title": row.title,
                "version": row.version or "",
            },
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

    row.content_summary = f"Indexed {chunk_count} chunks"
    db.commit()
    db.refresh(row)

    return {
        "document": _serialize_document(row, chunk_count=chunk_count),
        "chunk_count": chunk_count,
        "collection": normalized_type,
    }


@router.get("/api/legal-documents/search")
def search_legal_documents(
    query: str = Query(..., min_length=1),
    collection: str | None = Query(default=None),
    n_results: int = Query(default=5, ge=1, le=20),
):
    selected_collection = collection.strip().lower() if collection else None
    if selected_collection and selected_collection not in ALLOWED_COLLECTIONS:
        raise HTTPException(status_code=400, detail="Unknown collection.")

    try:
        vector_db = VectorDBService()
        if selected_collection:
            rows = vector_db.search(selected_collection, query.strip(), n_results=n_results)
            for row in rows:
                row["collection"] = selected_collection
        else:
            rows = vector_db.search_all_collections(query.strip(), n_results=n_results)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "query": query.strip(),
        "collection": selected_collection,
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
def list_legal_documents(db: Session = Depends(get_db)):
    rows = (
        db.query(ComplianceDocument)
        .filter(ComplianceDocument.document_type.in_(sorted(ALLOWED_COLLECTIONS)))
        .order_by(ComplianceDocument.id.desc())
        .all()
    )

    try:
        vector_db = VectorDBService()
    except RuntimeError:
        return [_serialize_document(row, chunk_count=None) for row in rows]

    items: list[dict] = []
    for row in rows:
        chunk_count = vector_db.count_chunks_for_document(row.document_type, row.id)
        items.append(_serialize_document(row, chunk_count=chunk_count))
    return items
