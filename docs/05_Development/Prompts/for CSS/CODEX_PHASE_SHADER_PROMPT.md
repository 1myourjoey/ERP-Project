# Phase Shader: ShaderGradient 배경 적용

> **Priority:** P2
> **의존성:** `@shadergradient/react`, `three`, `@react-three/fiber`

---

## 목표

앱 전체 배경에 `ShaderGradient` 애니메이션 그라디언트를 적용한다. 기존 UI는 반투명 처리하여 그라디언트가 은은하게 비치도록 한다.

---

## Part 1 — 패키지 설치

```bash
cd frontend
npm install @shadergradient/react three @react-three/fiber
```

---

## Part 2 — ShaderGradient 배경 컴포넌트

### [NEW] `frontend/src/components/ShaderBackground.tsx`

```tsx
import { ShaderGradientCanvas, ShaderGradient } from '@shadergradient/react'

export default function ShaderBackground() {
  return (
    <ShaderGradientCanvas
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    >
      <ShaderGradient
        animate="on"
        brightness={1.5}
        cAzimuthAngle={60}
        cDistance={7.1}
        cPolarAngle={90}
        cameraZoom={15.27}
        color1="#ff7a33"
        color2="#33a0ff"
        color3="#ffc53d"
        envPreset="dawn"
        grain="off"
        lightType="3d"
        positionX={0}
        positionY={-0.15}
        positionZ={0}
        reflection={0.1}
        rotationX={0}
        rotationY={0}
        rotationZ={0}
        type="plane"
        uAmplitude={1.4}
        uDensity={1.1}
        uFrequency={5.5}
        uSpeed={0.1}
        uStrength={0.4}
        uTime={0}
        wireframe={false}
      />
    </ShaderGradientCanvas>
  )
}
```

---

## Part 3 — Layout.tsx 통합

### [MODIFY] `frontend/src/components/Layout.tsx`

**변경 1: import 추가**
```tsx
import ShaderBackground from './ShaderBackground'
```

**변경 2: 루트 div 수정 (L170)**

```tsx
// 변경 전:
<div className="flex h-screen flex-col bg-[#fafafa]">

// 변경 후:
<div className="relative flex h-screen flex-col">
  <ShaderBackground />
```

**변경 3: nav 반투명 처리 (L171)**

```tsx
// 변경 전:
<nav className="h-14 border-b border-gray-200 bg-white">

// 변경 후:
<nav className="relative z-10 h-14 border-b border-white/20 bg-white/80 backdrop-blur-xl">
```

**변경 4: main 반투명 처리 (L326)**

```tsx
// 변경 전:
<main className="flex-1 overflow-auto">

// 변경 후:
<main className="relative z-10 flex-1 overflow-auto">
```

---

## Part 4 — CSS 반투명 조정

### [MODIFY] `frontend/src/index.css`

기존 `page-container`, `card-base` 등에 반투명 배경 적용:

```css
/* 기존 card-base에 backdrop-blur 추가 */
.card-base {
  /* 기존 속성 유지 + 아래 추가/수정 */
  background-color: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
```

**주의:** 기존 `--theme-card` CSS 변수를 사용하는 곳은 rgba로 변환:
- default 테마: `rgba(255, 255, 255, 0.85)`
- cream 테마: `rgba(255, 253, 247, 0.85)`
- mint 테마: `rgba(243, 253, 249, 0.85)`
- lavender 테마: `rgba(248, 245, 255, 0.85)`

각 테마의 `--theme-card` 값을 `rgba(..., 0.85)` 형태로 변경하여 반투명 적용.

---

## Part 5 — 성능 최적화

### 5-A. Lazy Loading

ShaderGradient를 lazy load하여 초기 번들에 포함하지 않음:

```tsx
// Layout.tsx
import { lazy, Suspense } from 'react'
const ShaderBackground = lazy(() => import('./ShaderBackground'))

// 사용:
<Suspense fallback={null}>
  <ShaderBackground />
</Suspense>
```

### 5-B. prefers-reduced-motion 대응

```tsx
// ShaderBackground.tsx
export default function ShaderBackground() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReducedMotion) return null

  return (
    <ShaderGradientCanvas ...>
      ...
    </ShaderGradientCanvas>
  )
}
```

---

## Files to create / modify

| # | Type | File | Part | Changes |
|---|------|------|------|---------|
| 1 | **[NEW]** | `frontend/src/components/ShaderBackground.tsx` | 2 | ShaderGradient 래퍼 컴포넌트 |
| 2 | **[MODIFY]** | `frontend/src/components/Layout.tsx` | 3 | import + 배경 삽입 + nav/main 반투명 |
| 3 | **[MODIFY]** | `frontend/src/index.css` | 4 | card-base backdrop-blur + 테마별 rgba 변환 |

---

## Acceptance Criteria

- [ ] AC-01: 앱 배경에 ShaderGradient 애니메이션 표시
- [ ] AC-02: nav 바가 반투명(`bg-white/80 backdrop-blur-xl`)으로 그라디언트 비침
- [ ] AC-03: 카드(`card-base`)가 반투명(`rgba + backdrop-blur`)으로 그라디언트 비침
- [ ] AC-04: 모든 UI 요소가 z-index로 그라디언트 위에 렌더링
- [ ] AC-05: ShaderGradient에 `pointerEvents: 'none'` → UI 클릭 정상
- [ ] AC-06: Lazy loading으로 초기 로딩 성능 유지
- [ ] AC-07: `prefers-reduced-motion` 활성화 시 ShaderGradient 미표시
- [ ] AC-08: 4개 테마 전체에서 card/nav 반투명 정상 렌더링
- [ ] AC-09: `npm run build` 에러 0건
- [ ] AC-10: 드롭다운/모달이 그라디언트 위에 정상 표시 (z-index 확인)

---

## 구현 주의사항

1. **three.js 피어 의존성:** `@react-three/fiber`가 `three`를 peer dependency로 요구. 반드시 함께 설치.
2. **TypeScript 타입:** `@shadergradient/react`의 타입이 부분적일 수 있음. 필요 시 `// @ts-ignore` 또는 `declare module` 처리.
3. **모바일 성능:** WebGL 렌더링이 모바일에서 무거울 수 있음. 현재는 내부 ERP이므로 데스크톱 우선.
4. **드롭다운 z-index:** Layout.tsx의 드롭다운(L214 `z-40`)이 ShaderGradient(z-0) 위에 있어야 함. 현재 `z-40`이므로 문제 없음.
5. **SearchModal z-index:** SearchModal이 그라디언트 위에 표시되는지 확인.
6. **기존 bg-[#fafafa] 제거:** 루트 div의 `bg-[#fafafa]`를 제거하여 그라디언트가 보이게 함.
