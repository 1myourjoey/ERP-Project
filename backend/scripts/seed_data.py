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
from services.workflow_service import instantiate_workflow


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
    if db.query(Workflow).count() > 0:
        print("[seed] workflow templates: skip")
        return db.query(Workflow).order_by(Workflow.id.asc()).all()

    invest = Workflow(
        name="투자 실행 워크플로우",
        trigger_description="투자위원회 통과 후 계약/납입/사후관리",
        category="investment",
        total_duration="D-7 ~ D+5",
    )
    invest.steps = [
        WorkflowStep(order=1, name="투자심의위원회 안건 준비", timing="D-7", timing_offset_days=-7, estimated_time="2h", quadrant="Q1", memo="notice:ic_agenda"),
        WorkflowStep(order=2, name="계약서 초안 검토", timing="D-5", timing_offset_days=-5, estimated_time="2h", quadrant="Q1"),
        WorkflowStep(order=3, name="투자심의위원회 개최", timing="D-3", timing_offset_days=-3, estimated_time="1h", quadrant="Q1"),
        WorkflowStep(order=4, name="투자 계약 체결", timing="D-day", timing_offset_days=0, estimated_time="1h", quadrant="Q1"),
        WorkflowStep(order=5, name="납입 및 공시", timing="D+1", timing_offset_days=1, estimated_time="1h", quadrant="Q1"),
        WorkflowStep(order=6, name="사후 등록", timing="D+3", timing_offset_days=3, estimated_time="1h", quadrant="Q2"),
    ]
    invest.documents = [
        WorkflowDocument(name="투자심의 의결서", required=True, notes="위원회 의결 결과"),
        WorkflowDocument(name="주주간계약서", required=True),
        WorkflowDocument(name="투자계약서", required=True),
        WorkflowDocument(name="납입증명서", required=True),
    ]
    invest.warnings = [
        WorkflowWarning(content="계약서 조항은 법무 검토를 반드시 거쳐야 합니다.", category="warning"),
        WorkflowWarning(content="투자 조건 변경 시 LP 사전 공지가 필요합니다.", category="tip"),
    ]

    lp_notice = Workflow(
        name="LP 보고/통지 워크플로우",
        trigger_description="조합 의사결정 시 LP 통지 및 보고",
        category="fund_ops",
        total_duration="D-14 ~ D+2",
    )
    lp_notice.steps = [
        WorkflowStep(order=1, name="총회 소집 통지", timing="D-14", timing_offset_days=-14, estimated_time="1h", quadrant="Q1", memo="notice:assembly"),
        WorkflowStep(order=2, name="배포자료 작성", timing="D-7", timing_offset_days=-7, estimated_time="2h", quadrant="Q2"),
        WorkflowStep(order=3, name="총회 개최", timing="D-day", timing_offset_days=0, estimated_time="2h", quadrant="Q1"),
        WorkflowStep(order=4, name="회의록 정리", timing="D+2", timing_offset_days=2, estimated_time="1h", quadrant="Q1"),
    ]
    lp_notice.documents = [
        WorkflowDocument(name="소집 통지문", required=True),
        WorkflowDocument(name="총회 자료집", required=True),
        WorkflowDocument(name="회의록", required=True),
    ]
    lp_notice.warnings = [
        WorkflowWarning(content="규약상 통지기한을 준수해야 합니다.", category="warning"),
    ]

    db.add_all([invest, lp_notice])
    db.commit()
    print("[seed] workflow templates: created")
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

    invest_workflow = by_name.get("투자 실행 워크플로우", templates[0])
    notice_workflow = by_name.get("LP 보고/통지 워크플로우", templates[-1])

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

def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_all(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()


