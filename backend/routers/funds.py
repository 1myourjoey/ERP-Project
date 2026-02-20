from datetime import date, datetime, timedelta
import io

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from dateutil.relativedelta import relativedelta
from sqlalchemy import case, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund, LP, FundNoticePeriod, FundKeyTerm
from models.lp_address_book import LPAddressBook
from models.investment import Investment
from models.phase3 import CapitalCall, CapitalCallItem
from models.task import Task
from models.workflow_instance import WorkflowInstance, WorkflowStepInstance
from schemas.fund import (
    FundMigrationImportResponse,
    FundMigrationValidateResponse,
    FundCreate,
    FundKeyTermCreate,
    FundKeyTermResponse,
    FundListItem,
    FundMigrationErrorItem,
    FundNoticePeriodCreate,
    FundNoticePeriodResponse,
    FundOverviewItem,
    FundOverviewResponse,
    FundOverviewTotals,
    FundResponse,
    FundUpdate,
    LPCreate,
    LPResponse,
    LPUpdate,
)
from services.workflow_service import calculate_business_days_before
from services.fund_integrity import validate_lp_paid_in_pair

router = APIRouter(tags=["funds"])
OVERVIEW_UNIT = 1_000_000

MIGRATION_FUND_HEADERS = [
    "fund_key",
    "name",
    "type",
    "status",
    "formation_date",
    "registration_number",
    "registration_date",
    "gp",
    "fund_manager",
    "co_gp",
    "trustee",
    "commitment_total",
    "gp_commitment",
    "contribution_type",
    "investment_period_end",
    "maturity_date",
    "dissolution_date",
    "mgmt_fee_rate",
    "performance_fee_rate",
    "hurdle_rate",
    "account_number",
]

MIGRATION_LP_HEADERS = [
    "fund_key",
    "name",
    "type",
    "commitment",
    "paid_in",
    "contact",
    "business_number",
    "address",
]

MIGRATION_FUND_TYPES = {
    "투자조합",
    "벤처투자조합",
    "신기술투자조합",
    "사모투자합자회사(PEF)",
    "창업투자조합",
    "농림수산식품투자조합",
    "기타",
}

MIGRATION_FUND_STATUS = {"forming", "active", "dissolved", "liquidated"}
MIGRATION_LP_TYPES = {"기관투자자", "개인투자자", "GP"}


def _to_str(value: object | None) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _parse_date_cell(
    value: object | None,
    row: int,
    column: str,
    errors: list[FundMigrationErrorItem],
) -> date | None:
    if value is None or _to_str(value) == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        text = value.strip()
        try:
            return datetime.strptime(text, "%Y-%m-%d").date()
        except ValueError:
            errors.append(
                FundMigrationErrorItem(
                    row=row,
                    column=column,
                    reason="날짜는 YYYY-MM-DD 형식이어야 합니다",
                )
            )
            return None
    errors.append(
        FundMigrationErrorItem(
            row=row,
            column=column,
            reason="날짜 형식이 올바르지 않습니다",
        )
    )
    return None


def _parse_number_cell(
    value: object | None,
    row: int,
    column: str,
    errors: list[FundMigrationErrorItem],
) -> float | None:
    if value is None:
        return None
    if isinstance(value, str) and value.strip() == "":
        return None
    try:
        if isinstance(value, str):
            parsed = float(value.replace(",", "").strip())
        else:
            parsed = float(value)
    except (TypeError, ValueError):
        errors.append(
            FundMigrationErrorItem(
                row=row,
                column=column,
                reason="숫자 형식이어야 합니다",
            )
        )
        return None
    if parsed < 0:
        errors.append(
            FundMigrationErrorItem(
                row=row,
                column=column,
                reason="0 이상이어야 합니다",
            )
        )
        return None
    return parsed


def _read_sheet_rows(worksheet, headers: list[str], sheet_name: str) -> tuple[list[dict], list[FundMigrationErrorItem]]:
    errors: list[FundMigrationErrorItem] = []
    header_values = next(worksheet.iter_rows(min_row=1, max_row=1, values_only=True), tuple())
    header_map = {_to_str(header_values[idx]): idx for idx in range(len(header_values))}

    for header in headers:
        if header not in header_map:
            errors.append(
                FundMigrationErrorItem(
                    row=1,
                    column=header,
                    reason=f"{sheet_name} 시트에 필수 컬럼이 없습니다",
                )
            )

    if errors:
        return [], errors

    rows: list[dict] = []
    for row_no, row_values in enumerate(worksheet.iter_rows(min_row=2, values_only=True), start=2):
        if all(value is None or _to_str(value) == "" for value in row_values):
            continue

        item: dict = {"__row": row_no}
        for header in headers:
            idx = header_map[header]
            item[header] = row_values[idx] if idx < len(row_values) else None
        rows.append(item)
    return rows, errors


def _validate_migration_rows(
    raw_funds: list[dict],
    raw_lps: list[dict],
) -> tuple[FundMigrationValidateResponse, list[dict], list[dict]]:
    errors: list[FundMigrationErrorItem] = []
    fund_rows: list[dict] = []
    lp_rows: list[dict] = []
    fund_keys: set[str] = set()

    if not raw_funds:
        errors.append(
            FundMigrationErrorItem(
                row=2,
                column="fund_key",
                reason="Funds 시트에 데이터가 없습니다",
            )
        )

    for row in raw_funds:
        row_no = int(row.get("__row", 0))
        fund_key = _to_str(row.get("fund_key"))
        name = _to_str(row.get("name"))
        fund_type = _to_str(row.get("type"))
        status = _to_str(row.get("status")) or "active"

        if not fund_key:
            errors.append(FundMigrationErrorItem(row=row_no, column="fund_key", reason="필수값입니다"))
        elif fund_key in fund_keys:
            errors.append(FundMigrationErrorItem(row=row_no, column="fund_key", reason="중복 fund_key 입니다"))
        else:
            fund_keys.add(fund_key)

        if not name:
            errors.append(FundMigrationErrorItem(row=row_no, column="name", reason="필수값입니다"))
        if not fund_type:
            errors.append(FundMigrationErrorItem(row=row_no, column="type", reason="필수값입니다"))
        elif fund_type not in MIGRATION_FUND_TYPES:
            errors.append(
                FundMigrationErrorItem(
                    row=row_no,
                    column="type",
                    reason="지원하지 않는 조합 유형입니다",
                )
            )

        if status not in MIGRATION_FUND_STATUS:
            errors.append(
                FundMigrationErrorItem(
                    row=row_no,
                    column="status",
                    reason="status는 forming/active/dissolved/liquidated 중 하나여야 합니다",
                )
            )

        parsed = {
            "__row": row_no,
            "fund_key": fund_key,
            "name": name,
            "type": fund_type,
            "status": status,
            "formation_date": _parse_date_cell(row.get("formation_date"), row_no, "formation_date", errors),
            "registration_number": _to_str(row.get("registration_number")) or None,
            "registration_date": _parse_date_cell(row.get("registration_date"), row_no, "registration_date", errors),
            "gp": _to_str(row.get("gp")) or None,
            "fund_manager": _to_str(row.get("fund_manager")) or None,
            "co_gp": _to_str(row.get("co_gp")) or None,
            "trustee": _to_str(row.get("trustee")) or None,
            "commitment_total": _parse_number_cell(row.get("commitment_total"), row_no, "commitment_total", errors),
            "gp_commitment": _parse_number_cell(row.get("gp_commitment"), row_no, "gp_commitment", errors),
            "contribution_type": _to_str(row.get("contribution_type")) or None,
            "investment_period_end": _parse_date_cell(row.get("investment_period_end"), row_no, "investment_period_end", errors),
            "maturity_date": _parse_date_cell(row.get("maturity_date"), row_no, "maturity_date", errors),
            "dissolution_date": _parse_date_cell(row.get("dissolution_date"), row_no, "dissolution_date", errors),
            "mgmt_fee_rate": _parse_number_cell(row.get("mgmt_fee_rate"), row_no, "mgmt_fee_rate", errors),
            "performance_fee_rate": _parse_number_cell(row.get("performance_fee_rate"), row_no, "performance_fee_rate", errors),
            "hurdle_rate": _parse_number_cell(row.get("hurdle_rate"), row_no, "hurdle_rate", errors),
            "account_number": _to_str(row.get("account_number")) or None,
        }
        fund_rows.append(parsed)

    for row in raw_lps:
        row_no = int(row.get("__row", 0))
        fund_key = _to_str(row.get("fund_key"))
        name = _to_str(row.get("name"))
        lp_type = _to_str(row.get("type"))

        if not fund_key:
            errors.append(FundMigrationErrorItem(row=row_no, column="fund_key", reason="필수값입니다"))
        elif fund_key not in fund_keys:
            errors.append(FundMigrationErrorItem(row=row_no, column="fund_key", reason="Funds 시트에 없는 fund_key 입니다"))

        if not name:
            errors.append(FundMigrationErrorItem(row=row_no, column="name", reason="필수값입니다"))
        if not lp_type:
            errors.append(FundMigrationErrorItem(row=row_no, column="type", reason="필수값입니다"))
        elif lp_type not in MIGRATION_LP_TYPES:
            errors.append(FundMigrationErrorItem(row=row_no, column="type", reason="지원하지 않는 LP 유형입니다"))

        lp_rows.append(
            {
                "__row": row_no,
                "fund_key": fund_key,
                "name": name,
                "type": lp_type,
                "commitment": _parse_number_cell(row.get("commitment"), row_no, "commitment", errors),
                "paid_in": _parse_number_cell(row.get("paid_in"), row_no, "paid_in", errors),
                "contact": _to_str(row.get("contact")) or None,
                "business_number": _to_str(row.get("business_number")) or None,
                "address": _to_str(row.get("address")) or None,
            }
        )

    validation = FundMigrationValidateResponse(
        success=len(errors) == 0,
        fund_rows=len(fund_rows),
        lp_rows=len(lp_rows),
        errors=errors,
    )
    return validation, fund_rows, lp_rows


def _parse_and_validate_migration(
    file_content: bytes,
) -> tuple[FundMigrationValidateResponse, list[dict], list[dict]]:
    try:
        import openpyxl
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="openpyxl not installed") from exc

    try:
        workbook = openpyxl.load_workbook(io.BytesIO(file_content), data_only=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="엑셀 파일을 읽을 수 없습니다") from exc

    missing_sheets = [name for name in ("Funds", "LPs") if name not in workbook.sheetnames]
    if missing_sheets:
        errors = [
            FundMigrationErrorItem(row=1, column="sheet", reason=f"필수 시트 누락: {name}")
            for name in missing_sheets
        ]
        return (
            FundMigrationValidateResponse(success=False, fund_rows=0, lp_rows=0, errors=errors),
            [],
            [],
        )

    fund_sheet = workbook["Funds"]
    lp_sheet = workbook["LPs"]
    raw_funds, fund_sheet_errors = _read_sheet_rows(fund_sheet, MIGRATION_FUND_HEADERS, "Funds")
    raw_lps, lp_sheet_errors = _read_sheet_rows(lp_sheet, MIGRATION_LP_HEADERS, "LPs")

    if fund_sheet_errors or lp_sheet_errors:
        errors = [*fund_sheet_errors, *lp_sheet_errors]
        return (
            FundMigrationValidateResponse(success=False, fund_rows=0, lp_rows=0, errors=errors),
            [],
            [],
        )

    return _validate_migration_rows(raw_funds, raw_lps)


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


@router.get("/api/funds/migration-template")
def download_migration_template():
    try:
        import openpyxl
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="openpyxl not installed") from exc

    workbook = openpyxl.Workbook()
    funds_sheet = workbook.active
    funds_sheet.title = "Funds"
    funds_sheet.append(MIGRATION_FUND_HEADERS)
    funds_sheet.append(
        [
            "FUND-001",
            "예시 조합",
            "벤처투자조합",
            "active",
            "2026-01-15",
            "123-45-67890",
            "2026-02-01",
            "예시 GP",
            "홍길동",
            "",
            "OO은행",
            10000000000,
            1000000000,
            "분할",
            "2030-01-15",
            "2034-01-15",
            "",
            2.0,
            20.0,
            6.0,
            "110-123-456789",
        ]
    )

    lp_sheet = workbook.create_sheet("LPs")
    lp_sheet.append(MIGRATION_LP_HEADERS)
    lp_sheet.append(
        [
            "FUND-001",
            "예시 기관 LP",
            "기관투자자",
            3000000000,
            500000000,
            "02-0000-0000",
            "111-22-33333",
            "서울시 강남구",
        ]
    )
    lp_sheet.append(
        [
            "FUND-001",
            "예시 GP",
            "GP",
            1000000000,
            300000000,
            "02-1111-2222",
            "123-45-67890",
            "서울시 서초구",
        ]
    )

    guide_sheet = workbook.create_sheet("Guide")
    guide_sheet.append(["항목", "설명"])
    guide_sheet.append(["Sheets", "Funds / LPs / Guide 시트를 유지하세요."])
    guide_sheet.append(["필수값", "Funds: fund_key,name,type / LPs: fund_key,name,type"])
    guide_sheet.append(["날짜형식", "YYYY-MM-DD"])
    guide_sheet.append(["숫자형식", "0 이상의 숫자"])
    guide_sheet.append(["Import", "반드시 validate 후 import를 실행하세요."])

    output = io.BytesIO()
    workbook.save(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="funds_lp_migration_template.xlsx"'},
    )


@router.post("/api/funds/migration-validate", response_model=FundMigrationValidateResponse)
async def validate_migration(payload: bytes = Body(..., media_type="application/octet-stream")):
    if not payload:
        raise HTTPException(status_code=400, detail="업로드 파일이 비어 있습니다")
    validation, _, _ = _parse_and_validate_migration(payload)
    return validation


def _find_existing_fund(db: Session, row: dict) -> Fund | None:
    registration_number = row.get("registration_number")
    if registration_number:
        existing = db.query(Fund).filter(Fund.registration_number == registration_number).first()
        if existing:
            return existing
    if row.get("name") and row.get("formation_date"):
        existing = (
            db.query(Fund)
            .filter(
                Fund.name == row["name"],
                Fund.formation_date == row["formation_date"],
            )
            .first()
        )
        if existing:
            return existing
    return None


def _find_existing_lp(db: Session, fund_id: int, row: dict) -> LP | None:
    business_number = row.get("business_number")
    if business_number:
        existing = (
            db.query(LP)
            .filter(
                LP.fund_id == fund_id,
                LP.business_number == business_number,
            )
            .first()
        )
        if existing:
            return existing
    return (
        db.query(LP)
        .filter(
            LP.fund_id == fund_id,
            LP.name == row["name"],
        )
        .first()
    )


def _normalize_lp_text(value: str | None) -> str:
    return (value or "").strip()


def _normalize_lp_optional(value: str | None) -> str | None:
    text = _normalize_lp_text(value)
    return text or None


def _get_lp_address_book(db: Session, address_book_id: int | None) -> LPAddressBook | None:
    if address_book_id is None:
        return None
    row = db.get(LPAddressBook, address_book_id)
    if not row:
        raise HTTPException(status_code=404, detail="LP address book not found")
    return row


def _ensure_lp_unique_in_fund(
    db: Session,
    fund_id: int,
    *,
    name: str,
    business_number: str | None,
    address_book_id: int | None,
    current_lp_id: int | None = None,
) -> None:
    normalized_name = _normalize_lp_text(name)
    normalized_business_number = _normalize_lp_optional(business_number)

    if address_book_id is not None:
        query = db.query(LP).filter(
            LP.fund_id == fund_id,
            LP.address_book_id == address_book_id,
        )
        if current_lp_id is not None:
            query = query.filter(LP.id != current_lp_id)
        if query.first():
            raise HTTPException(
                status_code=409,
                detail="This address-book entity is already registered in the same fund",
            )

    if normalized_business_number:
        query = db.query(LP).filter(
            LP.fund_id == fund_id,
            LP.business_number == normalized_business_number,
        )
        if current_lp_id is not None:
            query = query.filter(LP.id != current_lp_id)
        if query.first():
            raise HTTPException(
                status_code=409,
                detail="LP with the same business number already exists in this fund",
            )

    query = db.query(LP).filter(
        LP.fund_id == fund_id,
        LP.name == normalized_name,
    )
    if current_lp_id is not None:
        query = query.filter(LP.id != current_lp_id)
    if query.first():
        raise HTTPException(
            status_code=409,
            detail="LP with the same name already exists in this fund",
        )


def _upsert_lp_address_book(db: Session, row: dict) -> int:
    business_number = row.get("business_number")
    existing = None
    if business_number:
        existing = db.query(LPAddressBook).filter(LPAddressBook.business_number == business_number).first()
    if existing is None:
        existing = (
            db.query(LPAddressBook)
            .filter(
                LPAddressBook.name == row["name"],
                LPAddressBook.type == row["type"],
            )
            .first()
        )

    if existing is None:
        db.add(
            LPAddressBook(
                name=row["name"],
                type=row["type"],
                business_number=row.get("business_number"),
                contact=row.get("contact"),
                address=row.get("address"),
                memo=None,
                gp_entity_id=None,
                is_active=1,
            )
        )
        return 1

    existing.name = row["name"]
    existing.type = row["type"]
    existing.business_number = row.get("business_number")
    existing.contact = row.get("contact")
    existing.address = row.get("address")
    existing.is_active = 1
    return 1


@router.post("/api/funds/migration-import", response_model=FundMigrationImportResponse)
async def import_migration(
    payload: bytes = Body(..., media_type="application/octet-stream"),
    mode: str = Query("upsert"),
    sync_address_book: bool = Query(False),
    db: Session = Depends(get_db),
):
    if mode not in {"insert", "upsert"}:
        raise HTTPException(status_code=400, detail="mode는 insert/upsert 중 하나여야 합니다")

    if not payload:
        raise HTTPException(status_code=400, detail="업로드 파일이 비어 있습니다")

    validation, fund_rows, lp_rows = _parse_and_validate_migration(payload)
    if validation.errors:
        return FundMigrationImportResponse(
            success=False,
            mode=mode,
            fund_rows=validation.fund_rows,
            lp_rows=validation.lp_rows,
            errors=validation.errors,
            validation=validation,
        )

    import_errors: list[FundMigrationErrorItem] = []
    created_funds = 0
    updated_funds = 0
    created_lps = 0
    updated_lps = 0
    synced_address_books = 0

    try:
        fund_map: dict[str, Fund] = {}
        for row in fund_rows:
            existing = _find_existing_fund(db, row)

            if mode == "insert" and existing is not None:
                import_errors.append(
                    FundMigrationErrorItem(
                        row=row["__row"],
                        column="registration_number",
                        reason="insert 모드에서 이미 존재하는 조합입니다",
                    )
                )
                continue

            payload = {
                "name": row["name"],
                "type": row["type"],
                "status": row["status"],
                "formation_date": row["formation_date"],
                "registration_number": row["registration_number"],
                "registration_date": row["registration_date"],
                "gp": row["gp"],
                "fund_manager": row["fund_manager"],
                "co_gp": row["co_gp"],
                "trustee": row["trustee"],
                "commitment_total": row["commitment_total"],
                "gp_commitment": row["gp_commitment"],
                "contribution_type": row["contribution_type"],
                "investment_period_end": row["investment_period_end"],
                "maturity_date": row["maturity_date"],
                "dissolution_date": row["dissolution_date"],
                "mgmt_fee_rate": row["mgmt_fee_rate"],
                "performance_fee_rate": row["performance_fee_rate"],
                "hurdle_rate": row["hurdle_rate"],
                "account_number": row["account_number"],
            }

            if existing is None:
                fund = Fund(**payload)
                db.add(fund)
                db.flush()
                created_funds += 1
            else:
                fund = existing
                for key, value in payload.items():
                    setattr(fund, key, value)
                updated_funds += 1

            fund_map[row["fund_key"]] = fund

        for row in lp_rows:
            fund = fund_map.get(row["fund_key"])
            if fund is None:
                import_errors.append(
                    FundMigrationErrorItem(
                        row=row["__row"],
                        column="fund_key",
                        reason="매핑된 조합을 찾을 수 없습니다",
                    )
                )
                continue

            existing_lp = _find_existing_lp(db, fund.id, row)
            if mode == "insert" and existing_lp is not None:
                import_errors.append(
                    FundMigrationErrorItem(
                        row=row["__row"],
                        column="business_number",
                        reason="insert 모드에서 이미 존재하는 LP입니다",
                    )
                )
                continue

            lp_payload = {
                "name": row["name"],
                "type": row["type"],
                "commitment": row["commitment"],
                "paid_in": row["paid_in"],
                "contact": row["contact"],
                "business_number": row["business_number"],
                "address": row["address"],
            }

            if existing_lp is None:
                db.add(LP(fund_id=fund.id, **lp_payload))
                created_lps += 1
            else:
                for key, value in lp_payload.items():
                    setattr(existing_lp, key, value)
                updated_lps += 1

            if sync_address_book:
                synced_address_books += _upsert_lp_address_book(db, row)

        if import_errors:
            db.rollback()
            return FundMigrationImportResponse(
                success=False,
                mode=mode,
                fund_rows=validation.fund_rows,
                lp_rows=validation.lp_rows,
                created_funds=0,
                updated_funds=0,
                created_lps=0,
                updated_lps=0,
                synced_address_books=0,
                errors=import_errors,
                validation=validation,
            )

        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"마이그레이션 import 중 오류가 발생했습니다: {exc}") from exc

    return FundMigrationImportResponse(
        success=True,
        mode=mode,
        fund_rows=validation.fund_rows,
        lp_rows=validation.lp_rows,
        created_funds=created_funds,
        updated_funds=updated_funds,
        created_lps=created_lps,
        updated_lps=updated_lps,
        synced_address_books=synced_address_books,
        errors=[],
        validation=validation,
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


def _is_completed_status(status: str | None) -> bool:
    return (status or "").strip().lower() == "completed"


def _cleanup_fund_tasks_and_workflows(db: Session, fund_id: int) -> None:
    completed_workflows = (
        db.query(WorkflowInstance)
        .filter(
            WorkflowInstance.fund_id == fund_id,
            func.lower(func.coalesce(WorkflowInstance.status, "")) == "completed",
        )
        .all()
    )
    for instance in completed_workflows:
        instance.fund_id = None

    non_completed_workflows = (
        db.query(WorkflowInstance)
        .filter(
            WorkflowInstance.fund_id == fund_id,
            func.lower(func.coalesce(WorkflowInstance.status, "")) != "completed",
        )
        .all()
    )
    deleted_workflow_ids: set[int] = set()
    handled_task_ids: set[int] = set()

    for instance in non_completed_workflows:
        deleted_workflow_ids.add(instance.id)
        for step_instance in instance.step_instances:
            if not step_instance.task_id:
                continue
            task = db.get(Task, step_instance.task_id)
            step_instance.task_id = None
            if not task:
                continue

            if _is_completed_status(task.status):
                task.fund_id = None
                task.workflow_instance_id = None
                task.workflow_step_order = None
            else:
                db.delete(task)
            handled_task_ids.add(task.id)

        db.delete(instance)

    tasks = db.query(Task).filter(Task.fund_id == fund_id).all()
    for task in tasks:
        if task.id in handled_task_ids:
            continue

        if _is_completed_status(task.status):
            task.fund_id = None
            if task.workflow_instance_id in deleted_workflow_ids:
                task.workflow_instance_id = None
                task.workflow_step_order = None
            continue

        (
            db.query(WorkflowStepInstance)
            .filter(WorkflowStepInstance.task_id == task.id)
            .update({WorkflowStepInstance.task_id: None}, synchronize_session=False)
        )
        db.delete(task)


@router.delete("/api/funds/{fund_id}", status_code=204)
def delete_fund(fund_id: int, db: Session = Depends(get_db)):
    fund = db.get(Fund, fund_id)
    if not fund:
        raise HTTPException(status_code=404, detail="議고빀??李얠쓣 ???놁뒿?덈떎")
    try:
        _cleanup_fund_tasks_and_workflows(db, fund_id)
        db.flush()
        db.delete(fund)
        db.commit()
    except Exception:
        db.rollback()
        raise


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

    payload = data.model_dump()
    address_book = _get_lp_address_book(db, payload.get("address_book_id"))

    if address_book:
        payload["business_number"] = _normalize_lp_optional(payload.get("business_number")) or address_book.business_number
        payload["name"] = _normalize_lp_text(payload.get("name")) or address_book.name
        payload["type"] = _normalize_lp_text(payload.get("type")) or address_book.type
        payload["contact"] = _normalize_lp_optional(payload.get("contact")) or address_book.contact
        payload["address"] = _normalize_lp_optional(payload.get("address")) or address_book.address

    payload["name"] = _normalize_lp_text(payload.get("name"))
    payload["type"] = _normalize_lp_text(payload.get("type"))
    payload["business_number"] = _normalize_lp_optional(payload.get("business_number"))
    payload["contact"] = _normalize_lp_optional(payload.get("contact"))
    payload["address"] = _normalize_lp_optional(payload.get("address"))

    if not payload["name"] or not payload["type"]:
        raise HTTPException(status_code=400, detail="LP name and type are required")

    validate_lp_paid_in_pair(
        commitment=payload.get("commitment"),
        paid_in=payload.get("paid_in"),
    )

    _ensure_lp_unique_in_fund(
        db,
        fund_id,
        name=payload["name"],
        business_number=payload.get("business_number"),
        address_book_id=payload.get("address_book_id"),
    )

    lp = LP(fund_id=fund_id, **payload)
    db.add(lp)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Duplicate LP in the same fund is not allowed") from exc
    db.refresh(lp)
    return lp


@router.put("/api/funds/{fund_id}/lps/{lp_id}", response_model=LPResponse)
def update_lp(fund_id: int, lp_id: int, data: LPUpdate, db: Session = Depends(get_db)):
    lp = db.get(LP, lp_id)
    if not lp or lp.fund_id != fund_id:
        raise HTTPException(status_code=404, detail="LP瑜?李얠쓣 ???놁뒿?덈떎")

    payload = data.model_dump(exclude_unset=True)
    if "name" in payload:
        payload["name"] = _normalize_lp_text(payload.get("name"))
    if "type" in payload:
        payload["type"] = _normalize_lp_text(payload.get("type"))
    if "business_number" in payload:
        payload["business_number"] = _normalize_lp_optional(payload.get("business_number"))
    if "contact" in payload:
        payload["contact"] = _normalize_lp_optional(payload.get("contact"))
    if "address" in payload:
        payload["address"] = _normalize_lp_optional(payload.get("address"))

    if "address_book_id" in payload:
        address_book = _get_lp_address_book(db, payload.get("address_book_id"))
        if address_book:
            payload.setdefault("name", address_book.name)
            payload.setdefault("type", address_book.type)
            payload.setdefault("business_number", address_book.business_number)
            payload.setdefault("contact", address_book.contact)
            payload.setdefault("address", address_book.address)

    next_name = _normalize_lp_text(payload.get("name", lp.name))
    next_type = _normalize_lp_text(payload.get("type", lp.type))
    next_business_number = _normalize_lp_optional(payload.get("business_number", lp.business_number))
    next_address_book_id = payload.get("address_book_id", lp.address_book_id)

    if not next_name or not next_type:
        raise HTTPException(status_code=400, detail="LP name and type are required")

    _ensure_lp_unique_in_fund(
        db,
        fund_id,
        name=next_name,
        business_number=next_business_number,
        address_book_id=next_address_book_id,
        current_lp_id=lp.id,
    )

    has_call_items, paid_in_total = calculate_lp_paid_in_from_calls(db, fund_id, lp_id)
    if has_call_items:
        payload["paid_in"] = paid_in_total

    next_commitment = payload.get("commitment", lp.commitment)
    next_paid_in = payload.get("paid_in", lp.paid_in)
    validate_lp_paid_in_pair(
        commitment=next_commitment,
        paid_in=next_paid_in,
    )

    for key, val in payload.items():
        setattr(lp, key, val)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Duplicate LP in the same fund is not allowed") from exc
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
                day_basis=(item.day_basis or "business").strip().lower(),
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

    day_basis = (period.day_basis or "business").strip().lower()
    if day_basis == "calendar":
        deadline = target_date - timedelta(days=period.business_days)
    else:
        deadline = calculate_business_days_before(target_date, period.business_days)
    return {
        "target_date": target_date.isoformat(),
        "notice_type": notice_type,
        "business_days": period.business_days,
        "notice_days": period.business_days,
        "day_basis": day_basis,
        "deadline": deadline.isoformat(),
        "label": period.label,
    }

