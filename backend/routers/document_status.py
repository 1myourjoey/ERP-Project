from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date

from database import get_db
from models.fund import Fund
from models.investment import Investment, PortfolioCompany, InvestmentDocument
from schemas.document_status import (
    DocumentStatusBulkUpdateRequest,
    DocumentStatusBulkUpdateResponse,
    DocumentStatusItem,
)

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
            due_date=doc.due_date,
            days_remaining=(doc.due_date - date.today()).days if doc.due_date else None,
            fund_id=investment.fund_id,
            fund_name=fund.name if fund else "",
            company_id=investment.company_id,
            company_name=company.name if company else "",
        ))

    return result


@router.patch("/api/document-status/bulk", response_model=DocumentStatusBulkUpdateResponse)
def bulk_update_document_status(
    data: DocumentStatusBulkUpdateRequest,
    db: Session = Depends(get_db),
):
    document_ids = list(dict.fromkeys(data.document_ids))
    if not document_ids:
        raise HTTPException(status_code=400, detail="업데이트할 서류를 선택해주세요")

    docs = db.query(InvestmentDocument).filter(InvestmentDocument.id.in_(document_ids)).all()
    if not docs:
        raise HTTPException(status_code=404, detail="서류를 찾을 수 없습니다")

    for doc in docs:
        doc.status = data.status

    db.commit()
    updated_ids = [doc.id for doc in docs]
    return DocumentStatusBulkUpdateResponse(updated_ids=updated_ids, updated_count=len(updated_ids))
