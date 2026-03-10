from datetime import date

from models.fund import Fund
from models.gp_entity import GPEntity
from models.proposal_data import (
    FundManager,
    FundManagerHistory,
    FundSubscription,
    GPFinancial,
    GPShareholder,
    ManagerAward,
    ManagerCareer,
    ManagerEducation,
    ManagerInvestment,
)
from services.proposal_data import _base_sheet_defs_for_workbench, resolve_proposal_workspace


AS_OF_DATE = date(2025, 12, 31)


def _sheet(workspace: dict, db_session, code: str) -> dict:
    return next(item for item in _base_sheet_defs_for_workbench(workspace, db_session) if item["code"] == code)


def _seed_proposal_domain(db_session) -> dict:
    gp = GPEntity(
        name="테스트 GP",
        entity_type="vc",
        business_number="123-45-67890",
        registration_number="110111-1234567",
        representative="홍대표",
        address="서울시 강남구",
        founding_date=date(2018, 1, 1),
        total_employees=12,
        fund_manager_count=3,
        paid_in_capital=500_000_000,
        is_primary=1,
    )
    db_session.add(gp)
    db_session.flush()

    fund_primary = Fund(
        name="선택펀드",
        type="벤처투자조합",
        status="active",
        gp_entity_id=gp.id,
        gp=gp.name,
        fund_manager="대표매니저",
        has_co_gp=True,
        co_gp="공동GP",
        commitment_total=1_000_000_000,
        formation_date=date(2025, 1, 1),
        registration_date=date(2025, 1, 10),
        investment_period_end=date(2028, 1, 1),
        maturity_date=date(2030, 1, 1),
    )
    fund_history = Fund(
        name="과거펀드",
        type="신기술사업투자조합",
        status="liquidating",
        gp_entity_id=gp.id,
        gp=gp.name,
        fund_manager="핵심매니저",
        commitment_total=2_000_000_000,
        formation_date=date(2020, 1, 1),
        registration_date=date(2020, 1, 5),
        investment_period_end=date(2024, 12, 31),
        maturity_date=date(2027, 1, 1),
    )
    fund_secondary = Fund(
        name="농모태후보",
        type="농식품투자조합",
        status="forming",
        gp_entity_id=gp.id,
        gp=gp.name,
        fund_manager="대표매니저",
        commitment_total=3_000_000_000,
        formation_date=date(2026, 1, 1),
        registration_date=date(2026, 1, 3),
        maturity_date=date(2032, 1, 1),
    )
    db_session.add_all([fund_primary, fund_history, fund_secondary])
    db_session.flush()

    db_session.add(
        GPFinancial(
            gp_entity_id=gp.id,
            fiscal_year_end=date(2025, 12, 31),
            total_assets=9_000_000_000,
            current_assets=3_000_000_000,
            total_liabilities=2_000_000_000,
            current_liabilities=500_000_000,
            total_equity=7_000_000_000,
            paid_in_capital=600_000_000,
            revenue=1_000_000_000,
            operating_income=300_000_000,
            net_income=250_000_000,
        )
    )
    db_session.add_all(
        [
            GPShareholder(
                gp_entity_id=gp.id,
                snapshot_date=date(2024, 12, 31),
                name="구주주",
                shares=100,
                acquisition_amount=100_000_000,
                ownership_pct=10.0,
            ),
            GPShareholder(
                gp_entity_id=gp.id,
                snapshot_date=date(2025, 12, 31),
                name="최신주주",
                shares=120,
                acquisition_amount=150_000_000,
                ownership_pct=12.0,
            ),
        ]
    )

    representative = FundManager(
        gp_entity_id=gp.id,
        name="대표매니저",
        position="대표",
        join_date=date(2020, 1, 1),
        is_representative=True,
    )
    core = FundManager(
        gp_entity_id=gp.id,
        name="핵심매니저",
        position="이사",
        join_date=date(2021, 1, 1),
        is_core=True,
    )
    general = FundManager(
        gp_entity_id=gp.id,
        name="일반매니저",
        position="심사역",
        join_date=date(2022, 1, 1),
    )
    db_session.add_all([representative, core, general])
    db_session.flush()

    db_session.add_all(
        [
            ManagerCareer(
                fund_manager_id=representative.id,
                company_name="테스트 GP",
                company_type="VC",
                department="투자본부",
                position="대표",
                start_date=date(2020, 1, 1),
                main_task="총괄",
                is_investment_exp=True,
                employment_type="상근",
            ),
            ManagerCareer(
                fund_manager_id=core.id,
                company_name="이전회사",
                company_type="VC",
                department="심사팀",
                position="차장",
                start_date=date(2018, 1, 1),
                end_date=date(2022, 12, 31),
                main_task="초기 심사",
                is_investment_exp=True,
                employment_type="상근",
            ),
            ManagerCareer(
                fund_manager_id=core.id,
                company_name="현재회사",
                company_type="VC",
                department="투자팀",
                position="이사",
                start_date=date(2023, 1, 1),
                main_task="투자 총괄",
                is_investment_exp=True,
                employment_type="상근",
            ),
            ManagerCareer(
                fund_manager_id=general.id,
                company_name="테스트 GP",
                company_type="VC",
                department="투자팀",
                position="심사역",
                start_date=date(2022, 1, 1),
                main_task="실무",
                is_investment_exp=True,
                employment_type="상근",
            ),
        ]
    )
    db_session.add_all(
        [
            ManagerEducation(
                fund_manager_id=core.id,
                school_name="이전학교",
                major="경제학",
                degree="학사",
                admission_date=date(2002, 3, 1),
                graduation_date=date(2006, 2, 28),
                country="대한민국",
            ),
            ManagerEducation(
                fund_manager_id=core.id,
                school_name="최신학교",
                major="경영학",
                degree="석사",
                admission_date=date(2010, 3, 1),
                graduation_date=date(2012, 2, 28),
                country="대한민국",
            ),
        ]
    )
    db_session.add_all(
        [
            ManagerAward(
                fund_manager_id=core.id,
                award_date=date(2022, 1, 1),
                award_name="이전수상",
            ),
            ManagerAward(
                fund_manager_id=core.id,
                award_date=date(2024, 1, 1),
                award_name="최신수상",
            ),
        ]
    )
    db_session.add_all(
        [
            ManagerInvestment(
                fund_manager_id=representative.id,
                fund_id=fund_primary.id,
                source_company_name="테스트 GP",
                company_name="포트폴리오A",
                investment_date=date(2025, 2, 1),
                instrument="보통주",
                amount=100_000_000,
                role="대표",
                is_current_company=True,
            ),
            ManagerInvestment(
                fund_manager_id=core.id,
                fund_id=fund_history.id,
                source_company_name="이전회사",
                company_name="포트폴리오B",
                investment_date=date(2023, 5, 1),
                instrument="RCPS",
                amount=200_000_000,
                exit_date=date(2025, 6, 1),
                exit_amount=150_000_000,
                role="핵심",
                discovery_contrib=40,
                review_contrib=60,
                contrib_rate=50,
                is_current_company=False,
            ),
            ManagerInvestment(
                fund_manager_id=general.id,
                fund_id=fund_primary.id,
                source_company_name="테스트 GP",
                company_name="포트폴리오C",
                investment_date=date(2024, 7, 1),
                instrument="CB",
                amount=80_000_000,
                exit_date=date(2025, 7, 1),
                exit_amount=20_000_000,
                role="팀원",
                discovery_contrib=10,
                review_contrib=20,
                contrib_rate=30,
                is_current_company=True,
            ),
        ]
    )
    db_session.add(
        FundManagerHistory(
            fund_id=fund_primary.id,
            fund_manager_id=core.id,
            change_date=date(2025, 3, 1),
            change_type="선임",
            role_after="핵심운용인력",
        )
    )
    db_session.add_all(
        [
            FundSubscription(
                fund_id=fund_primary.id,
                subscription_type="출자사업",
                subscription_date=date(2025, 1, 15),
                target_irr=8.5,
            ),
            FundSubscription(
                fund_id=fund_primary.id,
                subscription_type="출자사업",
                subscription_date=date(2025, 4, 15),
                target_irr=9.2,
            ),
            FundSubscription(
                fund_id=fund_secondary.id,
                subscription_type="출자사업",
                subscription_date=date(2025, 8, 1),
                target_irr=10.0,
            ),
        ]
    )
    db_session.commit()

    return {
        "gp": gp,
        "fund_primary": fund_primary,
        "fund_history": fund_history,
        "fund_secondary": fund_secondary,
        "representative": representative,
        "core": core,
        "general": general,
    }


def _workspace(db_session, *, template_type: str, gp_id: int, fund_ids: list[int]) -> dict:
    return resolve_proposal_workspace(
        db_session,
        template_type=template_type,
        as_of_date=AS_OF_DATE,
        gp_entity_id=gp_id,
        fund_ids=fund_ids,
        auto_select_default_gp=False,
        auto_select_all_funds=False,
    )


def test_growth_finance_core_career_sheet_keeps_historical_rows(db_session):
    seeded = _seed_proposal_domain(db_session)
    workspace = _workspace(
        db_session,
        template_type="growth-finance",
        gp_id=seeded["gp"].id,
        fund_ids=[seeded["fund_primary"].id],
    )

    core_careers = _sheet(workspace, db_session, "manager-careers-core")

    assert len(core_careers["rows"]) == 2
    assert core_careers["rows"][0][0] == "현재회사"
    assert core_careers["rows"][1][0] == "이전회사"


def test_motae5_uses_dynamic_co_gp_and_latest_shareholder_snapshot(db_session):
    seeded = _seed_proposal_domain(db_session)
    workspace = _workspace(
        db_session,
        template_type="motae-5",
        gp_id=seeded["gp"].id,
        fund_ids=[seeded["fund_primary"].id],
    )

    subscription_summary = _sheet(workspace, db_session, "subscription-summary")
    shareholder_summary = _sheet(workspace, db_session, "shareholder-summary")

    assert subscription_summary["rows"][0][4] is True
    assert subscription_summary["rows"][0][2] == "2025-04-15"
    assert shareholder_summary["rows"] == [["최신주주", 120, 150_000_000, 12.0, None]]


def test_motae6_backfills_related_fund_type_and_splits_representative_rows(db_session):
    seeded = _seed_proposal_domain(db_session)
    workspace = _workspace(
        db_session,
        template_type="motae-6",
        gp_id=seeded["gp"].id,
        fund_ids=[seeded["fund_primary"].id],
    )

    representative_sheet = _sheet(workspace, db_session, "representative-recovery")
    manager_sheet = _sheet(workspace, db_session, "manager-recovery")

    assert representative_sheet["rows"] == [[
        "대표매니저",
        "테스트 GP",
        "선택펀드",
        "벤처투자조합",
        True,
        "포트폴리오A",
        "보통주",
        None,
        None,
        "2025-02-01",
    ]]
    historical_row = next(row for row in manager_sheet["rows"] if row[2] == "과거펀드")
    assert historical_row[3] == "신기술사업투자조합"


def test_motae7_uses_latest_profile_records_and_separates_representative_from_core(db_session):
    seeded = _seed_proposal_domain(db_session)
    workspace = _workspace(
        db_session,
        template_type="motae-7",
        gp_id=seeded["gp"].id,
        fund_ids=[seeded["fund_primary"].id],
    )

    representative_profile = _sheet(workspace, db_session, "representative-profile")
    core_profile = _sheet(workspace, db_session, "core-profile")

    assert [row[0] for row in representative_profile["rows"]] == ["대표매니저"]
    assert [row[0] for row in core_profile["rows"]] == ["핵심매니저"]
    assert core_profile["rows"][0][6] == "최신수상"
    assert core_profile["rows"][0][8] == "최신학교"
    assert core_profile["rows"][0][12] == "현재회사"


def test_nong_motae_requires_single_selected_fund_for_scalar_fields_and_keeps_id_mapping(db_session):
    seeded = _seed_proposal_domain(db_session)
    workspace = _workspace(
        db_session,
        template_type="nong-motae",
        gp_id=seeded["gp"].id,
        fund_ids=[seeded["fund_primary"].id, seeded["fund_secondary"].id],
    )

    application_form = _sheet(workspace, db_session, "application-form")
    subscription_history = _sheet(workspace, db_session, "manager-subscription-history")

    assert application_form["rows"][0][8] is None
    assert application_form["rows"][0][9] is None
    assert application_form["rows"][0][10] == "대표매니저"
    historical_row = next(row for row in subscription_history["rows"] if row[2] == "과거펀드")
    assert historical_row[3] == 2_000_000_000
