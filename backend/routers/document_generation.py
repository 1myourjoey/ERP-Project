from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import SessionLocal, get_db
from dependencies.auth import get_current_user
from models.document_generation import DocumentGeneration, DocumentVariable
from models.fund import Fund, LP
from models.gp_entity import GPEntity
from models.user import User
from schemas.document_generation import (
    AutoFillResponse,
    DocumentGenerateRequest,
    DocumentGenerateResponse,
    DocumentGenerationHistoryItem,
    DocumentGenerationStatusResponse,
    DocumentVariableCreate,
    DocumentVariableResponse,
    DocumentVariableUpdate,
    MarkerInfo,
    SimpleOkResponse,
    TemplateFileInfo,
    TemplateStructure,
)
from services.document_generator import generate_documents
from services.bulk_document_generator import BulkDocumentGenerator
from services.template_manager import (
    get_marker_infos,
    get_marker_keys,
    get_template_files,
    get_template_structure,
    resolve_generation_output_dir,
    resolve_output_base_dir,
    resolve_template_base_dir,
)
from services.variable_resolver import VariableResolver

router = APIRouter(tags=["document_generation"])

_PROGRESS_LOCK = threading.Lock()
_PROGRESS_STATE: dict[int, dict[str, Any]] = {}


def _set_progress(generation_id: int, current: int, total: int, message: str) -> None:
    with _PROGRESS_LOCK:
        _PROGRESS_STATE[generation_id] = {
            "current": current,
            "total": total,
            "message": message,
            "updated_at": datetime.utcnow(),
        }


def _get_progress(generation_id: int) -> dict[str, Any] | None:
    with _PROGRESS_LOCK:
        data = _PROGRESS_STATE.get(generation_id)
        return dict(data) if data else None


def _clear_progress(generation_id: int) -> None:
    with _PROGRESS_LOCK:
        _PROGRESS_STATE.pop(generation_id, None)


def _parse_warnings(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        decoded = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(decoded, list):
        return []
    return [str(item) for item in decoded]


def _parse_stages(raw: str | None) -> list[int] | None:
    if not raw:
        return None
    parts = [item.strip() for item in str(raw).split(",") if item.strip()]
    if not parts:
        return None
    stages: list[int] = []
    for part in parts:
        try:
            stage = int(part)
        except ValueError:
            continue
        if stage not in stages:
            stages.append(stage)
    return stages or None


def _safe_filename(value: str) -> str:
    sanitized = re.sub(r'[\\/:*?"<>|]+', "_", value).strip()
    return sanitized or "generated_documents"


def _build_download_url(row: DocumentGeneration) -> str | None:
    if row.status != "completed":
        return None
    if not row.output_path:
        return None
    output_path = Path(row.output_path)
    if not output_path.exists():
        return None
    return f"/api/document-generation/{row.id}/download"


def _normalize_variables(values: dict[str, Any]) -> dict[str, str]:
    known_keys = get_marker_keys()
    normalized = {str(key): str(value if value is not None else "") for key, value in values.items()}
    for key in known_keys:
        normalized.setdefault(key, "")
    return normalized


def _to_variable_response(row: DocumentVariable) -> DocumentVariableResponse:
    try:
        decoded = json.loads(row.variables_json or "{}")
    except json.JSONDecodeError:
        decoded = {}
    variables = decoded if isinstance(decoded, dict) else {}
    return DocumentVariableResponse(
        id=row.id,
        fund_id=row.fund_id,
        name=row.name,
        variables={str(key): str(value) for key, value in variables.items()},
        is_default=bool(row.is_default),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _to_history_item(row: DocumentGeneration) -> DocumentGenerationHistoryItem:
    return DocumentGenerationHistoryItem(
        id=row.id,
        fund_id=row.fund_id,
        created_by=row.created_by,
        created_at=row.created_at,
        status=row.status,  # type: ignore[arg-type]
        stages=_parse_stages(row.stages),
        total_files=int(row.total_files or 0),
        success_count=int(row.success_count or 0),
        failed_count=int(row.failed_count or 0),
        warnings=_parse_warnings(row.warnings_json),
        error_message=row.error_message,
        download_url=_build_download_url(row),
    )


def _format_int(value: float | int | None) -> str:
    if value is None:
        return ""
    try:
        return f"{int(float(value)):,}"
    except (TypeError, ValueError):
        return ""


def _format_date_dot(value) -> str:
    if value is None:
        return ""
    try:
        return f"{value.year}.{value.month:02d}.{value.day:02d}"
    except Exception:
        return ""


def _derive_fund_series(fund_name: str) -> str:
    matched = re.search(r"(\d+)\s*호", fund_name)
    if not matched:
        return ""
    return f"{matched.group(1)}호"


def _resolve_gp_entity(db: Session, fund: Fund) -> GPEntity | None:
    if getattr(fund, "gp_entity_id", None):
        linked = db.get(GPEntity, fund.gp_entity_id)
        if linked:
            return linked
    gp_name = (fund.gp or "").strip()
    if gp_name:
        exact = db.query(GPEntity).filter(GPEntity.name == gp_name).first()
        if exact:
            return exact
    return None


def _build_auto_fill_variables(db: Session, fund: Fund) -> tuple[dict[str, str], list[str]]:
    variables = {key: "" for key in get_marker_keys()}
    mapped_keys: list[str] = []

    def set_value(key: str, value: str | None) -> None:
        if key not in variables:
            return
        normalized = str(value or "").strip()
        if not normalized:
            return
        variables[key] = normalized
        if key not in mapped_keys:
            mapped_keys.append(key)

    gp = _resolve_gp_entity(db, fund)
    lp_count = db.query(LP).filter(LP.fund_id == fund.id).count()
    commitment_total = float(fund.commitment_total or 0)
    estimated_seats = int(commitment_total / 1_000_000) if commitment_total > 0 else 0

    set_value("조합명", fund.name)
    set_value("조합명_파일명", (fund.name or "").replace(" ", ""))
    set_value("조합_호수", _derive_fund_series(fund.name or ""))

    gp_name = gp.name if gp else (fund.gp or "")
    set_value("업무집행조합원_정식", gp_name)
    set_value("업무집행조합원_약칭", gp_name)
    set_value("대표이사", gp.representative if gp else "")
    set_value("대표펀드매니저", fund.fund_manager or "")
    set_value("사업자등록번호", gp.business_number if gp else "")
    set_value("법인등록번호", gp.registration_number if gp else "")
    set_value("사업장주소_정식", gp.address if gp else "")

    set_value("총출자금_숫자", _format_int(commitment_total))
    set_value("총출자금_기호", f"₩{_format_int(commitment_total)}" if commitment_total else "")
    set_value("총출자좌수", _format_int(estimated_seats))
    set_value("유한책임조합원수", str(lp_count))
    set_value("조합원총수", str(lp_count + (1 if gp_name else 0)))
    set_value("수탁기관", fund.trustee or "")

    set_value("개업일", _format_date_dot(fund.formation_date))
    if fund.formation_date and fund.maturity_date:
        duration_years = max(1, fund.maturity_date.year - fund.formation_date.year)
        set_value("존속기간", f"{duration_years}년")

    account_number = (fund.account_number or "").strip()
    if account_number:
        set_value("납입계좌번호", account_number)

    return variables, mapped_keys


def _run_generation_task(generation_id: int, variables: dict[str, str], stages: list[int] | None) -> None:
    db = SessionLocal()
    generation = db.get(DocumentGeneration, generation_id)
    if not generation:
        db.close()
        return

    try:
        generation.status = "processing"
        generation.error_message = None
        db.commit()
        db.refresh(generation)

        template_dir = resolve_template_base_dir()
        output_base = resolve_generation_output_dir(generation_id)
        if output_base.exists():
            shutil.rmtree(output_base, ignore_errors=True)
        output_base.mkdir(parents=True, exist_ok=True)

        def on_progress(current: int, total: int, message: str) -> None:
            _set_progress(generation_id, current, total, message)

        _set_progress(generation_id, 0, 0, "생성 준비 중")
        timeout_sec_raw = os.getenv("DOCUMENT_GENERATION_TIMEOUT_SEC", "600").strip()
        try:
            timeout_sec = max(60, int(timeout_sec_raw))
        except ValueError:
            timeout_sec = 600

        result = asyncio.run(
            asyncio.wait_for(
                generate_documents(
                    variables=variables,
                    template_dir=str(template_dir),
                    output_dir=str(output_base),
                    stages=stages,
                    progress_callback=on_progress,
                ),
                timeout=timeout_sec,
            )
        )

        warnings = result.get("warnings", [])
        failed = result.get("failed", [])
        success = result.get("success", [])
        total_files = int(result.get("total_files", len(success) + len(failed)))
        output_path = str(result.get("output_path") or "")

        generation.status = "completed"
        generation.output_path = output_path or None
        generation.total_files = total_files
        generation.success_count = len(success)
        generation.failed_count = len(failed)
        generation.warnings_json = json.dumps(warnings, ensure_ascii=False) if warnings else None
        generation.error_message = None
        db.commit()
    except asyncio.TimeoutError:
        generation.status = "failed"
        generation.error_message = (
            "서류 생성 제한 시간(초) 초과. "
            "HWP COM 응답 대기 상태일 수 있습니다. "
            "필요 시 DOCUMENT_GENERATION_DISABLE_HWP=true 로 HWP를 복사 모드로 전환하세요."
        )
        db.commit()
    except Exception as exc:
        generation.status = "failed"
        generation.error_message = str(exc)
        db.commit()
    finally:
        _clear_progress(generation_id)
        db.close()


@router.get("/api/document-generation/templates", response_model=TemplateStructure)
def fetch_template_structure() -> TemplateStructure:
    return TemplateStructure.model_validate(get_template_structure())


@router.get("/api/document-generation/templates/{stage}", response_model=list[TemplateFileInfo])
def fetch_template_files(stage: int) -> list[TemplateFileInfo]:
    if stage < 1 or stage > 5:
        raise HTTPException(status_code=400, detail="stage는 1~5 범위여야 합니다.")
    return [TemplateFileInfo.model_validate(item) for item in get_template_files(stage=stage)]


@router.get("/api/document-generation/markers", response_model=list[MarkerInfo])
def fetch_markers() -> list[MarkerInfo]:
    return [MarkerInfo.model_validate(item) for item in get_marker_infos()]


@router.get("/api/document-generation/auto-fill/{fund_id}", response_model=AutoFillResponse)
def auto_fill_variables(fund_id: int, db: Session = Depends(get_db)):
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다.")

    variables, mapped = _build_auto_fill_variables(db, fund)
    return AutoFillResponse(fund_id=fund_id, variables=variables, mapped_keys=mapped)


@router.get("/api/document-generation/history", response_model=list[DocumentGenerationHistoryItem])
def fetch_generation_history(
    fund_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
):
    query = db.query(DocumentGeneration)
    if fund_id is not None:
        query = query.filter(DocumentGeneration.fund_id == fund_id)
    rows = query.order_by(DocumentGeneration.created_at.desc(), DocumentGeneration.id.desc()).all()
    return [_to_history_item(row) for row in rows]


@router.get("/api/document-generation/history/{history_id}", response_model=DocumentGenerationHistoryItem)
def fetch_generation_history_detail(history_id: int, db: Session = Depends(get_db)):
    row = db.get(DocumentGeneration, history_id)
    if not row:
        raise HTTPException(status_code=404, detail="생성 이력을 찾을 수 없습니다.")
    return _to_history_item(row)


@router.delete("/api/document-generation/history/{history_id}", response_model=SimpleOkResponse)
def delete_generation_history(history_id: int, db: Session = Depends(get_db)):
    row = db.get(DocumentGeneration, history_id)
    if not row:
        raise HTTPException(status_code=404, detail="생성 이력을 찾을 수 없습니다.")

    generation_dir = resolve_output_base_dir() / str(history_id)
    if generation_dir.exists():
        shutil.rmtree(generation_dir, ignore_errors=True)

    zip_path = resolve_output_base_dir() / f"{history_id}.zip"
    if zip_path.exists():
        zip_path.unlink(missing_ok=True)

    db.delete(row)
    db.commit()
    _clear_progress(history_id)
    return SimpleOkResponse(ok=True)


@router.post("/api/document-generation/generate", response_model=DocumentGenerateResponse)
async def generate_documents_endpoint(
    request: DocumentGenerateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fund = db.get(Fund, request.fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다.")

    template_files = get_template_files()
    if not template_files:
        raise HTTPException(status_code=400, detail="서류 템플릿이 준비되지 않았습니다.")

    variables = _normalize_variables(request.variables)
    normalized_stages = sorted(set(request.stages)) if request.stages else None

    generation = DocumentGeneration(
        fund_id=request.fund_id,
        created_by=current_user.id,
        status="pending",
        variables_json=json.dumps(variables, ensure_ascii=False),
        stages=",".join(str(stage) for stage in normalized_stages) if normalized_stages else None,
    )
    db.add(generation)

    if request.save_preset:
        preset_name = (request.preset_name or "").strip() or f"{fund.name}_자동저장"
        existing_preset = (
            db.query(DocumentVariable)
            .filter(
                DocumentVariable.fund_id == request.fund_id,
                DocumentVariable.name == preset_name,
            )
            .first()
        )
        if existing_preset:
            existing_preset.variables_json = json.dumps(variables, ensure_ascii=False)
            existing_preset.updated_at = datetime.utcnow()
        else:
            db.add(
                DocumentVariable(
                    fund_id=request.fund_id,
                    name=preset_name,
                    variables_json=json.dumps(variables, ensure_ascii=False),
                    is_default=False,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )
            )

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="동일한 이름의 프리셋이 이미 존재합니다.") from exc

    db.refresh(generation)
    background_tasks.add_task(_run_generation_task, generation.id, variables, normalized_stages)

    return DocumentGenerateResponse(
        generation_id=generation.id,
        status="pending",
        total_files=0,
        success_count=0,
        failed_count=0,
        warnings=[],
        download_url=None,
    )


@router.get("/api/document-generation/{generation_id}/status", response_model=DocumentGenerationStatusResponse)
def fetch_generation_status(generation_id: int, db: Session = Depends(get_db)):
    row = db.get(DocumentGeneration, generation_id)
    if not row:
        raise HTTPException(status_code=404, detail="생성 요청을 찾을 수 없습니다.")

    progress = _get_progress(generation_id)
    total_files = int(row.total_files or 0)
    if progress and progress.get("total"):
        total_files = max(total_files, int(progress["total"]))

    return DocumentGenerationStatusResponse(
        id=row.id,
        fund_id=row.fund_id,
        status=row.status,  # type: ignore[arg-type]
        total_files=total_files,
        success_count=int(row.success_count or 0),
        failed_count=int(row.failed_count or 0),
        warnings=_parse_warnings(row.warnings_json),
        error_message=row.error_message,
        download_url=_build_download_url(row),
        progress_current=int(progress["current"]) if progress else None,
        progress_total=int(progress["total"]) if progress else None,
        progress_message=str(progress["message"]) if progress else None,
    )


@router.get("/api/document-generation/{generation_id}/download", response_class=FileResponse)
def download_generated_documents(generation_id: int, db: Session = Depends(get_db)):
    row = db.get(DocumentGeneration, generation_id)
    if not row:
        raise HTTPException(status_code=404, detail="생성 요청을 찾을 수 없습니다.")
    if row.status != "completed":
        raise HTTPException(status_code=400, detail="아직 생성이 완료되지 않았습니다.")
    if not row.output_path:
        raise HTTPException(status_code=404, detail="생성 결과 경로를 찾을 수 없습니다.")

    output_path = Path(row.output_path)
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="생성된 파일을 찾을 수 없습니다.")

    zip_base = resolve_output_base_dir() / str(generation_id)
    zip_path = Path(shutil.make_archive(str(zip_base), "zip", root_dir=str(output_path)))

    fund = db.get(Fund, row.fund_id)
    fund_name = _safe_filename(fund.name if fund else f"fund_{row.fund_id}")
    return FileResponse(
        path=str(zip_path),
        media_type="application/zip",
        filename=f"{fund_name}_서류.zip",
    )


@router.post("/api/document-variables", response_model=DocumentVariableResponse, status_code=201)
def create_document_variable(data: DocumentVariableCreate, db: Session = Depends(get_db)):
    fund = db.get(Fund, data.fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다.")

    payload_variables = _normalize_variables(data.variables)
    if data.is_default:
        (
            db.query(DocumentVariable)
            .filter(DocumentVariable.fund_id == data.fund_id)
            .update({DocumentVariable.is_default: False}, synchronize_session=False)
        )

    row = DocumentVariable(
        fund_id=data.fund_id,
        name=data.name.strip(),
        variables_json=json.dumps(payload_variables, ensure_ascii=False),
        is_default=bool(data.is_default),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="같은 이름의 프리셋이 이미 존재합니다.") from exc
    db.refresh(row)
    return _to_variable_response(row)


@router.get("/api/document-variables", response_model=list[DocumentVariableResponse])
def fetch_document_variables(
    fund_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
):
    query = db.query(DocumentVariable)
    if fund_id is not None:
        query = query.filter(DocumentVariable.fund_id == fund_id)
    rows = query.order_by(DocumentVariable.is_default.desc(), DocumentVariable.id.desc()).all()
    return [_to_variable_response(row) for row in rows]


@router.get("/api/document-variables/{variable_id}", response_model=DocumentVariableResponse)
def fetch_document_variable(variable_id: int, db: Session = Depends(get_db)):
    row = db.get(DocumentVariable, variable_id)
    if not row:
        raise HTTPException(status_code=404, detail="프리셋을 찾을 수 없습니다.")
    return _to_variable_response(row)


@router.put("/api/document-variables/{variable_id}", response_model=DocumentVariableResponse)
def update_document_variable(
    variable_id: int,
    data: DocumentVariableUpdate,
    db: Session = Depends(get_db),
):
    row = db.get(DocumentVariable, variable_id)
    if not row:
        raise HTTPException(status_code=404, detail="프리셋을 찾을 수 없습니다.")

    payload = data.model_dump(exclude_unset=True)
    if "name" in payload and payload["name"] is not None:
        row.name = payload["name"].strip()

    if "variables" in payload and payload["variables"] is not None:
        row.variables_json = json.dumps(_normalize_variables(payload["variables"]), ensure_ascii=False)

    if "is_default" in payload and payload["is_default"] is not None:
        if bool(payload["is_default"]):
            (
                db.query(DocumentVariable)
                .filter(
                    DocumentVariable.fund_id == row.fund_id,
                    DocumentVariable.id != row.id,
                )
                .update({DocumentVariable.is_default: False}, synchronize_session=False)
            )
        row.is_default = bool(payload["is_default"])

    row.updated_at = datetime.utcnow()
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="같은 이름의 프리셋이 이미 존재합니다.") from exc
    db.refresh(row)
    return _to_variable_response(row)


@router.delete("/api/document-variables/{variable_id}", response_model=SimpleOkResponse)
def delete_document_variable(variable_id: int, db: Session = Depends(get_db)):
    row = db.get(DocumentVariable, variable_id)
    if not row:
        raise HTTPException(status_code=404, detail="프리셋을 찾을 수 없습니다.")
    db.delete(row)
    db.commit()
    return SimpleOkResponse(ok=True)


class TemplateSingleGenerateRequest(BaseModel):
    fund_id: int = Field(ge=1)
    template_id: int = Field(ge=1)
    lp_id: int | None = Field(default=None, ge=1)
    investment_id: int | None = Field(default=None, ge=1)
    extra_vars: dict[str, str] | None = None


class TemplateBulkGenerateRequest(BaseModel):
    fund_id: int = Field(ge=1)
    template_id: int = Field(ge=1)
    extra_vars: dict[str, str] | None = None


class TemplateGeneratedDocumentItem(BaseModel):
    id: int
    filename: str
    document_number: str | None = None
    fund_id: int | None = None
    template_id: int | None = None
    lp_id: int | None = None
    investment_id: int | None = None
    created_at: str | None = None
    download_url: str


class TemplateBulkGenerateResponse(BaseModel):
    generated_count: int
    documents: list[TemplateGeneratedDocumentItem]


class MarkerDefinition(BaseModel):
    marker: str
    source: str
    description: str


class ResolveVariablesResponse(BaseModel):
    variables: dict[str, str]


@router.post("/api/documents/generate/bulk", response_model=TemplateBulkGenerateResponse)
def generate_documents_for_all_lps(
    body: TemplateBulkGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    generator = BulkDocumentGenerator()
    try:
        rows = generator.generate_for_all_lps(
            db=db,
            fund_id=body.fund_id,
            template_id=body.template_id,
            extra_vars=body.extra_vars,
            created_by=current_user.id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    items = generator.list_generated(db, fund_id=body.fund_id, template_id=body.template_id, limit=len(rows))
    indexed = {item["id"]: item for item in items}
    ordered_items = [indexed.get(row.id) for row in rows if row.id in indexed]
    normalized = [TemplateGeneratedDocumentItem.model_validate(item) for item in ordered_items if item]
    return TemplateBulkGenerateResponse(generated_count=len(normalized), documents=normalized)


@router.get("/api/documents/generated", response_model=list[TemplateGeneratedDocumentItem])
def list_generated_template_documents(
    fund_id: int | None = Query(default=None, ge=1),
    template_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=300, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    generator = BulkDocumentGenerator()
    rows = generator.list_generated(db, fund_id=fund_id, template_id=template_id, limit=limit)
    return [TemplateGeneratedDocumentItem.model_validate(row) for row in rows]


@router.get("/api/documents/generated/{document_id}/download", response_class=FileResponse)
def download_generated_template_document(document_id: int, db: Session = Depends(get_db)):
    generator = BulkDocumentGenerator()
    row = generator.get_generated_attachment(db, document_id)
    if not row:
        raise HTTPException(status_code=404, detail="생성 문서를 찾을 수 없습니다.")

    output_path = Path(row.file_path)
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="생성 문서 파일을 찾을 수 없습니다.")

    return FileResponse(
        path=str(output_path),
        media_type=row.mime_type or "application/octet-stream",
        filename=row.original_filename,
    )


@router.get("/api/documents/markers", response_model=list[MarkerDefinition])
def fetch_document_marker_definitions(
    template_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
):
    resolver = VariableResolver()
    base_markers = resolver.get_available_markers()

    if template_id is None:
        return [MarkerDefinition.model_validate(item) for item in base_markers]

    generator = BulkDocumentGenerator()
    try:
        template_markers = generator.extract_template_markers(db, template_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    mapping = {item["marker"]: item for item in base_markers}
    response_rows: list[MarkerDefinition] = []
    for marker in template_markers:
        if marker in mapping:
            response_rows.append(MarkerDefinition.model_validate(mapping[marker]))
        else:
            response_rows.append(
                MarkerDefinition(marker=marker, source="Template", description="템플릿에서 추출된 마커")
            )
    return response_rows


@router.post("/api/documents/preview")
def preview_generated_document(
    body: TemplateSingleGenerateRequest,
    db: Session = Depends(get_db),
):
    generator = BulkDocumentGenerator()
    try:
        preview_bytes = generator.preview_one(
            db=db,
            fund_id=body.fund_id,
            template_id=body.template_id,
            lp_id=body.lp_id,
            investment_id=body.investment_id,
            extra_vars=body.extra_vars,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return StreamingResponse(
        iter([preview_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=preview.docx"},
    )


@router.post("/api/documents/variables/resolve", response_model=ResolveVariablesResponse)
def resolve_document_variables(
    body: TemplateSingleGenerateRequest,
    db: Session = Depends(get_db),
):
    fund = db.get(Fund, body.fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다.")

    resolver = VariableResolver()
    variables = resolver.resolve_all(
        db=db,
        fund_id=body.fund_id,
        lp_id=body.lp_id,
        investment_id=body.investment_id,
        extra_vars=body.extra_vars,
    )
    return ResolveVariablesResponse(variables=variables)
