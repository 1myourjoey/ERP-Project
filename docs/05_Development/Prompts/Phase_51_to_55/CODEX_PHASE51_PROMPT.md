# Phase 51: RAG + LLM 법률 해석 엔진

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P2  
**의존성:** Phase 49 (규칙엔진), Phase 50 (벡터DB)  
**LLM:** ✅ GPT-4o (법률 해석)  
**예상 파일 수:** 8개 | **AC:** 8개

---

## Part 0. 전수조사 (필수)

- [ ] `backend/services/vector_db.py` — Phase 50 벡터DB 서비스
- [ ] `backend/services/compliance_rule_engine.py` — Phase 49 규칙 엔진
- [ ] `backend/models/compliance.py` — ComplianceCheck 모델
- [ ] `backend/routers/compliance.py` — 기존 API
- [ ] `frontend/src/pages/CompliancePage.tsx` — 기존 UI

---

## Part 1. LLM 사용량 추적 모델

#### [NEW] `backend/models/llm_usage.py`

```python
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String, Float, Text
from sqlalchemy.sql import func
from database import Base


class LLMUsage(Base):
    """LLM 토큰 사용량 추적"""
    __tablename__ = "llm_usages"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    service = Column(String, nullable=False)          # "legal_rag", "marker_identifier" 등
    model = Column(String, nullable=False)            # "gpt-4o"
    
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    estimated_cost_usd = Column(Float, default=0.0)   # 예상 비용 (USD)
    
    request_summary = Column(String, nullable=True)    # 요청 요약
    user_id = Column(Integer, nullable=True)
    
    created_at = Column(DateTime, server_default=func.now())
```

---

## Part 2. RAG 서비스

#### [NEW] `backend/services/legal_rag.py`

```python
import json
from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from services.vector_db import VectorDBService
from services.compliance_rule_engine import ComplianceRuleEngine
from models.llm_usage import LLMUsage


class LegalRAGService:
    """2단 법률 해석 엔진
    
    L1: 규칙 엔진 (Phase 49) → 규칙으로 즉시 판단 가능하면 LLM 호출 없이 응답
    L2: RAG + GPT-4o → 벡터 검색 → 맥락 기반 법률 해석
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
    
    def __init__(self):
        self.client = AsyncOpenAI()
        self.vector_db = VectorDBService()
        self.rule_engine = ComplianceRuleEngine()
    
    async def interpret(
        self,
        query: str,
        fund_id: int | None = None,
        db: Session | None = None,
    ) -> dict:
        """2단 법률 해석
        
        Returns:
            {
                "tier": "L1" | "L2",
                "answer": "...",
                "sources": [{"collection": "laws", "text": "...", "article": "..."}],
                "rule_check": {...} | None,  # L1인 경우 규칙 평가 결과
                "tokens_used": 0,
            }
        """
        # ── L1: 규칙 엔진 먼저 시도 ──
        if fund_id and db:
            rule_result = self._try_rule_engine(query, fund_id, db)
            if rule_result:
                return {
                    "tier": "L1",
                    "answer": rule_result["answer"],
                    "sources": [],
                    "rule_check": rule_result,
                    "tokens_used": 0,
                }
        
        # ── L2: RAG + LLM ──
        # 1. 벡터 검색
        search_results = self.vector_db.search_all_collections(query, n_results=5)
        
        if not search_results:
            return {
                "tier": "L2",
                "answer": "관련 법률 문서를 찾지 못했습니다. 문서 라이브러리에 관련 법규를 등록해주세요.",
                "sources": [],
                "rule_check": None,
                "tokens_used": 0,
            }
        
        # 2. 컨텍스트 구성
        context = "\n\n---\n\n".join(
            f"[{r['collection']}] {r.get('metadata', {}).get('article', '')}\n{r['text']}"
            for r in search_results
        )
        
        # 3. GPT-4o 호출
        response = await self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": self.SYSTEM_PROMPT.format(context=context)},
                {"role": "user", "content": query},
            ],
            temperature=0.1,
            max_tokens=2000,
        )
        
        answer = response.choices[0].message.content
        usage = response.usage
        
        # 4. 사용량 기록
        if db:
            llm_usage = LLMUsage(
                service="legal_rag",
                model="gpt-4o",
                prompt_tokens=usage.prompt_tokens,
                completion_tokens=usage.completion_tokens,
                total_tokens=usage.total_tokens,
                estimated_cost_usd=self._estimate_cost(usage),
                request_summary=query[:200],
            )
            db.add(llm_usage)
            db.commit()
        
        return {
            "tier": "L2",
            "answer": answer,
            "sources": [
                {
                    "collection": r["collection"],
                    "text": r["text"][:200],
                    "article": r.get("metadata", {}).get("article", ""),
                    "distance": r.get("distance"),
                }
                for r in search_results
            ],
            "rule_check": None,
            "tokens_used": usage.total_tokens,
        }
    
    def _try_rule_engine(self, query: str, fund_id: int, db: Session) -> dict | None:
        """질의와 관련된 규칙이 있으면 규칙 엔진으로 답변"""
        # 키워드 기반 규칙 매칭
        keywords = {
            "투자한도": "INV-LIMIT",
            "보고서": "RPT-DEADLINE",
            "출자금": "CAP-CROSS",
            "수탁계약": "DOC-EXIST",
        }
        
        for kw, rule_prefix in keywords.items():
            if kw in query:
                from models.compliance import FundComplianceRule
                rules = db.query(FundComplianceRule).filter(
                    FundComplianceRule.rule_code.like(f"{rule_prefix}%"),
                    FundComplianceRule.is_active == True,
                ).all()
                
                if rules:
                    checks = [self.rule_engine.evaluate_rule(r, fund_id, db) for r in rules]
                    status = "pass" if all(c.result == "pass" for c in checks) else "fail"
                    return {
                        "answer": self._format_rule_answer(rules, checks),
                        "status": status,
                        "checks": [{"rule": r.rule_name, "result": c.result, "detail": c.detail} for r, c in zip(rules, checks)],
                    }
        return None
    
    def _estimate_cost(self, usage) -> float:
        """GPT-4o 비용 추정"""
        return (usage.prompt_tokens * 2.5 / 1_000_000) + (usage.completion_tokens * 10.0 / 1_000_000)
    
    def _format_rule_answer(self, rules, checks) -> str:
        """규칙 엔진 결과를 자연어 답변으로 포맷"""
        lines = ["[규칙 엔진 판단 결과]\n"]
        for rule, check in zip(rules, checks):
            icon = "✅" if check.result == "pass" else "❌"
            lines.append(f"{icon} {rule.rule_name}: {check.result}")
            if check.detail:
                lines.append(f"   → {check.detail}")
        return "\n".join(lines)
```

---

## Part 3. 토큰 한도 관리

```python
# backend/services/legal_rag.py 내부에 추가

LLM_MONTHLY_LIMIT = int(os.getenv("LLM_MONTHLY_LIMIT", "500000"))  # 기본 50만 토큰

async def check_monthly_limit(self, db: Session) -> bool:
    """월간 토큰 한도 초과 여부"""
    from datetime import datetime
    first_of_month = datetime.now().replace(day=1, hour=0, minute=0, second=0)
    total = db.query(func.sum(LLMUsage.total_tokens)).filter(
        LLMUsage.created_at >= first_of_month
    ).scalar() or 0
    return total < LLM_MONTHLY_LIMIT
```

---

## Part 4. API

#### [MODIFY] `backend/routers/compliance.py`

```python
@router.post("/api/compliance/interpret")
async def interpret_legal_query(
    query: str = Body(...),
    fund_id: int | None = Body(None),
    db: Session = Depends(get_db),
):
    """법률 해석 요청 (2단 체계)
    Returns: tier, answer, sources, tokens_used
    """
    service = LegalRAGService()
    
    # 월간 한도 체크
    if not await service.check_monthly_limit(db):
        raise HTTPException(429, "월간 LLM 토큰 한도 초과")
    
    return await service.interpret(query, fund_id, db)

@router.get("/api/compliance/llm-usage")
def get_llm_usage(
    period: str = "month",  # month, week, all
    db: Session = Depends(get_db),
):
    """LLM 토큰 사용 현황"""
    ...
```

---

## Part 5. 프론트엔드

#### [MODIFY] `frontend/src/pages/CompliancePage.tsx`

기존 페이지에 "법률 질의" 패널 추가:

```
┌─ 법률 질의 ────────────────────────────────────┐
│                                                 │
│  [투자한도에 대해 알려줘____________] [질의]      │
│                                                 │
│  조합 선택 (선택사항): [트리거-글로벌PEX ▼]       │
│  → 선택 시 규칙 엔진(L1) 우선 평가               │
│                                                 │
│  ── 답변 ──                                     │
│  [L1 규칙 엔진]                                  │
│  ✅ 동일 기업 투자한도 (20%): pass               │
│  ✅ 관계회사 투자제한: pass                       │
│                                                 │
│  ── 또는 ──                                     │
│  [L2 RAG + GPT-4o]                              │
│  자본시장법 제81조 제1항에 따르면...              │
│                                                 │
│  📜 근거 자료:                                   │
│  - 자본시장법 제81조 (유사도 0.95)               │
│  - 벤처투자법 시행령 제22조 (유사도 0.88)        │
│                                                 │
│  ── 토큰 사용 현황 ──                            │
│  이번 달: 23,400 / 500,000 (4.7%)               │
└─────────────────────────────────────────────────┘
```

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [NEW] | `backend/models/llm_usage.py` | LLM 사용량 추적 모델 |
| 2 | [NEW] | `backend/services/legal_rag.py` | 2단 RAG 서비스 (L1 규칙 → L2 LLM) |
| 3 | [MODIFY] | `backend/routers/compliance.py` | interpret + llm-usage API 추가 |
| 4 | [MODIFY] | `backend/models/__init__.py` | LLMUsage 등록 |
| 5 | [MODIFY] | `backend/main.py` | 환경변수 설정 |
| 6 | [MODIFY] | `frontend/src/pages/CompliancePage.tsx` | 법률 질의 패널 + 토큰 현황 |
| 7 | [MODIFY] | `frontend/src/lib/api.ts` | interpret, llm-usage API 함수 |
| 8 | [MODIFY] | `.env.example` | LLM_MONTHLY_LIMIT 추가 |

---

## Acceptance Criteria

- [ ] **AC-01:** 질의 시 L1(규칙 엔진)이 먼저 평가되고 매칭되면 LLM 없이 응답한다.
- [ ] **AC-02:** L1에서 매칭 안 되면 L2(RAG)로 벡터 검색 + GPT-4o 해석이 실행된다.
- [ ] **AC-03:** L2 응답에 근거 조항(출처 컬렉션, 조문, 유사도)이 포함된다.
- [ ] **AC-04:** LLMUsage에 토큰 사용량이 기록된다.
- [ ] **AC-05:** 월간 토큰 한도 초과 시 429 에러가 반환된다.
- [ ] **AC-06:** UI에서 법률 질의를 입력하고 답변을 확인할 수 있다.
- [ ] **AC-07:** 토큰 사용 현황이 UI에 표시된다.
- [ ] **AC-08:** fund_id 지정 시 해당 조합의 실제 데이터로 L1 규칙이 평가된다.
