from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund
from models.investment import Investment, PortfolioCompany
from models.task import Task
from models.workflow_instance import WorkflowInstance

router = APIRouter(tags=["search"])


@router.get("/api/search")
def search(q: str, db: Session = Depends(get_db)):
    keyword = (q or "").strip()
    if not keyword:
        return []

    like = f"%{keyword}%"
    results: list[dict[str, object]] = []

    tasks = db.query(Task).filter(Task.title.ilike(like)).order_by(Task.id.desc()).limit(5).all()
    for task in tasks:
        results.append(
            {
                "type": "task",
                "id": task.id,
                "title": task.title,
                "subtitle": task.status,
                "url": "/tasks",
            }
        )

    funds = db.query(Fund).filter(Fund.name.ilike(like)).order_by(Fund.id.desc()).limit(5).all()
    for fund in funds:
        results.append(
            {
                "type": "fund",
                "id": fund.id,
                "title": fund.name,
                "subtitle": fund.status,
                "url": f"/funds/{fund.id}",
            }
        )

    companies = (
        db.query(PortfolioCompany)
        .filter(PortfolioCompany.name.ilike(like))
        .order_by(PortfolioCompany.id.desc())
        .limit(5)
        .all()
    )
    for company in companies:
        results.append(
            {
                "type": "company",
                "id": company.id,
                "title": company.name,
                "subtitle": company.industry,
                "url": "/investments",
            }
        )

    investments = (
        db.query(Investment, PortfolioCompany)
        .join(PortfolioCompany, PortfolioCompany.id == Investment.company_id)
        .filter(PortfolioCompany.name.ilike(like))
        .order_by(Investment.id.desc())
        .limit(5)
        .all()
    )
    for investment, company in investments:
        results.append(
            {
                "type": "investment",
                "id": investment.id,
                "title": f"{company.name} 투자건",
                "subtitle": investment.status,
                "url": f"/investments/{investment.id}",
            }
        )

    instances = (
        db.query(WorkflowInstance)
        .filter(WorkflowInstance.name.ilike(like))
        .order_by(WorkflowInstance.id.desc())
        .limit(5)
        .all()
    )
    for instance in instances:
        results.append(
            {
                "type": "workflow",
                "id": instance.id,
                "title": instance.name,
                "subtitle": instance.status,
                "url": "/workflows",
            }
        )

    return results
