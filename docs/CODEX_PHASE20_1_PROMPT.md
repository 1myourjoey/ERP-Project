# Phase 20_1: 조합관리 정합성·연동 버그 수정 + 대시보드 파이프라인 전체화면

> **Priority:** P0
> **Focus:** 조합 폼 날짜 레이블 UX / LP·출자금 정합성 검증 / 수시콜 워크플로우→납입 양방향 연동 / 납입여부·비고 반영 버그 / 대시보드 파이프라인 전체화면 전환 + 워크플로우 프로그레스 바

---

## Table of Contents

1. [Part 1 — 조합 폼 날짜 입력 레이블 UX](#part-1--조합-폼-날짜-입력-레이블-ux)
2. [Part 2 — LP·출자금 정합성 검증](#part-2--lp출자금-정합성-검증)
3. [Part 3 — 수시콜 워크플로우 ↔ 출자금 양방향 연동](#part-3--수시콜-워크플로우--출자금-양방향-연동)
4. [Part 4 — 납입여부·비고 반영 버그 수정](#part-4--납입여부비고-반영-버그-수정)
5. [Part 5 — 대시보드 파이프라인 전체화면 뷰](#part-5--대시보드-파이프라인-전체화면-뷰)
6. [Part 6 — 워크플로우 프로그레스 바 시각화 통일](#part-6--워크플로우-프로그레스-바-시각화-통일)
7. [Part 7 — 전체 점검 및 감사](#part-7--전체-점검-및-감사)
8. [Files to create / modify](#files-to-create--modify)
9. [Acceptance Criteria](#acceptance-criteria)
10. [구현 주의사항](#구현-주의사항)

---

## 현재 상태 및 분석

### 조합 폼 날짜 입력
- `FundDetailPage.tsx` L149-237: `FundForm` 컴포넌트
- `FundsPage.tsx`에도 유사한 `FundForm` 존재
- **문제:** 날짜 `<input type="date">` 태그에 `label` 또는 `placeholder`가 없어서 결성일/등록성립일/만기일/해산일/투자기간종료일 중 어떤 것을 입력하는지 구분 불가

```tsx
// 현재 코드 (FundDetailPage.tsx L181-206) — 레이블 없음
<input type="date" value={form.formation_date || ''} ... className="..." />
<input type="date" value={form.registration_date || ''} ... className="..." />
<input type="date" value={form.maturity_date || ''} ... className="..." />
<input type="date" value={form.dissolution_date || ''} ... className="..." />
<input type="date" value={form.investment_period_end || ''} ... className="..." />
```

### LP·출자금 정합성
- `FundDetailPage.tsx`의 `LPForm` (L240-263): LP commitment 개별 입력
- `FundForm`에서 `commitment_total` 독립 입력 (L194)
- **문제:** LP들의 약정금액 합산 ≠ 총 약정액일 수 있음 (검증 없음)
- **문제:** 최초 납입금이 총 약정액 대비 10% 미만이어도 등록 가능 (최소비율 검증 없음)

### 수시콜 워크플로우 ↔ 출자금 연동
- 현재 `CapitalCallWizard.handleSubmit()` (L454-515): 출자 요청 등록 + 워크플로우 인스턴스 생성
- **워크플로우 → 납입 연동 없음:** `workflows.py` `complete_step()` (L290-364)에서 출자금 납입 자동 반영 로직 미구현. 결성 워크플로우 완료 시 `fund.status → active` 변경만 존재
- **`undo_step_completion()`** (L367-401): 되돌리기 시 출자금 되돌리기 미구현
- **워크플로우 메모에 `capital_call_id` 포함:** 이미 `memo` 필드에 `capital_call_id=N` 형태로 기록 (L486, L496)

### 납입여부·비고 반영 버그
- `CapitalCallDetail.tsx` (271줄): `handlePaidToggle()` (L119-126) → `updateCapitalCallItem` API 호출
- 백엔드 `update_capital_call_item()` (capital_calls.py L220-269): `paid` 변경 시 `_increase_lp_paid_in`/`_decrease_lp_paid_in` 호출하여 LP `paid_in` 반영
- **비고 반영 버그:** `CapitalCallItemUpdate` 스키마 (phase3.py L59-63)에 `memo` 필드가 **없음** → 비고 수정 불가
  ```python
  class CapitalCallItemUpdate(BaseModel):
      lp_id: Optional[int] = None
      amount: Optional[int] = None
      paid: Optional[bool] = None
      paid_date: Optional[date] = None
      # memo 필드 없음!
  ```
- **`CapitalCallItem` DB 모델 확인 필요:** `memo` 컬럼 존재 여부. 없으면 마이그레이션 필요

### 대시보드 파이프라인 뷰
- Phase 20에서 카드뷰/파이프라인 전환 토글 구현 예정
- **사용자 요구:** 파이프라인 뷰는 **대시보드 전체 화면**을 사용. 기존 대시보드 위젯을 모두 숨기고 파이프라인에만 집중하는 전환 뷰

---

## Part 1 — 조합 폼 날짜 입력 레이블 UX

### 1-A. FundDetailPage의 FundForm 날짜 필드에 레이블 추가

모든 `type="date"` input에 상단 레이블(또는 인라인 레이블)을 추가하여 어떤 날짜를 입력하는지 명확히 표시.

**수정 대상:** `frontend/src/pages/FundDetailPage.tsx` L169-207

**수정 방법:** 각 날짜 input을 `<div>` 래퍼 + `<label>` 구조로 변경:

```tsx
// 변경 전:
<input type="date" value={form.formation_date || ''} onChange={...} className="px-3 py-2 text-sm border rounded-lg" />

// 변경 후:
<div>
  <label className="mb-1 block text-xs font-medium text-gray-600">결성일</label>
  <input type="date" value={form.formation_date || ''} onChange={...} className="w-full px-3 py-2 text-sm border rounded-lg" />
</div>
```

**모든 날짜 필드 레이블 매핑:**

| 필드 | 레이블 | 조건부 표시 |
|------|--------|------------|
| `formation_date` | 결성일 | 항상 |
| `registration_date` | 등록성립일 | 항상 |
| `maturity_date` | 만기일 | `status !== 'forming'` |
| `dissolution_date` | 해산일 | `status === 'dissolved' \|\| 'liquidated'` |
| `investment_period_end` | 투자기간 종료일 | 항상 |

**text/number 필드에도 레이블 추가 필요:**

| 필드 | 레이블 |
|------|--------|
| `name` | 조합명 |
| `type` (select) | 조합유형 |
| `status` (select) | 상태 |
| `registration_number` | 고유번호증 번호 |
| `gp` | GP |
| `fund_manager` | 대표 펀드매니저 |
| `co_gp` | Co-GP |
| `trustee` | 신탁사 |
| `commitment_total` | 총 약정액 |
| `gp_commitment` | GP 출자금 |
| `contribution_type` | 출자방식 |
| `mgmt_fee_rate` | 관리보수율(%) |
| `performance_fee_rate` | 성과보수율(%) |
| `hurdle_rate` | 허들레이트(%) |
| `account_number` | 운용계좌번호 |

> **지침:** 현재 placeholder로 이름이 있는 필드(예: `placeholder="조합명"`)도 `<label>` 태그로 변경하여 일관성 유지. placeholder는 보조 텍스트(예: "예: V:ON 1호")로만 활용.

### 1-B. FundsPage의 FundForm에도 동일 적용

`frontend/src/pages/FundsPage.tsx`의 `FundForm` 컴포넌트에도 동일한 레이블 구조 적용. 날짜 필드가 placeholder 없이 `type="date"`만 있으면 반드시 레이블 추가.

---

## Part 2 — LP·출자금 정합성 검증

### 2-A. LP 약정금액 합산 = 총 약정액 정합성

**위치:** `FundDetailPage.tsx`의 LP 관리 섹션

LP 목록 하단에 **약정금액 합산** 표시 + 총 약정액과의 **차이 경고** 추가:

```tsx
// LP 섹션 하단에 정합성 표시
const lpCommitmentSum = (fundDetail?.lps ?? []).reduce(
  (sum, lp) => sum + Number(lp.commitment ?? 0), 0
)
const commitmentDiff = Number(fundDetail?.commitment_total ?? 0) - lpCommitmentSum
const isCommitmentMatched = Math.abs(commitmentDiff) < 1  // 1원 미만 차이 허용

// UI
<div className="mt-2 flex items-center gap-3 rounded-lg bg-gray-50 p-2 text-xs">
  <span className="text-gray-500">LP 약정 합계: {formatKRW(lpCommitmentSum)}</span>
  <span className="text-gray-400">|</span>
  <span className="text-gray-500">총 약정액: {formatKRW(fundDetail?.commitment_total ?? null)}</span>
  {!isCommitmentMatched && (
    <span className="text-red-600 font-medium">
      ⚠️ 차이: {formatKRW(Math.abs(commitmentDiff))} {commitmentDiff > 0 ? '(LP 부족)' : '(LP 초과)'}
    </span>
  )}
  {isCommitmentMatched && (
    <span className="text-emerald-600">✅ 정합</span>
  )}
</div>
```

### 2-B. LP 추가/수정 시 약정금액 합산 초과 경고

`LPForm` 또는 `createLPMut.onMutate`에서 새 LP commitment + 기존 합산이 `commitment_total`을 초과하면 경고:

```tsx
// LPForm 제출 전 검증 (경고만, 등록은 허용)
const currentSum = (fundDetail?.lps ?? [])
  .filter(lp => lp.id !== editingLPId)  // 수정 시 기존 값 제외
  .reduce((sum, lp) => sum + Number(lp.commitment ?? 0), 0)
const newTotal = currentSum + Number(form.commitment ?? 0)
const overCommitment = newTotal > Number(fundDetail?.commitment_total ?? 0)

// 폼 하단에 경고
{overCommitment && (
  <p className="text-xs text-amber-600">
    ⚠️ LP 약정금액 합산({formatKRW(newTotal)})이 총 약정액({formatKRW(fundDetail?.commitment_total ?? null)})을 초과합니다. 확인 후 저장하세요.
  </p>
)}
```

### 2-C. 최초출자 위자드에서 최소 납입비율 검증

`CapitalCallWizard` Step 2에서 **최초출자(initial)** 시 요청비율이 10% 미만이면 경고:

```tsx
// CapitalCallWizard Step 2 — callType === 'initial' 일 때
{callType === 'initial' && requestPercent > 0 && requestPercent < 10 && (
  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
    ⚠️ 최초 납입금은 총 약정액의 10% 이상이어야 합니다. 현재 요청: {requestPercent}%
  </div>
)}
```

**등록 버튼도 비활성화:**

```tsx
// canGoStep3 수정
const canGoStep3 = requestPercent > 0 
  && requestPercent <= remainingPercent
  && (callType !== 'initial' || requestPercent >= 10)  // 최초출자 시 10% 이상
```

---

## Part 3 — 수시콜 워크플로우 ↔ 출자금 양방향 연동

> **핵심:** 수시콜 워크플로우의 "납입 확인 및 입금 대사" 단계 완료 시 해당 capital call의 모든 미납 LP를 자동 납입 처리. 되돌리기 시 납입도 되돌림.

### 3-A. 워크플로우 단계 완료 시 출자금 자동 납입 반영

**수정 대상:** `backend/routers/workflows.py` `complete_step()` (L290-364)

**로직:** 워크플로우 인스턴스의 `memo`에 포함된 `capital_call_id=N`을 파싱. 완료된 단계이름이 "납입 확인 및 입금 대사"이면 해당 capital call의 미납 아이템 전체를 납입 처리.

```python
# workflows.py — complete_step() 내부, 기존 all_done 체크 전에 추가

# --- 수시콜 워크플로우 납입 연동 ---
import re
from models.phase3 import CapitalCall, CapitalCallItem

def _extract_capital_call_id(memo: str | None) -> int | None:
    """워크플로우 인스턴스 memo에서 capital_call_id 파싱"""
    if not memo:
        return None
    match = re.search(r'capital_call_id=(\d+)', memo)
    return int(match.group(1)) if match else None

# complete_step 함수 내부:
# 현재 완료되는 단계의 워크플로우 스텝 이름 확인
completed_wf_step = db.get(WorkflowStep, si.workflow_step_id)
if completed_wf_step and '납입 확인' in completed_wf_step.name:
    capital_call_id = _extract_capital_call_id(instance.memo)
    if capital_call_id:
        cc = db.get(CapitalCall, capital_call_id)
        if cc:
            unpaid_items = (
                db.query(CapitalCallItem)
                .filter(
                    CapitalCallItem.capital_call_id == capital_call_id,
                    CapitalCallItem.paid == 0,
                )
                .all()
            )
            today_str = date.today().isoformat()
            for item in unpaid_items:
                lp = db.get(LP, item.lp_id)
                item.paid = 1
                item.paid_date = today_str
                if lp:
                    lp.paid_in = int((lp.paid_in or 0) + (item.amount or 0))
```

### 3-B. 워크플로우 단계 되돌리기 시 출자금 되돌리기

**수정 대상:** `backend/routers/workflows.py` `undo_step_completion()` (L367-401)

```python
# undo_step_completion 함수 내부 — 기존 task 되돌리기 후 추가

# --- 납입 되돌리기 ---
completed_wf_step = db.get(WorkflowStep, step_instance.workflow_step_id)
if completed_wf_step and '납입 확인' in completed_wf_step.name:
    capital_call_id = _extract_capital_call_id(instance.memo)
    if capital_call_id:
        # 해당 콜의 납입완료된 아이템을 미납으로 되돌리기
        paid_items = (
            db.query(CapitalCallItem)
            .filter(
                CapitalCallItem.capital_call_id == capital_call_id,
                CapitalCallItem.paid == 1,
            )
            .all()
        )
        for item in paid_items:
            lp = db.get(LP, item.lp_id)
            if lp:
                lp.paid_in = max(0, int((lp.paid_in or 0) - (item.amount or 0)))
            item.paid = 0
            item.paid_date = None
```

### 3-C. 워크플로우 전체 완료 시 출자 콜 상태 반영

워크플로우 인스턴스가 `completed`가 되면 해당 capital call 관련 UI가 자동으로 최신 상태를 반영하도록 프론트엔드 쿼리 무효화 필요.

**수정 대상:** `frontend/src/pages/WorkflowsPage.tsx` — 단계 완료 mutation의 `onSuccess`에 capital call 관련 쿼리 무효화 추가:

```tsx
// WorkflowsPage.tsx — completeStepMut 또는 해당 mutation의 onSuccess
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
  // 수시콜 연동이므로 출자 관련 쿼리도 무효화
  queryClient.invalidateQueries({ queryKey: ['capitalCalls'] })
  queryClient.invalidateQueries({ queryKey: ['capitalCallItems'] })
  queryClient.invalidateQueries({ queryKey: ['fund'] })
  queryClient.invalidateQueries({ queryKey: ['funds'] })
  queryClient.invalidateQueries({ queryKey: ['capitalCallSummary'] })
  queryClient.invalidateQueries({ queryKey: ['fundPerformance'] })
  addToast('success', '단계가 완료되었습니다.')
}
```

**동일하게 `undoStepMut`의 `onSuccess`에도 추가.**

---

## Part 4 — 납입여부·비고 반영 버그 수정

### 4-A. CapitalCallItemUpdate 스키마에 memo 필드 추가

**수정 대상:** `backend/schemas/phase3.py` L59-63

```python
# 변경 전:
class CapitalCallItemUpdate(BaseModel):
    lp_id: Optional[int] = None
    amount: Optional[int] = None
    paid: Optional[bool] = None
    paid_date: Optional[date] = None

# 변경 후:
class CapitalCallItemUpdate(BaseModel):
    lp_id: Optional[int] = None
    amount: Optional[int] = None
    paid: Optional[bool] = None
    paid_date: Optional[date] = None
    memo: Optional[str] = None  # 비고 필드 추가
```

### 4-B. CapitalCallItem DB 모델에 memo 컬럼 확인/추가

**확인 대상:** `backend/models/phase3.py`의 `CapitalCallItem` 모델

만약 `memo` 컬럼이 없으면 추가:

```python
class CapitalCallItem(Base):
    __tablename__ = "capital_call_items"
    # ... 기존 컬럼들 ...
    memo = Column(Text, nullable=True)  # 비고
```

### 4-C. CapitalCallItemResponse 스키마에 memo 추가

```python
class CapitalCallItemResponse(BaseModel):
    id: int
    capital_call_id: int
    lp_id: int
    amount: int
    paid: bool
    paid_date: Optional[date] = None
    memo: Optional[str] = None  # 추가
    model_config = ConfigDict(from_attributes=True)
```

### 4-D. CapitalCallItemListItem 스키마에도 memo 추가

LP 목록 조회 시 memo가 포함되도록:

```python
class CapitalCallItemListItem(BaseModel):
    id: int
    capital_call_id: int
    lp_id: int
    lp_name: Optional[str] = None
    amount: int
    paid: bool
    paid_date: Optional[date] = None
    memo: Optional[str] = None  # 추가
```

### 4-E. 프론트엔드 CapitalCallDetail에 비고 편집 추가

**수정 대상:** `frontend/src/components/CapitalCallDetail.tsx`

테이블에 "비고" 컬럼 추가 + 편집 가능하게:

```tsx
// 테이블 헤더에 비고 컬럼 추가
<th className="px-2 py-1 text-left">비고</th>

// 각 행에 비고 편집
<td className="px-2 py-1 text-gray-500">
  {editable ? (
    <input
      type="text"
      value={item.memo ?? ''}
      onChange={(e) => {
        updateItemMut.mutate({
          callId: capitalCallId,
          itemId: item.id,
          data: { memo: e.target.value || null },
        })
      }}
      onBlur={(e) => {
        // blur 시 저장 (debounce 대안)
        updateItemMut.mutate({
          callId: capitalCallId,
          itemId: item.id,
          data: { memo: e.target.value || null },
        })
      }}
      placeholder="비고 입력"
      className="w-28 rounded border px-1 py-0.5 text-xs"
    />
  ) : (
    <span>{item.memo || '-'}</span>
  )}
</td>
```

### 4-F. 프론트엔드 API 타입에 memo 추가

**수정 대상:** `frontend/src/lib/api.ts`

`CapitalCallItem` 타입과 `CapitalCallItemInput` 타입에 `memo` 필드 추가:

```tsx
export interface CapitalCallItem {
  id: number
  capital_call_id: number
  lp_id: number
  lp_name?: string
  amount: number
  paid: boolean
  paid_date: string | null
  memo?: string | null  // 추가
}

export interface CapitalCallItemInput {
  lp_id: number
  amount: number
  paid: boolean
  paid_date: string | null
  memo?: string | null  // 추가
}
```

### 4-G. 납입여부 체크 후 UI 반영 확인

현재 `CapitalCallDetail.tsx`의 `handlePaidToggle`(L119-126)이 `updateCapitalCallItem` 호출 후 `onSuccess`에서 다음 쿼리를 무효화:

```tsx
queryClient.invalidateQueries({ queryKey: ['capitalCallItems', capitalCallId] })
queryClient.invalidateQueries({ queryKey: ['fund'] })
queryClient.invalidateQueries({ queryKey: ['funds'] })
queryClient.invalidateQueries({ queryKey: ['fundPerformance'] })
```

**추가 필요:**

```tsx
queryClient.invalidateQueries({ queryKey: ['capitalCallSummary'] })
queryClient.invalidateQueries({ queryKey: ['capitalCalls'] })
```

출자 이력 테이블의 `summaryByCallId`가 `capitalCallSummary` 쿼리에서 오므로, 납입 상태 변경 시 이력 테이블의 "완납/미완납" 상태도 즉시 갱신되어야 함.

---

## Part 5 — 대시보드 파이프라인 전체화면 뷰

### 5-A. 전체화면 전환 방식

기존 대시보드의 상단 StatCard, 업무 카드, 워크플로 카드, 보고서 카드 등 **모든 위젯을 숨기고** 파이프라인 뷰만 전체 화면으로 표시하는 전환.

**수정 대상:** `frontend/src/pages/DashboardPage.tsx`

```tsx
// 뷰 상태
const [dashboardView, setDashboardView] = useState<'default' | 'pipeline'>('default')

// 레이아웃 — 전체화면 전환
return (
  <div className="page-container space-y-6">
    {/* 항상 표시: 뷰 전환 버튼 */}
    <div className="flex items-center justify-between">
      <h2 className="page-title">
        {dashboardView === 'pipeline' ? '업무 파이프라인' : '대시보드'}
      </h2>
      <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
        <button
          onClick={() => setDashboardView('default')}
          className={`rounded-md px-3 py-1.5 text-xs transition ${
            dashboardView === 'default'
              ? 'bg-white font-medium text-gray-800 shadow'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          대시보드
        </button>
        <button
          onClick={() => setDashboardView('pipeline')}
          className={`rounded-md px-3 py-1.5 text-xs transition ${
            dashboardView === 'pipeline'
              ? 'bg-white font-medium text-gray-800 shadow'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          파이프라인
        </button>
      </div>
    </div>

    {dashboardView === 'default' ? (
      <>
        {/* 기존 대시보드 콘텐츠 전체 */}
      </>
    ) : (
      <TaskPipelineView
        todayTasks={todayTasks}
        tomorrowTasks={tomorrowTasks}
        thisWeekTasks={thisWeekRange?.filtered ?? []}
        upcomingTasks={upcoming}
        noDeadlineTasks={noDeadline}
        completedTodayTasks={completed_today}
        activeWorkflows={active_workflows}
        onClickTask={(task) => { setSelectedTask(task); setDetailOpen(true) }}
        onClickWorkflow={(wf) => navigate('/workflows', { state: { expandInstanceId: wf.id } })}
        fullScreen={true}
      />
    )}
  </div>
)
```

### 5-B. TaskPipelineView 컴포넌트 — 전체화면 모드

**파일:** `frontend/src/components/TaskPipelineView.tsx` [NEW]

```tsx
interface TaskPipelineViewProps {
  todayTasks: Task[]
  tomorrowTasks: Task[]
  thisWeekTasks: Task[]
  upcomingTasks: Task[]
  noDeadlineTasks: Task[]
  completedTodayTasks: Task[]
  activeWorkflows: ActiveWorkflow[]
  onClickTask: (task: Task) => void
  onClickWorkflow: (wf: ActiveWorkflow) => void
  fullScreen?: boolean  // 전체화면 모드
}
```

**전체화면 모드에서:**
- **높이:** `min-h-[calc(100vh-120px)]` 사용하여 화면 전체 활용
- **5단계 파이프라인 컬럼:** 가로 flex, 각 컬럼 `flex-1`로 균등 분배
- 각 컬럼: 상단 아이콘 + 단계명 + 건수 → 하단 업무 카드 목록 (카테고리별 그룹)
- 업무 카드: 클릭 시 `onClickTask` 호출
- **하단 워크플로우 프로그레스 바:** 전체 너비 사용

**파이프라인 컬럼 구성:**

```
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│ 📥 대기  │  │ ⏰ 오늘  │  │ 📆 이번주│  │ 🔜 예정  │  │ ✅ 완료  │
│ N건     │  │ N건     │  │ N건     │  │ N건     │  │ N건     │
│─────────│  │─────────│  │─────────│  │─────────│  │─────────│
│         │  │         │  │         │  │         │  │         │
│ [카드들] │  │ [카드들] │  │ [카드들] │  │ [카드들] │  │ [카드들] │
│         │  │         │  │         │  │         │  │         │
│         │  │         │  │         │  │         │  │         │
└─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘
```

**업무 카드 내 정보 (직관적 표시):**
- 업무 제목
- 카테고리 배지 (색상별)
- 관련 조합명 (있으면)
- 마감일 (D-N 형태)
- 연관 워크플로우 표시 (fund_id 기반으로 활성 워크플로우와 매칭)

**업무별 연계성 시각화:**
- 동일 조합(fund) 관련 업무를 시각적으로 연결 — fund별 좌측 컬러 바 또는 배경색 통일
- 워크플로우 소속 업무는 워크플로우 아이콘 + 워크플로우명 표시

---

## Part 6 — 워크플로우 프로그레스 바 시각화 통일

### 6-A. 대시보드 기존 워크플로 카드에 프로그레스 바 추가

현재 대시보드의 진행 중인 워크플로 카드(`DashboardPage.tsx` L324-338)는 텍스트 `progress` ("3/6" 형태)만 표시.

**수정:** 파이프라인 뷰에서 사용하는 것과 동일한 **시각적 프로그레스 바** 추가:

```tsx
// 대시보드 워크플로 카드 — 기존 텍스트 progress 옆에 바 추가
{active_workflows.map((wf: ActiveWorkflow) => {
  const match = wf.progress.match(/(\d+)\/(\d+)/)
  const current = match ? parseInt(match[1]) : 0
  const total = match ? parseInt(match[2]) : 1
  const percent = total ? Math.round((current / total) * 100) : 0
  
  return (
    <div key={wf.id} className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 ...">
      <button onClick={...} className="w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-indigo-800">{wf.name}</p>
          <span className="text-xs text-indigo-600">{wf.progress}</span>
        </div>
        <p className="mt-1 text-xs text-indigo-600">...</p>
        {/* 프로그레스 바 추가 */}
        <div className="mt-2 h-1.5 w-full rounded-full bg-indigo-200/60 overflow-hidden">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </button>
    </div>
  )
})}
```

### 6-B. TaskPipelineView의 워크플로우 프로그레스 바

파이프라인 뷰 하단의 워크플로우 섹션에서도 동일한 바 스타일 사용. 이미 Phase 20 프롬프트에서 정의한 구조를 따르되, 전체화면에서는 더 크고 상세하게 표시:

```tsx
// 전체화면 파이프라인 — 워크플로우 프로그레스
<div className="mt-4 space-y-2">
  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">워크플로우 진행 현황</h4>
  {activeWorkflows.map((wf) => {
    const { current, total, percent } = parseProgress(wf.progress)
    return (
      <button key={wf.id} onClick={() => onClickWorkflow(wf)}
        className="flex items-center gap-4 w-full rounded-lg border border-gray-200 p-3 hover:bg-gray-50 text-left">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-800 truncate">{wf.name}</p>
          <p className="text-xs text-gray-500">{wf.fund_name || '-'} {wf.company_name ? `/ ${wf.company_name}` : ''}</p>
          {wf.next_step && (
            <p className="text-xs text-gray-400 mt-0.5">다음: {wf.next_step}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-32 h-2.5 rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${percent}%` }} />
          </div>
          <span className="text-sm font-medium text-gray-700 w-12 text-right">{wf.progress}</span>
        </div>
      </button>
    )
  })}
</div>
```

---

## Part 7 — 전체 점검 및 감사

### 7-A. 수정 파일 연계 점검

| # | 점검 항목 | 관련 파일 |
|---|----------|---------|
| 1 | FundForm 모든 input에 `<label>` 표시 확인 | `FundDetailPage.tsx`, `FundsPage.tsx` |
| 2 | LP 약정 합산 경고 정상 표시 | `FundDetailPage.tsx` |
| 3 | 최초 출자 10% 이상 검증 | `FundDetailPage.tsx` (CapitalCallWizard) |
| 4 | 워크플로우 "납입 확인" 완료 → 해당 콜 전 LP 납입처리 | `workflows.py` |
| 5 | 워크플로우 되돌리기 → 납입 되돌리기 | `workflows.py` |
| 6 | 비고(memo) 수정이 정상 저장 | `phase3.py`, `capital_calls.py`, `CapitalCallDetail.tsx` |
| 7 | 납입여부 체크 → LP paid_in 반영 → FundDetailPage/FundsPage 즉시 갱신 | `CapitalCallDetail.tsx` |
| 8 | 대시보드 파이프라인 전체화면 전환 정상 | `DashboardPage.tsx`, `TaskPipelineView.tsx` |
| 9 | 워크플로우 프로그레스 바 대시보드 카드 + 파이프라인 동일 스타일 | `DashboardPage.tsx`, `TaskPipelineView.tsx` |
| 10 | 파이프라인 뷰에서 업무 클릭 → 상세 모달 표시 | `DashboardPage.tsx` |
| 11 | 동일 조합 업무 시각적 연계 표시 | `TaskPipelineView.tsx` |

### 7-B. DB 마이그레이션 확인

`CapitalCallItem` 모델에 `memo` 컬럼이 없으면 SQLAlchemy가 자동으로 컬럼을 추가하지 않음. 확인:

1. `backend/models/phase3.py`에서 `CapitalCallItem` 클래스 확인
2. `memo` 컬럼이 없으면 추가
3. Alembic 마이그레이션 또는 `Base.metadata.create_all()` 방식에 따라 적절히 처리
4. SQLite 사용 시: `ALTER TABLE capital_call_items ADD COLUMN memo TEXT;` 실행 필요할 수 있음

### 7-C. 빌드 검증

```bash
# Round 1: 프론트엔드 빌드
cd frontend && npm run build

# Round 2: 백엔드 테스트
cd backend && python -m pytest tests/ -v --tb=short

# Round 3: 전체 회귀 테스트
cd backend && python -m pytest tests/ -v --tb=long 2>&1 | tail -50
```

---

## Files to create / modify

| # | Type | File | Changes |
|---|------|------|---------| 
| 1 | **[MODIFY]** | `frontend/src/pages/FundDetailPage.tsx` | FundForm 날짜·텍스트 필드에 `<label>` 태그 추가, LP 약정 정합성 경고, CapitalCallWizard 최소 납입비율 검증, `invalidateQueries` 보강 |
| 2 | **[MODIFY]** | `frontend/src/pages/FundsPage.tsx` | FundForm 날짜·텍스트 필드에 `<label>` 태그 추가 |
| 3 | **[MODIFY]** | `backend/routers/workflows.py` | `complete_step()`에 수시콜→납입 자동 반영, `undo_step_completion()`에 납입 되돌리기 |
| 4 | **[MODIFY]** | `backend/schemas/phase3.py` | `CapitalCallItemUpdate`에 `memo` 필드 추가, `CapitalCallItemResponse`/`CapitalCallItemListItem`에 `memo` 추가 |
| 5 | **[MODIFY]** | `backend/models/phase3.py` | `CapitalCallItem`에 `memo` 컬럼 확인/추가 |
| 6 | **[MODIFY]** | `backend/routers/capital_calls.py` | `update_capital_call_item` 응답에 `memo` 포함 확인, `list_capital_call_items`에 `memo` 포함 확인 |
| 7 | **[MODIFY]** | `frontend/src/components/CapitalCallDetail.tsx` | 비고 편집 컬럼 추가, `invalidateQueries`에 `capitalCallSummary`/`capitalCalls` 추가 |
| 8 | **[MODIFY]** | `frontend/src/lib/api.ts` | `CapitalCallItem`/`CapitalCallItemInput` 타입에 `memo` 추가 |
| 9 | **[NEW]** | `frontend/src/components/TaskPipelineView.tsx` | 전체화면 업무 파이프라인 뷰 (5단계 컬럼 + 워크플로우 프로그레스 바 + 조합별 연계 시각화) |
| 10 | **[MODIFY]** | `frontend/src/pages/DashboardPage.tsx` | 대시보드/파이프라인 전체화면 전환, 워크플로 카드에 프로그레스 바 추가 |
| 11 | **[MODIFY]** | `frontend/src/pages/WorkflowsPage.tsx` | 단계 완료/되돌리기 시 출자 관련 쿼리 무효화 추가 |

---

## Acceptance Criteria

### Part 1: 날짜 레이블
- [ ] AC-01: FundForm(FundDetailPage)의 모든 input에 `<label>` 태그 존재
- [ ] AC-02: FundForm(FundsPage)의 모든 input에 `<label>` 태그 존재
- [ ] AC-03: 날짜 필드가 "결성일", "등록성립일" 등 한국어 레이블로 명확히 구분

### Part 2: 정합성 검증
- [ ] AC-04: LP 약정금액 합산 ≠ 총약정액 시 경고 메시지 표시
- [ ] AC-05: LP 추가/수정 시 합산 초과 경고
- [ ] AC-06: 최초 출자 요청 시 10% 미만이면 경고 + 진행 차단

### Part 3: 워크플로우 ↔ 출자금 연동
- [ ] AC-07: 수시콜 워크플로우 "납입 확인" 단계 완료 시 해당 콜 전 LP 자동 납입 처리
- [ ] AC-08: 납입 처리 시 LP paid_in 자동 증가
- [ ] AC-09: 워크플로우 "납입 확인" 단계 되돌리기 시 납입도 취소 + LP paid_in 감소
- [ ] AC-10: 워크플로우 단계 완료/되돌리기 후 프론트엔드 출자 관련 UI 자동 갱신

### Part 4: 납입·비고 버그
- [ ] AC-11: `CapitalCallItemUpdate` 스키마에 `memo` 필드 존재
- [ ] AC-12: `CapitalCallItem` DB 모델에 `memo` 컬럼 존재
- [ ] AC-13: 프론트엔드에서 비고 편집 → 저장 → DB 반영 확인
- [ ] AC-14: 납입여부 체크 → LP paid_in 반영 → 조합카드/이력테이블 즉시 갱신
- [ ] AC-15: `capitalCallSummary` 쿼리도 무효화되어 출자이력 상태(완납/미완납) 즉시 갱신

### Part 5: 파이프라인 전체화면
- [ ] AC-16: 대시보드/파이프라인 전환 버튼 존재
- [ ] AC-17: 파이프라인 선택 시 기존 대시보드 위젯 모두 숨김, 파이프라인만 전체화면 표시
- [ ] AC-18: 파이프라인 5단계(대기/오늘/이번주/예정/완료) 가로 레이아웃
- [ ] AC-19: 업무 카드에 카테고리·조합명·마감일 표시
- [ ] AC-20: 동일 조합 업무 시각적 연계 (컬러 바 또는 배경색)
- [ ] AC-21: 업무 클릭 시 상세 모달 표시

### Part 6: 프로그레스 바 통일
- [ ] AC-22: 대시보드 워크플로 카드에 프로그레스 바 표시
- [ ] AC-23: 파이프라인 뷰 하단에 워크플로우 프로그레스 바 표시
- [ ] AC-24: 양쪽 프로그레스 바 스타일 통일 (indigo 색상, 라운드 바)

### Part 7: 전체 점검
- [ ] AC-25: `npm run build` TypeScript 에러 0건
- [ ] AC-26: 백엔드 `pytest` 전체 통과
- [ ] AC-27: 파이프라인 ↔ 대시보드 전환 시 데이터 일관성 유지

---

## 구현 주의사항

1. **기존 기능을 깨뜨리지 않는다** — 모든 수정 후 빌드·테스트 필수
2. **FundForm 레이블 추가 시 그리드 레이아웃 유지** — `<div>` 래퍼 추가해도 기존 `grid-cols-2` 레이아웃 깨지지 않도록. 각 input을 `<div>` 안에 넣되, 그리드 아이템으로 유지
3. **LP 약정 정합성은 경고만** — 등록을 차단하지 않음 (기존 데이터 호환성)
4. **최초 출자 10% 미만은 등록 차단** — canGoStep3 조건에 추가
5. **워크플로우→납입 연동은 "납입 확인" 키워드 기반** — `completed_wf_step.name`에 "납입 확인"이 포함된 경우만 트리거. 한국어 키워드 매칭에 주의
6. **`_extract_capital_call_id`는 util 함수로 별도 정의** — `routers/workflows.py` 상단에 배치
7. **memo 컬럼 추가 시 기존 데이터 영향 없음** — SQLAlchemy `Column(Text, nullable=True)` + `ALTER TABLE ADD COLUMN`
8. **파이프라인 전체화면에서 기존 DashboardPage의 모든 기능 동작 유지** — 전환 시 상태 초기화 없음
9. **console.log, print 디버깅 코드 남기지 않는다**
10. **워크플로우 되돌리기 시 해당 콜의 paid_items만 되돌리기** — 다른 콜에 영향 없음
