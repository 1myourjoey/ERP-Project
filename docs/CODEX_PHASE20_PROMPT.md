# Phase 20: 대시보드 UX 개선 + 조합 생성 플로우 통합 + 출자 납입 UX 혁신

> **Priority:** P0
> **Focus:** 대시보드 버그 수정·워크플로 카드 개선·업무 파이프라인 전환 뷰 신설 / 조합 생성 폼 통합·상태 표기 개선 / 출자 납입 인라인 편집·미납 UX·수시콜 워크플로우 연동

---

## Table of Contents

1. [Part 1 — 대시보드 버그 수정 및 워크플로 카드 개선](#part-1--대시보드-버그-수정-및-워크플로-카드-개선)
2. [Part 2 — 대시보드 업무 파이프라인 전환 뷰](#part-2--대시보드-업무-파이프라인-전환-뷰)
3. [Part 3 — 조합 생성 폼 통합 및 상태 표기 개선](#part-3--조합-생성-폼-통합-및-상태-표기-개선)
4. [Part 4 — 출자 납입 인라인 편집 UX](#part-4--출자-납입-인라인-편집-ux)
5. [Part 5 — 미납 중심 UX 및 일괄 처리](#part-5--미납-중심-ux-및-일괄-처리)
6. [Part 6 — 공유 컴포넌트 분리 및 중복 제거](#part-6--공유-컴포넌트-분리-및-중복-제거)
7. [Part 7 — 수시콜 워크플로우 연동 및 통지기간 자동화](#part-7--수시콜-워크플로우-연동-및-통지기간-자동화)
8. [Part 8 — 전체 점검 및 감사](#part-8--전체-점검-및-감사)
9. [Files to create / modify](#files-to-create--modify)
10. [Acceptance Criteria](#acceptance-criteria)
11. [구현 주의사항](#구현-주의사항)

---

## 개요

### 현재 상태

#### 대시보드 (`DashboardPage.tsx`, 723줄)
- 상단 `StatCard` 6개 (오늘 업무, 이번 주, 진행 워크플로, 미수집 서류, 보고 마감, 오늘 완료)
- "이번 주" 카드 클릭 시 `popupSection === 'this_week'` 팝업에서 날짜를 `new Date(\`${dateKey}T00:00\`)` 로 포맷하는데, `dateKey`가 빈 문자열이거나 예상치 못한 형식일 때 **"Invalid Date"** 표시
- `formatShortDate()` 함수가 `new Date(value).toLocaleDateString(...)` 방식으로 되어 있어 날짜 형식이 올바르지 않은 경우 에러 발생 가능
- 진행 중인 워크플로 카드가 `active_workflows.map()`으로 전체 렌더링 — 워크플로 수가 많아지면 레이아웃 넘침
- 현재 업무를 오늘/내일/이번주/예정으로 카드 기반 나열 → **전체 업무 흐름을 한눈에 볼 수 있는 파이프라인 뷰**가 없음

#### 조합 관리 (`FundsPage.tsx`, 273줄)
- `FundForm` 컴포넌트가 `EMPTY_FUND` (10개 필드)로 조합 생성
- `FundDetailPage.tsx`의 `FundForm`은 더 많은 필드 지원 (만기일, 해산일 등)
- **문제:** 조합 생성 시 기본 정보만 입력 → 생성 후 상세 페이지에서 다시 수정 필요 (이중 작업)
- `forming` 상태 카드에 `labelStatus(fund.status)` → 영어 "forming" 표시 중. 한국어 "결성예정"으로 바뀌어야 함. (`labels.ts`의 `labelStatus` 확인 필요)

#### 출자 납입 (`CapitalCallDetail.tsx`, 74줄 / `FundDetailPage.tsx`)
- `CapitalCallDetail`이 **읽기 전용** — 납입/미납 상태 변경, 납입일 입력 불가
- `FundOperationsPage`에서만 LP별 납입 상태 수정 가능 → 화면 이동 번거로움
- `FundDetailPage`에서 바로 납입 확인 불가
- 미납만 필터, 일괄 납입 처리 기능 없음
- 최초 출자(결성총회) 콜과 수시콜의 워크플로우 연계 부재

---

## Part 1 — 대시보드 버그 수정 및 워크플로 카드 개선

### 1-A. "이번 주" 카드 Invalid Date 수정

**원인:** `popupSection === 'this_week'` 블록(현재 약 575~609줄)에서 `dateKey`를 기반으로 날짜 포맷하는 코드:

```tsx
// 현재 코드 (DashboardPage.tsx L591-594)
: new Date(`${dateKey}T00:00`).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })
```

`dateKey`가 `null`, `undefined`, 빈 문자열, 또는 유효하지 않은 날짜 문자열일 때 `Invalid Date` 발생.

**수정:**

```tsx
function safeFormatDate(value: string | null | undefined): string {
  if (!value) return '날짜 미지정'
  const date = new Date(`${value}T00:00`)
  if (Number.isNaN(date.getTime())) return value  // 파싱 불가 시 원본 반환
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })
}
```

**적용 위치:**
1. `DashboardPage.tsx`의 `this_week` 팝업 내 날짜 출력 부분
2. 동일 파일의 `formatShortDate` 함수도 안전하게 개선

```tsx
// formatShortDate 개선 (L39-42)
function formatShortDate(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value  // Invalid Date 방어
  return date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}
```

### 1-B. 진행 중인 워크플로 카드 — 4개까지 표시 + 스크롤

현재 `active_workflows.map()` 이 전체를 한번에 렌더링(L324-338). 4개 초과 시 스크롤로 변경:

```tsx
// 현재 (L324-338)
{active_workflows.length > 0 && (
  <div className="card-base">
    <button onClick={...} className="...">진행 중인 워크플로</button>
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {active_workflows.map((wf: ActiveWorkflow) => (
        // 전체 렌더링
      ))}
    </div>
  </div>
)}
```

**수정:** `max-h`와 `overflow-y-auto` 적용. 4개 카드 높이 기준으로 max-height 설정:

```tsx
{active_workflows.length > 0 && (
  <div className="card-base">
    <button onClick={() => setPopupSection('workflows')} className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-blue-600">
      <GitBranch size={16} /> 진행 중인 워크플로
      <span className="ml-auto text-xs text-gray-400">{active_workflows.length}건</span>
    </button>
    {/* 4개 카드 ≈ 각 약 80px. 2열 그리드이므로 2행 × 80px + gap = ~180px 정도. 여유있게 max-h-[340px] */}
    <div className="max-h-[340px] overflow-y-auto pr-1">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {active_workflows.map((wf: ActiveWorkflow) => (
          <div key={wf.id} className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-left hover:bg-indigo-100">
            <button onClick={() => navigate('/workflows', { state: { expandInstanceId: wf.id } })} className="w-full text-left">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-indigo-800">{wf.name}</p>
                <span className="text-xs text-indigo-600">{wf.progress}</span>
              </div>
              <p className="mt-1 text-xs text-indigo-600">{wf.fund_name || '-'} | {wf.company_name || '-'}</p>
              {wf.next_step && <p className="mt-1 text-xs text-indigo-700">다음: {wf.next_step} {wf.next_step_date ? `(${formatShortDate(wf.next_step_date)})` : ''}</p>}
            </button>
          </div>
        ))}
      </div>
    </div>
  </div>
)}
```

---

## Part 2 — 대시보드 업무 파이프라인 전환 뷰

> **핵심:** 업무보드의 캘린더 뷰처럼, 대시보드에 **업무 파이프라인 전환 뷰**를 추가. 같은 업무 데이터를 **흐름(Flow) 기반**으로 한눈에 볼 수 있게 구성.

### 2-A. 전환 뷰 종류 — 업무 파이프라인 (칸반 스타일 플로우)

기존 대시보드 업무 영역(오늘/내일 카드 + 이번주/예정 카드)과 **토글**로 전환 가능한 **파이프라인 뷰** 추가.

**파이프라인 구성:** 가로 플로우 형태의 단일 카드, 업무의 전체 생명주기를 단계별로 시각화

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  📋 업무 파이프라인                                               [카드뷰 전환]  │
│─────────────────────────────────────────────────────────────────────────────────│
│                                                                                │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │ 📥 대기   │ →  │ ⏰ 오늘   │ →  │ 📆 이번주 │ →  │ 🔜 예정   │ → │ ✅ 완료   │  │
│  │          │    │          │    │          │    │          │    │          │  │
│  │ 기한미지정│    │  3건     │    │  5건     │    │  8건     │    │  2건     │  │
│  │  2건     │    │ ─────── │    │ ─────── │    │ ─────── │    │ ─────── │  │
│  │ ─────── │    │ 투자실행  │    │ LP보고   │    │ 서류관리  │    │ 투자실행  │  │
│  │ 일반 업무│    │ A조합    │    │ B조합    │    │ C조합    │    │ A조합    │  │
│  │          │    │ 사후관리  │    │ 규약/총회 │    │          │    │          │  │
│  │          │    │ B조합    │    │          │    │          │    │          │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│                                                                                │
│  ── 워크플로우 진행 현황 ──                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ 투자실행 워크플로우 (A조합/X사)     [████████░░░░] 4/6 단계              │  │
│  │ LP 통지 워크플로우 (B조합)         [██████████░░] 5/6 단계              │  │
│  │ 결성총회 워크플로우 (C조합)         [████░░░░░░░░] 2/8 단계              │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2-B. 구현 방식

**전환 토글: 기존 `taskPanel` 과 독립적인 별도 뷰 전환**

```tsx
// DashboardPage.tsx에 상태 추가
const [dashboardView, setDashboardView] = useState<'cards' | 'pipeline'>('cards')
```

**전환 버튼:** 기존 업무 카드 영역 상단에 뷰 전환 버튼 추가

```tsx
<div className="mb-3 flex items-center justify-between">
  <h3 className="text-sm font-semibold text-gray-700">업무 현황</h3>
  <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
    <button
      onClick={() => setDashboardView('cards')}
      className={`rounded-md px-3 py-1 text-xs ${dashboardView === 'cards' ? 'bg-white font-medium text-gray-800 shadow' : 'text-gray-500'}`}
    >
      카드뷰
    </button>
    <button
      onClick={() => setDashboardView('pipeline')}
      className={`rounded-md px-3 py-1 text-xs ${dashboardView === 'pipeline' ? 'bg-white font-medium text-gray-800 shadow' : 'text-gray-500'}`}
    >
      파이프라인
    </button>
  </div>
</div>
```

### 2-C. 파이프라인 뷰 컴포넌트 — `TaskPipelineView`

**별도 컴포넌트로 분리:** `frontend/src/components/TaskPipelineView.tsx` [NEW]

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
}
```

**파이프라인 카드 구현 핵심:**

1. **가로 스크롤** 가능한 단일 카드(card-base) 안에 5개 컬럼(파이프라인 단계)
2. 각 컬럼: 아이콘 + 단계명 + 건수 + 카테고리별 그룹화된 업무 목록
3. 컬럼 간 화살표(→) 또는 구분선으로 흐름 표현
4. 각 컬럼 내 업무 클릭 시 `onClickTask` 호출
5. 하단에 워크플로우 진행 현황 바: 워크플로우명 + 프로그레스 바 + 단계 텍스트

**파이프라인 단계 정의:**

| 단계 | 데이터 소스 | 아이콘 | 색상 |
|------|-----------|--------|------|
| 대기 | `noDeadlineTasks` | 📥 Inbox | gray |
| 오늘 | `todayTasks` | ⏰ Clock | blue |
| 이번 주 | `thisWeekTasks` (오늘 제외) | 📆 Calendar | indigo |
| 예정 | `upcomingTasks` | 🔜 ArrowRight | amber |
| 완료 | `completedTodayTasks` | ✅ CheckCircle | emerald |

**워크플로우 프로그레스 바:**

```tsx
// ActiveWorkflow의 progress는 "3/6" 형식
function parseProgress(progress: string): { current: number; total: number } {
  const match = progress.match(/(\d+)\/(\d+)/)
  if (!match) return { current: 0, total: 1 }
  return { current: parseInt(match[1]), total: parseInt(match[2]) }
}
```

```tsx
{activeWorkflows.map((wf) => {
  const { current, total } = parseProgress(wf.progress)
  const percent = total ? Math.round((current / total) * 100) : 0
  return (
    <button key={wf.id} onClick={() => onClickWorkflow(wf)}
      className="flex items-center gap-3 rounded-lg border border-gray-200 p-2 hover:bg-gray-50 w-full text-left">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-800 truncate">{wf.name}</p>
        <p className="text-xs text-gray-500">{wf.fund_name} {wf.company_name ? `/ ${wf.company_name}` : ''}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-24 h-2 rounded-full bg-gray-200 overflow-hidden">
          <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${percent}%` }} />
        </div>
        <span className="text-xs text-gray-500 w-10 text-right">{wf.progress}</span>
      </div>
    </button>
  )
})}
```

---

## Part 3 — 조합 생성 폼 통합 및 상태 표기 개선

### 3-A. 조합 추가 폼을 수정폼과 동일하게 통합

**현재 문제:** `FundsPage.tsx`의 `FundForm`은 10개 필드만 받음. `FundDetailPage.tsx`의 수정 폼은 LP 목록, 통지기간, 핵심약정 등 더 많은 설정 가능. → 생성 후 바로 수정해야 하는 이중 작업 발생.

**수정 방향:** `FundsPage.tsx`의 `FundForm`에 **`FundDetailPage.tsx`의 수정폼과 동일한 필드**를 추가:

- 기본 정보: 조합명, 유형, 상태, 결성일, 고유번호, 등록성립일, 만기일, 해산일, GP, Co-GP, 신탁사, 총 약정액 **(이미 있음)**
- **추가 필요:** LP 목록 입력 (최소 GP 1건), 최초 납입금액 (선택)

```tsx
// FundsPage.tsx의 FundForm 개선

// LP 입력 영역 추가
const [lps, setLps] = useState<LPInput[]>([])

// LP 추가 UI
<div className="mt-4 border-t pt-3">
  <div className="flex items-center justify-between mb-2">
    <h4 className="text-sm font-medium text-gray-700">LP 목록 (선택)</h4>
    <button onClick={() => setLps(prev => [...prev, { name: '', type: '기관투자자', commitment: null, paid_in: null, contact: '' }])}
      className="text-xs text-blue-600 hover:underline">
      + LP 추가
    </button>
  </div>
  {lps.map((lp, i) => (
    <div key={i} className="grid grid-cols-3 gap-2 mb-2">
      <input value={lp.name} onChange={e => updateLp(i, 'name', e.target.value)} placeholder="LP명" className="px-2 py-1.5 text-sm border rounded" />
      <select value={lp.type} onChange={e => updateLp(i, 'type', e.target.value)} className="px-2 py-1.5 text-sm border rounded">
        <option value="기관투자자">기관투자자</option>
        <option value="개인투자자">개인투자자</option>
        <option value="GP">GP</option>
      </select>
      <input type="number" value={lp.commitment ?? ''} onChange={e => updateLp(i, 'commitment', e.target.value ? Number(e.target.value) : null)} placeholder="약정금액" className="px-2 py-1.5 text-sm border rounded" />
    </div>
  ))}
</div>
```

**생성 로직 변경:**

```tsx
// FundsPage.tsx — createFund 후 LP 일괄 등록
const createFundMut = useMutation({
  mutationFn: async (data: { fund: FundInput; lps: LPInput[] }) => {
    const created = await createFund(data.fund)
    // LP 목록이 있으면 일괄 등록
    for (const lp of data.lps) {
      if (lp.name.trim()) {
        await createFundLP(created.id, lp)
      }
    }
    return created
  },
  onSuccess: (created: Fund) => {
    queryClient.invalidateQueries({ queryKey: ['funds'] })
    setShowCreateFund(false)
    addToast('success', '조합이 생성되었습니다.')
    navigate(`/funds/${created.id}`)
  },
})
```

### 3-B. "결성예정" 상태 표기 개선

**현재:** 조합 카드 오른쪽 상단에 `labelStatus(fund.status)` 표시. `labelStatus`가 `'forming'`을 **반환하는 값 확인 필요**.

**수정:** `frontend/src/lib/labels.ts`의 `labelStatus` 함수에서 `forming`에 대한 한국어 매핑이 없거나 영어 그대로 표시되면 수정:

```tsx
// labels.ts — 확인 후 필요시 수정
export function labelStatus(status: string | null | undefined): string {
  switch (status) {
    case 'forming': return '결성예정'  // ← 이 매핑 확인·수정
    case 'active': return '운용 중'
    case 'dissolved': return '해산'
    case 'liquidated': return '청산 완료'
    // ...
  }
}
```

---

## Part 4 — 출자 납입 인라인 편집 UX

> **핵심:** `FundDetailPage`의 출자이력 확장 행(`CapitalCallDetail`)에서 **바로** 납입 확인 처리 가능하도록 변경.

### 4-A. `CapitalCallDetail` 컴포넌트 확장 — 인라인 편집 모드

**현재:** `CapitalCallDetail.tsx`(74줄)이 읽기 전용. 납입여부(`paid`), 납입일(`paid_date`) 컬럼이 텍스트로만 표시.

**수정:** 각 LP 행에서 바로 납입 상태 토글 + 납입일 입력 + 저장 가능하게 변경.

```tsx
// CapitalCallDetail.tsx 확장 — 인라인 편집

interface CapitalCallDetailProps {
  capitalCallId: number
  commitmentTotal: number
  editable?: boolean          // 신규: 편집 모드 여부
  onItemUpdated?: () => void  // 신규: 항목 업데이트 후 콜백
}

export default function CapitalCallDetail({ capitalCallId, commitmentTotal, editable = false, onItemUpdated }: CapitalCallDetailProps) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  
  // 편집 중인 항목 추적
  const [editingItems, setEditingItems] = useState<Map<number, { paid: boolean; paid_date: string | null }>>(new Map())
  
  // 항목 저장 mutation
  const updateItemMut = useMutation({
    mutationFn: ({ callId, itemId, data }: { callId: number; itemId: number; data: Partial<CapitalCallItemInput> }) =>
      updateCapitalCallItem(callId, itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capitalCallItems', capitalCallId] })
      queryClient.invalidateQueries({ queryKey: ['fund'] })
      queryClient.invalidateQueries({ queryKey: ['funds'] })
      addToast('success', '납입 상태가 업데이트되었습니다.')
      onItemUpdated?.()
    },
  })

  // ...
  
  // 테이블 행: 편집 가능한 납입 컬럼
  <td className="px-2 py-1 text-center">
    {editable ? (
      <label className="inline-flex items-center gap-1 cursor-pointer">
        <input
          type="checkbox"
          checked={editState?.paid ?? item.paid}
          onChange={(e) => {
            const newPaid = e.target.checked
            const newDate = newPaid ? new Date().toISOString().slice(0, 10) : null
            // 즉시 저장
            updateItemMut.mutate({
              callId: capitalCallId,
              itemId: item.id,
              data: { paid: newPaid, paid_date: newDate },
            })
          }}
          className="rounded border-gray-300"
        />
        <span className={`text-[10px] ${item.paid ? 'text-emerald-700' : 'text-red-700'}`}>
          {item.paid ? '납입' : '미납'}
        </span>
      </label>
    ) : (
      <span className={`rounded px-1.5 py-0.5 text-[10px] ${item.paid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
        {item.paid ? '납입' : '미납'}
      </span>
    )}
  </td>
  
  // 납입일 컬럼도 편집 가능
  <td className="px-2 py-1">
    {editable && !item.paid ? (
      <input
        type="date"
        value={editState?.paid_date ?? item.paid_date ?? ''}
        onChange={(e) => updateItemMut.mutate({
          callId: capitalCallId,
          itemId: item.id,
          data: { paid_date: e.target.value || null },
        })}
        className="w-28 rounded border px-1 py-0.5 text-xs"
      />
    ) : (
      <span className="text-gray-500">{formatDate(item.paid_date)}</span>
    )}
  </td>
}
```

### 4-B. FundDetailPage에서 editable 모드 활성화

```tsx
// FundDetailPage.tsx — 기존 CapitalCallDetail 호출부 수정
{expandedCallId === call.id && (
  <tr>
    <td colSpan={5} className="px-3 py-3 bg-blue-50/50">
      <CapitalCallDetail
        capitalCallId={call.id}
        commitmentTotal={fund?.commitment_total || 0}
        editable={true}                    // ← 편집 모드 ON
        onItemUpdated={() => {
          queryClient.invalidateQueries({ queryKey: ['capitalCalls', fund?.id] })
          queryClient.invalidateQueries({ queryKey: ['fundLPs', fund?.id] })
        }}
      />
    </td>
  </tr>
)}
```

---

## Part 5 — 미납 중심 UX 및 일괄 처리

### 5-A. 미납만 보기 필터

`CapitalCallDetail` 컴포넌트에 **미납만 보기 토글** 추가:

```tsx
const [showUnpaidOnly, setShowUnpaidOnly] = useState(false)

const filteredItems = useMemo(() => {
  if (!items) return []
  return showUnpaidOnly ? items.filter(item => !item.paid) : items
}, [items, showUnpaidOnly])

// UI
<div className="flex items-center justify-between mb-2">
  <p className="text-xs font-semibold text-gray-600">LP별 납입 상세</p>
  {editable && (
    <label className="inline-flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
      <input type="checkbox" checked={showUnpaidOnly} onChange={e => setShowUnpaidOnly(e.target.checked)} className="rounded border-gray-300" />
      미납만 보기
    </label>
  )}
</div>
```

### 5-B. 선택 항목 일괄 납입 확인 버튼

```tsx
const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

// 일괄 납입 mutation
const batchConfirmMut = useMutation({
  mutationFn: async (itemIds: number[]) => {
    const today = new Date().toISOString().slice(0, 10)
    for (const itemId of itemIds) {
      await updateCapitalCallItem(capitalCallId, itemId, { paid: true, paid_date: today })
    }
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['capitalCallItems', capitalCallId] })
    queryClient.invalidateQueries({ queryKey: ['fund'] })
    queryClient.invalidateQueries({ queryKey: ['funds'] })
    setSelectedIds(new Set())
    addToast('success', '선택 항목의 납입이 확인되었습니다.')
    onItemUpdated?.()
  },
})

// UI — 테이블 헤더에 전체 선택 체크박스
<th className="px-2 py-1 text-center w-8">
  <input type="checkbox"
    checked={selectedIds.size > 0 && selectedIds.size === unpaidItems.length}
    onChange={e => {
      if (e.target.checked) setSelectedIds(new Set(unpaidItems.map(i => i.id)))
      else setSelectedIds(new Set())
    }}
    className="rounded border-gray-300" />
</th>

// 버튼 — 하단에 일괄 처리 버튼
{editable && selectedIds.size > 0 && (
  <div className="mt-2 flex items-center gap-2">
    <button onClick={() => batchConfirmMut.mutate([...selectedIds])}
      disabled={batchConfirmMut.isPending}
      className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-60">
      {batchConfirmMut.isPending ? '처리중...' : `선택 ${selectedIds.size}건 납입 확인`}
    </button>
  </div>
)}
```

### 5-C. 회차 전원 납입완료 처리 버튼

```tsx
// 전원 납입완료 버튼 — 미납 항목이 있을 때만 표시
{editable && unpaidItems.length > 0 && (
  <button onClick={() => batchConfirmMut.mutate(unpaidItems.map(i => i.id))}
    disabled={batchConfirmMut.isPending}
    className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-60">
    전원 납입완료 처리
  </button>
)}
```

---

## Part 6 — 공유 컴포넌트 분리 및 중복 제거

### 6-A. FundOperationsPage와 FundDetailPage 간 CapitalCallDetail 공유

**현재:** `CapitalCallDetail.tsx`가 이미 별도 컴포넌트로 분리되어 있음(Phase 18에서 생성). 두 페이지에서 import하여 사용 중.

**수정:** Part 4에서 확장한 `CapitalCallDetail`의 `editable` 모드를 양쪽에서 활용:

```tsx
// FundDetailPage.tsx — 일상 처리용
<CapitalCallDetail capitalCallId={call.id} commitmentTotal={...} editable={true} />

// FundOperationsPage.tsx — 고급 관리용 (기존 편집 UI 유지하되, CapitalCallDetail도 editable로)
{callExpandedId === row.id && (
  <div className="mt-2 rounded bg-gray-50 p-2 space-y-2">
    <CapitalCallDetail capitalCallId={row.id} commitmentTotal={...} editable={true} onItemUpdated={...} />
    {/* 기존 LP 항목 추가/수정/삭제 고급 UI도 유지 */}
  </div>
)}
```

### 6-B. 역할 분리

| 화면 | 역할 | CapitalCallDetail 사용 |
|------|------|---------------------|
| `FundDetailPage` | **일상 처리** — 납입 확인, 미납 필터, 일괄 처리 | `editable={true}` |
| `FundOperationsPage` | **고급 관리** — 배치 수정, 항목 추가/삭제, 정산 검토 | `editable={true}` + 기존 고급 편집 UI 유지 |

---

## Part 7 — 수시콜 워크플로우 연동 및 통지기간 자동화

### 7-A. 수시콜 워크플로우 자동 생성

**요구사항:**
1. 기존 "조합 의사결정 시 LP 통지 및 보고" 워크플로우 템플릿을 복사하여 "수시 출자금 납입 요청" 워크플로우 템플릿 추가
2. 결성총회 최초 콜과 수시콜 모두 FundDetailPage 출자 요청 위자드 등록 시 해당 워크플로우 인스턴스 **자동 생성**
3. 워크플로우 인스턴스의 일자는 조합별 통지기간(`FundNoticePeriod`)을 기반으로 자동 계산

**현재 코드 참고:** `FundDetailPage.tsx`의 `CapitalCallWizard.ensureLpNoticeWorkflowTemplate()` (L391-420)이 이미 LP 통지 워크플로우 템플릿을 자동 확인·생성하는 로직을 갖고 있음.

### 7-B. 수시콜 워크플로우 템플릿 정의

```tsx
// FundDetailPage.tsx 또는 별도 상수 파일

const CAPITAL_CALL_ADDITIONAL_WORKFLOW_NAME = '수시 출자금 납입 요청'

// 워크플로우 단계 정의 (LP 통지 워크플로우와 유사 구조)
const CAPITAL_CALL_WORKFLOW_STEPS = [
  { order: 1, name: '출자 요청 결의', timing: 'D-day', timing_offset_days: 0, estimated_time: '1h', quadrant: 'Q1', memo: '출자 요청에 대한 내부 결의' },
  { order: 2, name: 'LP 출자 요청 통지서 발송', timing: 'D-day', timing_offset_days: 0, estimated_time: '2h', quadrant: 'Q1', memo: 'LP별 출자 요청 통지서 발송' },
  { order: 3, name: '납입 기한 관리', timing: 'D+N', timing_offset_days: 0, estimated_time: '30m', quadrant: 'Q2', memo: '납입 기한까지 LP별 납입 현황 추적' },
  { order: 4, name: '납입 확인 및 입금 대사', timing: 'D+N', timing_offset_days: 0, estimated_time: '1h', quadrant: 'Q1', memo: '전 LP 납입 확인 후 계좌 입금 대사' },
  { order: 5, name: '출자 완료 보고', timing: 'D+N', timing_offset_days: 1, estimated_time: '30m', quadrant: 'Q2', memo: '출자 완료 내부 보고' },
]
```

### 7-C. 위자드 등록 시 워크플로우 자동 실행

```tsx
// CapitalCallWizard.handleSubmit() 확장

const handleSubmit = async () => {
  // 1. CapitalCall + Items 배치 등록 (기존)
  const capitalCall = await createCapitalCallBatch({
    fund_id: fund.id,
    call_date: callDate,
    call_type: callType,
    total_amount: lpTotal,
    request_percent: requestPercent,
    memo: `${requestPercent}% 출자 요청`,
    items: lpAmounts.map(lp => ({
      lp_id: lp.lp_id,
      amount: lp.amount,
      paid: false,
      paid_date: null,
    })),
  })

  // 2. 수시콜인 경우 워크플로우 자동 실행
  if (callType === 'additional') {
    // 수시콜 워크플로우 템플릿 확인·생성
    const templateId = await ensureCapitalCallWorkflowTemplate()
    
    // 워크플로우 인스턴스 생성 — trigger_date는 발송 마감일
    await instantiateWorkflow(templateId, {
      name: `수시 출자 요청 - ${fund.name} (${callDate})`,
      trigger_date: sendDeadline ? toIsoDate(sendDeadline.toISOString()) : callDate,
      fund_id: fund.id,
      memo: `${requestPercent}% 수시 출자 요청 (납입일: ${callDate})`,
    })
  }

  // 3. 최초 출자(결성총회)인 경우에도 워크플로우 강제 연동
  if (callType === 'initial') {
    // 기존 LP 통지 워크플로우 사용
    const templateId = await ensureLpNoticeWorkflowTemplate()
    
    await instantiateWorkflow(templateId, {
      name: `최초 출자금 납입 - ${fund.name} (${callDate})`,
      trigger_date: sendDeadline ? toIsoDate(sendDeadline.toISOString()) : callDate,
      fund_id: fund.id,
      memo: `결성총회 최초 출자 (납입일: ${callDate})`,
    })
  }

  // 4. 쿼리 무효화
  queryClient.invalidateQueries({ queryKey: ['capitalCalls', fund.id] })
  queryClient.invalidateQueries({ queryKey: ['fund', fund.id] })
  queryClient.invalidateQueries({ queryKey: ['workflowInstances'] })
  addToast('success', `${requestPercent}% 출자 요청이 등록되었습니다.`)
  onClose()
}
```

### 7-D. 통지기간 자동 일자 계산

조합별 `FundNoticePeriod`에서 통지기간(영업일)을 가져와 워크플로우 단계의 일자를 자동 계산.

이미 `CapitalCallWizard`에 있는 `subtractBusinessDays` 유틸과 `noticePeriod` 계산 로직을 활용:

```tsx
// 워크플로우 인스턴스 생성 시 trigger_date를 영업일 기준으로 자동 설정
const noticeType = callType === 'initial' ? 'capital_call_initial' : 'capital_call_additional'
const noticePeriodInfo = noticePeriods.find(np => np.notice_type === noticeType)
const businessDays = noticePeriodInfo?.business_days ?? 10

const triggerDate = subtractBusinessDays(new Date(callDate), businessDays)
```

---

## Part 8 — 전체 점검 및 감사

### 8-A. 수정 파일 연계 점검

| # | 점검 항목 | 관련 파일 |
|---|----------|---------|
| 1 | `formatShortDate` 안전화 후 대시보드 전체 날짜 표시 정상 확인 | `DashboardPage.tsx` |
| 2 | 워크플로 카드 4개 초과 시 스크롤 동작 확인 | `DashboardPage.tsx` |
| 3 | 파이프라인 뷰 ↔ 카드뷰 전환 시 데이터 일관성 | `DashboardPage.tsx`, `TaskPipelineView.tsx` |
| 4 | 조합 생성 폼에서 LP 입력 후 → 생성 → 상세 페이지에서 LP 확인 | `FundsPage.tsx`, `FundDetailPage.tsx` |
| 5 | `forming` 상태 한국어 표기 확인 | `labels.ts`, `FundsPage.tsx` |
| 6 | `CapitalCallDetail` editable 모드에서 납입 확인 시 `LP.paid_in` 자동 갱신 | `CapitalCallDetail.tsx`, 백엔드 `capital_calls.py` |
| 7 | 미납 필터, 전체 선택, 일괄 납입 정상 동작 | `CapitalCallDetail.tsx` |
| 8 | 수시콜 워크플로우 자동 생성 후 워크플로우 탭에서 확인 | `FundDetailPage.tsx`, `WorkflowsPage.tsx` |
| 9 | 최초 출자 시 LP 통지 워크플로우 연동 확인 | `FundDetailPage.tsx` |
| 10 | `FundOperationsPage`와 `FundDetailPage` 간 `CapitalCallDetail` 공유 동작 | 양쪽 페이지 |

### 8-B. 빌드 검증

```bash
# Round 1: 프론트엔드 빌드
cd frontend && npm run build

# Round 2: 백엔드 테스트
cd backend && python -m pytest tests/ -v --tb=short

# Round 3: 전체 회귀 테스트
cd backend && python -m pytest tests/ -v --tb=long 2>&1 | tail -50
```

### 8-C. 교차 기능 검증

- 출자 납입 확인 → `LP.paid_in` 업데이트 → `FundsPage` 카드 납입현황 반영 확인
- 워크플로우 인스턴스 생성 → 대시보드 "진행 워크플로" 카운트 증가 확인
- 파이프라인 뷰에서 업무 클릭 → 업무 상세 모달 정상 표시
- 조합 생성 시 LP 입력 → `FundDetailPage` LP 목록에서 확인
- 수시콜 워크플로우의 일자가 조합 통지기간에 맞게 자동 계산되는지 확인

---

## Files to create / modify

| # | Type | File | Changes |
|---|------|------|---------| 
| 1 | **[MODIFY]** | `frontend/src/pages/DashboardPage.tsx` | `formatShortDate` Invalid Date 방어, `this_week` 팝업 날짜 포맷 수정, 워크플로 카드 max-h 스크롤, 파이프라인 뷰 전환 토글 + `TaskPipelineView` 연동 |
| 2 | **[NEW]** | `frontend/src/components/TaskPipelineView.tsx` | 업무 파이프라인 가로 플로우 뷰 + 워크플로우 프로그레스 바 |
| 3 | **[MODIFY]** | `frontend/src/pages/FundsPage.tsx` | `FundForm`에 LP 입력 추가, 생성 로직에 LP 일괄 등록 추가, `forming` 상태 표기 확인 |
| 4 | **[MODIFY]** | `frontend/src/lib/labels.ts` | `labelStatus('forming')` → `'결성예정'` 매핑 확인·수정 |
| 5 | **[MODIFY]** | `frontend/src/components/CapitalCallDetail.tsx` | `editable` prop 추가, 인라인 납입 확인, 미납 필터, 선택/일괄 납입 확인, 전원 납입완료 버튼 |
| 6 | **[MODIFY]** | `frontend/src/pages/FundDetailPage.tsx` | `CapitalCallDetail`에 `editable={true}` 전달, 수시콜 워크플로우 자동 생성 로직, 최초 출자 워크플로우 연동 |
| 7 | **[MODIFY]** | `frontend/src/pages/FundOperationsPage.tsx` | `CapitalCallDetail`에 `editable={true}` 전달 |
| 8 | **[MODIFY]** | `frontend/src/lib/api.ts` | 필요시 `updateCapitalCallItem` import 경로 확인, 수시콜 워크플로우 관련 API 함수 확인 |

---

## Acceptance Criteria

### Part 1: 대시보드 버그 수정
- [ ] AC-01: "이번 주" 카드 클릭 팝업에서 Invalid Date가 **절대** 표시되지 않음
- [ ] AC-02: `formatShortDate` 함수가 null/undefined/잘못된 날짜 입력에 대해 안전하게 처리
- [ ] AC-03: 진행 중인 워크플로 카드가 4개(2열 기준 2행) 이하이면 전체 표시, 초과 시 스크롤
- [ ] AC-04: 워크플로 카드 영역에 건수 표시 (`N건`)

### Part 2: 파이프라인 뷰
- [ ] AC-05: 대시보드 업무 영역에 카드뷰/파이프라인 전환 토글 표시
- [ ] AC-06: 파이프라인 뷰에서 대기→오늘→이번주→예정→완료 5단계 가로 플로우 표시
- [ ] AC-07: 각 단계에 해당 업무 목록이 카테고리별로 그룹화되어 표시
- [ ] AC-08: 파이프라인 하단에 활성 워크플로우 프로그레스 바 표시
- [ ] AC-09: 파이프라인 뷰 내 업무 클릭 시 업무 상세 모달 표시

### Part 3: 조합 생성 통합
- [ ] AC-10: 조합 추가 폼에 LP 입력란 (LP명, 유형, 약정금액) 추가
- [ ] AC-11: LP가 입력된 경우 조합 생성과 동시에 LP 목록 자동 등록
- [ ] AC-12: 조합 생성 후 상세 페이지에서 LP 목록 즉시 확인 가능
- [ ] AC-13: `forming` 상태의 조합 카드에 "결성예정" 한국어 표시

### Part 4: 출자 납입 인라인 편집
- [ ] AC-14: `FundDetailPage`에서 출자이력 확장 시 납입여부 체크박스 표시
- [ ] AC-15: 체크박스 클릭 시 즉시 납입 상태 토글 + 납입일 자동 설정(오늘)
- [ ] AC-16: 납입 상태 변경 시 백엔드 `LP.paid_in` 자동 갱신

### Part 5: 미납 UX
- [ ] AC-17: "미납만 보기" 필터 토글 정상 동작
- [ ] AC-18: 미납 항목 멀티 선택 → "선택 N건 납입 확인" 버튼 클릭 시 일괄 처리
- [ ] AC-19: "전원 납입완료 처리" 버튼으로 해당 차수 전체 LP 일괄 납입 확인
- [ ] AC-20: 일괄 처리 후 조합카드 납입현황 및 FundOverviewPage 자동 반영

### Part 6: 컴포넌트 공유
- [ ] AC-21: `FundDetailPage`와 `FundOperationsPage` 모두 동일한 `CapitalCallDetail` 사용
- [ ] AC-22: `FundOperationsPage`에서 기존 고급 편집 UI(항목 추가/삭제) 그대로 유지

### Part 7: 수시콜 워크플로우
- [ ] AC-23: 수시 출자 요청 등록 시 "수시 출자금 납입 요청" 워크플로우 인스턴스 자동 생성
- [ ] AC-24: 최초 출자 등록 시 "LP 통지 및 보고" 워크플로우 인스턴스 자동 생성
- [ ] AC-25: 워크플로우 인스턴스의 trigger_date가 조합 통지기간 기반으로 자동 계산
- [ ] AC-26: 생성된 워크플로우가 워크플로우 탭에서 확인 가능

### Part 8: 전체 점검
- [ ] AC-27: `npm run build` TypeScript 에러 0건
- [ ] AC-28: 백엔드 `pytest` 전체 통과
- [ ] AC-29: 교차 기능 — 납입 확인 → 조합카드 → 성과지표 연쇄 반영 정상

---

## 구현 주의사항

1. **기존 기능을 깨뜨리지 않는다** — 모든 수정 후 빌드·테스트 필수
2. **파이프라인 뷰는 기존 데이터를 재활용** — 새 API 불필요. `DashboardResponse`의 기존 데이터(`todayTasks`, `thisWeekTasks` 등)를 그대로 사용
3. **`CapitalCallDetail` 확장 시 하위 호환성 유지** — `editable` prop 기본값 `false`로 설정하여 기존 사용처 영향 없음
4. **FundForm LP 입력은 선택사항** — LP를 입력하지 않아도 조합 생성 가능
5. **워크플로우 템플릿 자동 생성은 idempotent** — 이미 존재하면 기존 것 사용, 없으면 생성
6. **console.log, print 디버깅 코드 남기지 않는다**
7. **수시콜 워크플로우 이름:** `"수시 출자금 납입 요청"` 고정
8. **파이프라인 뷰는 반응형** — 모바일에서는 가로 스크롤로 동작
9. **일괄 납입 처리 시 개별 API 호출** — 현재 batch update API가 없으므로 개별 `updateCapitalCallItem` 순차 호출. 추후 batch API 필요 시 Part 8 감사에서 판단
