from sqlalchemy.orm import Session

from models.accounting import Account

ACCOUNTS = [
    {"code": "101", "name": "현금", "category": "자산", "sub_category": "유동자산", "normal_side": "차변", "display_order": 1},
    {"code": "111", "name": "투자주식", "category": "자산", "sub_category": "투자자산", "normal_side": "차변", "display_order": 2},
    {"code": "112", "name": "투자채권", "category": "자산", "sub_category": "투자자산", "normal_side": "차변", "display_order": 3},
    {"code": "121", "name": "미수금", "category": "자산", "sub_category": "유동자산", "normal_side": "차변", "display_order": 4},
    {"code": "122", "name": "선급비용", "category": "자산", "sub_category": "유동자산", "normal_side": "차변", "display_order": 5},
    {"code": "201", "name": "미지급금", "category": "부채", "sub_category": "유동부채", "normal_side": "대변", "display_order": 10},
    {"code": "202", "name": "예수금", "category": "부채", "sub_category": "유동부채", "normal_side": "대변", "display_order": 11},
    {"code": "203", "name": "미지급보수", "category": "부채", "sub_category": "유동부채", "normal_side": "대변", "display_order": 12},
    {"code": "301", "name": "출자금", "category": "자본", "sub_category": "자본금", "normal_side": "대변", "display_order": 20},
    {"code": "302", "name": "이익잉여금", "category": "자본", "sub_category": "잉여금", "normal_side": "대변", "display_order": 21},
    {"code": "401", "name": "투자주식처분이익", "category": "수익", "sub_category": "투자수익", "normal_side": "대변", "display_order": 30},
    {"code": "402", "name": "이자수익", "category": "수익", "sub_category": "금융수익", "normal_side": "대변", "display_order": 31},
    {"code": "403", "name": "배당금수익", "category": "수익", "sub_category": "투자수익", "normal_side": "대변", "display_order": 32},
    {"code": "501", "name": "관리보수", "category": "비용", "sub_category": "보수비용", "normal_side": "차변", "display_order": 40},
    {"code": "502", "name": "업무위탁수수료", "category": "비용", "sub_category": "수수료", "normal_side": "차변", "display_order": 41},
    {"code": "509", "name": "기타비용", "category": "비용", "sub_category": "기타", "normal_side": "차변", "display_order": 49},
]


def seed_accounts(db: Session) -> None:
    if db.query(Account).count() > 0:
        return

    for item in ACCOUNTS:
        db.add(Account(**item))
    db.commit()
