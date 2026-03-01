from __future__ import annotations

from sqlalchemy.orm import Session

from models.accounting import Account
from models.fund import Fund

FUND_STANDARD_ACCOUNTS = [
    # Assets
    {"code": "1100000", "name": "유동자산", "category": "자산", "sub_category": "유동자산"},
    {"code": "1110100", "name": "보통예금", "category": "자산", "sub_category": "유동자산"},
    {"code": "1110106", "name": "MMDA", "category": "자산", "sub_category": "유동자산"},
    {"code": "1120100", "name": "단기매매증권", "category": "자산", "sub_category": "유동자산"},
    {"code": "1130100", "name": "미수금", "category": "자산", "sub_category": "유동자산"},
    {"code": "1130200", "name": "미수수익", "category": "자산", "sub_category": "유동자산"},
    {"code": "1200100", "name": "주목적투자자산", "category": "자산", "sub_category": "투자자산"},
    {"code": "1200200", "name": "비목적투자자산", "category": "자산", "sub_category": "투자자산"},
    # Liabilities
    {"code": "2100100", "name": "미지급배당금", "category": "부채", "sub_category": "유동부채"},
    {"code": "2100200", "name": "기타유동부채", "category": "부채", "sub_category": "유동부채"},
    # Equity
    {"code": "3100300", "name": "출자금", "category": "자본", "sub_category": "자본-출자금"},
    {"code": "3200100", "name": "자본잉여금", "category": "자본", "sub_category": "자본잉여금"},
    {"code": "3300100", "name": "이익잉여금", "category": "자본", "sub_category": "이익잉여금"},
    # Revenue
    {"code": "4110100", "name": "투자수익", "category": "수익", "sub_category": "영업수익"},
    {"code": "4120100", "name": "운용투자수익", "category": "수익", "sub_category": "영업수익"},
    {"code": "4130100", "name": "기타영업수익", "category": "수익", "sub_category": "영업수익"},
    {"code": "4160206", "name": "MMDA이자", "category": "수익", "sub_category": "기타영업수익"},
    {"code": "4120700", "name": "기타조합수익", "category": "수익", "sub_category": "기타영업수익"},
    # Expense
    {"code": "4210100", "name": "관리보수", "category": "비용", "sub_category": "영업비용"},
    {"code": "4210200", "name": "성과보수", "category": "비용", "sub_category": "영업비용"},
    {"code": "4210300", "name": "수탁관리보수", "category": "비용", "sub_category": "영업비용"},
    {"code": "4210400", "name": "회계감사수수료", "category": "비용", "sub_category": "영업비용"},
    {"code": "4220100", "name": "투자비용", "category": "비용", "sub_category": "영업비용"},
    {"code": "4220200", "name": "운용투자비용", "category": "비용", "sub_category": "영업비용"},
    {"code": "4230100", "name": "기타영업비용", "category": "비용", "sub_category": "영업비용"},
    {"code": "4240100", "name": "판매비와관리비", "category": "비용", "sub_category": "영업비용"},
]


def _normal_side(category: str) -> str:
    if category in {"자산", "비용"}:
        return "차변"
    return "대변"


def ensure_fund_standard_accounts(db: Session, fund_id: int) -> int:
    """Create missing standard accounts for a fund. Returns created count."""

    if not db.get(Fund, fund_id):
        return 0

    existing_codes = {
        row.code
        for row in db.query(Account)
        .filter(Account.fund_id == fund_id)
        .all()
    }

    created = 0
    display_order = 100
    for item in FUND_STANDARD_ACCOUNTS:
        if item["code"] in existing_codes:
            continue

        db.add(
            Account(
                fund_id=fund_id,
                code=item["code"],
                name=item["name"],
                category=item["category"],
                sub_category=item.get("sub_category"),
                normal_side=_normal_side(item["category"]),
                is_active="true",
                display_order=display_order,
            )
        )
        created += 1
        display_order += 1

    if created:
        db.commit()

    return created


def ensure_all_fund_standard_accounts(db: Session) -> int:
    """Create missing standard accounts for all funds."""

    created_total = 0
    fund_ids = [row.id for row in db.query(Fund.id).all()]
    for fund_id in fund_ids:
        created_total += ensure_fund_standard_accounts(db, fund_id)
    return created_total
