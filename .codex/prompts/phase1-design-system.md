# Phase 1 — 글로벌 디자인 시스템 교체 (테마 제거 + CSS 전면 리뉴얼)

## 배경 및 목표
현재 프로젝트에는 cream/mint/lavender/default 4종 테마가 존재하지만 1인 관리자 시스템에서 불필요하며,
CSS 변수 구조가 복잡하고 시각적 일관성이 부족합니다.
이번 페이즈에서는 테마 시스템을 완전히 제거하고, UI/UX Pro Max 스타일을 참고한
깔끔하고 일관된 단일 디자인 시스템으로 전면 교체합니다.

참고 레포: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- 위 레포의 디자인 원칙(여백, 타이포, 색상 계층, 카드 시스템 등)을 최대한 반영합니다.

## 기술 스택
- React 19 + TypeScript + Vite
- TailwindCSS v4 (index.css에서 `@import "tailwindcss"` 사용)
- Lucide-react 아이콘
- 폰트: Noto Sans KR (유지)

## 작업 내용

### 1-A. ThemeContext 제거

**파일: `frontend/src/contexts/ThemeContext.tsx`**
- 파일 전체를 삭제합니다.

**파일: `frontend/src/main.tsx`**
- `ThemeProvider` import 및 래핑 코드를 제거합니다.
- 단, `ThemeProvider`가 main.tsx에서 감싸고 있다면 해당 Provider만 제거 (다른 Provider는 유지).

**파일: `frontend/src/components/Layout.tsx`**
아래 항목들을 제거합니다:
1. `import { useTheme } from '../contexts/ThemeContext'` 라인 삭제
2. `const { theme, setTheme, themes } = useTheme()` 라인 삭제
3. `currentThemeIndex`, `currentTheme`, `nextTheme` 관련 useMemo 블록 삭제
4. 테마 전환 버튼 (아이콘 버튼, `onClick={() => setTheme(nextTheme.key)}`) 삭제
5. 모바일 메뉴 내 "Theme" 섹션 전체 삭제 (`<p>Theme</p>` + `grid grid-cols-2 gap-2` 버튼 목록)
6. `useTheme` 관련 state/effect가 있다면 모두 제거
7. 테마 관련 변수(`currentTheme`, `nextTheme` 등) 참조가 남아있지 않도록 정리

주의: Layout.tsx의 나머지 기능(네비게이션, 검색, 알림, 유저 메뉴)은 반드시 그대로 유지합니다.

---

### 1-B. index.css 전면 교체

**파일: `frontend/src/index.css`**

기존 파일을 아래 내용으로 **완전히 교체**합니다.
설계 원칙:
- 단일 라이트 테마 (data-theme 속성 없음)
- 깔끔한 흰색/회색 기반 배경 (그라디언트 배경 오브 제거)
- 충분한 여백과 일관된 radius
- 명확한 타이포 계층
- 기존 CSS 클래스명(.card-base, .primary-btn 등)은 **유지** (다른 파일에서 참조 중)

```css
@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Noto+Sans:wght@400;500;700&display=swap");
@import "tailwindcss";

/* ── 디자인 토큰 ───────────────────────────── */
:root {
  /* Brand */
  --color-primary:   #1a56db;
  --color-primary-dark: #1e40af;
  --color-primary-light: #eff6ff;
  --color-danger:    #dc2626;
  --color-warning:   #d97706;
  --color-success:   #16a34a;

  /* Neutral */
  --color-bg:        #f8fafc;
  --color-surface:   #ffffff;
  --color-border:    #e2e8f0;
  --color-border-strong: #cbd5e1;
  --color-text:      #0f172a;
  --color-text-secondary: #64748b;
  --color-text-muted: #94a3b8;
  --color-hover:     #f1f5f9;

  /* Shadow */
  --shadow-xs:  0 1px 2px rgba(15,23,42,0.06);
  --shadow-sm:  0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.06);
  --shadow-md:  0 4px 6px rgba(15,23,42,0.07), 0 2px 4px rgba(15,23,42,0.06);
  --shadow-lg:  0 10px 15px rgba(15,23,42,0.08), 0 4px 6px rgba(15,23,42,0.05);

  /* Tag colors */
  --tag-blue-bg:    #eff6ff; --tag-blue-text:   #1d4ed8;
  --tag-green-bg:   #f0fdf4; --tag-green-text:  #15803d;
  --tag-amber-bg:   #fffbeb; --tag-amber-text:  #b45309;
  --tag-red-bg:     #fef2f2; --tag-red-text:    #b91c1c;
  --tag-purple-bg:  #faf5ff; --tag-purple-text: #7e22ce;
  --tag-indigo-bg:  #eef2ff; --tag-indigo-text: #4338ca;
  --tag-gray-bg:    #f8fafc; --tag-gray-text:   #475569;
  --tag-emerald-bg: #ecfdf5; --tag-emerald-text:#065f46;
}

/* ── 기본 리셋 ─────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; }

html, body, #root { min-height: 100%; }

body {
  margin: 0;
  font-family: "Noto Sans KR", "Noto Sans", system-ui, sans-serif;
  background-color: var(--color-bg);
  color: var(--color-text);
  -webkit-font-smoothing: antialiased;
}

/* ── 스크롤바 ──────────────────────────────── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 999px; }

/* ── 포커스 ───────────────────────────────── */
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: 6px;
}

/* ── 인풋 기본 ─────────────────────────────── */
input, select, textarea {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.875rem;
  transition: border-color 150ms, box-shadow 150ms;
}
input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(26,86,219,0.12);
}
input::placeholder, textarea::placeholder {
  color: var(--color-text-muted);
}
select, input[type="text"], input[type="date"],
input[type="number"], input[type="time"],
input[type="email"], input[type="password"] {
  min-height: 36px;
}
button, [role="button"], a, input[type="checkbox"], input[type="radio"] {
  min-height: 28px;
}

/* ── 페이지 레이아웃 ───────────────────────── */
.page-container {
  @apply mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6;
  animation: page-fade-in 180ms ease-out;
}

.page-shell {
  animation: page-fade-in 180ms ease-out;
}

.page-header {
  @apply mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-5 py-4;
  border-color: var(--color-border);
  box-shadow: var(--shadow-sm);
}

.page-title {
  @apply text-xl font-bold;
  color: var(--color-text);
}

.page-subtitle {
  @apply mt-0.5 text-sm;
  color: var(--color-text-secondary);
}

.section-heading {
  @apply mb-3 border-b pb-2 text-sm font-semibold;
  border-color: var(--color-border);
  color: var(--color-text);
}

/* ── 카드 ──────────────────────────────────── */
.card-base {
  @apply rounded-xl border bg-white p-5;
  border-color: var(--color-border);
  box-shadow: var(--shadow-sm);
}

.card-base:has(button:hover):not(.no-hover-lift),
.card-base.hover-lift:hover {
  box-shadow: var(--shadow-md);
}

.dashboard-card:active { transform: scale(0.995); }

.feed-card {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  padding: 12px 14px;
  cursor: pointer;
  transition: box-shadow 150ms;
}
.feed-card:hover { box-shadow: var(--shadow-md); }
.feed-card-title { font-size: 14px; font-weight: 600; color: var(--color-text); line-height: 1.4; }
.feed-card-meta  { font-size: 12px; color: var(--color-text-secondary); margin-top: 3px; }

/* ── 버튼 ──────────────────────────────────── */
.primary-btn, .secondary-btn, .danger-btn, .ghost-btn {
  @apply inline-flex cursor-pointer items-center justify-center rounded-lg px-4 py-2 text-sm font-medium;
  min-height: 36px;
  transition: background-color 120ms, box-shadow 120ms, opacity 120ms;
  border: 1px solid transparent;
}

.primary-btn {
  background-color: var(--color-primary);
  color: #fff;
  box-shadow: var(--shadow-xs);
}
.primary-btn:hover  { background-color: var(--color-primary-dark); }
.primary-btn:active { transform: scale(0.98); }
.primary-btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }

.secondary-btn {
  background-color: var(--color-surface);
  color: #374151;
  border-color: var(--color-border);
}
.secondary-btn:hover { background-color: var(--color-hover); }

.danger-btn {
  background-color: #fef2f2;
  color: #b91c1c;
  border-color: #fecaca;
}
.danger-btn:hover { background-color: #fee2e2; }

.ghost-btn {
  background-color: transparent;
  color: var(--color-primary);
  border-color: rgba(26,86,219,0.25);
}
.ghost-btn:hover { background-color: var(--color-primary-light); }

.primary-btn:active, .secondary-btn:active,
.danger-btn:active, .ghost-btn:active { transform: scale(0.98); }

.btn-sm  { @apply px-3 py-1.5 text-xs; min-height: 30px; }
.btn-xs  { @apply rounded-md px-2 py-1 text-xs; min-height: 26px; }

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  min-height: 32px;
  border-radius: 8px;
  padding: 6px;
  color: var(--color-text-secondary);
  transition: background-color 120ms, color 120ms;
}
.icon-btn:hover { background-color: var(--color-hover); color: var(--color-text); }

.text-icon-btn {
  @apply inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium;
  color: var(--color-primary);
  transition: background-color 120ms;
}
.text-icon-btn:hover { background-color: var(--color-primary-light); }

/* ── 폼 ───────────────────────────────────── */
.form-label {
  @apply mb-1 block text-xs font-medium;
  color: var(--color-text-secondary);
}

.form-input {
  @apply w-full rounded-lg border px-3 py-2 text-sm;
  border-color: var(--color-border);
  background-color: var(--color-surface);
  color: var(--color-text);
}
.form-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(26,86,219,0.12);
  outline: none;
}

.form-input-sm {
  @apply w-full rounded-md border px-2 py-1.5 text-xs;
  border-color: var(--color-border);
  background-color: var(--color-surface);
  color: var(--color-text);
  min-height: 30px;
}

/* ── 테이블 ────────────────────────────────── */
.table-head-row {
  @apply text-xs font-semibold uppercase tracking-wider;
  color: var(--color-text-secondary);
  background-color: #f8fafc;
}
.table-head-cell {
  @apply border-b px-3 py-2.5 text-left;
  border-color: var(--color-border);
}
.table-body-cell {
  @apply border-b px-3 py-2.5 text-sm;
  border-color: var(--color-border);
  color: var(--color-text);
}

/* ── 네비게이션 ────────────────────────────── */
.app-nav {
  @apply relative z-20 border-b bg-white/90 backdrop-blur-lg;
  min-height: 54px;
  border-color: var(--color-border);
  box-shadow: var(--shadow-xs);
}
.app-nav-link {
  @apply rounded-lg px-3 py-1.5 text-sm font-medium;
  color: var(--color-text-secondary);
  transition: background-color 120ms, color 120ms;
}
.app-nav-link:hover { color: var(--color-text); background-color: var(--color-hover); }
.app-nav-link.active { color: var(--color-primary); background-color: var(--color-primary-light); }

.app-dropdown {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
  border-radius: 0.75rem;
}

/* ── 태그 ──────────────────────────────────── */
.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.tag-blue    { background: var(--tag-blue-bg);    color: var(--tag-blue-text); }
.tag-green   { background: var(--tag-green-bg);   color: var(--tag-green-text); }
.tag-amber   { background: var(--tag-amber-bg);   color: var(--tag-amber-text); }
.tag-red     { background: var(--tag-red-bg);     color: var(--tag-red-text); }
.tag-purple  { background: var(--tag-purple-bg);  color: var(--tag-purple-text); }
.tag-indigo  { background: var(--tag-indigo-bg);  color: var(--tag-indigo-text); }
.tag-gray    { background: var(--tag-gray-bg);    color: var(--tag-gray-text); }
.tag-emerald { background: var(--tag-emerald-bg); color: var(--tag-emerald-text); }

/* ── 배너 ──────────────────────────────────── */
.info-banner, .warning-banner, .success-banner {
  border-radius: 12px; padding: 14px 16px;
  display: flex; align-items: flex-start; gap: 10px;
}
.info-banner    { background:#eff6ff; border:1px solid #bfdbfe; }
.info-banner-icon { flex-shrink:0; width:32px; height:32px; display:flex;
  align-items:center; justify-content:center; border-radius:8px;
  background:#dbeafe; color:#1e40af; }
.info-banner-text { flex:1; font-size:13px; color:#1e40af; }
.warning-banner { background:#fffbeb; border:1px solid #fde68a; color:#92400e; }
.success-banner { background:#f0fdf4; border:1px solid #bbf7d0; color:#14532d; }

/* ── 로딩 / 빈 상태 ────────────────────────── */
.loading-state  { @apply flex flex-col items-center justify-center py-16; }
.loading-spinner {
  @apply h-6 w-6 animate-spin rounded-full border-2;
  border-color: var(--color-primary);
  border-top-color: transparent;
}
.empty-state { @apply flex flex-col items-center justify-center py-16; color: var(--color-text-secondary); }
.empty-emoji-state {
  display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:8px; padding:2rem 1rem; text-align:center;
}
.empty-emoji-state .emoji   { font-size:34px; line-height:1; }
.empty-emoji-state .message { font-size:14px; color: var(--color-text-secondary); }

/* ── 모달 ──────────────────────────────────── */
.modal-overlay { animation: overlay-enter 0.12s ease-out; }
.modal-content {
  animation: modal-enter 0.18s ease-out;
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
  border-radius: 1rem;
  background: var(--color-surface);
}

/* ── 인증 화면 ─────────────────────────────── */
.auth-shell  { @apply relative flex min-h-screen items-center justify-center px-4 py-8; background-color: var(--color-bg); }
.auth-card   { @apply w-full max-w-md rounded-2xl border bg-white p-7 shadow-xl; border-color: var(--color-border); }
.auth-title  { @apply text-2xl font-bold; color: var(--color-text); }
.auth-subtitle { @apply mt-1.5 text-sm; color: var(--color-text-secondary); }

/* ── 문서 편집기 ────────────────────────────── */
.document-preview {
  width: min(100%, 760px); max-width: 760px; margin: 0 auto;
  background: #fff; border: 1px solid #dde3ec; border-radius: 4px;
  box-shadow: var(--shadow-sm); aspect-ratio: 210/297; overflow: hidden;
  color: #1f2937;
}
.document-preview .document-sheet {
  --doc-scale:1; --doc-line-height:1.55; --doc-padding-y:24px; --doc-padding-x:34px;
  --doc-table-cell-py:4px; --doc-table-cell-px:6px;
  box-sizing:border-box; width:calc(100% / var(--doc-scale));
  min-height:calc(100% / var(--doc-scale)); margin:0 auto;
  padding:var(--doc-padding-y) var(--doc-padding-x);
  transform:scale(var(--doc-scale)); transform-origin:top center;
  font-family:"Malgun Gothic","Noto Sans KR",sans-serif; font-size:13px;
  line-height:var(--doc-line-height);
}
.document-preview .document-sheet p { margin-block:1em; }
.gongmun-table th, .gongmun-table td { border:1px solid #e2e8f0; }
.gongmun-table th { background:#f3f6fb; text-align:center; font-weight:600; }
.editable-area { position:relative; cursor:text; border-radius:3px; }
.editable-area:hover { background:#eff6ff; outline:1px dashed #93c5fd; }
.editable-area:focus-within { background:#dbeafe; outline:2px solid #3b82f6; }
.variable-chip {
  display:inline-block; background:#f3e8ff; color:#7e22ce;
  border-radius:4px; padding:0 4px; font-size:11px;
  font-family:monospace; pointer-events:none; user-select:none;
}

/* ── 차트 ──────────────────────────────────── */
.recharts-cartesian-grid line { stroke: var(--color-border); }
.recharts-text { fill: var(--color-text-secondary) !important; }
.recharts-tooltip-wrapper .recharts-default-tooltip {
  border: 1px solid var(--color-border) !important;
  border-radius: 0.75rem; background: var(--color-surface) !important;
  box-shadow: var(--shadow-md);
}
.recharts-legend-item-text { color: var(--color-text-secondary) !important; }

/* ── 스켈레톤 ────────────────────────────────── */
.skeleton {
  background: linear-gradient(90deg, #f1f5f9 25%, #e8edf5 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: skeleton-pulse 1.4s ease-in-out infinite;
  border-radius: 8px;
}
@keyframes skeleton-pulse {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ── 애니메이션 ─────────────────────────────── */
@keyframes page-fade-in {
  from { opacity:0; transform:translateY(4px); }
  to   { opacity:1; transform:translateY(0); }
}
@keyframes modal-enter {
  from { opacity:0; transform:scale(0.96) translateY(6px); }
  to   { opacity:1; transform:scale(1) translateY(0); }
}
@keyframes overlay-enter {
  from { opacity:0; }
  to   { opacity:1; }
}
@keyframes pulse-gentle {
  0%,100% { opacity:1; } 50% { opacity:0.65; }
}
.animate-pulse-gentle { animation: pulse-gentle 2s ease-in-out infinite; }

/* ── 반응형 ─────────────────────────────────── */
@media (max-width: 767px) {
  .page-container { @apply px-3 py-4; }
  .page-header    { @apply rounded-lg p-3.5; }
  .page-title     { @apply text-lg; }
  .primary-btn, .secondary-btn, .danger-btn, .ghost-btn { min-height: 40px; }
  .document-preview { width:100%; max-width:100%; border-radius:0; }
  .document-preview .document-sheet { --doc-padding-y:18px; --doc-padding-x:14px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
```

---

### 1-C. App.css 정리

**파일: `frontend/src/App.css`**
- 내용이 있다면 비우거나 아래만 남깁니다:
```css
/* App-level overrides (비워도 됨) */
```

---

### 1-D. Layout.tsx 네비게이션 UI 정리

**파일: `frontend/src/components/Layout.tsx`**

테마 코드 제거 외에 아래 항목도 수정합니다:

1. **검색 버튼** — `>Search<` 텍스트를 `>검색<` 으로 변경
2. **kbd 단축키** — `Ctrl+Space` 유지 (기능은 그대로)
3. **사용자 메뉴의 role 표시** — `user?.role`이 영문이면 그대로 두되 추후 Phase 5에서 처리
4. **네비게이션 전체 스타일** — `app-nav` 클래스 사용 유지. 단, `bg-white/80` 등 인라인 스타일이 있다면 `app-nav` 클래스로 통일
5. **모바일 메뉴** — 테마 섹션 제거 후 프로필/로그아웃 블록만 남김

---

### 1-E. ShaderBackground 제거 여부

`frontend/src/components/ShaderBackground.tsx` — 배경 애니메이션 컴포넌트입니다.
- Layout.tsx에서 `<ShaderBackground />` Suspense 블록 전체를 제거합니다.
- ShaderBackground.tsx 파일 자체는 삭제하지 않아도 되나 import 및 렌더링 코드는 제거합니다.
- 이유: CSS를 단순 배경색으로 교체했으므로 WebGL 셰이더 배경이 어색하게 보입니다.

---

## 검증 체크리스트
- [ ] `npm run build` 오류 없음
- [ ] ThemeContext import 잔여 없음 (`grep -r "ThemeContext" frontend/src` 결과 없음)
- [ ] `data-theme` attribute 남아있는 코드 없음
- [ ] 네비게이션 정상 표시
- [ ] 로그인 화면 정상 표시
- [ ] 카드/버튼 클래스(.card-base, .primary-btn 등) 스타일 적용 확인
