from __future__ import annotations

from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth import get_current_user
from models.analytics_view import AnalyticsView
from models.audit_log import AuditLog
from models.user import User
from schemas.analytics import (
    AnalyticsBatchQueryRequest,
    AnalyticsBatchQueryResponse,
    AnalyticsBatchQueryResult,
    AnalyticsCatalogResponse,
    AnalyticsExportRequest,
    AnalyticsQueryRequest,
    AnalyticsQueryResponse,
    AnalyticsSavedViewCreate,
    AnalyticsSavedViewResponse,
    AnalyticsSavedViewUpdate,
)
from services.analytics.catalog import build_catalog_response, get_subject_definition
from services.analytics.export_service import export_query_to_xlsx
from services.analytics.query_service import run_query

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

_XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _record_audit(db: Session, request: Request, user: User, action: str, target_id: int | None = None, detail: str | None = None) -> None:
    db.add(
        AuditLog(
            user_id=user.id,
            action=action,
            target_type="analytics_view" if target_id else "analytics_export",
            target_id=target_id,
            detail=detail,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    )


@router.get("/catalog", response_model=AnalyticsCatalogResponse)
def get_catalog(db: Session = Depends(get_db)):
    return build_catalog_response(db)


@router.post("/query", response_model=AnalyticsQueryResponse)
def query_analytics(payload: AnalyticsQueryRequest, db: Session = Depends(get_db)):
    return run_query(db, payload)


@router.post("/query-batch", response_model=AnalyticsBatchQueryResponse)
def query_analytics_batch(payload: AnalyticsBatchQueryRequest, db: Session = Depends(get_db)):
    if len(payload.items) > 12:
        raise HTTPException(status_code=400, detail="배치 질의는 최대 12개까지 허용됩니다.")

    results: list[AnalyticsBatchQueryResult] = []
    for item in payload.items:
        try:
            results.append(AnalyticsBatchQueryResult(key=item.key, response=run_query(db, item.query)))
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else "배치 질의 처리 중 오류가 발생했습니다."
            results.append(AnalyticsBatchQueryResult(key=item.key, error=detail))
        except Exception:
            results.append(AnalyticsBatchQueryResult(key=item.key, error="배치 질의 처리 중 오류가 발생했습니다."))

    return AnalyticsBatchQueryResponse(results=results)


@router.get("/views", response_model=list[AnalyticsSavedViewResponse])
def list_views(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (
        db.query(AnalyticsView)
        .filter(AnalyticsView.owner_user_id == current_user.id)
        .order_by(AnalyticsView.is_favorite.desc(), AnalyticsView.updated_at.desc(), AnalyticsView.id.desc())
        .all()
    )
    return [
        AnalyticsSavedViewResponse(
            id=row.id,
            owner_user_id=row.owner_user_id,
            name=row.name,
            description=row.description,
            subject_key=row.subject_key,
            config=row.config_json,
            is_favorite=row.is_favorite,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]


@router.post("/views", response_model=AnalyticsSavedViewResponse, status_code=201)
def create_view(
    payload: AnalyticsSavedViewCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if get_subject_definition(payload.subject_key) is None:
        raise HTTPException(status_code=400, detail="유효하지 않은 subject입니다.")
    row = AnalyticsView(
        owner_user_id=current_user.id,
        name=payload.name.strip(),
        description=(payload.description or "").strip() or None,
        subject_key=payload.subject_key,
        config_json=payload.config,
        is_favorite=bool(payload.is_favorite),
    )
    db.add(row)
    db.flush()
    _record_audit(db, request, current_user, "analytics_view_create", row.id, row.name)
    db.commit()
    db.refresh(row)
    return AnalyticsSavedViewResponse(
        id=row.id,
        owner_user_id=row.owner_user_id,
        name=row.name,
        description=row.description,
        subject_key=row.subject_key,
        config=row.config_json,
        is_favorite=row.is_favorite,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/views/{view_id}", response_model=AnalyticsSavedViewResponse)
def get_view(view_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    row = _get_owned_view(db, current_user, view_id)
    return AnalyticsSavedViewResponse(
        id=row.id,
        owner_user_id=row.owner_user_id,
        name=row.name,
        description=row.description,
        subject_key=row.subject_key,
        config=row.config_json,
        is_favorite=row.is_favorite,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.put("/views/{view_id}", response_model=AnalyticsSavedViewResponse)
def update_view(
    view_id: int,
    payload: AnalyticsSavedViewUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = _get_owned_view(db, current_user, view_id)
    data = payload.model_dump(exclude_unset=True)
    if "subject_key" in data and data["subject_key"] is not None:
        if get_subject_definition(data["subject_key"]) is None:
            raise HTTPException(status_code=400, detail="유효하지 않은 subject입니다.")
        row.subject_key = data["subject_key"]
    if "name" in data and data["name"] is not None:
        row.name = data["name"].strip()
    if "description" in data:
        row.description = (data["description"] or "").strip() or None
    if "config" in data and data["config"] is not None:
        row.config_json = data["config"]
    if "is_favorite" in data and data["is_favorite"] is not None:
        row.is_favorite = bool(data["is_favorite"])
    _record_audit(db, request, current_user, "analytics_view_update", row.id, row.name)
    db.commit()
    db.refresh(row)
    return AnalyticsSavedViewResponse(
        id=row.id,
        owner_user_id=row.owner_user_id,
        name=row.name,
        description=row.description,
        subject_key=row.subject_key,
        config=row.config_json,
        is_favorite=row.is_favorite,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.delete("/views/{view_id}", response_model=dict[str, bool])
def delete_view(
    view_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = _get_owned_view(db, current_user, view_id)
    _record_audit(db, request, current_user, "analytics_view_delete", row.id, row.name)
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/export/xlsx")
def export_xlsx(
    payload: AnalyticsExportRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.view_id is None and payload.query is None:
        raise HTTPException(status_code=400, detail="view_id 또는 query가 필요합니다.")

    query_payload = payload.query
    if payload.view_id is not None:
        row = _get_owned_view(db, current_user, payload.view_id)
        query_payload = AnalyticsQueryRequest(**row.config_json)

    if query_payload is None:
        raise HTTPException(status_code=400, detail="유효한 질의가 없습니다.")

    response = run_query(db, query_payload)
    file_name = (payload.file_name or f"analytics_{query_payload.subject_key}.xlsx").strip() or "analytics.xlsx"
    if not file_name.lower().endswith(".xlsx"):
        file_name = f"{file_name}.xlsx"

    data = export_query_to_xlsx(query_payload, response)
    _record_audit(db, request, current_user, "analytics_export", None, file_name)
    db.commit()
    return StreamingResponse(
        BytesIO(data),
        media_type=_XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f"attachment; filename={file_name}"},
    )


def _get_owned_view(db: Session, current_user: User, view_id: int) -> AnalyticsView:
    row = (
        db.query(AnalyticsView)
        .filter(AnalyticsView.id == view_id, AnalyticsView.owner_user_id == current_user.id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="분석 뷰를 찾을 수 없습니다.")
    return row

