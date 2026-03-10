from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.compliance import FundComplianceRule
from models.fund import Fund
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

## 역할
- 자본시장법, 벤처투자법, 금감원 가이드라인 등 VC 펀드 관련 법률 해석 전문가
- 실무진이 이해할 수 있도록 명확하고 구체적으로 답변

## 답변 규칙
1. 반드시 근거 조항을 명시하세요 (예: "자본시장법 제81조 제1항에 따르면...")
2. 컨텍스트에 없는 내용은 "제공된 문서에서 확인되지 않습니다"로 답변
3. 관련 조항이 여러 개일 경우 모두 인용하세요
4. 실무적 권고사항이 있다면 별도 섹션으로 제안
5. 답변은 한국어로 작성
6. 불확실한 해석에는 "⚠️ 확인 필요" 표시를 추가하세요
7. 한 문서의 여러 조항이 관련될 경우 상호 관계를 설명하세요

## 답변 구조
1. **요약**: 핵심 답변 1-2문장
2. **근거**: 관련 법조항 인용 및 해석
3. **실무 참고**: 실무 적용 시 유의사항 (해당 시)

## 컨텍스트
아래는 질의와 관련하여 검색된 법률 문서의 관련 조항입니다:

{context}
"""

    RULE_KEYWORDS: dict[str, str] = {
        "투자한도": "INV-LIMIT",
        "보고서": "RPT-DEADLINE",
        "보고": "RPT-DEADLINE",
        "출자금": "CAP-CROSS",
        "수탁계약": "DOC-EXIST",
        "확약계약": "DOC-EXIST",
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
        investment_id: int | None = None,
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

        fund_type: str | None = None
        fund_name: str | None = None
        if fund_id and db:
            fund = db.get(Fund, fund_id)
            if fund:
                fund_type = (fund.type or "").strip() or None
                fund_name = fund.name

        if fund_id:
            search_results = self._get_vector_db().search_with_scope(
                query=normalized_query,
                fund_id=fund_id,
                fund_type=fund_type,
                investment_id=investment_id,
                n_results=10,
            )
        else:
            search_results = self._get_vector_db().search_all_collections(normalized_query, n_results=10)

        # Filter out low-relevance results (distance threshold)
        distance_threshold = 1.5
        filtered_results = [
            row for row in search_results
            if row.get("distance") is not None and float(row["distance"]) < distance_threshold
        ]
        # Fall back to top results if all are filtered out
        if not filtered_results and search_results:
            filtered_results = search_results[:3]

        if not filtered_results:
            return {
                "tier": "L2",
                "answer": "관련 법률 문서를 찾지 못했습니다. 문서 라이브러리에 관련 법규를 등록해주세요.",
                "sources": [],
                "rule_check": None,
                "tokens_used": 0,
            }

        collection_labels = {
            "laws": "법률",
            "regulations": "시행령/시행규칙",
            "guidelines": "가이드라인",
            "agreements": "규약/계약",
            "internal": "내부지침",
        }
        scope_labels = {
            "global": "🌐 공통 법령",
            "fund_type": "📋 조합유형별 가이드",
            "fund": "🏢 조합 개별 문서",
        }

        context = "\n\n---\n\n".join(
            (
                f"📄 문서유형: {collection_labels.get(row.get('collection', ''), row.get('collection', ''))}\n"
                f"🗂 적용범위: {scope_labels.get(((row.get('metadata') or {}).get('scope') or 'global'), '🌐 공통 법령')}\n"
                f"📌 제목/조항: {(row.get('metadata') or {}).get('title', '')} "
                f"{(row.get('metadata') or {}).get('article', '')}\n"
                f"📊 관련도: {1.0 - min(float(row.get('distance', 0)), 1.0):.0%}\n"
                f"\n{row.get('text', '')}"
            )
            for row in filtered_results
        )

        fund_context = ""
        if fund_name:
            fund_context = (
                "\n\n## 질의 대상 조합\n"
                f"- 조합명: {fund_name}\n"
                f"- 유형: {fund_type or '미지정'}\n"
            )

        client = self._get_client()
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": self.SYSTEM_PROMPT.format(context=context) + fund_context},
                {"role": "user", "content": normalized_query},
            ],
            temperature=0.1,
            max_tokens=3000,
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
                    "title": (row.get("metadata") or {}).get("title", ""),
                    "article": (row.get("metadata") or {}).get("article", ""),
                    "scope": (row.get("metadata") or {}).get("scope") or "global",
                    "distance": row.get("distance"),
                    "relevance": round(1.0 - min(float(row.get("distance", 0)), 1.0), 2),
                }
                for row in filtered_results
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
        lines = ["[규칙 엔진 진단 결과]"]
        for rule, check in zip(rules, checks):
            lines.append(f"- {rule.rule_name}: {check.result}")
            if check.detail:
                lines.append(f"  근거: {check.detail}")
        return "\n".join(lines)
