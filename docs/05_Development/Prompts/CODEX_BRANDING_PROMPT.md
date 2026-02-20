# V:ON 브랜딩 적용

> Phase 18까지 모든 기능 구현 완료. V:ON 브랜드 아이덴티티를 전체 UI에 적용한다.

## 참조 파일
- `docs/BRAND_GUIDE.md` — 컬러 팔레트, 로고 규칙
- `frontend/public/logo.svg` — 워드마크 로고 (이미 적용됨)
- `frontend/public/favicon.svg` — 파비콘 (이미 적용됨)

## 이미 완료된 작업 (건드리지 않기)
- ✅ 헤더 로고 이미지 적용 (Layout.tsx에 `<img src="/logo.svg">` 적용 완료)
- ✅ Favicon 교체 (index.html에 `/favicon.svg` 연결 완료)
- ✅ index.html에 OG 태그, lang="ko" 적용 완료
- ✅ index.css에 CSS 변수 (:root { --color-primary ... }) 적용 완료
- ✅ body font-family에 Inter 적용 완료

---

## 구현할 항목

## 1. Inter 폰트 Google Fonts 로드

### index.html
현재 Google Fonts URL에 Inter가 없으면 추가:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+KR:wght@300;400;500;700&family=Noto+Serif+KR:wght@400;700&display=swap" rel="stylesheet" />
```

## 2. 인쇄 헤더 업데이트

### WorkflowsPage.tsx
인쇄 template의 CSS에서 h1 스타일을 브랜드 컬러로:
```css
h1 { color: #1E3A5F; }
```

## 3. PWA Manifest

### public/manifest.json 생성
```json
{
  "name": "V:ON — VC 조합 관리 플랫폼",
  "short_name": "V:ON",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FFFFFF",
  "theme_color": "#1E3A5F",
  "icons": [
    { "src": "/favicon.svg", "type": "image/svg+xml", "sizes": "any" }
  ]
}
```

### index.html에 추가
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#1E3A5F" />
```

## 4. 눈 편한 테마 전환 기능 (핵심)

### 4-1. CSS 변수 기반 4테마 정의

index.css의 `:root` 블록 아래에 3개 소프트 테마 추가:

```css
/* 기본 테마 (Default) — 이미 적용된 :root 값 유지 */

/* Cream 테마 — 따뜻한 종이 느낌, 장시간 집중에 적합 */
[data-theme="cream"] {
  --theme-bg: #FAF8F5;
  --theme-card: #FFFDF9;
  --theme-text: #3D3529;
  --theme-text-secondary: #8C7E6A;
  --theme-border: #E8E0D4;
  --theme-input-bg: #F7F4EF;
  --theme-input-focus-bg: #FFFDF9;
  --theme-hover: #F2EDE5;
  --theme-scrollbar: #C9BFA8;
}

/* Mint 테마 — 시원한 그린, 눈 피로 감소 */
[data-theme="mint"] {
  --theme-bg: #F5FAF8;
  --theme-card: #FBFEFD;
  --theme-text: #1A332B;
  --theme-text-secondary: #5F7A6E;
  --theme-border: #D4E8DF;
  --theme-input-bg: #EFF7F3;
  --theme-input-focus-bg: #FBFEFD;
  --theme-hover: #E5F2EC;
  --theme-scrollbar: #A8C9B8;
}

/* Lavender 테마 — 편안한 보라빛, 세련된 느낌 */
[data-theme="lavender"] {
  --theme-bg: #F8F7FC;
  --theme-card: #FDFCFF;
  --theme-text: #2D2640;
  --theme-text-secondary: #6E6885;
  --theme-border: #DDD8EC;
  --theme-input-bg: #F3F0FA;
  --theme-input-focus-bg: #FDFCFF;
  --theme-hover: #EBE7F5;
  --theme-scrollbar: #B8AED0;
}
```

### 4-2. CSS에서 테마 변수 연결

기존 하드코딩 색상을 CSS 변수로 교체. `[data-theme]` 속성이 없으면 기존 색상 유지 (fallback):

```css
body {
  background-color: var(--theme-bg, #fafafa);
  color: var(--theme-text, #111827);
}

.card-base {
  @apply rounded-2xl p-5;
  background-color: var(--theme-card, white);
  border: 1px solid var(--theme-border, #e5e7eb);
}

input, select, textarea {
  background-color: var(--theme-input-bg, #f9fafb);
  border: 1px solid var(--theme-border, #e5e7eb);
  color: var(--theme-text, #111827);
}

input:focus, select:focus, textarea:focus {
  background-color: var(--theme-input-focus-bg, #ffffff);
}

::-webkit-scrollbar-thumb {
  background-color: var(--theme-scrollbar, #d1d5db);
}
```

### 4-3. 테마 전환 버튼 + Context

#### 1) ThemeContext 생성 — `frontend/src/contexts/ThemeContext.tsx`

```tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type Theme = 'default' | 'cream' | 'mint' | 'lavender'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  themes: { key: Theme; label: string; icon: string }[]
}

const THEMES: { key: Theme; label: string; icon: string }[] = [
  { key: 'default', label: '기본', icon: '☀️' },
  { key: 'cream', label: '크림', icon: '☕' },
  { key: 'mint', label: '민트', icon: '🌿' },
  { key: 'lavender', label: '라벤더', icon: '💜' },
]

const ThemeContext = createContext<ThemeContextType | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem('von-theme') as Theme) || 'default'
  })

  useEffect(() => {
    if (theme === 'default') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }
    localStorage.setItem('von-theme', theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
```

#### 2) main.tsx에 ThemeProvider 감싸기

```tsx
import { ThemeProvider } from './contexts/ThemeContext'

// 기존 <App /> 를 <ThemeProvider><App /></ThemeProvider> 로 감싼다
```

#### 3) Layout.tsx 헤더에 테마 전환 버튼 추가

헤더 우측에 작은 드롭다운 또는 순환 버튼 추가:

```tsx
import { useTheme } from '../contexts/ThemeContext'

// 헤더 우측 영역에 추가
function ThemeToggle() {
  const { theme, setTheme, themes } = useTheme()
  const currentIdx = themes.findIndex(t => t.key === theme)
  const next = themes[(currentIdx + 1) % themes.length]

  return (
    <button
      onClick={() => setTheme(next.key)}
      className="rounded-lg p-1.5 text-sm hover:bg-gray-100"
      title={`테마: ${themes[currentIdx].label} → ${next.label}`}
    >
      {themes[currentIdx].icon}
    </button>
  )
}
```

헤더의 네비게이션 끝 부분(우측)에 `<ThemeToggle />` 를 배치한다.
모바일 메뉴에도 테마 전환 옵션 추가 (리스트 형태로 4개 보여주기).

### 4-4. Tailwind 색상 클래스 대응

테마 적용 시 Tailwind 유틸리티 클래스(text-gray-900, bg-white 등)가 테마 색상을 오버라이드하지 않도록, 다음 페이지 컴포넌트의 색상을 CSS 변수로 교체:

- `text-gray-900` → `text-[var(--theme-text,#111827)]` (헤더 타이틀, 카드 제목 등 주요 텍스트)
- `text-gray-500` → `text-[var(--theme-text-secondary,#6b7280)]` (보조 설명 텍스트)
- `bg-white` → `bg-[var(--theme-card,white)]` (카드, 모달 배경)
- `border-gray-200` → `border-[var(--theme-border,#e5e7eb)]` (카드, 입력란 테두리)
- `hover:bg-gray-50` → `hover:bg-[var(--theme-hover,#f9fafb)]` (호버 상태)

**중요:** 모든 Tailwind 클래스를 바꿀 필요는 없다. card-base, body, input, select, textarea 같은 기본 요소만 CSS에서 처리하면 대부분 자동으로 테마가 적용된다. 나머지 Tailwind 클래스는 그대로 유지해도 된다.

## 검증
1. `npm run build` 성공
2. 브라우저 탭에 V:ON 파비콘 표시
3. 헤더에 SVG 로고 표시 (이미 적용됨)
4. 테마 전환 버튼 클릭 시 Default → Cream → Mint → Lavender 순환
5. 새로고침 후에도 선택한 테마 유지 (localStorage)
6. 각 테마에서 모든 페이지가 자연스럽게 보이는지 확인
7. 인쇄 시 V:ON 브랜드 컬러 적용

## 주의사항
- 기존 기능 코드 절대 수정하지 않는다
- 로고 SVG 파일은 이미 생성되어 있으므로 새로 만들지 않는다
- 헤더 로고는 이미 img 태그로 적용 완료 — 건드리지 않는다
- 테마 전환은 CSS 변수 기반으로만 처리한다 (컴포넌트 로직 변경 최소화)
- primary-btn, accent 색상은 테마에 관계없이 동일하게 유지한다 (브랜드 색상)
