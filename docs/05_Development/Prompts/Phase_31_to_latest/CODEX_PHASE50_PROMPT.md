# Phase 50: 문서 수집 + 벡터DB (ChromaDB)

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P2  
**의존성:** Phase 49 (ComplianceDocument 모델)  
**LLM:** ❌ (OpenAI Embedding만 사용)  
**추가 패키지:** `chromadb`, `pdfplumber`, `tiktoken`  
**예상 파일 수:** 8개 | **AC:** 7개

---

## Part 0. 전수조사 (필수)

- [ ] `backend/models/compliance.py` — ComplianceDocument 모델 (Phase 49)
- [ ] `backend/routers/compliance.py` — 기존 API
- [ ] `requirements.txt` — 현재 의존성 확인

---

## Part 1. ChromaDB 설정

#### [NEW] `backend/services/vector_db.py`

```python
import chromadb
from chromadb.config import Settings


class VectorDBService:
    """ChromaDB 벡터 DB 관리 — 법률 문서 인덱싱 및 검색"""
    
    # 5계층 컬렉션
    COLLECTIONS = {
        "laws": "법률 (자본시장법, 벤처투자법 등)",
        "regulations": "시행령/시행규칙",
        "guidelines": "금감원 가이드라인, 모범규준",
        "agreements": "조합 규약, 수탁계약",
        "internal": "내부 지침, 운용 매뉴얼",
    }
    
    def __init__(self, persist_directory: str = "./chroma_data"):
        self.client = chromadb.PersistentClient(
            path=persist_directory,
            settings=Settings(anonymized_telemetry=False),
        )
        self._init_collections()
    
    def _init_collections(self):
        """5계층 컬렉션 초기화"""
        for name, desc in self.COLLECTIONS.items():
            self.client.get_or_create_collection(
                name=name,
                metadata={"description": desc},
            )
    
    def add_chunks(self, collection_name: str, chunks: list[dict]):
        """청크를 벡터 DB에 추가
        
        Args:
            chunks: [{"id": "doc1_chunk_0", "text": "...", "metadata": {...}}]
        """
        collection = self.client.get_collection(collection_name)
        collection.add(
            ids=[c["id"] for c in chunks],
            documents=[c["text"] for c in chunks],
            metadatas=[c.get("metadata", {}) for c in chunks],
        )
    
    def search(self, collection_name: str, query: str, n_results: int = 5) -> list[dict]:
        """유사도 검색"""
        collection = self.client.get_collection(collection_name)
        results = collection.query(query_texts=[query], n_results=n_results)
        
        return [
            {
                "id": results["ids"][0][i],
                "text": results["documents"][0][i],
                "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                "distance": results["distances"][0][i] if results["distances"] else None,
            }
            for i in range(len(results["ids"][0]))
        ]
    
    def search_all_collections(self, query: str, n_results: int = 3) -> list[dict]:
        """전체 컬렉션에서 검색 후 통합 정렬"""
        all_results = []
        for name in self.COLLECTIONS:
            results = self.search(name, query, n_results)
            for r in results:
                r["collection"] = name
            all_results.extend(results)
        
        return sorted(all_results, key=lambda x: x.get("distance", 999))[:n_results * 2]
    
    def get_stats(self) -> dict:
        """인덱싱 현황 통계"""
        stats = {}
        for name in self.COLLECTIONS:
            collection = self.client.get_collection(name)
            stats[name] = {"count": collection.count(), "description": self.COLLECTIONS[name]}
        return stats
```

---

## Part 2. 문서 수집 파이프라인

#### [NEW] `backend/services/document_ingestion.py`

```python
import re
from io import BytesIO
import pdfplumber
from docx import Document

from services.vector_db import VectorDBService


class DocumentIngestionService:
    """법률 문서 수집 → 청킹 → 벡터 DB 인덱싱"""
    
    def __init__(self):
        self.vector_db = VectorDBService()
    
    def ingest(
        self,
        file_bytes: bytes,
        filename: str,
        collection_name: str,
        document_id: int,
        metadata: dict | None = None,
    ) -> int:
        """파일 → 텍스트 추출 → 법률 특화 청킹 → 벡터 DB 저장
        
        Returns: 인덱싱된 청크 수
        """
        # 1. 텍스트 추출
        ext = filename.rsplit(".", 1)[-1].lower()
        if ext == "pdf":
            text = self._extract_pdf(file_bytes)
        elif ext == "docx":
            text = self._extract_docx(file_bytes)
        else:
            raise ValueError(f"지원하지 않는 형식: {ext}")
        
        # 2. 법률 특화 청킹
        chunks = self._legal_chunking(text, document_id, metadata or {})
        
        # 3. 벡터 DB 저장
        self.vector_db.add_chunks(collection_name, chunks)
        
        return len(chunks)
    
    def _extract_pdf(self, file_bytes: bytes) -> str:
        """PDF에서 텍스트 추출"""
        with pdfplumber.open(BytesIO(file_bytes)) as pdf:
            return "\n\n".join(page.extract_text() or "" for page in pdf.pages)
    
    def _extract_docx(self, file_bytes: bytes) -> str:
        """DOCX에서 텍스트 추출"""
        doc = Document(BytesIO(file_bytes))
        return "\n\n".join(para.text for para in doc.paragraphs if para.text.strip())
    
    def _legal_chunking(self, text: str, document_id: int, metadata: dict) -> list[dict]:
        """법률 특화 청킹 — 조/항/호 단위로 분리
        
        법률 구조:
        제1조 (목적)  → 조 단위 청크
        ① ...         → 항 포함
        1. ...         → 호 포함
        
        일반 문서: 500자 슬라이딩 윈도우 (100자 오버랩)
        """
        # 조문 패턴 감지
        article_pattern = re.compile(r'제\d+조(?:의\d+)?\s*[\(（]')
        
        if article_pattern.search(text):
            return self._chunk_by_articles(text, document_id, metadata)
        else:
            return self._chunk_by_sliding_window(text, document_id, metadata, chunk_size=500, overlap=100)
    
    def _chunk_by_articles(self, text: str, doc_id: int, metadata: dict) -> list[dict]:
        """조문 단위 청킹"""
        article_pattern = re.compile(r'(제\d+조(?:의\d+)?\s*[\(（][^\)）]*[\)）])')
        parts = article_pattern.split(text)
        
        chunks = []
        current_article = ""
        for i, part in enumerate(parts):
            if article_pattern.match(part):
                current_article = part
            else:
                chunk_text = f"{current_article}\n{part}".strip()
                if len(chunk_text) > 50:
                    chunks.append({
                        "id": f"doc{doc_id}_art_{len(chunks)}",
                        "text": chunk_text,
                        "metadata": {**metadata, "article": current_article, "chunk_index": len(chunks)},
                    })
        
        return chunks
    
    def _chunk_by_sliding_window(self, text, doc_id, metadata, chunk_size, overlap):
        """슬라이딩 윈도우 청킹"""
        chunks = []
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunk_text = text[start:end]
            if len(chunk_text.strip()) > 50:
                chunks.append({
                    "id": f"doc{doc_id}_sw_{len(chunks)}",
                    "text": chunk_text,
                    "metadata": {**metadata, "chunk_index": len(chunks)},
                })
            start += chunk_size - overlap
        return chunks
```

---

## Part 3. API

#### [NEW] `backend/routers/legal_documents.py`

```python
@router.post("/api/legal-documents/upload")
async def upload_legal_document(
    file: UploadFile,
    title: str = Form(...),
    document_type: str = Form(...),   # laws, regulations, guidelines, agreements, internal
    version: str = Form(None),
    db: Session = Depends(get_db),
):
    """법률 문서 업로드 + 인덱싱
    
    1. ComplianceDocument 생성
    2. 파일 저장
    3. DocumentIngestionService로 벡터 DB 인덱싱
    4. 인덱싱 결과 반환
    """
    ...

@router.get("/api/legal-documents/search")
def search_legal_documents(
    query: str,
    collection: str | None = None,
    n_results: int = 5,
):
    """자연어 법률 검색
    
    collection 지정 시 해당 컬렉션만, 미지정 시 전체 검색
    """
    ...

@router.get("/api/legal-documents/stats")
def get_indexing_stats():
    """인덱싱 현황 통계"""
    ...

@router.get("/api/legal-documents")
def list_legal_documents(db: Session = Depends(get_db)):
    """등록된 법률 문서 목록"""
    ...
```

---

## Part 4. 프론트엔드

#### [NEW] `frontend/src/components/compliance/DocumentLibrary.tsx`

```
┌─ 법률 문서 라이브러리 ──────────────────────────────┐
│                                                     │
│  [업로드] [검색: _________________ 🔍]               │
│                                                     │
│  인덱싱 현황:                                       │
│  법률 24건 | 시행령 12건 | 가이드라인 8건 |          │
│  규약 5건 | 내부지침 3건                             │
│                                                     │
│  ┌──────────────────────────────────────────┐       │
│  │ 유형      │ 제목          │ 버전    │ 청크│       │
│  │ 법률      │ 자본시장법     │ 2024개정│ 342│       │
│  │ 법률      │ 벤처투자법     │ 2023개정│ 156│       │
│  │ 규약      │ A조합 규약     │ v2.0    │ 28 │       │
│  └──────────────────────────────────────────┘       │
│                                                     │
│  검색 결과 (query: "투자한도"):                       │
│  ┌────────────────────────────────────────┐          │
│  │ 📜 자본시장법 제81조 (투자한도 제한)     │          │
│  │ "... 동일 기업에 대한 투자는 ..."       │          │
│  │ 유사도: 0.92                           │          │
│  └────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────┘
```

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [NEW] | `backend/services/vector_db.py` | ChromaDB 클라이언트 + 5계층 컬렉션 |
| 2 | [NEW] | `backend/services/document_ingestion.py` | 문서 수집 + 법률 청킹 파이프라인 |
| 3 | [NEW] | `backend/routers/legal_documents.py` | 문서 업로드/검색/통계 API |
| 4 | [NEW] | `frontend/src/components/compliance/DocumentLibrary.tsx` | 문서 라이브러리 UI |
| 5 | [MODIFY] | `frontend/src/pages/CompliancePage.tsx` | 문서 라이브러리 탭 추가 |
| 6 | [MODIFY] | `frontend/src/lib/api.ts` | 법률문서 API 함수 |
| 7 | [MODIFY] | `backend/main.py` | 라우터 등록 |
| 8 | [MODIFY] | `requirements.txt` | chromadb, pdfplumber 추가 |

---

## Acceptance Criteria

- [ ] **AC-01:** ChromaDB가 초기화되고 5계층 컬렉션이 생성된다.
- [ ] **AC-02:** PDF 파일이 텍스트 추출 + 법률 청킹으로 인덱싱된다.
- [ ] **AC-03:** DOCX 파일이 인덱싱된다.
- [ ] **AC-04:** 조문 패턴(제N조)이 있는 문서는 조문 단위로 청킹된다.
- [ ] **AC-05:** 자연어 검색 시 유사도 기반으로 관련 청크가 반환된다.
- [ ] **AC-06:** 인덱싱 현황(컬렉션별 청크 수)이 조회된다.
- [ ] **AC-07:** UI에서 문서 업로드, 검색, 현황 확인이 가능하다.
