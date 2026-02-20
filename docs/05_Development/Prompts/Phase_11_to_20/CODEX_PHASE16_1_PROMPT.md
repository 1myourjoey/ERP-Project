# Phase 16-1: 문서 템플릿 WYSIWYG 편집 모달

> **Priority:** P2
> **Depends on:** Phase 16 (완료)
> **Focus:** 폼 기반 편집기를 **WYSIWYG 모달**로 교체 — 실제 문서 레이아웃을 보면서 직접 편집

---

## Table of Contents

1. [개요](#개요)
2. [Part 1 — 의존성 설치](#part-1--의존성-설치)
3. [Part 2 — DocumentEditorModal 컴포넌트](#part-2--documenteditormodal-컴포넌트)
4. [Part 3 — TemplateManagementPage 연결](#part-3--templatemanagementpage-연결)
5. [Part 4 — 백엔드 미리보기 API 개선](#part-4--백엔드-미리보기-api-개선)
6. [Files to create / modify](#files-to-create--modify)
7. [Acceptance Criteria](#acceptance-criteria)
8. [구현 주의사항](#구현-주의사항)

---

## 개요

### 현재 (Phase 16)

TemplateManagementPage에서 **폼 필드**(input, textarea, 테이블) 로 `custom_data`를 편집하고 저장한다. 편집 경험이 실제 문서 출력물과 괴리가 있음 → 사용자는 수정 내용이 최종 문서에 어떻게 반영되는지 직관적으로 알기 어렵다.

### 목표 (Phase 16-1)

템플릿 카드를 클릭하면 **모달**이 열리고, 모달 내부에 **실제 문서 레이아웃을 HTML/CSS로 시각화**하여 해당 영역을 직접 클릭/편집할 수 있게 한다.

```
┌─────────────────── 📄 공문 편집 모달 ──────────────────────┐
│                                                            │
│  ╔══════════════════════════════════════════════════════╗   │
│  ║         [회사명 편집 가능]           T               ║   │
│  ║   [주소 편집 가능]  TEL [전화]  FAX [팩스]           ║   │
│  ║  ──────────────────────────────────────────          ║   │
│  ║  날   짜 : {{document_date}}                         ║   │
│  ║  문서번호 : {{document_number}}                       ║   │
│  ║  수   신 : {{fund_name}} 조합원                      ║   │
│  ║  내   용 : {{fund_name}} 출자금 납입 통지의 건        ║   │
│  ║                                                      ║   │
│  ║  [본문 텍스트 클릭하여 편집]                          ║   │
│  ║                                                      ║   │
│  ║  1) 결성총회 일시 : {{assembly_date}}                 ║   │
│  ║  2) 총회방법 : {{assembly_method}}                   ║   │
│  ║  3) 출자이행                                         ║   │
│  ║          - 아    래 -                                ║   │
│  ║  납입일시 : ...   납입금액 : ...   납입계좌 : ...     ║   │
│  ║                                                      ║   │
│  ║  [첨부서류]  ← 섹션 전체 편집 가능                   ║   │
│  ║  ┌──┬──────────────┬──────┬──────┐                   ║   │
│  ║  │1 │ [편집 가능]   │[편집]│  ☐   │                   ║   │
│  ║  │2 │ [편집 가능]   │[편집]│  ☑   │                   ║   │
│  ║  │  │         [+ 행 추가]  │      │                   ║   │
│  ║  └──┴──────────────┴──────┴──────┘                   ║   │
│  ║                                                      ║   │
│  ║  [조합원 제출서류] [편집 가능]                         ║   │
│  ║                                                      ║   │
│  ║          {{fund_name}}                               ║   │
│  ║     업무집행조합원 {{gp_name}}                        ║   │
│  ╚══════════════════════════════════════════════════════╝   │
│                                                            │
│  📋 변수 치트시트      조합 선택: [▾ 미리보기용 조합]        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ {{fund_name}} 조합명  {{gp_name}} GP명               │   │
│  │ {{assembly_date}} 총회일자  {{document_date}} 문서일  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                            │
│           [미리보기 (.docx)]   [저장]   [초기화]   [닫기]    │
└────────────────────────────────────────────────────────────┘
```

### 핵심 원칙

1. **TipTap이나 리치 에디터 라이브러리 사용 안 함** — 오버킬. 문서 구조가 고정되어 있으므로 `contentEditable` + `input` + CSS로 충분.
2. **문서 레이아웃을 HTML/CSS로 재현** — 실제 `.docx` 출력 결과와 거의 동일하게 보이도록 스타일링.
3. **편집 가능한 영역만 표시** — `{{변수}}`는 읽기 전용 칩(chip)으로 표시, 사용자가 수정하는 텍스트만 편집 가능.
4. **기존 `custom_data` JSON 구조 완전 호환** — 모달에서 수정한 내용이 Phase 16의 JSON 구조 그대로 저장됨. 백엔드 변경 없음.

---

## Part 1 — 의존성 설치

**추가 npm 패키지 없음!**

HTML `contentEditable` + React `useState` + CSS로 구현한다. 외부 에디터 라이브러리를 사용하지 않아 번들 사이즈 영향이 없다.

**Google Fonts 추가:**

`frontend/index.html`의 `<head>`에 다음을 추가:

```html
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&family=Noto+Serif+KR:wght@400;700&display=swap" rel="stylesheet">
```

이 폰트는 공문 레이아웃의 회사명(`Noto Serif KR`, 세리프 볼드 이탤릭 T 로고)과 본문(`Noto Sans KR`)에 사용된다.

---

## Part 2 — DocumentEditorModal 컴포넌트

### 2-A. 컴포넌트 구조

```
DocumentEditorModal (모달 wrapper)
├── DocumentEditorModal.OfficialLetterLayout   (공문 레이아웃)
├── DocumentEditorModal.AssemblyNoticeLayout    (소집통지서 레이아웃)
├── DocumentEditorModal.WrittenResolutionLayout (서면결의서 레이아웃)
├── VariableChip                               ({{변수}} 읽기 전용 표시)
├── EditableText                               (클릭하여 편집 가능한 텍스트)
├── EditableTextarea                           (클릭하여 편집 가능한 여러 줄 텍스트)
├── InlineAttachmentTable                      (첨부서류 인라인 테이블)
└── InlineAgendaList                           (안건 인라인 목록)
```

### 2-B. 컴포넌트 파일: `frontend/src/components/DocumentEditorModal.tsx`

**주요 props:**

```tsx
interface DocumentEditorModalProps {
  open: boolean
  onClose: () => void
  template: DocumentTemplate
  templateKind: 'official' | 'assembly' | 'resolution'
  editData: TemplateCustomData
  onEditDataChange: (data: TemplateCustomData) => void
  onSave: () => void
  onPreview: () => void
  onReset: () => void
  isSaving: boolean
  isPreviewing: boolean
  funds: Fund[]
  previewFundId: number | ''
  onPreviewFundIdChange: (id: number | '') => void
}
```

### 2-C. CSS 스타일 — 문서 레이아웃 재현

모달 내부에 A4 비율의 영역을 만들고 공문 레이아웃을 CSS로 재현한다.
**반드시 아래 Appendix A의 참조 HTML과 동일한 시각적 결과가 나와야 한다.**

```css
/* 문서 편집 모달 내부 스타일 */
.document-preview {
  max-width: 700px;
  margin: 0 auto;
  padding: 32px 48px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  font-family: 'Noto Sans KR', 'Malgun Gothic', sans-serif;
  font-size: 14px;
  line-height: 1.8;
  min-height: 800px;
  color: #1f2937;
}

/* 세리프 폰트 (T 로고, 조합명) */
.serif-font {
  font-family: 'Noto Serif KR', serif;
}

/* 공문 테이블 스타일 */
.gongmun-table th, .gongmun-table td {
  border: 1px solid #e5e7eb;
  padding: 0.5rem;
}
.gongmun-table th {
  background-color: #f3f4f6;
  text-align: center;
  font-weight: 600;
}

.document-preview .section-title {
  font-weight: bold;
  margin-top: 16px;
}

.document-preview .attachment-table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 13px;
}

.document-preview .attachment-table th,
.document-preview .attachment-table td {
  border: 1px solid #e5e7eb;
  padding: 6px 8px;
}

.document-preview .attachment-table th {
  background: #f3f4f6;
  font-weight: 600;
  text-align: center;
}

/* 편집 가능한 영역 스타일 */
.editable-area {
  position: relative;
  cursor: text;
  border-radius: 3px;
  transition: all 0.15s ease;
}

.editable-area:hover {
  background: #EFF6FF;
  outline: 1px dashed #93C5FD;
}

.editable-area:focus-within {
  background: #DBEAFE;
  outline: 2px solid #3B82F6;
}

/* 편집 불가 변수 칩 */
.variable-chip {
  display: inline-block;
  background: #F3E8FF;
  color: #7C3AED;
  border-radius: 4px;
  padding: 0 4px;
  font-size: 11px;
  font-family: monospace;
  pointer-events: none;
  user-select: none;
}
```

### 2-D. 편집 가능 영역 (EditableText) 컴포넌트

```tsx
/**
 * 인라인 편집 가능한 텍스트.
 * 클릭하면 input으로 변환, blur 시 읽기 모드로 복귀.
 */
function EditableText({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
        autoFocus
        className={`editable-area bg-blue-50 border-none outline-2 outline-blue-400 px-1 ${className}`}
      />
    )
  }

  return (
    <span
      className={`editable-area px-1 ${className}`}
      onClick={() => setEditing(true)}
    >
      {value || <span className="text-gray-300">{placeholder || '클릭하여 입력'}</span>}
    </span>
  )
}
```

### 2-E. 변수 칩 (VariableChip) 컴포넌트

```tsx
/**
 * {{변수}}를 시각적 칩으로 렌더링.
 * 텍스트에서 {{...}} 패턴을 파싱하여 변수 부분만 칩으로 표시.
 */
function renderTextWithVariables(text: string) {
  const parts = text.split(/(\\{\\{[^}]+\\}\\})/)
  return parts.map((part, i) => {
    if (part.match(/^\\{\\{[^}]+\\}\\}$/)) {
      return <span key={i} className="variable-chip">{part}</span>
    }
    return <span key={i}>{part}</span>
  })
}
```

### 2-F. 레이아웃 컴포넌트 — 공문 (OfficialLetterLayout)

> **중요:** 반드시 아래 **Appendix A의 참조 HTML**을 기준으로 레이아웃을 구현하라.
> 참조 HTML의 구조, 스타일, 간격, 색상, 직인 모양을 최대한 동일하게 재현하되,
> 편집 가능한 영역만 `EditableText` / `EditableTextarea`로 교체한다.

핵심 시각 요소 체크리스트:
- [x] 헤더: 왼쪽에 `T`(세리프, 이탤릭, 36px) + 회사명(22px) / 오른쪽에 주소·TEL·FAX(11px)
- [x] 헤더 아래 **2px solid 구분선**
- [x] 문서 정보: `grid(80px 1fr)` — 날짜, 문서번호, 수신, **참조**(담당자/이메일/연락처 = 편집 가능), **제목**(밑줄, 16px 볼드)
- [x] 본문 → `EditableTextarea`
- [x] 1) 결성총회 일시 / 2) 방법 / 3) 출자이행통지 안내 문구(편집 가능)
- [x] 납입 정보 박스: `bg-gray-50` + `border` 안에 **"- 다 음 -"** 제목, 불릿 리스트(납입기한/납입계좌), 하단 안내 텍스트
- [x] `<hr>` 구분선
- [x] [첨부서류] 번호 리스트 (cover_attachments) + "※ 의안설명서 별첨 자료" 테이블 (attachments)
- [x] [조합원 제출서류] **노란 배경 박스** (`bg-yellow-50 border-yellow-200`)
- [x] 서명 영역: 조합명 (세리프, 28px, `letter-spacing: 0.2em`) + 업무집행조합원 + GP명 + **(인)** 원형 직인 (double border, 빨강, rotate 12deg, opacity 0.5)

```tsx
function OfficialLetterLayout({
  editData,
  setField,
}: {
  editData: TemplateCustomData
  setField: (key: string, value: unknown) => void
}) {
  const header = asRecord(editData.company_header)
  const payment = asRecord(editData.payment_info)
  const attachments = asAttachmentList(editData.attachments)
  const coverAttachments = asStringList(editData.cover_attachments)

  return (
    <div className="document-preview" style={{ fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif" }}>

      {/* ── 헤더: 왼쪽(T로고 + 회사명) | 오른쪽(주소/연락처) ── */}
      <div style={{ borderBottom: '2px solid #1f2937', paddingBottom: 16, marginBottom: 24,
                     display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827',
                     display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <span style={{ fontSize: 36, fontFamily: "'Noto Serif KR', serif",
                         fontWeight: 800, fontStyle: 'italic' }}>T</span>
          <EditableText
            value={String(header.company_name ?? '트리거투자파트너스(유)')}
            onChange={(v) => setField('company_header', { ...header, company_name: v })}
          />
        </h1>
        <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'right', lineHeight: 1.6 }}>
          <div>
            <EditableText
              value={String(header.address ?? '04029) 서울특별시 마포구 양화로7길 70, 5층')}
              onChange={(v) => setField('company_header', { ...header, address: v })}
              placeholder="회사 주소"
            />
          </div>
          <div>
            TEL <EditableText value={String(header.tel ?? '02-2038-2456')}
              onChange={(v) => setField('company_header', { ...header, tel: v })} />
            {' / FAX '}
            <EditableText value={String(header.fax ?? '02-6953-2456')}
              onChange={(v) => setField('company_header', { ...header, fax: v })} />
          </div>
        </div>
      </div>

      {/* ── 문서 정보 (grid 80px | 1fr) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr',
                     gap: '6px 0', fontSize: 14, marginBottom: 28 }}>
        <div style={{ fontWeight: 700 }}>날 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;짜 :</div>
        <div><VariableChip text="{{document_date}}" /></div>

        <div style={{ fontWeight: 700 }}>문서번호 :</div>
        <div><VariableChip text="{{document_number}}" /></div>

        <div style={{ fontWeight: 700 }}>수 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;신 :</div>
        <div><VariableChip text="{{fund_name}}" /> 조합원</div>

        <div style={{ fontWeight: 700 }}>참 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;조 :</div>
        <div>
          업무 담당자 : <EditableText value={String(header.contact_name ?? '000')}
            onChange={(v) => setField('company_header', { ...header, contact_name: v })} />
          {' / 이메일 : '}<EditableText value={String(header.contact_email ?? '000')}
            onChange={(v) => setField('company_header', { ...header, contact_email: v })} />
          {' / 연락처 : '}<EditableText value={String(header.contact_phone ?? '000')}
            onChange={(v) => setField('company_header', { ...header, contact_phone: v })} />
        </div>

        {/* 제목: 밑줄 + 볼드 */}
        <div style={{ fontWeight: 700, marginTop: 6, borderTop: '1px solid #e5e7eb', paddingTop: 6 }}>
          제 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;목 :
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, marginTop: 6,
                       textDecoration: 'underline', textUnderlineOffset: 4, textDecorationColor: '#9ca3af' }}>
          <VariableChip text="{{fund_name}}" /> 출자금 납입 통지의 건
        </div>
      </div>

      {/* ── 본문 ── */}
      <EditableTextarea
        value={String(editData.body_text ?? '{{assembly_date}}에 개최되는 {{fund_name}}의 출자금 납입 기한을 ...')}
        onChange={(v) => setField('body_text', v)}
        placeholder="본문 텍스트를 입력하세요"
        minRows={3}
      />

      <div style={{ paddingLeft: 16, marginTop: 12 }}>
        <p><b>1) 결성총회 일시 :</b> <VariableChip text="{{assembly_date}}" /> <VariableChip text="{{assembly_time}}" /></p>
        <p><b>2) 결성총회 방법 :</b> <VariableChip text="{{assembly_method}}" /></p>
        <p><b>3) 출자이행통지 :</b>
          <EditableText
            value={String(payment.regulation_text ?? '규약 제10조에 따라 ...')}
            onChange={(v) => setField('payment_info', { ...payment, regulation_text: v })}
          />
        </p>
      </div>

      {/* ── 납입 정보 박스 (bg-gray-50) ── */}
      <div style={{ background: '#f9fafb', padding: 16, border: '1px solid #e5e7eb',
                     borderRadius: 2, marginTop: 20 }}>
        <p style={{ fontWeight: 700, marginBottom: 8 }}>- 다 음 -</p>
        <ul style={{ listStyleType: 'disc', paddingLeft: 24 }}>
          <li><b>납입기한 :</b> <VariableChip text="{{assembly_date}}" /> <VariableChip text="{{assembly_time}}" />까지</li>
          <li><b>납입계좌 :</b>
            <EditableText value={String(payment.bank_account ?? '(국민은행) 000, 통장사본 참조')}
              onChange={(v) => setField('payment_info', { ...payment, bank_account: v })} />
          </li>
        </ul>
        <p style={{ fontSize: 11, color: '#6b7280', marginTop: 8 }}>
          <EditableText value={String(payment.note ?? '* 조합 규약 제10조 제3항에 따라 ...')}
            onChange={(v) => setField('payment_info', { ...payment, note: v })} />
        </p>
      </div>

      <hr style={{ borderColor: '#d1d5db', margin: '20px 0' }} />

      {/* ── 첨부서류 ── */}
      <h3 style={{ fontWeight: 700, marginBottom: 8 }}>[첨부서류]</h3>
      <InlineAgendaList agendas={coverAttachments}
        onChange={(next) => setField('cover_attachments', next)}
        title="" addLabel="+ 항목 추가" />

      <p style={{ fontWeight: 700, fontSize: 13, marginTop: 16, color: '#374151' }}>
        ※ 결성총회 의안설명서 별첨 자료
      </p>
      <InlineAttachmentTable attachments={attachments}
        onChange={(next) => setField('attachments', next)} />

      {/* ── 조합원 제출서류 (노란 배경 박스) ── */}
      <div style={{ background: '#fefce8', padding: 12, border: '1px solid #fde68a',
                     marginTop: 16, display: 'flex', gap: 8 }}>
        <span style={{ fontWeight: 700, color: '#92400e', whiteSpace: 'nowrap' }}>[조합원 제출서류]</span>
        <EditableText
          value={String(editData.required_documents_text ?? '신분증 사본, 개인인감증명서')}
          onChange={(v) => setField('required_documents_text', v)}
        />
      </div>

      {/* ── 서명/직인 영역 ── */}
      <div style={{ marginTop: 64, marginBottom: 32, textAlign: 'center', position: 'relative' }}>
        <h2 style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 28,
                      fontWeight: 700, letterSpacing: '0.2em', marginBottom: 28 }}>
          <VariableChip text="{{fund_name}}" />
        </h2>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center',
                       gap: 16, position: 'relative' }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>업무집행조합원</span>
          <span style={{ fontSize: 19, fontWeight: 700, fontFamily: "'Noto Serif KR', serif" }}>
            <VariableChip text="{{gp_name}}" />
          </span>
          {/* (인) 직인 — 빨간 double-border 원, 살짝 기울임 */}
          <span style={{
            display: 'inline-flex', width: 56, height: 56,
            border: '3px double #dc2626', borderRadius: '50%',
            alignItems: 'center', justifyContent: 'center',
            color: '#dc2626', fontSize: 11, fontWeight: 700,
            opacity: 0.5, position: 'absolute', right: 40, top: '50%',
            transform: 'translateY(-50%) rotate(12deg)',
          }}>(인)</span>
        </div>
      </div>

    </div>
  )
}
```

### 2-G. InlineAttachmentTable — 첨부서류 인라인 편집

문서 레이아웃 안에서 바로 편집할 수 있는 테이블:

```tsx
function InlineAttachmentTable({
  attachments,
  onChange,
}: {
  attachments: AttachmentItem[]
  onChange: (next: AttachmentItem[]) => void
}) {
  const addRow = () => {
    onChange([
      ...attachments,
      { no: String(attachments.length + 1), name: '', ref: '', stamp_required: false },
    ])
  }

  const updateRow = (index: number, patch: Partial<AttachmentItem>) => {
    onChange(attachments.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const removeRow = (index: number) => {
    onChange(
      attachments
        .filter((_, i) => i !== index)
        .map((r, i) => ({ ...r, no: String(i + 1) }))
    )
  }

  return (
    <>
      <table className="attachment-table">
        <thead>
          <tr>
            <th style={{ width: 40 }}>No.</th>
            <th>목 록</th>
            <th style={{ width: 70 }}>해당 자료</th>
            <th style={{ width: 60 }}>날인</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {attachments.map((att, i) => (
            <tr key={i}>
              <td style={{ textAlign: 'center' }}>{att.no}</td>
              <td>
                <EditableText
                  value={att.name}
                  onChange={(v) => updateRow(i, { name: v })}
                  placeholder="문서명"
                />
              </td>
              <td style={{ textAlign: 'center' }}>
                <EditableText
                  value={att.ref}
                  onChange={(v) => updateRow(i, { ref: v })}
                  placeholder="별첨"
                />
              </td>
              <td style={{ textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={att.stamp_required}
                  onChange={(e) => updateRow(i, { stamp_required: e.target.checked })}
                />
              </td>
              <td>
                <button
                  onClick={() => removeRow(i)}
                  className="text-red-400 hover:text-red-600 text-xs"
                >×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={addRow}
        className="text-xs text-blue-500 hover:text-blue-700 mt-1"
      >
        + 행 추가
      </button>
    </>
  )
}
```

### 2-H. 소집통지서 / 서면결의서 레이아웃도 동일 패턴

소집통지서 (`AssemblyNoticeLayout`):
- 인사말 → `EditableText`
- 규약 조항 → `EditableText`
- 본문 텍스트 → `EditableTextarea`
- 안건 목록 → `InlineAgendaList` (번호 매기기 + 편집 + 삭제 + 추가)

서면결의서 (`WrittenResolutionLayout`):
- 도입 문구 → `EditableTextarea`
- 안건 목록 → `InlineAgendaList` (찬성/반대 표시 포함 테이블)
- 의결 안내 문구 → `EditableText`

---

## Part 3 — TemplateManagementPage 연결

### 3-A. 기존 폼 편집 영역 교체

현재 `TemplateManagementPage.tsx`의 우측 편집 패널(line 491~601)을 **모달 트리거 버튼**으로 교체:

**기존:**
```tsx
{templateKind === 'official' && (
  <div className="space-y-4">
    {/* 폼 필드들 */}
  </div>
)}
```

**변경 후:**
```tsx
{selectedTemplate && templateKind && (
  <>
    <button onClick={() => setEditorOpen(true)} className="primary-btn">
      📝 문서 편집
    </button>
    <DocumentEditorModal
      open={editorOpen}
      onClose={() => setEditorOpen(false)}
      template={selectedTemplate}
      templateKind={templateKind}
      editData={editData}
      onEditDataChange={setEditData}
      onSave={handleSave}
      onPreview={handlePreview}
      onReset={handleResetToDefault}
      isSaving={saveMutation.isPending}
      isPreviewing={previewMutation.isPending}
      funds={funds}
      previewFundId={previewFundId}
      onPreviewFundIdChange={setPreviewFundId}
    />
  </>
)}
```

### 3-B. 목록 페이지 변경

좌측 목록에서 템플릿을 선택하면 **바로 모달이 열리도록** 변경:

```tsx
// 기존: 선택 → 우측 폼 표시
// 변경: 선택 → 모달 오픈
const handleTemplateClick = (template: DocumentTemplate) => {
  setSelectedTemplateId(template.id)
  setEditorOpen(true)
}
```

목록 카드를 좀 더 시각적으로 개선:
- 각 카드에 작은 **미리보기 아이콘** 추가
- 마지막 수정 일시 표시
- 카드 호버 시 "클릭하여 편집" 힌트

---

## Part 4 — 백엔드 미리보기 API 개선

> **이 파트에서 실제로 달라지는 것은 거의 없다.** Phase 16의 `POST /api/document-templates/{id}/preview` API를 그대로 사용한다.

한 가지만 추가:

```python
# 모달에서 HTML 미리보기를 위한 endpoint (선택적)
@router.post("/api/document-templates/{template_id}/preview-html")
def preview_template_html(
    template_id: int,
    body: TemplateCustomDataUpdate,
    db: Session = Depends(get_db),
):
    """
    커스텀 데이터 기반으로 HTML 미리보기 반환.
    → 모달 내부에서 실시간 미리보기로 사용 가능.
    → 선택 구현: 없으면 .docx 다운로드 방식 유지.
    """
    # 이 API는 선택적(optional) 구현. 없어도 모달 기능에 지장 없음.
    pass
```

> 이 API는 **선택 구현**이다. 모달에서 [미리보기] 버튼은 기존처럼 `.docx` 파일을 다운로드하는 방식으로도 충분하다.

---

## Files to create / modify

| # | Type | File | Changes |
|---|------|------|---------|
| 1 | **[NEW]** | `frontend/src/components/DocumentEditorModal.tsx` | WYSIWYG 모달 + 3종 레이아웃 컴포넌트 + 인라인 편집 컴포넌트 |
| 2 | **[MODIFY]** | `frontend/src/pages/TemplateManagementPage.tsx` | 폼 편집 영역 → 모달 트리거 교체, 목록 카드 클릭 시 모달 오픈 |
| 3 | **[MODIFY]** | `frontend/src/index.css` | `.document-preview`, `.editable-area`, `.variable-chip` 등 CSS 추가 |

> **백엔드 변경 없음.** Phase 16의 API를 그대로 사용한다.

---

## Acceptance Criteria

### 모달 기본 기능
- [ ] AC-01: 템플릿 카드 클릭 시 편집 모달 열림
- [ ] AC-02: 모달 내부에 A4 비율의 문서 레이아웃이 HTML/CSS로 표시됨
- [ ] AC-03: `{{변수}}`는 보라색 칩으로 표시되며 편집 불가
- [ ] AC-04: ESC키 또는 닫기 버튼으로 모달 닫힘

### 공문 레이아웃 편집
- [ ] AC-05: 회사 헤더(회사명, 주소, 전화, 팩스) 클릭하여 인라인 편집
- [ ] AC-06: 본문 텍스트 클릭하여 편집
- [ ] AC-07: 납입 정보(단가, 계좌, 안내문구) 클릭하여 편집
- [ ] AC-08: 첨부서류 테이블 셀 클릭하여 편집, 행 추가/삭제
- [ ] AC-09: 조합원 제출서류 텍스트 편집

### 소집통지서 레이아웃 편집
- [ ] AC-10: 인사말, 규약 조항 편집
- [ ] AC-11: 안건 목록 인라인 편집, 추가/삭제

### 서면결의서 레이아웃 편집
- [ ] AC-12: 도입 문구, 의결 안내 문구 편집
- [ ] AC-13: 안건 목록 인라인 편집, 추가/삭제

### 저장/미리보기
- [ ] AC-14: [저장] 클릭 시 기존 Phase 16 API로 custom_data 저장
- [ ] AC-15: [미리보기] 클릭 시 .docx 다운로드
- [ ] AC-16: [초기화] 클릭 시 기본값 복원
- [ ] AC-17: 변수 치트시트 패널이 모달 하단에 표시

### 회귀
- [ ] AC-18: 기존 Phase 16 API 동작에 영향 없음
- [ ] AC-19: 프론트엔드 빌드 성공
- [ ] AC-20: 기존 Phase 15 테스트 전체 통과

---

## 구현 주의사항

### 왜 TipTap/Quill 같은 리치 에디터를 사용하지 않는가?

1. **문서 구조가 고정적** — 자유 형식이 아님. 회사 헤더, 정보 테이블, 본문, 첨부서류 테이블 등 **고정된 블록** 구조.
2. **오버킬** — 리치 에디터를 도입하면 에디터의 HTML 출력 → JSON 변환 → python-docx 빌더 반영까지 복잡한 파이프라인이 필요.
3. **`contentEditable` + input으로 충분** — 각 블록이 독립적이므로, 블록 단위로 `EditableText` 컴포넌트를 배치하는 것이 가장 간결하고 신뢰성 높음.
4. **JSON 호환** — 편집 결과가 바로 `custom_data` JSON 구조에 매핑되므로 변환 과정이 불필요.

### 모달 사이즈

- **최소 너비:** 780px (문서 가로 + 여백)
- **높이:** 화면의 90vh (스크롤 가능)
- **모바일:** 전체 화면 (fullscreen modal)

### 접근성

- 모달 열릴 때 `focus trap` 적용
- ESC 키로 닫기
- 편집 필드 간 Tab 이동 지원

---

## Appendix A — 공문 참조 HTML (원본)

> **이 HTML이 OfficialLetterLayout의 시각적 기준이다.**
> 코덱스는 이 HTML의 구조·스타일·색상·간격을 최대한 동일하게 재현하되,
> 편집 가능한 영역만 `EditableText` / `EditableTextarea` 컴포넌트로 교체하라.

```html
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>공문 - 트리거 메디테크 3호 조합</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&family=Noto+Serif+KR:wght@400;700&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Noto Sans KR', sans-serif;
        }
        .serif-font {
            font-family: 'Noto Serif KR', serif;
        }
        .gongmun-table th, .gongmun-table td {
            border: 1px solid #e5e7eb;
            padding: 0.5rem;
        }
        .gongmun-table th {
            background-color: #f3f4f6;
            text-align: center;
            font-weight: 600;
        }
    </style>
</head>
<body class="bg-gray-100 min-h-screen p-4 md:p-8 print:bg-white print:p-0">

    <!-- 문서 컨테이너 (A4 비율 유사 설정) -->
    <div class="max-w-3xl mx-auto bg-white shadow-xl p-8 md:p-12 print:shadow-none print:w-full">
        
        <!-- 헤더 섹션 -->
        <div class="border-b-2 border-gray-800 pb-4 mb-6 flex justify-between items-end">
            <div>
                <h1 class="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <span class="text-4xl serif-font font-extrabold italic">T</span>
                    트리거투자파트너스(유)
                </h1>
            </div>
            <div class="text-xs text-gray-500 text-right">
                <p>04029) 서울특별시 마포구 양화로7길 70, 5층</p>
                <p>TEL 02-2038-2456 / FAX 02-6953-2456</p>
            </div>
        </div>

        <!-- 문서 정보 -->
        <div class="grid grid-cols-[80px_1fr] gap-y-2 text-sm mb-8">
            <div class="font-bold text-gray-700">날 &nbsp; &nbsp; &nbsp; 짜 :</div>
            <div>2025. 10. 20</div>

            <div class="font-bold text-gray-700">문서번호 :</div>
            <div>트리거-2025-23호</div>

            <div class="font-bold text-gray-700">수 &nbsp; &nbsp; &nbsp; 신 :</div>
            <div>메디테크 3호 조합 조합원</div>

            <div class="font-bold text-gray-700">참 &nbsp; &nbsp; &nbsp; 조 :</div>
            <div>업무 담당자 : 000 / 이메일 : 000 / 연락처 : 000</div>

            <div class="font-bold text-gray-700 mt-2 border-t pt-2 md:border-t-0 md:pt-0">제 &nbsp; &nbsp; &nbsp; 목 :</div>
            <div class="font-bold text-lg mt-2 md:mt-0 underline decoration-gray-400 underline-offset-4">메디테크 3호 조합 출자금 납입 통지의 건</div>
        </div>

        <!-- 본문 내용 -->
        <div class="text-base leading-relaxed text-gray-800 space-y-6">
            <p>
                1. 2025년 10월 24일(금)에 개최되는 메디테크 3호 조합의 출자금 납입 기한을 변경하고자 하오니, 다음의 내용을 확인하여 주시기 바랍니다.
            </p>

            <div class="pl-4 space-y-2">
                <p><span class="font-bold">1) 결성총회 일시 :</span> 2025년 10월 24일(금요일) 오전 10시</p>
                <p><span class="font-bold">2) 결성총회 방법 :</span> 서면결의</p>
                <p><span class="font-bold">3) 출자이행통지 :</span> 규약 제10조에 따라 결성 시 출자이행통지를 함께 하오니, 다음을 참조하시어 설립출자금을 납입하여 주시기 바랍니다.</p>
            </div>

            <!-- 납입 정보 박스 -->
            <div class="bg-gray-50 p-4 border border-gray-200 rounded-sm">
                <p class="font-bold mb-2">- 다 음 -</p>
                <ul class="list-disc list-inside space-y-1 ml-2">
                    <li><span class="font-bold">납입기한 :</span> 2025년 10월 24일(금) 오전 10시까지</li>
                    <li><span class="font-bold">납입계좌 :</span> (국민은행) 000, 통장사본 참조</li>
                </ul>
                <p class="text-xs text-gray-500 mt-2">* 조합 규약 제10조 제3항에 따라 납입기한 전 입금시 총회일에 입금한 것으로 간주함</p>
            </div>

            <hr class="border-gray-300">

            <!-- 첨부서류 목록 -->
            <div>
                <h3 class="font-bold mb-2">[첨부서류]</h3>
                <ol class="list-decimal list-inside text-sm mb-4 space-y-1">
                    <li>결성총회 소집통지서 1부</li>
                    <li>결성총회 의안설명서 1부</li>
                </ol>

                <p class="font-bold text-sm mb-2 text-gray-700">※ 결성총회 의안설명서 별첨 자료</p>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm gongmun-table border-collapse">
                        <thead>
                            <tr>
                                <th class="w-12">No.</th>
                                <th>목 록</th>
                                <th class="w-24">해당 자료</th>
                                <th class="w-20">날인 필요</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="text-center">1</td>
                                <td>조합규약(안)</td>
                                <td class="text-center">별첨1</td>
                                <td class="text-center"></td>
                            </tr>
                            <tr>
                                <td class="text-center">2</td>
                                <td>조합규약(안)_별표3. 조합원 동의서</td>
                                <td class="text-center">별표3</td>
                                <td class="text-center text-red-500 font-bold">O</td>
                            </tr>
                            <tr>
                                <td class="text-center">3</td>
                                <td>투자의사결정 심의기구 운영방안</td>
                                <td class="text-center">별첨2</td>
                                <td class="text-center"></td>
                            </tr>
                            <tr>
                                <td class="text-center">4</td>
                                <td>자산보관·관리 위탁계약서</td>
                                <td class="text-center">별첨3</td>
                                <td class="text-center"></td>
                            </tr>
                            <tr>
                                <td class="text-center">5</td>
                                <td>개인정보 수집·이용·제공 동의서</td>
                                <td class="text-center">별첨4</td>
                                <td class="text-center text-red-500 font-bold">O</td>
                            </tr>
                            <tr>
                                <td class="text-center">6</td>
                                <td>고객거래확인서(개인)</td>
                                <td class="text-center">별첨5</td>
                                <td class="text-center text-red-500 font-bold">O</td>
                            </tr>
                            <tr>
                                <td class="text-center">7</td>
                                <td>서면결의서</td>
                                <td class="text-center">별첨6</td>
                                <td class="text-center text-red-500 font-bold">O</td>
                            </tr>
                            <tr>
                                <td class="text-center">8</td>
                                <td>조합 외부감사 제안서_태성회계법인</td>
                                <td class="text-center">별첨7</td>
                                <td class="text-center"></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 추가 첨부 및 제출 서류 -->
             <div class="text-sm space-y-2 mt-4">
                <p><span class="font-bold">3. 조합 통장사본</span></p>
                <div class="bg-yellow-50 p-3 border border-yellow-200 inline-block w-full">
                    <span class="font-bold text-yellow-800">[조합원 제출서류]</span> 신분증 사본, 개인인감증명서
                </div>
            </div>
        </div>

        <!-- 푸터 / 직인 -->
        <div class="mt-20 mb-8 text-center relative">
            <h2 class="serif-font text-3xl font-bold tracking-widest text-gray-900 mb-8">메 디 테 크 3 호 조 합</h2>
            
            <div class="flex justify-center items-center gap-4 relative">
                <span class="text-lg font-bold">업무집행조합원</span>
                <span class="text-xl font-bold serif-font">000 파트너스</span>
                <span class="inline-block w-16 h-16 border-2 border-red-600 rounded-full flex items-center justify-center text-red-600 text-xs font-bold opacity-50 absolute right-10 md:right-32 top-1/2 transform -translate-y-1/2 rotate-12" style="border-style: double;">
                    (인)
                </span>
            </div>
        </div>

    </div>

</body>
</html>
```

---

**Last updated:** 2026-02-17
