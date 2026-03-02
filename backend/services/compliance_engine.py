from __future__ import annotations

import re
from datetime import date, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.compliance import ComplianceObligation, ComplianceRule, InvestmentLimitCheck
from models.fund import Fund
from models.investment import Investment, PortfolioCompany
from services.task_auto_generator import create_task_for_obligation
from utils.business_days import add_business_days, is_business_day


class ComplianceEngine:
    """Compliance rules runtime engine."""

    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def _is_business_day(value: date) -> bool:
        return is_business_day(value)

    @classmethod
    def _add_business_days(cls, base_date: date, days: int) -> date:
        return add_business_days(base_date, max(0, days))

    @staticmethod
    def _month_end(year: int, month: int) -> date:
        if month == 12:
            return date(year, 12, 31)
        return date(year, month + 1, 1) - timedelta(days=1)

    @staticmethod
    def _quarter_end(year: int, month: int) -> date:
        quarter = ((month - 1) // 3) + 1
        quarter_end_month = quarter * 3
        if quarter_end_month == 12:
            return date(year, 12, 31)
        return date(year, quarter_end_month + 1, 1) - timedelta(days=1)

    @staticmethod
    def _half_year_end(year: int, month: int) -> date:
        if month <= 6:
            return date(year, 6, 30)
        return date(year, 12, 31)

    @staticmethod
    def _matches_fund_type(filter_text: str | None, fund_type: str | None) -> bool:
        if not filter_text or filter_text.strip().lower() == "all":
            return True
        if not fund_type:
            return False
        return filter_text.strip() in fund_type

    @staticmethod
    def _should_generate_by_frequency(frequency: str | None, month: int) -> bool:
        if frequency == "monthly":
            return True
        if frequency == "quarterly":
            return month in (3, 6, 9, 12)
        if frequency == "semi_annual":
            return month in (6, 12)
        if frequency == "annual":
            return month == 12
        return False

    @classmethod
    def _calculate_periodic_due_date(cls, deadline_rule: str | None, year: int, month: int) -> date:
        deadline_rule = (deadline_rule or "").strip()

        if match := re.fullmatch(r"M\+(\d+)d", deadline_rule):
            return date(year, month, 1) + timedelta(days=int(match.group(1)))
        if match := re.fullmatch(r"Q\+(\d+)d", deadline_rule):
            return cls._quarter_end(year, month) + timedelta(days=int(match.group(1)))
        if match := re.fullmatch(r"H\+(\d+)d", deadline_rule):
            return cls._half_year_end(year, month) + timedelta(days=int(match.group(1)))
        if match := re.fullmatch(r"Y\+(\d+)d", deadline_rule):
            return date(year, 12, 31) + timedelta(days=int(match.group(1)))
        if match := re.fullmatch(r"event\+(\d+)bd", deadline_rule):
            return cls._add_business_days(date.today(), int(match.group(1)))

        # fallback: end of month if unknown rule
        return cls._month_end(year, month)

    @staticmethod
    def _build_period_type(frequency: str | None, year: int, month: int) -> str | None:
        if frequency == "monthly":
            return f"{year}-{month:02d}"
        if frequency == "quarterly":
            quarter = ((month - 1) // 3) + 1
            return f"{year}-Q{quarter}"
        if frequency == "semi_annual":
            half = 1 if month <= 6 else 2
            return f"{year}-H{half}"
        if frequency == "annual":
            return f"{year}"
        return None

    def _get_rule(self, rule_code: str) -> ComplianceRule | None:
        return (
            self.db.query(ComplianceRule)
            .filter(
                ComplianceRule.rule_code == rule_code,
                ComplianceRule.is_active == True,
            )
            .first()
        )

    def _get_fund_name(self, fund_id: int) -> str:
        fund = self.db.get(Fund, fund_id)
        return fund.name if fund else f"Fund #{fund_id}"

    def _find_existing_obligation(
        self,
        *,
        rule_id: int,
        fund_id: int,
        due_date: date,
        period_type: str | None,
        investment_id: int | None,
    ) -> ComplianceObligation | None:
        query = self.db.query(ComplianceObligation).filter(
            ComplianceObligation.rule_id == rule_id,
            ComplianceObligation.fund_id == fund_id,
            ComplianceObligation.due_date == due_date,
        )
        if period_type is not None:
            query = query.filter(ComplianceObligation.period_type == period_type)
        else:
            query = query.filter(ComplianceObligation.period_type.is_(None))

        if investment_id is not None:
            query = query.filter(ComplianceObligation.investment_id == investment_id)
        else:
            query = query.filter(ComplianceObligation.investment_id.is_(None))

        existing = query.order_by(ComplianceObligation.id.desc()).first()
        if existing:
            return existing

        if period_type is None:
            recent_cutoff = datetime.utcnow() - timedelta(days=2)
            recent_query = self.db.query(ComplianceObligation).filter(
                ComplianceObligation.rule_id == rule_id,
                ComplianceObligation.fund_id == fund_id,
                ComplianceObligation.period_type.is_(None),
                ComplianceObligation.investment_id == investment_id if investment_id is not None else ComplianceObligation.investment_id.is_(None),
                ComplianceObligation.created_at >= recent_cutoff,
            )
            return recent_query.order_by(ComplianceObligation.id.desc()).first()

        return None

    def _create_obligation(
        self,
        *,
        rule: ComplianceRule,
        fund_id: int,
        due_date: date,
        period_type: str | None = None,
        investment_id: int | None = None,
        event_description: str | None = None,
    ) -> tuple[ComplianceObligation, bool]:
        existing = self._find_existing_obligation(
            rule_id=rule.id,
            fund_id=fund_id,
            due_date=due_date,
            period_type=period_type,
            investment_id=investment_id,
        )
        if existing:
            return existing, False

        obligation = ComplianceObligation(
            rule_id=rule.id,
            fund_id=fund_id,
            due_date=due_date,
            period_type=period_type,
            status="pending",
            investment_id=investment_id,
        )
        self.db.add(obligation)
        self.db.flush()

        create_task_for_obligation(
            db=self.db,
            obligation=obligation,
            fund_name=self._get_fund_name(fund_id),
            rule_title=rule.title,
            rule_code=rule.rule_code,
            event_description=event_description,
        )
        return obligation, True

    def generate_periodic_obligations(self, year: int, month: int) -> dict[str, int]:
        generated = 0
        skipped = 0

        funds = (
            self.db.query(Fund)
            .filter(func.lower(func.coalesce(Fund.status, "")) == "active")
            .order_by(Fund.id.asc())
            .all()
        )
        rules = (
            self.db.query(ComplianceRule)
            .filter(
                ComplianceRule.category == "reporting",
                ComplianceRule.subcategory == "periodic",
                ComplianceRule.is_active == True,
            )
            .order_by(ComplianceRule.id.asc())
            .all()
        )

        try:
            for fund in funds:
                for rule in rules:
                    if not self._matches_fund_type(rule.fund_type_filter, fund.type):
                        skipped += 1
                        continue
                    if not self._should_generate_by_frequency(rule.frequency, month):
                        skipped += 1
                        continue

                    due_date = self._calculate_periodic_due_date(rule.deadline_rule, year, month)
                    period_type = self._build_period_type(rule.frequency, year, month)
                    _, created = self._create_obligation(
                        rule=rule,
                        fund_id=fund.id,
                        due_date=due_date,
                        period_type=period_type,
                    )
                    if created:
                        generated += 1
                    else:
                        skipped += 1

            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        return {"generated": generated, "skipped": skipped}

    def on_investment_created(self, investment_id: int, fund_id: int) -> dict[str, object]:
        return self._handle_event_rule(
            rule_code="RPT-E-01",
            fund_id=fund_id,
            investment_id=investment_id,
            due_business_days=5,
            event_description="투자 실행 등록",
        )

    def on_investment_exited(self, investment_id: int, fund_id: int) -> dict[str, object]:
        return self._handle_event_rule(
            rule_code="RPT-E-02",
            fund_id=fund_id,
            investment_id=investment_id,
            due_business_days=5,
            event_description="투자 회수 등록",
        )

    def on_lp_changed(self, fund_id: int, change_type: str) -> dict[str, object]:
        label = {
            "joined": "LP 가입",
            "withdrawn": "LP 탈퇴",
            "transferred": "LP 양도",
        }.get(change_type, "LP 변경")
        return self._handle_event_rule(
            rule_code="RPT-E-03",
            fund_id=fund_id,
            investment_id=None,
            due_business_days=10,
            event_description=label,
        )

    def on_distribution_executed(self, fund_id: int) -> dict[str, object]:
        return self._handle_event_rule(
            rule_code="RPT-E-06",
            fund_id=fund_id,
            investment_id=None,
            due_business_days=5,
            event_description="배분 실행",
        )

    def _handle_event_rule(
        self,
        *,
        rule_code: str,
        fund_id: int,
        investment_id: int | None,
        due_business_days: int,
        event_description: str,
    ) -> dict[str, object]:
        rule = self._get_rule(rule_code)
        if not rule:
            return {"created": False, "reason": "rule_not_found", "rule_code": rule_code}

        due_date = self._add_business_days(date.today(), due_business_days)

        try:
            obligation, created = self._create_obligation(
                rule=rule,
                fund_id=fund_id,
                due_date=due_date,
                investment_id=investment_id,
                event_description=event_description,
            )
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        return {
            "created": created,
            "obligation_id": obligation.id,
            "rule_code": rule_code,
            "due_date": obligation.due_date.isoformat(),
        }

    def check_investment_limits(
        self,
        *,
        fund_id: int,
        amount: float,
        company_name: str,
        is_overseas: bool = False,
        is_affiliate: bool = False,
    ) -> list[dict]:
        fund = self.db.get(Fund, fund_id)
        if not fund:
            raise ValueError("조합을 찾을 수 없습니다")

        amount = float(amount or 0)
        commitment_total = float(fund.commitment_total or 0)
        results: list[dict] = []

        def register(result: dict) -> None:
            results.append(result)
            self.db.add(
                InvestmentLimitCheck(
                    fund_id=fund_id,
                    rule_code=result["rule_code"],
                    check_result=result["result"],
                    current_value=result.get("current_pct"),
                    limit_value=result.get("limit_pct"),
                    detail=result.get("detail"),
                )
            )

        company_ids = [
            row.id
            for row in self.db.query(PortfolioCompany)
            .filter(func.lower(func.coalesce(PortfolioCompany.name, "")) == company_name.strip().lower())
            .all()
        ]
        existing_same_company = 0.0
        if company_ids:
            existing_same_company = float(
                self.db.query(func.coalesce(func.sum(Investment.amount), 0))
                .filter(Investment.fund_id == fund_id, Investment.company_id.in_(company_ids))
                .scalar()
                or 0
            )

        if commitment_total <= 0:
            register(
                {
                    "rule_code": "LMT-01",
                    "result": "block",
                    "current_pct": None,
                    "limit_pct": 15.0,
                    "detail": "약정총액이 없어 투자한도 계산이 불가합니다.",
                }
            )
        else:
            same_company_ratio = ((existing_same_company + amount) / commitment_total) * 100
            if same_company_ratio > 15.0:
                result = "block"
            elif same_company_ratio > 13.0:
                result = "warning"
            else:
                result = "pass"
            register(
                {
                    "rule_code": "LMT-01",
                    "result": result,
                    "current_pct": round(same_company_ratio, 2),
                    "limit_pct": 15.0,
                    "detail": (
                        f"동일기업 투자비율: {same_company_ratio:.2f}% "
                        f"(기투자 {existing_same_company:,.0f} + 신규 {amount:,.0f})"
                    ),
                }
            )

        if is_overseas and commitment_total > 0:
            existing_overseas = float(
                self.db.query(func.coalesce(func.sum(Investment.amount), 0))
                .filter(
                    Investment.fund_id == fund_id,
                    func.lower(func.coalesce(Investment.instrument, "")).contains("해외"),
                )
                .scalar()
                or 0
            )
            overseas_ratio = ((existing_overseas + amount) / commitment_total) * 100
            if overseas_ratio > 20.0:
                overseas_result = "block"
            elif overseas_ratio > 18.0:
                overseas_result = "warning"
            else:
                overseas_result = "pass"
            register(
                {
                    "rule_code": "LMT-02",
                    "result": overseas_result,
                    "current_pct": round(overseas_ratio, 2),
                    "limit_pct": 20.0,
                    "detail": f"해외투자 비율: {overseas_ratio:.2f}%",
                }
            )
        else:
            register(
                {
                    "rule_code": "LMT-02",
                    "result": "pass",
                    "current_pct": 0.0,
                    "limit_pct": 20.0,
                    "detail": "해외투자 대상이 아닙니다.",
                }
            )

        register(
            {
                "rule_code": "LMT-03",
                "result": "block" if is_affiliate else "pass",
                "current_pct": None,
                "limit_pct": None,
                "detail": "GP 계열사 투자 금지 규정 검토",
            }
        )
        register(
            {
                "rule_code": "LMT-04",
                "result": "pass",
                "current_pct": None,
                "limit_pct": None,
                "detail": "부동산 투자 제한 규정 검토(수동확인).",
            }
        )
        register(
            {
                "rule_code": "LMT-05",
                "result": "pass",
                "current_pct": None,
                "limit_pct": None,
                "detail": "상장기업 투자 제한 규정 검토(수동확인).",
            }
        )

        self.db.commit()
        return results

    def update_overdue_obligations(self) -> dict[str, int]:
        today = date.today()
        rows = (
            self.db.query(ComplianceObligation)
            .filter(
                ComplianceObligation.status.in_(["pending", "in_progress"]),
                ComplianceObligation.due_date < today,
            )
            .all()
        )
        for row in rows:
            row.status = "overdue"
        self.db.commit()
        return {"updated": len(rows)}
