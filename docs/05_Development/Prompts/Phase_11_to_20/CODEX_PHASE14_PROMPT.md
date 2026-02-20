# Phase 14: 문서 자동화 시스템 — 결성총회 양식 자동생성 + 워크플로우 연동

> **Priority:** P1
> **Focus:** 문서 템플릿 엔진 구축 + 결성총회 3종 양식 자동생성 + 워크플로우-조합 연결 강화

---

## Table of Contents

1. [Part 1 — 문서 템플릿 엔진 (백엔드)](#part-1--문서-템플릿-엔진-백엔드)
2. [Part 2 — 결성총회 3종 양식 자동생성](#part-2--결성총회-3종-양식-자동생성)
3. [Part 3 — 조합상세 "결성 시작" 버튼 + 워크플로우 자동 연결](#part-3--조합상세-결성-시작-버튼--워크플로우-자동-연결)
4. [Part 4 — 워크플로우 단계별 문서 생성 버튼](#part-4--워크플로우-단계별-문서-생성-버튼)
5. [Part 5 — 워크플로우 완료 시 조합 상태 자동 전환](#part-5--워크플로우-완료-시-조합-상태-자동-전환)
6. [Files to create / modify](#files-to-create--modify)
7. [Acceptance Criteria](#acceptance-criteria)

---

## 개요: 전체 흐름

```
┌─────────────────────────────────────────────────────────────────────┐
│  Step 1. 조합관리 → "결성예정" 상태로 조합 생성 + LP 입력            │
│                         ↓                                           │
│  Step 2. 조합상세 → [🚀 결성 시작] 버튼 클릭                        │
│          → 결성총회 워크플로우 자동 시작 (fund_id 자동 연결)          │
│          → 기준일 = 조합.결성예정일                                  │
│                         ↓                                           │
│  Step 3. 워크플로우 단계 진행                                        │
│          → 각 단계에 [📄 문서 생성] 버튼                             │
│          → 클릭 시 .docx 파일 자동생성 + 다운로드                    │
│             (조합명, LP목록, 날짜 등 자동 치환)                       │
│                         ↓                                           │
│  Step 4. 워크플로우 완료 시                                          │
│          → 조합 상태 자동 전환: "결성예정" → "운용 중"                │
│          → 결성일 자동 기록                                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Part 1 — 문서 템플릿 엔진 (백엔드)

### Context

현재 ERP에는 문서 생성 기능이 없음. `python-docx`와 `openpyxl`이 설치되어 있으므로, docx 양식 파일에서 `{{변수}}`를 ERP 데이터로 치환하여 완성된 문서를 생성하는 엔진을 구축한다.

### 1-A. 문서 템플릿 저장 구조

프로젝트 내 `templates/` 폴더에 양식 원본 `.docx` 파일을 보관한다. 각 양식에 대한 메타데이터를 DB에 등록하여 관리한다.

**새 DB 모델: `DocumentTemplate`**

```python
# backend/models/document_template.py

from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from database import Base

class DocumentTemplate(Base):
    __tablename__ = "document_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)               # "결성총회 소집통지서"
    category = Column(String, nullable=False)            # "결성총회", "투심위", "투자계약" 등
    file_path = Column(String, nullable=False)           # "templates/소집통지서.docx"
    description = Column(Text, default="")
    variables = Column(Text, default="[]")               # JSON: 사용되는 변수 목록
    workflow_step_label = Column(String, nullable=True)   # 매핑할 워크플로우 단계명 (예: "소집통지서 발송")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
```

### 1-B. 변수 치환 엔진

```python
# backend/services/document_service.py

import copy
import json
import os
from datetime import datetime
from docx import Document
from docx.shared import Pt
from io import BytesIO
from sqlalchemy.orm import Session

from models.fund import Fund
from models.fund_lp import FundLP
from models.document_template import DocumentTemplate


def replace_text_in_paragraph(paragraph, variables: dict):
    """단락 내 {{변수}} → 실제 값으로 치환"""
    full_text = paragraph.text
    for key, value in variables.items():
        placeholder = "{{" + key + "}}"
        if placeholder in full_text:
            full_text = full_text.replace(placeholder, str(value))
    if full_text != paragraph.text:
        # 원본 run 스타일 유지하면서 텍스트 교체
        for run in paragraph.runs:
            run.text = ""
        if paragraph.runs:
            paragraph.runs[0].text = full_text


def replace_text_in_table(table, variables: dict):
    """테이블 셀 내 {{변수}} 치환"""
    for row in table.rows:
        for cell in row.cells:
            for paragraph in cell.paragraphs:
                replace_text_in_paragraph(paragraph, variables)


def build_variables_for_fund(fund: Fund, lps: list[FundLP], extra: dict = None) -> dict:
    """조합 + LP 데이터를 변수 딕셔너리로 구성"""
    today = datetime.now()

    # 날짜 포맷팅 헬퍼
    def fmt_date(d, include_day_name=True):
        if not d:
            return "미정"
        dt = d if isinstance(d, datetime) else datetime.fromisoformat(str(d))
        day_names = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"]
        day_name = day_names[dt.weekday()]
        if include_day_name:
            return f"{dt.year}년 {dt.month}월 {dt.day}일({day_name})"
        return f"{dt.year}년 {dt.month}월 {dt.day}일"

    def fmt_date_short(d):
        if not d:
            return "미정"
        dt = d if isinstance(d, datetime) else datetime.fromisoformat(str(d))
        return f"{dt.year}. {dt.month:02d}. {dt.day:02d}"

    def fmt_amount(amount):
        if not amount:
            return "0"
        return f"{int(amount):,}"

    # LP 목록 텍스트 생성
    lp_list_text = ""
    for i, lp in enumerate(lps, 1):
        lp_list_text += f"  {i}. {lp.name} ({lp.type or ''}): 약정 {fmt_amount(lp.commitment_amount)}원\n"

    total_commitment = sum(lp.commitment_amount or 0 for lp in lps)
    lp_count = len(lps)

    variables = {
        # 조합 기본정보
        "fund_name": fund.name or "",
        "fund_type": fund.type or "",
        "fund_status": fund.status or "",
        "gp_name": fund.gp or "트리거투자파트너스(유)",
        "co_gp_name": fund.co_gp or "",
        "trustee": fund.trustee or "",
        "commitment_total": fmt_amount(fund.commitment_total),
        "commitment_total_raw": str(fund.commitment_total or 0),

        # 날짜
        "formation_date": fmt_date(fund.formation_date),
        "formation_date_short": fmt_date_short(fund.formation_date),
        "today_date": fmt_date(today),
        "today_date_short": fmt_date_short(today),

        # LP 정보
        "lp_count": str(lp_count),
        "lp_list": lp_list_text,
        "total_commitment_amount": fmt_amount(total_commitment),

        # 문서 메타
        "document_date": fmt_date_short(today),
    }

    # 추가 변수 병합 (총회일, 안건 등)
    if extra:
        variables.update(extra)

    return variables


def generate_document(
    template: DocumentTemplate,
    variables: dict,
) -> BytesIO:
    """템플릿 .docx 파일에서 변수를 치환하여 BytesIO로 반환"""
    template_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        template.file_path,
    )
    if not os.path.exists(template_path):
        raise FileNotFoundError(f"템플릿 파일을 찾을 수 없습니다: {template_path}")

    doc = Document(template_path)

    # 단락 치환
    for paragraph in doc.paragraphs:
        replace_text_in_paragraph(paragraph, variables)

    # 테이블 치환
    for table in doc.tables:
        replace_text_in_table(table, variables)

    # 헤더/푸터 치환
    for section in doc.sections:
        for header in [section.header, section.first_page_header]:
            if header:
                for paragraph in header.paragraphs:
                    replace_text_in_paragraph(paragraph, variables)
        for footer in [section.footer, section.first_page_footer]:
            if footer:
                for paragraph in footer.paragraphs:
                    replace_text_in_paragraph(paragraph, variables)

    buffer = BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer
```

### 1-C. 문서 생성 API

```python
# backend/routers/documents.py

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime
import json

from database import get_db
from models.document_template import DocumentTemplate
from models.fund import Fund
from models.fund_lp import FundLP
from services.document_service import build_variables_for_fund, generate_document

router = APIRouter(tags=["documents"])


@router.get("/document-templates")
def list_document_templates(
    category: str = None,
    db: Session = Depends(get_db),
):
    """문서 템플릿 목록 조회"""
    query = db.query(DocumentTemplate)
    if category:
        query = query.filter(DocumentTemplate.category == category)
    return query.order_by(DocumentTemplate.category, DocumentTemplate.name).all()


@router.get("/document-templates/{template_id}")
def get_document_template(template_id: int, db: Session = Depends(get_db)):
    """문서 템플릿 상세 조회"""
    template = db.query(DocumentTemplate).get(template_id)
    if not template:
        raise HTTPException(404, "템플릿을 찾을 수 없습니다.")
    return template


@router.post("/document-templates/{template_id}/generate")
def generate_from_template(
    template_id: int,
    fund_id: int = Query(..., description="조합 ID"),
    assembly_date: str = Query(None, description="총회 일자 (YYYY-MM-DD)"),
    document_number: str = Query(None, description="문서번호"),
    db: Session = Depends(get_db),
):
    """
    문서 자동생성 API
    - 템플릿에 조합/LP 데이터를 자동 치환하여 .docx 파일 반환
    """
    template = db.query(DocumentTemplate).get(template_id)
    if not template:
        raise HTTPException(404, "템플릿을 찾을 수 없습니다.")

    fund = db.query(Fund).get(fund_id)
    if not fund:
        raise HTTPException(404, "조합을 찾을 수 없습니다.")

    lps = db.query(FundLP).filter(FundLP.fund_id == fund_id).all()

    # 추가 변수 구성
    extra = {}
    if assembly_date:
        dt = datetime.fromisoformat(assembly_date)
        day_names = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"]
        extra["assembly_date"] = f"{dt.year}년 {dt.month}월 {dt.day}일({day_names[dt.weekday()]})"
        extra["assembly_date_short"] = f"{dt.year}. {dt.month:02d}. {dt.day:02d}"
        extra["assembly_time"] = "오전 10시"  # 기본값, 추후 파라미터화 가능
    if document_number:
        extra["document_number"] = document_number

    variables = build_variables_for_fund(fund, lps, extra)

    try:
        buffer = generate_document(template, variables)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))

    # 파일명: [조합명]_[문서명]_YYYY-MM-DD.docx
    today = datetime.now().strftime("%Y-%m-%d")
    filename = f"[{fund.name}]_{template.name}_{today}.docx"

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )
```

**`main.py`에 라우터 등록:**

```python
from routers import documents
app.include_router(documents.router, prefix="/api")
```

---

## Part 2 — 결성총회 3종 양식 자동생성 (코드 기반 레이아웃)

### 방식 변경: 파일 기반 → 코드 기반

> **원본 .docx 파일에서 텍스트를 치환하는 대신, python-docx로 문서 전체를 처음부터 코드에서 생성한다.**
>
> - ❌ ~~`templates/auto/` 폴더에 변수 태그 삽입본 보관~~ (불필요)
> - ✅ `backend/services/document_builders/` 에 각 문서별 빌더 함수 구현
> - ✅ 레이아웃, 폰트, 테이블 서식을 코드로 100% 제어
> - ✅ 원본 파일은 `templates/` 에 reference로만 보존

### 공통 레이아웃 유틸리티

```python
# backend/services/document_builders/layout_utils.py

from docx import Document
from docx.shared import Pt, Cm, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn, nsdecls
from docx.oxml import parse_xml


def create_base_document():
    """기본 문서 설정 (A4, 여백, 기본 폰트)"""
    doc = Document()
    section = doc.sections[0]
    section.page_width = Cm(21.0)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.0)
    section.bottom_margin = Cm(2.0)
    section.left_margin = Cm(2.5)
    section.right_margin = Cm(2.5)
    return doc


def add_run(paragraph, text, size=10, bold=False, font_name="맑은 고딕", color=None, spacing=None):
    """스타일 지정된 run 추가"""
    run = paragraph.add_run(text)
    run.font.size = Pt(size)
    run.bold = bold
    run.font.name = font_name
    # 한글 폰트 설정
    r = run._element
    rPr = r.get_or_add_rPr()
    rFonts = parse_xml(f'<w:rFonts {nsdecls("w")} w:eastAsia="{font_name}"/>')
    rPr.append(rFonts)
    if color:
        run.font.color.rgb = RGBColor(*color)
    if spacing:
        # 자간 설정 (1/20 포인트 단위)
        rPr_spacing = parse_xml(f'<w:spacing {nsdecls("w")} w:val="{spacing}"/>')
        rPr.append(rPr_spacing)
    return run


def add_paragraph(doc, text="", size=10, bold=False, alignment=None, space_before=0, space_after=0, font_name="맑은 고딕"):
    """스타일 지정된 단락 추가"""
    para = doc.add_paragraph()
    if alignment:
        para.alignment = alignment
    para.paragraph_format.space_before = Pt(space_before)
    para.paragraph_format.space_after = Pt(space_after)
    if text:
        add_run(para, text, size=size, bold=bold, font_name=font_name)
    return para


def set_cell_text(cell, text, size=9, bold=False, alignment=WD_ALIGN_PARAGRAPH.LEFT, font_name="맑은 고딕"):
    """테이블 셀 텍스트 설정"""
    cell.text = ""
    para = cell.paragraphs[0]
    para.alignment = alignment
    add_run(para, text, size=size, bold=bold, font_name=font_name)


def set_cell_shading(cell, color_hex):
    """셀 배경색 설정"""
    shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex}" w:val="clear"/>')
    cell._tc.get_or_add_tcPr().append(shading)


def set_table_borders(table, size=4, color="000000"):
    """테이블 테두리 설정"""
    tbl = table._tbl
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'  <w:top w:val="single" w:sz="{size}" w:space="0" w:color="{color}"/>'
        f'  <w:left w:val="single" w:sz="{size}" w:space="0" w:color="{color}"/>'
        f'  <w:bottom w:val="single" w:sz="{size}" w:space="0" w:color="{color}"/>'
        f'  <w:right w:val="single" w:sz="{size}" w:space="0" w:color="{color}"/>'
        f'  <w:insideH w:val="single" w:sz="{size}" w:space="0" w:color="{color}"/>'
        f'  <w:insideV w:val="single" w:sz="{size}" w:space="0" w:color="{color}"/>'
        f'</w:tblBorders>'
    )
    tbl.tblPr.append(borders)
```

### 2-A. 공문 (출자이행 통지) — 코드 레이아웃

이미지에서 분석한 공문 레이아웃을 코드로 구현:

```
┌─────────────────────────────────────────────────────┐
│ ①  회사 헤더: 중앙, 큰 굵은 글씨 + 로고             │
│     주소/전화/팩스 (작은 글씨, 중앙)                 │
│ ②  구분선 (가는 실선)                                │
│ ③  문서정보 테이블 (테두리 없음):                    │
│     날 짜 : {{document_date}}                       │
│     문서번호 : {{document_number}}                   │
│     수  신 : {{fund_name}} 조합원                    │
│     참  조 : 담당자 / 이메일 / 연락처                │
│     내  용 : {{fund_name}} 출자금 납입 통지의 건     │
│ ④  본문 텍스트 (설명 + 번호 리스트)                  │
│     1. 총회일자: {{assembly_date}}                   │
│     2. 총회방법: 서면결의                            │
│     3. 출자이행                                      │
│              - 아  래 -                              │
│     납입일시 / 납입금액 / 납입계좌                    │
│ ⑤  [첨부서류] 테이블 (4열: No./목록/해당자료/날인)   │
│ ⑥  [조합원 제출서류] 리스트                          │
│ ⑦  서명: 중앙, 자간 넓은 조합명 + 업무집행조합원     │
└─────────────────────────────────────────────────────┘
```

```python
# backend/services/document_builders/official_letter.py

from io import BytesIO
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt
from .layout_utils import (
    create_base_document, add_paragraph, add_run,
    set_cell_text, set_cell_shading, set_table_borders,
)


def build_official_letter(variables: dict) -> BytesIO:
    """
    공문 (결성총회 개최 및 출자이행 통지) 생성
    이미지 레이아웃 기준으로 구성
    """
    doc = create_base_document()

    # ━━━ ① 회사 헤더 ━━━
    header_para = add_paragraph(doc, alignment=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
    add_run(header_para, variables.get("gp_name", "트리거투자파트너스(유)"),
            size=18, bold=True, font_name="맑은 고딕")
    # T 로고 (텍스트로 대체, 추후 이미지 삽입 가능)
    add_run(header_para, "   T", size=18, bold=True, color=(0, 100, 180))

    # 주소/연락처 라인
    addr_para = add_paragraph(doc, alignment=WD_ALIGN_PARAGRAPH.CENTER, space_after=4)
    add_run(addr_para, variables.get("company_address", "서울특별시 강남구 테헤란로 OO길 OO, O층"),
            size=8, color=(128, 128, 128))
    add_run(addr_para, "    ", size=8)
    add_run(addr_para, f"TEL {variables.get('company_tel', '02-0000-0000')}",
            size=8, color=(128, 128, 128))
    add_run(addr_para, "    ", size=8)
    add_run(addr_para, f"FAX {variables.get('company_fax', '02-0000-0000')}",
            size=8, color=(128, 128, 128))

    # ━━━ ② 구분선 ━━━
    border_para = add_paragraph(doc, "─" * 65, size=6, alignment=WD_ALIGN_PARAGRAPH.CENTER, space_after=8)

    # ━━━ ③ 문서정보 테이블 (테두리 없는 2열) ━━━
    info_items = [
        ("문서번호 :", variables.get("document_number", "트리거-2025-00호")),
        ("수   신 :", f"{variables.get('fund_name', '')} 조합원"),
        ("참   조 :", f"업무 담당자 : {variables.get('contact_name', 'OOO')} / "
                     f"이메일 : {variables.get('contact_email', 'OOO')} / "
                     f"연락처 : {variables.get('contact_phone', 'OOO')}"),
        ("내   용 :", f"{variables.get('fund_name', '')} 출자금 납입 통지의 건"),
    ]

    info_table = doc.add_table(rows=len(info_items), cols=2)
    info_table.columns[0].width = Cm(2.5)
    info_table.columns[1].width = Cm(13.5)
    # 테두리 없음 (기본)
    for i, (label, value) in enumerate(info_items):
        set_cell_text(info_table.cell(i, 0), label, size=10, bold=True)
        set_cell_text(info_table.cell(i, 1), value, size=10)

    # ━━━ ④ 본문 ━━━
    add_paragraph(doc, space_before=12)

    fund_name = variables.get("fund_name", "")
    assembly_date = variables.get("assembly_date", "")

    # 본문 텍스트
    body = add_paragraph(doc, space_after=6)
    add_run(body,
        f"{assembly_date}에 개최되는 {fund_name}의 출자금 납입 안내 및 "
        f"결성총회에 필요한 서류를 첨부하여 송부 드리오니, 다음의 내용을 확인하여 주시기 바랍니다.",
        size=10)

    # 번호 리스트
    add_paragraph(doc,
        f"1) 결성총회 일시 : {assembly_date} {variables.get('assembly_time', '오전 10시')}",
        size=10, space_before=4)
    add_paragraph(doc,
        f"2) 총회방법 : {variables.get('assembly_method', '서면결의')}",
        size=10, space_before=2)
    add_paragraph(doc,
        "3) 출자이행",
        size=10, space_before=2, space_after=4)

    # 중앙 구분선
    add_paragraph(doc, "- 아    래 -", size=10, bold=True,
                  alignment=WD_ALIGN_PARAGRAPH.CENTER, space_before=8, space_after=8)

    # 납입 정보
    add_paragraph(doc,
        f"납입일시 : {assembly_date} {variables.get('assembly_time', '오전 10시')}까지",
        size=10, space_before=4)
    add_paragraph(doc,
        f"납입금액 : 약정좌수 × {variables.get('unit_price', '1,000,000')}원 (통장사본 참조)",
        size=10, space_before=2)
    add_paragraph(doc,
        f"납입계좌 : {variables.get('bank_account', '(별도 안내)')}",
        size=10, space_before=2, space_after=6)

    # 납입 관련 안내
    note = add_paragraph(doc, space_before=4, space_after=12)
    add_run(note,
        f"※ 규약 제OO조 제O항에 따라 납입기한 전 입금 시 총회일에 입금한 것으로 간주합니다.",
        size=9, color=(100, 100, 100))

    # ━━━ ⑤ [첨부서류] 섹션 ━━━
    add_paragraph(doc, "[첨부서류]", size=10, bold=True, space_before=8, space_after=2)
    add_paragraph(doc, "1. 결성총회 소집통지서 1부", size=10, space_before=2)
    add_paragraph(doc, "2. 결성총회 의안설명서 1부", size=10, space_after=6)

    # 별첨 서류 목록 테이블
    attachment_headers = ["No.", "목 록", "해당 자료", "날인 필요"]
    attachments = [
        ("1", "조합규약(안)", "별첨1", ""),
        ("2", "조합규약(안)_별표3. 조합원 동의서", "별표3", "○"),
        ("3", "투자의사결정 심의기구 운영방안", "별첨2", ""),
        ("4", "자산보관·관리 위탁계약서", "별첨3", ""),
        ("5", "개인정보 수집·이용·제공 동의서", "별첨4", "○"),
        ("6", "고객거래확인서(개인)", "별첨5", "○"),
        ("7", "서면결의서", "별첨6", "○"),
        ("8", "조합 외부감사 제안서", "별첨7", ""),
    ]

    att_table = doc.add_table(rows=len(attachments) + 1, cols=4)
    set_table_borders(att_table)
    att_table.columns[0].width = Cm(1.2)
    att_table.columns[1].width = Cm(9.0)
    att_table.columns[2].width = Cm(2.5)
    att_table.columns[3].width = Cm(2.0)

    # 헤더 행
    for j, header in enumerate(attachment_headers):
        cell = att_table.cell(0, j)
        set_cell_text(cell, header, size=9, bold=True, alignment=WD_ALIGN_PARAGRAPH.CENTER)
        set_cell_shading(cell, "E8E8E8")

    # 데이터 행
    for i, (no, name, ref, stamp) in enumerate(attachments, 1):
        set_cell_text(att_table.cell(i, 0), no, size=9, alignment=WD_ALIGN_PARAGRAPH.CENTER)
        set_cell_text(att_table.cell(i, 1), name, size=9)
        set_cell_text(att_table.cell(i, 2), ref, size=9, alignment=WD_ALIGN_PARAGRAPH.CENTER)
        set_cell_text(att_table.cell(i, 3), stamp, size=9, alignment=WD_ALIGN_PARAGRAPH.CENTER)

    # ━━━ ⑥ [조합원 제출서류] ━━━
    add_paragraph(doc, space_before=10)
    add_paragraph(doc, "[조합원 제출서류]", size=10, bold=True, space_after=2)
    add_paragraph(doc, "신분증 사본, 개인인감증명서", size=10, space_after=20)

    # ━━━ ⑦ 서명 영역 ━━━
    # 조합명 (자간 넓게, 굵은 글씨, 중앙 정렬)
    sign_name = add_paragraph(doc, alignment=WD_ALIGN_PARAGRAPH.CENTER, space_before=20)
    spaced_name = "  ".join(fund_name)  # 자간 효과: 글자 사이에 공백
    add_run(sign_name, spaced_name, size=16, bold=True, font_name="맑은 고딕")

    # 업무집행조합원
    sign_gp = add_paragraph(doc, alignment=WD_ALIGN_PARAGRAPH.CENTER, space_before=4, space_after=0)
    add_run(sign_gp, f"업무집행조합원 {variables.get('gp_name', '')}",
            size=11, bold=False, font_name="맑은 고딕")

    # 저장
    buffer = BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer
```

### 2-B. 소집통지서 — 코드 레이아웃

```python
# backend/services/document_builders/assembly_notice.py

from io import BytesIO
from docx.enum.text import WD_ALIGN_PARAGRAPH
from .layout_utils import create_base_document, add_paragraph, add_run


def build_assembly_notice(variables: dict) -> BytesIO:
    """결성총회 소집통지서 생성"""
    doc = create_base_document()
    fund_name = variables.get("fund_name", "")

    # 제목
    add_paragraph(doc, "[첨부 1] 결성총회 소집통지서",
                  size=10, alignment=WD_ALIGN_PARAGRAPH.RIGHT, space_after=12)

    add_paragraph(doc, fund_name, size=14, bold=True,
                  alignment=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
    add_paragraph(doc, "결성총회 소집통지서", size=16, bold=True,
                  alignment=WD_ALIGN_PARAGRAPH.CENTER, space_after=16)

    # 인사말
    add_paragraph(doc, "조합원 제위의 평안과 건강을 기원합니다.", size=10, space_after=8)

    body = add_paragraph(doc, space_after=8)
    add_run(body, f"『{fund_name}』 규약 제15조에 따라 아래와 같이 결성총회를 "
                  f"개최하고자 하오니 서면결의로 의결권을 행사하여 주시기 바랍니다.", size=10)

    # 구분선
    add_paragraph(doc, "- 아    래 -", size=10, bold=True,
                  alignment=WD_ALIGN_PARAGRAPH.CENTER, space_before=12, space_after=12)

    # 총회 정보
    add_paragraph(doc,
        f"1. 총회 일자 : {variables.get('assembly_date', '')} "
        f"{variables.get('assembly_time', '오전 10시')}",
        size=10, space_before=4)
    add_paragraph(doc,
        f"2. 총회 방법 : {variables.get('assembly_method', '서면결의')}",
        size=10, space_before=2)
    add_paragraph(doc, "3. 회의 목적사항", size=10, space_before=2, space_after=6)

    # 안건 목록
    add_paragraph(doc, "■ 안 건", size=10, bold=True, space_before=4, space_after=4)
    agendas = [
        "제1호 안건: 조합 규약 승인의 건",
        "제2호 안건: 투자의사결정 심의기구 운영방안 승인의 건",
        "제3호 안건: 수탁회사 선정의 건",
        "제4호 안건: 개인 정보 활용을 위한 동의서 작성의 건",
        "제5호 안건: 고객 거래 확인서 작성의 건",
        "제6호 안건: 조합 외부감사인 선정의 건",
    ]
    for agenda in agendas:
        add_paragraph(doc, agenda, size=10, space_before=2)

    # 발송일 + 서명
    add_paragraph(doc, variables.get("document_date", ""), size=10,
                  alignment=WD_ALIGN_PARAGRAPH.RIGHT, space_before=20, space_after=8)

    add_paragraph(doc, fund_name, size=12, bold=True,
                  alignment=WD_ALIGN_PARAGRAPH.CENTER, space_before=12)
    add_paragraph(doc, f"업무집행조합원 {variables.get('gp_name', '')}",
                  size=11, alignment=WD_ALIGN_PARAGRAPH.CENTER, space_before=4)

    buffer = BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer
```

### 2-C. 서면결의서 — 코드 레이아웃

```python
# backend/services/document_builders/written_resolution.py

from io import BytesIO
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm
from .layout_utils import (
    create_base_document, add_paragraph, add_run,
    set_cell_text, set_cell_shading, set_table_borders,
)


def build_written_resolution(variables: dict) -> BytesIO:
    """서면결의서 생성"""
    doc = create_base_document()
    fund_name = variables.get("fund_name", "")

    # 제목
    add_paragraph(doc, "[별첨 6] 서면결의서",
                  size=10, alignment=WD_ALIGN_PARAGRAPH.RIGHT, space_after=12)

    # 수신
    recipient = add_paragraph(doc, alignment=WD_ALIGN_PARAGRAPH.LEFT, space_after=12)
    add_run(recipient, f"『{fund_name}』 ", size=11, bold=True)
    add_run(recipient, f"업무집행조합원 귀중", size=11)

    # 안내 문구
    body = add_paragraph(doc, space_after=12)
    add_run(body, f"본인은 {variables.get('assembly_date', '')}에 개최되는 "
                  f"『{fund_name}』의 결성총회에 직접 출석하지 못하여 "
                  f"아래의 의안에 대하여 다음과 같이 서면으로 의결권을 행사합니다.", size=10)

    # 안건 찬반 테이블
    agendas = [
        "제 1 호 안건 : 조합 규약 승인의 건",
        "제 2 호 안건 : 투자의사결정 심의기구 운영방안 승인의 건",
        "제 3 호 안건 : 수탁회사 선정의 건",
        "제 4 호 안건 : 개인 정보 활용을 위한 동의서 작성의 건",
        "제 5 호 안건 : 고객 거래 확인서 작성의 건",
        "제 6 호 안건 : 조합 외부감사인 선정의 건",
    ]

    vote_table = doc.add_table(rows=len(agendas) + 1, cols=3)
    set_table_borders(vote_table)
    vote_table.columns[0].width = Cm(10.0)
    vote_table.columns[1].width = Cm(2.5)
    vote_table.columns[2].width = Cm(2.5)

    # 헤더
    for j, header in enumerate(["의    안", "찬 성", "반 대"]):
        cell = vote_table.cell(0, j)
        set_cell_text(cell, header, size=10, bold=True, alignment=WD_ALIGN_PARAGRAPH.CENTER)
        set_cell_shading(cell, "E8E8E8")

    # 안건 행
    for i, agenda in enumerate(agendas, 1):
        set_cell_text(vote_table.cell(i, 0), agenda, size=9)
        set_cell_text(vote_table.cell(i, 1), "○", size=10, alignment=WD_ALIGN_PARAGRAPH.CENTER)
        set_cell_text(vote_table.cell(i, 2), "", size=10, alignment=WD_ALIGN_PARAGRAPH.CENTER)

    # 안내
    add_paragraph(doc, space_before=6)
    add_paragraph(doc, "*의결권의 찬성, 반대란에 O 표시를 해주시기 바랍니다.",
                  size=9, space_after=20)

    # 서명란
    add_paragraph(doc, variables.get("assembly_date", ""), size=10,
                  alignment=WD_ALIGN_PARAGRAPH.CENTER, space_before=16, space_after=16)

    sign_table = doc.add_table(rows=3, cols=2)
    sign_table.columns[0].width = Cm(4.0)
    sign_table.columns[1].width = Cm(8.0)
    set_cell_text(sign_table.cell(0, 0), "조합원명", size=10, bold=True)
    set_cell_text(sign_table.cell(0, 1), "", size=10)  # 수기 입력
    set_cell_text(sign_table.cell(1, 0), "약정좌수", size=10, bold=True)
    set_cell_text(sign_table.cell(1, 1), "", size=10)  # 수기 입력
    set_cell_text(sign_table.cell(2, 0), "서명/날인", size=10, bold=True)
    set_cell_text(sign_table.cell(2, 1), "(인)", size=10, alignment=WD_ALIGN_PARAGRAPH.RIGHT)
    set_table_borders(sign_table)

    buffer = BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer
```

### document_service.py 수정 — 빌더 디스패치

기존 `generate_document()` 함수를 수정하여 코드 기반 빌더를 호출:

```python
# document_service.py 에 추가

from services.document_builders.official_letter import build_official_letter
from services.document_builders.assembly_notice import build_assembly_notice
from services.document_builders.written_resolution import build_written_resolution

# 문서 유형별 빌더 매핑
DOCUMENT_BUILDERS = {
    "공문_결성총회_출자이행통지": build_official_letter,
    "첨부1_결성총회_소집통지서": build_assembly_notice,
    "별첨6_서면결의서": build_written_resolution,
}


def generate_document_v2(template_name: str, variables: dict) -> BytesIO:
    """코드 기반 문서 생성 (v2)"""
    builder = DOCUMENT_BUILDERS.get(template_name)
    if not builder:
        raise ValueError(f"지원하지 않는 문서 유형: {template_name}")
    return builder(variables)
```

### DB seed 변경 — file_path 대신 builder_name 사용

`DocumentTemplate` 모델에 `builder_name` 필드 추가 (기존 `file_path`는 optional로, 코드 빌더가 있으면 무시):

```python
# document_template.py 모델에 추가
builder_name = Column(String, nullable=True)  # "공문_결성총회_출자이행통지"

# seeds
DOCUMENT_TEMPLATE_SEEDS = [
    {
        "name": "공문_결성총회_출자이행통지",
        "category": "결성총회",
        "builder_name": "공문_결성총회_출자이행통지",
        "file_path": "",
        "description": "결성총회 개최 및 출자이행 통지 공문",
        "variables": '["fund_name","gp_name","document_date","document_number","assembly_date"]',
        "workflow_step_label": "소집통지서 발송",
    },
    {
        "name": "첨부1_결성총회_소집통지서",
        "category": "결성총회",
        "builder_name": "첨부1_결성총회_소집통지서",
        "file_path": "",
        "description": "결성총회 소집통지서",
        "variables": '["fund_name","gp_name","assembly_date","document_date"]',
        "workflow_step_label": "소집통지서 발송",
    },
    {
        "name": "별첨6_서면결의서",
        "category": "결성총회",
        "builder_name": "별첨6_서면결의서",
        "file_path": "",
        "description": "결성총회 서면결의서",
        "variables": '["fund_name","gp_name","assembly_date"]',
        "workflow_step_label": "소집통지서 발송",
    },
]
```

---

## Part 3 — 조합상세 "결성 시작" 버튼 + 워크플로우 자동 연결

### Context

조합상세 페이지(`FundDetailPage.tsx`)에서 상태가 `forming`인 조합에 **"🚀 결성 시작"** 버튼을 표시한다. 클릭 시:

1. 결성총회 워크플로우 템플릿을 자동으로 찾음 (category = "조합결성" & name에 "결성총회" 포함, 또는 별도 지정)
2. 워크플로우 인스턴스를 자동 생성 (fund_id 연결, 기준일 = fund.formation_date)
3. 워크플로우 페이지로 이동 (해당 인스턴스 자동 펼침)

### Implementation

`FundDetailPage.tsx` 상단 헤더 영역에 추가:

```tsx
{fund.status === 'forming' && (
  <button
    onClick={handleStartFormation}
    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:from-emerald-600 hover:to-teal-700 transition-all"
  >
    🚀 결성 시작
  </button>
)}
```

**`handleStartFormation` 함수:**

```tsx
const handleStartFormation = async () => {
  // 1. 결성총회 워크플로우 템플릿 조회
  const templates = await fetchWorkflows()
  const formationTemplate = templates.find(
    (t) => t.category === '조합결성' && t.name.includes('결성총회')
  )

  if (!formationTemplate) {
    addToast('error', '결성총회 워크플로우 템플릿을 찾을 수 없습니다.')
    return
  }

  // 2. 워크플로우 인스턴스 생성
  const instance = await instantiateWorkflow(formationTemplate.id, {
    name: `${fund.name} 결성총회`,
    trigger_date: fund.formation_date || new Date().toISOString().slice(0, 10),
    fund_id: fund.id,
    memo: `${fund.name} 결성 프로세스`,
  })

  addToast('success', `${fund.name} 결성 워크플로우가 시작되었습니다.`)

  // 3. 워크플로우 페이지로 이동 (인스턴스 자동 펼침)
  navigate('/workflows', { state: { expandInstanceId: instance.id } })
}
```

### 이미 결성이 시작된 경우

- 해당 조합에 연결된 활성 워크플로우 인스턴스가 있으면 "결성 시작" 버튼 대신 **"진행 중인 결성 워크플로우 보기"** 링크 표시
- 워크플로우 검색: `fetchWorkflowInstances({ fund_id: fund.id, status: 'active' })` 로 확인

```tsx
{activeFormationWorkflow ? (
  <button
    onClick={() => navigate('/workflows', { state: { expandInstanceId: activeFormationWorkflow.id } })}
    className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-100"
  >
    📋 결성 워크플로우 진행 중 ({activeFormationWorkflow.progress})
  </button>
) : fund.status === 'forming' ? (
  <button onClick={handleStartFormation} ...>🚀 결성 시작</button>
) : null}
```

---

## Part 4 — 워크플로우 단계별 문서 생성 버튼

### Context

워크플로우 인스턴스의 각 단계 행에 **"📄 문서"** 버튼을 추가한다. 해당 단계에 연결된 문서 템플릿이 있으면 버튼이 표시되고, 클릭 시 문서가 자동 생성되어 다운로드된다.

### 매칭 로직

`DocumentTemplate.workflow_step_label` 필드와 워크플로우 단계의 `name` 필드를 매칭한다.

예:
| 워크플로우 단계명 | DocumentTemplate.workflow_step_label | 생성되는 문서 |
|------------------|-------------------------------------|--------------|
| 소집통지서 발송 | "소집통지서 발송" | 공문 + 소집통지서 + 서면결의서 (3종 일괄) |
| 결성총회 개최 | "결성총회 개최" | 의사록 (추후 추가) |

### Implementation

`WorkflowsPage.tsx`의 `InstanceList` 컴포넌트에서, 각 step 행에 조건부 버튼 추가:

```tsx
// 문서 템플릿 목록 조회 (한 번만)
const { data: docTemplates } = useQuery({
  queryKey: ['documentTemplates'],
  queryFn: () => fetchDocumentTemplates(),
})

// step 렌더링 내부
{(() => {
  const matchingDocs = docTemplates?.filter(
    (dt) => dt.workflow_step_label && step.name.includes(dt.workflow_step_label)
  ) || []

  if (matchingDocs.length === 0 || !inst.fund_id) return null

  return (
    <button
      onClick={() => handleGenerateDocuments(matchingDocs, inst)}
      className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-600 hover:bg-blue-100 transition-colors"
    >
      📄 문서 ({matchingDocs.length}종)
    </button>
  )
})()}
```

**`handleGenerateDocuments` 함수:**

```tsx
const handleGenerateDocuments = async (
  templates: DocumentTemplate[],
  instance: WorkflowInstance,
) => {
  if (!instance.fund_id) {
    addToast('error', '연결된 조합이 없습니다.')
    return
  }

  for (const template of templates) {
    try {
      const response = await api.post(
        `/api/document-templates/${template.id}/generate`,
        null,
        {
          params: {
            fund_id: instance.fund_id,
            assembly_date: instance.trigger_date,
          },
          responseType: 'blob',
        },
      )

      // 다운로드 트리거
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.download = `${template.name}.docx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      addToast('error', `${template.name} 생성 실패`)
    }
  }

  addToast('success', `${templates.length}종 문서가 생성되었습니다.`)
}
```

### 프론트엔드 API 추가 (`api.ts`)

```typescript
// -- Document Templates --
export type DocumentTemplate = {
  id: number
  name: string
  category: string
  file_path: string
  description: string
  variables: string
  workflow_step_label: string | null
}

export const fetchDocumentTemplates = (category?: string): Promise<DocumentTemplate[]> =>
  api.get('/document-templates', { params: { category } }).then((r) => r.data)

export const generateDocument = (
  templateId: number,
  fundId: number,
  assemblyDate?: string,
  documentNumber?: string,
): Promise<Blob> =>
  api.post(`/document-templates/${templateId}/generate`, null, {
    params: { fund_id: fundId, assembly_date: assemblyDate, document_number: documentNumber },
    responseType: 'blob',
  }).then((r) => r.data)
```

---

## Part 5 — 워크플로우 완료 시 조합 상태 자동 전환

### Context

현재 워크플로우 인스턴스가 완료되면 (`status = "completed"`) 단순히 상태만 바뀐다. 결성총회 워크플로우가 완료되면 연결된 조합의 상태를 자동으로 "운용 중"으로 전환하고 결성일을 기록해야 한다.

### Implementation

`backend/routers/workflows.py`의 `complete_step` 함수 내 — 모든 단계가 완료되어 인스턴스가 `completed`로 전환되는 블록에 추가:

```python
# 모든 단계 완료 → 인스턴스 완료 처리 후
if all_steps_done:
    instance.status = "completed"
    instance.completed_at = datetime.utcnow()

    # === 자동 상태 전환 로직 ===
    # 결성 관련 워크플로우인 경우 조합 상태 자동 업데이트
    if instance.fund_id:
        fund = db.query(Fund).get(instance.fund_id)
        if fund and fund.status == "forming":
            template = db.query(WorkflowTemplate).get(instance.template_id)
            if template and template.category == "조합결성":
                fund.status = "active"
                if not fund.formation_date:
                    fund.formation_date = datetime.utcnow().date().isoformat()
```

### 프론트엔드 연동

- 워크플로우 완료 시 `queryClient.invalidateQueries({ queryKey: ['funds'] })` 추가하여 조합 목록 자동 갱신
- 토스트 메시지: `"워크플로우가 완료되어 조합 상태가 '운용 중'으로 변경되었습니다."`

---

## Files to create / modify

| # | Type | File | Changes |
|---|------|------|---------|
| 1 | **[NEW]** | `backend/models/document_template.py` | DocumentTemplate 모델 |
| 2 | **[NEW]** | `backend/services/document_service.py` | 변수 치환 엔진 (replace_text, build_variables, generate_document) |
| 3 | **[NEW]** | `backend/routers/documents.py` | 문서 API (목록, 상세, 생성) |
| 4 | **[NEW]** | `backend/seeds/document_templates.py` | 결성총회 3종 템플릿 시드 데이터 |
| 5 | **[NEW]** | `templates/auto/공문_결성총회_출자이행통지.docx` | 변수 태그 삽입된 양식 사본 |
| 6 | **[NEW]** | `templates/auto/첨부1_결성총회_소집통지서.docx` | 변수 태그 삽입된 양식 사본 |
| 7 | **[NEW]** | `templates/auto/별첨6_서면결의서.docx` | 변수 태그 삽입된 양식 사본 |
| 8 | **[MODIFY]** | `backend/main.py` | documents 라우터 등록 |
| 9 | **[MODIFY]** | `backend/database.py` 또는 migration | DocumentTemplate 테이블 생성 |
| 10 | **[MODIFY]** | `backend/routers/workflows.py` | complete_step 내 조합 상태 자동 전환 로직 추가 |
| 11 | **[MODIFY]** | `frontend/src/lib/api.ts` | DocumentTemplate 타입 + fetchDocumentTemplates + generateDocument 함수 추가 |
| 12 | **[MODIFY]** | `frontend/src/pages/FundDetailPage.tsx` | "결성 시작" 버튼 + handleStartFormation 로직 |
| 13 | **[MODIFY]** | `frontend/src/pages/WorkflowsPage.tsx` | 단계별 "📄 문서" 버튼 + handleGenerateDocuments |
| 14 | **[MODIFY]** | `backend/requirements.txt` | `python-docx>=1.0.0` 추가 (이미 수동 설치됨, 명시화) |

---

## Acceptance Criteria

### Part 1: 문서 템플릿 엔진
- [ ] AC-01: `DocumentTemplate` 모델이 DB에 생성됨
- [ ] AC-02: `GET /api/document-templates` 가 카테고리별 필터링으로 템플릿 목록 반환
- [ ] AC-03: `POST /api/document-templates/{id}/generate?fund_id=N` 이 변수 치환된 .docx 파일을 반환
- [ ] AC-04: 치환 엔진이 `{{fund_name}}`, `{{assembly_date}}`, `{{gp_name}}` 등 단락 및 테이블 내 변수를 올바르게 치환

### Part 2: 결성총회 3종 양식
- [ ] AC-05: `templates/auto/` 폴더에 변수 태그가 삽입된 3종 양식 파일이 존재
- [ ] AC-06: 3종 양식 시드 데이터가 DB에 등록됨
- [ ] AC-07: 공문을 생성하면 조합명, 문서번호, 총회일자, 수신처가 자동 치환된 .docx 반환
- [ ] AC-08: 소집통지서를 생성하면 조합명, 총회일자, 발송일이 자동 치환됨
- [ ] AC-09: 서면결의서를 생성하면 조합명, 총회일자가 자동 치환됨

### Part 3: 결성 시작 버튼
- [ ] AC-10: `FundDetailPage`에서 상태가 `forming`인 조합에 "🚀 결성 시작" 버튼이 표시됨
- [ ] AC-11: 버튼 클릭 시 결성총회 워크플로우 인스턴스가 자동 생성됨 (fund_id 연결)
- [ ] AC-12: 이미 활성 결성 워크플로우가 있으면 "진행 중" 링크로 대체됨
- [ ] AC-13: 워크플로우 생성 후 워크플로우 페이지로 자동 이동

### Part 4: 워크플로우 단계별 문서 생성
- [ ] AC-14: 워크플로우 인스턴스에 fund_id가 연결되고 해당 단계에 매칭 템플릿이 있으면 "📄 문서" 버튼 표시
- [ ] AC-15: 버튼 클릭 시 매칭되는 모든 문서가 자동 생성되어 .docx로 다운로드
- [ ] AC-16: fund_id가 없는 인스턴스에서는 버튼 미표시

### Part 5: 워크플로우 완료 → 조합 상태 전환
- [ ] AC-17: 결성 관련 워크플로우 모든 단계 완료 시 연결 조합 상태가 `forming` → `active`로 자동 전환
- [ ] AC-18: 결성일(formation_date)이 비어있으면 완료 시점으로 자동 기록
- [ ] AC-19: 상태 전환 후 프론트엔드 조합 목록이 자동 갱신됨

---

## 후속 확장 계획 (미구현, 참고용)

| 순서 | 항목 | 설명 |
|------|------|------|
| Phase 14-1 | 나머지 3종 양식 | 의안설명서, 심의기구 운영방안, 의사록 |
| Phase 14-2 | 투심위 문서 자동화 | 투심위 결과보고서, 의사록 양식 |
| Phase 14-3 | 투자계약 문서 자동화 | 투자계약서 표지, 운용지시서 |
| Phase 14-4 | 문서 관리 UI | 생성된 문서 이력 조회, 재생성, 삭제 |
| Phase 14-5 | LP별 개별 문서 | 소집통지서를 LP별로 개별 생성 (수신자 동적) |
| Phase 14-6 | **회사 프로필 범용화** | `CompanyProfile` 테이블 추가 → 회사명/주소/전화/팩스/로고 이미지를 DB에서 관리. 다른 회사에서 사용 시 설정만 변경하면 모든 문서에 반영 |

---

**Last updated:** 2026-02-16
