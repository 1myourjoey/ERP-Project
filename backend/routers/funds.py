from datetime import date
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from dateutil.relativedelta import relativedelta
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund, LP, FundNoticePeriod, FundKeyTerm
from models.investment import Investment
from models.phase3 import CapitalCall, CapitalCallItem
from schemas.fund import (
    FundCreate,
    FundUpdate,
    FundListItem,
    FundOverviewItem,
    FundOverviewResponse,
    FundOverviewTotals,
    FundResponse,
    LPCreate,
    LPUpdate,
    LPResponse,
    FundNoticePeriodCreate,
    FundNoticePeriodResponse,
    FundKeyTermCreate,
    FundKeyTermResponse,
)
from services.workflow_service import calculate_business_days_before

router = APIRouter(tags=["funds"])
OVERVIEW_UNIT = 1_000_000


def calculate_paid_in_as_of(
    db: Session,
    fund_id: int,
    reference_date: date,
    fallback_gp_commitment: float | None = None,
) -> tuple[float, float]:
    lps = db.query(LP).filter(LP.fund_id == fund_id).all()
    gp_lp_ids = {
        lp.id
        for lp in lps
        if isinstance(lp.type, str) and lp.type.strip().upper() == "GP"
    }

    has_call_items = (
        db.query(CapitalCallItem.id)
        .join(CapitalCall, CapitalCall.id == CapitalCallItem.capital_call_id)
        .filter(CapitalCall.fund_id == fund_id)
        .first()
    )

    if has_call_items is None:
        total_paid_in = sum(float(lp.paid_in or 0) for lp in lps)
        gp_paid_in = sum(float(lp.paid_in or 0) for lp in lps if lp.id in gp_lp_ids)
        if not gp_lp_ids and fallback_gp_commitment is not None:
            gp_paid_in = float(fallback_gp_commitment or 0)
        return round(total_paid_in, 2), round(gp_paid_in, 2)

    paid_items = (
        db.query(CapitalCallItem.lp_id, CapitalCallItem.amount)
        .join(CapitalCall, CapitalCall.id == CapitalCallItem.capital_call_id)
        .filter(
            CapitalCall.fund_id == fund_id,
            CapitalCallItem.paid == 1,
            CapitalCallItem.paid_date.isnot(None),
            CapitalCallItem.paid_date <= reference_date,
        )
        .all()
    )
    total_paid_in = sum(float(item.amount or 0) for item in paid_items)
    gp_paid_in = sum(float(item.amount or 0) for item in paid_items if item.lp_id in gp_lp_ids)
    if not gp_lp_ids and fallback_gp_commitment is not None:
        gp_paid_in = float(fallback_gp_commitment or 0)
    return round(total_paid_in, 2), round(gp_paid_in, 2)


def calculate_lp_paid_in_from_calls(db: Session, fund_id: int, lp_id: int) -> tuple[bool, int]:
    base_query = (
        db.query(CapitalCallItem.id)
        .join(CapitalCall, CapitalCall.id == CapitalCallItem.capital_call_id)
        .filter(
            CapitalCall.fund_id == fund_id,
            CapitalCallItem.lp_id == lp_id,
        )
    )
    has_call_items = base_query.first() is not None
    if not has_call_items:
        return False, 0

    paid_in_total = (
        db.query(func.coalesce(func.sum(CapitalCallItem.amount), 0))
        .join(CapitalCall, CapitalCall.id == CapitalCallItem.capital_call_id)
        .filter(
            CapitalCall.fund_id == fund_id,
            CapitalCallItem.lp_id == lp_id,
            CapitalCallItem.paid == 1,
        )
        .scalar()
    )
    return True, int(paid_in_total or 0)


def to_overview_unit(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value) / OVERVIEW_UNIT, 2)


def format_remaining_period(maturity_date: date | None, ref_date: date) -> str:
    if maturity_date is None:
        return "-"
    if ref_date > maturity_date:
        return "만기 경과"

    delta = relativedelta(maturity_date, ref_date)
    parts: list[str] = []
    if delta.years:
        parts.append(f"{delta.years}년")
    if delta.months:
        parts.append(f"{delta.months}개월")

    # For less than 1 month remaining, show days instead of 0년 0개월.
    if not parts and delta.days:
        parts.append(f"{delta.days}일")

    return "".join(parts) if parts else "만기일"


def build_fund_overview(
    db: Session,
    ref_date: date,
) -> tuple[list[FundOverviewItem], FundOverviewTotals]:
    funds = (
        db.query(Fund)
        .filter(
            or_(
                Fund.formation_date.is_(None),
                Fund.formation_date <= ref_date,
            )
        )
        .order_by(Fund.id.asc())
        .all()
    )

    investment_rows = (
        db.query(
            Investment.fund_id.label("fund_id"),
            func.coalesce(func.sum(Investment.amount), 0).label("total_invested"),
            func.coalesce(
                func.sum(case((Investment.status == "active", Investment.amount), else_=0)),
                0,
            ).label("investment_assets"),
            func.count(func.distinct(Investment.company_id)).label("company_count"),
        )
        .filter(
            Investment.investment_date.isnot(None),
            Investment.investment_date <= ref_date,
        )
        .group_by(Investment.fund_id)
        .all()
    )
    investment_by_fund = {
        int(row.fund_id): {
            "total_invested": float(row.total_invested or 0),
            "investment_assets": float(row.investment_assets or 0),
            "company_count": int(row.company_count or 0),
        }
        for row in investment_rows
    }

    totals = {
        "commitment_total": 0.0,
        "total_paid_in": 0.0,
        "gp_commitment": 0.0,
        "total_invested": 0.0,
        "uninvested": 0.0,
        "investment_assets": 0.0,
        "company_count": 0,
    }

    items: list[FundOverviewItem] = []
    for index, fund in enumerate(funds, start=1):
        agg = investment_by_fund.get(fund.id, {})
        total_paid_in, gp_paid_in = calculate_paid_in_as_of(
            db,
            fund.id,
            ref_date,
            fallback_gp_commitment=fund.gp_commitment,
        )
        total_invested = float(agg.get("total_invested", 0.0))
        investment_assets = float(agg.get("investment_assets", total_invested))
        company_count = int(agg.get("company_count", 0))

        paid_in_ratio = (
            round((total_paid_in / fund.commitment_total) * 100, 2)
            if fund.commitment_total
            else None
        )
        uninvested = (
            round((fund.commitment_total or 0) - total_invested, 2)
            if fund.commitment_total is not None
            else None
        )

        progress: float | None = None
        if fund.formation_date and fund.investment_period_end:
            total_days = (fund.investment_period_end - fund.formation_date).days
            if total_days > 0:
                elapsed_days = (min(ref_date, fund.investment_period_end) - fund.formation_date).days
                elapsed_days = max(0, elapsed_days)
                progress = round(max(0, min(100, (elapsed_days / total_days) * 100)), 2)
            else:
                progress = 0.0

        remaining = format_remaining_period(fund.maturity_date, ref_date)

        item = FundOverviewItem(
            no=index,
            id=fund.id,
            name=fund.name,
            fund_type=fund.type,
            fund_manager=fund.fund_manager,
            formation_date=fund.formation_date.isoformat() if fund.formation_date else None,
            registration_date=fund.registration_date.isoformat() if fund.registration_date else None,
            investment_period_end=fund.investment_period_end.isoformat() if fund.investment_period_end else None,
            investment_period_progress=progress,
            maturity_date=fund.maturity_date.isoformat() if fund.maturity_date else None,
            commitment_total=to_overview_unit(fund.commitment_total),
            total_paid_in=to_overview_unit(total_paid_in),
            paid_in_ratio=paid_in_ratio,
            gp_commitment=to_overview_unit(gp_paid_in),
            total_invested=to_overview_unit(total_invested),
            uninvested=to_overview_unit(uninvested),
            investment_assets=to_overview_unit(investment_assets),
            company_count=company_count,
            hurdle_rate=fund.hurdle_rate,
            remaining_period=remaining,
        )
        items.append(item)

        totals["commitment_total"] += float(fund.commitment_total or 0)
        totals["total_paid_in"] += float(total_paid_in or 0)
        totals["gp_commitment"] += float(gp_paid_in or 0)
        totals["total_invested"] += float(total_invested or 0)
        totals["uninvested"] += float(uninvested or 0)
        totals["investment_assets"] += float(investment_assets or 0)

    fund_ids = [fund.id for fund in funds]
    if fund_ids:
        totals["company_count"] = int(
            db.query(func.count(func.distinct(Investment.company_id)))
            .filter(
                Investment.fund_id.in_(fund_ids),
                Investment.investment_date.isnot(None),
                Investment.investment_date <= ref_date,
            )
            .scalar()
            or 0
        )

    return (
        items,
        FundOverviewTotals(
            commitment_total=to_overview_unit(totals["commitment_total"]) or 0,
            total_paid_in=to_overview_unit(totals["total_paid_in"]) or 0,
            gp_commitment=to_overview_unit(totals["gp_commitment"]) or 0,
            total_invested=to_overview_unit(totals["total_invested"]) or 0,
            uninvested=to_overview_unit(totals["uninvested"]) or 0,
            investment_assets=to_overview_unit(totals["investment_assets"]) or 0,
            company_count=totals["company_count"],
        ),
    )


@router.get("/api/funds", response_model=list[FundListItem])
def list_funds(db: Session = Depends(get_db)):
    funds = db.query(Fund).order_by(Fund.id.desc()).all()
    investment_counts = {
        int(fund_id): int(count)
        for fund_id, count in (
            db.query(Investment.fund_id, func.count(Investment.id))
            .group_by(Investment.fund_id)
            .all()
        )
    }
    paid_in_totals = {
        int(fund_id): float(total or 0)
        for fund_id, total in (
            db.query(LP.fund_id, func.coalesce(func.sum(LP.paid_in), 0))
            .group_by(LP.fund_id)
            .all()
        )
    }
    return [
        FundListItem(
            id=f.id,
            name=f.name,
            type=f.type,
            status=f.status,
            formation_date=f.formation_date,
            registration_number=f.registration_number,
            registration_date=f.registration_date,
            maturity_date=f.maturity_date,
            dissolution_date=f.dissolution_date,
            commitment_total=f.commitment_total,
            aum=f.aum,
            paid_in_total=paid_in_totals.get(f.id, 0),
            lp_count=len(f.lps),
            investment_count=investment_counts.get(f.id, 0),
        )
        for f in funds
    ]


@router.get("/api/funds/overview", response_model=FundOverviewResponse)
def fund_overview(reference_date: date | None = None, db: Session = Depends(get_db)):
    ref_date = reference_date or date.today()
    items, totals = build_fund_overview(db, ref_date)
    return FundOverviewResponse(reference_date=ref_date.isoformat(), funds=items, totals=totals)


@router.get("/api/funds/overview/export")
def export_fund_overview(reference_date: date | None = None, db: Session = Depends(get_db)):
    ref_date = reference_date or date.today()
    overview_items, totals = build_fund_overview(db, ref_date)

    try:
        import openpyxl
        from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl not installed")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "조합비교표"

    headers = [
        "NO",
        "조합명",
        "조합 구분",
        "대표 펀드매니저",
        "등록(성립)일",
        "투자기간 종료일",
        "투자기간 경과율",
        "청산시기(예정)",
        "약정총액",
        "납입총액",
        "납입비율",
        "GP출자금",
        "투자총액",
        "미투자액",
        "투자자산",
        "투자업체수",
        "기준수익률(규약)",
        "잔존기간",
    ]

    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=10)
    thin_border = Border(
        left=Side(style="thin"),
        right=Side(style="thin"),
        top=Side(style="thin"),
        bottom=Side(style="thin"),
    )

    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.border = thin_border
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    for row_idx, item in enumerate(overview_items, start=2):
        values = [
            item.no,
            item.name,
            item.fund_type,
            item.fund_manager,
            item.formation_date,
            item.investment_period_end,
            item.investment_period_progress,
            item.maturity_date,
            item.commitment_total,
            item.total_paid_in,
            item.paid_in_ratio,
            item.gp_commitment,
            item.total_invested,
            item.uninvested,
            item.investment_assets,
            item.company_count,
            item.hurdle_rate,
            item.remaining_period,
        ]

        for col_idx, value in enumerate(values, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.border = thin_border
            if col_idx in (9, 10, 12, 13, 14, 15):
                cell.number_format = "#,##0"
                cell.alignment = Alignment(horizontal="right", vertical="center")
            elif col_idx in (7, 11, 17):
                cell.number_format = '0.00"%"'
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col_idx == 16:
                cell.alignment = Alignment(horizontal="center", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")

    totals_row = len(overview_items) + 2
    total_fill = PatternFill(start_color="F2F2F2", end_color="F2F2F2", fill_type="solid")
    ws.merge_cells(start_row=totals_row, start_column=1, end_row=totals_row, end_column=8)
    ws.cell(row=totals_row, column=1, value="합계")
    ws.cell(row=totals_row, column=9, value=totals.commitment_total)
    ws.cell(row=totals_row, column=10, value=totals.total_paid_in)
    ws.cell(row=totals_row, column=12, value=totals.gp_commitment)
    ws.cell(row=totals_row, column=13, value=totals.total_invested)
    ws.cell(row=totals_row, column=14, value=totals.uninvested)
    ws.cell(row=totals_row, column=15, value=totals.investment_assets)
    ws.cell(row=totals_row, column=16, value=totals.company_count)

    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=totals_row, column=col_idx)
        cell.fill = total_fill
        cell.border = thin_border
        cell.font = Font(bold=True)
        if col_idx in (9, 10, 12, 13, 14, 15):
            cell.number_format = "#,##0"
            cell.alignment = Alignment(horizontal="right", vertical="center")
        elif col_idx == 16:
            cell.alignment = Alignment(horizontal="center", vertical="center")
        else:
            cell.alignment = Alignment(horizontal="left", vertical="center")

    for idx in range(1, len(headers) + 1):
        letter = openpyxl.utils.get_column_letter(idx)
        max_len = 0
        for row in range(1, totals_row + 1):
            value = ws.cell(row=row, column=idx).value
            max_len = max(max_len, len(str(value)) if value is not None else 0)
        ws.column_dimensions[letter].width = min(max_len + 4, 28)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"fund_overview_{ref_date.isoformat()}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@router.get("/api/funds/{fund_id}", response_model=FundResponse)
def get_fund(fund_id: int, db: Session = Depends(get_db)):
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="議고빀??李얠쓣 ???놁뒿?덈떎")
    return fund


@router.post("/api/funds", response_model=FundResponse, status_code=201)
def create_fund(data: FundCreate, db: Session = Depends(get_db)):
    fund = Fund(**data.model_dump())
    db.add(fund)
    db.commit()
    db.refresh(fund)
    return fund


@router.put("/api/funds/{fund_id}", response_model=FundResponse)
def update_fund(fund_id: int, data: FundUpdate, db: Session = Depends(get_db)):
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="議고빀??李얠쓣 ???놁뒿?덈떎")

    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(fund, key, val)

    db.commit()
    db.refresh(fund)
    return fund


@router.delete("/api/funds/{fund_id}", status_code=204)
def delete_fund(fund_id: int, db: Session = Depends(get_db)):
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="議고빀??李얠쓣 ???놁뒿?덈떎")
    db.delete(fund)
    db.commit()


@router.get("/api/funds/{fund_id}/lps", response_model=list[LPResponse])
def list_lps(fund_id: int, db: Session = Depends(get_db)):
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="議고빀??李얠쓣 ???놁뒿?덈떎")
    return db.query(LP).filter(LP.fund_id == fund_id).order_by(LP.id.desc()).all()


@router.post("/api/funds/{fund_id}/lps", response_model=LPResponse, status_code=201)
def create_lp(fund_id: int, data: LPCreate, db: Session = Depends(get_db)):
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="議고빀??李얠쓣 ???놁뒿?덈떎")

    lp = LP(fund_id=fund_id, **data.model_dump())
    db.add(lp)
    db.commit()
    db.refresh(lp)
    return lp


@router.put("/api/funds/{fund_id}/lps/{lp_id}", response_model=LPResponse)
def update_lp(fund_id: int, lp_id: int, data: LPUpdate, db: Session = Depends(get_db)):
    lp = db.get(LP, lp_id)
    if not lp or lp.fund_id != fund_id:
        raise HTTPException(status_code=404, detail="LP瑜?李얠쓣 ???놁뒿?덈떎")

    payload = data.model_dump(exclude_unset=True)
    if "paid_in" in payload:
        has_call_items, paid_in_total = calculate_lp_paid_in_from_calls(db, fund_id, lp_id)
        if has_call_items:
            payload["paid_in"] = paid_in_total

    for key, val in payload.items():
        setattr(lp, key, val)

    db.commit()
    db.refresh(lp)
    return lp


@router.delete("/api/funds/{fund_id}/lps/{lp_id}", status_code=204)
def delete_lp(fund_id: int, lp_id: int, db: Session = Depends(get_db)):
    lp = db.get(LP, lp_id)
    if not lp or lp.fund_id != fund_id:
        raise HTTPException(status_code=404, detail="LP瑜?李얠쓣 ???놁뒿?덈떎")

    db.delete(lp)
    db.commit()


@router.put("/api/funds/{fund_id}/notice-periods", response_model=list[FundNoticePeriodResponse])
def replace_notice_periods(
    fund_id: int,
    data: list[FundNoticePeriodCreate],
    db: Session = Depends(get_db),
):
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="議고빀??李얠쓣 ???놁뒿?덈떎")

    fund.notice_periods.clear()
    for item in data:
        fund.notice_periods.append(
            FundNoticePeriod(
                notice_type=item.notice_type.strip(),
                label=item.label.strip(),
                business_days=item.business_days,
                memo=item.memo.strip() if item.memo else None,
            )
        )

    db.commit()
    db.refresh(fund)
    return sorted(fund.notice_periods, key=lambda row: row.id)


@router.put("/api/funds/{fund_id}/key-terms", response_model=list[FundKeyTermResponse])
def replace_key_terms(
    fund_id: int,
    data: list[FundKeyTermCreate],
    db: Session = Depends(get_db),
):
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="議고빀??李얠쓣 ???놁뒿?덈떎")

    fund.key_terms.clear()
    for item in data:
        fund.key_terms.append(
            FundKeyTerm(
                category=item.category.strip(),
                label=item.label.strip(),
                value=item.value.strip(),
                article_ref=item.article_ref.strip() if item.article_ref else None,
            )
        )

    db.commit()
    db.refresh(fund)
    return sorted(fund.key_terms, key=lambda row: row.id)


@router.get("/api/funds/{fund_id}/notice-periods/{notice_type}", response_model=FundNoticePeriodResponse)
def get_notice_period(fund_id: int, notice_type: str, db: Session = Depends(get_db)):
    period = (
        db.query(FundNoticePeriod)
        .filter(
            FundNoticePeriod.fund_id == fund_id,
            FundNoticePeriod.notice_type == notice_type,
        )
        .first()
    )
    if not period:
        raise HTTPException(status_code=404, detail="?듭?湲곌컙??李얠쓣 ???놁뒿?덈떎")
    return period


@router.get("/api/funds/{fund_id}/calculate-deadline")
def calculate_deadline(
    fund_id: int,
    target_date: date,
    notice_type: str,
    db: Session = Depends(get_db),
):
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="議고빀??李얠쓣 ???놁뒿?덈떎")

    period = (
        db.query(FundNoticePeriod)
        .filter(
            FundNoticePeriod.fund_id == fund_id,
            FundNoticePeriod.notice_type == notice_type,
        )
        .first()
    )
    if not period:
        raise HTTPException(status_code=404, detail="?듭?湲곌컙??李얠쓣 ???놁뒿?덈떎")

    deadline = calculate_business_days_before(target_date, period.business_days)
    return {
        "target_date": target_date.isoformat(),
        "notice_type": notice_type,
        "business_days": period.business_days,
        "deadline": deadline.isoformat(),
        "label": period.label,
    }

