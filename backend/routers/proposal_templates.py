from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.proposal_template import ProposalTemplate, ProposalTemplateVersion
from schemas.proposal_template import (
    ProposalTemplateCreate,
    ProposalTemplateDetailResponse,
    ProposalTemplateSummary,
    ProposalTemplateUpdate,
    ProposalTemplateVersionCloneRequest,
    ProposalTemplateVersionCreate,
    ProposalTemplateVersionDetailResponse,
    ProposalTemplateVersionDiffResponse,
    ProposalTemplateVersionHeaderUpdate,
    ProposalTemplateVersionRegistryUpdate,
)
from services.proposal_template_registry import (
    activate_proposal_template_version,
    clone_proposal_template_version,
    compare_proposal_template_versions,
    create_proposal_template,
    create_proposal_template_version,
    get_proposal_template_detail,
    get_proposal_template_version_detail,
    list_proposal_templates,
    replace_proposal_template_version_registry,
    update_proposal_template,
    update_proposal_template_version_header,
)

router = APIRouter(tags=["proposal_templates"])


def _get_or_404(db: Session, model: type, row_id: int, detail: str):
    row = db.get(model, row_id)
    if row is None:
        raise HTTPException(status_code=404, detail=detail)
    return row


@router.get("/api/proposal-templates", response_model=list[ProposalTemplateSummary])
def get_templates(db: Session = Depends(get_db)):
    return [ProposalTemplateSummary.model_validate(row) for row in list_proposal_templates(db)]


@router.post("/api/proposal-templates", response_model=ProposalTemplateSummary, status_code=201)
def post_template(data: ProposalTemplateCreate, db: Session = Depends(get_db)):
    try:
        template = create_proposal_template(db, data)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.commit()
    db.refresh(template)
    return ProposalTemplateSummary.model_validate(get_proposal_template_detail(db, template))


@router.get("/api/proposal-templates/{template_id}", response_model=ProposalTemplateDetailResponse)
def get_template(template_id: int, db: Session = Depends(get_db)):
    template = _get_or_404(db, ProposalTemplate, template_id, "Proposal template not found.")
    return ProposalTemplateDetailResponse.model_validate(get_proposal_template_detail(db, template))


@router.patch("/api/proposal-templates/{template_id}", response_model=ProposalTemplateDetailResponse)
def patch_template(template_id: int, data: ProposalTemplateUpdate, db: Session = Depends(get_db)):
    template = _get_or_404(db, ProposalTemplate, template_id, "Proposal template not found.")
    update_proposal_template(db, template, data)
    db.commit()
    db.refresh(template)
    return ProposalTemplateDetailResponse.model_validate(get_proposal_template_detail(db, template))


@router.post("/api/proposal-templates/{template_id}/versions", response_model=ProposalTemplateVersionDetailResponse, status_code=201)
def post_template_version(template_id: int, data: ProposalTemplateVersionCreate, db: Session = Depends(get_db)):
    template = _get_or_404(db, ProposalTemplate, template_id, "Proposal template not found.")
    try:
        version = create_proposal_template_version(db, template=template, data=data)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.commit()
    db.refresh(version)
    return ProposalTemplateVersionDetailResponse.model_validate(get_proposal_template_version_detail(db, version))


@router.get("/api/proposal-template-versions/compare", response_model=ProposalTemplateVersionDiffResponse)
def get_template_version_diff(
    base_version_id: int,
    target_version_id: int,
    db: Session = Depends(get_db),
):
    base_version = _get_or_404(db, ProposalTemplateVersion, base_version_id, "Base proposal template version not found.")
    target_version = _get_or_404(db, ProposalTemplateVersion, target_version_id, "Target proposal template version not found.")
    try:
        payload = compare_proposal_template_versions(db, base_version=base_version, target_version=target_version)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return ProposalTemplateVersionDiffResponse.model_validate(payload)


@router.post("/api/proposal-template-versions/{version_id}/clone", response_model=ProposalTemplateVersionDetailResponse, status_code=201)
def post_clone_template_version(
    version_id: int,
    data: ProposalTemplateVersionCloneRequest,
    db: Session = Depends(get_db),
):
    source_version = _get_or_404(db, ProposalTemplateVersion, version_id, "Proposal template version not found.")
    try:
        cloned_version = clone_proposal_template_version(db, source_version=source_version, data=data)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.commit()
    db.refresh(cloned_version)
    return ProposalTemplateVersionDetailResponse.model_validate(get_proposal_template_version_detail(db, cloned_version))


@router.get("/api/proposal-template-versions/{version_id}", response_model=ProposalTemplateVersionDetailResponse)
def get_template_version(version_id: int, db: Session = Depends(get_db)):
    version = _get_or_404(db, ProposalTemplateVersion, version_id, "Proposal template version not found.")
    return ProposalTemplateVersionDetailResponse.model_validate(get_proposal_template_version_detail(db, version))


@router.patch("/api/proposal-template-versions/{version_id}", response_model=ProposalTemplateVersionDetailResponse)
def patch_template_version(version_id: int, data: ProposalTemplateVersionHeaderUpdate, db: Session = Depends(get_db)):
    version = _get_or_404(db, ProposalTemplateVersion, version_id, "Proposal template version not found.")
    try:
        update_proposal_template_version_header(db, version=version, data=data)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.commit()
    db.refresh(version)
    return ProposalTemplateVersionDetailResponse.model_validate(get_proposal_template_version_detail(db, version))


@router.put("/api/proposal-template-versions/{version_id}/registry", response_model=ProposalTemplateVersionDetailResponse)
def put_template_version_registry(
    version_id: int,
    data: ProposalTemplateVersionRegistryUpdate,
    db: Session = Depends(get_db),
):
    version = _get_or_404(db, ProposalTemplateVersion, version_id, "Proposal template version not found.")
    try:
        replace_proposal_template_version_registry(db, version=version, data=data)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.commit()
    db.refresh(version)
    return ProposalTemplateVersionDetailResponse.model_validate(get_proposal_template_version_detail(db, version))


@router.post("/api/proposal-template-versions/{version_id}/activate", response_model=ProposalTemplateVersionDetailResponse)
def post_activate_template_version(version_id: int, db: Session = Depends(get_db)):
    version = _get_or_404(db, ProposalTemplateVersion, version_id, "Proposal template version not found.")
    activate_proposal_template_version(db, version=version)
    db.commit()
    db.refresh(version)
    return ProposalTemplateVersionDetailResponse.model_validate(get_proposal_template_version_detail(db, version))
