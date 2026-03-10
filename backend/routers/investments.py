import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund
from models.investment import PortfolioCompany, Investment, InvestmentDocument
from schemas.investment import (
    PortfolioCompanyCreate,
    PortfolioCompanyUpdate,
    PortfolioCompanyResponse,
    InvestmentCreate,
    InvestmentUpdate,
    InvestmentListItem,
    InvestmentResponse,
    InvestmentDocumentCreate,
    InvestmentDocumentUpdate,
    InvestmentDocumentResponse,
)
from services.compliance_engine import ComplianceEngine
from services.compliance_rule_engine import ComplianceRuleEngine
from services.erp_backbone import (
    archive_document_record,
    backbone_enabled,
    mark_subject_deleted,
    maybe_emit_mutation,
    record_snapshot,
    sync_company_graph,
    sync_investment_document_registry,
    sync_investment_graph,
)
from services.proposal_data import sync_company_history

router = APIRouter(tags=["investments"])
logger = logging.getLogger(__name__)


# -- Portfolio Companies --
@router.get("/api/companies", response_model=list[PortfolioCompanyResponse])
def list_companies(db: Session = Depends(get_db)):
    return db.query(PortfolioCompany).order_by(PortfolioCompany.id.desc()).all()


@router.post("/api/companies", response_model=PortfolioCompanyResponse, status_code=201)
def create_company(data: PortfolioCompanyCreate, db: Session = Depends(get_db)):
    company = PortfolioCompany(**data.model_dump())
    db.add(company)
    db.flush()
    sync_company_history(db, company)
    if backbone_enabled():
        subject = sync_company_graph(db, company)
        maybe_emit_mutation(
            db,
            subject=subject,
            event_type="company.created",
            after=record_snapshot(company),
            origin_model="portfolio_company",
            origin_id=company.id,
        )
    db.commit()
    db.refresh(company)
    return company


@router.put("/api/companies/{company_id}", response_model=PortfolioCompanyResponse)
def update_company(company_id: int, data: PortfolioCompanyUpdate, db: Session = Depends(get_db)):
    company = db.get(PortfolioCompany, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="회사를 찾을 수 없습니다")

    before = record_snapshot(company)
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(company, key, val)

    sync_company_history(db, company)
    if backbone_enabled():
        subject = sync_company_graph(db, company)
        maybe_emit_mutation(
            db,
            subject=subject,
            event_type="company.updated",
            before=before,
            after=record_snapshot(company),
            origin_model="portfolio_company",
            origin_id=company.id,
        )
    db.commit()
    db.refresh(company)
    return company


@router.delete("/api/companies/{company_id}", status_code=204)
def delete_company(company_id: int, db: Session = Depends(get_db)):
    company = db.get(PortfolioCompany, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="회사를 찾을 수 없습니다")

    has_investments = db.query(Investment).filter(Investment.company_id == company_id).count() > 0
    if has_investments:
        raise HTTPException(status_code=409, detail="투자 내역이 있어 회사를 삭제할 수 없습니다")

    before = record_snapshot(company)
    if backbone_enabled():
        subject = mark_subject_deleted(
            db,
            subject_type="company",
            native_id=company.id,
            payload=before,
        )
        maybe_emit_mutation(
            db,
            subject=subject,
            event_type="company.deleted",
            before=before,
            origin_model="portfolio_company",
            origin_id=company.id,
        )
    db.delete(company)
    db.commit()


# -- Investments --
@router.get("/api/investments", response_model=list[InvestmentListItem])
def list_investments(
    fund_id: int | None = None,
    company_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Investment)
    if fund_id:
        query = query.filter(Investment.fund_id == fund_id)
    if company_id:
        query = query.filter(Investment.company_id == company_id)
    if status:
        query = query.filter(Investment.status == status)

    investments = query.order_by(Investment.id.desc()).all()

    result = []
    for inv in investments:
        fund = db.get(Fund, inv.fund_id)
        company = db.get(PortfolioCompany, inv.company_id)
        result.append(InvestmentListItem(
            id=inv.id,
            fund_id=inv.fund_id,
            company_id=inv.company_id,
            fund_name=fund.name if fund else "",
            company_name=company.name if company else "",
            company_founded_date=company.founded_date if company else None,
            industry=company.industry if company else None,
            investment_date=inv.investment_date,
            amount=inv.amount,
            instrument=inv.instrument,
            status=inv.status,
        ))
    return result


@router.get("/api/investments/{investment_id}", response_model=InvestmentResponse)
def get_investment(investment_id: int, db: Session = Depends(get_db)):
    investment = db.get(Investment, investment_id)
    if not investment:
        raise HTTPException(status_code=404, detail="투자를 찾을 수 없습니다")
    return investment


@router.post("/api/investments", response_model=InvestmentResponse, status_code=201)
def create_investment(data: InvestmentCreate, db: Session = Depends(get_db)):
    fund = db.get(Fund, data.fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")

    company = db.get(PortfolioCompany, data.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="회사를 찾을 수 없습니다")

    investment = Investment(**data.model_dump())
    db.add(investment)
    db.flush()
    if backbone_enabled():
        subject = sync_investment_graph(db, investment)
        maybe_emit_mutation(
            db,
            subject=subject,
            event_type="investment.created",
            after=record_snapshot(investment),
            origin_model="investment",
            origin_id=investment.id,
        )
    db.commit()
    db.refresh(investment)

    try:
        ComplianceEngine(db).on_investment_created(investment.id, investment.fund_id)
    except Exception as exc:  # noqa: BLE001 - hook failures must not break main flow
        db.rollback()
        logger.warning(
            "compliance hook failed on create_investment: investment_id=%s fund_id=%s error=%s",
            investment.id,
            investment.fund_id,
            exc,
        )

    try:
        checks = ComplianceRuleEngine().evaluate_all(
            fund_id=investment.fund_id,
            db=db,
            trigger_type="event",
            trigger_source="investment_create",
            trigger_source_id=investment.id,
        )
        violations = [check for check in checks if check.result in {"fail", "error"}]
        if violations:
            logger.warning(
                "compliance rule violations on create_investment: investment_id=%s fund_id=%s violations=%s",
                investment.id,
                investment.fund_id,
                len(violations),
            )
    except Exception as exc:  # noqa: BLE001 - compliance check failures must not break main flow
        db.rollback()
        logger.warning(
            "compliance rule engine failed on create_investment: investment_id=%s fund_id=%s error=%s",
            investment.id,
            investment.fund_id,
            exc,
        )

    return investment


@router.put("/api/investments/{investment_id}", response_model=InvestmentResponse)
def update_investment(investment_id: int, data: InvestmentUpdate, db: Session = Depends(get_db)):
    investment = db.get(Investment, investment_id)
    if not investment:
        raise HTTPException(status_code=404, detail="투자를 찾을 수 없습니다")

    payload = data.model_dump(exclude_unset=True)
    if "fund_id" in payload and payload["fund_id"] is not None and not db.get(Fund, payload["fund_id"]):
        raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다")
    if "company_id" in payload and payload["company_id"] is not None and not db.get(PortfolioCompany, payload["company_id"]):
        raise HTTPException(status_code=404, detail="회사를 찾을 수 없습니다")

    before = record_snapshot(investment)
    for key, val in payload.items():
        setattr(investment, key, val)

    if backbone_enabled():
        db.flush()
        subject = sync_investment_graph(db, investment)
        maybe_emit_mutation(
            db,
            subject=subject,
            event_type="investment.updated",
            before=before,
            after=record_snapshot(investment),
            origin_model="investment",
            origin_id=investment.id,
        )
    db.commit()
    db.refresh(investment)

    try:
        checks = ComplianceRuleEngine().evaluate_all(
            fund_id=investment.fund_id,
            db=db,
            trigger_type="event",
            trigger_source="investment_update",
            trigger_source_id=investment.id,
        )
        violations = [check for check in checks if check.result in {"fail", "error"}]
        if violations:
            logger.warning(
                "compliance rule violations on update_investment: investment_id=%s fund_id=%s violations=%s",
                investment.id,
                investment.fund_id,
                len(violations),
            )
    except Exception as exc:  # noqa: BLE001 - compliance check failures must not break main flow
        db.rollback()
        logger.warning(
            "compliance rule engine failed on update_investment: investment_id=%s fund_id=%s error=%s",
            investment.id,
            investment.fund_id,
            exc,
        )

    return investment


@router.delete("/api/investments/{investment_id}", status_code=204)
def delete_investment(investment_id: int, db: Session = Depends(get_db)):
    investment = db.get(Investment, investment_id)
    if not investment:
        raise HTTPException(status_code=404, detail="투자를 찾을 수 없습니다")

    before = record_snapshot(investment)
    if backbone_enabled():
        for document in list(investment.documents or []):
            archive_document_record(db, origin_model="investment_document", origin_id=document.id)
        subject = mark_subject_deleted(
            db,
            subject_type="investment",
            native_id=investment.id,
            payload=before,
        )
        maybe_emit_mutation(
            db,
            subject=subject,
            event_type="investment.deleted",
            before=before,
            origin_model="investment",
            origin_id=investment.id,
        )
    db.delete(investment)
    db.commit()


# -- Investment Documents --
@router.get("/api/investments/{investment_id}/documents", response_model=list[InvestmentDocumentResponse])
def list_investment_documents(investment_id: int, db: Session = Depends(get_db)):
    inv = db.get(Investment, investment_id)
    if not inv:
        raise HTTPException(status_code=404, detail="투자를 찾을 수 없습니다")
    return db.query(InvestmentDocument).filter(InvestmentDocument.investment_id == investment_id).order_by(InvestmentDocument.id.desc()).all()


@router.post("/api/investments/{investment_id}/documents", response_model=InvestmentDocumentResponse, status_code=201)
def create_investment_document(investment_id: int, data: InvestmentDocumentCreate, db: Session = Depends(get_db)):
    inv = db.get(Investment, investment_id)
    if not inv:
        raise HTTPException(status_code=404, detail="투자를 찾을 수 없습니다")

    doc = InvestmentDocument(investment_id=investment_id, **data.model_dump())
    db.add(doc)
    db.flush()
    if backbone_enabled():
        sync_investment_document_registry(db, doc)
        subject = sync_investment_graph(db, inv)
        maybe_emit_mutation(
            db,
            subject=subject,
            event_type="investment_document.created",
            after=record_snapshot(doc),
            payload={"document_id": doc.id},
            origin_model="investment_document",
            origin_id=doc.id,
        )
    db.commit()
    db.refresh(doc)
    return doc


@router.put("/api/investments/{investment_id}/documents/{document_id}", response_model=InvestmentDocumentResponse)
def update_investment_document(investment_id: int, document_id: int, data: InvestmentDocumentUpdate, db: Session = Depends(get_db)):
    doc = db.get(InvestmentDocument, document_id)
    if not doc or doc.investment_id != investment_id:
        raise HTTPException(status_code=404, detail="서류를 찾을 수 없습니다")

    before = record_snapshot(doc)
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(doc, key, val)

    if backbone_enabled():
        sync_investment_document_registry(db, doc)
        subject = sync_investment_graph(db, db.get(Investment, investment_id))
        maybe_emit_mutation(
            db,
            subject=subject,
            event_type="investment_document.updated",
            before=before,
            after=record_snapshot(doc),
            payload={"document_id": doc.id},
            origin_model="investment_document",
            origin_id=doc.id,
        )
    db.commit()
    db.refresh(doc)
    return doc


@router.delete("/api/investments/{investment_id}/documents/{document_id}", status_code=204)
def delete_investment_document(investment_id: int, document_id: int, db: Session = Depends(get_db)):
    doc = db.get(InvestmentDocument, document_id)
    if not doc or doc.investment_id != investment_id:
        raise HTTPException(status_code=404, detail="서류를 찾을 수 없습니다")

    before = record_snapshot(doc)
    if backbone_enabled():
        archive_document_record(db, origin_model="investment_document", origin_id=doc.id)
        subject = sync_investment_graph(db, db.get(Investment, investment_id))
        maybe_emit_mutation(
            db,
            subject=subject,
            event_type="investment_document.deleted",
            before=before,
            payload={"document_id": doc.id},
            origin_model="investment_document",
            origin_id=doc.id,
        )
    db.delete(doc)
    db.commit()



