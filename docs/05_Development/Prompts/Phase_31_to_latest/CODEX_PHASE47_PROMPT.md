# Phase 47: 서류 자동화 기반 구축

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P1  
**의존성:** Phase 44 완료 (서류 관련 기존 모델: DocumentTemplate, GeneratedDocument)  
**LLM:** ❌ 불필요 — python-docx 기반  
**예상 파일 수:** 12개 | **AC:** 14개

---

## Part 0. 전수조사 (필수)

아래 파일을 **모두 읽고** 현재 구조를 파악한 후 작업:

- [ ] `backend/models/document.py` — DocumentTemplate, GeneratedDocument 모델
- [ ] `backend/routers/documents.py` — 기존 서류 API
- [ ] `backend/models/fund.py` — Fund 모델 (fund_name, fund_type 등)
- [ ] `backend/models/lp.py` — LP 모델 (lp_name, commitment 등)
- [ ] `backend/models/investment.py` — Investment 모델
- [ ] `backend/models/__init__.py` — 모델 등록 현황
- [ ] `frontend/src/pages/TemplateManagementPage.tsx` — 기존 템플릿 관리 UI
- [ ] `frontend/src/pages/DocumentsPage.tsx` — 기존 서류 UI
- [ ] `frontend/src/lib/api.ts` — 기존 API 함수

---

## Part 1. 서식보존 치환 엔진

#### [NEW] `backend/services/docx_replacement_engine.py`

DOCX 파일의 서식(폰트, 크기, 볼드, 정렬 등)을 **완벽히 보존**하면서 `{{변수명}}` 마커를 실제 값으로 치환하는 엔진.

```python
from docx import Document
from docx.oxml.ns import qn
import re
import copy
from io import BytesIO


class DocxReplacementEngine:
    """서식 보존 DOCX 치환 엔진
    
    python-docx의 Run 단위로 치환하여 서식(폰트, 크기, 색상, 볼드 등)을 
    100% 보존한다. 마커가 여러 Run에 걸쳐있는 경우도 처리.
    """
    
    MARKER_PATTERN = re.compile(r'\{\{(\w+)\}\}')
    
    def replace(self, template_bytes: bytes, variables: dict[str, str]) -> bytes:
        """템플릿 바이트에서 마커를 치환한 결과를 바이트로 반환
        
        Args:
            template_bytes: DOCX 파일 바이트
            variables: {"조합명": "트리거-글로벌PEX투자조합", "GP_대표자": "홍길동", ...}
        
        Returns:
            치환된 DOCX 바이트
        """
        doc = Document(BytesIO(template_bytes))
        
        # 본문 단락
        for paragraph in doc.paragraphs:
            self._replace_in_paragraph(paragraph, variables)
        
        # 표(Table) 내부
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    for paragraph in cell.paragraphs:
                        self._replace_in_paragraph(paragraph, variables)
        
        # 헤더/푸터
        for section in doc.sections:
            for header in [section.header, section.first_page_header]:
                if header and header.is_linked_to_previous is False:
                    for paragraph in header.paragraphs:
                        self._replace_in_paragraph(paragraph, variables)
            for footer in [section.footer, section.first_page_footer]:
                if footer and footer.is_linked_to_previous is False:
                    for paragraph in footer.paragraphs:
                        self._replace_in_paragraph(paragraph, variables)
        
        output = BytesIO()
        doc.save(output)
        return output.getvalue()
    
    def _replace_in_paragraph(self, paragraph, variables: dict[str, str]):
        """단락 내 Run들을 분석하여 마커 치환 (서식 보존)
        
        마커가 하나의 Run에 온전히 있으면 직접 치환.
        여러 Run에 걸쳐있으면 (예: Run1="{{조합", Run2="명}}") 
        첫 Run에 치환값을 넣고 나머지 Run 텍스트를 비움.
        """
        full_text = ''.join(run.text for run in paragraph.runs)
        if '{{' not in full_text:
            return
        
        # 단일 Run 내 마커 처리
        for run in paragraph.runs:
            if self.MARKER_PATTERN.search(run.text):
                for marker, value in variables.items():
                    run.text = run.text.replace(f'{{{{{marker}}}}}', str(value))
        
        # 크로스 Run 마커 처리
        self._handle_cross_run_markers(paragraph, variables)
    
    def _handle_cross_run_markers(self, paragraph, variables: dict[str, str]):
        """여러 Run에 걸친 마커 처리"""
        runs = paragraph.runs
        full_text = ''.join(r.text for r in runs)
        
        for match in self.MARKER_PATTERN.finditer(full_text):
            marker_name = match.group(1)
            if marker_name not in variables:
                continue
            
            start_pos = match.start()
            end_pos = match.end()
            
            # 각 Run의 텍스트 범위 계산
            run_positions = []
            pos = 0
            for i, run in enumerate(runs):
                run_start = pos
                run_end = pos + len(run.text)
                run_positions.append((i, run_start, run_end))
                pos = run_end
            
            # 마커가 걸친 Run들 찾기
            affected_runs = [
                (i, rs, re) for i, rs, re in run_positions
                if rs < end_pos and re > start_pos
            ]
            
            if len(affected_runs) <= 1:
                continue
            
            # 첫 Run에 치환값 넣기
            first_idx = affected_runs[0][0]
            first_run = runs[first_idx]
            first_run.text = first_run.text[:start_pos - affected_runs[0][1]] + \
                             str(variables[marker_name]) + \
                             runs[affected_runs[-1][0]].text[end_pos - affected_runs[-1][1]:]
            
            # 나머지 Run 비우기
            for idx, _, _ in affected_runs[1:]:
                runs[idx].text = ''
    
    def extract_markers(self, template_bytes: bytes) -> list[str]:
        """템플릿에서 모든 마커명 추출"""
        doc = Document(BytesIO(template_bytes))
        markers = set()
        
        for paragraph in doc.paragraphs:
            full_text = ''.join(run.text for run in paragraph.runs)
            for match in self.MARKER_PATTERN.finditer(full_text):
                markers.add(match.group(1))
        
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    for paragraph in cell.paragraphs:
                        full_text = ''.join(run.text for run in paragraph.runs)
                        for match in self.MARKER_PATTERN.finditer(full_text):
                            markers.add(match.group(1))
        
        return sorted(markers)
```

---

## Part 2. GP 기업 프로필 모델

#### [NEW] `backend/models/gp_profile.py`

GP(운용사) 기업 정보를 저장. 서류 자동 생성 시 `{{GP_법인명}}`, `{{GP_대표자}}` 등에 사용.

```python
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func
from database import Base


class GPProfile(Base):
    """GP(운용사) 기업 프로필 — 서류 생성 변수용"""
    __tablename__ = "gp_profiles"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # 기본 정보
    company_name = Column(String, nullable=False)           # 법인명
    company_name_en = Column(String, nullable=True)         # 영문 법인명
    representative = Column(String, nullable=False)         # 대표자명
    business_number = Column(String, nullable=True)         # 사업자등록번호
    corporate_number = Column(String, nullable=True)        # 법인등록번호
    
    # 주소
    address = Column(String, nullable=True)                 # 본점 소재지
    address_en = Column(String, nullable=True)              # 영문 주소
    
    # 연락처
    phone = Column(String, nullable=True)
    fax = Column(String, nullable=True)
    email = Column(String, nullable=True)
    
    # 인감/서명
    seal_image_path = Column(String, nullable=True)         # 법인인감 이미지 경로
    signature_image_path = Column(String, nullable=True)    # 대표자 서명 이미지 경로
    
    # 금융 관련
    vc_registration_number = Column(String, nullable=True)  # 벤처투자 등록번호
    fss_code = Column(String, nullable=True)                # 금감원 코드
    
    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
```

API:
- `GET /api/gp-profiles` — 목록 조회
- `POST /api/gp-profiles` — 생성
- `PUT /api/gp-profiles/{id}` — 수정
- `GET /api/gp-profiles/{id}` — 상세 조회

#### [NEW] `backend/routers/gp_profiles.py`

---

## Part 3. 통합 변수 리졸버

#### [NEW] `backend/services/variable_resolver.py`

서류 생성 시 다양한 데이터 소스에서 변수값을 통합 조회.

```python
from datetime import date
from sqlalchemy.orm import Session

from models.fund import Fund
from models.lp import LP
from models.investment import Investment
from models.gp_profile import GPProfile


class VariableResolver:
    """서류 생성용 통합 변수 리졸버
    
    마커명 → DB 값 매핑을 통합 관리.
    Fund, LP, GP, Investment 등 다양한 소스에서 값을 조회.
    """
    
    def resolve_all(
        self,
        db: Session,
        fund_id: int,
        lp_id: int | None = None,
        investment_id: int | None = None,
        extra_vars: dict[str, str] | None = None,
    ) -> dict[str, str]:
        """전체 변수를 한 번에 리졸브
        
        Returns:
            {"조합명": "트리거-글로벌PEX투자조합", "GP_대표자": "홍길동", ...}
        """
        variables = {}
        
        # 1. Fund 변수
        fund = db.query(Fund).get(fund_id)
        if fund:
            variables.update({
                "조합명": fund.name or "",
                "조합_영문명": fund.name_en or "",
                "조합_유형": fund.fund_type or "",
                "조합_설립일": str(fund.formation_date or ""),
                "조합_존속기한": str(fund.expiration_date or ""),
                "조합_약정총액": self._format_krw(fund.commitment_total),
                "조합_출자금총액": self._format_krw(fund.paid_in_total),
            })
        
        # 2. GP 변수
        gp = db.query(GPProfile).first()  # 단일 GP 운용사 가정
        if gp:
            variables.update({
                "GP_법인명": gp.company_name or "",
                "GP_대표자": gp.representative or "",
                "GP_사업자번호": gp.business_number or "",
                "GP_주소": gp.address or "",
                "GP_전화": gp.phone or "",
                "GP_팩스": gp.fax or "",
            })
        
        # 3. LP 변수 (lp_id 지정 시)
        if lp_id:
            lp = db.query(LP).get(lp_id)
            if lp:
                variables.update({
                    "LP_명칭": lp.name or "",
                    "LP_대표자": lp.representative or "",
                    "LP_사업자번호": lp.business_number or "",
                    "LP_주소": lp.address or "",
                    "LP_출자약정액": self._format_krw(lp.commitment_amount),
                    "LP_출자비율": f"{lp.ownership_ratio or 0:.2f}%",
                })
        
        # 4. 투자 변수 (investment_id 지정 시)
        if investment_id:
            inv = db.query(Investment).get(investment_id)
            if inv:
                variables.update({
                    "피투자사명": inv.company_name or "",
                    "투자금액": self._format_krw(inv.amount),
                    "투자일자": str(inv.investment_date or ""),
                    "투자_주식수": str(inv.shares or ""),
                    "투자_단가": self._format_krw(inv.price_per_share),
                })
        
        # 5. 날짜/시스템 변수
        today = date.today()
        variables.update({
            "오늘날짜": today.strftime("%Y년 %m월 %d일"),
            "오늘날짜_숫자": today.strftime("%Y-%m-%d"),
            "작성연도": str(today.year),
            "작성월": str(today.month),
        })
        
        # 6. 사용자 추가 변수 (extra_vars)
        if extra_vars:
            variables.update(extra_vars)
        
        return variables
    
    def _format_krw(self, amount) -> str:
        """금액을 원화 형식으로 포맷"""
        if amount is None:
            return "0"
        return f"{int(amount):,}"
    
    def get_available_markers(self) -> list[dict]:
        """사용 가능한 전체 마커 목록 반환 (UI 표시용)"""
        return [
            {"marker": "조합명", "source": "Fund", "description": "조합 이름"},
            {"marker": "GP_법인명", "source": "GPProfile", "description": "GP 운용사명"},
            {"marker": "GP_대표자", "source": "GPProfile", "description": "GP 대표자명"},
            {"marker": "LP_명칭", "source": "LP", "description": "LP 이름"},
            {"marker": "LP_출자약정액", "source": "LP", "description": "LP 출자약정금액"},
            # ... 전체 목록
        ]
```

---

## Part 4. 문서번호 자동 채번

#### [NEW] `backend/models/document_number_seq.py`

```python
from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint
from database import Base


class DocumentNumberSeq(Base):
    """문서번호 채번 시퀀스 — 조합+문서유형별 순번 관리"""
    __tablename__ = "document_number_seqs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    document_type = Column(String, nullable=False)   # "출자확인서", "수탁계약" 등
    year = Column(Integer, nullable=False)
    last_number = Column(Integer, default=0)
    
    __table_args__ = (
        UniqueConstraint("fund_id", "document_type", "year", name="uq_doc_num_seq"),
    )
```

#### [NEW] `backend/services/document_numbering.py`

```python
class DocumentNumberingService:
    """문서번호 자동 채번
    
    형식: {조합약어}-{문서유형코드}-{연도}-{순번4자리}
    예: TGPEX-LC-2026-0001
    """
    
    def next_number(self, db: Session, fund_id: int, document_type: str) -> str:
        """다음 문서번호 발급 (트랜잭션 안전)"""
        year = date.today().year
        seq = db.query(DocumentNumberSeq).filter_by(
            fund_id=fund_id, document_type=document_type, year=year
        ).with_for_update().first()
        
        if not seq:
            seq = DocumentNumberSeq(fund_id=fund_id, document_type=document_type, year=year, last_number=0)
            db.add(seq)
        
        seq.last_number += 1
        db.flush()
        
        fund = db.query(Fund).get(fund_id)
        prefix = self._fund_prefix(fund)
        type_code = self._type_code(document_type)
        
        return f"{prefix}-{type_code}-{year}-{seq.last_number:04d}"
```

---

## Part 5. LP별 일괄 서류 생성

#### [NEW] `backend/services/bulk_document_generator.py`

```python
class BulkDocumentGenerator:
    """특정 조합의 전체 LP에 대해 동일 템플릿으로 서류 일괄 생성"""
    
    def generate_for_all_lps(
        self,
        db: Session,
        fund_id: int,
        template_id: int,
        extra_vars: dict[str, str] | None = None,
    ) -> list[GeneratedDocument]:
        """
        1. Fund의 전체 LP 조회
        2. LP별로 VariableResolver로 변수 리졸브
        3. DocxReplacementEngine으로 치환
        4. 문서번호 자동 채번
        5. GeneratedDocument 저장
        6. 결과 목록 반환
        """
        template = db.query(DocumentTemplate).get(template_id)
        lps = db.query(LP).filter_by(fund_id=fund_id).all()
        
        results = []
        for lp in lps:
            variables = self.resolver.resolve_all(db, fund_id, lp_id=lp.id, extra_vars=extra_vars)
            doc_bytes = self.engine.replace(template.file_content, variables)
            doc_number = self.numbering.next_number(db, fund_id, template.document_type)
            
            generated = GeneratedDocument(
                fund_id=fund_id,
                template_id=template_id,
                lp_id=lp.id,
                document_number=doc_number,
                file_name=f"{doc_number}_{variables.get('LP_명칭', 'unknown')}.docx",
                file_content=doc_bytes,
                variables_used=variables,
            )
            db.add(generated)
            results.append(generated)
        
        db.commit()
        return results
```

API:
```
POST /api/documents/generate
Body: { fund_id, template_id, lp_id?, investment_id?, extra_vars? }
→ 단건 생성

POST /api/documents/generate/bulk  
Body: { fund_id, template_id, extra_vars? }
→ 해당 조합 전체 LP에 대해 일괄 생성

GET /api/documents/generated?fund_id=&template_id=
→ 생성된 서류 목록

GET /api/documents/generated/{id}/download
→ DOCX 다운로드
```

#### [NEW] `backend/routers/document_generation.py`

---

## Part 6. 프론트엔드 — 서류 생성 위저드

#### [MODIFY] `frontend/src/pages/TemplateManagementPage.tsx`

기존 템플릿 관리 페이지에 "서류 생성" 기능 추가:

```
서류 생성 위저드:

Step 1: 템플릿 선택
  ┌──────────────────────────────────┐
  │ [출자확인서 ▼]                    │
  │ 마커: {{조합명}}, {{LP_명칭}}...   │
  └──────────────────────────────────┘

Step 2: 대상 선택
  조합: [트리거-글로벌PEX ▼]
  ○ 단일 LP: [농식품모태펀드 ▼]
  ○ 전체 LP 일괄 생성 (8건)

Step 3: 변수 확인/수정
  조합명: [트리거-글로벌PEX투자조합]  ← 자동 입력
  GP_대표자: [홍길동]               ← 자동 입력
  LP_명칭: [농식품모태펀드]          ← 자동 입력
  추가변수: [2026년 1분기]           ← 사용자 입력

Step 4: 미리보기 + 생성
  [미리보기] → 변수가 치환된 결과 확인
  [생성] → DOCX 파일 생성 + 다운로드
```

---

## ⚠️ 기능 보호 규칙

- 기존 `DocumentTemplate`, `GeneratedDocument` 모델 **삭제/변경 금지** (확장만)
- 기존 서류 관련 API 엔드포인트 **변경 금지**
- 기존 프론트엔드 기능 **유지**

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [NEW] | `backend/services/docx_replacement_engine.py` | 서식보존 DOCX 치환 엔진 |
| 2 | [NEW] | `backend/models/gp_profile.py` | GP 기업 프로필 모델 |
| 3 | [NEW] | `backend/routers/gp_profiles.py` | GP 프로필 CRUD API |
| 4 | [NEW] | `backend/services/variable_resolver.py` | 통합 변수 리졸버 |
| 5 | [NEW] | `backend/models/document_number_seq.py` | 문서번호 시퀀스 모델 |
| 6 | [NEW] | `backend/services/document_numbering.py` | 문서번호 채번 서비스 |
| 7 | [NEW] | `backend/services/bulk_document_generator.py` | LP별 일괄 생성 서비스 |
| 8 | [NEW] | `backend/routers/document_generation.py` | 서류 생성 API |
| 9 | [MODIFY] | `backend/models/__init__.py` | GPProfile, DocumentNumberSeq 등록 |
| 10 | [MODIFY] | `backend/main.py` | 라우터 등록 |
| 11 | [MODIFY] | `frontend/src/pages/TemplateManagementPage.tsx` | 생성 위저드 추가 |
| 12 | [MODIFY] | `frontend/src/lib/api.ts` | 서류생성/GP 프로필 API 함수 |

---

## Acceptance Criteria

- [ ] **AC-01:** DOCX 템플릿에서 `{{변수명}}` 마커가 치환되고 서식이 보존된다.
- [ ] **AC-02:** 마커가 여러 Run에 걸쳐있어도 정확히 치환된다.
- [ ] **AC-03:** 표(Table), 헤더, 푸터 내 마커도 치환된다.
- [ ] **AC-04:** GPProfile이 CRUD 된다 (법인명, 대표자, 사업자번호, 주소 등).
- [ ] **AC-05:** VariableResolver가 Fund+GP+LP+Investment 데이터를 통합 조회한다.
- [ ] **AC-06:** 마커 목록 API가 사용 가능한 전체 마커를 반환한다.
- [ ] **AC-07:** 문서번호가 `TGPEX-LC-2026-0001` 형식으로 자동 채번된다.
- [ ] **AC-08:** 동시 요청 시 문서번호가 중복되지 않는다 (DB 락).
- [ ] **AC-09:** 단건 서류 생성 API가 동작한다.
- [ ] **AC-10:** 전체 LP 일괄 생성 API가 동작한다 (8개 LP → 8개 DOCX).
- [ ] **AC-11:** 생성된 서류의 다운로드가 동작한다.
- [ ] **AC-12:** 생성 위저드에서 변수가 자동 입력된다.
- [ ] **AC-13:** 미리보기에서 치환 결과를 확인할 수 있다.
- [ ] **AC-14:** 기존 DocumentTemplate/GeneratedDocument 기능이 유지된다.
