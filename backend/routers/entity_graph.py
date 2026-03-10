from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from schemas.erp_backbone import DocumentRecordResponse, ErpEntityContextResponse, ErpTimelineResponse
from services.erp_backbone import build_entity_context, build_timeline, list_document_registry

router = APIRouter(tags=["entity-graph"])


@router.get("/api/entity-graph/context", response_model=ErpEntityContextResponse)
def get_entity_graph_context(
    subject_type: str = Query(..., min_length=1),
    native_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return build_entity_context(db, subject_type=subject_type.strip(), native_id=native_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/api/entity-graph/timeline", response_model=ErpTimelineResponse)
def get_entity_graph_timeline(
    subject_type: str = Query(..., min_length=1),
    native_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return build_timeline(db, subject_type=subject_type.strip(), native_id=native_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/api/document-registry", response_model=list[DocumentRecordResponse])
def get_document_registry(
    subject_type: str | None = Query(default=None),
    native_id: int | None = Query(default=None, ge=1),
    fund_id: int | None = Query(default=None, ge=1),
    gp_entity_id: int | None = Query(default=None, ge=1),
    company_id: int | None = Query(default=None, ge=1),
    investment_id: int | None = Query(default=None, ge=1),
    status_code: str | None = Query(default=None),
    lifecycle_stage: str | None = Query(default=None),
    document_role: str | None = Query(default=None),
    origin_model: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return list_document_registry(
        db,
        subject_type=subject_type.strip() if subject_type else None,
        native_id=native_id,
        fund_id=fund_id,
        gp_entity_id=gp_entity_id,
        company_id=company_id,
        investment_id=investment_id,
        status_code=status_code.strip() if status_code else None,
        lifecycle_stage=lifecycle_stage.strip() if lifecycle_stage else None,
        document_role=document_role.strip() if document_role else None,
        origin_model=origin_model.strip() if origin_model else None,
    )
