# Phase 42_2: 워크플로 템플릿 단계 서류에 통합 파일 첨부 적용

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> ⚠️ **비식별화 원칙:** 실존 정보 사용 금지.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P1  
**의존성:** Phase 42_1 완료 (`TaskAttachmentSection` 컴포넌트 존재)  
**핵심 원칙:**
1. **컴포넌트 통합** — 42_1의 파일 첨부 UX를 워크플로 템플릿 편집에도 동일하게 적용
2. **기존 인라인 구현 교체** — TemplateModal의 수동 `input[type=file]` + 상태 관리를 공용 컴포넌트로 교체
3. **유기적 연계** — 템플릿에 첨부한 파일 → 인스턴스 생성 시 StepInstanceDocument에 자동 복사

---

## Part 0. 전수조사 (필수)

- [ ] `components/common/TaskAttachmentSection.tsx` — Phase 42_1에서 만든 파일 첨부 컴포넌트 인터페이스 확인
- [ ] `pages/WorkflowsPage.tsx` — `TemplateModal` 안 현재 단계 서류 첨부 구현 확인:
  - 라인 ~74~88: `StepDocumentDraft` 타입 (`attachment_ids: number[]`)
  - 라인 ~521~528: `stepDocDrafts` 상태 (`attachmentIds: number[]` 포함)
  - 라인 ~529~553: `templateAttachmentIds` 계산 + `templateAttachmentById` 맵
  - 라인 ~555~563: `handleTemplateAttachmentDownload` 함수
  - 라인 ~746~760: `uploadTemplateStepDraftAttachment` / `removeTemplateStepDraftAttachment` 함수
  - 라인 ~898~914: 기존 서류 첨부 파일 리스트 렌더링
  - 라인 ~971~997: 드래프트 첨부 파일 리스트 렌더링
  - 라인 ~1019~1035: `input[type=file]` 파일 업로드 버튼
- [ ] `lib/api.ts` — `uploadAttachment`, `fetchAttachments`, `downloadAttachment`, `removeAttachment` 함수 확인
- [ ] `models/workflow.py` — `WorkflowStepDocument.attachment_ids_raw` 확인
- [ ] `routers/workflows.py` — 워크플로 템플릿 생성/수정 API에서 `attachment_ids` 처리 확인
- [ ] `routers/workflows.py` — 인스턴스 생성 시 StepDocument → StepInstanceDocument 복사 로직 확인 (attachment_ids 복사 여부)

---

## Part 1. 공용 파일 첨부 컴포넌트 일반화

### 1-1. 현재 상황

Phase 42_1의 `TaskAttachmentSection`은 **Task 전용**으로 설계됨:
- `taskId`를 받아서 `entity_type="task"` 기반 동작
- 워크플로 서류 연동 로직 내장

워크플로 **템플릿** 편집에서는:
- `entity_type`이 `"workflow_step_doc"` 또는 유사해야 함
- Task 연동 로직은 불필요
- 핵심 UX(파일 선택 → 업로드 → 목록 표시 → 다운로드 → 삭제)만 필요

### 1-2. 해결 방안: 범용 FileAttachmentPanel 추출

#### `components/common/FileAttachmentPanel.tsx` [NEW]

`TaskAttachmentSection`에서 **파일 업로드/목록/다운로드/삭제** UI를 추출한 범용 컴포넌트:

```typescript
interface FileAttachmentPanelProps {
  /** 현재 첨부된 attachment ID 목록 */
  attachmentIds: number[]
  /** 새 파일 업로드 시 콜백 — 부모가 상태 관리 */
  onUpload: (file: File) => Promise<number>   // 반환: attachment.id
  /** 첨부 삭제 시 콜백 */
  onRemove: (attachmentId: number) => Promise<void>
  /** 비활성화 (읽기 전용) */
  disabled?: boolean
  /** 컴팩트 모드 (텍스트 축소) */
  compact?: boolean
  /** 라벨 텍스트 */
  label?: string  // 기본값: "📎 첨부 파일"
}
```

**동작:**
1. `attachmentIds`로 `GET /api/attachments?ids=1,2,3` 조회하여 파일 메타 표시
2. [파일 추가] → `input[type=file]` → `onUpload(file)` 콜백 호출 → 부모가 `attachmentIds` 상태 업데이트
3. [다운로드] → `GET /api/attachments/{id}` 다운로드
4. [삭제] → `onRemove(id)` 콜백 호출 → 부모가 `attachmentIds` 상태 업데이트

**UI:**
```
┌─ 📎 첨부 파일 ─────────────────────────────────────┐
│ 📄 투자계약서_양식.docx  (1.2 MB)  [↓] [✕]         │
│ 📄 사업계획서_양식.pdf   (3.5 MB)  [↓] [✕]         │
│ [+ 파일 추가]                                       │
└─────────────────────────────────────────────────────┘
```

### 1-3. TaskAttachmentSection 리팩토링

#### `components/common/TaskAttachmentSection.tsx` [MODIFY]

내부에서 `FileAttachmentPanel`을 사용하도록 리팩토링:
- 파일 업로드/목록/삭제 UI는 `FileAttachmentPanel`에 위임
- Task 전용 로직(워크플로 서류 매칭, `link-attachment` API 등)만 유지
- `onUpload` 콜백에서 `POST /api/attachments` + `POST /api/tasks/{id}/link-attachment` 수행

---

## Part 2. TemplateModal에 FileAttachmentPanel 적용

### 2-1. 기존 인라인 코드 제거 대상

`pages/WorkflowsPage.tsx`의 `TemplateModal` 안에서 아래 인라인 구현을 `FileAttachmentPanel`로 교체:

| 기존 코드 (제거/교체) | 역할 | 대체 |
|----------------------|------|------|
| `templateAttachmentIds` 계산 (529~543) | 첨부 ID 수집 | `FileAttachmentPanel` 내부 처리 |
| `templateAttachmentById` 맵 (550~553) | 첨부 메타 캐시 | `FileAttachmentPanel` 내부 처리 |
| `handleTemplateAttachmentDownload` (555~563) | 다운로드 | `FileAttachmentPanel` 내부 처리 |
| `uploadTemplateStepDraftAttachment` (746~752) | 업로드 | `FileAttachmentPanel.onUpload` |
| `removeTemplateStepDraftAttachment` (754~760) | 삭제 | `FileAttachmentPanel.onRemove` |
| 기존 서류 attachment 렌더링 (898~914) | 첨부 목록 | `FileAttachmentPanel` |
| 드래프트 attachment 렌더링 (971~997) | 드래프트 첨부 | `FileAttachmentPanel` |
| `input[type=file]` 버튼 (1019~1035) | 파일 선택 | `FileAttachmentPanel` |

### 2-2. 교체 구현

#### `pages/WorkflowsPage.tsx` — `TemplateModal` [MODIFY]

**기존 서류에 첨부 파일 표시 (교체):**

```tsx
// 기존: 라인 898~914의 수동 attachment 렌더링
// 교체:
{(doc.attachment_ids?.length ?? 0) > 0 && (
  <FileAttachmentPanel
    attachmentIds={doc.attachment_ids ?? []}
    onUpload={async (file) => {
      // 기존 서류의 attachment 추가는 별도 처리 필요 (서류 수정)
      const uploaded = await uploadAttachment(file)
      // form 상태에서 해당 서류의 attachment_ids 업데이트
      updateStepDocumentAttachments(stepIdx, docIdx, [...(doc.attachment_ids ?? []), uploaded.id])
      return uploaded.id
    }}
    onRemove={async (attachmentId) => {
      await removeAttachment(attachmentId)
      updateStepDocumentAttachments(stepIdx, docIdx, (doc.attachment_ids ?? []).filter(id => id !== attachmentId))
    }}
    compact
  />
)}
```

**드래프트 서류 첨부 (교체):**

```tsx
// 기존: 라인 971~1035의 드래프트 첨부 + input[type=file]
// 교체:
<FileAttachmentPanel
  attachmentIds={ensureStepDocDraft(idx).attachmentIds ?? []}
  onUpload={async (file) => {
    const uploaded = await uploadAttachment(file)
    setStepDocDraft(idx, {
      attachmentIds: [...new Set([...(ensureStepDocDraft(idx).attachmentIds ?? []), uploaded.id])],
    })
    return uploaded.id
  }}
  onRemove={async (attachmentId) => {
    await removeAttachment(attachmentId)
    setStepDocDraft(idx, {
      attachmentIds: (ensureStepDocDraft(idx).attachmentIds ?? []).filter(id => id !== attachmentId),
    })
  }}
  compact
  label="서류 파일"
/>
```

### 2-3. 기존 서류 첨부 수정 헬퍼 추가

```tsx
// 이미 추가된 서류의 attachment_ids를 수정하는 헬퍼
const updateStepDocumentAttachments = (stepIdx: number, docIdx: number, newIds: number[]) => {
  setForm((prev) => ({
    ...prev,
    steps: prev.steps.map((step, sIdx) => {
      if (sIdx !== stepIdx) return step
      return {
        ...step,
        step_documents: (step.step_documents ?? []).map((doc, dIdx) => {
          if (dIdx !== docIdx) return doc
          return { ...doc, attachment_ids: newIds }
        }),
      }
    }),
  }))
}
```

---

## Part 3. 유기적 연계 확인

### 3-1. 템플릿 → 인스턴스 생성 시 첨부 복사

#### `routers/workflows.py` [확인 및 보강]

워크플로 인스턴스 생성 API에서 `WorkflowStepDocument` → `WorkflowStepInstanceDocument` 복사 시:

```python
# 확인 포인트:
# StepDocument.attachment_ids → StepInstanceDocument.attachment_ids 복사 여부
# 복사되고 있는지 확인하고, 안 되고 있으면 추가할 것:
instance_doc = WorkflowStepInstanceDocument(
    step_instance_id=step_instance.id,
    workflow_step_document_id=step_doc.id,
    name=step_doc.name,
    required=step_doc.required,
    timing=step_doc.timing,
    notes=step_doc.notes,
    checked=False,
    attachment_ids_raw=step_doc.attachment_ids_raw,  # ← 서식 파일 복사
)
```

> **핵심:** 템플릿에 첨부한 파일(예: 양식 서류 템플릿)은 인스턴스 생성 시 자동으로 연결되어야 한다. 이후 실무자가 42_1의 Task 첨부 기능으로 실제 작성된 서류를 추가 첨부하면, 양식 + 실제본이 함께 표시됨.

### 3-2. 전체 연결 흐름

```
관리자: 템플릿 편집 → 단계 서류에 양식 파일 첨부 (FileAttachmentPanel)
                    → WorkflowStepDocument.attachment_ids에 저장
    ↓ (인스턴스 생성 시)
StepInstanceDocument.attachment_ids에 양식 파일 자동 복사
    ↓
실무자: 업무보드에서 Task 열기 → 실제 서류 첨부 (TaskAttachmentSection)
    → StepInstanceDocument.attachment_ids에 추가
    → checked=True 자동 설정
    ↓
CompleteModal: 필수 서류 모두 checked → 완료 가능
```

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [NEW] | `frontend/src/components/common/FileAttachmentPanel.tsx` | 범용 파일 첨부 UI 컴포넌트 (업로드/목록/다운로드/삭제) |
| 2 | [MODIFY] | `frontend/src/components/common/TaskAttachmentSection.tsx` | FileAttachmentPanel 사용하도록 리팩토링 |
| 3 | [MODIFY] | `frontend/src/pages/WorkflowsPage.tsx` | TemplateModal 인라인 첨부 → FileAttachmentPanel 교체 + updateStepDocumentAttachments 헬퍼 |
| 4 | [MODIFY] | `backend/routers/workflows.py` | 인스턴스 생성 시 attachment_ids 복사 확인/보강 |

---

## Acceptance Criteria

- [ ] **AC-01:** TemplateModal 단계 서류 추가 시 FileAttachmentPanel을 통한 파일 업로드가 동작한다.
- [ ] **AC-02:** TemplateModal 기존 서류의 첨부 파일이 FileAttachmentPanel로 표시된다.
- [ ] **AC-03:** 첨부 파일 다운로드/삭제가 정상 동작한다.
- [ ] **AC-04:** 42_1의 TaskAttachmentSection과 동일한 UX를 제공한다 (같은 디자인, 같은 동작).
- [ ] **AC-05:** 템플릿 저장 시 attachment_ids가 서버에 정상 저장된다.
- [ ] **AC-06:** 워크플로 인스턴스 생성 시 템플릿 서류의 attachment_ids가 StepInstanceDocument에 복사된다.
- [ ] **AC-07:** 기존 TemplateModal의 서류 추가/삭제/수정 기능 유지.
- [ ] **AC-08:** Phase 31~42_1의 모든 기능 유지.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. `models/attachment.py` — 변경 금지
3. `routers/attachments.py` — 기존 API 시그니처 변경 금지
4. WorkflowsPage.tsx에서 **TemplateModal 외 영역** — 인스턴스 뷰, 체크리스트, 정기 스케줄 등은 건드리지 말 것
5. Phase 31~42_1의 기존 구현 — 보강만, 삭제/재구성 금지
