from fastapi import APIRouter, Depends
import sqlalchemy as sa
from sqlalchemy.orm import Session

from database import get_db
from models.biz_report import BizReport
from models.fund import Fund
from models.investment import Investment, PortfolioCompany
from models.regular_report import RegularReport
from models.task import Task
from models.worklog import WorkLog
from models.workflow_instance import WorkflowInstance
from schemas.search import SearchResultResponse

router = APIRouter(tags=["search"])


@router.get("/api/search", response_model=list[SearchResultResponse])
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

    biz_reports = (
        db.query(BizReport, Fund)
        .join(Fund, Fund.id == BizReport.fund_id)
        .filter(
            Fund.name.ilike(like)
            | sa.cast(BizReport.report_year, sa.String).ilike(like)
            | BizReport.status.ilike(like)
        )
        .order_by(BizReport.id.desc())
        .limit(5)
        .all()
    )
    for report, fund in biz_reports:
        title = f"{fund.name} {report.report_year} 영업보고"
        results.append(
            {
                "type": "biz_report",
                "id": report.id,
                "title": title,
                "subtitle": report.status,
                "url": "/biz-reports",
            }
        )

    reports = (
        db.query(RegularReport)
        .filter(RegularReport.report_target.ilike(like))
        .order_by(RegularReport.id.desc())
        .limit(5)
        .all()
    )
    for report in reports:
        results.append(
            {
                "type": "report",
                "id": report.id,
                "title": f"{report.report_target} ({report.period or ''})",
                "subtitle": report.status,
                "url": "/reports",
            }
        )

    worklogs = (
        db.query(WorkLog)
        .filter(WorkLog.title.ilike(like))
        .order_by(WorkLog.id.desc())
        .limit(5)
        .all()
    )
    for worklog in worklogs:
        results.append(
            {
                "type": "worklog",
                "id": worklog.id,
                "title": worklog.title,
                "subtitle": worklog.category,
                "url": "/worklogs",
            }
        )

    return results
