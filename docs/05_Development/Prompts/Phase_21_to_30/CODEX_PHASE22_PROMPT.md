# Phase 22: 입력 필드 레이블 · 파이프라인 정렬 · 워크플로 카드 · LP+출자 병합

> **Priority:** P0

---

## Table of Contents

1. [Part 1 — 모든 입력 필드에 레이블 표시](#part-1)
2. [Part 2 — 파이프라인 가운데 정렬 및 좌우 마진 밸런스](#part-2)
3. [Part 3 — 워크플로 카드 크기 축소 (4건 짤림 없이)](#part-3)
4. [Part 4 — LP관리 + 출자 병합](#part-4)
5. [Files to create / modify](#files-to-create--modify)
6. [Acceptance Criteria](#acceptance-criteria)

---

## 현재 상태 분석

### 입력 필드
- 전체 프론트엔드에서 `placeholder=`만 사용하는 `<input>` 200건+
- 대부분 `<label>` 없이 placeholder만으로 필드 용도 설명
- 문제: 입력 시작하면 placeholder 사라져 어떤 필드인지 인식 불가

### 파이프라인 레이아웃 (TaskPipelineView.tsx)
- 5-stage 컬럼 flex 레이아웃, `page-container` 내 렌더링
- 좌우 마진 없이 컨테이너 전체 폭 사용 → 컨텐츠가 가장자리에 붙어 보임

### 워크플로 카드 (DashboardPage.tsx L687-706)
- `max-h-[190px]` 컨테이너, 2열 그리드
- 카드: `p-3`, 제목+조합+다음단계+프로그레스바 → 카드 1개 높이 ~95px
- 2행(4건) = ~198px > 190px → **4건째가 잘림**

### LP관리 + 출자 구조 (FundOperationsPage.tsx)
- **LP관리** (L622): LP 추가/수정/삭제, LP 양수양도 이력, commitment/paid_in 필드
- **출자** (L769): CapitalCall 생성 → LP별 출자 항목(CapitalCallItem) 관리
- **관계:** LP의 `commitment`(약정액)과 `paid_in`(납입액)은 출자(CapitalCall) 데이터와 직결
- 출자 등록 시 LP를 선택하여 항목 추가 → LP 데이터 참조 필수
- 현재: LP관리와 출자가 별도 Section → 같은 맥락의 데이터를 분리해서 보게 됨

---

## Part 1 — 모든 입력 필드에 레이블 표시

### 1-A. 레이블 패턴 정의

모든 사용자 입력 필드에 `<label>` 태그로 필드 용도를 명시적으로 표시:

```tsx
// 변경 전 (placeholder만):
<input 
  value={form.name} 
  onChange={...} 
  placeholder="회사명" 
  className="..." 
/>

// 변경 후 (label + placeholder):
<div>
  <label className="mb-1 block text-xs font-medium text-gray-600">회사명</label>
  <input 
    value={form.name} 
    onChange={...} 
    placeholder="예: 주식회사 OOO" 
    className="..." 
  />
</div>
```

### 1-B. 인라인 레이블 패턴 (좁은 공간용)

그리드 내 좁은 칸이나 인라인 폼에서는 floating label 또는 상단 축약 레이블:

```tsx
// 좁은 그리드 칸 (예: 3열 이상):
<div className="relative">
  <label className="absolute -top-2 left-2 bg-white px-1 text-[10px] text-gray-500">금액</label>
  <input type="number" ... className="rounded border px-2 pt-3 pb-1 text-sm" />
</div>
```

### 1-C. 적용 대상 페이지 전체 목록

| 페이지 | 파일 | 주요 입력 필드 | 예상 수정 건수 |
|--------|------|--------------|-------------|
| 업무보드 | TaskBoardPage.tsx | 작업 제목, AddTaskForm 전체 필드, EditTaskModal | ~15건 |
| 투자관리 | InvestmentsPage.tsx | 회사명, 사업자번호, 법인등록번호, 대표자, 담당, 업종, 주소, 담당자 등 | ~12건 |
| 투자상세 | InvestmentDetailPage.tsx | 투자 정보 수정 폼 | ~8건 |
| 워크플로우 | WorkflowsPage.tsx | 템플릿 이름/카테고리/기간, 단계 이름/시점/오프셋, 인스턴스 이름/메모 | ~15건 |
| 조합운영 | FundOperationsPage.tsx | LP 폼, CapitalCall 폼, Distribution 폼, Assembly 폼 | ~20건 |
| 조합상세 | FundDetailPage.tsx | 조합 정보 수정 폼 | ~10건 |
| 보고 | ReportsPage.tsx | 기간, 메모, 제출상태 | ~5건 |
| 사업보고 | BizReportsPage.tsx | 보고 기간, 상태 | ~5건 |
| 밸류에이션 | ValuationsPage.tsx | 평가주체, 투자유형, 평가금액, 변동율 등 | ~8건 |
| 거래내역 | TransactionsPage.tsx | 금액, 주식수, 실현손익, 비고 | ~6건 |
| 결산 | AccountingPage.tsx | 회계 관련 입력 | ~5건 |
| 서류 | DocumentsPage.tsx | 서류명, 상태 | ~4건 |
| 체크리스트 | ChecklistsPage.tsx | 항목명 | ~3건 |
| 업무일지 | WorkLogsPage.tsx | 제목, 내용, 예상/실제/차이 시간 | ~5건 |
| 엑시트 | ExitsPage.tsx | 엑시트 정보 입력 | ~5건 |
| 캘린더 | CalendarPage.tsx | 이벤트 제목, 시간, 설명 | ~6건 |
| 조합관리 | FundsPage.tsx | 조합 생성폼 | ~8건 |
| 텔플릿관리 | TemplateManagementPage.tsx | 텀플릿 정보 | ~5건 |
| 대시보드 | DashboardPage.tsx | 빠른추가 모달 | ~5건 |
| 검색 | SearchModal.tsx | 검색어 | ~1건 |

**총 예상: ~150건+**

### 1-D. 공통 InputField 컴포넌트 (선택)

반복 코드 최소화를 위해 공통 컴포넌트 도입 검토:

```tsx
// [NEW] frontend/src/components/InputField.tsx
interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  compact?: boolean  // 좁은 공간용 floating label
}

export function InputField({ label, compact, className, ...props }: InputFieldProps) {
  if (compact) {
    return (
      <div className="relative">
        <label className="absolute -top-2 left-2 bg-white px-1 text-[10px] text-gray-500">{label}</label>
        <input {...props} className={`rounded border px-2 pt-3 pb-1 text-sm ${className || ''}`} />
      </div>
    )
  }
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <input {...props} className={`rounded border px-2 py-1.5 text-sm ${className || ''}`} />
    </div>
  )
}
```

> **판단:** 공통 컴포넌트 도입 시 기존 코드 전면 리팩터링 발생. **Phase 22에서는 `<label>` 추가만 진행, 공통 컴포넌트는 선택사항**으로 둔다. 다만 신규로 작성하는 폼에서는 InputField 사용 권장.

### 1-E. select, textarea에도 동일 적용

```tsx
// select:
<div>
  <label className="mb-1 block text-xs font-medium text-gray-600">출자 유형</label>
  <select className="rounded border px-2 py-1.5 text-sm">...</select>
</div>

// textarea:
<div>
  <label className="mb-1 block text-xs font-medium text-gray-600">메모</label>
  <textarea className="rounded border px-2 py-1.5 text-sm" placeholder="선택 사항" />
</div>
```

---

## Part 2 — 파이프라인 가운데 정렬 및 좌우 마진 밸런스

### 2-A. DashboardPage 파이프라인 컨테이너

현재 `page-container` 내에서 `TaskPipelineView`가 렌더링되며, 좌우 마진이 불균형.

**변경:** 파이프라인 영역에 가운데 정렬 + 적절한 좌우 패딩:

```tsx
// DashboardPage.tsx — 파이프라인 렌더링 부분
{dashboardView === 'pipeline' && (
  <div className="mx-auto w-full max-w-[1400px] px-4">
    <TaskPipelineView
      ...
      fullScreen
    />
  </div>
)}
```

### 2-B. TaskPipelineView 내부 정렬

```tsx
// TaskPipelineView.tsx — 전체 컨테이너 수정

// 변경 전 (추정):
<div className="flex gap-2 ...">
  {columns...}
</div>

// 변경 후:
<div className="mx-auto flex w-full max-w-[1400px] gap-3 px-2">
  {columns...}
</div>
```

### 2-C. 컬럼 간 간격 및 시각적 균형

```
┌─────────────────────── 화면 전체 ──────────────────────┐
│ ← 마진 →┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐← 마진→   │
│          │대기│ │오늘│ │주간│ │예정│ │완료│            │
│          └────┘ └────┘ └────┘ └────┘ └────┘            │
└────────────────────────────────────────────────────────┘
```

- `max-w-[1400px]` + `mx-auto` → 큰 모니터에서도 중앙 정렬
- `px-4` → 좌우 16px 최소 마진
- 컬럼 간 `gap-3` (12px) → 기존 `gap-2` 대비 여유로운 간격

---

## Part 3 — 워크플로 카드 크기 축소 (4건 짤림 없이)

### 3-A. 현재 문제

```
DashboardPage.tsx L687: max-h-[190px] 컨테이너
카드 L692: p-3, 내부에:
  - 제목 + 진행률 (1줄)
  - 조합 | 회사 (1줄)
  - 다음 단계 (조건부 1줄)
  - 프로그레스바 (mt-2 h-1.5)
카드 높이 ≈ 90~95px → 2행+gap → ~198px > 190px → 하단 잘림
```

### 3-B. 카드 크기 축소

```tsx
// 변경 전 L692:
<div key={wf.id} className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-left hover:bg-indigo-100">

// 변경 후:
<div key={wf.id} className="rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-left hover:bg-indigo-100">
```

### 3-C. 내부 요소 컴팩트화

```tsx
// 변경 전 (L694-701):
<div className="flex items-center justify-between gap-2">
  <p className="text-sm font-medium text-indigo-800">{wf.name}</p>
  <span className="text-xs text-indigo-600">{wf.progress}</span>
</div>
<p className="mt-1 text-xs text-indigo-600">{wf.fund_name || '-'} | {wf.company_name || '-'}</p>
{wf.next_step && <p className="mt-1 text-xs text-indigo-700">다음: {wf.next_step} ...</p>}
<div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-indigo-200/60">

// 변경 후:
<div className="flex items-center justify-between gap-1">
  <p className="truncate text-xs font-medium text-indigo-800">{wf.name}</p>
  <span className="shrink-0 text-[11px] text-indigo-600">{wf.progress}</span>
</div>
<p className="mt-0.5 truncate text-[11px] text-indigo-600">{wf.fund_name || '-'} | {wf.company_name || '-'}</p>
{wf.next_step && <p className="mt-0.5 truncate text-[11px] text-indigo-700">다음: {wf.next_step} ...</p>}
<div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-indigo-200/60">
```

**변경 포인트:**
- `p-3` → `p-2` (패딩 축소)
- `text-sm` → `text-xs`, `text-xs` → `text-[11px]` (폰트 축소)
- `mt-1` → `mt-0.5`, `mt-2` → `mt-1` (간격 축소)
- `h-1.5` → `h-1` (프로그레스바 높이 축소)
- `truncate` 추가 (긴 텍스트 잘림 방지)

### 3-D. 컨테이너 높이 조정

```tsx
// 변경 전 L687:
<div className="max-h-[190px] overflow-y-auto pr-1">

// 변경 후: 카드 높이 ≈ 72px, 2행 + gap-2(8px) = ~156px
<div className="max-h-[160px] overflow-y-auto pr-1">
```

**목표:** 4건 카드가 짤림 없이 완전히 보임. 5건 이상부터 스크롤.

### 3-E. 카드 예상 높이 계산

```
p-2(8+8) + 제목줄(16) + mt-0.5 조합줄(14) + mt-0.5 다음단계(14) + mt-1 프로그레스바(4+4) = ~72px
2행 72×2 + gap-2(8) = 152px < 160px ✅
```

---

## Part 4 — LP관리 + 출자 병합

### 4-A. 현재 구조

```
조합 운영 페이지:
├─ [Section] LP 관리
│   ├─ LP 추가/수정 폼 (이름, 유형, 약정액, 납입액, 사업자번호, 주소, 연락처)
│   ├─ LP 목록 테이블
│   ├─ LP 양수양도 이력
│   └─ 약정 합계 vs 총출자액 정합성 표시
├─ [Section] 성과지표
├─ [Section] 출자
│   ├─ 출자회차(CapitalCall) 생성 폼
│   ├─ 출자회차 목록
│   └─ (펼치면) LP별 출자항목(CapitalCallItem) 관리
├─ [Section] 배분
└─ [Section] 총회
```

### 4-B. 병합 후 구조

LP관리와 출자를 하나의 **"LP 및 출자"** 섹션으로 통합:

```
조합 운영 페이지:
├─ [Section] LP 및 출자
│   ├─ [Tab] LP 현황
│   │   ├─ LP 목록 테이블 (약정액, 납입률, 잔여) ← 핵심 요약
│   │   ├─ LP 추가/수정 (접기/펼치기)
│   │   └─ LP 양수양도 이력
│   ├─ [Tab] 출자 회차
│   │   ├─ 출자 회차 목록 (날짜, 유형, 총액)
│   │   ├─ 출자 회차 생성
│   │   └─ LP별 납입 항목
│   └─ [Summary Bar]
│       납입 총액: ₩XXX | 약정 총액: ₩YYY | 납입률: ZZ% | 정합: ✅/⚠️
├─ [Section] 성과지표
├─ [Section] 배분
└─ [Section] 총회
```

### 4-C. 구현 - LP 및 출자 섹션 내부 탭

```tsx
// FundOperationsPage.tsx 수정
const [lpCallTab, setLpCallTab] = useState<'lp' | 'calls'>('lp')

<Section title="LP 및 출자" right={
  <div className="flex items-center gap-2">
    <div className="flex gap-0.5 rounded-lg bg-gray-100 p-0.5">
      <button
        onClick={() => setLpCallTab('lp')}
        className={`rounded-md px-3 py-1 text-xs transition ${
          lpCallTab === 'lp' ? 'bg-white font-medium text-gray-800 shadow' : 'text-gray-500'
        }`}
      >
        LP 현황
      </button>
      <button
        onClick={() => setLpCallTab('calls')}
        className={`rounded-md px-3 py-1 text-xs transition ${
          lpCallTab === 'calls' ? 'bg-white font-medium text-gray-800 shadow' : 'text-gray-500'
        }`}
      >
        출자 회차
      </button>
    </div>
    {lpCallTab === 'lp' && (
      <button onClick={startCreateLP} className="primary-btn">LP 추가</button>
    )}
  </div>
}>
  {/* 공통 요약 바 */}
  <div className="mb-3 flex items-center gap-4 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 p-3 text-xs">
    <div>
      <span className="text-gray-500">약정 총액</span>
      <p className="font-semibold text-gray-800">{formatKRW(lpCommitmentSum)}</p>
    </div>
    <div>
      <span className="text-gray-500">납입 총액</span>
      <p className="font-semibold text-gray-800">{formatKRW(lpPaidInSum)}</p>
    </div>
    <div>
      <span className="text-gray-500">납입률</span>
      <p className="font-semibold text-blue-700">
        {lpCommitmentSum ? `${((lpPaidInSum / lpCommitmentSum) * 100).toFixed(1)}%` : '-'}
      </p>
    </div>
    <div>
      <span className="text-gray-500">정합성</span>
      <p className={`font-semibold ${isCommitmentMatched ? 'text-emerald-700' : 'text-amber-700'}`}>
        {isCommitmentMatched ? '✅ 정합' : '⚠️ 차이 있음'}
      </p>
    </div>
  </div>

  {/* LP 현황 탭 */}
  {lpCallTab === 'lp' && (
    <>
      {/* 기존 LP 추가/수정 폼 */}
      {/* 기존 LP 목록 테이블 */}
      {/* 기존 LP 양수양도 이력 */}
    </>
  )}

  {/* 출자 회차 탭 */}
  {lpCallTab === 'calls' && (
    <>
      {/* 기존 출자 생성 폼 */}
      {/* 기존 출자 목록 */}
      {/* 기존 LP별 출자 항목 */}
    </>
  )}
</Section>
```

### 4-D. LP 목록 테이블 개선

출자 정보를 LP 테이블에 통합 표시:

```
| LP명    | 유형   | 약정액      | 납입액      | 납입률  | 잔여       | 최근 출자일 |
|---------|--------|------------|-------------|--------|-----------|-----------|
| A투자   | 기관   | 1,000,000  | 800,000     | 80%    | 200,000   | 2026-01   |
| B금융   | 법인   | 500,000    | 500,000     | 100%   | 0         | 2025-12   |
```

- 납입률: `(paid_in / commitment) * 100`
- 잔여: `commitment - paid_in`
- 최근 출자일: 해당 LP의 마지막 CapitalCallItem 날짜 (API에서 조회 또는 프론트 계산)

### 4-E. 출자 회차 ↔ LP 연결 강화

출자 회차 펼침 시, LP별 납입 항목에서 **LP 목록을 출자 회차 섹션 내에 인라인 참조:**

```
▼ 제1회 정기출자 (2026-01-15) — ₩1,000,000
  ┌─────────────┬──────────┬──────┬─────────┐
  │ LP명        │ 출자금액  │ 납입 │ 납입일   │
  ├─────────────┼──────────┼──────┼─────────┤
  │ A투자       │ 600,000  │ ✅   │ 01-20   │
  │ B금융       │ 400,000  │ ❌   │ -       │
  └─────────────┴──────────┴──────┴─────────┘
```

---

## Files to create / modify

| # | Type | File | Changes |
|---|------|------|---------|
| 1 | **[MODIFY]** | `frontend/src/pages/TaskBoardPage.tsx` | Part 1: AddTaskForm + EditTaskModal 입력 필드에 `<label>` 추가 |
| 2 | **[MODIFY]** | `frontend/src/pages/InvestmentsPage.tsx` | Part 1: 회사 정보 폼 12건+ label |
| 3 | **[MODIFY]** | `frontend/src/pages/InvestmentDetailPage.tsx` | Part 1: 수정 폼 label |
| 4 | **[MODIFY]** | `frontend/src/pages/WorkflowsPage.tsx` | Part 1: 템플릿/인스턴스 폼 15건+ label |
| 5 | **[MODIFY]** | `frontend/src/pages/FundOperationsPage.tsx` | Part 1: LP/출자/배분/총회 폼 label + **Part 4: LP+출자 병합** |
| 6 | **[MODIFY]** | `frontend/src/pages/FundDetailPage.tsx` | Part 1: 조합 상세 폼 label |
| 7 | **[MODIFY]** | `frontend/src/pages/FundsPage.tsx` | Part 1: 조합 생성 폼 label |
| 8 | **[MODIFY]** | `frontend/src/pages/ReportsPage.tsx` | Part 1: 보고 폼 label |
| 9 | **[MODIFY]** | `frontend/src/pages/BizReportsPage.tsx` | Part 1: 사업보고 폼 label |
| 10 | **[MODIFY]** | `frontend/src/pages/ValuationsPage.tsx` | Part 1: 밸류에이션 폼 label |
| 11 | **[MODIFY]** | `frontend/src/pages/TransactionsPage.tsx` | Part 1: 거래 폼 label |
| 12 | **[MODIFY]** | `frontend/src/pages/AccountingPage.tsx` | Part 1: 회계 폼 label |
| 13 | **[MODIFY]** | `frontend/src/pages/DocumentsPage.tsx` | Part 1: 서류 폼 label |
| 14 | **[MODIFY]** | `frontend/src/pages/ChecklistsPage.tsx` | Part 1: 항목 폼 label |
| 15 | **[MODIFY]** | `frontend/src/pages/WorkLogsPage.tsx` | Part 1: 일지 폼 label |
| 16 | **[MODIFY]** | `frontend/src/pages/ExitsPage.tsx` | Part 1: 엑시트 폼 label |
| 17 | **[MODIFY]** | `frontend/src/pages/CalendarPage.tsx` | Part 1: 이벤트 폼 label |
| 18 | **[MODIFY]** | `frontend/src/pages/TemplateManagementPage.tsx` | Part 1: 템플릿 폼 label |
| 19 | **[MODIFY]** | `frontend/src/pages/DashboardPage.tsx` | Part 1: 빠른추가 모달 label + **Part 3: 워크플로 카드 축소** |
| 20 | **[MODIFY]** | `frontend/src/components/TaskPipelineView.tsx` | **Part 2: 가운데 정렬 + 좌우 마진** |
| 21 | **[MODIFY]** | `frontend/src/components/SearchModal.tsx` | Part 1: 검색 입력 label |
| 22 | **[NEW]** (선택) | `frontend/src/components/InputField.tsx` | 공통 입력 필드 컴포넌트 |

---

## Acceptance Criteria

### Part 1: 입력 필드 레이블
- [ ] AC-01: 모든 페이지의 `<input>`, `<select>`, `<textarea>`에 `<label>` 표시
- [ ] AC-02: 레이블은 입력 시작 후에도 항상 보임
- [ ] AC-03: `placeholder`는 예시/힌트 용도로만 사용 (레이블과 중복되지 않는 내용)
- [ ] AC-04: 그리드 레이아웃 내 좁은 공간은 compact/floating 레이블 사용

### Part 2: 파이프라인 가운데 정렬
- [ ] AC-05: 파이프라인 전체 영역이 화면 중앙에 정렬
- [ ] AC-06: 좌우 마진이 대칭적이고 균형 있음
- [ ] AC-07: `max-w-[1400px]` + `mx-auto` 적용 (큰 모니터에서도 가운데)
- [ ] AC-08: 컬럼 간 간격 적절히 유지 (`gap-3`)

### Part 3: 워크플로 카드
- [ ] AC-09: 4건 카드가 짤림 없이 완전히 보임
- [ ] AC-10: 카드 텍스트 크기, 패딩, 간격 축소로 높이 ~72px 이하
- [ ] AC-11: 프로그레스바 높이 축소 (`h-1`)
- [ ] AC-12: 5건 이상부터만 스크롤 발생 + "더보기" 안내 유지

### Part 4: LP+출자 병합
- [ ] AC-13: "LP 관리"와 "출자" Section이 하나의 "LP 및 출자" Section으로 통합
- [ ] AC-14: 내부 탭(LP 현황 / 출자 회차)으로 전환
- [ ] AC-15: 상단 요약 바(약정 총액, 납입 총액, 납입률, 정합성) 상시 노출
- [ ] AC-16: LP 테이블에 납입률, 잔여, 최근 출자일 컬럼 추가
- [ ] AC-17: 기존 LP 추가/수정/삭제, 양수양도, 출자 CRUD 기능 그대로 유지

### 공통
- [ ] AC-18: `npm run build` TypeScript 에러 0건
- [ ] AC-19: 기존 기능 정상 동작
- [ ] AC-20: console.log/print 디버깅 코드 없음

---

## 구현 주의사항

1. **레이블 150건+:** 전체 페이지를 빠짐없이 확인. grep `placeholder=` 결과를 기반으로 하나하나 추가.
2. **레이아웃 깨짐 방지:** `<label>` 추가 시 기존 그리드/flex 레이아웃에 `<div>` 래퍼가 필요한 경우 있음. 각 input의 부모 레이아웃 확인 필수.
3. **파이프라인 max-w:** 작은 화면(노트북 1366px)에서도 5컬럼이 정상 렌더링되는지 확인.
4. **카드 높이 계산:** 워크플로 카드의 `next_step`이 없는 경우 더 낮아짐 → 그래도 4건 표시에는 문제 없음.
5. **LP+출자 병합:** 기존 Section "LP 관리" 코드(L622-752)와 Section "출자" 코드(L769+)를 하나의 Section 안으로 이동. 기존 state 변수 및 mutation은 그대로 유지.
6. **요약 바의 `lpPaidInSum`:** 현재 LP.paid_in 합산. 출자/배분 반영된 실시간 값인지 확인하고, 아니라면 API에서 계산된 값 사용.
