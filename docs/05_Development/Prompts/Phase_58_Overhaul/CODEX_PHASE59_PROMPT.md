# Phase 59: Frontend 코드 정비

> **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> **의존성:** Phase 58 완료
> **근거:** `docs/ERP_ANALYSIS_AND_STRATEGY.md` §5.2, `docs/UXUI_IMPROVEMENT_STRATEGY.md` §9

**Priority:** P0 — UI 개선 Phase들의 기반
**핵심 원칙:**
1. **기존 동작 무결성** — 분리/이동만, 로직 변경 없음
2. **import 경로 일괄 교체** — 분리 후 모든 페이지의 import 수정
3. **단계적 작업** — api.ts 분리 → 상수 → 쿼리키 → ErrorBoundary 순서

---

## Part 0. 전수조사 (필수)

- [ ] `frontend/src/lib/api.ts` — 전체 구조 파악 (4,451줄, 도메인별 함수 그룹)
- [ ] `frontend/src/lib/api.ts` — axios 인스턴스 설정, 인터셉터, 토큰 관리 함수 위치
- [ ] `frontend/src/lib/queryInvalidation.ts` — 기존 invalidation 유틸리티 확인
- [ ] `frontend/src/pages/*.tsx` — 각 페이지에서 api.ts import 패턴 확인
- [ ] 하드코딩된 상태값 검색: `'대기'`, `'진행중'`, `'완료'`, `'pending'`, `'in_progress'`, `'completed'`
- [ ] 하드코딩된 쿼리키 검색: `useQuery({queryKey: [` 패턴 전수조사

---

## Part 1. api.ts 도메인별 분리

### 1-1. 분리 구조

```
frontend/src/lib/
├── api/
│   ├── index.ts              ← re-export (기존 import 호환)
│   ├── client.ts             ← axios 인스턴스, 인터셉터, 토큰 관리
│   ├── tasks.ts              ← 태스크 CRUD, 완료, 이동, 일괄처리
│   ├── workflows.ts          ← 워크플로우 템플릿/인스턴스 CRUD
│   ├── worklogs.ts           ← 업무일지 CRUD, 교훈, 후속업무
│   ├── funds.ts              ← 펀드 CRUD, LP, 핵심조건, 통지기간, 마이그레이션
│   ├── investments.ts        ← 투자, 포트폴리오기업, 밸류에이션, 투심위
│   ├── capitalCalls.ts       ← 자본금 콜, LP 출자이력
│   ├── distributions.ts      ← 배분 CRUD
│   ├── exits.ts              ← 엑시트 위원회, 매매, 정산
│   ├── compliance.ts         ← 컴플라이언스 규칙, 의무, 체크, LLM
│   ├── accounting.ts         ← 계정과목, 분개, 시산표, 수수료
│   ├── documents.ts          ← 문서 생성, 템플릿, 첨부파일
│   ├── reports.ts            ← 사업보고서, VICS, 내부검토, 정기보고서
│   ├── users.ts              ← 인증, 사용자, 초대
│   ├── dashboard.ts          ← 대시보드 API
│   └── misc.ts               ← 캘린더, 검색, 체크리스트, GP엔티티 등
├── queryInvalidation.ts      ← (기존 유지)
└── api.ts                    ← (삭제 또는 re-export 전용)
```

### 1-2. client.ts 추출

#### [NEW] `frontend/src/lib/api/client.ts`

api.ts에서 다음 코드를 추출:
- `const api = axios.create({ baseURL: '/api' })` 인스턴스
- `getAccessToken()`, `getRefreshToken()`, `setAuthTokens()`, `clearAuthTokens()`
- request interceptor (Bearer 토큰 자동 추가)
- response interceptor (401 → 리프레시 → 재시도)
- `refreshAuthToken()` 함수
- `toastBridge` import 및 에러 핸들링

```typescript
// client.ts
import axios from 'axios';
import { toastBridge } from '../toastBridge';

export const api = axios.create({ baseURL: '/api' });

// ... 토큰 관리 함수들 ...
// ... 인터셉터들 ...

export { getAccessToken, getRefreshToken, setAuthTokens, clearAuthTokens };
```

### 1-3. 도메인별 파일 추출

각 도메인 파일에서 `api`를 `client.ts`에서 import:

```typescript
// tasks.ts 예시
import { api } from './client';

export async function fetchTasks(params?: { ... }) { ... }
export async function createTask(data: TaskCreate) { ... }
export async function updateTask(id: number, data: TaskUpdate) { ... }
// ... 기존 api.ts에서 태스크 관련 함수만 이동
```

**작업 순서:**
1. `client.ts` 추출 (인스턴스 + 인터셉터)
2. 각 도메인 파일 생성 (함수 이동)
3. `index.ts`에서 전부 re-export
4. 기존 `api.ts`를 `index.ts`로 교체 (또는 api.ts를 re-export 파일로 변환)

### 1-4. index.ts (호환 레이어)

#### [NEW] `frontend/src/lib/api/index.ts`

```typescript
// 기존 import { fetchTasks, createTask } from '../lib/api' 가
// 그대로 동작하도록 모든 함수 re-export
export * from './client';
export * from './tasks';
export * from './workflows';
export * from './worklogs';
export * from './funds';
export * from './investments';
export * from './capitalCalls';
export * from './distributions';
export * from './exits';
export * from './compliance';
export * from './accounting';
export * from './documents';
export * from './reports';
export * from './users';
export * from './dashboard';
export * from './misc';
```

### 1-5. 기존 api.ts 처리

기존 `frontend/src/lib/api.ts` 파일을 **삭제**하고, `frontend/src/lib/api/` 디렉토리의 `index.ts`가 동일 경로로 resolve되도록 함.

**검증:** 모든 페이지에서 `import { ... } from '../lib/api'` 또는 `'../../lib/api'` 가 정상 동작하는지 확인.

---

## Part 2. 상수 파일 통합

### 2-1. 상태값 상수

#### [NEW] `frontend/src/lib/constants.ts`

```typescript
/** 태스크 상태 */
export const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const;
export type TaskStatus = typeof TASK_STATUS[keyof typeof TASK_STATUS];

/** 태스크 사분면 */
export const QUADRANT = {
  Q1: 'Q1',
  Q2: 'Q2',
  Q3: 'Q3',
  Q4: 'Q4',
} as const;
export type Quadrant = typeof QUADRANT[keyof typeof QUADRANT];

/** 워크플로우 상태 */
export const WORKFLOW_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

/** 펀드 상태 */
export const FUND_STATUS = {
  FORMING: 'forming',
  ACTIVE: 'active',
  WINDING_DOWN: 'winding_down',
  DISSOLVED: 'dissolved',
} as const;

/** 한국어 라벨 매핑 */
export const TASK_STATUS_LABEL: Record<string, string> = {
  pending: '대기',
  in_progress: '진행중',
  completed: '완료',
};

export const QUADRANT_LABEL: Record<string, string> = {
  Q1: '긴급&중요',
  Q2: '중요&비긴급',
  Q3: '긴급&비중요',
  Q4: '비긴급&비중요',
};

/** 색상 시맨틱 */
export const STATUS_COLORS = {
  success: { bg: 'tag-green', icon: '✓', label: '완료' },
  warning: { bg: 'tag-amber', icon: '⚡', label: '주의' },
  danger:  { bg: 'tag-red',   icon: '⚠', label: '위험' },
  info:    { bg: 'tag-blue',  icon: 'ℹ', label: '정보' },
  pending: { bg: 'tag-gray',  icon: '○', label: '대기' },
  overdue: { bg: 'tag-red',   icon: '🔴', label: '지연' },
} as const;

/** staleTime 상수 */
export const STALE_TIMES = {
  DASHBOARD: 30 * 1000,      // 30초
  LIST: 60 * 1000,            // 1분
  DETAIL: 5 * 60 * 1000,     // 5분
  STATIC: 30 * 60 * 1000,    // 30분
} as const;
```

### 2-2. 기존 코드에서 하드코딩 교체

모든 페이지에서 다음 패턴을 검색하여 상수로 교체:
- `'pending'` → `TASK_STATUS.PENDING`
- `'대기'` → `TASK_STATUS_LABEL[status]`
- `staleTime: 30000` → `staleTime: STALE_TIMES.DASHBOARD`
- `'Q1'` → `QUADRANT.Q1`

**주의:** 이 Phase에서는 API 응답에서 비교하는 부분만 교체. API 전송 값은 동일하게 유지.

---

## Part 3. React Query 키 관리

### 3-1. 쿼리 키 상수

#### [NEW] `frontend/src/lib/queryKeys.ts`

```typescript
export const queryKeys = {
  tasks: {
    all: ['tasks'] as const,
    board: () => [...queryKeys.tasks.all, 'board'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.tasks.all, 'list', filters] as const,
    detail: (id: number) => [...queryKeys.tasks.all, id] as const,
    categories: ['task-categories'] as const,
  },
  workflows: {
    all: ['workflows'] as const,
    templates: () => [...queryKeys.workflows.all, 'templates'] as const,
    instances: (filters?: Record<string, unknown>) => [...queryKeys.workflows.all, 'instances', filters] as const,
    detail: (id: number) => [...queryKeys.workflows.all, id] as const,
  },
  funds: {
    all: ['funds'] as const,
    list: () => [...queryKeys.funds.all, 'list'] as const,
    detail: (id: number) => [...queryKeys.funds.all, id] as const,
    lps: (fundId: number) => [...queryKeys.funds.detail(fundId), 'lps'] as const,
    overview: ['fund-overview'] as const,
  },
  investments: {
    all: ['investments'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.investments.all, 'list', filters] as const,
    detail: (id: number) => [...queryKeys.investments.all, id] as const,
    companies: ['companies'] as const,
  },
  dashboard: {
    base: ['dashboard', 'base'] as const,
    workflows: ['dashboard', 'workflows'] as const,
    sidebar: ['dashboard', 'sidebar'] as const,
    completed: ['dashboard', 'completed'] as const,
  },
  worklogs: {
    all: ['worklogs'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.worklogs.all, 'list', filters] as const,
    insights: (filters?: Record<string, unknown>) => [...queryKeys.worklogs.all, 'insights', filters] as const,
  },
  capitalCalls: {
    all: ['capital-calls'] as const,
    list: (fundId?: number) => [...queryKeys.capitalCalls.all, 'list', fundId] as const,
    summary: (fundId: number) => [...queryKeys.capitalCalls.all, 'summary', fundId] as const,
  },
  compliance: {
    all: ['compliance'] as const,
    rules: () => [...queryKeys.compliance.all, 'rules'] as const,
    obligations: (filters?: Record<string, unknown>) => [...queryKeys.compliance.all, 'obligations', filters] as const,
    checks: (filters?: Record<string, unknown>) => [...queryKeys.compliance.all, 'checks', filters] as const,
  },
  // 기타 도메인도 동일 패턴으로 추가
} as const;
```

### 3-2. 기존 쿼리 키 교체

모든 `useQuery({ queryKey: ['tasks', ...] })` 패턴을 `queryKey: queryKeys.tasks.list(...)` 으로 교체.

`queryInvalidation.ts`도 queryKeys 사용하도록 업데이트.

---

## Part 4. ErrorBoundary 컴포넌트

### 4-1. ErrorBoundary 생성

#### [NEW] `frontend/src/components/ErrorBoundary.tsx`

```typescript
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="page-container">
          <div className="card-base text-center py-16">
            <p className="text-lg font-semibold" style={{ color: 'var(--color-danger)' }}>
              페이지 로딩 중 오류가 발생했습니다
            </p>
            <p className="mt-2 text-sm" style={{ color: 'var(--theme-text-secondary)' }}>
              {this.state.error?.message}
            </p>
            <button
              className="primary-btn mt-4"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

### 4-2. App.tsx에 적용

#### [MODIFY] `frontend/src/App.tsx`

각 라우트를 ErrorBoundary로 감싸기:

```tsx
<Route path="/dashboard" element={
  <ErrorBoundary>
    <DashboardPage />
  </ErrorBoundary>
} />
```

또는 Layout 컴포넌트 내부의 `<Outlet />`을 ErrorBoundary로 감싸기:

```tsx
// Layout.tsx
<ErrorBoundary>
  <Outlet />
</ErrorBoundary>
```

---

## Part 5. 포맷 유틸리티

### 5-1. 날짜/금액 통합 포맷

#### [NEW] `frontend/src/lib/format.ts`

```typescript
/**
 * 날짜 포맷
 * @param date - ISO string 또는 Date 객체
 * @param style - 'short' (3/1), 'medium' (2026.03.01), 'long' (2026년 3월 1일), 'relative' (3일 전)
 */
export function formatDate(date: string | Date | null | undefined, style: 'short' | 'medium' | 'long' | 'relative' = 'medium'): string { ... }

/**
 * 금액 포맷 (한국 원화)
 * @param amount - 숫자
 * @param unit - 'won' (₩1,234,567), 'man' (123만), 'eok' (1.2억)
 */
export function formatKRW(amount: number | null | undefined, unit: 'won' | 'man' | 'eok' = 'won'): string { ... }

/**
 * D-day 계산
 * @returns { text: 'D-3', urgency: 'warning' | 'danger' | 'info' | 'overdue' }
 */
export function calcDday(deadline: string | Date): { text: string; urgency: string } { ... }

/**
 * 시간 포맷
 * @param minutes - 분 단위
 * @returns '2h 30m' 또는 '45m'
 */
export function formatDuration(minutes: number): string { ... }
```

### 5-2. 기존 인라인 포맷 교체

각 페이지에서 직접 `toLocaleString()`, `toLocaleDateString()` 사용하는 부분을 `formatKRW()`, `formatDate()`로 교체.

**우선 적용 대상:** DashboardPage, TaskBoardPage, FundsPage, FundDetailPage

---

## 검증 체크리스트

- [ ] `npm run dev` 정상 기동, 콘솔 에러 없음
- [ ] `frontend/src/lib/api.ts` 파일이 삭제되고 `frontend/src/lib/api/` 디렉토리로 교체됨
- [ ] 모든 페이지에서 API 호출 정상 동작 (import 경로 호환)
- [ ] `constants.ts` import 후 기존 하드코딩 문자열이 상수로 교체됨
- [ ] `queryKeys.ts` import 후 기존 배열 리터럴이 상수로 교체됨
- [ ] ErrorBoundary가 Layout에 적용되어 페이지 에러 시 fallback UI 표시
- [ ] `format.ts`의 formatDate, formatKRW 함수가 주요 페이지에 적용됨
- [ ] git commit: `refactor: Phase 59 frontend code restructure`
