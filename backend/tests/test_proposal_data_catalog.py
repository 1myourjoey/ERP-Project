from services.proposal_data import _catalog_for_template, _sheet_rows_for_export


def _catalog_item(template_type: str, code: str) -> dict:
    return next(item for item in _catalog_for_template(template_type) if item["code"] == code)


def test_growth_finance_catalog_matches_reference_labels():
    proposal_fund = _catalog_item("growth-finance", "proposal-fund")
    investment_history = _catalog_item("growth-finance", "investment-history")
    manager_careers = _catalog_item("growth-finance", "manager-careers-core")
    manager_investments = _catalog_item("growth-finance", "manager-investments-core")

    assert proposal_fund["title"] == "1.1.제안펀드"
    assert investment_history["title"] == "1.2.출자예상내역"
    assert investment_history["columns"][-1] == ("commitment", "출자약정예상액")
    assert manager_careers["title"] == "3.4.1.핵심운용인력 경력"
    assert manager_investments["title"] == "3.2.1.핵심운용인력 투자현황"


def test_other_templates_use_updated_titles_and_labels():
    motae5_shareholders = _catalog_item("motae-5", "shareholder-summary")
    motae6_recovery = _catalog_item("motae-6", "representative-recovery")
    motae7_profile = _catalog_item("motae-7", "representative-profile")
    nong_key_shareholders = _catalog_item("nong-motae", "key-shareholders")

    assert motae5_shareholders["title"] == "3. 주주 및 출자자 명부"
    assert motae5_shareholders["columns"][2] == ("acquisition_amount", "납입액")
    assert motae6_recovery["title"] == "1. 대표펀드매니저 투자회수실적"
    assert motae7_profile["title"] == "2. 참여인력(대표) 이력"
    assert nong_key_shareholders["title"] == "(별첨8) 제안사 주주명부 및 조합 출자자명부"
    assert nong_key_shareholders["columns"][2] == ("acquisition_amount", "납입액")


def test_sheet_rows_for_export_uses_updated_table_labels():
    investment_history = _catalog_item("growth-finance", "investment-history")
    sheet_view = {
        "kind": "table",
        "columns": [{"key": key, "label": label} for key, label in investment_history["columns"]],
        "rows": [
            {
                "final_cells": {
                    "lp_type": "정책출자자",
                    "lp_name": "IBK",
                    "commitment": 20_000,
                }
            }
        ],
    }

    headers, rows = _sheet_rows_for_export(sheet_view)

    assert headers == ["출자자유형", "출자자명", "출자약정예상액"]
    assert rows == [["정책출자자", "IBK", 20_000]]


def test_sheet_rows_for_export_uses_updated_scalar_labels():
    gp_overview = _catalog_item("growth-finance", "gp-overview")
    sheet_view = {
        "kind": "scalar",
        "fields": [
            {"label": label, "final_value": f"value-{index}", "source": "테스트"}
            for index, (_, label) in enumerate(gp_overview["columns"], start=1)
        ],
    }

    headers, rows = _sheet_rows_for_export(sheet_view)

    assert headers == ["항목", "값", "출처"]
    assert rows[0] == ["제안사명", "value-1", "테스트"]
    assert rows[-1] == ["납입자본금", "value-9", "테스트"]
