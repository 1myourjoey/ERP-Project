# Phase 17: UI/UX 개선 — 워크플로우 그룹핑, 대시보드 고도화, 조합카드 개선, 업무 탭 기능 확장

> **Priority:** P1
> **Focus:** 4개 영역(워크플로우·대시보드·조합관리·업무) UX 개선 + 조합 기본정보 필드 추가 + 업무기록 인사이트 엔진

---

## Table of Contents

1. [Part 1 — 워크플로우 템플릿 카테고리 그룹핑](#part-1--워크플로우-템플릿-카테고리-그룹핑)
2. [Part 2 — 대시보드 개선 (3건)](#part-2--대시보드-개선-3건)
3. [Part 3 — 조합 카드 개선](#part-3--조합-카드-개선)
4. [Part 4 — 업무 탭: 체크리스트 기능 확장 (5건)](#part-4--업무-체크리스트-기능-확장-5건)
5. [Part 5 — 업무 탭: 업무기록 인사이트](#part-5--업무기록-인사이트)
6. [Files to create / modify](#files-to-create--modify)
7. [Acceptance Criteria](#acceptance-criteria)
8. [구현 주의사항](#구현-주의사항)

---

## 개요

Phase 17은 실무자 중심의 UI/UX 개선 Phase이다. 새로운 백엔드 테이블을 최소화하고, 기존 데이터를 프론트엔드에서 더 효과적으로 보여주는 데 초점을 맞춘다.

---

## Part 1 — 워크플로우 템플릿 카테고리 그룹핑

> **위치:** `WorkflowsPage.tsx` — `tab === 'templates'` 영역

### 현재 상태

- 워크플로우 템플릿이 **flat list**로 나열됨. 템플릿이 많아지면 원하는 것을 찾기 어려움.
- 이미 `Workflow` 모델에 `category` (String) 컬럼이 존재하고, `WorkflowTemplateInput`에도 `category` 필드가 포함되어 있음.

### 변경 목표

같은 `category`끼리 묶어 아코디언/그룹 형태로 표시. 예: `결성총회`, `투자실행`, `배분`, `일반` 등.

### 구현 방식

```tsx
// WorkflowsPage.tsx — templates 탭 내부, 좌측 목록 영역
// templates 배열을 category 기준으로 그룹핑
const groupedTemplates = useMemo(() => {
  if (!templates) return new Map<string, WorkflowListItem[]>()
  const map = new Map<string, WorkflowListItem[]>()
  for (const t of templates) {
    const cat = t.category || '미분류'
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(t)
  }
  return map
}, [templates])
```

```tsx
// 렌더링 — 카테고리별 아코디언 그룹
{Array.from(groupedTemplates.entries()).map(([category, items]) => (
  <div key={category} className="mb-3">
    <button
      onClick={() => toggleCategory(category)}
      className="w-full flex items-center justify-between text-left px-2 py-1 rounded-lg bg-gray-50 hover:bg-gray-100"
    >
      <span className="text-xs font-semibold text-gray-600">{category}</span>
      <span className="text-[10px] text-gray-400">{items.length}개</span>
    </button>
    {!collapsedCategories.has(category) && (
      <div className="mt-1 space-y-1">
        {items.map((row) => (
          // 기존 TemplateCard 렌더링 동일
        ))}
      </div>
    )}
  </div>
))}
```

### 필요 상태

```tsx
const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

const toggleCategory = (cat: string) => {
  setCollapsedCategories(prev => {
    const next = new Set(prev)
    next.has(cat) ? next.delete(cat) : next.add(cat)
    return next
  })
}
```

> **백엔드 변경 없음.** `Workflow.category` 컬럼이 이미 존재한다.

---

## Part 2 — 대시보드 개선 (3건)

> **위치:** `DashboardPage.tsx`

### 2-A. "빠른 업무 추가" 버튼 제거

#### 현재 상태

진행 중인 워크플로 카드 우측 상단에 `<Plus>` 아이콘 버튼이 hover 시 표시됨 (Line 335):

```tsx
<button onClick={(e) => { e.stopPropagation(); openQuickAdd('today') }}
  className="absolute right-2 top-2 rounded-full bg-white/80 p-1 text-indigo-500 opacity-0 transition-all hover:bg-indigo-100 group-hover:opacity-100"
  title="업무 추가">
  <Plus size={14} />
</button>
```

#### 변경

이 버튼을 **완전히 삭제**한다. 관련 코드:
- Line 335의 `<button>` 요소 전체 삭제
- `group` 클래스는 유지해도 무방 (다른 hover 효과에 영향 없음)

---

### 2-B. 오른쪽 탭 카드 — "더보기" → 스크롤 방식

#### 현재 상태

`fund_summary`, `upcoming_reports`, `missing_documents` 등에서 5개까지만 표시하고 "더보기" 링크로 페이지 이동:

```tsx
{fund_summary.slice(0, 5).map(...)}
{fund_summary.length > 5 && <button onClick={...}>+{fund_summary.length - 5}건 더보기</button>}
```

#### 변경

5개 제한 제거 → 전체 표시 + 스크롤 컨테이너:

```tsx
// 4개 탭 모두 동일 패턴 적용 (funds, notices, reports, documents)
{rightTab === 'funds' && (
  <div className="card-base">
    {!fund_summary.length ? (
      <p className="text-sm text-gray-400">등록된 조합이 없습니다.</p>
    ) : (
      <div className="max-h-[480px] overflow-y-auto space-y-2 pr-1">
        {fund_summary.map((fund: FundSummary) => (
          // 기존 카드 렌더링 동일, .slice(0, 5) 제거
        ))}
      </div>
    )}
  </div>
)}
```

**핵심:** `max-h-[480px] overflow-y-auto` 로 현재 카드 높이 내에서 스크롤. `.slice(0, 5)` 제거, `{length > 5 && ...더보기}` 코드 제거.

**4개 탭 전부 적용:** `rightTab === 'funds'`, `rightTab === 'notices'`, `rightTab === 'reports'`, `rightTab === 'documents'`

---

### 2-C. 상단 StatCard 6개 — 클릭 시 분류된 리스트 표시

#### 현재 상태

상단 6개 `StatCard`에는 숫자만 표시. 클릭 시 `ListPopupModal`이 열리지만, 업무를 **flat list**로만 보여줌.

#### 변경

`ListPopupModal` 내부를 **분류(그룹)된 리스트**로 변경. 업무 효율화를 위한 최적의 분류 기준:

| StatCard | 분류 기준 | 이유 |
|----------|----------|------|
| 오늘 업무 | **카테고리별** (투자실행, LP보고, ...) | 같은 성격의 업무 묶어 처리 |
| 이번 주 | **날짜별** (월~금) | 일정 흐름 파악 |
| 진행 워크플로 | **펀드별** | 어떤 조합 업무인지 구분 |
| 미수집 서류 | **펀드별** | 조합별 서류 현황 파악 |
| 보고 마감 | **마감일 기준** (D-day순) | 긴급도 파악 |
| 오늘 완료 | **카테고리별** | 어떤 분야 업무를 완료했는지 파악 |

#### `ListPopupModal` 내부 렌더링 변경

```tsx
// 예시: 오늘 업무 팝업 — 카테고리별 그룹
{popupSection === 'today' && (() => {
  const grouped = groupByCategory(todayTasks)
  return Array.from(grouped.entries()).map(([category, tasks]) => (
    <div key={category} className="mb-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${categoryBadgeClass(category)}`}>
          {category}
        </span>
        <span className="text-[10px] text-gray-400">{tasks.length}건</span>
      </div>
      <div className="space-y-1">
        {tasks.map(task => (
          <button key={task.id} onClick={() => setSelectedTask(task)}
            className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50">
            <p className="text-sm font-medium text-gray-800">{task.title}</p>
            {task.deadline && <p className="text-xs text-gray-400 mt-0.5">{formatShortDate(task.deadline)}</p>}
          </button>
        ))}
      </div>
    </div>
  ))
})()}
```

```tsx
// 이번 주 업무 팝업 — 날짜별 그룹
{popupSection === 'this_week' && (() => {
  const grouped = new Map<string, Task[]>()
  for (const task of thisWeekTasks) {
    const key = task.deadline || '기한 미지정'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(task)
  }
  // 날짜순 정렬
  const sorted = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b))
  return sorted.map(([date, tasks]) => (
    <div key={date} className="mb-3">
      <p className="text-xs font-semibold text-gray-600 mb-1">
        {date === '기한 미지정' ? date : new Date(date + 'T00:00').toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })}
      </p>
      <div className="space-y-1">
        {tasks.map(task => (
          <button key={task.id} onClick={() => setSelectedTask(task)}
            className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50">
            <p className="text-sm font-medium text-gray-800">{task.title}</p>
          </button>
        ))}
      </div>
    </div>
  ))
})()}
```

```tsx
// 진행 워크플로 팝업 — 펀드별 그룹
{popupSection === 'workflows' && (() => {
  const grouped = new Map<string, ActiveWorkflow[]>()
  for (const wf of active_workflows) {
    const key = wf.fund_name || '미지정'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(wf)
  }
  return Array.from(grouped.entries()).map(([fundName, wfs]) => (
    <div key={fundName} className="mb-3">
      <p className="text-xs font-semibold text-gray-600 mb-1">{fundName}</p>
      <div className="space-y-1">
        {wfs.map(wf => (
          <button key={wf.id} onClick={() => navigate('/workflows', { state: { expandInstanceId: wf.id } })}
            className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50">
            <p className="text-sm font-medium text-gray-800">{wf.name}</p>
            <p className="text-xs text-gray-500">{wf.progress}</p>
          </button>
        ))}
      </div>
    </div>
  ))
})()}
```

```tsx
// 미수집 서류 팝업 — 펀드별 그룹
{popupSection === 'documents' && (() => {
  const grouped = new Map<string, MissingDocument[]>()
  for (const doc of missing_documents) {
    const key = doc.fund_name || '미지정'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(doc)
  }
  return Array.from(grouped.entries()).map(([fundName, docs]) => (
    <div key={fundName} className="mb-3">
      <p className="text-xs font-semibold text-gray-600 mb-1">{fundName} ({docs.length}건)</p>
      <div className="space-y-1">
        {docs.map(doc => (
          <button key={doc.id} onClick={() => navigate(`/investments/${doc.investment_id}`)}
            className="w-full rounded-lg border border-amber-200 bg-amber-50 p-2 text-left hover:bg-amber-100">
            <p className="text-sm font-medium text-amber-900">{doc.document_name}</p>
            <p className="text-xs text-amber-700">{doc.company_name} | 마감 {formatShortDate(doc.due_date)}</p>
          </button>
        ))}
      </div>
    </div>
  ))
})()}
```

```tsx
// 보고 마감 팝업 — D-day 순 (이미 정렬됨, 마감일 헤더만 추가)
{popupSection === 'reports' && (() => {
  const sorted = [...upcoming_reports].sort((a, b) => (a.days_remaining ?? 999) - (b.days_remaining ?? 999))
  return sorted.map(report => {
    const badge = dueBadge(report.days_remaining)
    return (
      <button key={report.id} onClick={() => navigate('/reports', { state: { highlightId: report.id } })}
        className="w-full rounded-lg border border-gray-200 p-2 text-left hover:bg-gray-50">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-gray-800">{report.report_target} | {report.period}</p>
          {badge && <span className={`rounded px-1.5 py-0.5 text-[11px] ${badge.className}`}>{badge.text}</span>}
        </div>
        <p className="mt-0.5 text-xs text-gray-500">{report.fund_name || '조합 공통'} | {labelStatus(report.status)}</p>
      </button>
    )
  })
})()}
```

```tsx
// 오늘 완료 팝업 — 카테고리별 그룹
{popupSection === 'completed' && (() => {
  const grouped = groupByCategory(completedTodayTasks)
  return Array.from(grouped.entries()).map(([category, tasks]) => (
    <div key={category} className="mb-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${categoryBadgeClass(category)}`}>
          {category}
        </span>
        <span className="text-[10px] text-gray-400">{tasks.length}건</span>
      </div>
      <div className="space-y-1">
        {tasks.map(task => (
          <div key={task.id} className="rounded-lg border border-gray-200 p-2">
            <div className="flex items-center justify-between">
              <button onClick={() => setSelectedTask(task)}
                className="truncate text-left text-sm text-gray-500 line-through hover:text-blue-600">{task.title}</button>
              <button onClick={() => undoCompleteMut.mutate(task.id)}
                className="text-xs text-blue-600 hover:underline">되돌리기</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  ))
})()}
```

---

## Part 3 — 조합 카드 개선

> **위치:** `FundsPage.tsx`

### 3-A. "운용 중: 현재날짜" → "결성일" 표시

#### 현재 상태 (Line 41–47)

```tsx
if (fund.status === 'active') {
  const today = new Date()
  const todayText = today.toLocaleDateString('ko-KR')
  const days = fund.formation_date
    ? Math.max(0, Math.floor((today.getTime() - new Date(fund.formation_date).getTime()) / 86400000))
    : null
  return { label: '운용 중', date: `${todayText}${days != null ? ` (${days}일째)` : ''}` }
}
```

#### 변경

```tsx
if (fund.status === 'active') {
  if (fund.formation_date) {
    const fDate = new Date(fund.formation_date).toLocaleDateString('ko-KR')
    const days = Math.max(0, Math.floor((new Date().getTime() - new Date(fund.formation_date).getTime()) / 86400000))
    return { label: '결성일', date: `${fDate} (${days}일째)` }
  }
  return { label: '결성일', date: '미등록' }
}
```

**결과:** `운용 중: 2026. 2. 17. (312일째)` → `결성일: 2025. 4. 10. (312일째)`

---

### 3-B. 약정총액 옆에 납입현황 표시

#### 현재 상태 (Line 209–220)

```tsx
<div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
  {fund.commitment_total != null && (
    <div className="text-gray-500">
      <span className="text-xs">약정총액</span>
      <p className="font-medium text-gray-700">{commitmentFmt.full}</p>
      {commitmentFmt.label && <p className="text-[11px] text-gray-400">{commitmentFmt.label}</p>}
    </div>
  )}
  <div className="text-gray-500">
    <span className="text-xs">투자건수</span>
    <p className="font-medium text-gray-700">{fund.investment_count ?? 0}건</p>
  </div>
</div>
```

#### 변경 — 백엔드에서 `paid_in_total` 추가 반환

**Step 1: 백엔드 (`routers/funds.py`)**

`fetchFunds` API 응답에 `paid_in_total` (LP들의 `paid_in` 합계) 추가:

```python
# 기존 Fund 목록 반환 시 paid_in_total 계산
for fund in funds:
    paid_in_total = db.query(func.coalesce(func.sum(LP.paid_in), 0))\
        .filter(LP.fund_id == fund.id).scalar()
    fund.paid_in_total = paid_in_total
```

**Step 2: 프론트엔드 (`FundsPage.tsx`)**

```tsx
const paidIn = (fund as Fund & { paid_in_total?: number }).paid_in_total ?? 0
const paidInFmt = formatKRWFull(paidIn)
const paidInPercent = fund.commitment_total
  ? Math.round((paidIn / fund.commitment_total) * 100)
  : 0
```

```tsx
<div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
  {fund.commitment_total != null && (
    <div className="text-gray-500">
      <span className="text-xs">약정총액</span>
      <p className="font-medium text-gray-700">{commitmentFmt.full}</p>
      {commitmentFmt.label && <p className="text-[11px] text-gray-400">{commitmentFmt.label}</p>}
    </div>
  )}
  <div className="text-gray-500">
    <span className="text-xs">납입현황</span>
    <p className="font-medium text-gray-700">{paidInFmt.full}</p>
    <p className="text-[11px] text-gray-400">{paidInPercent}%</p>
  </div>
  <div className="text-gray-500">
    <span className="text-xs">투자건수</span>
    <p className="font-medium text-gray-700">{fund.investment_count ?? 0}건</p>
  </div>
</div>
```

**Step 3: API 타입 (`lib/api.ts`)**

`Fund` 타입에 `paid_in_total?: number` 추가.

---

### 3-C. 고유번호증 번호 · 등록성립일 필드 추가

조합 기본정보에 **고유번호증 번호**와 **등록성립일**을 추가한다. 이 2개 필드는 조합결성 워크플로우의 1단계 "고유번호증 발급"과 연결되며, 여러 페이지에 연동된다.

#### 백엔드 변경

**Step 1: Fund 모델 (`backend/models/fund.py`)**

```python
class Fund(Base):
    __tablename__ = "funds"

    # 기존 필드 ...
    registration_number = Column(String, nullable=True)   # 신규: 고유번호증 번호
    registration_date = Column(Date, nullable=True)        # 신규: 등록성립일
```

**Step 2: 스키마 (`backend/schemas/fund.py`)**

```python
# FundCreate, FundUpdate, FundResponse 모두에 추가
registration_number: Optional[str] = None
registration_date: Optional[date] = None

# FundListItem에도 추가 (조합카드에 표시하므로)
registration_number: Optional[str] = None
registration_date: Optional[date] = None
```

**Step 3: DB 마이그레이션**

```
alembic revision --autogenerate -m "add registration_number and registration_date to funds"
alembic upgrade head
```

#### 프론트엔드 변경

**Step 4: 타입 (`frontend/src/lib/api.ts`)**

```tsx
export interface Fund {
  // 기존 필드 ...
  registration_number: string | null   // 신규
  registration_date: string | null     // 신규
}

export interface FundInput {
  // 기존 필드 ...
  registration_number?: string | null
  registration_date?: string | null
}
```

**Step 5: FundsPage 조합카드 (`frontend/src/pages/FundsPage.tsx`)**

카드 서브타이틀 영역(`fund.type | dateInfo.label: dateInfo.date`)에 고유번호 추가:

```tsx
<h4 className="font-semibold text-gray-900">{fund.name}</h4>
<p className="mt-0.5 text-xs text-gray-500">
  {fund.type} | {dateInfo.label}: {dateInfo.date}
</p>
{fund.registration_number && (
  <p className="text-[11px] text-gray-400 mt-0.5">
    고유번호: {fund.registration_number}
  </p>
)}
```

카드 하단 정보 그리드에 등록성립일 추가:

```tsx
<div className="mt-3 grid grid-cols-4 gap-x-3 gap-y-2 text-sm">  {/* 3→4열 */}
  {/* 약정총액 */}
  {/* 납입현황 */}
  {/* 투자건수 */}
  <div className="text-gray-500">
    <span className="text-xs">등록성립일</span>
    <p className="font-medium text-gray-700">
      {fund.registration_date
        ? new Date(fund.registration_date).toLocaleDateString('ko-KR')
        : '-'}
    </p>
  </div>
</div>
```

**Step 6: FundForm 입력 필드 추가 (`FundsPage.tsx` 또는 `FundDetailPage.tsx`)**

조합 생성/수정 폼에 2개 필드 추가:

```tsx
<input
  value={form.registration_number || ''}
  onChange={e => setForm(prev => ({ ...prev, registration_number: e.target.value }))}
  placeholder="고유번호증 번호"
  className="px-3 py-2 text-sm border rounded-lg"
/>
<input
  type="date"
  value={form.registration_date || ''}
  onChange={e => setForm(prev => ({ ...prev, registration_date: e.target.value || null }))}
  className="px-3 py-2 text-sm border rounded-lg"
  placeholder="등록성립일"
/>
```

**Step 7: FundDetailPage 기본정보 영역 (`frontend/src/pages/FundDetailPage.tsx`)**

조합 상세 페이지의 기본정보 그리드에 2개 필드 추가 표시:

```tsx
<div className="p-2 bg-gray-50 rounded">고유번호: {fundDetail.registration_number || '-'}</div>
<div className="p-2 bg-gray-50 rounded">등록성립일: {fundDetail.registration_date || '-'}</div>
```

#### 연계 페이지 연동

**FundOverviewPage** (`frontend/src/pages/FundOverviewPage.tsx`):
- Line 126의 "등록(성립)일" 컬럼이 현재 `formation_date`를 표시 중. → `registration_date`가 있으면 우선 표시, 없으면 `formation_date` fallback:

```tsx
<td className="px-3 py-2 text-gray-600">
  {fund.registration_date || fund.formation_date || '-'}
</td>
```

**FundOverviewPage 백엔드 API** (`backend/routers/fund_overview.py`
또는 해당 라우터):
- `FundOverviewItem` 응답에 `registration_date` 필드 추가.

**문서 템플릿** (Phase 14/16 연동):
- 템플릿 변수로 `{{registration_number}}`, `{{registration_date}}` 사용 가능하도록 문서 생성 시 컨텍스트에 전달.

> **백엔드 변경:** Fund 모델 2개 컬럼 추가, 스키마 4개 수정, FundOverview API 수정, Alembic 마이그레이션 1건.

---

## Part 4 — 업무: 체크리스트 기능 확장 (5건)

> **위치:** `ChecklistsPage.tsx`

### 4-A. 검색창 구현

체크리스트 목록 상단에 검색 input. 제목 기반 필터링 후 클릭 시 해당 체크리스트로 이동(선택).

```tsx
const [searchQuery, setSearchQuery] = useState('')

const filteredChecklists = useMemo(() => {
  if (!checklists) return []
  if (!searchQuery.trim()) return checklists
  const q = searchQuery.toLowerCase()
  return checklists.filter(cl => cl.name.toLowerCase().includes(q))
}, [checklists, searchQuery])
```

```tsx
<div className="mb-3">
  <input
    value={searchQuery}
    onChange={e => setSearchQuery(e.target.value)}
    placeholder="체크리스트 검색..."
    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
  />
</div>

{filteredChecklists.map((cl) => (
  <button
    key={cl.id}
    onClick={() => { setSelectedId(cl.id); setEditingChecklist(false) }}
    className={`w-full text-left p-3 border rounded ${selectedId === cl.id ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
  >
    <p className="text-sm font-medium text-gray-800">{cl.name}</p>
    <p className="text-xs text-gray-500">{cl.category || '-'} | 완료 {cl.checked_items}/{cl.total_items}</p>
  </button>
))}
```

---

### 4-B. 체크리스트 → 업무(Task) 추가 연동

체크리스트 상세 화면에 **"업무에 추가"** 버튼을 배치. 클릭 시 현재 체크리스트의 미완료 항목을 기반으로 새 Task를 생성.

```tsx
// checklist 상세 영역 상단 버튼 그룹에 추가
<button
  className="secondary-btn inline-flex items-center gap-1"
  onClick={() => {
    const unchecked = checklist.items?.filter((item: ChecklistItem) => !item.checked) || []
    if (!unchecked.length) { addToast('info', '모든 항목이 완료되었습니다.'); return }
    // 미완료 항목을 본문으로 하여 Task 생성
    const body = unchecked.map((item: ChecklistItem) => `☐ ${item.name}`).join('\n')
    createTask({
      title: `[체크리스트] ${checklist.name}`,
      category: checklist.category || '서류관리',
      description: body,
      deadline: null,
      estimated_time: null,
      fund_id: null,
      investment_id: checklist.investment_id || null,
    }).then(() => {
      addToast('success', '업무가 생성되었습니다.')
      queryClient.invalidateQueries({ queryKey: ['taskBoard'] })
    })
  }}
>
  업무에 추가
</button>
```

> **필요:** `lib/api.ts`에서 `createTask` import 추가.

---

### 4-C. 체크리스트 → 워크플로우 이동

체크리스트 상세 화면에 **"워크플로우 보기"** 버튼. 연결된 investment가 있으면 해당 투자건의 워크플로우로 이동.

```tsx
// 연결된 investment_id가 있을 때만 표시
{checklist.investment_id && (
  <button
    className="secondary-btn"
    onClick={() => navigate('/workflows')}
  >
    워크플로우 →
  </button>
)}
```

---

### 4-D. 카테고리 드롭다운 + 직접 입력

#### 현재 상태

카테고리는 `<input>` 텍스트 필드로, 사용자가 매번 직접 입력해야 함.

#### 변경

기본 카테고리 옵션 드롭다운 + "직접 입력" 옵션:

```tsx
const CHECKLIST_CATEGORY_OPTIONS = ['투자점검', '결성준비', '연말결산', '감사준비', '규약관리', '일반']

// ChecklistForm 내부
const [customCategory, setCustomCategory] = useState(false)

{customCategory ? (
  <div className="flex gap-1">
    <input
      value={category}
      onChange={e => setCategory(e.target.value)}
      placeholder="카테고리 직접 입력"
      className="flex-1 px-2 py-1 text-sm border rounded"
    />
    <button onClick={() => setCustomCategory(false)} className="text-xs text-gray-500 hover:text-gray-700">
      목록
    </button>
  </div>
) : (
  <div className="flex gap-1">
    <select
      value={category}
      onChange={e => {
        if (e.target.value === '__custom__') { setCustomCategory(true); setCategory('') }
        else setCategory(e.target.value)
      }}
      className="flex-1 px-2 py-1 text-sm border rounded"
    >
      <option value="">카테고리 선택</option>
      {CHECKLIST_CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
      <option value="__custom__">✏️ 직접 입력</option>
    </select>
  </div>
)}
```

---

### 4-E. 검색 결과 클릭 시 체크리스트 포커스 이동

검색 결과 항목 클릭 시 `setSelectedId(cl.id)`를 호출하여 해당 체크리스트를 우측 상세 패널에 표시. 이미 Part 4-A에서 구현됨 (기존 `onClick` 핸들러 재활용).

추가: 선택된 체크리스트가 스크롤 영역 밖이면 `scrollIntoView` 호출.

```tsx
// 체크리스트 목록 버튼에 ref 연결
useEffect(() => {
  if (selectedId) {
    const el = document.getElementById(`checklist-${selectedId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
}, [selectedId])
```

---

## Part 5 — 업무기록 인사이트

> **위치:** `WorkLogsPage.tsx`
> **목표:** 업무기록 데이터를 분석하여 실무자가 **업무 패턴, 시간 관리, 개선 방향**에 대한 인사이트를 얻을 수 있게 한다.

### 인사이트 설계 (MECE 프레임워크)

업무기록에서 추출 가능한 인사이트를 **MECE**하게 4개 축으로 설계:

```
업무기록 인사이트
├── 1. 시간 분석 (Time)
│   ├── 카테고리별 총 소요 시간
│   ├── 예상 vs 실제 시간 차이 (정확도)
│   └── 일별·주별 업무량 추이
├── 2. 분포 분석 (Distribution)
│   ├── 카테고리별 업무 건수 비중 (파이 차트 데이터)
│   ├── 완료 vs 진행중 비율
│   └── 요일별 업무 집중도
├── 3. 교훈·패턴 분석 (Lessons)
│   ├── 가장 많이 기록된 교훈 키워드
│   ├── 후속 조치 완료율 (target_date 대비)
│   └── 반복 등장하는 업무 패턴
└── 4. 효율성 분석 (Efficiency)
    ├── 시간 추정 정확도 (과소/과대 추정 경향)
    ├── 카테고리별 평균 처리 시간
    └── 주간 업무 생산성 트렌드
```

### 구현 방식 — 백엔드 인사이트 API

```python
# backend/routers/worklogs.py — 신규 엔드포인트 추가

@router.get("/api/worklogs/insights")
def get_worklog_insights(
    period: str = Query("month", enum=["week", "month", "quarter"]),
    db: Session = Depends(get_db),
):
    """업무기록 인사이트: 기간 선택 가능 (주/월/분기)"""
    # 기간 계산
    today = date.today()
    if period == "week":
        start_date = today - timedelta(days=7)
    elif period == "month":
        start_date = today - timedelta(days=30)
    else:
        start_date = today - timedelta(days=90)

    logs = db.query(WorkLog).filter(WorkLog.date >= start_date).all()

    # 1. 시간 분석
    time_by_category = {}
    time_accuracy = {"over": 0, "under": 0, "accurate": 0}
    daily_counts = {}

    for log in logs:
        cat = log.category
        # 카테고리별 시간 합산
        actual_minutes = parse_time_to_minutes(log.actual_time)
        estimated_minutes = parse_time_to_minutes(log.estimated_time)
        time_by_category[cat] = time_by_category.get(cat, 0) + actual_minutes

        # 시간 정확도
        if estimated_minutes and actual_minutes:
            diff = actual_minutes - estimated_minutes
            if diff > 10: time_accuracy["over"] += 1
            elif diff < -10: time_accuracy["under"] += 1
            else: time_accuracy["accurate"] += 1

        # 일별 건수
        day_key = str(log.date)
        daily_counts[day_key] = daily_counts.get(day_key, 0) + 1

    # 2. 분포 분석
    category_counts = {}
    status_counts = {"completed": 0, "in_progress": 0}
    weekday_counts = {i: 0 for i in range(7)}  # 0=Mon

    for log in logs:
        cat = log.category
        category_counts[cat] = category_counts.get(cat, 0) + 1
        if log.status in ("completed", "완료"):
            status_counts["completed"] += 1
        else:
            status_counts["in_progress"] += 1
        if log.date:
            weekday_counts[log.date.weekday()] += 1

    # 3. 교훈 분석
    all_lessons = []
    follow_up_total = 0
    follow_up_completed = 0
    for log in logs:
        for lesson in log.lessons:
            all_lessons.append(lesson.content)
        for fu in log.follow_ups:
            follow_up_total += 1
            if fu.target_date and fu.target_date <= today:
                follow_up_completed += 1

    # 4. 효율성
    category_avg_time = {}
    for cat, total_min in time_by_category.items():
        cnt = category_counts.get(cat, 1)
        category_avg_time[cat] = round(total_min / cnt)

    return {
        "period": period,
        "total_logs": len(logs),
        "time_by_category": time_by_category,        # {카테고리: 분}
        "time_accuracy": time_accuracy,                # {over, under, accurate}
        "daily_counts": daily_counts,                  # {날짜: 건수}
        "category_counts": category_counts,            # {카테고리: 건수}
        "status_counts": status_counts,                # {completed, in_progress}
        "weekday_counts": weekday_counts,              # {0~6: 건수}
        "recent_lessons": all_lessons[-10:],           # 최근 교훈 10개
        "follow_up_rate": {
            "total": follow_up_total,
            "completed": follow_up_completed,
        },
        "category_avg_time": category_avg_time,        # {카테고리: 평균분}
    }


def parse_time_to_minutes(time_str: str | None) -> int:
    """'1h 30m', '2h', '45m' 등을 분 단위로 변환"""
    if not time_str:
        return 0
    import re
    hours = re.findall(r'(\d+)\s*h', time_str)
    minutes = re.findall(r'(\d+)\s*m', time_str)
    total = 0
    if hours: total += int(hours[0]) * 60
    if minutes: total += int(minutes[0])
    return total
```

### 프론트엔드 — 인사이트 대시보드

`WorkLogsPage.tsx`에 "인사이트" 탭 추가:

```tsx
// WorkLogsPage 최상단에 탭 추가
const [activeTab, setActiveTab] = useState<'logs' | 'insights'>('logs')
const [insightPeriod, setInsightPeriod] = useState<'week' | 'month' | 'quarter'>('month')

const { data: insights } = useQuery({
  queryKey: ['worklogInsights', insightPeriod],
  queryFn: () => fetchWorkLogInsights(insightPeriod),
  enabled: activeTab === 'insights',
})
```

```tsx
// 인사이트 카드 레이아웃
{activeTab === 'insights' && insights && (
  <div className="space-y-4">
    {/* 기간 선택 */}
    <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
      {([['week', '최근 1주'], ['month', '최근 1달'], ['quarter', '최근 3달']] as const).map(([key, label]) => (
        <button key={key} onClick={() => setInsightPeriod(key)}
          className={`rounded-md px-3 py-1.5 text-xs ${insightPeriod === key ? 'bg-white font-medium text-gray-800 shadow' : 'text-gray-500'}`}>
          {label}
        </button>
      ))}
    </div>

    {/* 요약 카드 */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="card-base p-3">
        <p className="text-xs text-gray-500">총 기록</p>
        <p className="text-2xl font-semibold text-gray-900">{insights.total_logs}건</p>
      </div>
      <div className="card-base p-3">
        <p className="text-xs text-gray-500">시간 추정 정확도</p>
        <p className="text-2xl font-semibold text-emerald-600">
          {insights.total_logs ? Math.round((insights.time_accuracy.accurate / insights.total_logs) * 100) : 0}%
        </p>
      </div>
      <div className="card-base p-3">
        <p className="text-xs text-gray-500">후속 조치 이행률</p>
        <p className="text-2xl font-semibold text-blue-600">
          {insights.follow_up_rate.total ? Math.round((insights.follow_up_rate.completed / insights.follow_up_rate.total) * 100) : 0}%
        </p>
      </div>
      <div className="card-base p-3">
        <p className="text-xs text-gray-500">완료율</p>
        <p className="text-2xl font-semibold text-gray-900">
          {insights.total_logs ? Math.round((insights.status_counts.completed / insights.total_logs) * 100) : 0}%
        </p>
      </div>
    </div>

    {/* 카테고리별 업무 분포 */}
    <div className="card-base p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">카테고리별 업무 분포</h3>
      <div className="space-y-2">
        {Object.entries(insights.category_counts)
          .sort(([,a], [,b]) => (b as number) - (a as number))
          .map(([cat, count]) => {
            const percent = Math.round(((count as number) / insights.total_logs) * 100)
            const avgTime = insights.category_avg_time[cat] || 0
            return (
              <div key={cat} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-20 truncate">{cat}</span>
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${percent}%` }} />
                </div>
                <span className="text-xs text-gray-500 w-12 text-right">{count as number}건</span>
                <span className="text-xs text-gray-400 w-16 text-right">평균 {avgTime}분</span>
              </div>
            )
          })
        }
      </div>
    </div>

    {/* 요일별 업무 집중도 */}
    <div className="card-base p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">요일별 업무 집중도</h3>
      <div className="flex gap-2 items-end h-24">
        {['월', '화', '수', '목', '금', '토', '일'].map((day, i) => {
          const count = insights.weekday_counts[i] || 0
          const maxCount = Math.max(...Object.values(insights.weekday_counts as Record<string, number>), 1)
          const height = Math.max(8, (count / maxCount) * 100)
          return (
            <div key={day} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-gray-500">{count}</span>
              <div className="w-full bg-blue-400 rounded-t" style={{ height: `${height}%` }} />
              <span className="text-[10px] text-gray-500">{day}</span>
            </div>
          )
        })}
      </div>
    </div>

    {/* 시간 추정 분석 */}
    <div className="card-base p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">시간 추정 분석</h3>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-lg font-semibold text-red-500">{insights.time_accuracy.over}</p>
          <p className="text-xs text-gray-500">과소 추정 (실제 > 예상)</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-emerald-500">{insights.time_accuracy.accurate}</p>
          <p className="text-xs text-gray-500">정확</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-amber-500">{insights.time_accuracy.under}</p>
          <p className="text-xs text-gray-500">과대 추정 (실제 < 예상)</p>
        </div>
      </div>
    </div>

    {/* 최근 교훈 */}
    {insights.recent_lessons?.length > 0 && (
      <div className="card-base p-4">
        <h3 className="text-sm font-semibold text-amber-700 mb-2">최근 교훈</h3>
        <ul className="space-y-1">
          {insights.recent_lessons.map((lesson: string, i: number) => (
            <li key={i} className="text-xs text-amber-700 bg-amber-50 px-2 py-1.5 rounded">{lesson}</li>
          ))}
        </ul>
      </div>
    )}
  </div>
)}
```

### API 타입 추가 (`lib/api.ts`)

```typescript
export interface WorkLogInsights {
  period: string
  total_logs: number
  time_by_category: Record<string, number>
  time_accuracy: { over: number; under: number; accurate: number }
  daily_counts: Record<string, number>
  category_counts: Record<string, number>
  status_counts: { completed: number; in_progress: number }
  weekday_counts: Record<number, number>
  recent_lessons: string[]
  follow_up_rate: { total: number; completed: number }
  category_avg_time: Record<string, number>
}

export const fetchWorkLogInsights = (period: string = 'month'): Promise<WorkLogInsights> =>
  api.get('/worklogs/insights', { params: { period } }).then(r => r.data)
```

---

## Files to create / modify

| # | Type | File | Changes |
|---|------|------|---------| 
| 1 | **[MODIFY]** | `frontend/src/pages/WorkflowsPage.tsx` | 템플릿 목록을 category별 아코디언 그룹으로 변경 |
| 2 | **[MODIFY]** | `frontend/src/pages/DashboardPage.tsx` | (a) 빠른업무추가 버튼 삭제, (b) 오른쪽 탭 스크롤 변경, (c) StatCard 팝업 분류화 |
| 3 | **[MODIFY]** | `frontend/src/pages/FundsPage.tsx` | (a) 결성일 표시, (b) 납입현황 추가, (c) 고유번호·등록성립일 카드 표시, (d) FundForm에 2개 입력필드 추가 |
| 4 | **[MODIFY]** | `frontend/src/pages/FundDetailPage.tsx` | 기본정보 영역에 고유번호·등록성립일 표시, 수정 폼에 2개 입력필드 추가 |
| 5 | **[MODIFY]** | `frontend/src/pages/FundOverviewPage.tsx` | "등록(성립)일" 컬럼에 `registration_date` 우선 표시 |
| 6 | **[MODIFY]** | `frontend/src/pages/ChecklistsPage.tsx` | (a) 검색창, (b) 업무 추가 연동, (c) 워크플로우 이동, (d) 카테고리 드롭다운, (e) 스크롤 포커스 |
| 7 | **[MODIFY]** | `frontend/src/pages/WorkLogsPage.tsx` | 인사이트 탭 + 대시보드 UI |
| 8 | **[MODIFY]** | `frontend/src/lib/api.ts` | `fetchWorkLogInsights`, `WorkLogInsights` 타입 추가. `Fund`/`FundInput` 타입에 `registration_number`, `registration_date`, `paid_in_total` 추가 |
| 9 | **[MODIFY]** | `backend/models/fund.py` | Fund 모델에 `registration_number`, `registration_date` 컬럼 추가 |
| 10 | **[MODIFY]** | `backend/schemas/fund.py` | FundCreate/Update/Response/ListItem 스키마에 2개 필드 추가 |
| 11 | **[MODIFY]** | `backend/routers/funds.py` | Fund 목록 응답에 `paid_in_total` 계산 + `registration_number`/`registration_date` 반환 |
| 12 | **[MODIFY]** | `backend/routers/worklogs.py` | `GET /api/worklogs/insights` 엔드포인트 추가 |
| 13 | **[MODIFY]** | `backend/routers/fund_overview.py` (또는 해당 라우터) | FundOverviewItem에 `registration_date` 필드 추가 |
| 14 | **[NEW]** | Alembic migration | `registration_number`, `registration_date` 컬럼 추가 |

---

## Acceptance Criteria

### Part 1: 워크플로우 템플릿 그룹핑
- [ ] AC-01: 템플릿 목록이 `category` 별로 그룹화되어 표시
- [ ] AC-02: 각 그룹은 아코디언 형태로 접기/펼치기 가능
- [ ] AC-03: `category`가 없는 템플릿은 "미분류" 그룹에 표시

### Part 2: 대시보드 개선
- [ ] AC-04: 진행 중인 워크플로 카드에서 +(업무추가) 버튼이 보이지 않음
- [ ] AC-05: 오른쪽 4개 탭(조합/통지/보고/서류)에서 5개 초과 시 스크롤되며, "더보기" 링크 없음
- [ ] AC-06: 각 StatCard 클릭 시 분류된 하단 리스트가 팝업으로 표시 (카테고리별/날짜별/펀드별)

### Part 3: 조합 카드 개선
- [ ] AC-07: 운용 중인 조합 카드에 `결성일: YYYY.MM.DD (N일째)` 표시
- [ ] AC-08: 약정총액 옆에 납입현황 (금액 + 퍼센트) 표시
- [ ] AC-08a: 조합 카드에 고유번호증 번호 표시 (registration_number 존재 시)
- [ ] AC-08b: 조합 카드 하단 정보에 등록성립일 표시 (registration_date)
- [ ] AC-08c: FundDetailPage 기본정보에 고유번호·등록성립일 표시
- [ ] AC-08d: FundOverviewPage "등록(성립)일" 칸에 registration_date 우선 표시 (fallback: formation_date)
- [ ] AC-08e: 조합 생성/수정 폼에 고유번호·등록성립일 입력 필드 존재
- [ ] AC-08f: Fund 모델에 registration_number, registration_date 컬럼 추가 + 마이그레이션 성공

### Part 4: 체크리스트 기능
- [ ] AC-09: 체크리스트 목록 상단에 검색 input 존재하며, 제목 기반 필터링 동작
- [ ] AC-10: 검색 결과 클릭 시 해당 체크리스트 상세로 스크롤 이동
- [ ] AC-11: 체크리스트 상세에서 "업무에 추가" 버튼 클릭 시 Task 생성
- [ ] AC-12: 연결된 투자건이 있을 때 "워크플로우 →" 버튼 표시 및 이동
- [ ] AC-13: 카테고리 입력이 드롭다운 형식이며, "직접 입력" 옵션 선택 시 텍스트 입력으로 전환

### Part 5: 업무기록 인사이트
- [ ] AC-14: WorkLogsPage에 "기록" / "인사이트" 탭 전환 UI
- [ ] AC-15: 기간 선택 (1주/1달/3달) 가능
- [ ] AC-16: 인사이트 대시보드에 4개 요약 카드 (총 기록, 시간 정확도, 후속조치 이행률, 완료율)
- [ ] AC-17: 카테고리별 업무 분포 바 차트 표시
- [ ] AC-18: 요일별 업무 집중도 차트 표시
- [ ] AC-19: 시간 추정 분석 (과소/정확/과대) 표시
- [ ] AC-20: 최근 교훈 목록 표시

### 일반
- [ ] AC-21: 프론트엔드 빌드 성공
- [ ] AC-22: Phase 15 회귀 테스트 전체 통과

---

## 구현 주의사항

1. **백엔드 변경:** Part 1, 2, 4-A~E는 프론트엔드만 변경. Part 3-B(paid_in_total), Part 3-C(고유번호·등록성립일), Part 5(인사이트)는 백엔드 수정 필요.
2. **기존 CSS 클래스 재활용:** `card-base`, `primary-btn`, `secondary-btn`, `page-container`, `page-header`, `page-title` 등 기존 CSS 클래스를 일관되게 사용.
3. **Type Import:** `lib/api.ts`에 새로운 타입을 추가할 때 기존 export 패턴(`export interface ...`, `export const ...`)을 따름.
4. **에러 처리:** insights API 호출 실패 시 "인사이트를 불러오지 못했습니다." 안내 메시지 표시.
5. **반응형:** 인사이트 카드는 `grid-cols-2 md:grid-cols-4` 등으로 모바일 대응.
6. **`parse_time_to_minutes`:** `1h 30m`, `2h`, `45m`, `1시간 30분` 등 다양한 형식 파싱. 파싱 불가 시 0 반환.
7. **`groupByCategory` 재활용:** `DashboardPage.tsx`에 이미 있는 `groupByCategory` 함수를 그대로 사용.
8. **고유번호·등록성립일 하위호환:** `registration_number`, `registration_date` 모두 `nullable=True`이므로 기존 데이터 영향 없음.
9. **FundOverviewPage 등록(성립)일 연동:** `registration_date`가 있으면 우선 표시, 없으면 `formation_date`로 fallback. FundOverviewItem 타입에 `registration_date` 필드 추가 필요.
10. **문서 템플릿 연동:** 문서 생성 시 컨텍스트에 `registration_number`, `registration_date` 필드 전달하여 `{{registration_number}}`, `{{registration_date}}` 변수 사용 가능.

---

**Last updated:** 2026-02-17
