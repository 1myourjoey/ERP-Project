# Phase 56: 준법 문서 라이브러리 고도화 — 문서 삭제 · 스코프 분류 · 조합 연결

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P1  
**의존성:** Phase 55 (통합 준법감시 대시보드) 완료 후  
**LLM:** ❌  
**예상 파일 수:** 8개 | **AC:** 10개

---

## 배경

현재 준법 문서 라이브러리의 한계:
1. **삭제 불가** — 업로드한 문서를 삭제할 수 없음
2. **스코프 구분 없음** — 법률/시행령은 모든 조합에 공통 적용이지만, 가이드라인은 조합 유형별, 규약/계약은 조합별 개별 문서임

### 문서 스코프 분류 체계

| 스코프 | 컬렉션 | 설명 | 예시 |
|--------|--------|------|------|
| `global` | `laws`, `regulations` | 전체 조합 공통 적용 | 벤촉법, 자본시장법, 상법, 여신법, 민법 시행령 등 |
| `fund_type` | `guidelines` | 조합 유형별 적용 | 벤처조합 가이드라인, 신기술조합 모범규준 등 |
| `fund` | `agreements`, `internal` | 개별 조합에 귀속 | A조합 규약, B조합 수탁계약, 투자계약 등 |

---

## Part 0. 전수조사 (필수)

- [ ] `backend/models/compliance.py` — `ComplianceDocument` 모델
- [ ] `backend/routers/legal_documents.py` — 문서 업로드/검색/목록 API
- [ ] `backend/services/document_ingestion.py` — 문서 청킹/인덱싱 서비스
- [ ] `backend/services/vector_db.py` — ChromaDB 벡터 저장/검색
- [ ] `frontend/src/components/compliance/DocumentLibrary.tsx` — 문서 라이브러리 UI
- [ ] `frontend/src/lib/api.ts` — `LegalDocument` 관련 타입 & API 함수

---

## Part 1. 모델 확장 — 스코프 · 조합 연결

#### [MODIFY] `backend/models/compliance.py`

`ComplianceDocument` 모델에 스코프와 조합 연결 필드를 추가한다:

```python
class ComplianceDocument(Base):
    """Compliance source document metadata."""

    __tablename__ = "compliance_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)
    document_type = Column(String, nullable=False)        # laws|regulations|guidelines|agreements|internal
    scope = Column(String, nullable=False, default="global")  # NEW: global|fund_type|fund
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=True)  # NEW: 개별 조합 귀속 시
    fund_type_filter = Column(String, nullable=True)       # NEW: fund_type 스코프 시 (예: "벤처투자조합")
    version = Column(String, nullable=True)
    effective_date = Column(DateTime, nullable=True)
    content_summary = Column(Text, nullable=True)
    file_path = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    fund = relationship("Fund", backref="compliance_documents", foreign_keys=[fund_id])
    rules = relationship("FundComplianceRule", back_populates="document")
```

**스코프 자동 결정 규칙:**
- `document_type`이 `laws` 또는 `regulations` → `scope = "global"`, `fund_id = None`
- `document_type`이 `guidelines` → `scope = "fund_type"`, `fund_type_filter` 입력 필요
- `document_type`이 `agreements` 또는 `internal` → `scope = "fund"`, `fund_id` 입력 필요

---

## Part 2. Alembic 마이그레이션

#### [NEW] `backend/alembic/versions/xxxx_add_document_scope.py`

```python
"""Add scope, fund_id, fund_type_filter to compliance_documents."""

def upgrade():
    op.add_column('compliance_documents', sa.Column('scope', sa.String(), nullable=True))
    op.add_column('compliance_documents', sa.Column('fund_id', sa.Integer(), nullable=True))
    op.add_column('compliance_documents', sa.Column('fund_type_filter', sa.String(), nullable=True))
    
    # 기존 데이터 마이그레이션: document_type 기반으로 scope 자동 설정
    op.execute("""
        UPDATE compliance_documents 
        SET scope = CASE 
            WHEN document_type IN ('laws', 'regulations') THEN 'global'
            WHEN document_type = 'guidelines' THEN 'fund_type'
            WHEN document_type IN ('agreements', 'internal') THEN 'fund'
            ELSE 'global'
        END
        WHERE scope IS NULL
    """)
    
    op.alter_column('compliance_documents', 'scope', nullable=False, server_default='global')
    op.create_foreign_key('fk_compliance_doc_fund', 'compliance_documents', 'funds', ['fund_id'], ['id'])

def downgrade():
    op.drop_constraint('fk_compliance_doc_fund', 'compliance_documents', type_='foreignkey')
    op.drop_column('compliance_documents', 'fund_type_filter')
    op.drop_column('compliance_documents', 'fund_id')
    op.drop_column('compliance_documents', 'scope')
```

---

## Part 3. 문서 삭제 API

#### [MODIFY] `backend/routers/legal_documents.py`

### 3-1. 삭제 엔드포인트 추가

```python
@router.delete("/api/legal-documents/{document_id}")
def delete_legal_document(document_id: int, db: Session = Depends(get_db)):
    """문서 삭제 — DB 레코드 + 파일 + 벡터 청크 모두 제거."""
    row = db.get(ComplianceDocument, document_id)
    if not row:
        raise HTTPException(status_code=404, detail="Document not found.")

    # 1. 벡터 DB에서 해당 문서의 청크 삭제
    collection_name = row.document_type
    if collection_name in VectorDBService.COLLECTIONS:
        try:
            vector_db = VectorDBService()
            vector_db.delete_chunks_by_document(collection_name, document_id)
        except RuntimeError:
            pass  # ChromaDB 미사용 환경 허용

    # 2. 업로드 파일 삭제
    if row.file_path:
        file_path = PROJECT_ROOT / row.file_path
        file_path.unlink(missing_ok=True)

    # 3. DB 레코드 삭제
    db.delete(row)
    db.commit()

    return {"deleted": True, "id": document_id}
```

### 3-2. 업로드 엔드포인트에 스코프 파라미터 추가

```python
@router.post("/api/legal-documents/upload")
async def upload_legal_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    document_type: str = Form(...),
    version: str | None = Form(default=None),
    fund_id: int | None = Form(default=None),          # NEW
    fund_type_filter: str | None = Form(default=None),  # NEW
    db: Session = Depends(get_db),
):
    normalized_type = _normalize_document_type(document_type)
    
    # 스코프 자동결정
    if normalized_type in ("laws", "regulations"):
        scope = "global"
        fund_id = None
        fund_type_filter = None
    elif normalized_type == "guidelines":
        scope = "fund_type"
        fund_id = None
        # fund_type_filter는 사용자 입력 그대로
    else:  # agreements, internal
        scope = "fund"
        fund_type_filter = None
        if fund_id is None:
            raise HTTPException(status_code=400, detail="규약/계약/내부지침은 귀속 조합을 선택해야 합니다.")
        if not db.get(Fund, fund_id):
            raise HTTPException(status_code=404, detail="조합을 찾을 수 없습니다.")
    
    # ... (기존 파일 업로드/인덱싱 로직 유지)
    
    row = ComplianceDocument(
        title=title.strip(),
        document_type=normalized_type,
        scope=scope,
        fund_id=fund_id,
        fund_type_filter=(fund_type_filter or "").strip() or None,
        version=(version or "").strip() or None,
        file_path=relative_path,
        content_summary=None,
        is_active=True,
    )
    
    # ... (기존 인덱싱 로직 유지, metadata에 scope, fund_id 포함)
    
    metadata = {
        "document_id": row.id,
        "document_type": normalized_type,
        "title": row.title,
        "version": row.version or "",
        "scope": scope,                        # NEW
        "fund_id": fund_id or "",              # NEW
        "fund_type_filter": fund_type_filter or "",  # NEW
    }
```

---

## Part 4. 벡터 DB 청크 삭제 기능

#### [MODIFY] `backend/services/vector_db.py`

```python
def delete_chunks_by_document(self, collection_name: str, document_id: int):
    """특정 문서의 모든 청크를 벡터 DB에서 삭제."""
    if collection_name not in self.COLLECTIONS:
        return
    collection = self._get_collection(collection_name)
    # ChromaDB에서 metadata 필터로 해당 document_id의 청크를 검색 후 삭제
    result = collection.get(where={"document_id": int(document_id)})
    ids = result.get("ids") or []
    if ids:
        collection.delete(ids=ids)
```

---

## Part 5. 문서 목록 API 응답 확장

#### [MODIFY] `backend/routers/legal_documents.py`

`_serialize_document` 함수에 새 필드 반영:

```python
def _serialize_document(row: ComplianceDocument, chunk_count: int | None = None) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "document_type": row.document_type,
        "scope": row.scope,                                    # NEW
        "fund_id": row.fund_id,                                # NEW
        "fund_name": row.fund.name if row.fund_id and row.fund else None,  # NEW
        "fund_type_filter": row.fund_type_filter,              # NEW
        "version": row.version,
        "effective_date": row.effective_date.isoformat() if row.effective_date else None,
        "content_summary": row.content_summary,
        "file_path": row.file_path,
        "is_active": bool(row.is_active),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "chunk_count": chunk_count,
    }
```

---

## Part 6. 프론트엔드 — 문서 라이브러리 UI 개선

#### [MODIFY] `frontend/src/lib/api.ts`

```typescript
// 타입 확장
export interface LegalDocument extends ComplianceDocument {
  chunk_count: number | null
  scope: 'global' | 'fund_type' | 'fund'            // NEW
  fund_id: number | null                              // NEW
  fund_name: string | null                            // NEW
  fund_type_filter: string | null                     // NEW
}

export interface LegalDocumentUploadInput {
  file: File
  title: string
  document_type: LegalDocumentType | string
  version: string | null
  fund_id?: number | null           // NEW
  fund_type_filter?: string | null  // NEW
}

// 삭제 API 함수 추가
export const deleteLegalDocument = (id: number): Promise<{ deleted: boolean; id: number }> =>
  api.delete(`/api/legal-documents/${id}`).then((r) => r.data)
```

#### [MODIFY] `frontend/src/components/compliance/DocumentLibrary.tsx`

```
┌─ 법률 문서 라이브러리 ──────────────────────────────── 총 150 청크 ─┐
│                                                                      │
│  문서 제목: [___________________]                                    │
│  문서 유형: [법률 ▼]   버전: [______]                                │
│                                                                      │
│  ── 유형별 추가 입력 ──                                              │
│  (guidelines 선택 시)                                                │
│  조합 유형: [벤처투자조합 ▼]  (벤처투자조합/신기술투자조합/농식품조합 등) │
│                                                                      │
│  (agreements/internal 선택 시)                                       │
│  귀속 조합: [A조합 ▼]                                                │
│                                                                      │
│  파일: [____.pdf]   [문서 업로드]                                    │
│                                                                      │
│  ── 인덱싱 현황 ──                                                   │
│  법률 24건 | 시행령 12건 | 가이드라인 8건 | 규약 5건 | 내부지침 3건    │
│                                                                      │
│  ── 등록 문서 ──                                                     │
│  유형     │ 스코프   │ 제목            │ 귀속조합 │ 청크 │ 등록일  │   │
│  법률     │ 🌐 공통  │ 자본시장법       │ -       │ 45  │ 03/01  │ 🗑│
│  법률     │ 🌐 공통  │ 벤처투자법       │ -       │ 38  │ 03/01  │ 🗑│
│  시행령   │ 🌐 공통  │ 벤투법 시행령    │ -       │ 24  │ 03/01  │ 🗑│
│  가이드   │ 📋 유형별│ 벤처조합 가이드  │벤처투자  │ 15  │ 03/01  │ 🗑│
│  규약     │ 🏢 조합별│ A조합 규약       │ A조합   │ 22  │ 03/01  │ 🗑│
│  계약     │ 🏢 조합별│ A조합 수탁계약   │ A조합   │ 18  │ 03/01  │ 🗑│
│  내부지침 │ 🏢 조합별│ B조합 투자지침   │ B조합   │ 12  │ 02/28  │ 🗑│
│                                                                      │
│  🗑 클릭 → confirm("정말 삭제하시겠습니까? 벡터DB 청크도 함께 삭제")   │
└──────────────────────────────────────────────────────────────────────┘
```

**구현 세부사항:**
1. `document_type` 선택에 따라 **조건부 입력 필드** 표시
   - `laws`/`regulations` → 추가 입력 없음
   - `guidelines` → 조합 유형 선택 드롭다운 표시
   - `agreements`/`internal` → 조합 선택 드롭다운 표시 (필수)
2. 문서 목록 테이블에 **스코프 아이콘** 및 **귀속조합** 컬럼 추가
3. 각 행에 **삭제 버튼(🗑)** 추가 → `window.confirm()` 후 `deleteLegalDocument()` 호출
4. 삭제 성공 시 `queryClient.invalidateQueries(['legal-documents', 'legal-document-stats'])` 캐시 무효화
5. 조합 목록은 기존의 `fetchFunds()` API 활용

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [MODIFY] | `backend/models/compliance.py` | `ComplianceDocument`에 scope, fund_id, fund_type_filter 추가 |
| 2 | [NEW] | `backend/alembic/versions/xxxx_add_document_scope.py` | DB 마이그레이션 |
| 3 | [MODIFY] | `backend/routers/legal_documents.py` | 삭제 API + 업로드 스코프 + 직렬화 확장 |
| 4 | [MODIFY] | `backend/services/vector_db.py` | `delete_chunks_by_document()` 추가 |
| 5 | [MODIFY] | `backend/services/document_ingestion.py` | 메타데이터에 scope, fund_id 포함 |
| 6 | [MODIFY] | `frontend/src/lib/api.ts` | 타입 확장 + `deleteLegalDocument()` 추가 |
| 7 | [MODIFY] | `frontend/src/components/compliance/DocumentLibrary.tsx` | 삭제 버튼 + 조건부 입력 + 스코프 표시 |
| 8 | [MODIFY] | `frontend/src/pages/CompliancePage.tsx` | DocumentLibrary에 funds 데이터 전달 (필요 시) |

---

## Acceptance Criteria

- [ ] **AC-01:** `DELETE /api/legal-documents/{id}` 호출 시 DB 레코드, 업로드 파일, 벡터 청크가 모두 삭제된다.
- [ ] **AC-02:** `ComplianceDocument` 모델에 `scope`, `fund_id`, `fund_type_filter` 컬럼이 추가된다.
- [ ] **AC-03:** 기존 데이터에 대한 마이그레이션이 정상 동작한다 (document_type 기반 scope 자동 설정).
- [ ] **AC-04:** `laws`/`regulations` 업로드 시 scope가 자동으로 `global`로 설정된다.
- [ ] **AC-05:** `guidelines` 업로드 시 `fund_type_filter` 입력이 가능하고 scope가 `fund_type`으로 설정된다.
- [ ] **AC-06:** `agreements`/`internal` 업로드 시 `fund_id` 선택이 필수이며 scope가 `fund`로 설정된다.
- [ ] **AC-07:** 문서 목록에 스코프 아이콘과 귀속 조합명이 표시된다.
- [ ] **AC-08:** 문서 삭제 버튼이 있고, 확인 다이얼로그 후 삭제 실행 → 목록 즉시 갱신된다.
- [ ] **AC-09:** 벡터 메타데이터에 scope, fund_id가 포함되어 저장된다.
- [ ] **AC-10:** 기존 문서 업로드/검색/인덱싱 기능이 정상 유지된다.
