from __future__ import annotations

from models.accounting import Account, JournalEntry, JournalEntryLine
from services.analytics.common import apply_date_buckets
from services.analytics.subject_types import SubjectDefinition, dimension, measure
from services.analytics.subjects.shared import load_reference_maps


def load_rows(db):
    refs = load_reference_maps(db)
    entry_map = {row.id: row for row in db.query(JournalEntry).all()}
    account_map = {row.id: row for row in db.query(Account).all()}
    rows = db.query(JournalEntryLine).all()
    result = []
    for row in rows:
        entry = entry_map.get(row.journal_entry_id)
        account = account_map.get(row.account_id)
        if entry is None:
            continue
        fund = refs["fund"].get(entry.fund_id) if entry.fund_id else None
        debit = float(row.debit or 0)
        credit = float(row.credit or 0)
        item = {
            "id": row.id,
            "fund.name": fund.name if fund else None,
            "journal.entry_type": entry.entry_type,
            "journal.status": entry.status,
            "journal.entry_date": entry.entry_date,
            "journal.description": entry.description,
            "account.code": account.code if account else None,
            "account.name": account.name if account else None,
            "account.category": account.category if account else None,
            "account.sub_category": account.sub_category if account else None,
            "line.debit": debit,
            "line.credit": credit,
            "line.net_amount": debit - credit,
            "line.memo": row.memo,
        }
        item.update(apply_date_buckets(entry.entry_date, "journal.entry_date"))
        result.append(item)
    return result


DEFINITION = SubjectDefinition(
    key="journal_entry",
    label="전표 라인",
    description="전표 라인 기준으로 계정, 차변/대변, 순변동을 분석합니다.",
    grain_label="전표 라인 1건",
    fields=[
        dimension("fund.name", "조합명", "string", "기본 차원"),
        dimension("journal.entry_type", "전표 유형", "string", "기본 차원"),
        dimension("journal.status", "전표 상태", "string", "기본 차원"),
        dimension("account.code", "계정 코드", "string", "기본 차원"),
        dimension("account.name", "계정명", "string", "기본 차원"),
        dimension("account.category", "계정 카테고리", "string", "기본 차원"),
        dimension("account.sub_category", "계정 소분류", "string", "기본 차원"),
        dimension("journal.entry_date.day", "전표일", "date", "날짜 파생"),
        dimension("journal.entry_date.year_month", "전표월", "string", "날짜 파생"),
        measure("line.debit", "차변", "number", "기본 지표"),
        measure("line.credit", "대변", "number", "기본 지표"),
        measure("line.net_amount", "순변동", "number", "기본 지표"),
    ],
    default_table_fields=[
        "fund.name",
        "journal.entry_date.day",
        "journal.entry_type",
        "account.category",
        "account.name",
        "line.debit",
        "line.credit",
        "line.net_amount",
    ],
    default_values=[{"key": "line.net_amount", "aggregate": "sum"}],
    starter_views=[],
    load_rows=load_rows,
)
