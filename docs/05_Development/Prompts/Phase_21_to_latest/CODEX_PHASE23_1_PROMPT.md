# Phase 23-1: 워크플로 단계별 서류 연결 인프라 + 템플릿 서류 선택

> **Priority:** P1
> **선행:** Phase 23 완료
> **목적:** 워크플로 단계(Step)에 서류를 연결하는 인프라 구축. 문서 데이터는 지금 넣지 않되, 차후 템플릿관리에 문서를 추가하면 워크플로 단계에서 자동 참조될 수 있는 구조.

---

## Table of Contents

1. [Part 1 — WorkflowStepDocument 모델 + 마이그레이션](#part-1)
2. [Part 2 — 단계별 서류 API](#part-2)
3. [Part 3 — 프론트엔드 API 함수](#part-3)
4. [Part 4 — 단계별 서류 연결 UI](#part-4)
5. [Files to create / modify](#files-to-create--modify)
6. [Acceptance Criteria](#acceptance-criteria)

---

## 현재 상태 분석

### 모델 구조
```
Workflow ─┬─ steps: WorkflowStep[]       (1:N)
          ├─ documents: WorkflowDocument[] (1:N) ← 워크플로 전체 서류
          └─ warnings: WorkflowWarning[]   (1:N)
```

- `WorkflowDocument.workflow_id` → 워크플로 전체에 연결
- `WorkflowStep`에 documents relationship 없음
- `DocumentTemplate` 모델 별도 존재 (id, name, category, builder_name, variables, custom_data, workflow_step_label)

### 프론트엔드 현재 상태
- `TemplateModal` (WorkflowsPage.tsx L232-448): 워크플로 전체 서류 추가/삭제 **이미 구현**
- `InstanceList` (L632): DocumentTemplate 기반 문서 생성(generateDocument) **이미 구현**
- 단계별 서류 UI: **없음**

### 원하는 최종 구조
```
Workflow ─┬─ steps: WorkflowStep[]
          │    └── step_documents: WorkflowStepDocument[] (1:N)
          │          ├── name (직접 입력)
          │          ├── required, timing, notes
          │          └── document_template_id? → DocumentTemplate (선택 연결)
          ├─ documents: WorkflowDocument[] (워크플로 전체 서류 — 기존 유지)
          └─ warnings: WorkflowWarning[]
```

---

## Part 1 — WorkflowStepDocument 모델

### 1-A. 새 모델 (`models/workflow.py`에 추가)

```python
class WorkflowStepDocument(Base):
    __tablename__ = "workflow_step_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    workflow_step_id = Column(Integer, ForeignKey("workflow_steps.id"), nullable=False)
    document_template_id = Column(Integer, ForeignKey("document_templates.id"), nullable=True)
    name = Column(String, nullable=False)  # 직접 입력 or DocumentTemplate.name 복사
    required = Column(Boolean, default=True)
    timing = Column(String, nullable=True)  # 이 단계 기준 시점
    notes = Column(Text, nullable=True)

    step = relationship("WorkflowStep", back_populates="step_documents")
    document_template = relationship("DocumentTemplate", lazy="joined")
```

### 1-B. WorkflowStep에 relationship 추가

```python
class WorkflowStep(Base):
    # ... 기존 필드 유지 ...
    step_documents = relationship(
        "WorkflowStepDocument",
        back_populates="step",
        cascade="all, delete-orphan",
    )
```

### 1-C. 주의사항

- `WorkflowDocument` (워크플로 전체 서류) 모델은 **그대로 유지**
- `WorkflowStepDocument`는 **새 테이블** — 단계당 서류
- `document_template_id`는 **nullable** — 없으면 직접 입력, 있으면 DocumentTemplate 참조
- DocumentTemplate 테이블의 __tablename__이 `document_templates`인지 확인 필수

---

## Part 2 — 단계별 서류 API

### 2-A. 스키마 추가 (`schemas/workflow.py`)

```python
class WorkflowStepDocumentInput(BaseModel):
    name: str
    required: bool = True
    timing: str | None = None
    notes: str | None = None
    document_template_id: int | None = None  # DocumentTemplate 연결 시

class WorkflowStepDocumentResponse(BaseModel):
    id: int
    workflow_step_id: int
    document_template_id: int | None
    name: str
    required: bool
    timing: str | None
    notes: str | None
    template_name: str | None = None  # document_template.name (조회 시 표시용)
    template_category: str | None = None

    class Config:
        from_attributes = True
```

### 2-B. 엔드포인트 추가 (`routers/workflows.py`)

```python
# 단계별 서류 목록 조회
@router.get("/api/workflow-steps/{step_id}/documents")
def list_step_documents(step_id: int, db: Session = Depends(get_db)):
    step = db.get(WorkflowStep, step_id)
    if not step:
        raise HTTPException(404, "워크플로 단계를 찾을 수 없습니다")
    return [
        {
            "id": d.id,
            "workflow_step_id": d.workflow_step_id,
            "document_template_id": d.document_template_id,
            "name": d.name,
            "required": d.required,
            "timing": d.timing,
            "notes": d.notes,
            "template_name": d.document_template.name if d.document_template else None,
            "template_category": d.document_template.category if d.document_template else None,
        }
        for d in step.step_documents
    ]

# 단계에 서류 추가
@router.post("/api/workflow-steps/{step_id}/documents")
def add_step_document(
    step_id: int,
    data: WorkflowStepDocumentInput,
    db: Session = Depends(get_db),
):
    step = db.get(WorkflowStep, step_id)
    if not step:
        raise HTTPException(404, "워크플로 단계를 찾을 수 없습니다")
    doc = WorkflowStepDocument(
        workflow_step_id=step_id,
        document_template_id=data.document_template_id,
        name=data.name,
        required=data.required,
        timing=data.timing,
        notes=data.notes,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return {
        "id": doc.id,
        "workflow_step_id": doc.workflow_step_id,
        "document_template_id": doc.document_template_id,
        "name": doc.name,
        "required": doc.required,
        "timing": doc.timing,
        "notes": doc.notes,
    }

# 단계 서류 삭제
@router.delete("/api/workflow-steps/{step_id}/documents/{document_id}")
def delete_step_document(
    step_id: int, document_id: int, db: Session = Depends(get_db)
):
    doc = db.query(WorkflowStepDocument).filter(
        WorkflowStepDocument.id == document_id,
        WorkflowStepDocument.workflow_step_id == step_id,
    ).first()
    if not doc:
        raise HTTPException(404, "서류를 찾을 수 없습니다")
    db.delete(doc)
    db.commit()
    return {"ok": True}
```

### 2-C. 워크플로 상세 응답에 포함

기존 `fetchWorkflow` API 응답에서 각 step에 `step_documents` 배열 포함:

```python
# workflows.py의 _build_workflow_response 등에서:
"steps": [
    {
        ...기존 step 필드...,
        "step_documents": [
            {"id": d.id, "name": d.name, "required": d.required, ...}
            for d in step.step_documents
        ]
    }
    for step in workflow.steps
]
```

---

## Part 3 — 프론트엔드 API 함수 (`lib/api.ts`)

### 3-A. 타입 추가

```typescript
export interface WorkflowStepDocument {
  id: number
  workflow_step_id: number
  document_template_id: number | null
  name: string
  required: boolean
  timing: string | null
  notes: string | null
  template_name?: string | null
  template_category?: string | null
}

export interface WorkflowStepDocumentInput {
  name: string
  required?: boolean
  timing?: string | null
  notes?: string | null
  document_template_id?: number | null
}
```

### 3-B. WorkflowStep 타입 확장

```typescript
export interface WorkflowStep {
  // ...기존 필드...
  step_documents?: WorkflowStepDocument[]  // 추가
}
```

### 3-C. API 함수

```typescript
export const listStepDocuments = (stepId: number): Promise<WorkflowStepDocument[]> =>
  api.get(`/workflow-steps/${stepId}/documents`).then(r => r.data)

export const addStepDocument = (
  stepId: number,
  data: WorkflowStepDocumentInput,
): Promise<WorkflowStepDocument> =>
  api.post(`/workflow-steps/${stepId}/documents`, data).then(r => r.data)

export const deleteStepDocument = (
  stepId: number,
  documentId: number,
): Promise<{ ok: boolean }> =>
  api.delete(`/workflow-steps/${stepId}/documents/${documentId}`).then(r => r.data)
```

---

## Part 4 — 단계별 서류 연결 UI (`WorkflowsPage.tsx`)

### 4-A. TemplateModal의 단계 카드 확장

현재 각 단계(step) 카드 (L344-372)에 서류 관리 영역 추가:

```
┌─── 단계 1: 투심위 보고서 제출 ──────────────────────┐
│ [단계 이름] [시점] [오프셋] [예상 시간]              │
│ [사분면] [메모]                                      │
│ ☐ 통지  ☐ 보고  [단계 삭제]                         │
│                                                       │
│ 📄 단계 서류 (2)                                     │
│ ┌───────────────────────────────────────────┐         │
│ │ 투심 보고서 (필수)  [📎 템플릿] [삭제]    │         │
│ │ 투자계약서 (필수)   [📎 템플릿] [삭제]    │         │
│ └───────────────────────────────────────────┘         │
│ [+ 직접 입력] [+ 템플릿에서 선택]                     │
└──────────────────────────────────────────────────────┘
```

### 4-B. 서류 추가 방식 2가지

**1) 직접 입력:** 기존 워크플로 전체 서류 추가와 동일한 인라인 폼
- 서류명 input + 필수 checkbox + 시점 input + 메모 input + 추가 버튼
- `document_template_id = null`

**2) 템플릿에서 선택:** DocumentTemplate 목록에서 검색/선택
- `fetchDocumentTemplates()`로 가져온 목록을 드롭다운 또는 검색 모달로 표시
- 선택 시 `name = template.name`, `document_template_id = template.id`로 자동 설정
- 사용자가 name을 수정할 수 있게 허용 (커스텀 이름 가능)

### 4-C. 주의: TemplateModal은 클라이언트 state 기반

현재 `TemplateModal`은 워크플로 전체를 한 번에 submit하는 구조 (L295-327). 서류도 클라이언트 state에서 관리 후 일괄 전송.

**단계별 서류도 동일 패턴 사용:**

```typescript
// WorkflowStepInput 확장
export interface WorkflowStepInput {
  // ...기존 필드...
  step_documents?: WorkflowStepDocumentInput[]  // 추가
}

// WorkflowTemplateInput 확장
export interface WorkflowTemplateInput {
  // ...기존 필드...
  // steps 내부에 step_documents 포함
}
```

백엔드에서 워크플로 생성/수정 시 `steps[].step_documents[]`도 함께 처리:
- 생성: step 저장 후 step_documents도 추가
- 수정: 기존 step_documents 삭제 후 재생성 (replace 방식)

### 4-D. DocumentTemplate 선택 UI

```typescript
// 간단한 드롭다운 방식
const { data: docTemplates = [] } = useQuery({
  queryKey: ['documentTemplates'],
  queryFn: fetchDocumentTemplates,
})

// 사용자가 "템플릿에서 선택" 버튼 클릭 시:
<select onChange={e => {
  const template = docTemplates.find(t => t.id === Number(e.target.value))
  if (template) {
    addStepDoc(stepIdx, {
      name: template.name,
      document_template_id: template.id,
      required: true,
    })
  }
}}>
  <option value="">템플릿 선택...</option>
  {docTemplates.map(t => (
    <option key={t.id} value={t.id}>{t.category} — {t.name}</option>
  ))}
</select>
```

### 4-E. WorkflowDetail (읽기 모드)에서 단계별 서류 표시

`WorkflowDetail` (L451-629)의 단계 목록(L552-558)에서 각 단계의 `step_documents` 표시:

```tsx
{wf.steps.map((s: WorkflowStep) => (
  <div key={s.id} className="rounded bg-gray-50 p-2">
    <div className="flex items-center gap-2 text-sm">
      <span className="w-6 text-center text-xs text-gray-500">{s.order}</span>
      <span className="flex-1">{s.name}</span>
      <span className="text-xs text-gray-500">{s.timing}</span>
    </div>
    {(s.step_documents?.length ?? 0) > 0 && (
      <div className="ml-8 mt-1 space-y-0.5">
        {s.step_documents!.map(doc => (
          <div key={doc.id} className="flex items-center gap-1 text-xs text-gray-500">
            <span>📄</span>
            <span>{doc.name}</span>
            {doc.document_template_id && <span className="text-blue-500">[템플릿]</span>}
          </div>
        ))}
      </div>
    )}
  </div>
))}
```

---

## Files to create / modify

| # | Type | File | Part | Changes |
|---|------|------|------|---------|
| 1 | **[MODIFY]** | `backend/models/workflow.py` | 1 | `WorkflowStepDocument` 모델 추가 + `WorkflowStep.step_documents` relationship |
| 2 | **[MODIFY]** | `backend/schemas/workflow.py` | 2 | `WorkflowStepDocumentInput`, `WorkflowStepDocumentResponse` 스키마 |
| 3 | **[MODIFY]** | `backend/routers/workflows.py` | 2 | 단계별 서류 CRUD 3개 엔드포인트 + 워크플로 상세 응답에 step_documents 포함 + 워크플로 생성/수정 시 step_documents 처리 |
| 4 | **[MODIFY]** | `frontend/src/lib/api.ts` | 3 | `WorkflowStepDocument` 타입 + API 함수 3개 + `WorkflowStep.step_documents` 필드 |
| 5 | **[MODIFY]** | `frontend/src/pages/WorkflowsPage.tsx` | 4 | TemplateModal 단계 카드에 서류 관리 영역 + DocumentTemplate 선택 드롭다운 + WorkflowDetail 서류 표시 |

---

## Acceptance Criteria

### Part 1: 모델
- [ ] AC-01: `workflow_step_documents` 테이블 생성 (id, workflow_step_id, document_template_id, name, required, timing, notes)
- [ ] AC-02: `WorkflowStep.step_documents` relationship으로 단계 삭제 시 서류 cascade 삭제
- [ ] AC-03: `document_template_id`는 nullable — NULL이면 직접 입력, 값이 있으면 DocumentTemplate 참조

### Part 2: API
- [ ] AC-04: `GET /api/workflow-steps/{step_id}/documents` — 단계별 서류 목록 (template_name 포함)
- [ ] AC-05: `POST /api/workflow-steps/{step_id}/documents` — 직접 입력 또는 template_id 연결
- [ ] AC-06: `DELETE /api/workflow-steps/{step_id}/documents/{doc_id}` — 서류 삭제
- [ ] AC-07: 워크플로 상세(GET /api/workflows/{id}) 응답에 각 step의 step_documents 포함
- [ ] AC-08: 워크플로 생성/수정 시 steps[].step_documents[] 일괄 처리

### Part 3: 프론트엔드 타입/API
- [ ] AC-09: `WorkflowStepDocument` 타입 + `WorkflowStepDocumentInput` 타입 추가
- [ ] AC-10: `listStepDocuments`, `addStepDocument`, `deleteStepDocument` API 함수
- [ ] AC-11: `WorkflowStep` 타입에 `step_documents?` 필드 추가

### Part 4: UI
- [ ] AC-12: TemplateModal 단계 카드에 "📄 단계 서류" 영역 표시
- [ ] AC-13: "직접 입력"으로 서류 추가 가능 (이름 + 필수 + 시점 + 메모)
- [ ] AC-14: "템플릿에서 선택"으로 DocumentTemplate 드롭다운에서 선택하여 추가 가능
- [ ] AC-15: 각 서류 행에 삭제 버튼
- [ ] AC-16: WorkflowDetail(읽기 모드)에서 단계별 서류 표시 (📄 아이콘 + 이름 + [템플릿] 뱃지)
- [ ] AC-17: 인쇄 시 단계별 서류도 체크리스트에 포함

### 공통
- [ ] AC-18: `npm run build` TypeScript 에러 0건
- [ ] AC-19: 기존 워크플로 생성/수정/실행/완료 기능 정상 동작
- [ ] AC-20: 기존 워크플로 전체 서류(WorkflowDocument) 기능 그대로 유지
- [ ] AC-21: console.log/print 디버깅 코드 없음

---

## 구현 주의사항

1. **기존 WorkflowDocument 유지:** `WorkflowDocument`(워크플로 전체 서류)는 절대 삭제하지 않음. `WorkflowStepDocument`는 **별도 계층**으로 추가.
2. **DocumentTemplate 테이블명 확인:** `document_templates` 테이블이 실제로 존재하는지 확인. 모델 파일에서 `__tablename__` 확인.
3. **TemplateModal state 관리:** 현재 서류는 클라이언트 state(`form.documents`)로 관리. 단계별 서류도 `form.steps[i].step_documents`로 동일 패턴 사용하여 일괄 submit.
4. **워크플로 수정 시 step_documents 동기화:** 백엔드에서 워크플로 수정 시 기존 step의 step_documents를 전부 삭제 후 재생성하는 replace 방식 권장 (기존 steps 처리 방식과 동일).
5. **DocumentTemplate 목록 캐싱:** `fetchDocumentTemplates()` 쿼리는 TemplateModal에서 한 번만 호출. `useQuery` 캐싱으로 중복 요청 방지.
6. **미래 확장:** 차후 DocumentTemplate에 변수(variables)와 조합별 custom_data를 넣어 자동 생성하는 기능을 추가할 때, `WorkflowStepDocument.document_template_id`가 핵심 연결고리가 됨.
7. **인쇄 기능 (printWorkflowInstanceChecklist):** L106-153의 인쇄 함수도 단계별 서류를 포함하도록 수정. 각 단계 행 하위에 해당 단계의 서류 목록 출력.
