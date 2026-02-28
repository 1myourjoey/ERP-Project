from __future__ import annotations

import json
from datetime import date
from io import BytesIO

from openpyxl import Workbook
from sqlalchemy import func
from sqlalchemy.orm import Session

from models.fee import ManagementFee
from models.fund import Fund, LP, LPTransfer
from models.investment import Investment, PortfolioCompany
from models.phase3 import Distribution
from models.transaction import Transaction
from models.valuation import Valuation
from models.vics_report import VicsMonthlyReport


class VicsReportService:
    def __init__(self, db: Session):
        self.db = db

    def generate_report(self, fund_id: int, year: int, month: int, report_code: str) -> VicsMonthlyReport:
        fund = self.db.get(Fund, fund_id)
        if not fund:
            raise ValueError("조합을 찾을 수 없습니다.")

        if report_code == "1308":
            data = self.generate_1308(fund_id, year, month)
        elif report_code == "1309":
            data = self.generate_1309(fund_id, year, month)
        elif report_code == "1329":
            data = self.generate_1329(fund_id, year, month)
        else:
            raise ValueError("지원하지 않는 보고 코드입니다.")

        row = (
            self.db.query(VicsMonthlyReport)
            .filter(
                VicsMonthlyReport.fund_id == fund_id,
                VicsMonthlyReport.year == year,
                VicsMonthlyReport.month == month,
                VicsMonthlyReport.report_code == report_code,
            )
            .first()
        )
        if row is None:
            row = VicsMonthlyReport(
                fund_id=fund_id,
                year=year,
                month=month,
                report_code=report_code,
                status="draft",
            )
            self.db.add(row)

        row.data_json = json.dumps(data, ensure_ascii=False)
        row.status = row.status or "draft"
        self.db.commit()
        self.db.refresh(row)
        return row

    def _month_range(self, year: int, month: int) -> tuple[date, date]:
        month_start = date(year, month, 1)
        if month == 12:
            month_end = date(year, 12, 31)
        else:
            month_end = date(year, month + 1, 1) - date.resolution
        return month_start, month_end

    def generate_1308(self, fund_id: int, year: int, month: int) -> dict:
        month_start, month_end = self._month_range(year, month)
        investments = (
            self.db.query(Investment)
            .filter(Investment.fund_id == fund_id)
            .order_by(Investment.id.asc())
            .all()
        )

        result_rows: list[dict] = []
        total_invested = 0.0
        total_balance = 0.0
        new_this_month = 0
        exited_this_month = 0
        for inv in investments:
            company = self.db.get(PortfolioCompany, inv.company_id)
            recovered_amount = float(
                self.db.query(func.coalesce(func.sum(Transaction.amount), 0))
                .filter(Transaction.investment_id == inv.id, Transaction.type == "exit")
                .scalar()
                or 0
            )
            invested_amount = float(inv.amount or 0)
            current_balance = max(invested_amount - recovered_amount, 0.0)
            if inv.investment_date and month_start <= inv.investment_date <= month_end:
                new_this_month += 1
            if (inv.status or "").lower() == "exited":
                exited_this_month += 1

            total_invested += invested_amount
            total_balance += current_balance
            result_rows.append(
                {
                    "investment_id": inv.id,
                    "company_name": company.name if company else f"Company #{inv.company_id}",
                    "biz_number": company.business_number if company else None,
                    "instrument_type": inv.instrument,
                    "investment_date": inv.investment_date.isoformat() if inv.investment_date else None,
                    "investment_amount": invested_amount,
                    "current_balance": current_balance,
                    "shares": float(inv.shares or 0),
                    "ownership_pct": float(inv.ownership_pct or 0),
                    "status": inv.status,
                }
            )

        return {
            "investments": result_rows,
            "summary": {
                "total_invested": total_invested,
                "total_balance": total_balance,
                "new_this_month": new_this_month,
                "exited_this_month": exited_this_month,
            },
        }

    def generate_1309(self, fund_id: int, year: int, month: int) -> dict:
        month_start, month_end = self._month_range(year, month)
        fund = self.db.get(Fund, fund_id)
        if not fund:
            raise ValueError("조합을 찾을 수 없습니다.")

        lps = (
            self.db.query(LP)
            .filter(LP.fund_id == fund_id)
            .order_by(LP.id.asc())
            .all()
        )
        paid_in_total = float(sum(float(lp.paid_in or 0) for lp in lps))
        commitment_total = float(fund.commitment_total or 0)
        lp_rows = []
        for lp in lps:
            ownership_pct = ((float(lp.commitment or 0) / commitment_total) * 100) if commitment_total > 0 else 0.0
            lp_rows.append(
                {
                    "lp_id": lp.id,
                    "name": lp.name,
                    "type": lp.type,
                    "commitment": float(lp.commitment or 0),
                    "paid_in": float(lp.paid_in or 0),
                    "ownership_pct": round(ownership_pct, 2),
                }
            )

        transfer_rows = (
            self.db.query(LPTransfer)
            .filter(
                LPTransfer.fund_id == fund_id,
                LPTransfer.transfer_date.isnot(None),
                LPTransfer.transfer_date >= month_start,
                LPTransfer.transfer_date <= month_end,
            )
            .order_by(LPTransfer.id.asc())
            .all()
        )
        changes_this_month: list[dict] = []
        for row in transfer_rows:
            changes_this_month.append(
                {
                    "transfer_id": row.id,
                    "transfer_date": row.transfer_date.isoformat() if row.transfer_date else None,
                    "from_lp_id": row.from_lp_id,
                    "to_lp_id": row.to_lp_id,
                    "to_lp_name": row.to_lp_name,
                    "transfer_amount": float(row.transfer_amount or 0),
                    "status": row.status,
                }
            )

        return {
            "fund_info": {
                "fund_id": fund.id,
                "fund_name": fund.name,
                "total_commitment": commitment_total,
                "paid_in_total": paid_in_total,
                "remaining_commitment": commitment_total - paid_in_total,
                "trustee": fund.trustee,
                "account_number": fund.account_number,
            },
            "lps": lp_rows,
            "changes_this_month": changes_this_month,
        }

    def generate_1329(self, fund_id: int, year: int, month: int) -> dict:
        investment_cost_total = float(
            self.db.query(func.coalesce(func.sum(Investment.amount), 0))
            .filter(Investment.fund_id == fund_id)
            .scalar()
            or 0
        )
        valuations = (
            self.db.query(Valuation)
            .filter(Valuation.fund_id == fund_id)
            .order_by(Valuation.as_of_date.desc(), Valuation.id.desc())
            .all()
        )
        latest_by_investment: dict[int, Valuation] = {}
        for row in valuations:
            if row.investment_id not in latest_by_investment:
                latest_by_investment[row.investment_id] = row
        investment_fair_value_total = float(
            sum(float(row.total_fair_value or row.value or 0) for row in latest_by_investment.values())
        )

        tx_rows = (
            self.db.query(Transaction)
            .filter(Transaction.fund_id == fund_id)
            .order_by(Transaction.transaction_date.asc(), Transaction.id.asc())
            .all()
        )
        outflow_types = {"investment", "fee", "expense", "distribution", "capital_return", "출금", "경비"}
        cash_balance = 0.0
        operating_expense = 0.0
        for tx in tx_rows:
            amount = float(tx.amount or 0)
            tx_type = (tx.type or "").strip().lower()
            is_out = tx_type in outflow_types or "expense" in tx_type or "경비" in (tx.type or "")
            cash_balance += -amount if is_out else amount
            if "expense" in tx_type or "경비" in (tx.type or ""):
                operating_expense += amount

        management_fee_paid = float(
            self.db.query(func.coalesce(func.sum(ManagementFee.fee_amount), 0))
            .filter(ManagementFee.fund_id == fund_id, ManagementFee.year == year)
            .scalar()
            or 0
        )
        distribution_total = float(
            self.db.query(func.coalesce(func.sum(Distribution.principal_total + Distribution.profit_total), 0))
            .filter(Distribution.fund_id == fund_id)
            .scalar()
            or 0
        )
        nav = investment_fair_value_total + cash_balance

        return {
            "cash_balance": cash_balance,
            "investment_cost_total": investment_cost_total,
            "investment_fair_value_total": investment_fair_value_total,
            "nav": nav,
            "management_fee_paid": management_fee_paid,
            "operating_expense": operating_expense,
            "distribution_total": distribution_total,
        }

    def export_vics_xlsx(self, report_id: int) -> bytes:
        row = self.db.get(VicsMonthlyReport, report_id)
        if not row:
            raise ValueError("VICS 보고서를 찾을 수 없습니다.")
        data = json.loads(row.data_json or "{}")

        wb = Workbook()
        ws = wb.active
        ws.title = f"VICS-{row.report_code}"

        if row.report_code == "1308":
            ws.append(["기업명", "사업자번호", "투자유형", "투자일", "투자금액", "잔액", "지분율", "상태"])
            for item in data.get("investments", []):
                ws.append(
                    [
                        item.get("company_name"),
                        item.get("biz_number"),
                        item.get("instrument_type"),
                        item.get("investment_date"),
                        item.get("investment_amount"),
                        item.get("current_balance"),
                        item.get("ownership_pct"),
                        item.get("status"),
                    ]
                )
        elif row.report_code == "1309":
            ws.append(["항목", "값"])
            for key, value in (data.get("fund_info") or {}).items():
                ws.append([key, value])
            ws.append([])
            ws.append(["LP명", "유형", "약정", "납입", "지분율"])
            for item in data.get("lps", []):
                ws.append([item.get("name"), item.get("type"), item.get("commitment"), item.get("paid_in"), item.get("ownership_pct")])
        elif row.report_code == "1329":
            ws.append(["항목", "금액"])
            for key, value in data.items():
                ws.append([key, value])
        else:
            raise ValueError("지원하지 않는 보고 코드입니다.")

        output = BytesIO()
        wb.save(output)
        return output.getvalue()
