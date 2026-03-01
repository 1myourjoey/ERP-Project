from __future__ import annotations

import calendar
import json
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.accounting import Account, JournalEntry, JournalEntryLine
from models.provisional_fs import ProvisionalFS


@dataclass
class AccountSnapshot:
    account_id: int
    code: str
    name: str
    category: str
    sub_category: str | None
    normal_side: str | None
    debit_total: float
    credit_total: float
    debit_month: float
    credit_month: float

    @property
    def balance_total(self) -> float:
        if (self.normal_side or "") == "대변":
            return self.credit_total - self.debit_total
        return self.debit_total - self.credit_total

    @property
    def balance_month(self) -> float:
        if (self.normal_side or "") == "대변":
            return self.credit_month - self.debit_month
        return self.debit_month - self.credit_month


class ProvisionalFSService:
    """Generate monthly provisional financial statements (SFP/IS)."""

    def generate(self, fund_id: int, year_month: str, db: Session) -> ProvisionalFS:
        month_start, month_end = self._month_range(year_month)
        snapshots = self._load_snapshots(db, fund_id, month_start, month_end)

        sfp_data, sfp_summary = self._build_sfp(snapshots)
        is_data = self._build_is(snapshots)

        fs = (
            db.query(ProvisionalFS)
            .filter(ProvisionalFS.fund_id == fund_id, ProvisionalFS.year_month == year_month)
            .first()
        )
        if fs is None:
            fs = ProvisionalFS(fund_id=fund_id, year_month=year_month)
            db.add(fs)

        fs.status = "draft"
        fs.sfp_data = json.dumps(sfp_data, ensure_ascii=False)
        fs.is_data = json.dumps(is_data, ensure_ascii=False)
        fs.total_assets = sfp_summary["total_assets"]
        fs.total_liabilities = sfp_summary["total_liabilities"]
        fs.total_equity = sfp_summary["total_equity"]
        fs.net_income = is_data["net_income"]

        db.commit()
        db.refresh(fs)
        return fs

    def _month_range(self, year_month: str) -> tuple[date, date]:
        try:
            year_str, month_str = year_month.split("-", 1)
            year = int(year_str)
            month = int(month_str)
        except Exception as exc:  # noqa: BLE001
            raise ValueError("year_month must be YYYY-MM") from exc

        if month < 1 or month > 12:
            raise ValueError("month must be between 1 and 12")

        last_day = calendar.monthrange(year, month)[1]
        return date(year, month, 1), date(year, month, last_day)

    def _load_snapshots(
        self,
        db: Session,
        fund_id: int,
        month_start: date,
        month_end: date,
    ) -> list[AccountSnapshot]:
        accounts = (
            db.query(Account)
            .filter((Account.fund_id == fund_id) | (Account.fund_id.is_(None)))
            .order_by(Account.display_order.asc(), Account.id.asc())
            .all()
        )

        snapshots: list[AccountSnapshot] = []
        for account in accounts:
            debit_total = (
                db.query(func.coalesce(func.sum(JournalEntryLine.debit), 0))
                .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
                .filter(
                    JournalEntryLine.account_id == account.id,
                    JournalEntry.fund_id == fund_id,
                    JournalEntry.entry_date <= month_end,
                    JournalEntry.status != "미결재",
                )
                .scalar()
            )
            credit_total = (
                db.query(func.coalesce(func.sum(JournalEntryLine.credit), 0))
                .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
                .filter(
                    JournalEntryLine.account_id == account.id,
                    JournalEntry.fund_id == fund_id,
                    JournalEntry.entry_date <= month_end,
                    JournalEntry.status != "미결재",
                )
                .scalar()
            )

            debit_month = (
                db.query(func.coalesce(func.sum(JournalEntryLine.debit), 0))
                .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
                .filter(
                    JournalEntryLine.account_id == account.id,
                    JournalEntry.fund_id == fund_id,
                    JournalEntry.entry_date >= month_start,
                    JournalEntry.entry_date <= month_end,
                    JournalEntry.status != "미결재",
                )
                .scalar()
            )
            credit_month = (
                db.query(func.coalesce(func.sum(JournalEntryLine.credit), 0))
                .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
                .filter(
                    JournalEntryLine.account_id == account.id,
                    JournalEntry.fund_id == fund_id,
                    JournalEntry.entry_date >= month_start,
                    JournalEntry.entry_date <= month_end,
                    JournalEntry.status != "미결재",
                )
                .scalar()
            )

            snapshots.append(
                AccountSnapshot(
                    account_id=account.id,
                    code=account.code or "",
                    name=account.name or "",
                    category=account.category or "",
                    sub_category=account.sub_category,
                    normal_side=account.normal_side,
                    debit_total=self._to_float(debit_total),
                    credit_total=self._to_float(credit_total),
                    debit_month=self._to_float(debit_month),
                    credit_month=self._to_float(credit_month),
                )
            )

        return snapshots

    def _build_sfp(self, snapshots: list[AccountSnapshot]) -> tuple[dict[str, float], dict[str, float]]:
        def total_balance(predicate) -> float:
            return sum(item.balance_total for item in snapshots if predicate(item))

        mmda = total_balance(lambda item: item.code == "1110106" or "MMDA" in item.name)
        short_term = total_balance(lambda item: item.code.startswith("112") or "단기매매증권" in item.name)
        receivable = total_balance(lambda item: item.code.startswith("11301") or "미수금" in item.name)
        accrued_income = total_balance(lambda item: item.code.startswith("11302") or "미수수익" in item.name)

        current_assets = mmda + short_term + receivable + accrued_income

        investment_assets = total_balance(
            lambda item: item.code.startswith("120")
            or "투자" in (item.sub_category or "")
            or "투자" in item.name
        )

        total_assets = total_balance(lambda item: item.category == "자산" or item.code.startswith("1"))
        non_current_assets = max(total_assets - current_assets - investment_assets, 0.0)

        payable = total_balance(lambda item: item.code.startswith("21001") or "미지급" in item.name)
        other_current_liabilities = total_balance(
            lambda item: item.code.startswith("21002")
            or (item.category == "부채" and "유동" in (item.sub_category or ""))
        )
        current_liabilities = payable + other_current_liabilities

        total_liabilities = total_balance(lambda item: item.category == "부채" or item.code.startswith("2"))
        non_current_liabilities = max(total_liabilities - current_liabilities, 0.0)

        capital = total_balance(lambda item: item.code.startswith("310") or "출자금" in item.name)
        capital_surplus = total_balance(lambda item: item.code.startswith("320") or "자본잉여" in item.name)
        retained_earnings = total_balance(lambda item: item.code.startswith("330") or "이익잉여" in item.name)
        total_equity = capital + capital_surplus + retained_earnings

        sfp = {
            "mmda": mmda,
            "short_term_securities": short_term,
            "receivable": receivable,
            "accrued_income": accrued_income,
            "current_assets": current_assets,
            "investment_assets": investment_assets,
            "non_current_assets": non_current_assets,
            "payable": payable,
            "other_current_liabilities": other_current_liabilities,
            "current_liabilities": current_liabilities,
            "non_current_liabilities": non_current_liabilities,
            "capital": capital,
            "capital_surplus": capital_surplus,
            "retained_earnings": retained_earnings,
            "total_assets": total_assets,
            "total_liabilities": total_liabilities,
            "total_equity": total_equity,
        }

        return sfp, {
            "total_assets": total_assets,
            "total_liabilities": total_liabilities,
            "total_equity": total_equity,
        }

    def _build_is(self, snapshots: list[AccountSnapshot]) -> dict[str, float]:
        def month_balance(predicate) -> float:
            return sum(item.balance_month for item in snapshots if predicate(item))

        investment_income = month_balance(lambda item: item.code.startswith("411") or item.name == "투자수익")
        operating_invest_income = month_balance(lambda item: item.code.startswith("412") or item.name == "운용투자수익")

        total_revenue = month_balance(lambda item: item.category == "수익" or item.code.startswith("4"))
        other_operating_income = max(total_revenue - investment_income - operating_invest_income, 0.0)

        management_fee = month_balance(lambda item: item.code.startswith("42101") or "관리보수" in item.name)
        performance_fee = month_balance(lambda item: item.code.startswith("42102") or "성과보수" in item.name)
        trustee_fee = month_balance(lambda item: item.code.startswith("42103") or "수탁" in item.name)
        audit_fee = month_balance(lambda item: item.code.startswith("42104") or "감사" in item.name)
        investment_expense = month_balance(lambda item: item.code.startswith("42201") or item.name == "투자비용")
        operating_invest_expense = month_balance(lambda item: item.code.startswith("42202") or "운용투자비용" in item.name)
        other_operating_expense = month_balance(lambda item: item.code.startswith("423") or "기타영업비용" in item.name)
        sgna = month_balance(lambda item: item.code.startswith("424") or "판매비와관리비" in item.name)

        total_expense = month_balance(
            lambda item: item.category == "비용" or item.code.startswith("5") or item.code.startswith("42")
        )

        detailed_expense_sum = (
            management_fee
            + performance_fee
            + trustee_fee
            + audit_fee
            + investment_expense
            + operating_invest_expense
            + other_operating_expense
            + sgna
        )
        if total_expense > detailed_expense_sum:
            other_operating_expense += total_expense - detailed_expense_sum

        operating_revenue = investment_income + operating_invest_income + other_operating_income
        operating_expense = total_expense
        operating_income = operating_revenue - operating_expense

        non_operating_income = 0.0
        non_operating_expense = 0.0
        income_tax = 0.0
        net_income = operating_income + non_operating_income - non_operating_expense - income_tax

        return {
            "investment_income": investment_income,
            "operating_invest_income": operating_invest_income,
            "other_operating_income": other_operating_income,
            "operating_revenue": operating_revenue,
            "management_fee": management_fee,
            "performance_fee": performance_fee,
            "trustee_fee": trustee_fee,
            "audit_fee": audit_fee,
            "investment_expense": investment_expense,
            "operating_invest_expense": operating_invest_expense,
            "other_operating_expense": other_operating_expense,
            "sgna": sgna,
            "operating_expense": operating_expense,
            "operating_income": operating_income,
            "non_operating_income": non_operating_income,
            "non_operating_expense": non_operating_expense,
            "income_tax": income_tax,
            "net_income": net_income,
        }

    def _to_float(self, value) -> float:
        if value is None:
            return 0.0
        if isinstance(value, Decimal):
            return float(value)
        return float(value)
