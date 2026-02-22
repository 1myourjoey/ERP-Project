# CODEX_PHASE_LOVABLE — V:ON ERP Lovable Design System 적용

> **목표**: lovable.dev에서 추출한 디자인 시스템(따뜻한 크림 배경, HSL 변수, 7가지 브랜드 컬러, 부드러운 타이포그래피)을 V:ON ERP 프로젝트에 적용합니다.

---

## 참조 파일

- `docs/lovable_example.html` — lovable.dev 디자인 시스템 HTML 레플리카
- `docs/lovable_styleguide.md` — 디자인 토큰 상세 레퍼런스

---

## 1. CSS 변수 시스템 통합

### 1-1. `src/index.css` `:root` 업데이트

현재 V:ON ERP의 CSS 변수를 lovable.dev의 따뜻한 크림 톤 팔레트로 교체:

```css
:root {
  /* === Core (Warm Cream) === */
  --background: 45 40% 98%;
  --foreground: 0 0% 11%;
  --card: 45 40% 98%;
  --card-foreground: 0 0% 5%;
  --popover: 45 40% 98%;
  --popover-foreground: 0 0% 5%;

  /* === Primary / Secondary === */
  --primary: 0 0% 11%;
  --primary-foreground: 45 40% 98%;
  --secondary: 42 38% 95%;
  --secondary-foreground: 0 0% 11%;

  /* === Muted (Warm Tint) === */
  --muted: 42 38% 95%;
  --muted-foreground: 60 1% 37%;
  --muted-foreground-subtle: 60 1% 55%;
  --muted-border: 45 17% 91%;
  --muted-active: 45 17% 91%;
  --muted-hover: 47 10% 83%;

  /* === Border / Input / Ring === */
  --border: 45 17% 91%;
  --input: 45 17% 91%;
  --ring: 0 0% 11%;

  /* === Accent (Blue) === */
  --accent: 216 73% 91%;
  --accent-foreground: 214 75% 39%;
  --accent-primary: 225 88% 53%;
  --accent-primary-foreground: 208 100% 97%;

  /* === Semantic === */
  --destructive: 3 76% 90%;
  --destructive-foreground: 0 63% 31%;
  --destructive-primary: 0 95% 42%;
  --success: 137 52% 88%;
  --success-foreground: 144 61% 20%;
  --success-primary: 142 72% 29%;
  --warning: 32 86% 88%;
  --warning-foreground: 15 81% 26%;
  --warning-primary: 25 98% 44%;

  /* === Brand (7색) === */
  --brand-ocean-primary: 217 100% 65%;
  --brand-sapphire-primary: 217 75% 49%;
  --brand-twilight-primary: 251 60% 51%;
  --brand-bubblegum-primary: 308 77% 40%;
  --brand-flamingo-primary: 335 100% 36%;
  --brand-tiger-primary: 14 93% 40%;
  --brand-saffron-primary: 20 94% 37%;

  /* === Sidebar === */
  --sidebar-background: 45 40% 98%;
  --sidebar-foreground: 60 1% 25%;
  --sidebar-border: 45 17% 91%;
  --sidebar-accent: 42 38% 95%;

  /* === Radius === */
  --radius: 0.5rem;
}
```

### 1-2. 다크 모드 (`.dark`) 오버라이드

```css
.dark {
  --background: 0 0% 11%;
  --foreground: 45 40% 98%;
  --card: 0 0% 5%;
  --primary: 45 40% 98%;
  --primary-foreground: 0 0% 11%;
  --secondary: 60 3% 15%;
  --muted: 60 3% 15%;
  --muted-foreground: 40 9% 75%;
  --border: 60 3% 15%;
  --input: 60 1% 25%;
  --ring: 47 10% 83%;
  --accent: 217 33% 22%;
  --accent-foreground: 217 100% 72%;
  --destructive: 0 33% 20%;
  --destructive-foreground: 0 91% 71%;
  --success: 142 37% 17%;
  --success-foreground: 142 69% 58%;
  --warning: 31 51% 18%;
  --warning-foreground: 37 100% 55%;
}
```

---

## 2. 타이포그래피

### 2-1. 폰트 스택

```css
html {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  font-synthesis: none;
}

code, pre, kbd {
  font-family: 'Roboto Mono', monospace;
}
```

### 2-2. Heading Weight

모든 heading에 `font-weight: 480` 적용 (lovable 특유의 부드러운 무게):

```css
h1 { font-size: 1.5rem; font-weight: 480; }
h2 { font-size: 1.25rem; font-weight: 480; }
h3 { font-size: 1.125rem; font-weight: 480; }
h4 { font-size: 1rem; font-weight: 480; }
```

---

## 3. 컴포넌트 스타일 조정

### 3-1. Navbar

```css
.navbar {
  background-color: hsl(var(--background) / .85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid hsl(var(--border));
}
```

### 3-2. Card

```css
.card {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: calc(var(--radius) * 1.5); /* 12px */
}
.card:hover {
  box-shadow: 0 4px 12px hsl(var(--foreground) / .06);
  border-color: hsl(var(--muted-hover));
}
```

### 3-3. Button

- default `height: 2.25rem`, sm `2rem`, lg `2.75rem`
- `border-radius: var(--radius)` (8px)
- Ghost/Outline hover: `bg: --muted`

### 3-4. Input

```css
.input:focus {
  border-color: hsl(var(--ring));
  box-shadow: 0 0 0 2px hsl(var(--ring) / .1);
}
```

### 3-5. Sidebar

- `width: 260px`
- `border-right: 1px solid hsl(var(--sidebar-border))`
- Active: `bg: --sidebar-accent`

---

## 4. 애니메이션 추가

### 4-1. Shimmer Text (AI 생성중 효과)

```css
@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: 0 0; }
}
.shimmer-text {
  background: linear-gradient(90deg,
    hsl(var(--muted-foreground)),
    hsl(var(--muted-foreground) / .3) 50%,
    hsl(var(--muted-foreground)));
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: shimmer 2s ease-in infinite;
}
```

### 4-2. Gradient Pan (브랜드 그라디언트)

```css
@keyframes gradient-pan {
  0%  { background-position: 100% 50%; }
  50% { background-position: 50% 50%; }
  100%{ background-position: 0% 50%; }
}
```

---

## 5. 브랜드 컬러 활용 가이드

| 위치 | 컬러 | 변수 |
|------|-------|------|
| 주력 CTA | Ocean Blue | `--brand-ocean-primary` |
| 사이드바 Active | Sapphire | `--brand-sapphire-primary` |
| 차트 색상 2 | Twilight Purple | `--brand-twilight-primary` |
| 차트 색상 3 | Bubblegum Pink | `--brand-bubblegum-primary` |
| 알림/긴급 | Scarlet Red | `--brand-scarlet-primary` |
| 차트/강조 | Tiger Orange | `--brand-tiger-primary` |
| 차트/보조 | Saffron | `--brand-saffron-primary` |

---

## 6. 핵심 디자인 원칙

1. **Warm over Cold** — 차가운 회색 없이 `hue 42-45`의 따뜻한 중립색 사용
2. **HSL Opacity** — `hsl(var(--color) / opacity)` 패턴으로 투명도 동적 제어
3. **Minimal Shadows** — 그림자 최소화, border + background 차이로 계층 표현
4. **Weight 480** — heading에 미묘하게 가벼운 워게이트 적용
5. **0.5rem Radius** — 중간 둥근 모서리로 모던하면서 절제된 느낌
6. **Brand Color Diversity** — 7가지 이름있는 브랜드 컬러로 시각적 풍부함 확보

---

## 적용 순서

1. `src/index.css`에 위 CSS 변수 적용
2. `tailwind.config.ts`에 brand 컬러 확장
3. Navbar, Sidebar, Card 컴포넌트 hover 스타일 조정
4. Heading font-weight를 480으로 통일
5. Shimmer 애니메이션 유틸리티 클래스 추가
6. 다크 모드 변수 오버라이드 검증
