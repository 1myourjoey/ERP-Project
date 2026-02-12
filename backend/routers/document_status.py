from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund
from models.investment import Investment, PortfolioCompany, InvestmentDocument
from schemas.document_status import DocumentStatusItem

router = APIRouter(tags=["document-status"])


@router.get("/api/document-status", response_model=list[DocumentStatusItem])
def list_document_status(
    status: str | None = None,
    fund_id: int | None = None,
    company_id: int | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(InvestmentDocument)
    if status:
        query = query.filter(InvestmentDocument.status == status)

    docs = query.order_by(InvestmentDocument.id.desc()).all()

    result = []
    for doc in docs:
        investment = db.get(Investment, doc.investment_id)
        if not investment:
            continue

        if fund_id is not None and investment.fund_id != fund_id:
            continue
        if company_id is not None and investment.company_id != company_id:
            continue

        fund = db.get(Fund, investment.fund_id)
        company = db.get(PortfolioCompany, investment.company_id)

        result.append(DocumentStatusItem(
            id=doc.id,
            investment_id=investment.id,
            document_name=doc.name,
            document_type=doc.doc_type,
            status=doc.status,
            note=doc.note,
            fund_id=investment.fund_id,
            fund_name=fund.name if fund else "",
            company_id=investment.company_id,
            company_name=company.name if company else "",
        ))

    return result
