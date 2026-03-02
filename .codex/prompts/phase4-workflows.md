# Phase 4 — 워크플로우 탭 UX/UI 개선

## 배경 및 목표
워크플로우 탭(`/workflows`)의 주요 문제:
1. **상단 탭 텍스트 색상 불가시성** — 비활성 탭이 `text-gray-400`으로 너무 연해 읽기 어려움
2. **정기 업무 캘린더 오버플로우** — `grid-cols-12` 12열 그리드가 부모 박스를 벗어남
3. **단계 서류 박스** — 인스턴스 내 step 서류 영역이 부모 카드를 벗어나는 경우
4. **전체 카드/박스 일관성 부족**
5. **불필요한 라벨** 일부 form에서 제거 필요

전제: Phase 1 완료 후 진행.

## 수정 대상 파일
- `frontend/src/pages/WorkflowsPage.tsx`

---

## 4-A. 상단 탭 텍스트 색상 수정

현재 (WorkflowsPage.tsx 약 3122~3134줄):
```jsx
<div className="border-b border-gray-200">
  <div className="flex gap-6">
    {[
      { key: 'active',     label: '진행 중' },
      { key: 'completed',  label: '완료' },
      { key: 'templates',  label: '템플릿(관리자)' },
      { key: 'periodic',   label: '정기 업무' },
      { key: 'checklists', label: '체크리스트(레거시)' },
    ].map((t) => (
      <button
        key={t.key}
        onClick={() => changeTab(t.key)}
        className={`border-b-2 pb-2 text-sm ${
          tab === t.key
            ? 'border-blue-600 text-blue-600 font-medium'
            : 'border-transparent text-gray-400 hover:text-gray-600'
        }`}
      >
        {t.label}
      </button>
    ))}
  </div>
</div>
```

**변경**:
```jsx
<div className="border-b border-slate-200">
  <div className="flex gap-1 overflow-x-auto">
    {[
      { key: 'active',     label: '진행 중' },
      { key: 'completed',  label: '완료' },
      { key: 'templates',  label: '템플릿 관리' },
      { key: 'periodic',   label: '정기 업무' },
      { key: 'checklists', label: '체크리스트' },
    ].map((t) => (
      <button
        key={t.key}
        onClick={() => changeTab(t.key)}
        className={`whitespace-nowrap border-b-2 px-4 pb-2.5 pt-1 text-sm font-medium transition-colors ${
          tab === t.key
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-800'
        }`}
      >
        {t.label}
      </button>
    ))}
  </div>
</div>
```

핵심 변경:
- 비활성 탭: `text-gray-400` → `text-slate-600` (명확하게 보이도록)
- hover: `hover:text-gray-600` → `hover:text-slate-800`
- `gap-6` → `gap-1` + 개별 버튼에 `px-4` 패딩 (더 클린한 모양)
- 탭 레이블: `체크리스트(레거시)` → `체크리스트` 로 단순화
- 탭 레이블: `템플릿(관리자)` → `템플릿 관리` 로 단순화
- `overflow-x-auto` 추가 (모바일에서 스크롤)

---

## 4-B. 정기 업무 캘린더 오버플로우 수정

현재 (약 2733줄):
```jsx
<div className="card-base">
  <div className="grid min-w-max grid-cols-12 gap-2">
    {PERIODIC_MONTH_LABELS.map((label, monthIndex) => {
      ...
      return (
        <div key={label} className="w-28 rounded-lg border border-gray-200 p-2">
```

문제: `min-w-max` + `grid-cols-12` 조합이 부모 카드를 벗어남.

**변경**:
```jsx
<div className="card-base overflow-hidden">
  <div className="overflow-x-auto pb-2">
    <div className="grid min-w-max grid-cols-12 gap-2">
      {PERIODIC_MONTH_LABELS.map((label, monthIndex) => {
        ...
        return (
          <div key={label} className="w-24 min-w-[96px] rounded-lg border border-slate-200 bg-white p-2">
```

핵심 변경:
- 외부 `card-base`에 `overflow-hidden` 추가
- 그리드를 `overflow-x-auto` div로 감싸서 가로 스크롤 허용
- `w-28` → `w-24 min-w-[96px]` 로 약간 축소
- `border-gray-200` → `border-slate-200`

---

## 4-C. 단계 서류(Step Documents) 영역 오버플로우 수정

현재 단계 서류 박스(약 2163줄 일대):
```jsx
<div className="ml-5 rounded border border-gray-200 bg-white px-2 py-2">
```

문제: `ml-5`로 들여쓰기 후 내부 그리드(`grid-cols-1 md:grid-cols-3`)가 너무 넓어짐.

**변경**:
```jsx
<div className="mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white px-2.5 py-2">
```
- `ml-5` 제거 (step row 자체가 이미 들여쓰기 있음)
- `overflow-hidden` 추가
- border 스타일 통일

---

## 4-D. 인스턴스 카드 스타일 통일

진행 중 워크플로 인스턴스 목록 (약 1957줄 일대):

현재 인스턴스 행:
```jsx
<div className={`rounded-xl border p-3 ...`}>
  {/* 헤더 */}
  <div className="flex items-center justify-between gap-2">
```

**변경**:
1. 인스턴스 카드 컨테이너: `rounded-xl border border-slate-200 bg-white shadow-xs`
2. 인스턴스 헤더 패딩: `px-3 py-2.5`
3. 오버듀(지연) 인스턴스: `border-red-200 bg-red-50/50`
4. 오늘 마감 인스턴스: `border-amber-200 bg-amber-50/50`
5. 확장 시 내용 영역: `border-t border-slate-100 px-3 py-2.5 space-y-2`

**단계(Step) 행 스타일**:
현재: `className="space-y-1 rounded bg-gray-50 px-2 py-1.5 text-xs"`
변경: `className="flex-col rounded-lg bg-slate-50 px-2.5 py-2 text-xs space-y-1.5"`

---

## 4-E. 인스턴스 목록 상단 요약 배너

현재:
```jsx
<p>진행 중 {activeSummary.total}건 | 지연 {activeSummary.overdue}건 | 이번 주 마감 {activeSummary.weekDue}건</p>
```

**변경** — 뱃지 형식으로:
```jsx
<div className="flex flex-wrap items-center gap-2 text-xs">
  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
    전체 {activeSummary.total}건
  </span>
  {activeSummary.overdue > 0 && (
    <span className="rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-700">
      지연 {activeSummary.overdue}건
    </span>
  )}
  {activeSummary.weekDue > 0 && (
    <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-700">
      이번 주 마감 {activeSummary.weekDue}건
    </span>
  )}
</div>
```

---

## 4-F. 템플릿 편집 폼 라벨 정리

템플릿 탭 우측 편집 폼 (약 914줄 일대):

- `<label className="form-label">템플릿 이름</label>` → placeholder `"예: 정기 출자 요청"` 으로 대체, label 제거
- `<label className="form-label">카테고리</label>` → placeholder `"카테고리"` 로 대체, label 제거
- `<label className="form-label">설명</label>` → placeholder `"템플릿 설명 (선택)"` 으로 대체, label 제거
- 단계 추가 폼의 단계명 input → placeholder `"단계명"`, 오프셋 input → placeholder `"D+일수"`, label 제거

단, 복잡한 설정(is_notice, is_report 체크박스 등)은 label 유지.

---

## 4-G. 워크플로 시작(instantiate) 폼 개선

현재 워크플로 시작 버튼 클릭 후 인라인 폼 확인:
- 기준일 input: label `"기준일"` → 유지 (date picker라 placeholder 역할 제한)
- 메모 input: label `"메모"` → label 제거, placeholder `"메모 (선택)"` 사용

---

## 4-H. 정기 업무 추가 폼 라벨 정리

정기 업무 추가 폼 (약 2803줄 일대):
- 업무명 / 카테고리 label → placeholder 대체
- 주기 select: label `"주기"` 유지 (select 값이 자명하지 않으므로)
- 기준 월/일 input: label 유지 (숫자 필드라 맥락 필요)
- 조합 필터: label 제거, placeholder `"예: LLC"` 유지

---

## 검증 체크리스트
- [ ] 탭 비활성 상태에서 텍스트가 명확히 보임 (slate-600)
- [ ] 정기 업무 캘린더 가로 스크롤 동작, 부모 카드 안에서 표시
- [ ] 단계 서류 박스가 부모 카드 밖으로 벗어나지 않음
- [ ] 인스턴스 카드 일관된 흰색 배경 스타일
- [ ] 워크플로 시작/단계 완료/되돌리기 기능 정상 동작
- [ ] 서류 추가/수정/삭제 기능 정상 동작
- [ ] 템플릿 CRUD 기능 정상 동작
- [ ] 정기 업무 CRUD 기능 정상 동작
