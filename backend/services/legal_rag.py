from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.compliance import FundComplianceRule
from models.llm_usage import LLMUsage
from services.compliance_rule_engine import ComplianceRuleEngine
from services.vector_db import VectorDBService

try:
    from openai import AsyncOpenAI
except Exception:  # pragma: no cover - optional at runtime
    AsyncOpenAI = None  # type: ignore


class MonthlyTokenLimitExceededError(RuntimeError):
    pass


class LegalRAGService:
    """Two-stage legal interpretation service.

    L1: Rule engine first (no LLM cost)
    L2: Vector retrieval + GPT interpretation
    """

    SYSTEM_PROMPT = """당신은 벤처캐피탈 조합 운용 관련 법률 전문가입니다.

아래 법률 문서 컨텍스트를 기반으로 질의에 답변하세요.

규칙:
1. 반드시 근거 조항을 명시하세요 (예: "자본시장법 제81조 제1항에 따르면...")
2. 컨텍스트에 없는 내용은 "제공된 문서에서 확인되지 않습니다"로 답변
3. 실무적 권고사항이 있다면 추가로 제안
4. 답변은 한국어로 작성

컨텍스트:
{context}
"""

    RULE_KEYWORDS: dict[str, str] = {
        "투자한도": "INV-LIMIT",
        "보고서": "RPT-DEADLINE",
        "출자금": "CAP-CROSS",
        "수탁계약": "DOC-EXIST",
    }

    def __init__(self):
        self.rule_engine = ComplianceRuleEngine()
        self._vector_db: VectorDBService | None = None
        self._client: AsyncOpenAI | None = None  # type: ignore[assignment]
        self.monthly_limit = int(os.getenv("LLM_MONTHLY_LIMIT", "500000"))

    def _get_vector_db(self) -> VectorDBService:
        if self._vector_db is None:
            self._vector_db = VectorDBService()
        return self._vector_db

    def _get_client(self):
        if self._client is not None:
            return self._client
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is required for legal interpretation.")
        if AsyncOpenAI is None:
            raise RuntimeError("openai package is unavailable.")
        self._client = AsyncOpenAI(api_key=api_key)
        return self._client

    async def check_monthly_limit(self, db: Session) -> bool:
        first_of_month = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        total = (
            db.query(func.coalesce(func.sum(LLMUsage.total_tokens), 0))
            .filter(LLMUsage.created_at >= first_of_month)
            .scalar()
            or 0
        )
        return int(total) < self.monthly_limit

    async def interpret(
        self,
        query: str,
        fund_id: int | None = None,
        db: Session | None = None,
        user_id: int | None = None,
    ) -> dict[str, Any]:
        normalized_query = (query or "").strip()
        if not normalized_query:
            raise ValueError("query is required")

        if fund_id and db:
            rule_result = self._try_rule_engine(query=normalized_query, fund_id=fund_id, db=db)
            if rule_result is not None:
                return {
                    "tier": "L1",
                    "answer": rule_result["answer"],
                    "sources": [],
                    "rule_check": rule_result,
                    "tokens_used": 0,
                }

        if db and not await self.check_monthly_limit(db):
            raise MonthlyTokenLimitExceededError("월간 LLM 토큰 한도를 초과했습니다.")

        search_results = self._get_vector_db().search_all_collections(normalized_query, n_results=5)
        if not search_results:
            return {
                "tier": "L2",
                "answer": "관련 법률 문서를 찾지 못했습니다. 문서 라이브러리에 관련 법규를 등록해주세요.",
                "sources": [],
                "rule_check": None,
                "tokens_used": 0,
            }

        context = "\n\n---\n\n".join(
            (
                f"[{row.get('collection', '')}] "
                f"{(row.get('metadata') or {}).get('article', '')}\n"
                f"{row.get('text', '')}"
            )
            for row in search_results
        )

        client = self._get_client()
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": self.SYSTEM_PROMPT.format(context=context)},
                {"role": "user", "content": normalized_query},
            ],
            temperature=0.1,
            max_tokens=2000,
        )

        answer = (response.choices[0].message.content or "").strip()
        usage = response.usage
        prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
        completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
        total_tokens = int(getattr(usage, "total_tokens", 0) or 0)

        if db:
            db.add(
                LLMUsage(
                    service="legal_rag",
                    model="gpt-4o",
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=total_tokens,
                    estimated_cost_usd=self._estimate_cost(
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                    ),
                    request_summary=normalized_query[:200],
                    user_id=user_id,
                )
            )
            db.commit()

        return {
            "tier": "L2",
            "answer": answer or "답변을 생성하지 못했습니다.",
            "sources": [
                {
                    "collection": row.get("collection"),
                    "text": str(row.get("text", ""))[:260],
                    "article": (row.get("metadata") or {}).get("article", ""),
                    "distance": row.get("distance"),
                }
                for row in search_results
            ],
            "rule_check": None,
            "tokens_used": total_tokens,
        }

    def get_usage_summary(self, db: Session, period: str = "month") -> dict[str, Any]:
        normalized = (period or "month").strip().lower()
        now = datetime.now()
        start_at: datetime | None = None

        if normalized == "week":
            start_at = now - timedelta(days=7)
        elif normalized == "month":
            start_at = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        elif normalized != "all":
            raise ValueError("period must be one of: month, week, all")

        base_query = db.query(LLMUsage)
        if start_at is not None:
            base_query = base_query.filter(LLMUsage.created_at >= start_at)

        rows = base_query.order_by(LLMUsage.created_at.desc()).limit(100).all()
        used_tokens = int(sum(int(row.total_tokens or 0) for row in rows))
        used_cost_usd = float(sum(float(row.estimated_cost_usd or 0.0) for row in rows))

        by_service_rows = (
            db.query(
                LLMUsage.service,
                func.coalesce(func.sum(LLMUsage.total_tokens), 0),
                func.coalesce(func.sum(LLMUsage.estimated_cost_usd), 0.0),
            )
            .filter(LLMUsage.created_at >= start_at) if start_at is not None else db.query(
                LLMUsage.service,
                func.coalesce(func.sum(LLMUsage.total_tokens), 0),
                func.coalesce(func.sum(LLMUsage.estimated_cost_usd), 0.0),
            )
        )
        by_service_rows = by_service_rows.group_by(LLMUsage.service).all()

        usage_pct = 0.0
        remaining_tokens = None
        if normalized == "month":
            remaining_tokens = max(0, self.monthly_limit - used_tokens)
            usage_pct = (used_tokens / self.monthly_limit * 100.0) if self.monthly_limit > 0 else 0.0

        return {
            "period": normalized,
            "used_tokens": used_tokens,
            "used_cost_usd": round(used_cost_usd, 6),
            "limit_tokens": self.monthly_limit if normalized == "month" else None,
            "remaining_tokens": remaining_tokens,
            "usage_pct": round(usage_pct, 2) if normalized == "month" else None,
            "records": [
                {
                    "id": row.id,
                    "service": row.service,
                    "model": row.model,
                    "prompt_tokens": int(row.prompt_tokens or 0),
                    "completion_tokens": int(row.completion_tokens or 0),
                    "total_tokens": int(row.total_tokens or 0),
                    "estimated_cost_usd": float(row.estimated_cost_usd or 0.0),
                    "request_summary": row.request_summary,
                    "user_id": row.user_id,
                    "created_at": row.created_at.isoformat() if row.created_at else None,
                }
                for row in rows
            ],
            "by_service": [
                {
                    "service": service,
                    "total_tokens": int(total_tokens or 0),
                    "estimated_cost_usd": float(total_cost or 0.0),
                }
                for service, total_tokens, total_cost in by_service_rows
            ],
        }

    def _try_rule_engine(self, query: str, fund_id: int, db: Session) -> dict[str, Any] | None:
        matched_prefix: str | None = None
        matched_keyword: str | None = None
        for keyword, rule_prefix in self.RULE_KEYWORDS.items():
            if keyword in query:
                matched_prefix = rule_prefix
                matched_keyword = keyword
                break
        if matched_prefix is None:
            return None

        rules = (
            db.query(FundComplianceRule)
            .filter(
                FundComplianceRule.rule_code.like(f"{matched_prefix}%"),
                FundComplianceRule.is_active == True,
                (FundComplianceRule.fund_id == fund_id) | (FundComplianceRule.fund_id.is_(None)),
            )
            .order_by(FundComplianceRule.rule_code.asc())
            .all()
        )
        if not rules:
            return None

        checks = [self.rule_engine.evaluate_rule(rule=rule, fund_id=fund_id, db=db) for rule in rules]
        status = "pass" if all(check.result == "pass" for check in checks) else "fail"
        return {
            "matched_keyword": matched_keyword,
            "status": status,
            "answer": self._format_rule_answer(rules, checks),
            "checks": [
                {
                    "rule_code": rule.rule_code,
                    "rule_name": rule.rule_name,
                    "result": check.result,
                    "detail": check.detail,
                }
                for rule, check in zip(rules, checks)
            ],
        }

    @staticmethod
    def _estimate_cost(prompt_tokens: int, completion_tokens: int) -> float:
        return (prompt_tokens * 2.5 / 1_000_000) + (completion_tokens * 10.0 / 1_000_000)

    @staticmethod
    def _format_rule_answer(rules: list[FundComplianceRule], checks: list[Any]) -> str:
        lines = ["[규칙 엔진 판단 결과]"]
        for rule, check in zip(rules, checks):
            lines.append(f"- {rule.rule_name}: {check.result}")
            if check.detail:
                lines.append(f"  근거: {check.detail}")
        return "\n".join(lines)
