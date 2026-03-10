from __future__ import annotations

import json
import os
from typing import Any

from sqlalchemy.orm import Session

from models.compliance import (
    ComplianceDocument,
    ComplianceDocumentChunk,
    ComplianceReviewEvidence,
    ComplianceReviewRun,
)
from models.fund import Fund
from models.investment import Investment
from services.vector_db import VectorDBService

try:
    from openai import AsyncOpenAI
except Exception:  # pragma: no cover - optional at runtime
    AsyncOpenAI = None  # type: ignore


class ComplianceEvidenceEngine:
    """Document-grounded compliance review engine with source-tier precedence."""

    DEFAULT_SCENARIO_QUERY = {
        "investment_precheck": (
            "이 투자 실행이 관련 법령, 해당 조합 규약, 특별조합원 가이드라인, 해당 투자계약서에 비추어 "
            "허용되는지 검토해줘. 금지, 한도, 사전승인, 통지, 의결권, 투자자 보호조항을 중심으로 봐줘."
        ),
        "report_precheck": (
            "이 보고 제출이 관련 법령, 해당 조합 규약, 특별조합원 가이드라인, 해당 투자계약서에 비추어 "
            "필요한 보고, 통지, 사전협의, 기한 준수 의무를 충족하는지 검토해줘."
        ),
        "fund_document_check": (
            "이 문서 변경이 관련 법령, 해당 조합 규약, 특별조합원 가이드라인에 비추어 "
            "유효한지, 상위 기준과 충돌이 없는지 검토해줘."
        ),
    }

    SYSTEM_PROMPT = """당신은 벤처캐피탈 조합 준법감시 검토 엔진이다.

우선순위 규칙:
1. 법령(source_tier=law)
2. 조합 규약(source_tier=fund_bylaw)
3. 특별조합원 가이드라인(source_tier=special_guideline)
4. 투자계약서(source_tier=investment_contract)

해석 규칙:
- 하위 문서는 상위 문서를 덮어쓸 수 없다.
- 특별조합원 가이드라인은 기본적으로 권고 기준이다.
- 특별조합원 가이드라인 단독 이슈는 기본 result=warn 이다.
- 하위 문서가 상위 문서와 충돌하면 result=conflict 로 판정한다.
- 상위 문서 위반이 명확하면 result=fail 이다.
- 명시적 위반은 없지만 해석 또는 추가 확인이 필요하면 result=needs_review 이다.
- 충돌 없고 허용 가능하면 result=pass 또는 warn 을 사용한다.
- 반드시 아래 JSON 형식만 반환한다.

{
  "result": "pass|warn|fail|conflict|needs_review",
  "prevailing_tier": "law|fund_bylaw|special_guideline|investment_contract|null",
  "summary": "한글 요약",
  "supporting_ids": ["e1", "e2"],
  "contradicting_ids": ["e3"],
  "prevailing_ids": ["e1"]
}
"""

    def __init__(self):
        self._vector_db: VectorDBService | None = None
        self._client: AsyncOpenAI | None = None  # type: ignore[assignment]

    def _get_vector_db(self) -> VectorDBService:
        if self._vector_db is None:
            self._vector_db = VectorDBService()
        return self._vector_db

    def _get_client(self):
        api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
        if not api_key or AsyncOpenAI is None:
            return None
        if self._client is None:
            self._client = AsyncOpenAI(api_key=api_key)
        return self._client

    async def run_review(
        self,
        *,
        db: Session,
        fund_id: int,
        scenario: str,
        query: str | None = None,
        investment_id: int | None = None,
        trigger_type: str = "manual",
        created_by: int | None = None,
    ) -> dict[str, Any]:
        fund = db.get(Fund, fund_id)
        if not fund:
            raise ValueError("fund not found")

        investment = db.get(Investment, investment_id) if investment_id else None
        company_id = investment.company_id if investment else None
        normalized_query = (query or "").strip() or self.DEFAULT_SCENARIO_QUERY.get(scenario, "").strip()
        if not normalized_query:
            raise ValueError("query is required")

        evidence_candidates = self._get_vector_db().search_with_scope(
            query=normalized_query,
            fund_id=fund_id,
            fund_type=(fund.type or "").strip() or None,
            investment_id=investment_id,
            n_results=12,
        )

        review = ComplianceReviewRun(
            fund_id=fund_id,
            investment_id=investment_id,
            company_id=company_id,
            target_type="investment" if investment_id else "fund",
            scenario=scenario,
            query=normalized_query,
            trigger_type=(trigger_type or "manual").strip() or "manual",
            review_status="completed",
            created_by=created_by,
        )
        db.add(review)
        db.flush()

        if not evidence_candidates:
            review.result = "needs_review"
            review.prevailing_tier = None
            review.summary = "관련 문서 근거를 찾지 못했습니다. 문서 업로드 또는 수동 검토가 필요합니다."
            return self._serialize_review(review=review, evidence_rows=[])

        evidence_map = self._build_evidence_map(db=db, results=evidence_candidates)
        llm_payload = await self._classify_with_llm(
            query=normalized_query,
            fund=fund,
            investment=investment,
            evidence_map=evidence_map,
        )

        review.result = llm_payload["result"]
        review.prevailing_tier = llm_payload["prevailing_tier"]
        review.summary = llm_payload["summary"]

        persisted_rows: list[ComplianceReviewEvidence] = []
        for evidence_id, row in evidence_map.items():
            role = "supporting"
            if evidence_id in llm_payload["prevailing_ids"]:
                role = "prevailing"
            elif evidence_id in llm_payload["contradicting_ids"]:
                role = "contradicting"

            evidence = ComplianceReviewEvidence(
                review_run_id=review.id,
                document_id=row["document_id"],
                chunk_id=row.get("chunk_id"),
                source_tier=row["source_tier"],
                role=role,
                page_no=row.get("page_no"),
                section_ref=row.get("section_ref"),
                snippet=row["snippet"],
                relevance_score=row.get("relevance_score"),
                metadata_json=row.get("metadata"),
            )
            db.add(evidence)
            persisted_rows.append(evidence)

        db.flush()
        return self._serialize_review(review=review, evidence_rows=persisted_rows)

    def _build_evidence_map(
        self,
        *,
        db: Session,
        results: list[dict[str, Any]],
    ) -> dict[str, dict[str, Any]]:
        evidence_map: dict[str, dict[str, Any]] = {}
        for index, row in enumerate(results, start=1):
            metadata = row.get("metadata") or {}
            document_id = int(metadata.get("document_id") or 0)
            document = db.get(ComplianceDocument, document_id) if document_id else None
            if document is None:
                continue
            chunk_key = str(row.get("id") or "")
            chunk = (
                db.query(ComplianceDocumentChunk)
                .filter(ComplianceDocumentChunk.chunk_key == chunk_key)
                .first()
            )
            evidence_map[f"e{index}"] = {
                "document_id": document.id,
                "chunk_id": chunk.id if chunk else None,
                "title": document.title,
                "source_tier": document.source_tier,
                "scope": document.scope,
                "page_no": metadata.get("page_no") or (chunk.page_no if chunk else None),
                "section_ref": metadata.get("section_ref") or (chunk.section_ref if chunk else None),
                "snippet": str(row.get("text") or "")[:1000],
                "relevance_score": None if row.get("distance") is None else round(1.0 - min(float(row["distance"]), 1.0), 4),
                "metadata": metadata,
            }
        return evidence_map

    async def _classify_with_llm(
        self,
        *,
        query: str,
        fund: Fund,
        investment: Investment | None,
        evidence_map: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        evidence_tiers = {str(row["source_tier"]) for row in evidence_map.values()}
        fallback_result = "warn" if evidence_tiers == {"special_guideline"} else "needs_review"
        fallback = {
            "result": fallback_result,
            "prevailing_tier": next(iter({row["source_tier"] for row in evidence_map.values()}), None),
            "summary": (
                "특별조합원 가이드라인 기준으로 확인이 필요합니다."
                if evidence_tiers == {"special_guideline"}
                else "자동 해석 모델이 없거나 응답을 구조화하지 못해 수동 검토가 필요합니다."
            ),
            "supporting_ids": list(evidence_map.keys())[:3],
            "contradicting_ids": [],
            "prevailing_ids": [],
        }
        client = self._get_client()
        if client is None:
            return fallback

        context = []
        for evidence_id, row in evidence_map.items():
            context.append(
                (
                    f"[{evidence_id}] tier={row['source_tier']} scope={row['scope']} "
                    f"title={row['title']} section={row.get('section_ref') or '-'} page={row.get('page_no') or '-'}\n"
                    f"{row['snippet']}"
                )
            )

        user_prompt = (
            f"검토 시나리오: {scenario_label(investment)}\n"
            f"조합명: {fund.name}\n"
            f"조합유형: {fund.type or '-'}\n"
            f"투자건ID: {investment.id if investment else '-'}\n"
            f"질의: {query}\n\n"
            f"근거 문서:\n" + "\n\n".join(context)
        )

        response = await client.chat.completions.create(
            model=os.getenv("OPENAI_COMPLIANCE_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": self.SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        content = (response.choices[0].message.content or "").strip()
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            return fallback

        result = str(parsed.get("result") or fallback["result"]).strip().lower()
        if result not in {"pass", "warn", "fail", "conflict", "needs_review"}:
            result = fallback["result"]
        prevailing_tier = parsed.get("prevailing_tier")
        if prevailing_tier not in {"law", "fund_bylaw", "special_guideline", "investment_contract", None}:
            prevailing_tier = None
        return {
            "result": result,
            "prevailing_tier": prevailing_tier,
            "summary": str(parsed.get("summary") or fallback["summary"]).strip(),
            "supporting_ids": [item for item in (parsed.get("supporting_ids") or []) if item in evidence_map],
            "contradicting_ids": [item for item in (parsed.get("contradicting_ids") or []) if item in evidence_map],
            "prevailing_ids": [item for item in (parsed.get("prevailing_ids") or []) if item in evidence_map],
        }

    @staticmethod
    def _serialize_review(
        *,
        review: ComplianceReviewRun,
        evidence_rows: list[ComplianceReviewEvidence],
    ) -> dict[str, Any]:
        return {
            "id": review.id,
            "fund_id": review.fund_id,
            "investment_id": review.investment_id,
            "company_id": review.company_id,
            "target_type": review.target_type,
            "scenario": review.scenario,
            "query": review.query,
            "trigger_type": review.trigger_type,
            "result": review.result,
            "prevailing_tier": review.prevailing_tier,
            "summary": review.summary,
            "review_status": review.review_status,
            "created_by": review.created_by,
            "created_at": review.created_at.isoformat() if review.created_at else None,
            "evidence": [
                {
                    "id": row.id,
                    "document_id": row.document_id,
                    "chunk_id": row.chunk_id,
                    "source_tier": row.source_tier,
                    "role": row.role,
                    "page_no": row.page_no,
                    "section_ref": row.section_ref,
                    "snippet": row.snippet,
                    "relevance_score": row.relevance_score,
                    "metadata": row.metadata_json if isinstance(row.metadata_json, dict) else {},
                }
                for row in evidence_rows
            ],
        }


def scenario_label(investment: Investment | None) -> str:
    return "investment_precheck" if investment else "fund_document_check"
