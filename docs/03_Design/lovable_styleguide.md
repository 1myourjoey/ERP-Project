# Lovable.dev Style Guide

> lovable.dev 프로덕션 CSS에서 추출한 디자인 토큰 레퍼런스

---

## 1. Color Palette (HSL)

### Core

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--background` | `45 40% 98%` | `0 0% 11%` | 페이지 배경 (warm cream) |
| `--foreground` | `0 0% 11%` | `45 40% 98%` | 기본 텍스트 |
| `--card` | `45 40% 98%` | `0 0% 5%` | 카드 배경 |
| `--primary` | `0 0% 11%` | `45 40% 98%` | CTA 버튼 |
| `--secondary` | `42 38% 95%` | `60 3% 15%` | 보조 버튼 |
| `--muted` | `42 38% 95%` | `60 3% 15%` | 뮤트 배경 |
| `--muted-foreground` | `60 1% 37%` | `40 9% 75%` | 2차 텍스트 |
| `--border` | `45 17% 91%` | `60 3% 15%` | 보더 |
| `--input` | `45 17% 91%` | `60 1% 25%` | 입력필드 보더 |
| `--ring` | `0 0% 11%` | `47 10% 83%` | 포커스 링 |

### Accent & Semantic

| Token | Value | Usage |
|-------|-------|-------|
| `--accent-primary` | `225 88% 53%` | 인터랙티브 액센트 (파랑) |
| `--destructive-primary` | `0 95% 42%` | 에러/삭제 |
| `--success-primary` | `142 72% 29%` | 성공 |
| `--warning-primary` | `25 98% 44%` | 경고 |
| `--affirmative-primary` | `225 88% 53%` | 확인/긍정 |
| `--notification-primary` | `0 100% 66%` | 알림 뱃지 |

### Brand Colors (7색)

| Name | Primary HSL | Swatch |
|------|-------------|--------|
| Ocean | `217 100% 65%` | 🔵 |
| Sapphire | `217 75% 49%` | 💎 |
| Twilight | `251 60% 51%` | 🟣 |
| Bubblegum | `308 77% 40%` | 🩷 |
| Flamingo | `335 100% 36%` | 🩷 |
| Tiger | `14 93% 40%` | 🟠 |
| Saffron | `20 94% 37%` | 🟤 |
| Scarlet | `0 100% 68%` | 🔴 |

---

## 2. Typography

| Property | Value |
|----------|-------|
| **Display Font** | `CameraPlainVariable` (커스텀) → fallback `Inter`, `system-ui` |
| **Mono Font** | `Roboto Mono` |
| **Base Size** | `1rem` (16px) |
| **Line Height** | `1.5` |
| **H1** | `1.5rem`, weight `480` |
| **H2** | `1.25rem`, weight `480` |
| **H3** | `1.125rem`, weight `480` |
| **H4** | `1rem`, weight `480` |
| **Small/Muted** | `0.875rem`, color `--muted-foreground` |
| **스무딩** | `antialiased`, `optimizeLegibility`, `font-synthesis: none` |

> **특이점**: heading weight가 `480`으로 일반적인 `500/600`이 아닌 미묘하게 가벼운 중간 무게.

---

## 3. Spacing & Layout

| Token | Value |
|-------|-------|
| **Container** | `max-width: 1280px`, `margin: auto`, `padding: 0 0.5rem` |
| **Container @640px** | `max-width: 640px`, `padding: 0.5rem` |
| **Container @768px** | `max-width: 768px` |
| **Container @1024px** | `max-width: 1024px` |
| **Container @1280px** | `padding: 0` |
| **Section Gap** | `3rem~5rem` vertical |
| **Card Padding** | `1.5rem` |
| **Input Height** | `2.5rem` |

---

## 4. Border Radius

| Class | Value |
|-------|-------|
| `rounded-sm` | `calc(var(--radius) - 4px)` = `4px` |
| `rounded-md` | `calc(var(--radius) - 2px)` = `6px` |
| `rounded-lg` | `var(--radius)` = `8px` |
| `rounded-xl` | `calc(var(--radius) * 1.5)` = `12px` |
| `rounded-2xl` | `calc(var(--radius) * 2)` = `16px` |
| `rounded-3xl` | `1.5rem` = `24px` |
| `rounded-full` | `9999px` |

> **기본 `--radius`: `0.5rem` (8px)**

---

## 5. Shadows

최소주의 접근 — 기본적으로 `box-shadow: none`. Hover 시에만 미묘한 그림자:
```css
.card:hover { box-shadow: 0 4px 12px hsl(var(--foreground) / .06); }
```

---

## 6. Components

### Button Variants
- **Primary**: `bg: --primary`, `color: --primary-foreground`
- **Secondary**: `bg: --secondary`, `border: --border`
- **Accent**: `bg: --accent-primary` (파랑)
- **Destructive**: `bg: --destructive-primary` (빨강)
- **Ghost**: `bg: transparent` → hover `bg: --muted`
- **Outline**: `bg: transparent`, `border: --border` → hover `bg: --muted`

**Sizes**: `sm` (h:2rem), `default` (h:2.25rem), `lg` (h:2.75rem)

### Badge
- 형태: `border-radius: 9999px`, `padding: 0.125rem 0.625rem`, `font: 0.75rem/500`
- Variants: primary, secondary, accent, destructive, success, warning

### Card
- `background: --card`, `border: 1px solid --border`
- `border-radius: calc(--radius * 1.5)` = `12px`
- 구조: `card-header` → `card-content` → `card-footer`

### Input
- `height: 2.5rem`, `border-radius: --radius`, `border: 1px solid --input`
- Focus: `border-color: --ring`, `box-shadow: 0 0 0 2px hsl(--ring / .1)`

### Sidebar
- `width: 260px`, `bg: --sidebar-background`, `border-right: 1px solid --sidebar-border`
- Items: `padding: 0.5rem 1rem`, active `bg: --sidebar-accent`

### Alert
- `padding: 1rem`, `border-radius: --radius`, `border: 1px solid`
- Variants: info (accent), success, warning, error (destructive)

---

## 7. Animations

### Shimmer Text
```css
background: linear-gradient(90deg,
  hsl(var(--muted-foreground)) 0%,
  hsl(var(--muted-foreground) / .3) 50%,
  hsl(var(--muted-foreground)) 100%);
background-size: 200% 100%;
-webkit-background-clip: text;
color: transparent;
animation: shimmer 2s ease-in infinite;
```

### Gradient Pan
```css
background: linear-gradient(135deg, ocean, twilight, bubblegum, flamingo);
background-size: 300% 300%;
animation: gradient-pan 8s ease-in-out infinite alternate;
```

### Bounce Slow
```css
@keyframes bounce-slow {
  0%  { transform: translateY(0); }
  100%{ transform: translateY(-20px); }
}
animation: bounce-slow 3s linear infinite alternate;
```

---

## 8. Scrollbar

```css
scrollbar-width: thin;
scrollbar-color: hsl(var(--muted-foreground)) transparent;
::-webkit-scrollbar { width: 8px; height: 8px; }
```

---

## 9. Dark Mode

- CSS 클래스 기반: `.dark` on `<html>`
- 모든 색상이 동일한 CSS 변수명으로 오버라이드됨
- 배경이 `warm cream` → `near-black (#1c1c1c)` 전환
- 텍스트가 반전: `foreground`와 `primary` 값 swap
- Border가 더 어두운 톤으로 변경

---

## 10. Key Design Principles

1. **Warm Neutrals**: 차가운 회색 대신 따뜻한 크림/베이지 톤 (`hue 42-45`)
2. **HSL Variable System**: 모든 색상이 HSL 값으로 정의되어 opacity 조절 용이
3. **Semantic Layering**: background → muted → border → foreground 계층
4. **Minimal Shadows**: 거의 그림자 없이 border와 배경색 차이로 계층 표현
5. **Brand Diversity**: 7가지 브랜드 컬러로 시각적 다양성 확보
6. **Weight 480**: 일반적이지 않은 heading weight로 부드러운 인상
7. **0.5rem Radius**: 중간 정도의 둥근 모서리로 모던하면서 절제된 느낌
