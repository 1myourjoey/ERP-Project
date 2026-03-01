# Phase 61: 폼 시스템 & 코드 스플리팅

> **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> **의존성:** Phase 60 완료
> **근거:** `docs/ERP_ANALYSIS_AND_STRATEGY.md` §5.2, `docs/UXUI_IMPROVEMENT_STRATEGY.md` §9

**Priority:** P1 — UX 개선 전 성능/폼 기반 확보
**핵심 원칙:**
1. **react-hook-form + zod로 폼 검증 표준화**
2. **React.lazy로 라우트별 코드 스플리팅**
3. **기존 폼 동작 유지하면서 점진적 마이그레이션**

---

## Part 0. 전수조사 (필수)

- [ ] `frontend/package.json` — 현재 의존성 확인
- [ ] `frontend/src/App.tsx` — 라우트 구조 및 import 방식 확인
- [ ] 가장 복잡한 폼 3개 파악: FundDetailPage, WorkflowsPage, ExitsPage의 폼 구조

---

## Part 1. 의존성 추가

```bash
cd frontend
npm install react-hook-form zod @hookform/resolvers
```

---

## Part 2. 폼 스키마 & 커스텀 훅

### 2-1. Zod 스키마 정의

#### [NEW] `frontend/src/lib/schemas/task.ts`

```typescript
import { z } from 'zod';

export const taskCreateSchema = z.object({
  title: z.string().min(1, '제목을 입력해주세요'),
  quadrant: z.enum(['Q1', 'Q2', 'Q3', 'Q4']),
  deadline: z.string().optional(),
  estimated_time: z.string().optional(),
  memo: z.string().optional(),
  category: z.string().optional(),
  fund_id: z.number().optional().nullable(),
  investment_id: z.number().optional().nullable(),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export const taskCompleteSchema = z.object({
  actual_time: z.string().min(1, '실제 소요시간을 입력해주세요'),
  auto_worklog: z.boolean().default(true),
  memo: z.string().optional(),
});
```

#### [NEW] `frontend/src/lib/schemas/fund.ts`

```typescript
import { z } from 'zod';

export const fundCreateSchema = z.object({
  name: z.string().min(1, '조합명을 입력해주세요'),
  type: z.string().min(1, '조합 유형을 선택해주세요'),
  formation_date: z.string().optional(),
  gp: z.string().optional(),
  fund_manager: z.string().optional(),
  mgmt_fee_rate: z.number().min(0).max(1).optional(),
  performance_fee_rate: z.number().min(0).max(1).optional(),
  hurdle_rate: z.number().min(0).max(1).optional(),
});

export const lpCreateSchema = z.object({
  name: z.string().min(1, 'LP명을 입력해주세요'),
  type: z.string().min(1, '유형을 선택해주세요'),
  commitment: z.number().min(0, '약정금액을 입력해주세요'),
  paid_in: z.number().min(0).default(0),
  business_number: z.string().optional(),
  contact: z.string().optional(),
  address: z.string().optional(),
});
```

#### [NEW] `frontend/src/lib/schemas/index.ts`

모든 스키마 re-export.

### 2-2. 폼 래퍼 훅

#### [NEW] `frontend/src/hooks/useFormWithSchema.ts`

```typescript
import { useForm, type UseFormReturn, type DefaultValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ZodSchema } from 'zod';

export function useFormWithSchema<T extends Record<string, any>>(
  schema: ZodSchema<T>,
  defaultValues?: DefaultValues<T>
): UseFormReturn<T> {
  return useForm<T>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: 'onBlur',  // 포커스 잃을 때 검증
  });
}
```

### 2-3. 폼 필드 컴포넌트

#### [NEW] `frontend/src/components/ui/FormField.tsx`

```typescript
import { type FieldError } from 'react-hook-form';

interface FormFieldProps {
  label: string;
  error?: FieldError;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function FormField({ label, error, required, children, className }: FormFieldProps) {
  return (
    <div className={className}>
      <label className="form-label">
        {label}
        {required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs" style={{ color: 'var(--color-danger)' }}>
          {error.message}
        </p>
      )}
    </div>
  );
}
```

### 2-4. 시범 적용

**이 Phase에서 react-hook-form으로 마이그레이션할 폼:**
1. `EditTaskModal.tsx` — 태스크 편집 폼
2. `CompleteModal.tsx` — 태스크 완료 폼
3. `QuickTaskAddModal.tsx` — 대시보드 퀵 태스크 추가

기존 `useState` 기반 폼 → `useFormWithSchema` + `FormField` 로 교체.
**나머지 폼은 Phase 62~66에서 각 페이지 개선 시 점진적으로 마이그레이션.**

---

## Part 3. 코드 스플리팅

### 3-1. React.lazy 적용

#### [MODIFY] `frontend/src/App.tsx`

```typescript
import { lazy, Suspense } from 'react';
import { PageSkeleton } from './components/ui/PageSkeleton';

// 핵심 페이지 (즉시 로드)
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';

// 나머지 페이지 (lazy 로드)
const TaskBoardPage = lazy(() => import('./pages/TaskBoardPage'));
const WorkflowsPage = lazy(() => import('./pages/WorkflowsPage'));
const WorkLogsPage = lazy(() => import('./pages/WorkLogsPage'));
const FundsPage = lazy(() => import('./pages/FundsPage'));
const FundDetailPage = lazy(() => import('./pages/FundDetailPage'));
const InvestmentsPage = lazy(() => import('./pages/InvestmentsPage'));
const InvestmentDetailPage = lazy(() => import('./pages/InvestmentDetailPage'));
const AccountingPage = lazy(() => import('./pages/AccountingPage'));
const TransactionsPage = lazy(() => import('./pages/TransactionsPage'));
const ValuationsPage = lazy(() => import('./pages/ValuationsPage'));
const ExitsPage = lazy(() => import('./pages/ExitsPage'));
const CompliancePage = lazy(() => import('./pages/CompliancePage'));
const BizReportsPage = lazy(() => import('./pages/BizReportsPage'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const FeeManagementPage = lazy(() => import('./pages/FeeManagementPage'));
const LPManagementPage = lazy(() => import('./pages/LPManagementPage'));
// ... 기타 모든 페이지
```

### 3-2. Suspense 래퍼

Layout 컴포넌트의 `<Outlet />` 을 Suspense로 감싸기:

#### [MODIFY] `frontend/src/components/Layout.tsx`

```tsx
import { Suspense } from 'react';
import { PageSkeleton } from './ui/PageSkeleton';

// Outlet 부분:
<ErrorBoundary>
  <Suspense fallback={<PageSkeleton type="table" />}>
    <Outlet />
  </Suspense>
</ErrorBoundary>
```

### 3-3. 페이지 default export 확인

lazy()는 default export를 요구함. 각 페이지 파일이 `export default function XxxPage()` 패턴인지 확인.
만약 named export만 있으면:
```typescript
const TaskBoardPage = lazy(() =>
  import('./pages/TaskBoardPage').then(m => ({ default: m.TaskBoardPage }))
);
```

---

## Part 4. Vite 빌드 최적화

#### [MODIFY] `frontend/vite.config.ts`

```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-ui': ['lucide-react'],
        },
      },
    },
  },
});
```

---

## 검증 체크리스트

- [ ] `npm install` 후 `npm run dev` 정상 기동
- [ ] EditTaskModal에서 zod 유효성 검증 동작 (빈 제목 → 에러 메시지)
- [ ] CompleteModal에서 react-hook-form 동작
- [ ] 페이지 이동 시 lazy loading 동작 (네트워크 탭에서 청크 분리 확인)
- [ ] Suspense fallback (PageSkeleton) 표시 확인
- [ ] `npm run build` 성공 + 번들 크기 확인 (vendor 청크 분리)
- [ ] 기존 모든 폼 동작 무결성
- [ ] git commit: `feat: Phase 61 form system and code splitting`
