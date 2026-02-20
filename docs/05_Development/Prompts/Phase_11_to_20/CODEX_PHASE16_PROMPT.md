# Phase 16: 문서 템플릿 관리 UI — 커스텀 편집 + 실시간 미리보기

> **Priority:** P1
> **Focus:** 관리 탭 하위에 "템플릿 관리" 페이지 추가, Phase 14의 3종 문서를 사용자가 직접 커스텀하고 워크플로우에 자동 반영

---

## Table of Contents

1. [Part 1 — 백엔드: 템플릿 커스텀 데이터 구조 + API](#part-1--백엔드-템플릿-커스텀-데이터-구조--api)
2. [Part 2 — 프론트엔드: 템플릿 관리 페이지](#part-2--프론트엔드-템플릿-관리-페이지)
3. [Part 3 — 백엔드: 빌더가 커스텀 데이터를 사용하도록 수정](#part-3--백엔드-빌더가-커스텀-데이터를-사용하도록-수정)
4. [Part 4 — 라우팅 및 네비게이션 연결](#part-4--라우팅-및-네비게이션-연결)
5. [Files to create / modify](#files-to-create--modify)
6. [Acceptance Criteria](#acceptance-criteria)

---

## 개요

### 현재 상태

Phase 14에서 3종 문서(공문, 소집통지서, 서면결의서)의 레이아웃이 `document_builders/` 의 Python 코드에 하드코딩되어 있다. 첨부서류 목록, 안건 목록, 본문 텍스트 등을 변경하려면 코드 수정이 필요하다.

### 목표

사용자가 **ERP 화면에서 직접** 아래 항목을 편집할 수 있게 한다:

| 편집 가능 항목 | 예시 |
|-------------|------|
| 공문 회사 헤더 정보 | 회사 주소, 전화, 팩스 |
| 공문 본문 텍스트 | 인사말, 안내문 |
| 첨부서류 목록 | 행 추가/삭제/순서변경 |
| 안건 (의안) 목록 | 행 추가/삭제/수정 |
| 조합원 제출서류 목록 | 항목 수정 |
| 소집통지서 규약 조항 번호 | "제15조" → 변경 가능 |
| 서면결의서 안내 문구 | 문구 수정 |

수정된 내용은 **즉시** 워크플로우의 문서 생성에 반영된다.

### 전체 흐름

```
┌──────────────────────────────────────────────────────────┐
│  관리 → 템플릿 관리 페이지                                 │
│                                                          │
│  ┌───────────────────────┐  ┌──────────────────────────┐  │
│  │ 템플릿 목록 (좌측)      │  │ 편집 패널 (우측)          │  │
│  │                       │  │                          │  │
│  │ ● 공문_출자이행통지    │  │  [기본정보]               │  │
│  │   소집통지서           │  │  회사 주소: [__________]  │  │
│  │   서면결의서           │  │  전화: [__________]       │  │
│  │                       │  │                          │  │
│  │                       │  │  [첨부서류] ───────────    │  │
│  │                       │  │  1. 조합규약(안)  [삭제]   │  │
│  │                       │  │  2. 조합원동의서  [삭제]   │  │
│  │                       │  │  [+ 행 추가]              │  │
│  │                       │  │                          │  │
│  │                       │  │  [안건 목록] ──────────    │  │
│  │                       │  │  1. 규약 승인     [삭제]   │  │
│  │                       │  │  2. 심의기구 승인 [삭제]   │  │
│  │                       │  │  [+ 안건 추가]             │  │
│  │                       │  │                          │  │
│  │                       │  │  [미리보기] [저장]          │  │
│  └───────────────────────┘  └──────────────────────────┘  │
│                                                          │
│  미리보기 클릭 → 현재 편집 상태로 .docx 즉시 다운로드       │
│  저장 클릭 → DB에 커스텀 데이터 저장, 이후 워크플로에 자동적용 │
└──────────────────────────────────────────────────────────┘
```

---

## Part 1 — 백엔드: 템플릿 커스텀 데이터 구조 + API

### 1-A. DocumentTemplate 모델 확장

현재 `DocumentTemplate` 모델에 `custom_data` 컬럼을 추가하여, 사용자가 편집한 커스텀 내용을 JSON으로 저장한다.

```python
# backend/models/document_template.py — 추가

custom_data = Column(Text, default="{}")  # JSON: 사용자가 편집한 커스텀 데이터
```

**custom_data JSON 구조 (문서 유형별):**

#### 공문 (출자이행 통지)
```json
{
  "company_header": {
    "address": "서울특별시 강남구 테헤란로 OO길 OO, O층",
    "tel": "02-0000-0000",
    "fax": "02-0000-0000"
  },
  "body_text": "{{assembly_date}}에 개최되는 {{fund_name}}의 출자금 납입 안내 및 ...",
  "payment_info": {
    "unit_price": "1,000,000",
    "bank_account": "(별도 안내)",
    "note": "※ 규약 제OO조 제O항에 따라 납입기한 전 입금 시 총회일에 입금한 것으로 간주합니다."
  },
  "attachments": [
    {"no": "1", "name": "조합규약(안)", "ref": "별첨1", "stamp_required": false},
    {"no": "2", "name": "조합규약(안)_별표3. 조합원 동의서", "ref": "별표3", "stamp_required": true},
    {"no": "3", "name": "투자의사결정 심의기구 운영방안", "ref": "별첨2", "stamp_required": false},
    {"no": "4", "name": "자산보관·관리 위탁계약서", "ref": "별첨3", "stamp_required": false},
    {"no": "5", "name": "개인정보 수집·이용·제공 동의서", "ref": "별첨4", "stamp_required": true},
    {"no": "6", "name": "고객거래확인서(개인)", "ref": "별첨5", "stamp_required": true},
    {"no": "7", "name": "서면결의서", "ref": "별첨6", "stamp_required": true},
    {"no": "8", "name": "조합 외부감사 제안서", "ref": "별첨7", "stamp_required": false}
  ],
  "required_documents_text": "신분증 사본, 개인인감증명서",
  "cover_attachments": ["결성총회 소집통지서 1부", "결성총회 의안설명서 1부"]
}
```

#### 소집통지서
```json
{
  "greeting": "조합원 제위의 평안과 건강을 기원합니다.",
  "regulation_article": "제15조",
  "body_text": "『{{fund_name}}』 규약 {{regulation_article}}에 따라 ...",
  "agendas": [
    "제1호 안건: 조합 규약 승인의 건",
    "제2호 안건: 투자의사결정 심의기구 운영방안 승인의 건",
    "제3호 안건: 수탁회사 선정의 건",
    "제4호 안건: 개인 정보 활용을 위한 동의서 작성의 건",
    "제5호 안건: 고객 거래 확인서 작성의 건",
    "제6호 안건: 조합 외부감사인 선정의 건"
  ]
}
```

#### 서면결의서
```json
{
  "introduction_text": "본인은 {{assembly_date}}에 개최되는 ...",
  "agendas": [
    "제 1 호 안건 : 조합 규약 승인의 건",
    "제 2 호 안건 : 투자의사결정 심의기구 운영방안 승인의 건",
    "제 3 호 안건 : 수탁회사 선정의 건",
    "제 4 호 안건 : 개인 정보 활용을 위한 동의서 작성의 건",
    "제 5 호 안건 : 고객 거래 확인서 작성의 건",
    "제 6 호 안건 : 조합 외부감사인 선정의 건"
  ],
  "vote_note": "*의결권의 찬성, 반대란에 O 표시를 해주시기 바랍니다."
}
```

### 1-B. API: 템플릿 커스텀 데이터 수정 + 미리보기

```python
# backend/routers/documents.py 에 추가

from pydantic import BaseModel

class TemplateCustomDataUpdate(BaseModel):
    custom_data: dict  # JSON 형태의 커스텀 데이터


@router.put("/api/document-templates/{template_id}/custom")
def update_template_custom_data(
    template_id: int,
    body: TemplateCustomDataUpdate,
    db: Session = Depends(get_db),
):
    """템플릿 커스텀 데이터 수정"""
    template = db.get(DocumentTemplate, template_id)
    if not template:
        raise HTTPException(404, "템플릿을 찾을 수 없습니다.")
    
    import json
    template.custom_data = json.dumps(body.custom_data, ensure_ascii=False)
    db.commit()
    db.refresh(template)
    return template


@router.post("/api/document-templates/{template_id}/preview")
def preview_template(
    template_id: int,
    fund_id: int = Query(None, description="미리보기용 조합 ID (선택)"),
    custom_data: dict = None,  # 저장 전 임시 데이터로 미리보기
    db: Session = Depends(get_db),
):
    """
    템플릿 미리보기 — 현재 편집 중인 커스텀 데이터로 즉시 .docx 생성
    fund_id가 없으면 샘플 데이터로 생성
    """
    template = db.get(DocumentTemplate, template_id)
    if not template:
        raise HTTPException(404, "템플릿을 찾을 수 없습니다.")
    
    # 미리보기용 변수 구성
    if fund_id:
        fund = db.get(Fund, fund_id)
        lps = db.query(LP).filter(LP.fund_id == fund_id).all() if fund else []
        variables = build_variables_for_fund(fund, lps) if fund else _sample_variables()
    else:
        variables = _sample_variables()
    
    # custom_data를 variables에 merge (빌더에서 사용)
    if custom_data:
        variables["__custom_data__"] = custom_data
    elif template.custom_data:
        import json
        variables["__custom_data__"] = json.loads(template.custom_data)
    
    buffer = generate_document_for_template(template, variables)
    
    filename = f"미리보기_{template.name}.docx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


def _sample_variables() -> dict:
    """미리보기용 샘플 데이터"""
    return {
        "fund_name": "OO 1호 조합",
        "gp_name": "트리거투자파트너스(유)",
        "document_date": "2025. 01. 01",
        "document_number": "트리거-2025-001호",
        "assembly_date": "2025년 1월 15일(수요일)",
        "assembly_time": "오전 10시",
        "assembly_method": "서면결의",
        "lp_count": "5",
        "total_commitment_amount": "10,000,000,000",
    }
```

### 1-C. DB 마이그레이션

```
alembic revision --autogenerate -m "add custom_data to document_templates"
alembic upgrade head
```

---

## Part 2 — 프론트엔드: 템플릿 관리 페이지

### 2-A. 페이지: `TemplateManagementPage.tsx`

**좌측 패널:** 템플릿 목록 (카드 형태)
**우측 패널:** 선택된 템플릿의 편집 폼

```tsx
// frontend/src/pages/TemplateManagementPage.tsx

// 주요 상태:
const [selectedTemplate, setSelectedTemplate] = useState(null)
const [editData, setEditData] = useState({})  // 편집 중인 custom_data
const [previewFundId, setPreviewFundId] = useState(null)

// API 호출:
const { data: templates } = useQuery(['documentTemplates'], fetchDocumentTemplates)
const updateMutation = useMutation(updateTemplateCustomData)
const previewMutation = useMutation(previewTemplate)
```

### 2-B. 편집 컴포넌트 구조

```
TemplateManagementPage
├── TemplateList (좌측)
│   └── TemplateCard × N
│       - 이름, 카테고리, 마지막 수정일
│       - 클릭 시 우측 편집 패널 표시
│
└── TemplateEditor (우측)
    ├── CompanyHeaderEditor     (공문 전용)
    │   - 주소, 전화, 팩스 텍스트 필드
    │
    ├── BodyTextEditor          (공통)
    │   - textarea로 본문 텍스트 편집
    │   - {{변수}} 하이라이트 표시
    │
    ├── AgendaListEditor        (소집통지서, 서면결의서)
    │   - 안건 목록 행 추가/삭제/드래그 정렬
    │   - 각 행: 텍스트 입력 필드
    │
    ├── AttachmentListEditor    (공문 전용)
    │   - 첨부서류 테이블 행 추가/삭제
    │   - 각 행: 이름, 참조번호, 날인필요 체크박스
    │
    ├── RequiredDocsEditor      (공문 전용)
    │   - 제출서류 텍스트 편집
    │
    └── ActionButtons
        - [미리보기] → .docx 즉시 다운로드 (샘플/실제 조합 선택)
        - [저장] → custom_data DB 저장
        - [초기화] → 기본값으로 복원
```

### 2-C. 각 편집 컴포넌트 예시

#### AgendaListEditor (안건 목록)

```tsx
function AgendaListEditor({ agendas, onChange }) {
  const addAgenda = () => {
    onChange([...agendas, `제${agendas.length + 1}호 안건: `])
  }

  const removeAgenda = (index) => {
    onChange(agendas.filter((_, i) => i !== index))
  }

  const updateAgenda = (index, value) => {
    onChange(agendas.map((a, i) => i === index ? value : a))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">안건 목록</h4>
        <button onClick={addAgenda} className="text-xs text-blue-600 hover:text-blue-800">
          + 안건 추가
        </button>
      </div>
      {agendas.map((agenda, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-6">{i + 1}</span>
          <input
            value={agenda}
            onChange={(e) => updateAgenda(i, e.target.value)}
            className="flex-1 px-2 py-1 text-sm border rounded"
          />
          <button onClick={() => removeAgenda(i)} className="text-red-400 hover:text-red-600">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
```

#### AttachmentListEditor (첨부서류 테이블)

```tsx
function AttachmentListEditor({ attachments, onChange }) {
  const addRow = () => {
    onChange([...attachments, { 
      no: String(attachments.length + 1), 
      name: "", 
      ref: "", 
      stamp_required: false 
    }])
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">첨부서류 목록</h4>
        <button onClick={addRow}>+ 행 추가</button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1 w-10">No.</th>
            <th className="px-2 py-1">목록</th>
            <th className="px-2 py-1 w-20">참조</th>
            <th className="px-2 py-1 w-16">날인</th>
            <th className="px-2 py-1 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {attachments.map((att, i) => (
            <tr key={i}>
              <td><input value={att.no} onChange={...} /></td>
              <td><input value={att.name} onChange={...} /></td>
              <td><input value={att.ref} onChange={...} /></td>
              <td><input type="checkbox" checked={att.stamp_required} onChange={...} /></td>
              <td><button onClick={() => removeRow(i)}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

### 2-D. 변수 도움말 패널

편집 화면에 `{{변수}}` 사용 가능 목록을 표시:

```tsx
<div className="bg-blue-50 rounded-lg p-3 text-xs space-y-1">
  <p className="font-semibold text-blue-700">사용 가능한 변수</p>
  <p><code>{'{{fund_name}}'}</code> — 조합명</p>
  <p><code>{'{{gp_name}}'}</code> — 업무집행조합원명</p>
  <p><code>{'{{assembly_date}}'}</code> — 총회일자</p>
  <p><code>{'{{document_date}}'}</code> — 문서 작성일</p>
  <p><code>{'{{document_number}}'}</code> — 문서번호</p>
  <p><code>{'{{lp_count}}'}</code> — 조합원 수</p>
  <p><code>{'{{total_commitment_amount}}'}</code> — 총 약정액</p>
</div>
```

### 2-E. API 함수 (`api.ts` 추가)

```typescript
// 템플릿 커스텀 데이터 수정
export const updateTemplateCustomData = (templateId: number, customData: Record<string, unknown>) =>
  api.put(`/document-templates/${templateId}/custom`, { custom_data: customData }).then(r => r.data)

// 템플릿 미리보기 (docx 다운로드)
export const previewTemplate = (
  templateId: number,
  fundId?: number,
  customData?: Record<string, unknown>,
): Promise<Blob> =>
  api.post(`/document-templates/${templateId}/preview`, { custom_data: customData }, {
    params: { fund_id: fundId },
    responseType: 'blob',
  }).then(r => r.data)
```

---

## Part 3 — 백엔드: 빌더가 커스텀 데이터를 사용하도록 수정

### 3-A. 빌더 함수 수정 — variables에서 `__custom_data__` 읽기

각 빌더 함수가 `variables.get("__custom_data__", {})` 를 확인하여:
- 값이 있으면 → 커스텀 데이터 사용
- 값이 없으면 → 기존 하드코딩된 기본값 사용

#### 예시: official_letter.py 수정 패턴

```python
def build_official_letter(variables: dict) -> BytesIO:
    custom = variables.get("__custom_data__", {})
    
    # 기존 하드코딩 → custom에서 override
    company_header = custom.get("company_header", {})
    address = company_header.get("address", 
        variables.get("company_address", "서울특별시 강남구 테헤란로 OO길 OO, O층"))
    tel = company_header.get("tel", variables.get("company_tel", "02-0000-0000"))
    fax = company_header.get("fax", variables.get("company_fax", "02-0000-0000"))
    
    # 첨부서류: custom에 있으면 custom 사용, 없으면 기본값
    attachments = custom.get("attachments", DEFAULT_ATTACHMENTS)
    
    # 안건 목록
    agendas = custom.get("agendas", DEFAULT_AGENDAS)
    
    # ... 기존 빌드 로직은 동일, 데이터만 동적으로 변경
```

#### 빌더별 수정 범위

| 빌더 | custom_data 적용 대상 |
|------|---------------------|
| `official_letter.py` | company_header, body_text, payment_info, attachments, required_documents_text, cover_attachments |
| `assembly_notice.py` | greeting, regulation_article, agendas |
| `written_resolution.py` | introduction_text, agendas, vote_note |

### 3-B. generate_document_for_template 수정

`generate_document_for_template`에서 template의 `custom_data`를 자동으로 variables에 주입:

```python
def generate_document_for_template(template: DocumentTemplate, variables: dict) -> BytesIO:
    # custom_data가 DB에 저장되어 있으면 variables에 주입
    if template.custom_data and template.custom_data != "{}":
        import json
        try:
            custom = json.loads(template.custom_data)
            if "__custom_data__" not in variables:
                variables["__custom_data__"] = custom
        except json.JSONDecodeError:
            pass
    
    builder_key = template.builder_name or template.name
    if builder_key in _load_document_builders():
        return generate_document_v2(builder_key, variables)
    return generate_document(template, variables)
```

> **핵심:** 워크플로우에서 문서 생성 시 `generate_document_for_template`을 호출하면, DB에 저장된 `custom_data`가 **자동으로** 빌더에 전달된다. 추가 코드 변경 불필요.

---

## Part 4 — 라우팅 및 네비게이션 연결

### 4-A. Layout.tsx — 관리 그룹에 추가

```tsx
// 관리 그룹 (기존 items 배열 끝에 추가)
{
  label: '관리',
  items: [
    { to: '/biz-reports', label: '영업보고', icon: FileText },
    { to: '/reports', label: '보고공시', icon: Send },
    { to: '/fund-operations', label: '조합 운영', icon: Landmark },
    { to: '/documents', label: '서류 현황', icon: Files },
    { to: '/templates', label: '템플릿 관리', icon: FileCode2 },  // NEW
  ],
},
```

### 4-B. App.tsx — 라우트 추가

```tsx
import TemplateManagementPage from './pages/TemplateManagementPage'

// Route 추가
<Route path="/templates" element={<TemplateManagementPage />} />
```

---

## Part 5 — 기본값(Default) 초기 세팅

Phase 14에서 하드코딩된 값들을 DB seed의 `custom_data`에 기본값으로 설정하여, 최초 접근 시에도 편집 폼이 채워진 상태로 표시:

```python
# seeds/document_templates.py — custom_data 기본값 포함

DOCUMENT_TEMPLATE_SEEDS = [
    {
        "name": "공문_결성총회_출자이행통지",
        "category": "결성총회",
        "builder_name": "공문_결성총회_출자이행통지",
        "custom_data": json.dumps({
            "company_header": {
                "address": "서울특별시 강남구 테헤란로 OO길 OO, O층",
                "tel": "02-0000-0000",
                "fax": "02-0000-0000"
            },
            "attachments": [
                {"no": "1", "name": "조합규약(안)", "ref": "별첨1", "stamp_required": False},
                # ... 기존 8개 행
            ],
            "required_documents_text": "신분증 사본, 개인인감증명서",
            # ... 나머지 기본값
        }, ensure_ascii=False),
        # ... 기존 필드
    },
    # ... 소집통지서, 서면결의서도 동일 패턴
]
```

---

## Files to create / modify

| # | Type | File | Changes |
|---|------|------|---------|
| 1 | **[MODIFY]** | `backend/models/document_template.py` | `custom_data` 컬럼 추가 |
| 2 | **[MODIFY]** | `backend/routers/documents.py` | PUT /custom, POST /preview API 추가 |
| 3 | **[MODIFY]** | `backend/services/document_service.py` | `generate_document_for_template`에 custom_data 자동 주입 |
| 4 | **[MODIFY]** | `backend/services/document_builders/official_letter.py` | custom_data에서 동적 데이터 읽기 |
| 5 | **[MODIFY]** | `backend/services/document_builders/assembly_notice.py` | custom_data에서 안건/인사말 읽기 |
| 6 | **[MODIFY]** | `backend/services/document_builders/written_resolution.py` | custom_data에서 안건/안내문구 읽기 |
| 7 | **[NEW]** | `frontend/src/pages/TemplateManagementPage.tsx` | 템플릿 관리 페이지 (목록 + 편집 + 미리보기) |
| 8 | **[MODIFY]** | `frontend/src/lib/api.ts` | updateTemplateCustomData, previewTemplate 추가 |
| 9 | **[MODIFY]** | `frontend/src/App.tsx` | /templates 라우트 추가 |
| 10 | **[MODIFY]** | `frontend/src/components/Layout.tsx` | 관리 그룹에 "템플릿 관리" 메뉴 추가 |
| 11 | **[MODIFY]** | `backend/seeds/document_templates.py` | custom_data 기본값 포함 |
| 12 | **[NEW]** | Alembic migration | custom_data 컬럼 추가 |
| 13 | **[NEW]** | `backend/tests/test_template_management.py` | 커스텀 데이터 저장/조회/미리보기 테스트 |

---

## Acceptance Criteria

### Part 1: 백엔드
- [ ] AC-01: `DocumentTemplate` 모델에 `custom_data` (Text) 컬럼 추가
- [ ] AC-02: `PUT /api/document-templates/{id}/custom` 가 JSON 데이터를 저장
- [ ] AC-03: `POST /api/document-templates/{id}/preview` 가 custom_data 반영된 .docx 반환
- [ ] AC-04: fund_id 없이도 샘플 데이터로 미리보기 가능

### Part 2: 프론트엔드
- [ ] AC-05: `/templates` 경로에 템플릿 관리 페이지 표시
- [ ] AC-06: 좌측 목록에서 템플릿 선택 시 우측에 편집 폼 표시
- [ ] AC-07: 첨부서류 목록 행 추가/삭제/수정 가능
- [ ] AC-08: 안건 목록 행 추가/삭제/수정 가능
- [ ] AC-09: 본문 텍스트 편집 가능
- [ ] AC-10: [미리보기] 버튼으로 현재 편집 상태 .docx 즉시 다운로드
- [ ] AC-11: [저장] 버튼으로 DB에 커스텀 데이터 저장
- [ ] AC-12: [초기화] 버튼으로 기본값 복원
- [ ] AC-13: {{변수}} 도움말 패널 표시

### Part 3: 연동
- [ ] AC-14: 워크플로우에서 문서 생성 시 DB에 저장된 custom_data 자동 반영
- [ ] AC-15: custom_data 없으면 기존 하드코딩 기본값으로 생성 (하위호환)

### Part 4: 네비게이션
- [ ] AC-16: 관리 그룹에 "템플릿 관리" 메뉴 표시
- [ ] AC-17: 메뉴 클릭 시 /templates 페이지로 이동

### Part 5: 테스트
- [ ] AC-18: Phase 15 회귀 테스트 전체 통과 (기존 91개 + 신규)
- [ ] AC-19: 프론트엔드 빌드 성공

---

**Last updated:** 2026-02-17
