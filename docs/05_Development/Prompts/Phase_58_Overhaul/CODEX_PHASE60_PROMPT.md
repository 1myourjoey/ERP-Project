# Phase 60: UI 공통 컴포넌트 라이브러리

> **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> **의존성:** Phase 59 완료
> **근거:** `docs/UXUI_IMPROVEMENT_STRATEGY.md` §4 디자인 시스템 정비 계획

**Priority:** P0 — 모든 UX 개선 Phase에서 사용할 공통 컴포넌트
**핵심 원칙:**
1. **기존 디자인 토큰 활용** — index.css의 CSS 변수 체계 그대로 사용
2. **점진적 적용** — 컴포넌트 생성 후, 이 Phase에서는 1~2개 페이지에만 시범 적용
3. **Tailwind 직접 사용 최소화** — 시스템 클래스(primary-btn 등) 우선

---

## Part 0. 전수조사 (필수)

- [ ] `frontend/src/index.css` — 기존 CSS 유틸리티 클래스 전체 목록 파악
- [ ] `frontend/src/components/` — 기존 공통 컴포넌트 목록 (DrawerOverlay, EmptyState, PageLoading, Toast 등)
- [ ] `frontend/src/components/common/` — 기존 공통 컴포넌트 (FileAttachmentPanel, DataFilterBar 등)
- [ ] 각 페이지에서 `window.confirm()`, `window.prompt()` 사용 위치 전수조사
- [ ] 각 페이지에서 `tag tag-*` 클래스 사용 패턴 확인 (색상만 사용 vs 아이콘 병행)

---

## Part 1. ConfirmDialog 컴포넌트

### 목적
`window.confirm()`, `window.prompt()` 완전 대체. 디자인 시스템 일관성 + 접근성 확보.

#### [NEW] `frontend/src/components/ui/ConfirmDialog.tsx`

```typescript
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  detail?: string;                    // 영향 범위 설명 (예: "LP 5건이 함께 삭제됩니다")
  confirmLabel?: string;              // 기본값: "확인"
  cancelLabel?: string;               // 기본값: "취소"
  variant?: 'danger' | 'warning' | 'info';  // 기본값: 'info'
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  /** prompt 모드: 텍스트 입력이 필요한 경우 */
  promptMode?: boolean;
  promptLabel?: string;               // 입력 필드 라벨
  promptType?: 'text' | 'number' | 'date';
  promptDefaultValue?: string;
  onPromptConfirm?: (value: string) => void;  // prompt 모드일 때 사용
}
```

**구현 요구사항:**
1. `fixed inset-0 z-50` 오버레이 + 중앙 모달
2. `modal-overlay` + `modal-content` CSS 클래스 사용 (기존 index.css)
3. variant에 따라 확인 버튼 스타일 변경:
   - `danger` → `danger-btn`
   - `warning` → `primary-btn` (주의 색상 아이콘 추가)
   - `info` → `primary-btn`
4. ESC 키 → onCancel
5. 오버레이 클릭 → onCancel
6. **포커스 트래핑**: 열릴 때 확인 버튼에 autoFocus, Tab으로 버튼 간 이동만 허용
7. `loading` 시 확인 버튼 disabled + 스피너
8. `promptMode` 시 input 필드 표시, Enter → onPromptConfirm
9. `detail` 있으면 message 아래에 작은 글씨 + 경고 배경으로 표시

**시범 적용 (이 Phase에서):**
- `ExitsPage.tsx` — 정산 처리 `window.prompt()` → ConfirmDialog promptMode
- `CalendarPage.tsx` — 이벤트 삭제 `window.confirm()` → ConfirmDialog
- `UsersPage.tsx` — 비밀번호 초기화 `window.prompt()` → ConfirmDialog promptMode

---

## Part 2. StatusBadge 컴포넌트

### 목적
색상만으로 상태 표시하던 패턴을 **아이콘 + 텍스트 + 색상** 3중 표시로 개선.

#### [NEW] `frontend/src/components/ui/StatusBadge.tsx`

```typescript
interface StatusBadgeProps {
  status: 'success' | 'warning' | 'danger' | 'info' | 'pending' | 'overdue';
  label: string;                      // 표시 텍스트
  size?: 'sm' | 'md';                // 기본값: 'sm'
  showIcon?: boolean;                 // 기본값: true
}
```

**구현 요구사항:**
1. 기존 `tag` 클래스 확장 (index.css의 .tag 스타일 기반)
2. 상태별 매핑 (constants.ts의 STATUS_COLORS 참조):
   ```
   success → tag-green + ✓ 아이콘
   warning → tag-amber + ⚡ 아이콘
   danger  → tag-red   + ✕ 아이콘
   info    → tag-blue  + ℹ 아이콘
   pending → tag-gray  + ○ 아이콘
   overdue → tag-red   + ⏰ 아이콘
   ```
3. `size='sm'` → 기존 .tag 크기 (11px)
4. `size='md'` → 약간 큰 버전 (13px, padding 약간 증가)
5. 아이콘은 Lucide React 사용 (Check, AlertTriangle, X, Info, Circle, Clock)
6. `showIcon={false}` 시 텍스트만 표시 (하위 호환)

**시범 적용:**
- `DocumentsPage.tsx` — 서류 상태 배지
- `TaskBoardPage.tsx` — 태스크 긴급 배지

---

## Part 3. FilterPanel 컴포넌트

### 목적
8개+ 필터가 나열되는 문제를 접이식 패널로 개선.

#### [NEW] `frontend/src/components/ui/FilterPanel.tsx`

```typescript
interface FilterConfig {
  key: string;
  label: string;
  type: 'select' | 'date' | 'text' | 'toggle';
  options?: { value: string; label: string }[];  // select용
  placeholder?: string;
}

interface FilterPanelProps {
  filters: FilterConfig[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  onReset: () => void;
  /** 항상 표시할 필터 개수 (나머지는 접기) */
  visibleCount?: number;              // 기본값: 3
}
```

**구현 요구사항:**
1. 데스크톱: `visibleCount`개 필터 가로 나열 + "필터 더보기 (N)" 버튼
2. "필터 더보기" 클릭 → 나머지 필터 아래에 펼쳐짐 (애니메이션)
3. 모바일: "필터 (N개 적용)" 버튼 → 클릭 시 전체 필터 드롭다운
4. 활성 필터 수를 배지로 표시: `필터 (3)`
5. "초기화" 버튼 항상 표시 (활성 필터 있을 때만 활성)
6. 각 필터 타입별 렌더링:
   - `select` → `<select className="form-input-sm">`
   - `date` → `<input type="date" className="form-input-sm">`
   - `text` → `<input type="text" className="form-input-sm" placeholder={...}>`
   - `toggle` → 토글 버튼 (on/off)

**시범 적용:**
- `TaskBoardPage.tsx` — 기존 8개 필터를 FilterPanel로 교체

---

## Part 4. DataTable 컴포넌트

### 목적
페이지마다 다른 테이블 패턴을 통일. 반응형 + 정렬 + 빈 상태.

#### [NEW] `frontend/src/components/ui/DataTable.tsx`

```typescript
interface Column<T> {
  key: string;
  header: string;
  priority: 1 | 2 | 3;           // 1=항상, 2=태블릿+, 3=데스크톱만
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;                  // Tailwind width (예: 'w-32')
  render?: (row: T, index: number) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string | number;
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  onRowClick?: (row: T) => void;
  /** 모바일에서 카드형으로 전환 */
  mobileCardRender?: (row: T) => React.ReactNode;
  /** 정렬 */
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  /** 행 선택 */
  selectable?: boolean;
  selectedKeys?: Set<string | number>;
  onSelectionChange?: (keys: Set<string | number>) => void;
  /** sticky 헤더 */
  stickyHeader?: boolean;
}
```

**구현 요구사항:**
1. 기존 `table-head-row`, `table-head-cell`, `table-body-cell` CSS 클래스 사용
2. 반응형: `priority=3` 컬럼은 `hidden lg:table-cell`, `priority=2`는 `hidden md:table-cell`
3. 모바일 (`< md`): `mobileCardRender` 있으면 카드 리스트, 없으면 수평 스크롤
4. 정렬: 헤더 클릭 → `onSort` 콜백 + 정렬 화살표 아이콘
5. 로딩: 스켈레톤 행 5개 표시
6. 빈 상태: EmptyState 컴포넌트 활용
7. `stickyHeader`: `sticky top-0 z-10` 적용
8. `selectable`: 체크박스 컬럼 자동 추가 (첫 번째 컬럼)
9. 행 hover: `hover:bg-[var(--theme-hover)]`

**시범 적용:**
- `LPManagementPage.tsx` — 11칼럼 테이블을 DataTable로 교체

---

## Part 5. 추가 공통 컴포넌트

### 5-1. FormModal

#### [NEW] `frontend/src/components/ui/FormModal.tsx`

```typescript
interface FormModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel?: string;        // 기본값: "저장"
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';  // 기본값: 'md'
  children: React.ReactNode;
}
```

테이블 내 인라인 폼 대체용. `modal-overlay` + `modal-content` 스타일 사용.
size: sm(max-w-md), md(max-w-lg), lg(max-w-2xl)

### 5-2. PageSkeleton

#### [NEW] `frontend/src/components/ui/PageSkeleton.tsx`

```typescript
interface PageSkeletonProps {
  /** 스켈레톤 타입 */
  type: 'dashboard' | 'table' | 'form' | 'detail';
}
```

각 타입별 스켈레톤 UI (회색 pulse 블록):
- `dashboard`: 헤더 + 스탯 카드 4개 + 콘텐츠 영역 2개
- `table`: 헤더 + 행 8개
- `form`: 라벨+입력 6줄
- `detail`: 탭 바 + 카드 3개

### 5-3. InlineEdit

#### [NEW] `frontend/src/components/ui/InlineEdit.tsx`

```typescript
interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => void;
  type?: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
  loading?: boolean;
}
```

단일 필드 인라인 편집. 클릭 → 입력모드 → Enter/Blur → 저장 + ✓ 아이콘 표시.

---

## Part 6. index.css 보강

### 6-1. 추가 CSS 유틸리티

#### [MODIFY] `frontend/src/index.css`

기존 스타일 아래에 추가:

```css
/* === 스켈레톤 로더 === */
.skeleton {
  background: linear-gradient(90deg,
    var(--theme-border) 25%,
    color-mix(in srgb, var(--theme-border) 60%, var(--theme-bg-elevated)) 37%,
    var(--theme-border) 63%
  );
  background-size: 200% 100%;
  animation: skeleton-pulse 1.4s ease-in-out infinite;
  border-radius: 8px;
}

@keyframes skeleton-pulse {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* === 접이식 패널 트랜지션 === */
.collapsible-enter {
  max-height: 0;
  overflow: hidden;
  transition: max-height 200ms ease-out;
}

.collapsible-enter-active {
  max-height: 500px;
}
```

---

## 검증 체크리스트

- [ ] `npm run dev` 정상 기동
- [ ] ConfirmDialog: ExitsPage 정산 처리에서 `window.prompt` 대신 모달 표시
- [ ] ConfirmDialog: CalendarPage 삭제에서 `window.confirm` 대신 모달 표시
- [ ] StatusBadge: DocumentsPage에서 색상+아이콘+텍스트 3중 표시
- [ ] FilterPanel: TaskBoardPage에서 필터 접이식 동작
- [ ] DataTable: LPManagementPage에서 반응형 테이블 동작 (데스크톱 테이블 / 모바일 카드)
- [ ] FormModal: 기본 렌더링 확인
- [ ] PageSkeleton: 기본 렌더링 확인
- [ ] 기존 페이지 동작 무결성 (대시보드, 태스크, 펀드)
- [ ] git commit: `feat: Phase 60 UI component library`
