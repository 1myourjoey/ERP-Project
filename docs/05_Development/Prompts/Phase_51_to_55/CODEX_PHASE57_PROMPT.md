# Phase 57: 스코프 인식 법률 RAG — 조합 맥락 기반 검색 · 답변 고도화

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P1  
**의존성:** Phase 56 (문서 스코프 분류) 완료 후  
**LLM:** ❌  
**예상 파일 수:** 5개 | **AC:** 8개

---

## 배경

Phase 56에서 문서에 스코프(`global`/`fund_type`/`fund`)와 `fund_id`를 부여했다.  
이제 AI 법률 질의(법률 해석) 시 **조합 맥락을 인식하여 관련 문서만 검색**해야 한다.

### 검색 스코프 로직

사용자가 "A조합의 투자한도가 어떻게 되나요?"라고 질문할 때:

```
1. global 문서 → 항상 검색 (자본시장법, 벤촉법 등)
2. fund_type 문서 → A조합의 유형에 맞는 가이드라인만 검색
3. fund 문서 → A조합 귀속 규약/계약만 검색
```

조합이 지정되지 않은 일반 질문 → global 문서만 검색

---

## Part 0. 전수조사 (필수)

- [ ] `backend/services/legal_rag.py` — `LegalRAGService.interpret()` 현재 로직
- [ ] `backend/services/vector_db.py` — `search()`, `search_all_collections()` 현재 로직
- [ ] `backend/models/compliance.py` — Phase 56에서 추가된 scope, fund_id 필드
- [ ] `backend/models/fund.py` — Fund 모델의 `type` 필드 (조합 유형)
- [ ] `frontend/src/pages/CompliancePage.tsx` — 법률 질의 UI (조합 선택 부분)

---

## Part 1. 벡터 DB 스코프 검색

#### [MODIFY] `backend/services/vector_db.py`

기존 `search_all_collections`에 메타데이터 필터를 지원하는 스코프 인식 검색 메서드를 추가:

```python
def search_with_scope(
    self,
    query: str,
    fund_id: int | None = None,
    fund_type: str | None = None,
    n_results: int = 10,
) -> list[dict[str, Any]]:
    """스코프 인식 검색.
    
    검색 우선순위:
    1. global 문서 (모든 컬렉션에서 scope=global인 청크)
    2. fund_type 문서 (fund_type이 일치하는 가이드라인)
    3. fund 문서 (fund_id가 일치하는 규약/계약/내부지침)
    
    fund_id가 None이면 global 문서만 검색.
    """
    self._require_embedding()
    all_rows: list[dict[str, Any]] = []
    
    # 1단계: 모든 컬렉션에서 global 스코프 검색
    for name in self.COLLECTIONS:
        collection = self._get_collection(name)
        try:
            result = collection.query(
                query_texts=[query],
                n_results=n_results,
                where={"scope": "global"},
            )
            rows = self._parse_query_result(result)
            for row in rows:
                row["collection"] = name
            all_rows.extend(rows)
        except Exception:
            # scope 메타데이터가 없는 레거시 청크 → 일반 검색 fallback
            result = collection.query(query_texts=[query], n_results=n_results)
            rows = self._parse_query_result(result)
            for row in rows:
                row["collection"] = name
            all_rows.extend(rows)
    
    # 2단계: fund_type 스코프 (가이드라인)
    if fund_type:
        try:
            guidelines = self._get_collection("guidelines")
            result = guidelines.query(
                query_texts=[query],
                n_results=n_results,
                where={"$and": [
                    {"scope": "fund_type"},
                    {"fund_type_filter": fund_type},
                ]},
            )
            rows = self._parse_query_result(result)
            for row in rows:
                row["collection"] = "guidelines"
            all_rows.extend(rows)
        except Exception:
            pass
    
    # 3단계: fund 스코프 (개별 조합 규약/계약)
    if fund_id is not None:
        for name in ("agreements", "internal"):
            try:
                collection = self._get_collection(name)
                result = collection.query(
                    query_texts=[query],
                    n_results=n_results,
                    where={"$and": [
                        {"scope": "fund"},
                        {"fund_id": int(fund_id)},
                    ]},
                )
                rows = self._parse_query_result(result)
                for row in rows:
                    row["collection"] = name
                all_rows.extend(rows)
            except Exception:
                pass
    
    # 거리순 정렬 후 상위 반환
    def _dist(row: dict[str, Any]) -> float:
        v = row.get("distance")
        return float(v) if isinstance(v, (int, float)) else 999999.0
    
    return sorted(all_rows, key=_dist)[:n_results * 2]


def _parse_query_result(self, result: dict) -> list[dict[str, Any]]:
    """ChromaDB query 결과를 표준 dict 리스트로 변환."""
    ids = result.get("ids") or [[]]
    docs = result.get("documents") or [[]]
    metadatas = result.get("metadatas") or [[]]
    distances = result.get("distances") or [[]]
    
    rows: list[dict[str, Any]] = []
    for idx, chunk_id in enumerate(ids[0]):
        rows.append({
            "id": chunk_id,
            "text": docs[0][idx] if idx < len(docs[0]) else "",
            "metadata": metadatas[0][idx] if idx < len(metadatas[0]) else {},
            "distance": distances[0][idx] if idx < len(distances[0]) else None,
        })
    return rows
```

> **중요:** 기존 `search()` 및 `search_all_collections()` 메서드는 **그대로 유지**한다 (다른 곳에서 사용 중).

---

## Part 2. 법률 RAG 서비스에 스코프 적용

#### [MODIFY] `backend/services/legal_rag.py`

`interpret()` 메서드에서 fund_id가 주어지면 스코프 인식 검색을 사용:

```python
async def interpret(
    self,
    query: str,
    fund_id: int | None = None,
    db: Session | None = None,
    user_id: int | None = None,
) -> dict[str, Any]:
    # ... (기존 L1 규칙 엔진 체크 유지)
    
    # L2: 스코프 인식 벡터 검색
    fund_type: str | None = None
    fund_name: str | None = None
    if fund_id and db:
        fund = db.get(Fund, fund_id)
        if fund:
            fund_type = fund.type   # 조합 유형 (예: "벤처투자조합")
            fund_name = fund.name
    
    if fund_id:
        # 스코프 인식 검색: global + fund_type + fund별 문서
        search_results = self._get_vector_db().search_with_scope(
            query=normalized_query,
            fund_id=fund_id,
            fund_type=fund_type,
            n_results=10,
        )
    else:
        # 조합 미지정 → 기존 전체 검색
        search_results = self._get_vector_db().search_all_collections(
            normalized_query, n_results=10,
        )
    
    # ... (이후 distance 필터링, 컨텍스트 포맷, GPT 호출 등 기존 로직 유지)
```

---

## Part 3. 시스템 프롬프트에 조합 맥락 추가

#### [MODIFY] `backend/services/legal_rag.py`

GPT에 전달하는 시스템 프롬프트에 조합 맥락 정보를 추가:

```python
# interpret() 내부, GPT 호출 직전
fund_context = ""
if fund_name:
    fund_context = f"\n\n## 질의 대상 조합\n- 조합명: {fund_name}\n- 유형: {fund_type or '미지정'}\n"

messages = [
    {"role": "system", "content": self.SYSTEM_PROMPT.format(context=context) + fund_context},
    {"role": "user", "content": normalized_query},
]
```

---

## Part 4. 컨텍스트 포맷에 스코프 표시 추가

#### [MODIFY] `backend/services/legal_rag.py`

검색 결과 컨텍스트에 스코프 정보를 표시하여 GPT가 문서 적용 범위를 인식:

```python
scope_labels = {
    "global": "🌐 공통 법령",
    "fund_type": "📋 조합유형별 가이드",
    "fund": "🏢 조합 개별 문서",
}

context = "\n\n---\n\n".join(
    (
        f"📄 문서유형: {collection_labels.get(row.get('collection', ''), row.get('collection', ''))}\n"
        f"🔒 적용범위: {scope_labels.get((row.get('metadata') or {}).get('scope', 'global'), '공통')}\n"
        f"📌 제목/조항: {(row.get('metadata') or {}).get('title', '')} "
        f"{(row.get('metadata') or {}).get('article', '')}\n"
        f"📊 관련도: {1.0 - min(float(row.get('distance', 0)), 1.0):.0%}\n"
        f"\n{row.get('text', '')}"
    )
    for row in filtered_results
)
```

---

## Part 5. 법률 질의 UI 개선

#### [MODIFY] `frontend/src/pages/CompliancePage.tsx`

법률 질의 섹션에서 조합 선택이 답변 품질에 미치는 영향을 사용자에게 안내:

```
┌─ 법률 질의 (AI 해석) ───────────────────────────────────────┐
│                                                              │
│  질의 내용: [________________________________]               │
│                                                              │
│  대상 조합: [전체 (공통법률만) ▼]    [질의하기]               │
│             ├ 전체 (공통법률만)                               │
│             ├ A조합 (공통 + A조합 규약/계약 포함)             │
│             ├ B조합 (공통 + B조합 규약/계약 포함)             │
│             └ ...                                            │
│                                                              │
│  ℹ️ 조합을 선택하면 해당 조합의 규약, 계약, 가이드라인도      │
│     함께 검색하여 더 정확한 답변을 제공합니다.                │
│                                                              │
│  ── 답변 ──                                                  │
│  ## 요약                                                     │
│  자본시장법 제81조에 따르면 ...                               │
│                                                              │
│  ## 근거                                                     │
│  📄 자본시장법 제81조 (🌐 공통) ...                          │
│  📄 A조합 규약 제15조 (🏢 조합 개별) ...                     │
│                                                              │
│  ## 실무 참고                                                │
│  A조합 규약에서 별도 한도를 설정하고 있으므로 ...             │
│                                                              │
│  ── 참조 문서 ──                                             │
│  🌐 자본시장법 제81조 (유사도 95%)                           │
│  🏢 A조합 규약 제15조 (유사도 88%)                           │
│  📋 벤처조합 가이드라인 3.2항 (유사도 72%)                   │
└──────────────────────────────────────────────────────────────┘
```

**답변 source에 스코프 아이콘 표시:**
- 프론트엔드에서 `sources` 배열의 `scope` 필드를 읽어 아이콘(🌐/📋/🏢) 추가

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [MODIFY] | `backend/services/vector_db.py` | `search_with_scope()`, `_parse_query_result()` 추가 |
| 2 | [MODIFY] | `backend/services/legal_rag.py` | 스코프 인식 검색 + 조합 맥락 프롬프트 + 스코프 표시 |
| 3 | [MODIFY] | `backend/routers/compliance.py` | interpret 엔드포인트에 Fund 모델 import 확인 |
| 4 | [MODIFY] | `frontend/src/pages/CompliancePage.tsx` | 법률 질의 UI에 조합 선택 안내 개선 |
| 5 | [MODIFY] | `frontend/src/lib/api.ts` | interpret 응답 타입에 scope 필드 추가 |

---

## Acceptance Criteria

- [ ] **AC-01:** fund_id가 주어지면 `search_with_scope()`가 global + fund_type + fund 청크를 모두 검색한다.
- [ ] **AC-02:** fund_id가 없으면 기존처럼 `search_all_collections()`로 전체 검색한다.
- [ ] **AC-03:** A조합 선택 시 B조합의 규약/계약 청크는 검색 결과에 포함되지 않는다.
- [ ] **AC-04:** 벤처투자조합 유형인 A조합 질의 시 벤처조합 가이드라인이 검색 결과에 포함된다.
- [ ] **AC-05:** GPT 시스템 프롬프트에 조합명과 유형이 포함된다.
- [ ] **AC-06:** 컨텍스트에 스코프 레이블(🌐/📋/🏢)이 표시된다.
- [ ] **AC-07:** 프론트엔드 법률 질의 답변의 참조 문서에 스코프 아이콘이 표시된다.
- [ ] **AC-08:** scope 메타데이터가 없는 레거시 청크에 대해서도 검색이 정상 동작한다 (fallback).
