from __future__ import annotations

import os
import sys
from datetime import date, datetime, time, timedelta

import sqlalchemy as sa
from sqlalchemy.orm import Session

BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from database import Base, SessionLocal, engine
from models.accounting import Account, JournalEntry, JournalEntryLine
from models.biz_report import BizReport
from models.calendar_event import CalendarEvent
from models.checklist import Checklist, ChecklistItem
from models.fund import Fund, FundNoticePeriod, LP
from models.investment import Investment, InvestmentDocument, PortfolioCompany
from models.phase3 import (
    Assembly,
    CapitalCall,
    CapitalCallItem,
    Distribution,
    DistributionItem,
    ExitCommittee,
    ExitCommitteeFund,
    ExitTrade,
)
from models.regular_report import RegularReport
from models.task import Task
from models.transaction import Transaction
from models.valuation import Valuation
from models.vote_record import VoteRecord
from models.workflow import Workflow, WorkflowDocument, WorkflowStep, WorkflowWarning
from models.workflow_instance import WorkflowInstance
from seed.seed_accounts import seed_accounts
from seeds.document_templates import seed_document_templates
from services.workflow_service import instantiate_workflow

KRW_UNIT_SCALE = 1_000_000


def d(value: str) -> date:
    return date.fromisoformat(value)


def dt(day: date, hour: int = 9, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour=hour, minute=minute))


def ensure_biz_report_schema(db: Session) -> None:
    bind = db.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("biz_reports"):
        BizReport.__table__.create(bind=bind, checkfirst=True)
        return

    columns = {column["name"] for column in inspector.get_columns("biz_reports")}
    required = {"fund_id", "report_year", "submission_date", "irr", "tvpi", "dpi"}
    if required.issubset(columns):
        return

    with bind.begin() as conn:
        conn.exec_driver_sql("DROP TABLE biz_reports")
    BizReport.__table__.create(bind=bind, checkfirst=True)


def ensure_fund_schema(db: Session) -> None:
    bind = db.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("funds"):
        return

    columns = {column["name"] for column in inspector.get_columns("funds")}
    add_specs = [
        ("fund_manager", "TEXT"),
        ("investment_period_end", "DATE"),
        ("dissolution_date", "DATE"),
        ("gp_commitment", "REAL"),
        ("contribution_type", "TEXT"),
    ]
    with bind.begin() as conn:
        for name, sql_type in add_specs:
            if name not in columns:
                conn.exec_driver_sql(f"ALTER TABLE funds ADD COLUMN {name} {sql_type}")


def ensure_task_schema(db: Session) -> None:
    bind = db.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("tasks"):
        return

    columns = {column["name"] for column in inspector.get_columns("tasks")}
    add_specs = [
        ("category", "TEXT"),
        ("fund_id", "INTEGER"),
        ("investment_id", "INTEGER"),
    ]
    with bind.begin() as conn:
        for name, sql_type in add_specs:
            if name not in columns:
                conn.exec_driver_sql(f"ALTER TABLE tasks ADD COLUMN {name} {sql_type}")


def _legacy_money_condition(column):
    return sa.and_(
        column.isnot(None),
        column < KRW_UNIT_SCALE,
        column > -KRW_UNIT_SCALE,
        column != 0,
    )


def _scale_legacy_column(db: Session, model, column) -> None:
    db.query(model).filter(_legacy_money_condition(column)).update(
        {column: column * KRW_UNIT_SCALE},
        synchronize_session=False,
    )


def normalize_currency_units_to_won(db: Session) -> None:
    commitment_values = [
        float(value)
        for (value,) in db.query(Fund.commitment_total)
        .filter(Fund.commitment_total.isnot(None))
        .all()
    ]
    if not commitment_values:
        return

    legacy_fund_count = sum(
        1 for value in commitment_values if 0 < abs(value) < KRW_UNIT_SCALE
    )
    required_legacy_count = max(2, (len(commitment_values) + 1) // 2)
    fixed_partial_aum_count = db.query(Fund).filter(
        Fund.commitment_total.isnot(None),
        Fund.aum.isnot(None),
        Fund.aum > 0,
        Fund.commitment_total == Fund.aum * 100,
    ).update(
        {Fund.aum: Fund.commitment_total},
        synchronize_session=False,
    )
    if legacy_fund_count < required_legacy_count:
        if fixed_partial_aum_count:
            db.commit()
            print("[seed] currency units: normalized partial AUM values")
        return

    # Legacy seed values are stored in million KRW units (e.g., 20500).
    # Convert those rows to KRW while avoiding already-converted values.
    _scale_legacy_column(db, Fund, Fund.commitment_total)
    _scale_legacy_column(db, Fund, Fund.gp_commitment)
    _scale_legacy_column(db, Fund, Fund.aum)

    _scale_legacy_column(db, LP, LP.commitment)
    _scale_legacy_column(db, LP, LP.paid_in)

    _scale_legacy_column(db, CapitalCall, CapitalCall.total_amount)
    _scale_legacy_column(db, CapitalCallItem, CapitalCallItem.amount)

    _scale_legacy_column(db, Distribution, Distribution.principal_total)
    _scale_legacy_column(db, Distribution, Distribution.profit_total)
    _scale_legacy_column(db, Distribution, Distribution.performance_fee)
    _scale_legacy_column(db, DistributionItem, DistributionItem.principal)
    _scale_legacy_column(db, DistributionItem, DistributionItem.profit)

    _scale_legacy_column(db, Investment, Investment.amount)
    _scale_legacy_column(db, Investment, Investment.valuation)
    _scale_legacy_column(db, Investment, Investment.valuation_pre)
    _scale_legacy_column(db, Investment, Investment.valuation_post)

    _scale_legacy_column(db, Transaction, Transaction.amount)
    _scale_legacy_column(db, Transaction, Transaction.balance_before)
    _scale_legacy_column(db, Transaction, Transaction.balance_after)
    _scale_legacy_column(db, Transaction, Transaction.realized_gain)
    _scale_legacy_column(db, Transaction, Transaction.cumulative_gain)

    _scale_legacy_column(db, Valuation, Valuation.value)
    _scale_legacy_column(db, Valuation, Valuation.prev_value)
    _scale_legacy_column(db, Valuation, Valuation.change_amount)

    _scale_legacy_column(db, ExitTrade, ExitTrade.amount)
    _scale_legacy_column(db, ExitTrade, ExitTrade.price_per_share)
    _scale_legacy_column(db, ExitTrade, ExitTrade.fees)
    _scale_legacy_column(db, ExitTrade, ExitTrade.net_amount)
    _scale_legacy_column(db, ExitTrade, ExitTrade.realized_gain)

    _scale_legacy_column(db, BizReport, BizReport.total_commitment)
    _scale_legacy_column(db, BizReport, BizReport.total_paid_in)
    _scale_legacy_column(db, BizReport, BizReport.total_invested)
    _scale_legacy_column(db, BizReport, BizReport.total_distributed)
    _scale_legacy_column(db, BizReport, BizReport.fund_nav)

    _scale_legacy_column(db, JournalEntryLine, JournalEntryLine.debit)
    _scale_legacy_column(db, JournalEntryLine, JournalEntryLine.credit)

    db.commit()
    print("[seed] currency units: converted from million KRW to KRW")


def reset_seed_data_if_requested(db: Session) -> None:
    force_reset = os.getenv("FORCE_SEED_RESET", "").strip().lower() in {"1", "true", "yes", "y"}
    if not force_reset:
        return

    bind = db.get_bind()
    inspector = sa.inspect(bind)
    tables = [
        "workflow_step_instances",
        "workflow_instances",
        "workflow_warnings",
        "workflow_documents",
        "workflow_steps",
        "workflows",
        "calendar_events",
        "tasks",
        "investment_documents",
        "transactions",
        "valuations",
        "vote_records",
        "capital_call_items",
        "capital_calls",
        "distribution_items",
        "distributions",
        "assemblies",
        "exit_committee_funds",
        "exit_trades",
        "exit_committees",
        "journal_entry_lines",
        "journal_entries",
        "accounts",
        "checklist_items",
        "checklists",
        "regular_reports",
        "biz_reports",
        "lps",
        "investments",
        "portfolio_companies",
        "fund_notice_periods",
        "fund_key_terms",
        "funds",
    ]

    with bind.begin() as conn:
        if bind.dialect.name == "sqlite":
            conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        for table in tables:
            if inspector.has_table(table):
                conn.exec_driver_sql(f"DELETE FROM {table}")
        if bind.dialect.name == "sqlite":
            conn.exec_driver_sql("PRAGMA foreign_keys=ON")
    print("[seed] reset: cleared existing data (FORCE_SEED_RESET=1)")


def seed_funds(db: Session) -> list[Fund]:
    if db.query(Fund).count() > 0:
        print("[seed] funds: skip")
        return db.query(Fund).order_by(Fund.id.asc()).all()

    rows = [
        Fund(
            name="미래투자조합",
            type="농림수산식품투자조합",
            status="active",
            formation_date=d("2024-07-02"),
            investment_period_end=d("2028-07-01"),
            maturity_date=d("2032-07-01"),
            gp="트리거인베스트먼트파트너스",
            fund_manager="김00",
            commitment_total=20203,
            gp_commitment=2203,
            aum=20203,
            hurdle_rate=2.0,
        ),
        Fund(
            name="하이테크1호조합",
            type="벤처투자조합",
            status="active",
            formation_date=d("2024-10-02"),
            investment_period_end=d("2027-10-01"),
            maturity_date=d("2029-10-01"),
            gp="트리거인베스트먼트파트너스",
            fund_manager="가--",
            commitment_total=2085,
            gp_commitment=23,
            aum=2085,
            hurdle_rate=8.0,
        ),
        Fund(
            name="파마테크2호조합",
            type="벤처투자조합",
            status="active",
            formation_date=d("2024-11-15"),
            investment_period_end=d("2027-11-14"),
            maturity_date=d("2029-11-14"),
            gp="트리거인베스트먼트파트너스",
            fund_manager="나00",
            commitment_total=4755,
            gp_commitment=55,
            aum=4755,
            hurdle_rate=8.0,
        ),
        Fund(
            name="EX투자조합",
            type="농림수산식품투자조합",
            status="active",
            formation_date=d("2024-12-31"),
            investment_period_end=d("2028-12-30"),
            maturity_date=d("2032-12-30"),
            gp="트리거인베스트먼트파트너스",
            fund_manager="일00",
            commitment_total=10110,
            gp_commitment=110,
            aum=10110,
            hurdle_rate=2.0,
        ),
        Fund(
            name="뉴챕터투자조합",
            type="신기술사업투자조합",
            status="active",
            formation_date=d("2025-06-05"),
            investment_period_end=d("2029-06-04"),
            maturity_date=d("2033-06-04"),
            gp="트리거인베스트먼트파트너스",
            fund_manager="봐00",
            commitment_total=33400,
            gp_commitment=400,
            aum=33400,
            hurdle_rate=3.5,
        ),
        Fund(
            name="밸류체인펀드",
            type="농림수산식품투자조합",
            status="active",
            formation_date=d("2025-07-17"),
            investment_period_end=d("2029-07-16"),
            maturity_date=d("2033-07-16"),
            gp="트리거인베스트먼트파트너스",
            fund_manager="송00",
            commitment_total=20500,
            gp_commitment=500,
            aum=20500,
            hurdle_rate=2.0,
        ),
        Fund(
            name="메디테크 3호 조합",
            type="벤처투자조합",
            status="active",
            formation_date=d("2025-10-31"),
            investment_period_end=d("2028-10-30"),
            maturity_date=d("2030-10-30"),
            gp="트리거인베스트먼트파트너스",
            fund_manager="아00",
            commitment_total=2275,
            gp_commitment=25,
            aum=2275,
            hurdle_rate=8.0,
        ),
        Fund(
            name="성장 벤처투자조합",
            type="벤처투자조합",
            status="forming",
            formation_date=None,
            investment_period_end=None,
            maturity_date=None,
            gp="트리거인베스트먼트파트너스",
            fund_manager="최00",
            commitment_total=13500,
            gp_commitment=150,
            aum=13500,
            hurdle_rate=3.0,
        ),
    ]
    db.add_all(rows)
    db.commit()
    print("[seed] funds: created")
    return db.query(Fund).order_by(Fund.id.asc()).all()


def seed_lps(db: Session, funds: list[Fund]) -> list[LP]:
    if db.query(LP).count() > 0:
        print("[seed] lps: skip")
        return db.query(LP).order_by(LP.id.asc()).all()

    if len(funds) < 8:
        print("[seed] lps: skip (need at least 8 funds)")
        return []

    # Final paid-in values per fund (Phase 8/9 target table order).
    paid_in_totals = [14142, 1668, 4755, 9099, 10020, 6150, 2275, 0]

    rows: list[LP] = []
    for idx, fund in enumerate(funds[:8], start=1):
        commitment_total = float(fund.commitment_total or 0)
        gp_commitment = float(fund.gp_commitment or 0)
        total_paid_in = float(paid_in_totals[idx - 1])
        gp_paid_in = min(gp_commitment, total_paid_in)
        inst_commitment = max(0.0, commitment_total - gp_commitment)
        inst_paid_in = max(0.0, total_paid_in - gp_paid_in)

        rows.append(
            LP(
                fund_id=fund.id,
                name=f"Fund {idx} Institutional LP",
                type="기관",
                commitment=inst_commitment,
                paid_in=inst_paid_in,
            )
        )
        rows.append(
            LP(
                fund_id=fund.id,
                name=f"Fund {idx} GP",
                type="GP",
                commitment=gp_commitment,
                paid_in=gp_paid_in,
            )
        )

    db.add_all(rows)
    db.commit()
    print("[seed] lps: created")
    return db.query(LP).order_by(LP.id.asc()).all()


def seed_capital_calls(db: Session, funds: list[Fund], lps: list[LP]) -> list[CapitalCall]:
    if db.query(CapitalCall).count() > 0 or db.query(CapitalCallItem).count() > 0:
        print("[seed] capital calls: skip")
        return db.query(CapitalCall).order_by(CapitalCall.id.asc()).all()

    if len(funds) < 8:
        print("[seed] capital calls: skip (need at least 8 funds)")
        return []

    lp_index: dict[tuple[int, str], LP] = {}
    for lp in lps:
        lp_type = (lp.type or "").strip().upper()
        lp_index[(lp.fund_id, lp_type)] = lp

    # Per fund (seed order), define call rows:
    # (call_date, call_type, institutional_amount, gp_amount, paid, paid_date)
    call_specs: list[list[tuple[str, str, int, int, bool, str | None]]] = [
        [("2024-07-15", "최초납입", 7899, 2203, True, "2024-07-15"), ("2025-03-01", "추가납입", 4040, 0, True, "2025-03-10")],
        [("2024-10-15", "최초납입", 985, 15, True, "2024-10-20"), ("2025-06-15", "추가납입", 660, 8, True, "2025-06-20")],
        [("2024-11-20", "최초납입", 2470, 30, True, "2024-11-20"), ("2025-04-10", "추가납입", 2230, 25, True, "2025-04-15")],
        [("2025-01-20", "최초납입", 4940, 60, True, "2025-01-23"), ("2025-08-20", "추가납입", 4049, 50, True, "2025-08-25")],
        [("2025-06-20", "최초납입", 3850, 150, True, "2025-06-25"), ("2025-11-01", "추가납입", 5770, 250, True, "2025-11-05")],
        [("2025-07-30", "최초납입", 2750, 250, True, "2025-08-04"), ("2025-12-05", "추가납입", 2900, 250, True, "2025-12-10")],
        [("2025-11-10", "최초납입", 1185, 15, True, "2025-11-15"), ("2025-12-31", "추가납입", 1065, 10, True, "2026-01-05")],
        [("2026-03-20", "최초납입요청", 1335, 15, False, None)],
    ]

    created: list[CapitalCall] = []
    for idx, fund in enumerate(funds[:8]):
        inst_lp = lp_index.get((fund.id, "기관"))
        gp_lp = lp_index.get((fund.id, "GP"))
        if not inst_lp or not gp_lp:
            continue

        for call_date, call_type, inst_amount, gp_amount, paid, paid_date in call_specs[idx]:
            call = CapitalCall(
                fund_id=fund.id,
                call_date=d(call_date),
                call_type=call_type,
                total_amount=float(inst_amount + gp_amount),
                memo="seeded capital call",
            )
            db.add(call)
            db.flush()

            if inst_amount > 0:
                db.add(
                    CapitalCallItem(
                        capital_call_id=call.id,
                        lp_id=inst_lp.id,
                        amount=int(inst_amount),
                        paid=1 if paid else 0,
                        paid_date=d(paid_date) if paid and paid_date else None,
                    )
                )
            if gp_amount > 0:
                db.add(
                    CapitalCallItem(
                        capital_call_id=call.id,
                        lp_id=gp_lp.id,
                        amount=int(gp_amount),
                        paid=1 if paid else 0,
                        paid_date=d(paid_date) if paid and paid_date else None,
                    )
                )
            created.append(call)

    db.commit()
    print(f"[seed] capital calls: created ({len(created)} rows)")
    return db.query(CapitalCall).order_by(CapitalCall.id.asc()).all()


def seed_companies(db: Session) -> list[PortfolioCompany]:
    if db.query(PortfolioCompany).count() > 0:
        print("[seed] companies: skip")
        return db.query(PortfolioCompany).order_by(PortfolioCompany.id.asc()).all()

    rows = [
        PortfolioCompany(name="루스바이오", industry="바이오헬스", ceo="박준호", vics_registered=True),
        PortfolioCompany(name="클라우드체인", industry="SaaS/클라우드", ceo="이도윤", vics_registered=True),
        PortfolioCompany(name="에이아이랩스", industry="AI/ML", ceo="정수민", vics_registered=True),
        PortfolioCompany(name="핀테크원", industry="핀테크", ceo="김유진", vics_registered=True),
        PortfolioCompany(name="그린에너지", industry="친환경에너지", ceo="최동현", vics_registered=False),
        PortfolioCompany(name="메디코소프트", industry="의료소프트웨어", ceo="서하은", vics_registered=True),
        PortfolioCompany(name="스마트팩토리", industry="스마트팩토리", ceo="윤지훈", vics_registered=False),
        PortfolioCompany(name="푸드테크", industry="푸드테크", ceo="강태윤", vics_registered=True),
        PortfolioCompany(name="모빌리티플러스", industry="모빌리티", ceo="노하린", vics_registered=True),
        PortfolioCompany(name="커머스나우", industry="이커머스", ceo="류현우", vics_registered=True),
    ]
    db.add_all(rows)
    db.commit()
    print("[seed] companies: created")
    return db.query(PortfolioCompany).order_by(PortfolioCompany.id.asc()).all()


def seed_investments(db: Session, funds: list[Fund], companies: list[PortfolioCompany]) -> list[Investment]:
    if db.query(Investment).count() > 0:
        print("[seed] investments: skip")
        return db.query(Investment).order_by(Investment.id.asc()).all()

    if len(funds) < 8 or len(companies) < 10:
        print("[seed] investments: skip (need 8 funds, 10 companies)")
        return []

    fund_by_name = {fund.name: fund for fund in funds}
    company_by_name = {company.name: company for company in companies}

    spec = [
        ("미래투자조합", "루스바이오", 3000, "보통주", "active", "2024-09-15"),
        ("미래투자조합", "클라우드체인", 2500, "전환사채", "active", "2024-11-01"),
        ("미래투자조합", "스마트팩토리", 2000, "상환전환우선주", "active", "2025-01-20"),
        ("미래투자조합", "푸드테크", 2500, "보통주", "active", "2025-03-15"),
        ("미래투자조합", "그린에너지", 1800, "전환사채", "active", "2025-06-10"),
        ("미래투자조합", "커머스나우", 1700, "보통주", "active", "2025-09-05"),
        ("하이테크1호조합", "에이아이랩스", 1515, "상환전환우선주", "active", "2025-02-10"),
        ("파마테크2호조합", "메디코소프트", 4532, "전환사채", "active", "2025-01-15"),
        ("EX투자조합", "루스바이오", 1200, "보통주", "active", "2025-03-01"),
        ("EX투자조합", "핀테크원", 1100, "전환사채", "active", "2025-04-15"),
        ("EX투자조합", "스마트팩토리", 1000, "보통주", "active", "2025-05-20"),
        ("EX투자조합", "푸드테크", 1000, "상환전환우선주", "active", "2025-06-10"),
        ("EX투자조합", "그린에너지", 900, "보통주", "active", "2025-07-01"),
        ("EX투자조합", "모빌리티플러스", 1000, "전환사채", "active", "2025-08-15"),
        ("EX투자조합", "클라우드체인", 800, "보통주", "active", "2025-09-01"),
        ("EX투자조합", "커머스나우", 900, "상환전환우선주", "active", "2025-10-15"),
        ("EX투자조합", "에이아이랩스", 920, "보통주", "active", "2025-11-20"),
        ("뉴챕터투자조합", "핀테크원", 3500, "보통주", "active", "2025-09-01"),
        ("뉴챕터투자조합", "모빌리티플러스", 3000, "전환사채", "active", "2025-10-15"),
        ("뉴챕터투자조합", "에이아이랩스", 2190, "상환전환우선주", "active", "2025-12-01"),
        ("밸류체인펀드", "스마트팩토리", 2500, "보통주", "active", "2025-10-01"),
        ("밸류체인펀드", "푸드테크", 2000, "전환사채", "active", "2025-11-15"),
        ("밸류체인펀드", "그린에너지", 1500, "보통주", "active", "2025-12-20"),
        ("메디테크 3호 조합", "루스바이오", 2150, "상환전환우선주", "active", "2026-01-10"),
        ("성장 벤처투자조합", "메디코소프트", 1000, "전환사채", "planned", "2026-12-20"),
    ]

    rows: list[Investment] = []
    for fund_name, company_name, amount, instrument, status, investment_date in spec:
        rows.append(
            Investment(
                fund_id=fund_by_name[fund_name].id,
                company_id=company_by_name[company_name].id,
                amount=amount,
                instrument=instrument,
                status=status,
                investment_date=d(investment_date),
            )
        )

    db.add_all(rows)
    db.commit()
    print(f"[seed] investments: created ({len(rows)} rows)")
    return db.query(Investment).order_by(Investment.id.asc()).all()


def seed_tasks(db: Session, funds: list[Fund], investments: list[Investment]) -> list[Task]:
    if db.query(Task).count() > 0:
        print("[seed] tasks: skip")
        return db.query(Task).order_by(Task.id.asc()).all()

    fund_map = {fund.name: fund for fund in funds}
    first_investment_by_fund: dict[int, Investment] = {}
    for investment in investments:
        if investment.fund_id not in first_investment_by_fund:
            first_investment_by_fund[investment.fund_id] = investment

    f1 = fund_map.get("미래투자조합")
    f4 = fund_map.get("EX투자조합")
    f5 = fund_map.get("뉴챕터투자조합")

    i1 = first_investment_by_fund.get(f1.id) if f1 else None

    today = date.today()
    rows = [
        Task(title="투자위원회 안건 검토", deadline=dt(today), estimated_time="2h", quadrant="Q1", status="pending", category="투자실행", fund_id=f1.id if f1 else None, investment_id=i1.id if i1 else None),
        Task(title="LP 문의 응대", deadline=dt(today, 14, 0), estimated_time="45m", quadrant="Q1", status="pending", category="LP보고"),
        Task(title="주간 파이프라인 미팅", deadline=dt(today + timedelta(days=1), 10, 0), estimated_time="1h", quadrant="Q2", status="pending", category="투자실행"),
        Task(title="신규 딜소싱 콜", deadline=dt(today + timedelta(days=2), 16, 0), estimated_time="1h", quadrant="Q2", status="in_progress", category="투자실행"),
        Task(title="월간 운용보고서 초안", deadline=dt(today + timedelta(days=3), 11, 0), estimated_time="3h", quadrant="Q1", status="pending", category="LP보고", fund_id=f1.id if f1 else None),
        Task(title="법무 계약서 검토", deadline=dt(today + timedelta(days=4), 15, 0), estimated_time="2h", quadrant="Q1", status="pending", category="투자실행", fund_id=f4.id if f4 else None),
        Task(title="포트폴리오 KPI 업데이트", deadline=dt(today + timedelta(days=6), 9, 30), estimated_time="1h", quadrant="Q2", status="pending", category="사후관리"),
        Task(title="투자자 뉴스레터 작성", deadline=dt(today + timedelta(days=8), 13, 0), estimated_time="2h", quadrant="Q3", status="pending", category="LP보고", fund_id=f5.id if f5 else None),
        Task(title="미수집서류 리마인드", deadline=dt(today + timedelta(days=10), 10, 0), estimated_time="1h 30m", quadrant="Q1", status="pending", category="서류관리"),
        Task(title="조합 규약 개정안 검토", deadline=dt(today + timedelta(days=12), 11, 0), estimated_time="2h", quadrant="Q2", status="pending", category="규약/총회", fund_id=f1.id if f1 else None),
        Task(title="내부 운영비 정산", deadline=None, estimated_time="30m", quadrant="Q4", status="pending", category="일반"),
        Task(title="채용 인터뷰 일정 조율", deadline=None, estimated_time="45m", quadrant="Q3", status="pending", category="일반"),
    ]
    db.add_all(rows)
    db.commit()
    print("[seed] tasks: created")
    return db.query(Task).order_by(Task.id.asc()).all()

def seed_workflow_templates(db: Session) -> list[Workflow]:
    existing_names = {
        row[0]
        for row in db.query(Workflow.name).all()
        if row[0]
    }
    workflows: list[Workflow] = []

    def add_workflow(
        *,
        name: str,
        category: str,
        trigger: str,
        duration: str,
        steps: list[tuple[str, str, int, str, str, str | None]],
        documents: list[str] | None = None,
        warnings: list[str] | None = None,
    ) -> None:
        if name in existing_names:
            return
        workflow = Workflow(
            name=name,
            trigger_description=trigger,
            category=category,
            total_duration=duration,
        )
        workflow.steps = [
            WorkflowStep(
                order=index + 1,
                name=step_name,
                timing=timing,
                timing_offset_days=offset_days,
                estimated_time=estimated_time,
                quadrant=quadrant,
                memo=memo,
            )
            for index, (step_name, timing, offset_days, estimated_time, quadrant, memo) in enumerate(steps)
        ]
        workflow.documents = [WorkflowDocument(name=doc, required=True) for doc in (documents or [])]
        workflow.warnings = [WorkflowWarning(content=warning, category="warning") for warning in (warnings or [])]
        workflows.append(workflow)
        existing_names.add(name)

    # investment.md (3)
    add_workflow(
        name="투자심의위원회(투심위)",
        category="투자집행",
        trigger="투자 결정 확정 시",
        duration="1~2주",
        steps=[
            ("추가출자금 납입 통보", "D-7", -7, "30m", "Q1", "납입 요청 공문 + 조합 통장사본"),
            ("투심 전 ERP 등록", "D-3", -3, "1~2h", "Q1", "투심 보고서 + 투자계약서 + 준법감시보고서"),
            ("투심위 개최", "D-day", 0, "1~2h", "Q1", "투심위 결과보고서 + 의사록 작성"),
            ("투심위 서류 사인 받기", "D-day 13:00", 0, "1h", "Q1", None),
            ("투심 후 ERP 등록", "D-day", 0, "30m~1h", "Q1", "날인본 결과보고서 + 의사록 등록"),
            ("농금원 ERP 결과보고서 등록", "D-day", 0, "15m", "Q1", "투심위 직후"),
            ("투심위 회의록 작성", "D+2", 2, "2h", "Q1", "2일 이내"),
        ],
        documents=[
            "납입 요청 공문",
            "조합 통장사본",
            "투심 보고서",
            "투자 계약서",
            "준법감시보고서 (3종 중 우선순위)",
            "투심위 결과보고서 (날인)",
            "투심위 의사록 (날인)",
        ],
        warnings=[
            "규약 확인: 출자금 통지기한 준수",
            "규약 확인: ERP 등록기간 준수",
            "기여율 및 밸류 입력 주의",
        ],
    )
    add_workflow(
        name="투자계약 체결",
        category="투자집행",
        trigger="투심위 통과 후 계약일 확정 시",
        duration="3~5일",
        steps=[
            ("권리관계서류 요청", "D-3", -3, "30m", "Q1", "프론트 발송 (피투자기업 바이블용)"),
            ("서류 준비", "D-1", -1, "1h", "Q1", "투자계약서 3부 (천공 필수)"),
            ("투자계약 체결 및 날인", "D-day", 0, "1~2h", "Q1", "간인 + 인감 날인"),
            ("계약서 보관/등록", "D-day", 0, "15m", "Q1", "계약 직후"),
            ("투자계약서 날인본 ERP 업로드", "D-day", 0, "20m", "Q1", "3단계 프로세스"),
            ("투자금 출금 확인", "D-day", 0, "10m", "Q1", "투자금 납입일 = 계약일"),
            ("운용지시서 작성", "D+1", 1, "1~2h", "Q1", "6종 서류 필요"),
            ("운용지시 실행", "D+2", 2, "1h", "Q1", "계약 후 2일 이내"),
        ],
        documents=[
            "투자계약서 3부 (천공 필수)",
            "법인인감증명서 2부 (피투자사, 이해관계자)",
            "사용인감계 2부",
            "신주식(전환사채)청약서·인수증",
            "운용지시서",
            "사업자등록증",
            "계약서 제1조 발췌",
            "의무기재사항 확인서 (준법감시인 날인)",
            "투심위 의사록/결과보고서 (날인본)",
            "주주명부 (투자 전)",
        ],
        warnings=[
            "간인 순서: 조합 인감 -> 피투자사 -> 이해관계인",
            "배부: 가운데 양옆 날인(피투자사), 맨 오른쪽(이해관계인)",
            "피투자사 법인계좌 사전 확보 권장",
            "은행명 정확히 기입 (실수 시 재작성 필요)",
        ],
    )
    add_workflow(
        name="투자 후 서류처리",
        category="투자집행",
        trigger="투자금 출금 완료 후",
        duration="2~3주",
        steps=[
            ("투자 전 서류 취합 (바이블)", "D+3", 3, "1h", "Q1", "권리관계서류 (프론트 전달)"),
            ("투자 후 서류 취합 (바이블)", "D+7", 7, "2~3h", "Q1", "주주명부, 등기부등본 등"),
            ("수탁사 실물 송부", "D+15", 15, "1h", "Q1", "투자일로부터 15일 이내"),
            ("VICS 기업등록", "D+10", 10, "1~2h", "Q1", "프로젝트 시"),
            ("등록원부 변경 신청", "D+14", 14, "1~2h", "Q1", "LP 회람"),
            ("출자증서 발급", "D+21", 21, "30m", "Q1", "변경 등록 후"),
        ],
        documents=[
            "주주명부 (투자 전/후 비교)",
            "법인등기부등본 (증자 후, 말소사항 포함)",
            "주권미발행확인서",
            "주금납입영수증",
            "주식납입금 보관증명서",
            "법인인감증명서 (3개월 이내)",
            "주권미발행확인서 (수탁사 송부)",
            "법인인감증명서 (3개월 이내, 수탁사 송부)",
            "등기부등본 (변경 후, 수탁사 송부)",
            "주주명부 (변경 후, 수탁사 송부)",
        ],
        warnings=[
            "등기부등본 확인 후 주식 수와 계약서 일치 여부 검증 필수",
            "주주명부 비교: 투자 전/후 지분율 투심위 기반 비교",
            "3개월 이내 발급본: 법인인감증명서, 법인등기부등본",
            "주민번호 뒷자리 블러처리 필수",
            "투자 당일 서류 취합 리스트 사전 확인",
        ],
    )

    # fund_formation.md (4)
    add_workflow(
        name="고유번호증 발급",
        category="조합결성",
        trigger="신규 조합 제안 확정 시",
        duration="3~5일",
        steps=[
            ("조합규약(안) 작성", "D-day", 0, "2~3h", "Q1", None),
            ("고유번호증 발급 서류 준비", "D-day", 0, "1~2h", "Q1", None),
            ("고유번호증 발급 신청", "D+1", 1, "30m", "Q1", None),
            ("고유번호증 수령", "D+3~5", 3, "-", "Q1", None),
        ],
        documents=[
            "조합규약(안)",
            "단체의 대표자 또는 관리인 임을 확인할 수 있는 서류",
            "임대차 관련 서류 (임대차 계약서 or 무상사용 승낙서 or 전대차 동의서)",
        ],
    )
    add_workflow(
        name="수탁계약 체결",
        category="조합결성",
        trigger="고유번호증 발급 후",
        duration="3~5일",
        steps=[
            ("VICS 등록", "D-day", 0, "1~2h", "Q1", None),
            ("수탁계약 서류 준비", "D+1", 1, "1h", "Q1", None),
            ("수탁계약 체결", "D+2", 2, "1~2h", "Q1", None),
            ("계좌개설", "D+2", 2, "1h", "Q1", None),
        ],
        documents=[
            "고유번호증",
            "조합규약(안)",
            "사업자등록증 (본점)",
            "법인등기부등본 (3개월 이내)",
            "법인인감증명서 (3개월 이내)",
            "사용인감계",
        ],
        warnings=[
            "VICS 등록: 수탁계약 전 등록 완료 필수",
        ],
    )
    add_workflow(
        name="결성총회 개최",
        category="조합결성",
        trigger="수탁계약 체결 후",
        duration="2~3주",
        steps=[
            ("결성총회 공문 발송", "D+10", 10, "2~3h", "Q1", None),
            ("LP 서류 취합", "D+10~24", 10, "-", "Q1", None),
            ("출자금 납입 확인", "D+24", 24, "30m", "Q1", None),
            ("운용지시서 작성", "D+24", 24, "1h", "Q1", None),
            ("결성총회 개최", "D+25", 25, "1~2h", "Q1", None),
            ("총회 회람서류 전달", "D+25", 25, "1h", "Q1", None),
        ],
        documents=[
            "조합원 동의서",
            "개인정보 활용동의서",
            "고객거래확인서",
            "서면결의서",
            "인감증명서 (개인/법인, 3개월 이내)",
            "신분증 사본 / 등기부등본",
            "결성총회의사록",
            "출자금납입확인서",
            "조합원 명부",
            "자산보관·관리위탁 계약서",
            "조합분류기준표",
        ],
        warnings=[
            "출자금 납입: 결성총회 전 전액 납입 확인 필수",
            "LP 서류 수집: 최소 2주 전 공문 발송",
            "추가서류: LP 구성(집합투자기구, 창업기획자, LLC, 미성년자 등)에 따라 상이",
        ],
    )
    add_workflow(
        name="벤처투자조합 등록",
        category="조합결성",
        trigger="결성총회 완료 후",
        duration="3~5일",
        steps=[
            ("조합등록 서류 준비", "D+26", 26, "2~3h", "Q1", None),
            ("조합등록 신청", "D+27", 27, "1h", "Q1", None),
            ("등록 완료", "D+30~35", 30, "-", "Q1", None),
        ],
    )

    # regular_tasks.md (4)
    add_workflow(
        name="월간 보고 (농금원·벤처협회)",
        category="정기보고",
        trigger="매월 초",
        duration="매월 5일까지",
        steps=[
            ("농금원(농모태) 월보고 작성/제출", "매월 5일(내부) / 7일(공식)", 0, "1h", "Q1", "노션 참조"),
            ("벤처협회(VICS) 월보고 작성/제출", "매월 5일(내부) / 9일(공식)", 0, "1h", "Q1", "노션 참조"),
        ],
    )
    add_workflow(
        name="분기 내부보고회",
        category="정기보고",
        trigger="분기별",
        duration="약 2주",
        steps=[
            ("자료 취합", "D-10", -10, "-", "Q2", None),
            ("초안 준비", "D-5", -5, "조합당 2.5h", "Q2", None),
            ("내부보고회 진행", "D-day", 0, "1h", "Q1", None),
            ("회의록 작성", "D+2", 2, "2h", "Q1", None),
        ],
    )
    add_workflow(
        name="기말감사",
        category="연간업무",
        trigger="1~2월",
        duration="약 3개월",
        steps=[
            ("자료 준비 (매일)", "시작~마감", 0, "2h/일", "Q1", None),
            ("조합 출자증서 준비", "요청 시", 0, "-", "Q1", None),
            ("조합원 명부 준비", "요청 시", 0, "-", "Q1", None),
            ("금융결제원 기본정보 전송", "요청 시", 0, "30m", "Q1", None),
            ("co-gp 미흡분 확인", "전송 후", 0, "30m", "Q1", None),
            ("금융결제원 처리 결과 확인", "마감일", 0, "30m", "Q1", None),
            ("현장 감사 대응", "3월 초", 0, "-", "Q1", None),
        ],
        documents=[
            "본점 공인인증서",
            "사업자등록증 (본점)",
            "사업자등록증 (분점)",
            "거래 은행 및 지점 정보",
            "조합 출자증서",
            "조합원 명부",
        ],
        warnings=[
            "수수료 비용 주체: 회사로 지정",
            "미흡분은 co-gp에 요청",
        ],
    )
    add_workflow(
        name="정기 총회",
        category="연간업무",
        trigger="매년 3월",
        duration="약 4주",
        steps=[
            ("서류 작성", "3월 초", 0, "-", "Q1", "개최공문, 의안설명서, 영업보고서, 감사보고서"),
            ("소집 통지", "3월 중순", 0, "-", "Q1", None),
            ("총회 개최", "3월 하순", 0, "-", "Q1", None),
            ("의사록 작성", "총회 후 2일 이내", 2, "-", "Q1", None),
        ],
        documents=[
            "개최공문",
            "의안설명서",
            "영업보고서",
            "감사보고서",
        ],
    )
    add_workflow(
        name="조합 의사결정 시 LP 통지 및 보고",
        category="LP보고",
        trigger="조합 출자 요청 등록 시",
        duration="약 1~2주",
        steps=[
            ("출자요청 확정 및 회람 대상 점검", "D-day", 0, "30m", "Q1", "대상 LP, 금액, 납입기한 최종 확인"),
            ("LP 통지 공문 발송", "D-day", 0, "1h", "Q1", "출자요청 공문/납입 안내 발송"),
            ("LP 회신 및 문의 대응", "D+1", 1, "1h", "Q1", "문의사항 답변 및 발송 누락 점검"),
            ("납입 현황 점검 및 리마인드", "D+3", 3, "1h", "Q1", "미납 LP 대상 리마인드"),
            ("납입 결과 보고 및 마감", "D+7", 7, "30m", "Q1", "납입 완료율 및 예외사항 보고"),
        ],
        documents=[
            "출자금 납입 요청 공문",
            "LP별 납입 요청 내역",
            "납입 현황 점검표",
        ],
        warnings=[
            "규약상 통지기간(영업일) 준수 여부를 반드시 확인하세요.",
            "미납 LP 리마인드는 납입기한 전까지 반복 점검이 필요합니다.",
        ],
    )

    if workflows:
        db.add_all(workflows)
        db.commit()
        print(f"[seed] workflow templates: added ({len(workflows)})")
    else:
        print("[seed] workflow templates: no new templates")
    return db.query(Workflow).order_by(Workflow.id.asc()).all()

def seed_workflow_instances(
    db: Session,
    templates: list[Workflow],
    funds: list[Fund],
    investments: list[Investment],
) -> list[WorkflowInstance]:
    if db.query(WorkflowInstance).count() > 0:
        print("[seed] workflow instances: skip")
        return db.query(WorkflowInstance).order_by(WorkflowInstance.id.asc()).all()

    if not templates:
        print("[seed] workflow instances: skip (no templates)")
        return []

    today = date.today()
    by_name = {wf.name: wf for wf in templates}

    invest_workflow = by_name.get("투자심의위원회(투심위)", templates[0])
    notice_workflow = by_name.get("정기 총회", templates[-1])

    investment_a = investments[0] if investments else None
    fund_a = funds[0] if funds else None
    fund_b = funds[1] if len(funds) > 1 else fund_a

    instance_rows = [
        instantiate_workflow(
            db,
            invest_workflow,
            name="루스바이오 Follow-on 투자",
            trigger_date=today + timedelta(days=7),
            memo="상반기 후속 라운드",
            investment_id=investment_a.id if investment_a else None,
            company_id=investment_a.company_id if investment_a else None,
            fund_id=investment_a.fund_id if investment_a else (fund_a.id if fund_a else None),
        ),
        instantiate_workflow(
            db,
            notice_workflow,
            name="2호 조합 정기총회",
            trigger_date=today + timedelta(days=14),
            memo="정기총회 및 분기 보고",
            fund_id=fund_b.id if fund_b else None,
        ),
    ]
    if fund_a is not None:
        instance_rows.append(
            instantiate_workflow(
                db,
                notice_workflow,
                name="1호 조합 임시총회",
                trigger_date=today + timedelta(days=21),
                memo="규약 변경안 의결",
                fund_id=fund_a.id,
            )
        )

    print(f"[seed] workflow instances: created ({len(instance_rows)} rows)")
    return instance_rows


def seed_biz_reports(db: Session, funds: list[Fund]) -> list[BizReport]:
    ensure_biz_report_schema(db)

    if db.query(BizReport).count() > 0:
        print("[seed] biz reports: skip")
        return db.query(BizReport).order_by(BizReport.id.asc()).all()

    if len(funds) < 3:
        print("[seed] biz reports: skip (need at least 3 funds)")
        return []

    by_name = {fund.name: fund for fund in funds}
    rows = [
        BizReport(
            fund_id=by_name["미래투자조합"].id,
            report_year=2025,
            status="완료",
            submission_date=d("2026-03-15"),
            total_commitment=20203,
            total_paid_in=14142,
            total_invested=13500,
            total_distributed=2100,
            fund_nav=16200,
            irr=12.5,
            tvpi=1.30,
            dpi=0.40,
            market_overview="국내 초기투자 시장은 AI와 딥테크 중심으로 회복세를 보이고 있습니다.",
            portfolio_summary="핵심 포트폴리오 3개사가 계획 대비 상회하고 있습니다.",
            investment_activity="신규 2건, 후속 2건 집행",
            key_issues="후속 라운드 일정과 해외 확장 리스크 관리가 필요",
            outlook="다음 분기에는 신규 투자와 기존 포트폴리오 가치 제고를 병행할 계획",
        ),
        BizReport(
            fund_id=by_name["하이테크1호조합"].id,
            report_year=2025,
            status="작성중",
            total_commitment=2085,
            total_paid_in=1668,
            total_invested=1515,
            fund_nav=1900,
            irr=9.8,
            tvpi=1.15,
            dpi=0.20,
            market_overview="금리 안정화와 함께 후기 단계 거래가 점진적으로 회복 중입니다.",
        ),
        BizReport(
            fund_id=by_name["뉴챕터투자조합"].id,
            report_year=2025,
            status="검토중",
            submission_date=d("2026-02-20"),
            total_commitment=33400,
            total_paid_in=10020,
            total_invested=8690,
            fund_nav=9100,
            irr=11.2,
            tvpi=1.22,
            dpi=0.10,
            investment_activity="핀테크/모빌리티/AI 3건 투자 완료",
        ),
    ]
    db.add_all(rows)
    db.commit()
    print("[seed] biz reports: created")
    return db.query(BizReport).order_by(BizReport.id.asc()).all()


def seed_notice_periods(db: Session, funds: list[Fund]) -> list[FundNoticePeriod]:
    if db.query(FundNoticePeriod).count() > 0:
        print("[seed] fund notice periods: skip")
        return db.query(FundNoticePeriod).order_by(FundNoticePeriod.id.asc()).all()

    if len(funds) < 2:
        print("[seed] fund notice periods: skip (need at least 2 funds)")
        return []

    fund1 = funds[0]
    fund2 = funds[1]
    rows = [
        FundNoticePeriod(fund_id=fund1.id, notice_type="assembly", label="총회 소집 통지", business_days=14, memo="규약 제15조"),
        FundNoticePeriod(fund_id=fund1.id, notice_type="capital_call_initial", label="최초 출자금 납입 요청", business_days=10, memo="규약 제10조"),
        FundNoticePeriod(fund_id=fund1.id, notice_type="capital_call_additional", label="수시 출자금 납입 요청", business_days=10, memo="규약 제10조"),
        FundNoticePeriod(fund_id=fund1.id, notice_type="ic_agenda", label="투자심의 안건 통지", business_days=7, memo="규약 제15조"),
        FundNoticePeriod(fund_id=fund1.id, notice_type="distribution", label="분배 통지", business_days=5, memo="규약 제10조"),
        FundNoticePeriod(fund_id=fund2.id, notice_type="assembly", label="총회 소집 통지", business_days=10, memo="규약 제12조"),
        FundNoticePeriod(fund_id=fund2.id, notice_type="capital_call_additional", label="수시 출자금 납입 요청", business_days=14, memo="규약 제8조"),
        FundNoticePeriod(fund_id=fund2.id, notice_type="ic_agenda", label="투자심의 안건 통지", business_days=5, memo="규약 제12조"),
    ]
    db.add_all(rows)
    db.commit()
    print("[seed] fund notice periods: created")
    return db.query(FundNoticePeriod).order_by(FundNoticePeriod.id.asc()).all()


def seed_investment_documents(db: Session, investments: list[Investment]) -> list[InvestmentDocument]:
    if db.query(InvestmentDocument).count() > 0:
        print("[seed] investment documents: skip")
        return db.query(InvestmentDocument).order_by(InvestmentDocument.id.asc()).all()

    templates = [
        {"name": "투자계약서", "doc_type": "계약서", "status": "collected"},
        {"name": "주주간계약서", "doc_type": "계약서", "status": "collected"},
        {"name": "납입증명서", "doc_type": "증빙", "status": "pending", "due_date_offset": 30},
        {"name": "사업계획서", "doc_type": "사업자료", "status": "requested", "due_date_offset": 14},
    ]

    rows: list[InvestmentDocument] = []
    for investment in investments[:6]:
        base_date = investment.investment_date or date.today()
        for template in templates:
            due_date = None
            if "due_date_offset" in template:
                due_date = base_date + timedelta(days=int(template["due_date_offset"]))
            rows.append(
                InvestmentDocument(
                    investment_id=investment.id,
                    name=str(template["name"]),
                    doc_type=str(template["doc_type"]),
                    status=str(template["status"]),
                    due_date=due_date,
                )
            )

    db.add_all(rows)
    db.commit()
    print(f"[seed] investment documents: created ({len(rows)} rows)")
    return db.query(InvestmentDocument).order_by(InvestmentDocument.id.asc()).all()


def seed_valuations(db: Session, investments: list[Investment], funds: list[Fund], companies: list[PortfolioCompany]) -> list[Valuation]:
    if db.query(Valuation).count() > 0:
        print("[seed] valuations: skip")
        return db.query(Valuation).order_by(Valuation.id.asc()).all()

    fund_by_name = {f.name: f for f in funds}
    company_by_name = {c.name: c for c in companies}
    investment_by_pair = {(inv.fund_id, inv.company_id): inv for inv in investments}

    spec = [
        {"fund": "미래투자조합", "company": "루스바이오", "as_of": "2025-06-30", "value": 3200, "prev": 3000, "method": "최근거래가", "evaluator": "내부"},
        {"fund": "미래투자조합", "company": "루스바이오", "as_of": "2025-12-31", "value": 3800, "prev": 3200, "method": "최근거래가", "evaluator": "외부평가"},
        {"fund": "미래투자조합", "company": "클라우드체인", "as_of": "2025-12-31", "value": 2800, "prev": 2500, "method": "DCF", "evaluator": "내부"},
        {"fund": "하이테크1호조합", "company": "에이아이랩스", "as_of": "2025-12-31", "value": 2100, "prev": 1515, "method": "유사기업비교", "evaluator": "외부평가"},
        {"fund": "EX투자조합", "company": "핀테크원", "as_of": "2025-12-31", "value": 1400, "prev": 1100, "method": "DCF", "evaluator": "내부"},
        {"fund": "뉴챕터투자조합", "company": "모빌리티플러스", "as_of": "2025-12-31", "value": 3500, "prev": 3000, "method": "유사기업비교", "evaluator": "내부"},
    ]

    rows: list[Valuation] = []
    for row in spec:
        fund = fund_by_name.get(row["fund"])
        company = company_by_name.get(row["company"])
        if not fund or not company:
            continue
        inv = investment_by_pair.get((fund.id, company.id))
        if not inv:
            continue

        value = float(row["value"])
        prev = float(row["prev"])
        change_amount = value - prev
        change_pct = (change_amount / prev) * 100 if prev else None

        rows.append(
            Valuation(
                investment_id=inv.id,
                fund_id=fund.id,
                company_id=company.id,
                as_of_date=d(str(row["as_of"])),
                evaluator=str(row["evaluator"]),
                method=str(row["method"]),
                instrument=inv.instrument,
                value=value,
                prev_value=prev,
                change_amount=change_amount,
                change_pct=change_pct,
                basis="seeded valuation",
            )
        )

    db.add_all(rows)
    db.commit()
    print(f"[seed] valuations: created ({len(rows)} rows)")
    return db.query(Valuation).order_by(Valuation.id.asc()).all()


def seed_transactions(db: Session, investments: list[Investment], funds: list[Fund], companies: list[PortfolioCompany]) -> list[Transaction]:
    if db.query(Transaction).count() > 0:
        print("[seed] transactions: skip")
        return db.query(Transaction).order_by(Transaction.id.asc()).all()

    fund_by_name = {f.name: f for f in funds}
    company_by_name = {c.name: c for c in companies}
    investment_by_pair = {(inv.fund_id, inv.company_id): inv for inv in investments}

    spec = [
        {"fund": "미래투자조합", "company": "루스바이오", "date": "2024-09-15", "type": "투자", "amount": 3000, "balance_before": 0, "balance_after": 3000},
        {"fund": "미래투자조합", "company": "클라우드체인", "date": "2024-11-01", "type": "투자", "amount": 2500, "balance_before": 0, "balance_after": 2500},
        {"fund": "미래투자조합", "company": "루스바이오", "date": "2025-09-01", "type": "배당수령", "amount": -200, "balance_before": 3000, "balance_after": 3000, "realized_gain": 200},
        {"fund": "EX투자조합", "company": "핀테크원", "date": "2025-04-15", "type": "투자", "amount": 1100, "balance_before": 0, "balance_after": 1100},
        {"fund": "하이테크1호조합", "company": "에이아이랩스", "date": "2025-02-10", "type": "투자", "amount": 1515, "balance_before": 0, "balance_after": 1515},
    ]

    rows: list[Transaction] = []
    for row in spec:
        fund = fund_by_name.get(row["fund"])
        company = company_by_name.get(row["company"])
        if not fund or not company:
            continue
        inv = investment_by_pair.get((fund.id, company.id))
        if not inv:
            continue

        rows.append(
            Transaction(
                investment_id=inv.id,
                fund_id=fund.id,
                company_id=company.id,
                transaction_date=d(str(row["date"])),
                type=str(row["type"]),
                amount=float(row["amount"]),
                balance_before=float(row.get("balance_before") or 0),
                balance_after=float(row.get("balance_after") or 0),
                realized_gain=float(row.get("realized_gain") or 0),
                memo="seeded transaction",
            )
        )

    db.add_all(rows)
    db.commit()
    print(f"[seed] transactions: created ({len(rows)} rows)")
    return db.query(Transaction).order_by(Transaction.id.asc()).all()


def seed_calendar_events(db: Session, tasks: list[Task]) -> list[CalendarEvent]:
    if db.query(CalendarEvent).count() > 0:
        print("[seed] calendar events: skip")
        return db.query(CalendarEvent).order_by(CalendarEvent.id.asc()).all()

    today = date.today()
    task_ids = [task.id for task in tasks[:4]]
    spec = [
        {"title": "투자위원회 정기회의", "date_offset": 3, "time": "10:00", "duration": 120, "status": "pending", "task_id": task_ids[0] if len(task_ids) > 0 else None},
        {"title": "LP 간담회", "date_offset": 7, "time": "14:00", "duration": 90, "status": "pending", "task_id": task_ids[1] if len(task_ids) > 1 else None},
        {"title": "포트폴리오 데이", "date_offset": 14, "time": "09:30", "duration": 480, "description": "전체 포트폴리오 기업 발표", "status": "pending"},
        {"title": "농금원 실사 대비 미팅", "date_offset": 10, "time": "15:00", "duration": 60, "status": "pending"},
        {"title": "분기 실적 마감", "date_offset": 21, "time": None, "duration": None, "status": "pending"},
        {"title": "벤처협회 교육", "date_offset": 5, "time": "13:00", "duration": 180, "status": "pending"},
        {"title": "주간 투자위원회", "date_offset": 28, "time": "10:00", "duration": 120, "status": "pending", "task_id": task_ids[2] if len(task_ids) > 2 else None},
        {"title": "조합 결산 미팅", "date_offset": 35, "time": "14:00", "duration": 90, "status": "pending", "task_id": task_ids[3] if len(task_ids) > 3 else None},
    ]

    rows: list[CalendarEvent] = []
    for row in spec:
        rows.append(
            CalendarEvent(
                title=str(row["title"]),
                date=today + timedelta(days=int(row["date_offset"])),
                time=time.fromisoformat(row["time"]) if row.get("time") else None,
                duration=row.get("duration"),
                description=row.get("description"),
                status=str(row.get("status") or "pending"),
                task_id=row.get("task_id"),
            )
        )

    db.add_all(rows)
    db.commit()
    print(f"[seed] calendar events: created ({len(rows)} rows)")
    return db.query(CalendarEvent).order_by(CalendarEvent.id.asc()).all()


def seed_regular_reports(db: Session, funds: list[Fund]) -> list[RegularReport]:
    if db.query(RegularReport).count() > 0:
        print("[seed] regular reports: skip")
        return db.query(RegularReport).order_by(RegularReport.id.asc()).all()

    by_name = {fund.name: fund for fund in funds}
    rows = [
        RegularReport(report_target="농금원", fund_id=by_name["미래투자조합"].id, period="2026-01", due_date=d("2026-02-05"), status="전송완료", submitted_date=d("2026-02-03")),
        RegularReport(report_target="농금원", fund_id=by_name["EX투자조합"].id, period="2026-01", due_date=d("2026-02-05"), status="전송완료", submitted_date=d("2026-02-04")),
        RegularReport(report_target="농금원", fund_id=by_name["밸류체인펀드"].id, period="2026-01", due_date=d("2026-02-05"), status="예정"),
        RegularReport(report_target="벤처협회", fund_id=None, period="2026-01 VICS", due_date=d("2026-02-10"), status="예정"),
        RegularReport(report_target="농금원", fund_id=by_name["미래투자조합"].id, period="2026-02", due_date=d("2026-03-05"), status="예정"),
        RegularReport(report_target="농금원", fund_id=by_name["EX투자조합"].id, period="2026-02", due_date=d("2026-03-05"), status="예정"),
        RegularReport(report_target="벤처협회", fund_id=None, period="2026-02 VICS", due_date=d("2026-03-10"), status="예정"),
    ]
    db.add_all(rows)
    db.commit()
    print(f"[seed] regular reports: created ({len(rows)} rows)")
    return db.query(RegularReport).order_by(RegularReport.id.asc()).all()


def seed_checklists(db: Session, investments: list[Investment]) -> list[Checklist]:
    if db.query(Checklist).count() > 0 or db.query(ChecklistItem).count() > 0:
        print("[seed] checklists: skip")
        return db.query(Checklist).order_by(Checklist.id.asc()).all()

    inv_a = investments[0] if investments else None
    inv_b = investments[9] if len(investments) > 9 else None

    rows = [
        Checklist(name="투자 실행 서류 체크리스트", category="투자", investment_id=inv_a.id if inv_a else None),
        Checklist(name="LP 보고 체크리스트", category="보고", investment_id=None),
        Checklist(name="사후관리 체크리스트", category="사후관리", investment_id=inv_b.id if inv_b else None),
    ]

    rows[0].items = [
        ChecklistItem(order=1, name="투자심의의결서", required=True, checked=True),
        ChecklistItem(order=2, name="투자계약서", required=True, checked=True),
        ChecklistItem(order=3, name="주주간계약서", required=True, checked=False),
        ChecklistItem(order=4, name="납입증명서", required=True, checked=False),
        ChecklistItem(order=5, name="등기부등본", required=False, checked=False, notes="법인등기 확인 필요"),
    ]
    rows[1].items = [
        ChecklistItem(order=1, name="운용보고서 초안", required=True, checked=False),
        ChecklistItem(order=2, name="재무지표 첨부", required=True, checked=False),
        ChecklistItem(order=3, name="투자성과 요약", required=True, checked=False),
    ]
    rows[2].items = [
        ChecklistItem(order=1, name="분기실적 수령", required=True, checked=True),
        ChecklistItem(order=2, name="이사회 참석", required=False, checked=True),
        ChecklistItem(order=3, name="주요 경영현황 확인", required=True, checked=False),
        ChecklistItem(order=4, name="자금사용보고서 수령", required=True, checked=False),
    ]

    db.add_all(rows)
    db.commit()
    print(f"[seed] checklists: created ({len(rows)} rows)")
    return db.query(Checklist).order_by(Checklist.id.asc()).all()


def seed_assemblies(db: Session, funds: list[Fund]) -> list[Assembly]:
    if db.query(Assembly).count() > 0:
        print("[seed] assemblies: skip")
        return db.query(Assembly).order_by(Assembly.id.asc()).all()

    by_name = {fund.name: fund for fund in funds}
    rows = [
        Assembly(fund_id=by_name["미래투자조합"].id, type="정기", date=d("2025-03-25"), agenda="2024 사업보고 및 결산 승인", status="completed", minutes_completed=1),
        Assembly(fund_id=by_name["하이테크1호조합"].id, type="정기", date=d("2025-03-28"), agenda="2024 결산 승인", status="completed", minutes_completed=1),
        Assembly(fund_id=by_name["미래투자조합"].id, type="임시", date=d("2026-03-15"), agenda="규약 변경안 의결", status="planned", minutes_completed=0),
        Assembly(fund_id=by_name["뉴챕터투자조합"].id, type="정기", date=d("2026-03-20"), agenda="2025 사업보고 및 결산 승인", status="planned", minutes_completed=0),
    ]

    db.add_all(rows)
    db.commit()
    print(f"[seed] assemblies: created ({len(rows)} rows)")
    return db.query(Assembly).order_by(Assembly.id.asc()).all()


def seed_distributions(db: Session, funds: list[Fund], lps: list[LP]) -> list[Distribution]:
    if db.query(Distribution).count() > 0 or db.query(DistributionItem).count() > 0:
        print("[seed] distributions: skip")
        return db.query(Distribution).order_by(Distribution.id.asc()).all()

    by_name = {fund.name: fund for fund in funds}
    fund = by_name.get("미래투자조합")
    if not fund:
        print("[seed] distributions: skip (missing fund)")
        return []

    lp_inst = next((lp for lp in lps if lp.fund_id == fund.id and lp.type == "기관"), None)
    lp_gp = next((lp for lp in lps if lp.fund_id == fund.id and lp.type == "GP"), None)
    if not lp_inst or not lp_gp:
        print("[seed] distributions: skip (missing LP)")
        return []

    dist = Distribution(
        fund_id=fund.id,
        dist_date=d("2025-09-01"),
        dist_type="이익분배",
        principal_total=0,
        profit_total=2100,
        performance_fee=420,
        memo="seeded distribution",
    )
    db.add(dist)
    db.flush()

    db.add_all([
        DistributionItem(distribution_id=dist.id, lp_id=lp_inst.id, principal=0, profit=1680),
        DistributionItem(distribution_id=dist.id, lp_id=lp_gp.id, principal=0, profit=420),
    ])

    db.commit()
    print("[seed] distributions: created (1 row)")
    return db.query(Distribution).order_by(Distribution.id.asc()).all()


def seed_exit_committees(db: Session, companies: list[PortfolioCompany], investments: list[Investment], funds: list[Fund]) -> list[ExitCommittee]:
    if db.query(ExitCommittee).count() > 0 or db.query(ExitTrade).count() > 0:
        print("[seed] exit committees: skip")
        return db.query(ExitCommittee).order_by(ExitCommittee.id.asc()).all()

    company_by_name = {c.name: c for c in companies}
    fund_by_name = {f.name: f for f in funds}

    company = company_by_name.get("그린에너지")
    fund = fund_by_name.get("미래투자조합")
    if not company or not fund:
        print("[seed] exit committees: skip (missing company/fund)")
        return []

    investment = next((inv for inv in investments if inv.fund_id == fund.id and inv.company_id == company.id), None)
    if not investment:
        print("[seed] exit committees: skip (missing investment)")
        return []

    committee = ExitCommittee(
        company_id=company.id,
        status="completed",
        meeting_date=d("2025-11-20"),
        agenda="그린에너지 지분 매각 검토",
        exit_strategy="구주매출",
        vote_result="매각 승인",
        analyst_opinion="목표 수익률 달성으로 매각 적정",
    )
    db.add(committee)
    db.flush()

    db.add(ExitCommitteeFund(exit_committee_id=committee.id, fund_id=fund.id, investment_id=investment.id))
    db.add(
        ExitTrade(
            exit_committee_id=committee.id,
            investment_id=investment.id,
            fund_id=fund.id,
            company_id=company.id,
            exit_type="구주매출",
            trade_date=d("2025-12-15"),
            amount=2400,
            net_amount=2300,
            realized_gain=500,
            fees=100,
            memo="seeded exit trade",
        )
    )

    db.commit()
    print("[seed] exit committees/trades: created")
    return db.query(ExitCommittee).order_by(ExitCommittee.id.asc()).all()


def seed_journal_entries(db: Session, funds: list[Fund]) -> list[JournalEntry]:
    if db.query(JournalEntry).count() > 0:
        print("[seed] journal entries: skip")
        return db.query(JournalEntry).order_by(JournalEntry.id.asc()).all()

    by_name = {fund.name: fund for fund in funds}
    fund = by_name.get("미래투자조합")
    if not fund:
        print("[seed] journal entries: skip (missing fund)")
        return []

    account_by_code = {acc.code: acc for acc in db.query(Account).all()}
    cash = account_by_code.get("101")
    equity_invest = account_by_code.get("111")
    gain = account_by_code.get("401")
    if not cash or not equity_invest or not gain:
        print("[seed] journal entries: skip (missing accounts)")
        return []

    entry1 = JournalEntry(fund_id=fund.id, entry_date=d("2024-09-15"), entry_type="투자분개", description="루스바이오 투자 집행", status="결재완료")
    db.add(entry1)
    db.flush()
    db.add_all([
        JournalEntryLine(journal_entry_id=entry1.id, account_id=equity_invest.id, debit=3000, credit=0, memo="루스바이오 투자"),
        JournalEntryLine(journal_entry_id=entry1.id, account_id=cash.id, debit=0, credit=3000, memo="현금 지출"),
    ])

    entry2 = JournalEntry(fund_id=fund.id, entry_date=d("2025-09-01"), entry_type="배당수익", description="루스바이오 배당 수령", status="결재완료")
    db.add(entry2)
    db.flush()
    db.add_all([
        JournalEntryLine(journal_entry_id=entry2.id, account_id=cash.id, debit=200, credit=0, memo="배당금 입금"),
        JournalEntryLine(journal_entry_id=entry2.id, account_id=gain.id, debit=0, credit=200, memo="투자수익 인식"),
    ])

    db.commit()
    print("[seed] journal entries: created (2 rows)")
    return db.query(JournalEntry).order_by(JournalEntry.id.asc()).all()


def seed_vote_records(db: Session, companies: list[PortfolioCompany], investments: list[Investment]) -> list[VoteRecord]:
    if db.query(VoteRecord).count() > 0:
        print("[seed] vote records: skip")
        return db.query(VoteRecord).order_by(VoteRecord.id.asc()).all()

    company_by_name = {c.name: c for c in companies}
    fund_by_name = {f.name: f for f in db.query(Fund).all()}

    def find_investment(fund_name: str, company_name: str) -> Investment | None:
        fund = fund_by_name.get(fund_name)
        company = company_by_name.get(company_name)
        if not fund or not company:
            return None
        return next((inv for inv in investments if inv.fund_id == fund.id and inv.company_id == company.id), None)

    inv1 = find_investment("미래투자조합", "루스바이오")
    inv2 = find_investment("하이테크1호조합", "에이아이랩스")
    inv3 = find_investment("EX투자조합", "핀테크원")

    rows: list[VoteRecord] = []
    if inv1:
        rows.append(VoteRecord(company_id=inv1.company_id, investment_id=inv1.id, vote_type="주주총회", date=d("2025-03-20"), agenda="이사 선임 건", decision="찬성"))
    if inv2:
        rows.append(VoteRecord(company_id=inv2.company_id, investment_id=inv2.id, vote_type="이사회", date=d("2025-06-15"), agenda="유상증자 건", decision="찬성"))
    if inv3:
        rows.append(VoteRecord(company_id=inv3.company_id, investment_id=inv3.id, vote_type="주주총회", date=d("2025-09-10"), agenda="정관 변경의 건", decision="찬성"))

    db.add_all(rows)
    db.commit()
    print(f"[seed] vote records: created ({len(rows)} rows)")
    return db.query(VoteRecord).order_by(VoteRecord.id.asc()).all()


def seed_all(db: Session) -> None:
    ensure_fund_schema(db)
    ensure_biz_report_schema(db)
    ensure_task_schema(db)
    reset_seed_data_if_requested(db)
    seed_accounts(db)

    funds = seed_funds(db)
    lps = seed_lps(db, funds)
    seed_capital_calls(db, funds, lps)

    companies = seed_companies(db)
    investments = seed_investments(db, funds, companies)

    seed_investment_documents(db, investments)
    seed_valuations(db, investments, funds, companies)
    seed_transactions(db, investments, funds, companies)

    tasks = seed_tasks(db, funds, investments)
    seed_calendar_events(db, tasks)

    templates = seed_workflow_templates(db)
    seed_document_templates(db)
    seed_workflow_instances(db, templates, funds, investments)

    seed_biz_reports(db, funds)
    seed_notice_periods(db, funds)
    seed_regular_reports(db, funds)
    seed_checklists(db, investments)
    seed_assemblies(db, funds)
    seed_distributions(db, funds, lps)
    seed_exit_committees(db, companies, investments, funds)
    seed_journal_entries(db, funds)
    seed_vote_records(db, companies, investments)
    normalize_currency_units_to_won(db)

def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_all(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
