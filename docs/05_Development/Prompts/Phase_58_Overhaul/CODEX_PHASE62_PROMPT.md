# Phase 62: 대시보드 & 네비게이션 UX 개선

> **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> **의존성:** Phase 61 완료
> **근거:** `docs/UXUI_IMPROVEMENT_STRATEGY.md` §3.1, §6.1

**Priority:** P0 — 매일 가장 먼저 보는 화면
**핵심 원칙:**
1. **모달 상태 통합** — 11개 useState → useReducer + ModalState enum
2. **아침 브리핑 뷰** — 긴급 알림 최상단 + 자금 현황 + 오늘 예상 시간 합계
3. **네비게이션 25→15 메뉴** — 도메인별 그룹핑

---

## Part 0. 전수조사 (필수)

- [ ] `frontend/src/pages/DashboardPage.tsx` — 모든 useState 목록, prop drilling 구조
- [ ] `frontend/src/components/dashboard/DashboardDefaultView.tsx` — 레이아웃 구조, 스탯 카드
- [ ] `frontend/src/components/dashboard/DashboardOverlayLayer.tsx` — 받는 props 수
- [ ] `frontend/src/components/Layout.tsx` — 현재 네비게이션 메뉴 항목 전체
- [ ] `frontend/src/App.tsx` — 라우트 정의 전체

---

## Part 1. 대시보드 모달 상태 통합

### 1-1. ModalState 리듀서

#### [MODIFY] `frontend/src/pages/DashboardPage.tsx`

기존 개별 useState:
```typescript
// 제거 대상:
const [completingTask, setCompletingTask] = useState(null);
const [editingTask, setEditingTask] = useState(null);
const [selectedTask, setSelectedTask] = useState(null);
const [selectedTaskEditable, setSelectedTaskEditable] = useState(false);
const [showQuickAddModal, setShowQuickAddModal] = useState(false);
// ... 기타
```

→ useReducer로 통합:
```typescript
type ModalState =
  | { type: 'idle' }
  | { type: 'task-detail'; taskId: number; editable: boolean }
  | { type: 'task-edit'; task: Task }
  | { type: 'task-complete'; task: Task }
  | { type: 'quick-add'; defaultDate?: string }
  | { type: 'workflow-timeline'; instanceId: number };

function modalReducer(state: ModalState, action: ModalAction): ModalState { ... }

const [modal, dispatch] = useReducer(modalReducer, { type: 'idle' });
```

### 1-2. DashboardOverlayLayer props 축소

#### [MODIFY] `frontend/src/components/dashboard/DashboardOverlayLayer.tsx`

기존 19+ props → `modal: ModalState` + `dispatch: Dispatch` 2개 props로 축소.

---

## Part 2. 아침 브리핑 뷰

### 2-1. 긴급 알림 배너

#### [MODIFY] `frontend/src/components/dashboard/DashboardDefaultView.tsx`

대시보드 최상단에 긴급 알림 배너 추가:

```
조건: 오늘 마감 태스크, 오늘 마감 컴플라이언스 의무, 미납 출자금 등
표시: warning-banner 스타일, 좌측 아이콘 + 긴급 항목 목록 + 우측 "바로가기" 버튼
항목 없으면 배너 숨김
```

### 2-2. 오늘 태스크 시간 합계

오늘 태스크 패널 헤더에 `예상 총 소요시간` 표시:

```
📋 오늘 (5건 · 예상 4h 30m)
```

기존 태스크 데이터에서 `estimated_time` 합산.

### 2-3. 스탯 카드 개선

기존 5개 스탯 카드 → 핵심 4개로 축소 + 클릭 네비게이션:

```
[오늘 태스크 N건] [진행중 워크플로우 N건] [이번달 컴플라이언스 N건] [마감 임박 N건]
 → /tasks          → /workflows           → /compliance           → /tasks?due=week
```

각 카드에 작은 추세 아이콘 (↑ 증가, ↓ 감소, → 유지) 추가 (전일 대비).

---

## Part 3. 네비게이션 구조 재설계

### 3-1. 메뉴 그룹화

#### [MODIFY] `frontend/src/components/Layout.tsx`

현재 25+ 평면 메뉴 → 6개 그룹 15개 메뉴로 축소:

```typescript
const NAV_GROUPS = [
  {
    label: '업무',
    items: [
      { path: '/dashboard', label: '대시보드', icon: LayoutDashboard },
      { path: '/tasks', label: '태스크', icon: CheckSquare },
      { path: '/workflows', label: '워크플로우', icon: GitBranch },
      { path: '/worklogs', label: '업무일지', icon: FileText },
      { path: '/calendar', label: '캘린더', icon: Calendar },
    ],
  },
  {
    label: '펀드',
    items: [
      { path: '/funds', label: '펀드', icon: Briefcase },
      { path: '/investments', label: '투자', icon: TrendingUp },
      { path: '/exits', label: '엑시트', icon: LogOut },
    ],
  },
  {
    label: '재무',
    items: [
      { path: '/accounting', label: '회계', icon: Calculator },
      { path: '/fee-management', label: '수수료', icon: DollarSign },
    ],
  },
  {
    label: '보고',
    items: [
      { path: '/compliance', label: '컴플라이언스', icon: Shield },
      { path: '/biz-reports', label: '사업보고서', icon: BarChart },
    ],
  },
  {
    label: '관리',
    items: [
      { path: '/lp-management', label: 'LP 관리', icon: Users },
      { path: '/documents', label: '문서', icon: FileBox },
      { path: '/users', label: '사용자', icon: UserCog },
    ],
  },
];
```

### 3-2. 통합 라우트 처리

기존에 별도 메뉴였던 페이지들의 접근 경로:
- `/fund-overview` → `/funds` 페이지의 탭으로 통합
- `/transactions`, `/valuations` → `/investments` 하위 탭 또는 FundDetail 내
- `/capital-calls`, `/distributions` → `/funds/:id` (FundDetail) 내 탭
- `/vics`, `/internal-reviews`, `/reports` → `/compliance` 또는 `/biz-reports` 내 탭
- `/templates`, `/documents/generate` → `/documents` 내 탭
- `/lp-address-book` → `/lp-management` 리다이렉트 (이미 존재)

**주의:** 라우트 자체는 유지 (직접 URL 접근 보장). 네비게이션 메뉴에서만 숨김.

### 3-3. 드롭다운 키보드 접근성

네비게이션 드롭다운에 키보드 탐색 추가:
- `ArrowDown/ArrowUp` → 드롭다운 내 항목 이동
- `Enter` → 선택
- `Escape` → 닫기 (이미 구현)
- `Tab` → 다음 그룹으로 이동

---

## 검증 체크리스트

- [ ] 대시보드 모달: 태스크 클릭 → 상세 모달, 편집, 완료 모달 모두 정상
- [ ] 긴급 알림 배너: 오늘 마감 태스크가 있으면 상단에 표시
- [ ] 오늘 태스크 시간 합계: 정확한 합산값 표시
- [ ] 네비게이션: 6개 그룹으로 재구성, 기존 모든 라우트 접근 가능
- [ ] 키보드: 드롭다운에서 ArrowDown/Up/Enter/Escape 동작
- [ ] 모바일: 네비게이션 메뉴 정상 표시
- [ ] git commit: `feat: Phase 62 dashboard and navigation UX`
