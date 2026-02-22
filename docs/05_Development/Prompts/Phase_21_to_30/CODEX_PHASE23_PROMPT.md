# Phase 23: 출자 납입 자동연계 · 파이프라인 정렬 · 업무보드 정리 · 템플릿 서류 관리

> **Priority:** P0

---

## Table of Contents

1. [Part 1 — 출자요청 워크플로 납입확인 → LP 자동연계 검증/보강](#part-1)
2. [Part 2 — 파이프라인 가운데 정렬](#part-2)
3. [Part 3 — 업무보드 연도·월·대상 필터 삭제](#part-3)
4. [Part 4 — 워크플로 템플릿 서류 추가/삭제](#part-4)
5. [Files to create / modify](#files-to-create--modify)
6. [Acceptance Criteria](#acceptance-criteria)

---

## 현재 상태 분석

### 1) 출자 납입 자동연계 (이미 부분 구현)

**백엔드 (`routers/workflows.py`)**:

- `complete_step` (L371–456): 워크플로 단계 완료 시 실행
- L423–427: `completed_wf_step.name`에 **"납입 확인"** 문자열 포함 시 자동 트리거:
  ```python
  if "납입 확인" in (completed_wf_step.name or ""):
      capital_call_id = _extract_capital_call_id(instance.memo)
      if capital_call_id is not None:
          _mark_capital_call_items_paid(db, capital_call_id)
  ```
- `_extract_capital_call_id` (L39–48): `instance.memo`에서 `CAPITAL_CALL_ID_PATTERN` 정규식으로 capital_call_id 추출
- `_mark_capital_call_items_paid` (L51–71): **핵심 로직**
  - `CapitalCallItem.paid = 1`, `paid_date = today()`
  - `LP.paid_in += item.amount` ← LP 납입총액 누적

**현재 문제/누락 포인트:**

1. 출자요청 위저드(`CapitalCallWizard`)가 워크플로 인스턴스 생성 시 `memo`에 `capital_call_id`를 올바르게 기록하는지 검증 필요
2. `_mark_capital_call_items_paid` 실행 후 **프론트엔드 쿼리 캐시 무효화**가 충분한지:
   - `fund` 쿼리 → LP.paid_in 갱신 반영
   - `capitalCallItems` 쿼리 → paid 상태 갱신
   - `fundPerformance` 쿼리 → 납입총액 반영
   - `dashboard` 쿼리 → 대시보드 수치 반영
3. 조합개요(FundDetailPage)의 **납입총액 표시**가 `LP.paid_in` 합산 기준인지, Fund 모델의 별도 필드인지 확인
4. 성과지표(FundOperationsPage) `performance.paid_in_total`과 LP.paid_in 합산이 일치하는지 확인
5. LP별 테이블에 표시되는 납입여부 체크표시가 CapitalCallItem.paid 변경 후 자동으로 UI에 반영되는지

### 2) 파이프라인 정렬

**현재 코드:**
- `TaskPipelineView.tsx` L548: `className="relative mx-auto flex w-full max-w-[1400px] gap-3 px-2"`
  → `mx-auto` + `max-w-[1400px]` 이미 적용됨
- **그런데** 상위 컨테이너 `DashboardPage.tsx`의 `page-container` = `max-w-7xl` (1280px)
  → 1280px 안에서 1400px max-w가 의미 없음. 파이프라인 전체가 1280px로 제한되면서 좌측 사이드바 때문에 오른쪽으로 치우쳐 보일 수 있음

### 3) 업무보드 필터

**삭제 대상 (`TaskBoardPage.tsx`):**
- L900–928: **연도+월 필터** — `completedYear`, `completedMonth` state와 select (완료 상태에서만 표시)
- L930–951: **대상 필터** — `fundFilter` state와 select (상시 표시)
- 관련 state: `completedYear`, `completedMonth`, `completedYearOptions`, `fundFilter`

**주의:** 사용자는 "연도, 월, 대상"을 삭제 요청. 대상(조합/고유계정) 필터까지 삭제할지 확인이 필요하나, 사용자가 "필요없는 정보"로 명시했으므로 3개 모두 삭제.

### 4) 워크플로 템플릿 서류

**현재 상태:**
- **모델 존재:** `WorkflowDocument` (name, required, timing 필드)
- **seed 데이터:** `seed_workflows.py`에서 각 워크플로에 다수 서류 등록
- **백엔드 API:** `routers/workflows.py`에 **서류 CRUD 엔드포인트 없음**
- **프론트엔드:** `WorkflowsPage.tsx`에 **서류 관리 UI 없음**
- 현재는 seed 시에만 서류가 생성되며, 사용자가 동적으로 추가/삭제 불가

---

## Part 1 — 출자요청 워크플로 납입확인 → LP 자동연계 검증/보강

### 1-A. 검증 사항 (전체 흐름)

```
출자요청 위저드 실행
  → CapitalCall 생성 + CapitalCallItem(LP별) 생성
  → WorkflowInstance 생성 (memo에 capital_call_id 포함)
  → 워크플로 단계 진행
  → "납입확인 및 입금대사" 단계 Complete
  → _mark_capital_call_items_paid() 자동 호출
  → CapitalCallItem.paid = 1, paid_date = today
  → LP.paid_in += item.amount
  → 프론트엔드 쿼리 무효화
  → 조합 상세의 LP 테이블에 납입 체크 표시
  → 조합 개요의 납입총액 반영
  → 성과지표의 paid_in_total 반영
```

### 1-B. 코드 보강 포인트

1. **`complete_step` 후 쿼리 무효화 확인:** 프론트엔드에서 `completeStepMut.onSuccess` 시 아래 쿼리 전부 무효화:
   ```
   workflowInstances, fund, funds, capitalCalls, capitalCallItems,
   fundPerformance, dashboard
   ```

2. **"납입확인 및 입금대사" 키워드 매칭:** 현재 `"납입 확인" in step_name` 사용. seed_data.py에 등록된 출자요청 워크플로의 4번째 단계 이름이 정확히 "납입확인 및 입금대사"인지 확인하고, 매칭 로직이 커버하는지 검증. 만약 "납입확인"(띄어쓰기 없음) 형태라면 `"납입 확인"` 매칭이 실패할 수 있음.

   **수정:** 키워드 매칭을 더 유연하게:
   ```python
   name_lower = (completed_wf_step.name or "").replace(" ", "")
   if "납입확인" in name_lower:
       ...
   ```

3. **출자요청 위저드가 memo에 capital_call_id 기록하는지 확인:** `CapitalCallWizard` 컴포넌트 → 워크플로 인스턴스 생성 시 `memo` 필드에 `[capital_call_id:XXX]` 패턴으로 ID를 포함시키는지 확인. 미포함 시 추가 필요.

4. **LP 테이블 납입 상태 UI 반영:** `FundDetailPage.tsx` 또는 `FundOperationsPage.tsx`의 LP 목록에서 `paid_in` 컬럼이 DB 값을 실시간으로 반영하는지.

5. **성과지표 연동:** `FundOperationsPage.tsx` 성과지표 섹션의 `performance.paid_in_total`이 API에서 LP.paid_in 합산으로 계산되는지, 별도 집계인지 확인하고 일치시킴.

6. **조합 개요 납입총액:** `FundDetailPage.tsx`의 조합 개요에 표시되는 납입 총액이 LP.paid_in 합산과 동기화되는지 확인.

### 1-C. 프론트엔드 무효화 보강

```tsx
// WorkflowsPage.tsx — completeStepMut.onSuccess 에서:
queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
queryClient.invalidateQueries({ queryKey: ['dashboard'] })
// 아래 추가 필요:
queryClient.invalidateQueries({ queryKey: ['fund'] })
queryClient.invalidateQueries({ queryKey: ['funds'] })
queryClient.invalidateQueries({ queryKey: ['capitalCalls'] })
queryClient.invalidateQueries({ queryKey: ['capitalCallItems'] })
queryClient.invalidateQueries({ queryKey: ['fundPerformance'] })
```

---

## Part 2 — 파이프라인 가운데 정렬

### 2-A. 문제 원인

```
[사이드바 240px] [page-container max-w-7xl(1280px) px-6]
                  ↑ 이 안에 파이프라인이 있음
                  파이프라인: max-w-[1400px] → 1280px에 갇혀서 의미 없음
                  1280px 안에서 사이드바 반대편에 여백이 생겨 오른쪽 치우침
```

### 2-B. 수정 방안

파이프라인 뷰일 때 `page-container`의 `max-w` 제한을 해제하거나 확대:

```tsx
// DashboardPage.tsx L641:
// 변경 전:
<div className={`page-container ${dashboardView === 'pipeline' ? 'space-y-4' : 'space-y-6'}`}>

// 변경 후:
<div className={dashboardView === 'pipeline'
  ? 'mx-auto w-full max-w-[1600px] space-y-4 px-4 py-6'
  : 'page-container space-y-6'
}>
```

**포인트:**
- 파이프라인 모드: `max-w-[1600px]` + `px-4` → 더 넓은 공간 활용, 좌우 균형
- 일반 대시보드: 기존 `page-container` (max-w-7xl) 유지
- `TaskPipelineView.tsx` L548의 `max-w-[1400px]` `mx-auto`가 1600px 안에서 가운데 정렬됨

### 2-C. 미세 조정

`TaskPipelineView` 컬럼 간 gap을 `gap-3` → `gap-4`로 약간 넓혀 시각적 분리감 증가 검토 (선택).

---

## Part 3 — 업무보드 연도·월·대상 필터 삭제

### 3-A. 삭제 대상 코드 (`TaskBoardPage.tsx`)

1. **State 변수 삭제:**
   - `completedYear` / `setCompletedYear`
   - `completedMonth` / `setCompletedMonth`
   - `completedYearOptions` (computed)
   - `fundFilter` / `setFundFilter`

2. **UI 요소 삭제:**
   - L900–928: `{statusFilter === 'completed' && (` ... `)}` 블록 전체 (연도+월)
   - L930–951: 대상 필터 `<div>` 블록 전체

3. **필터 로직 삭제:**
   - `completedYear`, `completedMonth`로 필터링하는 `useMemo` 또는 computed 값
   - `fundFilter`로 필터링하는 로직

### 3-B. 주의사항

- 삭제 후 완료 업무 목록은 **필터 없이 전체 표시** (최신순 정렬 유지)
- 기존 `statusFilter` (진행 중 / 전체 / 완료) 토글은 유지
- `fundsForFilter`, `gpEntities` 등 데이터 fetch가 다른 곳에서도 사용되는지 확인 후, 이 필터에서만 사용되면 fetch도 삭제

---

## Part 4 — 워크플로 템플릿 서류 추가/삭제

### 4-A. 백엔드 구현

**모델 (`WorkflowDocument`):**
- `id`, `workflow_id`, `name`, `required`, `timing` 필드 (이미 존재)

**API 엔드포인트 추가 (`routers/workflows.py`):**

```python
# 서류 목록 조회 (기존 워크플로 상세에 포함될 수 있음)
@router.get("/api/workflows/{workflow_id}/documents")
def list_workflow_documents(workflow_id: int, db: Session = Depends(get_db)):
    workflow = db.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(404, "워크플로를 찾을 수 없습니다")
    return [
        {"id": d.id, "name": d.name, "required": d.required, "timing": d.timing}
        for d in workflow.documents
    ]

# 서류 추가
@router.post("/api/workflows/{workflow_id}/documents")
def add_workflow_document(
    workflow_id: int,
    data: WorkflowDocumentInput,
    db: Session = Depends(get_db)
):
    workflow = db.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(404, "워크플로를 찾을 수 없습니다")
    doc = WorkflowDocument(
        workflow_id=workflow_id,
        name=data.name,
        required=data.required,
        timing=data.timing,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return {"id": doc.id, "name": doc.name, "required": doc.required, "timing": doc.timing}

# 서류 삭제
@router.delete("/api/workflows/{workflow_id}/documents/{document_id}")
def delete_workflow_document(
    workflow_id: int, document_id: int, db: Session = Depends(get_db)
):
    doc = db.query(WorkflowDocument).filter(
        WorkflowDocument.id == document_id,
        WorkflowDocument.workflow_id == workflow_id,
    ).first()
    if not doc:
        raise HTTPException(404, "서류를 찾을 수 없습니다")
    db.delete(doc)
    db.commit()
    return {"ok": True}
```

**스키마 추가:**
```python
class WorkflowDocumentInput(BaseModel):
    name: str
    required: bool = True
    timing: str | None = None
```

### 4-B. 프론트엔드 API 함수 (`lib/api.ts`)

```typescript
// 서류 목록
export async function listWorkflowDocuments(workflowId: number) {
  const res = await fetch(`${BASE}/api/workflows/${workflowId}/documents`)
  if (!res.ok) throw new Error('서류 조회 실패')
  return res.json()
}

// 서류 추가
export async function addWorkflowDocument(
  workflowId: number,
  data: { name: string; required?: boolean; timing?: string }
) {
  const res = await fetch(`${BASE}/api/workflows/${workflowId}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('서류 추가 실패')
  return res.json()
}

// 서류 삭제
export async function deleteWorkflowDocument(workflowId: number, documentId: number) {
  const res = await fetch(`${BASE}/api/workflows/${workflowId}/documents/${documentId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('서류 삭제 실패')
  return res.json()
}
```

### 4-C. 프론트엔드 UI (`WorkflowsPage.tsx`)

템플릿 수정/추가 시 서류 관리 영역:

```
┌─── 템플릿 수정 ─────────────────────────────────┐
│ [기존: 이름, 카테고리, 기간 필드...]             │
│                                                   │
│ 📄 서류 목록                                      │
│ ┌─────────────────────────────────────┐           │
│ │ ☐ 납입 요청 공문 (필수, D-day)    [삭제]│           │
│ │ ☐ 조합 통장사본 (필수)            [삭제]│           │
│ │ ☐ 투심 보고서 (필수)              [삭제]│           │
│ └─────────────────────────────────────┘           │
│ [+ 서류 추가] ← 인라인 입력: 이름 + 필수여부 + 시점 │
└──────────────────────────────────────────────────┘
```

- **서류 추가:** 인라인 폼 (서류명 input + 필수 checkbox + timing input + 추가 버튼)
- **서류 삭제:** 각 행에 삭제 버튼 (확인 없이 즉시 삭제, 또는 간단한 confirm)
- **서류 수정:** Phase 23 범위에서는 삭제 후 재추가로 갈음 (수정 API는 필요 시 추후)

---

## Files to create / modify

| # | Type | File | Part | Changes |
|---|------|------|------|---------|
| 1 | **[MODIFY]** | `backend/routers/workflows.py` | 1,4 | 납입확인 키워드 매칭 유연화 + 서류 CRUD 3개 엔드포인트 추가 |
| 2 | **[MODIFY]** | `backend/schemas/workflow.py` | 4 | `WorkflowDocumentInput` 스키마 추가 |
| 3 | **[MODIFY]** | `frontend/src/lib/api.ts` | 4 | 서류 API 함수 3개 추가 |
| 4 | **[MODIFY]** | `frontend/src/pages/WorkflowsPage.tsx` | 1,4 | completeStep 무효화 보강 + 서류 관리 UI |
| 5 | **[MODIFY]** | `frontend/src/pages/DashboardPage.tsx` | 2 | 파이프라인 모드 page-container 확대 |
| 6 | **[MODIFY]** | `frontend/src/pages/TaskBoardPage.tsx` | 3 | 연도·월·대상 필터 삭제 |

---

## Acceptance Criteria

### Part 1: 출자 납입 자동연계
- [ ] AC-01: "납입확인 및 입금대사" 단계 완료 시 해당 CapitalCall의 모든 CapitalCallItem.paid = 1, paid_date = 완료일
- [ ] AC-02: LP.paid_in이 해당 출자 항목 금액만큼 정확히 증가
- [ ] AC-03: 납입 확인 키워드 매칭이 띄어쓰기 유무와 무관하게 작동 ("납입확인", "납입 확인" 모두)
- [ ] AC-04: 출자요청 위저드로 생성된 워크플로 인스턴스의 memo에 capital_call_id가 포함되어 있음
- [ ] AC-05: 프론트엔드에서 단계 완료 후 fund, capitalCalls, capitalCallItems, fundPerformance, dashboard 쿼리 전부 무효화
- [ ] AC-06: FundDetailPage 조합 개요의 납입총액이 LP.paid_in 합산과 일치
- [ ] AC-07: FundOperationsPage 성과지표의 paid_in_total이 정확히 반영
- [ ] AC-08: FundOperationsPage LP 테이블에서 해당 LP의 납입 상태가 자동 갱신

### Part 2: 파이프라인 정렬
- [ ] AC-09: 파이프라인 뷰에서 4열 카드 구조가 화면 중앙에 정렬
- [ ] AC-10: 좌우 마진이 대칭적 (사이드바 제외한 콘텐츠 영역 기준)
- [ ] AC-11: page-container max-w를 파이프라인 모드에서 확대 적용
- [ ] AC-12: 일반 대시보드 모드의 레이아웃은 변경 없음

### Part 3: 업무보드 필터 삭제
- [ ] AC-13: 연도, 월, 대상 select 3개가 UI에서 완전히 제거
- [ ] AC-14: 관련 state 변수 및 필터 로직 코드에서 삭제
- [ ] AC-15: 기존 상태 필터(진행 중/전체/완료) 토글은 유지

### Part 4: 템플릿 서류 관리
- [ ] AC-16: `GET /api/workflows/{id}/documents` — 서류 목록 반환
- [ ] AC-17: `POST /api/workflows/{id}/documents` — 서류 추가 (name, required, timing)
- [ ] AC-18: `DELETE /api/workflows/{id}/documents/{doc_id}` — 서류 삭제
- [ ] AC-19: 템플릿 수정/추가 모달에서 서류 목록 표시
- [ ] AC-20: 서류 추가: 인라인 폼으로 이름/필수여부/시점 입력 후 즉시 추가
- [ ] AC-21: 서류 삭제: 행별 삭제 버튼으로 즉시 삭제

### 공통
- [ ] AC-22: `npm run build` TypeScript 에러 0건
- [ ] AC-23: 기존 기능 정상 동작 (워크플로 단계 완료, 대시보드, 업무보드)
- [ ] AC-24: console.log/print 디버깅 코드 없음

---

## 구현 주의사항

1. **Part 1 핵심:** 기존 `_mark_capital_call_items_paid` 로직은 잘 구현되어 있음. "납입확인" 키워드 매칭 유연화 + 프론트엔드 쿼리 무효화 보강 + 전체 데이터 흐름 검증이 핵심.
2. **Part 1 memo 패턴:** `_extract_capital_call_id`가 사용하는 `CAPITAL_CALL_ID_PATTERN` 정규식을 확인하고, 출자요청 위저드가 동일 패턴으로 memo를 기록하는지 반드시 검증.
3. **Part 2:** `page-container` 클래스 자체를 수정하지 말 것. 파이프라인 뷰일 때만 별도 className 적용.
4. **Part 3:** `fundFilter`가 다른 곳(예: 캘린더, 다른 페이지)에서도 사용되는지 확인 후, TaskBoardPage에서만 사용되면 완전 삭제.
5. **Part 4:** WorkflowDocument 모델의 relationship이 `Workflow.documents`로 이미 정의되어 있는지 확인. 없으면 모델에 relationship 추가 필요.
6. **Part 4 서류 추가 UI:** 템플릿 "수정" 모달과 "추가" 모달 양쪽에서 모두 서류 관리가 가능해야 함. 추가 시에는 워크플로 생성 후 서류 추가하는 2단계 흐름이 필요할 수 있으므로, 먼저 워크플로를 저장한 뒤 서류 CRUD가 가능하도록 구성.
