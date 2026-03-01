# Phase 48: 코드리스 템플릿 등록 시스템

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P1  
**의존성:** Phase 47 (서식보존 치환 엔진, VariableResolver)  
**LLM:** ✅ GPT-4o (마커 자동 식별)  
**예상 파일 수:** 12개 | **AC:** 10개

---

## Part 0. 전수조사 (필수)

- [ ] `backend/services/docx_replacement_engine.py` — Phase 47에서 만든 치환 엔진
- [ ] `backend/services/variable_resolver.py` — Phase 47에서 만든 변수 리졸버
- [ ] `backend/models/document.py` — DocumentTemplate 모델
- [ ] `backend/routers/documents.py` — 기존 서류 API
- [ ] `frontend/src/pages/TemplateManagementPage.tsx` — 기존 템플릿 관리 UI

---

## Part 1. TemplateVariable 모델

#### [NEW] `backend/models/template_variable.py`

```python
from sqlalchemy import Column, Integer, String, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from database import Base


class TemplateVariable(Base):
    """템플릿별 변수 정의"""
    __tablename__ = "template_variables"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    template_id = Column(Integer, ForeignKey("document_templates.id", ondelete="CASCADE"), nullable=False)
    
    marker_name = Column(String, nullable=False)          # "조합명", "LP_명칭" 등
    display_label = Column(String, nullable=True)         # UI 표시명
    source_type = Column(String, nullable=True)           # "fund", "lp", "gp", "investment", "manual"
    source_field = Column(String, nullable=True)          # "name", "representative" 등 (자동 매핑)
    default_value = Column(String, nullable=True)         # 기본값
    is_required = Column(Boolean, default=True)
    display_order = Column(Integer, default=0)
    
    template = relationship("DocumentTemplate", back_populates="variables")
```

`DocumentTemplate` 모델에 relationship 추가:
```python
# [MODIFY] backend/models/document.py
variables = relationship("TemplateVariable", back_populates="template", cascade="all, delete-orphan")
```

---

## Part 2. 텍스트 추출기

#### [NEW] `backend/services/text_extractor.py`

```python
from io import BytesIO
from docx import Document


class TextExtractor:
    """DOCX/HWP 파일에서 텍스트 추출"""
    
    def extract_from_docx(self, file_bytes: bytes) -> str:
        """DOCX에서 전체 텍스트 추출 (단락 + 표 + 헤더/푸터)"""
        doc = Document(BytesIO(file_bytes))
        parts = []
        
        for para in doc.paragraphs:
            parts.append(para.text)
        
        for table in doc.tables:
            for row in table.rows:
                row_texts = [cell.text.strip() for cell in row.cells]
                parts.append(" | ".join(row_texts))
        
        return "\n".join(parts)
    
    def extract_from_hwp(self, file_bytes: bytes) -> str:
        """HWP에서 텍스트 추출 (olefile 또는 pyhwp 사용)"""
        try:
            import olefile
            f = olefile.OleFileIO(BytesIO(file_bytes))
            if f.exists("PrvText"):
                text_bytes = f.openstream("PrvText").read()
                return text_bytes.decode("utf-16-le", errors="ignore")
            # BodyText 섹션에서 추출 시도
            sections = [s for s in f.listdir() if s[0] == "BodyText"]
            texts = []
            for section in sorted(sections):
                raw = f.openstream("/".join(section)).read()
                texts.append(raw.decode("utf-16-le", errors="ignore"))
            return "\n".join(texts)
        except Exception:
            return ""
    
    def extract(self, file_bytes: bytes, filename: str) -> str:
        """파일 확장자에 따라 적절한 추출기 선택"""
        ext = filename.rsplit(".", 1)[-1].lower()
        if ext == "docx":
            return self.extract_from_docx(file_bytes)
        elif ext in ("hwp", "hwpx"):
            return self.extract_from_hwp(file_bytes)
        else:
            raise ValueError(f"지원하지 않는 파일 형식: {ext}")
```

---

## Part 3. LLM 마커 자동 식별

#### [NEW] `backend/services/llm_marker_identifier.py`

```python
import json
from openai import AsyncOpenAI

from services.variable_resolver import VariableResolver


class LLMMarkerIdentifier:
    """LLM(GPT-4o)을 사용하여 템플릿 텍스트에서 치환 마커를 자동 식별"""
    
    SYSTEM_PROMPT = """당신은 VC 조합 서류 전문가입니다.
주어진 서류 텍스트에서 변수로 치환해야 할 부분을 식별하세요.

식별 기준:
1. 조합명, 회사명, 대표자명 등 고유명사
2. 날짜, 금액, 비율 등 수치
3. 주소, 전화번호 등 연락처
4. 계약 조건, 기간 등

출력 형식 (JSON):
[
  {"text": "원문에서 발견한 텍스트", "marker": "제안하는_마커명", "source": "fund|lp|gp|investment|manual"}
]

사용 가능한 마커 목록: {available_markers}
"""
    
    def __init__(self):
        self.client = AsyncOpenAI()
        self.resolver = VariableResolver()
    
    async def identify_markers(self, extracted_text: str) -> list[dict]:
        """추출된 텍스트에서 마커 후보를 식별
        
        Returns:
            [{"text": "트리거투자조합", "marker": "조합명", "source": "fund"}, ...]
        """
        available = self.resolver.get_available_markers()
        marker_list = ", ".join(m["marker"] for m in available)
        
        response = await self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": self.SYSTEM_PROMPT.format(available_markers=marker_list)},
                {"role": "user", "content": f"다음 서류 텍스트에서 치환 마커를 식별해주세요:\n\n{extracted_text[:8000]}"},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        
        result = json.loads(response.choices[0].message.content)
        return result.get("markers", result) if isinstance(result, dict) else result
```

---

## Part 4. 템플릿 등록 API

#### [NEW] `backend/routers/template_registration.py`

```python
@router.post("/api/templates/analyze")
async def analyze_template(file: UploadFile):
    """Step 1: 파일 업로드 → 텍스트 추출 → LLM 마커 식별
    
    Returns:
        {
            "extracted_text": "...",
            "identified_markers": [
                {"text": "트리거투자조합", "marker": "조합명", "source": "fund", "confidence": 0.95}
            ],
            "existing_markers": ["{{조합명}}", "{{LP_명칭}}", ...]  # 이미 마커 형태인 것
        }
    """
    ...

@router.post("/api/templates/register")
async def register_template(
    file: UploadFile,
    name: str = Form(...),
    document_type: str = Form(...),
    variables: str = Form(...),  # JSON: [{"marker_name": "조합명", "source_type": "fund", ...}]
):
    """Step 2: 마커 확인 후 템플릿 등록
    
    1. DocumentTemplate 생성
    2. TemplateVariable 일괄 생성
    3. 마커가 없으면 텍스트에 {{마커}} 삽입
    """
    ...
```

---

## Part 5. 프론트엔드 등록 위저드

#### [NEW] `frontend/src/components/templates/RegistrationWizard.tsx`

```
┌─ 템플릿 등록 위저드 ─────────────────────────────────┐
│                                                       │
│  Step 1/4: 파일 업로드                                │
│  ┌─────────────────────────────────────┐              │
│  │  📄 파일을 드래그하거나 클릭하세요     │              │
│  │  .docx, .hwp 지원                   │              │
│  └─────────────────────────────────────┘              │
│  [분석 시작]                                          │
│                                                       │
│  Step 2/4: LLM 식별 결과 확인                         │
│  ┌────────────────────────────────────────────┐       │
│  │ 원문 텍스트        │ 마커명      │ 소스     │       │
│  │ "트리거투자조합"    │ 조합명 ✅   │ Fund     │       │
│  │ "홍길동"           │ GP_대표자 ✅ │ GP      │       │
│  │ "2026년 1월 31일"  │ 작성일 ⚠️   │ Manual  │ [수정] │
│  │ "10,000,000원"     │ ??? ❌     │         │ [매핑] │
│  └────────────────────────────────────────────┘       │
│  ⚠️ 미매핑 1건 — 클릭하여 매핑하세요                    │
│                                                       │
│  Step 3/4: 변수 매핑 확인                              │
│  각 마커가 어떤 DB 필드에서 값을 가져오는지 확인         │
│  source_type=manual인 경우 생성 시마다 사용자 입력       │
│                                                       │
│  Step 4/4: 테스트 생성                                 │
│  조합: [트리거-글로벌PEX ▼] LP: [농식품모태 ▼]          │
│  [테스트 생성] → 결과 미리보기                          │
│  [등록 확정]                                           │
└───────────────────────────────────────────────────────┘
```

---

## Part 6. 최근 입력값 캐싱

#### [NEW] `backend/services/input_cache.py`

```python
class InputCacheService:
    """서류 생성 시 사용자가 입력한 manual 변수값을 캐싱
    
    다음 생성 시 마지막으로 사용된 값을 자동 입력하여 편의 제공.
    fund_id + template_id + marker_name 기준으로 캐싱.
    """
    
    def save_inputs(self, db, fund_id: int, template_id: int, manual_vars: dict[str, str]):
        """사용된 수동 입력값 저장"""
        ...
    
    def get_last_inputs(self, db, fund_id: int, template_id: int) -> dict[str, str]:
        """마지막 사용 값 조회"""
        ...
```

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [NEW] | `backend/models/template_variable.py` | TemplateVariable 모델 |
| 2 | [MODIFY] | `backend/models/document.py` | variables relationship 추가 |
| 3 | [NEW] | `backend/services/text_extractor.py` | DOCX/HWP 텍스트 추출 |
| 4 | [NEW] | `backend/services/llm_marker_identifier.py` | LLM 마커 식별 |
| 5 | [NEW] | `backend/routers/template_registration.py` | 분석+등록 API |
| 6 | [NEW] | `backend/services/input_cache.py` | 입력값 캐싱 |
| 7 | [MODIFY] | `backend/models/__init__.py` | TemplateVariable 등록 |
| 8 | [MODIFY] | `backend/main.py` | 라우터 등록 |
| 9 | [NEW] | `frontend/src/components/templates/RegistrationWizard.tsx` | 등록 위저드 UI |
| 10 | [MODIFY] | `frontend/src/pages/TemplateManagementPage.tsx` | 위저드 연결 |
| 11 | [MODIFY] | `frontend/src/lib/api.ts` | 등록/분석 API 함수 |
| 12 | [NEW] | `backend/schemas/template_registration.py` | 요청/응답 스키마 |

---

## Acceptance Criteria

- [ ] **AC-01:** DOCX 업로드 시 텍스트가 정확히 추출된다 (단락+표+헤더).
- [ ] **AC-02:** HWP 업로드 시 텍스트가 추출된다 (olefile PrvText).
- [ ] **AC-03:** LLM이 추출된 텍스트에서 마커 후보를 JSON으로 반환한다.
- [ ] **AC-04:** 이미 `{{마커}}` 형태로 있는 텍스트는 별도로 식별된다.
- [ ] **AC-05:** 등록 위저드 Step 1~4가 순차적으로 동작한다.
- [ ] **AC-06:** LLM 식별 결과를 사용자가 수정/삭제/추가할 수 있다.
- [ ] **AC-07:** 등록 완료 시 DocumentTemplate + TemplateVariable이 생성된다.
- [ ] **AC-08:** 테스트 생성으로 치환 결과를 미리볼 수 있다.
- [ ] **AC-09:** 최근 입력값이 캐싱되어 다음 생성 시 자동 입력된다.
- [ ] **AC-10:** 기존 TemplateManagementPage 기능이 유지된다.
