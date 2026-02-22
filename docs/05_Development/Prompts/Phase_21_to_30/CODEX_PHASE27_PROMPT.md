# Phase 27: 대시보드 구조 모듈화 및 데이터 렌더링 최적화 (Dashboard Refactoring & Optimization)

> **Priority:** P1 (성능 향상 및 기술 부채 해소)

---

## Table of Contents

1. [Part 1 — 초거대 단일 파일 분할 (Component Modularization)](#part-1)
2. [Part 2 — 프론트엔드 연산 부하 최소화 및 렌더링 최적화](#part-2)
3. [Part 3 — 데이터 오버패칭(Over-fetching) 방지 및 분리 로딩 도입](#part-3)
4. [Files to create / modify](#files-to-create--modify)
5. [Acceptance Criteria](#acceptance-criteria)
6. [구현 주의사항 (Computer Science Rules)](#구현-주의사항-computer-science-rules)

---

## 현재 상태 및 문제점 분석

V:ON ERP의 메인 허브인 `DashboardPage.tsx` 컴포넌트는 모든 기능과 UI 요소들이 한 곳에 1,300 라인 이상으로 뭉쳐 있는 초거대 단일 파일(God Object)이 되었습니다. 초기 런칭에는 무리가 없으나, 향후 운영 과정에서 데이터가 수만 건 단위로 누적될 경우 심각한 렌더링 부하(Jank)와 TTI(Time-to-Interactive) 저하가 예상됩니다.

**주요 목적:**
1. **코드의 유지보수성 확보:** 수많은 내부 모달과 카드, 스탯 버튼들을 개별 React Component 파일로 분할하여 독립시킵니다.
2. **리렌더링(Re-render) 최적화:** `useMemo` 및 `React.memo` 를 적극 활용하여 1개 업무의 완료 체크 시 전체 대시보드가 불필요하게 통째로 리렌더링되는 현상을 막습니다.
3. **네트워크 병목 완화 제안:** 단일 `fetchDashboard` 로 한 방에 모든 데이터를 영끌해오는 구조 중, 평소에 접혀있는 "과거 완료 목록"이나 "미수집 서류" 같은 무거운 데이터 리스트들을 별도 API 라우터 쿼리로 쪼개어 Lazy/Suspense 패칭하도록 아키텍처를 개선합니다.

---

## Part 1 — 초거대 단일 파일 분할 (Component Modularization)

### 1-A. 디렉토리 구조 신설 및 컴포넌트 이관
- **신규 폴더 생성:** `frontend/src/components/dashboard/` 폴더를 새로 만들어 하위 컴포넌트를 분리합니다.
- **분리해야 할 대상 컴포넌트 목록:**
  1. **DashboardStatCard.tsx**: 최상단의 요약 수치 카드 (`StatCard`, `categoryBadgeClass` 등 포함)
  2. **DashboardTaskList.tsx**: 오늘/내일/주간 업무 패널 (`TaskList`, `dueBadge` 등 포함)
  3. **DashboardRightPanel.tsx**: 우측 분할 영역(조합, 통지, 서류 탭 등 4종 탭 로직 묶음)
  4. **Modals/** (하위 폴더):
     - `DashboardPopupModal.tsx` (`ListPopupModal` 역할)
     - `QuickTaskAddModal.tsx` 
     - `WorkflowTimelineModal.tsx` (진행 단계 상세)

- 본체인 **`DashboardPage.tsx`** 는 이제 라우팅과 `useQuery` 데이터를 물어다 하위 컴포넌트들에게 건네주기만 하는 일종의 Data Container 역할만 수행하도록 200줄 내외로 다이어트를 시킵니다.

---

## Part 2 — 프론트엔드 연산 부하 최소화 및 렌더링 최적화

### 2-A. 무거운 데이터 정렬/필터의 메모이제이션(Memoization)
- `DashboardPage` 파일 윗단에 하드코딩된 `groupByCategory` 같은 함수나 각 패널에 Data Array를 던져주기 위해 매번 재가공되는 데이터 로직을 전부 `useMemo` 블록 안으로 격리합니다.
- 특히 `filteredCompleted`(필터된 완료 목록), `upcomingGrouped`(예정 업무 그룹화) 등의 변수화(Variable Assignment)가 `useState` 변화나 모달 On/Off 시 무의미하게 재연산되지 않도록 Dependency Array `[data, completedFilter]` 를 확고하게 조입니다.

### 2-B. 하위 컴포넌트 React.memo 적용
- 분리해 낸 카드와 리스트 모듈들에 `React.memo` 처리를 걸어서, 유저 포커스나 알림 등이 추가되었을 때 화면 전체가 점멸하듯 쓸데없이 다시 렌더 트리를 타는 것을 원천적으로 차단(Render Bailout)시킵니다.

---

## Part 3 — 데이터 오버패칭(Over-fetching) 방지 및 분리 로딩 도입

### 3-A. 백엔드 `fetchDashboard` 슬림화 및 Query Key 분산
- 현재 `backend/routers/dashboard.py` 에서 통지, 서류, 진행 워크플로, 지난 주 완료한 목록 전체 등 거의 10가지 성격의 쿼리를 단일 응답(JSON)에 구겨넣고 있습니다. 데이터 로우가 늘어나면 DB 병목이 터집니다.
- **분리 전략 (옵션/점진적 적용):** 
  - 기본 `dashboard` 쿼리에는 **당장의 스크린에 랜더링할 핵심 카운트 및 오늘/내일/주간 스케줄(Task)**까지만 무겁게 보냅니다.
  - "미수집 서류 리스트", "우측 탭의 펀드 리스트", "통지 및 보고 상세 Array" 등은 유저 시야 밖이거나 우측 사이드에 밀려있으므로, 프론트에서 개별 `useQuery({ queryKey: ['dashboard-documents'] })` 등으로 분리 호출하게끔 라우터 엔드포인트를 2~3개 (`/api/dashboard/tasks`, `/api/dashboard/widgets`) 로 분할 설계를 반영합니다.

*(※ Part 3의 경우 API 라우터 개편이 크므로, 1차적으로는 사이드/모달용 데이터만 독립 EndPoint로 분리해 Lazy 로딩하는 형태로 리팩토링할 것을 지시함)*

---

## Files to create / modify

| # | Type | File | Changes |
|---|------|------|---------|
| 1 | **[NEW]** | `frontend/src/components/dashboard/*` | 대시보드 파편 컴포넌트 파일 6건 신규 분리 생성 (`DashboardTaskList.tsx` 등) |
| 2 | **[MODIFY]** | `frontend/src/pages/DashboardPage.tsx` | 분리된 모듈들을 `import` 하여 깔끔하게 배치하는 Container 형태로 축소 개편 |
| 3 | **[MODIFY]** | `backend/routers/dashboard.py` | (필요시) 초기 응답 JSON 크기 슬림화를 위해 무겁고 덜 쓰이는 Array 리턴을 별도 Endpoint(가칭: `/api/dashboard/extra`)로 독립 개편 |
| 4 | **[MODIFY]** | `frontend/src/lib/api.ts` | 분리된 대시보드 API 엔드포인트에 맞춰 `fetch` 함수들(fetchDashboardTasks, fetchDashboardWidgets 등) 새롭게 추가 |

*(코덱스는 위 가이드뿐만 아니라 스스로 코드베이스와 모듈 의존성을 파악하여 Redux/Zolstand 같은 라이브러리를 쓰지 않더라도 React Query 캐싱 환경 아래서 최적화를 이뤄내야 합니다.)*

---

## Acceptance Criteria

- [ ] AC-01: `frontend/src/pages/DashboardPage.tsx` 의 전체 코드가 분할 적용 후 약 300라인 이내로 비약적으로 얇아지고 가독성이 높아진다.
- [ ] AC-02: 대시보드의 어느 한 모달(예: 빠른 업무 추가)을 열고 닫을 때, 전체 웹페이지 DOM 스코프가 재렌더링되며 화면이 깜빡거리거나 리액트 워닝(`Too many Re-renders`) 콘솔로그가 찍히는 현상이 제로(0)여야 한다. `React Profiler` 로 입증 가능할 것.
- [ ] AC-03: `dashboard` 관련 백엔드 API 라우터를 찔러서 돌아오는 Response Size(KB)가 기능 개편 전에 비해 의미있게 (최소 30% 이상) 경량화되어, 브라우저가 첫 Network Load 시 부담을 갖지 않아야 한다.
- [ ] AC-04: 분리된 탭(조합, 통지, 서류 등)이나 팝업창을 여는 시점에 필요한 Array 데이터만 즉석으로(onDemand) 추가 요청 혹은 캐시에서 꺼내어 그려주는 병렬 비동기(Concurrent Parallel Fetching) 적용이 시각적으로 매끄럽게 돌아가야 한다.
- [ ] AC-05: 리팩토링 직후 대시보드에서 기존에 정상작동하던 모든 기능 (업무 완료, 되돌리기, 파이프라인 상세보기, 업무 추가 등)이 기존 작동과 소수점 하나 차이 없이 100% 동일한 기능을 보장한다 (Regression Test Pass).

---

## 구현 주의사항 (Computer Science Rules)

1. **Avoid Prop Drilling (과도한 Props 지양):** 컴포넌트를 분할하면서 데이터 컨테이너에서 하위 파일로 모든 `mutations`(수정/완료 함수)와 `data`를 드릴링(Drilling) 하면 코드가 오히려 지저분해집니다. `DashboardPage.tsx` 에서는 공통 Context 나 Provider 정도만 내려주고, 하위 컴포넌트인 `DashboardTaskList.tsx` 내부에서 굳이 드릴링하지 않아도 될 `useMutation` 등을 자체 캐싱(`queryClient`)으로 스마트하게 훅업하세요.
2. **Key Prop Integrity (식별자 유지):** 로직과 루프를 쪼갤 때 React의 `key` 속성이 인덱스(`idx`)로 할당되어 있으면 안 됩니다. 반드시 `task.id`, `workflow.id` 같은 Unique 속성을 부여하여 렌더링 성능 최적화를 완성하십시오.
3. **Lazy Compilation (코드 스플리팅):** 프론트엔드가 페이지 랜딩되는 시점에 대시보드의 모든 커다란 팝업 모달 소스코드까지 다운로드 받을 필요는 없습니다. `React.lazy` 나 Next.js 급의 동적 임포트(Dynamic Import) 기법을 사용해 유저가 모달을 띄우는 시점에 Chunk(JavaScript 파편)가 로드될 수 있다면 만점에 가까운 아키텍처입니다.
