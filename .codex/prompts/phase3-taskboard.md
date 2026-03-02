# Phase 3 — 업무 보드(TaskBoard) UX/UI 개선

## 배경 및 목표
업무 보드(`/tasks`) 탭의 문제:
- 카드(업무 항목) 간격이 너무 좁거나 없어서 경계가 불명확
- 일부 카드 박스 크기가 과도하게 크거나 작아 일관성 없음
- 불필요한 라벨이 입력 필드에 붙어 있음 (placeholder로 대체 가능)
- 필터 영역과 본문 간격 부족

전제: Phase 1 완료 후 진행.

## 수정 대상 파일
- `frontend/src/pages/TaskBoardPage.tsx`
- `frontend/src/components/ui/FilterPanel.tsx` (있는 경우)

---

## 3-A. 전체 레이아웃 간격

**파일: `frontend/src/pages/TaskBoardPage.tsx`**

1. **페이지 헤더와 필터 사이** — `mb-4` → `mb-3` (약간 좁혀서 필터 영역이 헤더와 자연스럽게 연결)
2. **필터 패널과 카드 그리드 사이** — `mt-4` 추가 (현재 간격 없거나 미흡)
3. **보드 뷰(board view)의 Quadrant 그리드**:
   ```jsx
   // 현재 패턴 확인 후 아래 적용
   <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
     {QUADRANTS.map((q) => (
       <div key={q.key} className={`rounded-xl border-l-4 bg-white p-4 shadow-sm ${q.color}`}>
   ```
   - 각 Quadrant 카드에 `shadow-sm` 추가
   - 내부 업무 항목 간격: `space-y-2` → `space-y-2.5`

---

## 3-B. 개별 업무 카드 스타일

업무 카드(Task Card) 렌더링 함수 내 수정:

1. **카드 기본 구조**:
   ```jsx
   // 변경 전 (대략적 현재 패턴)
   <div className={`rounded-lg border-l-4 bg-white px-3 py-2 ...`}>

   // 변경 후
   <div className={`rounded-lg border border-slate-200 border-l-4 bg-white px-3 py-2.5 shadow-xs ...`}>
   ```
   - `border` (전체 테두리) + `border-l-4` (좌측 강조 테두리) 함께 사용
   - `py-2` → `py-2.5` 로 내부 여백 증가

2. **업무 카드 내부 텍스트 계층**:
   - 업무 제목: `text-sm font-medium text-slate-800` (현재 font-medium 없으면 추가)
   - 메타 정보(마감일, 펀드명): `text-xs text-slate-500`
   - 카테고리 태그: `tag` 클래스 유지

3. **태그 남발 제거**:
   - 업무 카드마다 긴급도 배지(오늘마감/이번주/지연 등) + 카테고리 태그 + 완료 배지가 모두 표시되는 경우
   - **규칙**: 긴급도 배지와 카테고리 태그 중 우선순위 높은 것 1개만 표시
   - 카드가 완료 상태이면 태그 전혀 표시 안 함 (취소선만)
   - 구체적으로: `taskUrgencyMeta` 함수 결과의 `label`이 있을 때만 긴급 배지 표시, 카테고리 태그는 항상 표시하되 긴급 배지와 겹치면 긴급 배지 우선

4. **Workflow 그룹 카드(WorkflowGroup 렌더링)** — 워크플로에 묶인 업무 그룹:
   - 그룹 헤더 카드: `rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5`
   - 하위 업무 목록: `ml-3 mt-1.5 space-y-1.5 border-l-2 border-indigo-200 pl-3`
   - 그룹 내 개별 업무는 배경 없이 (`bg-transparent`) border-bottom으로 구분

---

## 3-C. 라벨 → 플레이스홀더 전환

업무 추가/수정 폼(EditTaskModal, QuickTaskAddModal 등)에서:

현재 `<label>` + `<input>` 패턴:
```jsx
<div>
  <label className="form-label">업무명</label>
  <input className="form-input" />
</div>
```

변경 — **모달 내 간단 폼**의 경우:
- 업무명 / 마감일 / 메모 등 **직관적인 필드**는 label 제거, placeholder만 사용:
```jsx
<input
  placeholder="업무명을 입력하세요"
  className="form-input"
/>
```
- 단, **복잡한 폼**(워크플로 단계 설정, 여러 필드가 모여 있는 경우)은 label 유지
- label 제거 기준: 필드가 1~2개이거나, 필드 목적이 명확한 경우

**구체적 제거 대상** (TaskBoardPage 내에서):
- 업무 빠른 추가 인라인 input들 → placeholder만 사용
- 카테고리 추가 입력 → `placeholder="카테고리명"` 사용, label 제거
- 검색 input → placeholder `"업무 검색..."` label 없음 (현재도 없을 수 있음, 확인)

---

## 3-D. 뷰 탭(보드/캘린더/파이프라인) 스타일

현재 `VIEW_TABS` 렌더링 패턴을 확인 후:
```jsx
// 변경 후 스타일
<div className="flex gap-1 rounded-xl bg-slate-100 p-1">
  {VIEW_TABS.map((t) => (
    <button
      key={t.key}
      onClick={() => setBoardView(t.key)}
      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
        boardView === t.key
          ? 'bg-white text-slate-800 shadow-sm'
          : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {t.label}
    </button>
  ))}
</div>
```

---

## 3-E. 선택 모드(bulk action) 배너

현재: `sticky top-3 z-20 ... rounded-xl border border-blue-200 bg-white/95`
변경:
- `border-blue-200` → `border-slate-200`
- `bg-white/95 backdrop-blur` 유지
- 선택된 개수 표시: `text-sm font-semibold text-slate-700`
- 일괄 완료/삭제 버튼: `primary-btn btn-sm` / `danger-btn btn-sm` 유지

---

## 3-F. 필터 패널 (FilterPanel)

**파일: `frontend/src/components/ui/FilterPanel.tsx`**

현재 필터 패널의 구체적 구조를 확인 후:
1. 필터 레이블이 붙어있는 select/input들 — 필터명은 select 안의 첫 번째 option 또는 placeholder로 표시
2. 필터 초기화 버튼: `secondary-btn btn-sm` 클래스 유지
3. 전체 필터 컨테이너: `rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm`

---

## 3-G. 완료된 업무 표시

완료 상태 업무 카드:
- 업무 제목에 `line-through text-slate-400` 적용 (현재도 있을 수 있음, 확인)
- 카드 배경: `bg-slate-50` 로 구분
- 카드 border-left 색상: `border-l-slate-200` (긴급색 제거)

---

## 검증 체크리스트
- [ ] 보드 뷰 4개 Quadrant 동일 크기로 나란히 표시
- [ ] 각 업무 카드 간격(space-y-2.5) 적용 확인
- [ ] 태그가 최대 2개(카테고리 + 긴급도) 이내로 표시
- [ ] 워크플로 그룹 카드 들여쓰기 표현 확인
- [ ] 라벨 제거한 필드에 placeholder 표시 확인
- [ ] 뷰 탭(보드/캘린더/파이프라인) 스타일 통일 확인
- [ ] 기존 기능(완료처리, 삭제, 드래그, 필터 등) 모두 동작
