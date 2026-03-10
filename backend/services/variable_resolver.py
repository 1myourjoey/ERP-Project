from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from models.fund import Fund, LP
from models.gp_entity import GPEntity
from models.gp_profile import GPProfile
from models.investment import Investment
from services.lp_types import normalize_lp_type


class VariableResolver:
    """Unified variable resolver for Fund/LP/GP/Investment markers."""

    def resolve_all(
        self,
        db: Session,
        fund_id: int,
        lp_id: int | None = None,
        investment_id: int | None = None,
        extra_vars: dict[str, str] | None = None,
    ) -> dict[str, str]:
        variables: dict[str, str] = {}

        fund = db.get(Fund, fund_id)
        if not fund:
            return {str(k): str(v) for k, v in (extra_vars or {}).items()}

        lps = db.query(LP).filter(LP.fund_id == fund_id).all()
        commitment_total = float(fund.commitment_total or 0)
        paid_in_total = sum(int(lp.paid_in or 0) for lp in lps)

        variables.update(
            {
                # Korean markers
                "조합명": fund.name or "",
                "조합_영문명": "",
                "조합_유형": fund.type or "",
                "조합_설립일": self._format_date_iso(fund.formation_date),
                "조합_존속기한": self._format_date_iso(fund.maturity_date),
                "조합_약정총액": self._format_krw(fund.commitment_total),
                "조합_출자금총액": self._format_krw(paid_in_total),
                # Existing marker compatibility
                "fund_name": fund.name or "",
                "fund_type": fund.type or "",
                "fund_status": fund.status or "",
                "gp_name": fund.gp or "",
                "registration_number": fund.registration_number or "",
                "registration_date": self._format_date_kr(fund.registration_date),
                "registration_date_short": self._format_date_dot(fund.registration_date),
                "commitment_total": self._format_krw(fund.commitment_total),
                "commitment_total_raw": str(int(commitment_total)) if commitment_total else "0",
                "formation_date": self._format_date_kr(fund.formation_date),
                "formation_date_short": self._format_date_dot(fund.formation_date),
                "lp_count": str(len(lps)),
                "total_commitment_amount": self._format_krw(commitment_total),
            }
        )

        gp_profile = db.query(GPProfile).order_by(GPProfile.id.desc()).first()
        gp_entity = db.get(GPEntity, fund.gp_entity_id) if getattr(fund, "gp_entity_id", None) else None
        if gp_entity is None and fund.gp:
            gp_entity = db.query(GPEntity).filter(GPEntity.name == (fund.gp or "")).first()
        variables.update(
            {
                "GP_법인명": (
                    gp_profile.company_name
                    if gp_profile
                    else (gp_entity.name if gp_entity else fund.gp or "")
                ),
                "GP_대표자": (
                    gp_profile.representative
                    if gp_profile
                    else (gp_entity.representative if gp_entity else "")
                )
                or "",
                "GP_사업자번호": (
                    gp_profile.business_number
                    if gp_profile
                    else (gp_entity.business_number if gp_entity else "")
                )
                or "",
                "GP_주소": (
                    gp_profile.address
                    if gp_profile
                    else (gp_entity.address if gp_entity else "")
                )
                or "",
                "GP_전화": (
                    gp_profile.phone
                    if gp_profile
                    else (gp_entity.phone if gp_entity else "")
                )
                or "",
                "GP_팩스": (gp_profile.fax if gp_profile else "") or "",
            }
        )

        if lp_id is not None:
            lp = db.get(LP, lp_id)
            if lp and lp.fund_id == fund_id:
                ownership_ratio = (
                    (float(lp.commitment or 0) / commitment_total * 100)
                    if commitment_total > 0
                    else 0.0
                )
                variables.update(
                    {
                        "LP_명칭": lp.name or "",
                        "LP_대표자": lp.contact or "",
                        "LP_사업자번호": lp.business_number or "",
                        "LP_주소": lp.address or "",
                        "LP_출자약정액": self._format_krw(lp.commitment),
                        "LP_출자비율": f"{ownership_ratio:.2f}%",
                        # Existing marker compatibility
                        "lp_name": lp.name or "",
                        "lp_type": normalize_lp_type(lp.type) or lp.type or "",
                        "lp_commitment": self._format_krw(lp.commitment),
                        "lp_paid_in": self._format_krw(lp.paid_in),
                    }
                )

        if investment_id is not None:
            investment = db.get(Investment, investment_id)
            if investment and investment.fund_id == fund_id:
                company_name = investment.company.name if investment.company else ""
                variables.update(
                    {
                        "피투자사명": company_name,
                        "투자금액": self._format_krw(investment.amount),
                        "투자일자": self._format_date_iso(investment.investment_date),
                        "투자_주식수": self._format_number(investment.shares),
                        "투자_단가": self._format_krw(investment.share_price),
                        # Existing marker compatibility
                        "company_name": company_name,
                        "investment_amount": self._format_krw(investment.amount),
                        "investment_date": self._format_date_iso(investment.investment_date),
                    }
                )

        today = date.today()
        variables.update(
            {
                "오늘날짜": today.strftime("%Y년 %m월 %d일"),
                "오늘날짜_숫자": today.strftime("%Y-%m-%d"),
                "작성연도": str(today.year),
                "작성월": str(today.month),
                "작성일": str(today.day),
                "document_date": today.strftime("%Y.%m.%d"),
                "today_date_short": today.strftime("%Y.%m.%d"),
            }
        )

        if extra_vars:
            variables.update({str(k): str(v) for k, v in extra_vars.items()})

        return variables

    @staticmethod
    def _format_krw(amount) -> str:
        if amount in (None, ""):
            return "0"
        try:
            return f"{int(float(amount)):,}"
        except (TypeError, ValueError):
            return "0"

    @staticmethod
    def _format_number(value) -> str:
        if value in (None, ""):
            return ""
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return str(value)
        if numeric.is_integer():
            return str(int(numeric))
        return str(numeric)

    @staticmethod
    def _format_date_iso(value) -> str:
        if not value:
            return ""
        return f"{value:%Y-%m-%d}"

    @staticmethod
    def _format_date_dot(value) -> str:
        if not value:
            return ""
        return f"{value:%Y.%m.%d}"

    @staticmethod
    def _format_date_kr(value) -> str:
        if not value:
            return ""
        day_names = ["월", "화", "수", "목", "금", "토", "일"]
        return f"{value.year}년 {value.month}월 {value.day}일({day_names[value.weekday()]})"

    def get_available_markers(self) -> list[dict[str, str]]:
        return [
            {"marker": "조합명", "source": "fund", "description": "조합 이름"},
            {"marker": "조합_유형", "source": "fund", "description": "조합 유형"},
            {"marker": "조합_약정총액", "source": "fund", "description": "조합 약정총액"},
            {"marker": "조합_출자금총액", "source": "fund", "description": "조합 출자금총액"},
            {"marker": "GP_법인명", "source": "gp", "description": "GP 법인명"},
            {"marker": "GP_대표자", "source": "gp", "description": "GP 대표자"},
            {"marker": "GP_사업자번호", "source": "gp", "description": "GP 사업자등록번호"},
            {"marker": "LP_명칭", "source": "lp", "description": "LP 이름"},
            {"marker": "LP_출자약정액", "source": "lp", "description": "LP 출자약정액"},
            {"marker": "피투자사명", "source": "investment", "description": "투자 대상 회사명"},
            {"marker": "투자금액", "source": "investment", "description": "투자 금액"},
            {"marker": "오늘날짜", "source": "system", "description": "오늘 날짜(한글)"},
            {"marker": "오늘날짜_숫자", "source": "system", "description": "오늘 날짜(숫자)"},
            {"marker": "문서번호", "source": "system", "description": "자동 채번 문서번호"},
            {"marker": "document_number", "source": "system", "description": "자동 채번 문서번호(영문)"},
        ]
