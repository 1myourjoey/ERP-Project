# Phase 2 — 대시보드 UX/UI 개선

## 배경 및 목표
현재 대시보드(`/dashboard`)는 여러 정보를 한 화면에 보여주지만 아래 문제가 있습니다:
- StatCard 크기가 들쭉날쭉 (compact / default / danger / emerald 등 variant가 혼재)
- "운영진 Quick View" 섹션이 기본 접힌 상태로 정보 접근성이 나쁨
- 라벨이 붙어야 할 곳이 아닌 곳에 라벨이 붙어 있음 (예: 텍스트 메타 줄에 badge/tag 남발)
- 전체 레이아웃 배치 개선 필요 (좌측 2/3 업무 + 우측 1/3 워크플로, 아래 Right Panel)

전제: Phase 1 (디자인 시스템 교체) 완료 후 진행합니다.

## 수정 대상 파일
- `frontend/src/components/dashboard/DashboardStatCard.tsx`
- `frontend/src/components/dashboard/DashboardDefaultView.tsx`
- `frontend/src/components/dashboard/DashboardRightPanel.tsx`
- `frontend/src/components/dashboard/DashboardWorkflowPanel.tsx`
- `frontend/src/components/dashboard/DashboardTaskPanels.tsx`

---

## 2-A. DashboardStatCard 통일

**파일: `frontend/src/components/dashboard/DashboardStatCard.tsx`**

현재 `variant` prop에 따라 크기/색상이 다릅니다. 이를 단순화합니다.

### 변경 사항:
1. `variant` prop을 `'default' | 'danger' | 'success' | 'warning'` 4가지로 줄입니다 (`compact` 제거).
2. 모든 카드의 **패딩과 크기를 동일**하게 맞춥니다 (`p-4`, `text-sm` label, `text-2xl` value).
3. `compact` variant를 사용하던 호출부는 `default`로 변경합니다.
4. 카드 스타일:
   - 모든 variant 공통: `rounded-xl border bg-white p-4 shadow-sm`
   - `default`: border `#e2e8f0`, label `text-slate-500`, value `text-slate-900`
   - `danger`:  border `#fecaca`, bg `#fef2f2`, label `text-red-500`, value `text-red-700`
   - `success`: border `#bbf7d0`, bg `#f0fdf4`, label `text-green-600`, value `text-green-700`
   - `warning`: border `#fde68a`, bg `#fffbeb`, label `text-amber-600`, value `text-amber-700`
5. `valueSuffix` prop은 유지하되 suffix text를 label 아래에 작은 글씨(text-xs)로 표시합니다.
6. 클릭 가능한 카드는 `cursor-pointer hover:shadow-md transition-shadow` 추가.

---

## 2-B. DashboardDefaultView 레이아웃 개선

**파일: `frontend/src/components/dashboard/DashboardDefaultView.tsx`**

### 변경 사항:

#### StatCard 그리드
현재:
```jsx
<div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
```
변경:
```jsx
<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
```
- 5개 카드 모두 동일한 크기 (2-A 통일 후 자연스럽게 해결).
- `variant="compact"` 사용 중인 카드는 `variant="default"`로 변경.

#### 긴급 알림 배너
- 현재: `rounded-lg border border-amber-200 bg-amber-50 px-3 py-2`
- 변경: `info-banner` → `warning-banner` 스타일 CSS 클래스 활용
- 텍스트 줄마다 badge 남발 제거 → 아이콘(❌/⚠️) + 텍스트만 유지
- "긴급 알림" 제목은 `text-sm font-semibold` 유지

#### 메인 2컬럼 영역
현재:
```jsx
<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
  <div className="space-y-2 lg:col-span-2"> {/* 업무 */}
  <div className="space-y-2"> {/* 워크플로 */}
```
- `gap-4` → `gap-5` 로 여백 약간 증가
- 각 섹션 위의 메타 텍스트 (`업무 N건 · N그룹`) 스타일 개선: `text-xs text-slate-400 px-1 mb-1`

#### DashboardRightPanel 섹션
- 하단 전체 폭으로 펼쳐지는 Right Panel은 적절한 상단 여백(`mt-2`) 추가

---

## 2-C. DashboardRightPanel 개선

**파일: `frontend/src/components/dashboard/DashboardRightPanel.tsx`**

### 변경 사항:

1. **"운영진 Quick View" → "운영 현황"** 으로 텍스트 변경
2. **기본 상태 펼쳐진 상태(quickCollapsed = false)로 변경**
   - 현재: `const [quickCollapsed, setQuickCollapsed] = useState(true)`
   - 변경: `const [quickCollapsed, setQuickCollapsed] = useState(false)`
3. **접힌 상태의 요약 정보** — 현재 `grid grid-cols-1 gap-2` 로 4줄 나열되어 있음
   - 변경: `flex flex-wrap gap-3` + 각 항목을 인라인 칩 형태로 표시
4. **탭 버튼 (조합/통지/보고/서류)** — 현재 `bg-gray-100 p-0.5` 컨테이너 내부 버튼
   - 활성 탭: `bg-white text-gray-800 shadow` 유지
   - 비활성 탭: `text-gray-500 hover:text-gray-700` → `text-slate-500 hover:text-slate-700`
   - 탭 컨테이너: `rounded-xl bg-slate-100 p-0.5` 유지

5. **조합 탭 운영 요약 박스**
   - 현재 `text-[11px]` 너무 작음 → `text-xs` 로 변경
   - 한 줄로 나열되는 4개 지표 → 2x2 grid로 배치:
   ```jsx
   <div className="grid grid-cols-2 gap-1.5 text-xs">
     <div>심의 진행 <span className="font-semibold">{investmentReviewActiveCount}건</span></div>
     <div>NAV <span className="font-semibold">{formatKRW(totalNav)}</span></div>
     <div>미납 LP <span className="font-semibold">{unpaidLpCount}건</span></div>
     <div>컴플라이언스 지연 <span className="font-semibold">{complianceOverdueCount}건</span></div>
   </div>
   ```

6. **완료 업무 탭 필터** — `today/this_week/last_week` 필터 버튼 스타일을 탭 스타일로 통일
   - 현재 별도 버튼 스타일 → 같은 `rounded-xl bg-slate-100` 컨테이너 안에 배치

---

## 2-D. DashboardWorkflowPanel 개선

**파일: `frontend/src/components/dashboard/DashboardWorkflowPanel.tsx`**

### 변경 사항:
1. **워크플로우 행 카드 스타일 통일**
   - 현재: `border-indigo-200 bg-indigo-50` 인디고 색 고정
   - 변경: `border border-slate-200 bg-white` 기본 흰색, hover `hover:bg-slate-50`
   - 진행바: `bg-slate-200` 트랙, `bg-blue-500` fill
   - 워크플로 이름: `text-sm font-medium text-slate-800`
   - 진행 배지: `tag tag-blue` (인디고 대신 파란 태그)

2. **빈 상태 표시** — 기존 EmptyState 컴포넌트 그대로 사용

3. **하단 버튼 행** (`업무 보드`, `파이프라인`, `워크플로 전체`) — 작은 버튼들
   - `secondary-btn btn-sm` 클래스로 통일

---

## 2-E. DashboardTaskPanels 개선

**파일: `frontend/src/components/dashboard/DashboardTaskPanels.tsx`**

### 변경 사항:
1. 각 업무 행의 왼쪽 긴급 border (빨강/노랑)는 유지하되, 행 전체 패딩 `py-2.5` → `py-2`로 살짝 줄여 밀집도 개선
2. 완료 버튼(⚡ 아이콘 등) — 크기 일관성: `icon-btn` 클래스 사용
3. 업무 제목 옆에 붙는 태그(긴급/이번주 등)가 너무 많으면 `max 1개`만 표시
4. 각 섹션 헤더(`오늘`, `이번 주` 등) — `text-xs font-semibold text-slate-500 uppercase tracking-wide`로 통일

---

## 검증 체크리스트
- [ ] 대시보드 로딩 정상
- [ ] StatCard 5개 동일한 높이/크기로 표시
- [ ] "운영 현황" 섹션 기본 펼쳐진 상태
- [ ] 긴급 알림 배너 시각적으로 명확
- [ ] 워크플로 패널 카드 일관된 흰색 스타일
- [ ] 기존 클릭 이벤트 (팝업 열기, 업무 상세 등) 모두 정상 동작
- [ ] 모바일(375px) 레이아웃 깨지지 않음
