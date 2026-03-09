from __future__ import annotations

from datetime import date
import json
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from dependencies.auth import get_current_user
from models.proposal_data import (
    ProposalApplication,
    FundManager,
    FundManagerHistory,
    FundSubscription,
    GPFinancial,
    GPShareholder,
    ManagerAward,
    ManagerCareer,
    ManagerEducation,
    ManagerInvestment,
    ProposalVersion,
)
from models.user import User
from schemas.proposal_data import (
    FundManagerCreate,
    FundManagerHistoryCreate,
    FundManagerHistoryResponse,
    FundManagerHistoryUpdate,
    FundManagerResponse,
    FundManagerUpdate,
    FundSubscriptionCreate,
    FundSubscriptionResponse,
    FundSubscriptionUpdate,
    GPFinancialCreate,
    GPFinancialResponse,
    GPFinancialUpdate,
    GPShareholderCreate,
    GPShareholderResponse,
    GPShareholderUpdate,
    ManagerAwardCreate,
    ManagerAwardResponse,
    ManagerAwardUpdate,
    ManagerCareerCreate,
    ManagerCareerResponse,
    ManagerCareerUpdate,
    ManagerEducationCreate,
    ManagerEducationResponse,
    ManagerEducationUpdate,
    ManagerInvestmentCreate,
    ManagerInvestmentResponse,
    ManagerInvestmentUpdate,
    ProposalApplicationCreate,
    ProposalApplicationDetailResponse,
    ProposalApplicationResponse,
    ProposalApplicationUpdate,
    ProposalExportRequest,
    ProposalFieldOverrideBulkInput,
    ProposalReadinessResponse,
    ProposalRowOverrideBulkInput,
    ProposalSheetDescriptor,
    ProposalSheetView,
    ProposalVersionCreate,
    ProposalVersionResponse,
    ProposalWorkspaceResponse,
)
from services.proposal_data import (
    build_proposal_workbook,
    create_proposal_application,
    create_proposal_version_snapshot,
    export_proposal_application,
    freeze_proposal_version,
    freeze_proposal_application,
    get_proposal_application_detail,
    get_proposal_application_sheet,
    list_proposal_application_sheets,
    list_proposal_applications,
    proposal_application_to_response,
    replace_field_overrides,
    replace_row_overrides,
    resolve_proposal_workspace,
    sync_fund_manager_history,
    update_proposal_application,
    version_to_response,
)

router = APIRouter(tags=["proposal_data"])
_XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _parse_fund_ids(raw: str | None) -> list[int]:
    if not raw:
        return []
    parsed: list[int] = []
    for token in raw.split(","):
        token = token.strip()
        if not token:
            continue
        try:
            parsed.append(int(token))
        except ValueError:
            continue
    return parsed


def _get_or_404(db: Session, model: type, row_id: int, detail: str):
    row = db.get(model, row_id)
    if row is None:
        raise HTTPException(status_code=404, detail=detail)
    return row


@router.get("/api/proposal-applications", response_model=list[ProposalApplicationResponse])
def get_proposal_applications(db: Session = Depends(get_db)):
    return [ProposalApplicationResponse.model_validate(row) for row in list_proposal_applications(db)]


@router.post("/api/proposal-applications", response_model=ProposalApplicationResponse, status_code=201)
def post_proposal_application(
    data: ProposalApplicationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    application = create_proposal_application(
        db,
        title=data.title,
        template_type=data.template_type,
        institution_type=data.institution_type,
        gp_entity_id=data.gp_entity_id,
        as_of_date=data.as_of_date,
        fund_ids=data.fund_ids,
        created_by_user=current_user,
    )
    db.commit()
    db.refresh(application)
    return ProposalApplicationResponse.model_validate(proposal_application_to_response(db, application))


@router.get("/api/proposal-applications/{application_id}", response_model=ProposalApplicationDetailResponse)
def get_proposal_application(application_id: int, db: Session = Depends(get_db)):
    application = _get_or_404(db, ProposalApplication, application_id, "Proposal application not found.")
    return ProposalApplicationDetailResponse.model_validate(get_proposal_application_detail(db, application))


@router.patch("/api/proposal-applications/{application_id}", response_model=ProposalApplicationResponse)
def patch_proposal_application(application_id: int, data: ProposalApplicationUpdate, db: Session = Depends(get_db)):
    application = _get_or_404(db, ProposalApplication, application_id, "Proposal application not found.")
    if application.status == "frozen":
        raise HTTPException(status_code=409, detail="Frozen drafts cannot be modified.")
    update_proposal_application(
        db,
        application=application,
        title=data.title,
        template_type=data.template_type,
        institution_type=data.institution_type,
        has_gp_entity="gp_entity_id" in data.model_fields_set,
        gp_entity_id=data.gp_entity_id,
        as_of_date=data.as_of_date,
        status=data.status,
        fund_ids=data.fund_ids if "fund_ids" in data.model_fields_set else None,
    )
    db.commit()
    db.refresh(application)
    return ProposalApplicationResponse.model_validate(proposal_application_to_response(db, application))


@router.post("/api/proposal-applications/{application_id}/freeze", response_model=ProposalApplicationResponse)
def post_freeze_proposal_application(application_id: int, db: Session = Depends(get_db)):
    application = _get_or_404(db, ProposalApplication, application_id, "Proposal application not found.")
    freeze_proposal_application(db, application=application)
    db.commit()
    db.refresh(application)
    return ProposalApplicationResponse.model_validate(proposal_application_to_response(db, application))


@router.get("/api/proposal-applications/{application_id}/sheets", response_model=list[ProposalSheetDescriptor])
def get_proposal_application_sheets(application_id: int, db: Session = Depends(get_db)):
    application = _get_or_404(db, ProposalApplication, application_id, "Proposal application not found.")
    return [ProposalSheetDescriptor.model_validate(row) for row in list_proposal_application_sheets(db, application)]


@router.get("/api/proposal-applications/{application_id}/sheets/{sheet_code}", response_model=ProposalSheetView)
def get_proposal_application_sheet_view(application_id: int, sheet_code: str, db: Session = Depends(get_db)):
    application = _get_or_404(db, ProposalApplication, application_id, "Proposal application not found.")
    try:
        payload = get_proposal_application_sheet(db, application, sheet_code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Sheet not found.") from exc
    return ProposalSheetView.model_validate(payload)


@router.post("/api/proposal-applications/{application_id}/field-overrides/bulk", response_model=ProposalSheetView)
def post_proposal_field_overrides(
    application_id: int,
    data: ProposalFieldOverrideBulkInput,
    db: Session = Depends(get_db),
):
    application = _get_or_404(db, ProposalApplication, application_id, "Proposal application not found.")
    if application.status == "frozen":
        raise HTTPException(status_code=409, detail="Frozen drafts cannot be modified.")
    replace_field_overrides(
        db,
        application=application,
        sheet_code=data.sheet_code,
        overrides=[{"field_key": row.field_key, "value": row.value, "source_note": row.source_note} for row in data.overrides],
    )
    db.commit()
    try:
        payload = get_proposal_application_sheet(db, application, data.sheet_code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Sheet not found.") from exc
    return ProposalSheetView.model_validate(payload)


@router.post("/api/proposal-applications/{application_id}/row-overrides/bulk", response_model=ProposalSheetView)
def post_proposal_row_overrides(
    application_id: int,
    data: ProposalRowOverrideBulkInput,
    db: Session = Depends(get_db),
):
    application = _get_or_404(db, ProposalApplication, application_id, "Proposal application not found.")
    if application.status == "frozen":
        raise HTTPException(status_code=409, detail="Frozen drafts cannot be modified.")
    replace_row_overrides(
        db,
        application=application,
        sheet_code=data.sheet_code,
        overrides=[
            {
                "row_key": row.row_key,
                "row_mode": row.row_mode,
                "row_payload": row.row_payload,
                "source_note": row.source_note,
            }
            for row in data.overrides
        ],
    )
    db.commit()
    try:
        payload = get_proposal_application_sheet(db, application, data.sheet_code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Sheet not found.") from exc
    return ProposalSheetView.model_validate(payload)


@router.get("/api/proposal-applications/{application_id}/readiness", response_model=ProposalReadinessResponse)
def get_proposal_application_readiness(application_id: int, db: Session = Depends(get_db)):
    application = _get_or_404(db, ProposalApplication, application_id, "Proposal application not found.")
    detail = get_proposal_application_detail(db, application)
    return ProposalReadinessResponse.model_validate(detail["readiness"])


@router.get("/api/proposal-applications/{application_id}/export")
def download_proposal_application(
    application_id: int,
    scope: str = Query(default="sheet"),
    format_type: str = Query(default="xlsx", alias="format"),
    sheet_code: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    application = _get_or_404(db, ProposalApplication, application_id, "Proposal application not found.")
    try:
        payload, filename, media_type = export_proposal_application(
            db,
            application=application,
            scope=scope,
            format_type=format_type,
            sheet_code=sheet_code,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Sheet not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StreamingResponse(
        BytesIO(payload),
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/api/proposal-data/workspace", response_model=ProposalWorkspaceResponse)
def get_proposal_workspace(
    template_type: str = Query(default="growth-finance"),
    as_of_date: str | None = Query(default=None),
    gp_entity_id: int | None = Query(default=None),
    fund_ids: str | None = Query(default=None),
    version_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    reference_date = date.fromisoformat(as_of_date) if isinstance(as_of_date, str) and as_of_date else None
    ref_date = reference_date or date.today()
    version = db.get(ProposalVersion, version_id) if version_id is not None else None
    workspace = resolve_proposal_workspace(
        db,
        template_type=template_type,
        as_of_date=ref_date,
        gp_entity_id=gp_entity_id,
        fund_ids=_parse_fund_ids(fund_ids),
        version=version,
    )
    return ProposalWorkspaceResponse.model_validate(workspace)


@router.get("/api/proposal-data/readiness", response_model=ProposalReadinessResponse)
def get_proposal_readiness(
    template_type: str = Query(default="growth-finance"),
    as_of_date: str | None = Query(default=None),
    gp_entity_id: int | None = Query(default=None),
    fund_ids: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    reference_date = date.fromisoformat(as_of_date) if isinstance(as_of_date, str) and as_of_date else None
    ref_date = reference_date or date.today()
    workspace = resolve_proposal_workspace(
        db,
        template_type=template_type,
        as_of_date=ref_date,
        gp_entity_id=gp_entity_id,
        fund_ids=_parse_fund_ids(fund_ids),
    )
    return ProposalReadinessResponse.model_validate(workspace["readiness"])


@router.post("/api/proposal-versions", response_model=ProposalVersionResponse, status_code=201)
def create_proposal_version(
    data: ProposalVersionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    version = create_proposal_version_snapshot(
        db,
        template_type=data.template_type,
        as_of_date=data.as_of_date,
        gp_entity_id=data.gp_entity_id,
        fund_ids=data.fund_ids,
        created_by_user=current_user,
    )
    db.commit()
    db.refresh(version)
    return ProposalVersionResponse.model_validate(version_to_response(version))


@router.get("/api/proposal-versions/{version_id}", response_model=ProposalVersionResponse)
def get_proposal_version(version_id: int, db: Session = Depends(get_db)):
    version = _get_or_404(db, ProposalVersion, version_id, "제안서 버전을 찾을 수 없습니다.")
    return ProposalVersionResponse.model_validate(version_to_response(version))


@router.post("/api/proposal-versions/{version_id}/freeze", response_model=ProposalVersionResponse)
def freeze_version(version_id: int, db: Session = Depends(get_db)):
    version = _get_or_404(db, ProposalVersion, version_id, "제안서 버전을 찾을 수 없습니다.")
    freeze_proposal_version(db, version=version)
    db.commit()
    db.refresh(version)
    return ProposalVersionResponse.model_validate(version_to_response(version))


@router.post("/api/proposal-exports/{template_type}")
def export_proposal(template_type: str, data: ProposalExportRequest, db: Session = Depends(get_db)):
    version = db.get(ProposalVersion, data.version_id) if data.version_id is not None else None
    workspace = resolve_proposal_workspace(
        db,
        template_type=template_type,
        as_of_date=data.as_of_date,
        gp_entity_id=data.gp_entity_id,
        fund_ids=data.fund_ids,
        version=version,
    )
    payload, filename = build_proposal_workbook(workspace, db)
    if version is not None:
        version.generated_filename = filename
        db.commit()
    return StreamingResponse(
        BytesIO(payload),
        media_type=_XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/api/proposal-data/gp-financials", response_model=list[GPFinancialResponse])
def list_gp_financials(gp_entity_id: int, db: Session = Depends(get_db)):
    return db.query(GPFinancial).filter(GPFinancial.gp_entity_id == gp_entity_id).order_by(GPFinancial.fiscal_year_end.desc(), GPFinancial.id.desc()).all()


@router.post("/api/proposal-data/gp-financials", response_model=GPFinancialResponse, status_code=201)
def create_gp_financial(data: GPFinancialCreate, db: Session = Depends(get_db)):
    row = GPFinancial(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/api/proposal-data/gp-financials/{row_id}", response_model=GPFinancialResponse)
def update_gp_financial(row_id: int, data: GPFinancialUpdate, db: Session = Depends(get_db)):
    row = _get_or_404(db, GPFinancial, row_id, "GP 재무현황을 찾을 수 없습니다.")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/proposal-data/gp-financials/{row_id}", status_code=204)
def delete_gp_financial(row_id: int, db: Session = Depends(get_db)):
    row = _get_or_404(db, GPFinancial, row_id, "GP 재무현황을 찾을 수 없습니다.")
    db.delete(row)
    db.commit()


@router.get("/api/proposal-data/gp-shareholders", response_model=list[GPShareholderResponse])
def list_gp_shareholders(gp_entity_id: int, db: Session = Depends(get_db)):
    return db.query(GPShareholder).filter(GPShareholder.gp_entity_id == gp_entity_id).order_by(GPShareholder.snapshot_date.desc(), GPShareholder.id.desc()).all()


@router.post("/api/proposal-data/gp-shareholders", response_model=GPShareholderResponse, status_code=201)
def create_gp_shareholder(data: GPShareholderCreate, db: Session = Depends(get_db)):
    row = GPShareholder(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/api/proposal-data/gp-shareholders/{row_id}", response_model=GPShareholderResponse)
def update_gp_shareholder(row_id: int, data: GPShareholderUpdate, db: Session = Depends(get_db)):
    row = _get_or_404(db, GPShareholder, row_id, "GP 주주현황을 찾을 수 없습니다.")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/proposal-data/gp-shareholders/{row_id}", status_code=204)
def delete_gp_shareholder(row_id: int, db: Session = Depends(get_db)):
    row = _get_or_404(db, GPShareholder, row_id, "GP 주주현황을 찾을 수 없습니다.")
    db.delete(row)
    db.commit()


@router.get("/api/proposal-data/fund-managers", response_model=list[FundManagerResponse])
def list_fund_managers(gp_entity_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(FundManager)
    if gp_entity_id is not None:
        query = query.filter(FundManager.gp_entity_id == gp_entity_id)
    return query.order_by(FundManager.is_representative.desc(), FundManager.is_core.desc(), FundManager.name.asc()).all()


@router.post("/api/proposal-data/fund-managers", response_model=FundManagerResponse, status_code=201)
def create_fund_manager(data: FundManagerCreate, db: Session = Depends(get_db)):
    row = FundManager(**data.model_dump())
    db.add(row)
    db.flush()
    sync_fund_manager_history(db, row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/api/proposal-data/fund-managers/{row_id}", response_model=FundManagerResponse)
def update_fund_manager(row_id: int, data: FundManagerUpdate, db: Session = Depends(get_db)):
    row = _get_or_404(db, FundManager, row_id, "운용인력을 찾을 수 없습니다.")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    sync_fund_manager_history(db, row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/proposal-data/fund-managers/{row_id}", status_code=204)
def delete_fund_manager(row_id: int, db: Session = Depends(get_db)):
    row = _get_or_404(db, FundManager, row_id, "운용인력을 찾을 수 없습니다.")
    db.delete(row)
    db.commit()


@router.get("/api/proposal-data/manager-careers", response_model=list[ManagerCareerResponse])
def list_manager_careers(fund_manager_id: int, db: Session = Depends(get_db)):
    return db.query(ManagerCareer).filter(ManagerCareer.fund_manager_id == fund_manager_id).order_by(ManagerCareer.start_date.desc().nullslast(), ManagerCareer.id.desc()).all()


@router.post("/api/proposal-data/manager-careers", response_model=ManagerCareerResponse, status_code=201)
def create_manager_career(data: ManagerCareerCreate, db: Session = Depends(get_db)):
    row = ManagerCareer(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/api/proposal-data/manager-careers/{row_id}", response_model=ManagerCareerResponse)
def update_manager_career(row_id: int, data: ManagerCareerUpdate, db: Session = Depends(get_db)):
    row = _get_or_404(db, ManagerCareer, row_id, "운용인력 경력을 찾을 수 없습니다.")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/proposal-data/manager-careers/{row_id}", status_code=204)
def delete_manager_career(row_id: int, db: Session = Depends(get_db)):
    row = _get_or_404(db, ManagerCareer, row_id, "운용인력 경력을 찾을 수 없습니다.")
    db.delete(row)
    db.commit()


@router.get("/api/proposal-data/manager-educations", response_model=list[ManagerEducationResponse])
def list_manager_educations(fund_manager_id: int, db: Session = Depends(get_db)):
    return db.query(ManagerEducation).filter(ManagerEducation.fund_manager_id == fund_manager_id).order_by(ManagerEducation.graduation_date.desc().nullslast(), ManagerEducation.id.desc()).all()


@router.post("/api/proposal-data/manager-educations", response_model=ManagerEducationResponse, status_code=201)
def create_manager_education(data: ManagerEducationCreate, db: Session = Depends(get_db)):
    row = ManagerEducation(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/api/proposal-data/manager-educations/{row_id}", response_model=ManagerEducationResponse)
def update_manager_education(row_id: int, data: ManagerEducationUpdate, db: Session = Depends(get_db)):
    row = _get_or_404(db, ManagerEducation, row_id, "운용인력 학력을 찾을 수 없습니다.")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/proposal-data/manager-educations/{row_id}", status_code=204)
def delete_manager_education(row_id: int, db: Session = Depends(get_db)):
    row = _get_or_404(db, ManagerEducation, row_id, "운용인력 학력을 찾을 수 없습니다.")
    db.delete(row)
    db.commit()


@router.get("/api/proposal-data/manager-awards", response_model=list[ManagerAwardResponse])
def list_manager_awards(fund_manager_id: int, db: Session = Depends(get_db)):
    return db.query(ManagerAward).filter(ManagerAward.fund_manager_id == fund_manager_id).order_by(ManagerAward.award_date.desc().nullslast(), ManagerAward.id.desc()).all()


@router.post("/api/proposal-data/manager-awards", response_model=ManagerAwardResponse, status_code=201)
def create_manager_award(data: ManagerAwardCreate, db: Session = Depends(get_db)):
    row = ManagerAward(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/api/proposal-data/manager-awards/{row_id}", response_model=ManagerAwardResponse)
def update_manager_award(row_id: int, data: ManagerAwardUpdate, db: Session = Depends(get_db)):
    row = _get_or_404(db, ManagerAward, row_id, "운용인력 수상경력을 찾을 수 없습니다.")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/proposal-data/manager-awards/{row_id}", status_code=204)
def delete_manager_award(row_id: int, db: Session = Depends(get_db)):
    row = _get_or_404(db, ManagerAward, row_id, "운용인력 수상경력을 찾을 수 없습니다.")
    db.delete(row)
    db.commit()


@router.get("/api/proposal-data/manager-investments", response_model=list[ManagerInvestmentResponse])
def list_manager_investments(fund_manager_id: int, db: Session = Depends(get_db)):
    return db.query(ManagerInvestment).filter(ManagerInvestment.fund_manager_id == fund_manager_id).order_by(ManagerInvestment.investment_date.desc().nullslast(), ManagerInvestment.id.desc()).all()


@router.post("/api/proposal-data/manager-investments", response_model=ManagerInvestmentResponse, status_code=201)
def create_manager_investment(data: ManagerInvestmentCreate, db: Session = Depends(get_db)):
    row = ManagerInvestment(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/api/proposal-data/manager-investments/{row_id}", response_model=ManagerInvestmentResponse)
def update_manager_investment(row_id: int, data: ManagerInvestmentUpdate, db: Session = Depends(get_db)):
    row = _get_or_404(db, ManagerInvestment, row_id, "운용인력 투자실적을 찾을 수 없습니다.")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/proposal-data/manager-investments/{row_id}", status_code=204)
def delete_manager_investment(row_id: int, db: Session = Depends(get_db)):
    row = _get_or_404(db, ManagerInvestment, row_id, "운용인력 투자실적을 찾을 수 없습니다.")
    db.delete(row)
    db.commit()


@router.get("/api/proposal-data/fund-subscriptions", response_model=list[FundSubscriptionResponse])
def list_fund_subscriptions(fund_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(FundSubscription)
    if fund_id is not None:
        query = query.filter(FundSubscription.fund_id == fund_id)
    return query.order_by(FundSubscription.subscription_date.desc(), FundSubscription.id.desc()).all()


@router.post("/api/proposal-data/fund-subscriptions", response_model=FundSubscriptionResponse, status_code=201)
def create_fund_subscription(data: FundSubscriptionCreate, db: Session = Depends(get_db)):
    row = FundSubscription(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/api/proposal-data/fund-subscriptions/{row_id}", response_model=FundSubscriptionResponse)
def update_fund_subscription(row_id: int, data: FundSubscriptionUpdate, db: Session = Depends(get_db)):
    row = _get_or_404(db, FundSubscription, row_id, "펀드 청약정보를 찾을 수 없습니다.")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/proposal-data/fund-subscriptions/{row_id}", status_code=204)
def delete_fund_subscription(row_id: int, db: Session = Depends(get_db)):
    row = _get_or_404(db, FundSubscription, row_id, "펀드 청약정보를 찾을 수 없습니다.")
    db.delete(row)
    db.commit()


@router.get("/api/proposal-data/fund-manager-histories", response_model=list[FundManagerHistoryResponse])
def list_fund_manager_histories(fund_manager_id: int, db: Session = Depends(get_db)):
    return db.query(FundManagerHistory).filter(FundManagerHistory.fund_manager_id == fund_manager_id).order_by(FundManagerHistory.change_date.desc(), FundManagerHistory.id.desc()).all()


@router.post("/api/proposal-data/fund-manager-histories", response_model=FundManagerHistoryResponse, status_code=201)
def create_fund_manager_history(data: FundManagerHistoryCreate, db: Session = Depends(get_db)):
    row = FundManagerHistory(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/api/proposal-data/fund-manager-histories/{row_id}", response_model=FundManagerHistoryResponse)
def update_fund_manager_history(row_id: int, data: FundManagerHistoryUpdate, db: Session = Depends(get_db)):
    row = _get_or_404(db, FundManagerHistory, row_id, "운용인력 변경이력을 찾을 수 없습니다.")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/proposal-data/fund-manager-histories/{row_id}", status_code=204)
def delete_fund_manager_history(row_id: int, db: Session = Depends(get_db)):
    row = _get_or_404(db, FundManagerHistory, row_id, "운용인력 변경이력을 찾을 수 없습니다.")
    db.delete(row)
    db.commit()
