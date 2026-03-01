# Phase 42_1: 업무 서류 첨부 — 업무보드 추가/수정 시 파일 연동

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> ⚠️ **비식별화 원칙:** 실존 정보 사용 금지.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P0  
**의존성:** Phase 42 완료 (대시보드/업무보드 개선 이후), 또는 Phase 36 이후 독립 적용 가능  
**핵심 원칙:**
1. **기존 Attachment 인프라 100% 활용** — 새 파일 업로드 시스템 만들지 말 것
2. **유기적 연결** — Task 첨부 파일 ↔ 워크플로 서류 ↔ CompleteModal 서류 확인이 하나의 흐름
3. **휴먼 에러 방지** — 워크플로 필수 서류가 Task 첨부로도 해결 가능한 구조

---

## Part 0. 전수조사 (필수)

- [ ] `models/attachment.py` — Attachment 모델 확인 (entity_type, entity_id 다형 연결)
- [ ] `routers/attachments.py` — 업로드 API 확인 (`POST /api/attachments?entity_type=&entity_id=`, GET 목록, GET 다운로드, PATCH link, DELETE)
- [ ] `schemas/attachment.py` — AttachmentResponse, AttachmentLinkUpdate 스키마 확인
- [ ] `models/task.py` — Task 모델 확인 (현재 attachment 필드 없음, workflow_instance_id 있음)
- [ ] `models/workflow_instance.py` — WorkflowStepInstance (task_id), WorkflowStepInstanceDocument (attachment_ids, checked, required) 확인
- [ ] `components/EditTaskModal.tsx` — 기존 업무 수정 모달 (283줄, TaskCreate 타입 기반)
- [ ] `components/dashboard/modals/QuickTaskAddModal.tsx` — 업무 추가 모달 (167줄)
- [ ] `components/CompleteModal.tsx` — 완료 모달 (199줄, fetchTaskCompletionCheck → missing_documents)
- [ ] `routers/tasks.py` — Task CRUD API 시그니처 확인
- [ ] `routers/task_completion.py` — 완료 전 체크 API 확인
- [ ] `lib/api.ts` — Task, TaskCreate, AttachmentResponse 타입 + API 함수 확인

---

## Part 1. 기존 인프라 분석 (Codex가 반드시 이해할 것)

### 1-1. Attachment 모델 (이미 존재)

```python
# models/attachment.py — 변경 불필요
class Attachment(Base):
    __tablename__ = "attachments"
    id = Column(Integer, primary_key=True)
    filename = Column(String)           # UUID.ext 저장 파일명
    original_filename = Column(String)  # 원본 파일명
    file_path = Column(String)          # 디스크 경로
    file_size = Column(Integer)
    mime_type = Column(String)
    entity_type = Column(String)        # "task" | "workflow_step_doc" | ...
    entity_id = Column(Integer)         # 연결 대상 ID
    created_at = Column(DateTime)
```

### 1-2. Attachment API (이미 존재)

| Method | Endpoint | 설명 | 사용 여부 |
|--------|----------|------|----------|
| POST | `/api/attachments?entity_type=task&entity_id=123` | 파일 업로드 | ✅ 그대로 사용 |
| GET | `/api/attachments?ids=1,2,3` | ID 목록으로 첨부파일 조회 | ✅ 그대로 사용 |
| GET | `/api/attachments/{id}` | 파일 다운로드 | ✅ 그대로 사용 |
| PATCH | `/api/attachments/{id}/link` | entity_type/entity_id 변경 | ✅ 업무 저장 후 연결에 사용 |
| DELETE | `/api/attachments/{id}` | 파일 삭제 | ✅ 그대로 사용 |

### 1-3. WorkflowStepInstanceDocument (이미 존재)

```python
# 워크플로 서류 인스턴스
class WorkflowStepInstanceDocument(Base):
    step_instance_id = ...
    name = Column(String)
    required = Column(Boolean, default=True)
    checked = Column(Boolean, default=False)
    attachment_ids_raw = Column(Text, default="[]")  # JSON: [1, 2, 3]
```

**핵심:** 워크플로 업무(Task.workflow_instance_id ≠ null)의 경우, 해당 Task에 첨부한 파일은 WorkflowStepInstanceDocument의 attachment_ids에도 자동 반영되어야 한다.

---

## Part 2. Task 첨부 파일 API

### 2-1. Task별 첨부 파일 조회

#### `routers/tasks.py` [MODIFY — 확장]

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/tasks/{id}/attachments` | 해당 업무의 첨부 파일 목록 |

```python
@router.get("/api/tasks/{task_id}/attachments")
def get_task_attachments(task_id: int, db: Session = Depends(get_db)):
    """Task에 연결된 Attachment 목록 조회"""
    # Attachment.entity_type == "task" AND Attachment.entity_id == task_id
    attachments = db.query(Attachment).filter(
        Attachment.entity_type == "task",
        Attachment.entity_id == task_id,
    ).order_by(Attachment.id.desc()).all()
    return [_attachment_to_response(a) for a in attachments]
```

### 2-2. Task 첨부 파일 업로드 후 워크플로 서류 자동 연동

#### `routers/tasks.py` [MODIFY — 확장]

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/tasks/{id}/link-attachment` | 업로드된 Attachment를 Task에 연결 + 워크플로 서류 자동 연동 |

```python
@router.post("/api/tasks/{task_id}/link-attachment")
def link_attachment_to_task(task_id: int, body: dict, db: Session = Depends(get_db)):
    """
    body: { "attachment_id": 123, "workflow_doc_id": null | 456 }

    1. Attachment의 entity_type="task", entity_id=task_id로 링크 업데이트
    2. Task에 workflow_instance_id가 있으면:
       a. 해당 Task의 WorkflowStepInstance 조회 (task_id 매칭)
       b. 해당 StepInstance의 WorkflowStepInstanceDocument 중
          workflow_doc_id가 지정된 경우 해당 문서에,
          미지정 시 첫 번째 미첨부 required 문서에 attachment_id 추가
       c. attachment_ids 업데이트 + checked=True 자동 설정
    3. 응답: { "attachment": {...}, "linked_workflow_doc": null | {...} }
    """
    pass
```

> **유기적 연결 핵심:** 업무에서 파일을 첨부하면, 해당 업무가 워크플로의 일부인 경우 워크플로 서류에도 자동 연결. CompleteModal에서 "필수 서류 미첨부" 알림이 자동으로 해소됨.

### 2-3. Task 첨부 파일 해제

| Method | Endpoint | 설명 |
|--------|----------|------|
| DELETE | `/api/tasks/{id}/unlink-attachment/{attachment_id}` | Task에서 첨부 해제 (워크플로 서류 연동 해제 + Attachment 삭제) |

```python
@router.delete("/api/tasks/{task_id}/unlink-attachment/{attachment_id}")
def unlink_attachment_from_task(task_id: int, attachment_id: int, db: Session = Depends(get_db)):
    """
    1. 워크플로 서류에서 attachment_id 제거 (있으면)
    2. 해당 워크플로 서류가 더 이상 attachment가 없으면 checked=False로 복원
    3. Attachment 레코드 삭제 + 디스크 파일 삭제
    """
    pass
```

---

## Part 3. 프론트엔드 — 공용 파일 첨부 컴포넌트

### 3-1. 파일 첨부 컴포넌트

#### `components/common/TaskAttachmentSection.tsx` [NEW]

범용 파일 첨부 섹션. EditTaskModal과 QuickTaskAddModal 양쪽에서 재사용:

```
┌─ 📎 첨부 서류 ──────────────────────────────────────────────┐
│                                                              │
│  [+ 파일 추가]                                               │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 📄 투자계약서_OO기업.pdf   (2.3 MB)  [다운로드] [삭제 ✕] │ │
│  │    ↳ 🔗 워크플로 연결: "투자계약서" (자동)               │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 📄 사업계획서_v3.docx     (1.1 MB)  [다운로드] [삭제 ✕] │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  [워크플로 필수 서류 상태]   ← 해당 Task가 워크플로 업무일 때만 표시│
│  ✅ 투자계약서 — 첨부됨                                      │
│  ⬜ 주주명부 — 미첨부 (필수)                                  │
│  ⬜ 사업자등록증 — 미첨부 (필수)                              │
└──────────────────────────────────────────────────────────────┘
```

**Props:**
```typescript
interface TaskAttachmentSectionProps {
  taskId: number | null            // null이면 신규 업무 (임시 업로드)
  workflowInstanceId?: number | null
  workflowStepOrder?: number | null
  onAttachmentsChange?: (count: number) => void  // 부모에 첨부 수 알림
}
```

**동작:**
1. `taskId`가 있으면: `GET /api/tasks/{id}/attachments`로 기존 첨부 파일 로드
2. [파일 추가] 클릭:
   - 파일 선택 다이얼로그(input type=file) 열기 — 다중 선택 가능
   - `POST /api/attachments?entity_type=task&entity_id={taskId}`로 업로드
   - taskId가 null(신규 업무)이면: `entity_type=task_draft`, `entity_id=0`으로 임시 업로드 → 업무 저장 후 link 업데이트
   - 업로드 성공 시: `POST /api/tasks/{id}/link-attachment`로 워크플로 서류 자동 연동
3. 워크플로 업무인 경우:
   - WorkflowStepInstance의 step_documents 조회하여 필수 서류 상태 표시
   - 파일명 기반 자동 매칭 시도 (선택적): 첨부 파일명에 서류명이 포함되면 해당 서류에 자동 연결
   - 수동 매칭도 가능: [연결할 서류 선택 ▾] 드롭다운
4. [삭제] 클릭: `DELETE /api/tasks/{id}/unlink-attachment/{attachment_id}`

### 3-2. 신규 업무 시 임시 첨부 처리

신규 업무(taskId=null)에서 파일을 먼저 첨부하는 경우의 플로우:

```
1. 사용자가 업무 추가 모달에서 내용 작성 중 파일 추가
2. POST /api/attachments (entity_type="task_draft", entity_id=0) → Attachment 생성
3. 프론트에서 임시 attachment_id 목록 보관 (useState)
4. 업무 저장(POST /api/tasks) 후 task.id 획득
5. 임시 attachment_id 목록을 순회하며:
   PATCH /api/attachments/{id}/link { entity_type: "task", entity_id: task.id }
6. 워크플로 업무인 경우 추가로:
   POST /api/tasks/{task.id}/link-attachment { attachment_id }
```

---

## Part 4. 기존 모달에 첨부 섹션 통합

### 4-1. 업무 수정 모달

#### `components/EditTaskModal.tsx` [MODIFY — 확장]

기존 폼 필드들(제목, 마감일, 카테고리, 조합, 메모 등) 하단에 `TaskAttachmentSection` 추가:

```tsx
// 기존 EditTaskModal 안, 메모 textarea 아래에 추가:
<TaskAttachmentSection
  taskId={task.id}
  workflowInstanceId={task.workflow_instance_id}
  workflowStepOrder={task.workflow_step_order}
/>
```

> **기존 onSave 시그니처 변경 없음.** 첨부 파일은 개별 API로 처리되므로 TaskCreate 타입 변경 불필요.

### 4-2. 업무 추가 모달

#### `components/dashboard/modals/QuickTaskAddModal.tsx` [MODIFY — 확장]

기존 폼 하단에 간소화된 파일 첨부 추가:

```tsx
// 간소화 버전: 워크플로 서류 매칭 없이 파일만 첨부 가능
<TaskAttachmentSection
  taskId={null}         // 신규이므로 null → 저장 후 link
  onAttachmentsChange={(count) => setDraftAttachmentCount(count)}
/>
```

저장 시:
```tsx
const handleCreate = async (task: TaskCreate) => {
  const newTask = await createTask(task)  // POST /api/tasks → task.id 반환
  // 임시 첨부 파일들을 신규 task.id에 link
  for (const attachId of draftAttachmentIds) {
    await linkAttachmentToEntity(attachId, "task", newTask.id)
  }
}
```

> **주의:** `createTask` API가 생성된 Task 객체(id 포함)를 반환해야 한다. 현재 반환 구조를 확인하고, id가 반환되지 않으면 수정할 것.

### 4-3. 업무보드 칸반에서 첨부 서류 배지

#### `pages/TaskBoardPage.tsx` [MODIFY — 확장]

TaskItem 컴포넌트(칸반 카드)에 첨부 파일 개수 배지 표시:

```
┌─────────────────────────────────────────────────────┐
│ VICS 월보고 1308 작성                                │
│ 📅 D-1  📂 LP보고  🏢 OO조합                        │
│ 📎 2  ← 첨부 서류 수                                 │
│                                    [완료] [삭제]     │
└─────────────────────────────────────────────────────┘
```

**구현:**
- Task 조회 API 응답에 `attachment_count` 필드 추가 (서버에서 Attachment.entity_type="task" count)
- 또는 프론트에서 별도 조회 (비효율 → 서버 응답 권장)

#### `routers/tasks.py` [MODIFY — 확장]

Task 목록/상세 API 응답에 `attachment_count` 필드 추가:

```python
# Task 응답에 첨부 파일 수 포함
attachment_count = db.query(func.count(Attachment.id)).filter(
    Attachment.entity_type == "task",
    Attachment.entity_id == task.id,
).scalar()
```

### 4-4. 업무 상세 모달 (TaskDetailModal)

#### `components/dashboard/modals/TaskDetailModal.tsx` [MODIFY — 확장]

업무 상세 보기 모달(읽기 전용 뷰)에도 첨부 파일 목록 표시:
- 파일명 + 크기 + 다운로드 링크

---

## Part 5. 유기적 연계 — 전체 플로우

### 5-1. 일반 업무 플로우

```
업무 추가 → 파일 첨부 → 업무 저장 → Attachment entity_type="task" 연결
    ↓
업무 수정 → 추가 파일 첨부/삭제 → 즉시 반영
    ↓
업무 완료 → CompleteModal에서 첨부 서류 확인 가능
```

### 5-2. 워크플로 업무 플로우 (유기적 연결 핵심)

```
워크플로 인스턴스 생성 → Task 자동 생성 → WorkflowStepInstanceDocument 생성
    ↓
업무보드에서 해당 Task 선택 → 수정 모달 열기
    ↓
파일 첨부 → POST /api/attachments → POST /api/tasks/{id}/link-attachment
    ↓ (자동)
WorkflowStepInstanceDocument.attachment_ids 업데이트 + checked=True
    ↓ (자동)
CompleteModal에서 "필수 서류 미첨부" 경고 해소 → can_complete=true
    ↓
업무 완료 가능
```

### 5-3. Phase 42 CompleteModal과의 연계

Phase 42에서 CompleteModal이 서류 확인/첨부 인라인 UI를 갖게 되면:
- EditTaskModal에서 미리 첨부한 파일이 CompleteModal에서도 보임
- CompleteModal에서 추가 첨부도 가능 (같은 TaskAttachmentSection 재사용)
- **중복 업로드 방지**: 이미 첨부된 파일은 연결된 상태로 표시

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [NEW] | `frontend/src/components/common/TaskAttachmentSection.tsx` | 범용 파일 첨부 컴포넌트 (업로드/삭제/WF 서류 연동) |
| 2 | [MODIFY] | `frontend/src/components/EditTaskModal.tsx` | 하단에 TaskAttachmentSection 추가 |
| 3 | [MODIFY] | `frontend/src/components/dashboard/modals/QuickTaskAddModal.tsx` | 하단에 간소화 첨부 추가 |
| 4 | [MODIFY] | `frontend/src/pages/TaskBoardPage.tsx` | TaskItem에 📎 배지 표시 |
| 5 | [MODIFY] | `frontend/src/components/dashboard/modals/TaskDetailModal.tsx` | 첨부 파일 목록 표시 |
| 6 | [MODIFY] | `backend/routers/tasks.py` | GET attachments + POST link-attachment + DELETE unlink + attachment_count 응답 |
| 7 | [MODIFY] | `frontend/src/lib/api.ts` | 첨부 관련 API 함수/타입 추가 |
| 8 | [MODIFY] | `frontend/src/components/CompleteModal.tsx` | TaskAttachmentSection 제한적 표시 (Phase 42 연계) |

---

## Acceptance Criteria

### 핵심
- [ ] **AC-01:** 업무 수정 모달(EditTaskModal)에서 파일을 첨부할 수 있다.
- [ ] **AC-02:** 업무 추가 모달(QuickTaskAddModal)에서 파일을 첨부할 수 있다 (신규 업무 저장 후 자동 link).
- [ ] **AC-03:** 첨부된 파일을 다운로드할 수 있다.
- [ ] **AC-04:** 첨부 파일을 삭제할 수 있다.
- [ ] **AC-05:** 업무보드 칸반 카드에 📎 N 형태로 첨부 파일 수가 표시된다.

### 워크플로 연계 (유기적 연결)
- [ ] **AC-06:** 워크플로 업무에 파일을 첨부하면 WorkflowStepInstanceDocument의 attachment_ids에 자동 추가된다.
- [ ] **AC-07:** 워크플로 업무에 파일을 첨부하면 해당 서류의 checked가 자동으로 True가 된다.
- [ ] **AC-08:** 워크플로 업무의 서류 첨부 섹션에서 필수 서류 상태(✅/⬜)가 표시된다.
- [ ] **AC-09:** 업무에서 첨부 파일을 삭제하면 WorkflowStepInstanceDocument에서도 해제되고 checked=False로 복원된다.
- [ ] **AC-10:** CompleteModal에서 "필수 서류 미첨부" 경고가 위 과정으로 해소된다 (can_complete=true).

### 공통
- [ ] **AC-11:** 기존 Attachment API(POST/GET/DELETE)의 시그니처 및 동작 유지.
- [ ] **AC-12:** Phase 31~42의 모든 기능 유지.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. `models/attachment.py` — 필드 추가/수정 금지 (entity_type/entity_id 그대로 활용)
3. `routers/attachments.py` — 기존 API 시그니처 변경 금지 (그대로 활용)
4. Task CRUD API 기존 시그니처 — 유지 (확장만)
5. WorkflowStepInstanceDocument 모델 — 기존 필드(checked, attachment_ids_raw) 그대로 활용
6. EditTaskModal의 기존 `onSave(id, data: Partial<TaskCreate>)` 시그니처 — 변경 금지 (첨부는 별도 API)
7. Phase 31~42의 기존 구현 — 보강만, 삭제/재구성 금지
