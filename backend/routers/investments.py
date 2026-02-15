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

router = APIRouter(tags=["investments"])


# -- Portfolio Companies --
@router.get("/api/companies", response_model=list[PortfolioCompanyResponse])
def list_companies(db: Session = Depends(get_db)):
    return db.query(PortfolioCompany).order_by(PortfolioCompany.id.desc()).all()


@router.post("/api/companies", response_model=PortfolioCompanyResponse, status_code=201)
def create_company(data: PortfolioCompanyCreate, db: Session = Depends(get_db)):
    company = PortfolioCompany(**data.model_dump())
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@router.put("/api/companies/{company_id}", response_model=PortfolioCompanyResponse)
def update_company(company_id: int, data: PortfolioCompanyUpdate, db: Session = Depends(get_db)):
    company = db.get(PortfolioCompany, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="회사를 찾을 수 없습니다")

    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(company, key, val)

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
    db.commit()
    db.refresh(investment)
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

    for key, val in payload.items():
        setattr(investment, key, val)

    db.commit()
    db.refresh(investment)
    return investment


@router.delete("/api/investments/{investment_id}", status_code=204)
def delete_investment(investment_id: int, db: Session = Depends(get_db)):
    investment = db.get(Investment, investment_id)
    if not investment:
        raise HTTPException(status_code=404, detail="투자를 찾을 수 없습니다")

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
    db.commit()
    db.refresh(doc)
    return doc


@router.put("/api/investments/{investment_id}/documents/{document_id}", response_model=InvestmentDocumentResponse)
def update_investment_document(investment_id: int, document_id: int, data: InvestmentDocumentUpdate, db: Session = Depends(get_db)):
    doc = db.get(InvestmentDocument, document_id)
    if not doc or doc.investment_id != investment_id:
        raise HTTPException(status_code=404, detail="서류를 찾을 수 없습니다")

    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(doc, key, val)

    db.commit()
    db.refresh(doc)
    return doc


@router.delete("/api/investments/{investment_id}/documents/{document_id}", status_code=204)
def delete_investment_document(investment_id: int, document_id: int, db: Session = Depends(get_db)):
    doc = db.get(InvestmentDocument, document_id)
    if not doc or doc.investment_id != investment_id:
        raise HTTPException(status_code=404, detail="서류를 찾을 수 없습니다")

    db.delete(doc)
    db.commit()


