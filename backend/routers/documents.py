import json
from datetime import datetime
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.document_template import DocumentTemplate
from models.fund import Fund, LP
from schemas.document_template import DocumentTemplateResponse
from services.document_service import build_variables_for_fund, generate_document_for_template

router = APIRouter(tags=["documents"])


class TemplateCustomDataUpdate(BaseModel):
    custom_data: dict[str, Any]


class TemplatePreviewRequest(BaseModel):
    custom_data: dict[str, Any] | None = None


def _load_custom_data_from_template(template: DocumentTemplate) -> dict[str, Any] | None:
    if not template.custom_data:
        return None
    try:
        loaded = json.loads(template.custom_data)
    except json.JSONDecodeError:
        return None
    return loaded if isinstance(loaded, dict) else None


def _sample_variables() -> dict[str, str]:
    return {
        "fund_name": "OO 1호 조합",
        "gp_name": "트리거투자파트너스(유)",
        "document_date": "2025. 01. 01",
        "document_number": "트리거-2025-001호",
        "assembly_date": "2025년 1월 15일(수요일)",
        "assembly_time": "오전 10시",
        "assembly_method": "서면결의",
        "lp_count": "5",
        "total_commitment_amount": "10,000,000,000",
    }


@router.get("/api/document-templates", response_model=list[DocumentTemplateResponse])
def list_document_templates(category: str | None = None, db: Session = Depends(get_db)):
    query = db.query(DocumentTemplate)
    if category:
        query = query.filter(DocumentTemplate.category == category)
    return query.order_by(DocumentTemplate.category.asc(), DocumentTemplate.name.asc()).all()


@router.get("/api/document-templates/{template_id}", response_model=DocumentTemplateResponse)
def get_document_template(template_id: int, db: Session = Depends(get_db)):
    template = db.get(DocumentTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다.")
    return template


@router.put("/api/document-templates/{template_id}/custom", response_model=DocumentTemplateResponse)
def update_template_custom_data(
    template_id: int,
    body: TemplateCustomDataUpdate,
    db: Session = Depends(get_db),
):
    template = db.get(DocumentTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다.")

    template.custom_data = json.dumps(body.custom_data, ensure_ascii=False)
    db.commit()
    db.refresh(template)
    return template


@router.post("/api/document-templates/{template_id}/preview")
def preview_template(
    template_id: int,
    body: TemplatePreviewRequest | None = Body(default=None),
    fund_id: int | None = Query(None, description="미리보기용 조합 ID (선택)"),
    db: Session = Depends(get_db),
):
    template = db.get(DocumentTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다.")

    if fund_id:
        fund = db.get(Fund, fund_id)
        lps = db.query(LP).filter(LP.fund_id == fund_id).all() if fund else []
        variables = build_variables_for_fund(fund, lps) if fund else _sample_variables()
    else:
        variables = _sample_variables()

    custom_data: dict[str, Any] | None = None
    if body and body.custom_data is not None:
        custom_data = body.custom_data
    else:
        custom_data = _load_custom_data_from_template(template)

    if custom_data:
        variables["__custom_data__"] = custom_data

    try:
        buffer = generate_document_for_template(template, variables)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    filename = f"미리보기_{template.name}.docx"
    quoted_filename = quote(filename)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quoted_filename}"},
    )


@router.post("/api/document-templates/{template_id}/generate")
def generate_from_template(
    template_id: int,
    fund_id: int = Query(..., description="조합 ID"),
    assembly_date: str | None = Query(None, description="총회 일자 (YYYY-MM-DD)"),
    document_number: str | None = Query(None, description="문서번호"),
    db: Session = Depends(get_db),
):
    template = db.get(DocumentTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다.")

    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다.")

    lps = db.query(LP).filter(LP.fund_id == fund_id).all()

    extra: dict[str, str] = {}
    if assembly_date:
        try:
            dt = datetime.fromisoformat(assembly_date)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="assembly_date 형식이 올바르지 않습니다.") from exc
        day_names = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"]
        extra["assembly_date"] = f"{dt.year}년 {dt.month}월 {dt.day}일({day_names[dt.weekday()]})"
        extra["assembly_date_short"] = f"{dt.year}. {dt.month:02d}. {dt.day:02d}"
        extra["assembly_time"] = "오전 10시"
    if document_number:
        extra["document_number"] = document_number

    variables = build_variables_for_fund(fund, lps, extra)

    try:
        buffer = generate_document_for_template(template, variables)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    today = datetime.now().strftime("%Y-%m-%d")
    filename = f"[{fund.name}]_{template.name}_{today}.docx"
    quoted_filename = quote(filename)

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quoted_filename}"},
    )
