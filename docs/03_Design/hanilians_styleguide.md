# Hanilians.xyz 스타일 가이드 (2단계 산출물)

> 원본 사이트: https://www.hanilians.xyz/
> 분석 기준: 2026-02-18
> 용도: ERP 프로젝트 디자인 개선 레퍼런스

---

## 1. 개요 (Overview)

Hanilians는 학교 학생용 종합 플랫폼으로, **미니멀하고 부드러운 모던 UI**를 사용합니다.
주요 특징:

- **클린한 공간 활용**: 넓은 여백, 깔끔한 카드 레이아웃
- **부드러운 곡선**: 큰 border-radius (12~16px)
- **서브틀한 그라디언트**: 히어로 영역에 그라디언트 배경 사용
- **카드 중심 정보 표시**: 모든 콘텐츠가 카드 안에 정돈
- **탭 기반 네비게이션**: 상단 또는 하단 탭으로 간결한 이동
- **이모지 아이콘 활용**: 섹션 제목에 이모지를 붙여 시각적 인식성↑
- **CTA 배너**: 중요 공지/온보딩을 배너형으로 강조

---

## 2. 색상 팔레트 (Color Palette)

### Primary

| 용도 | 색상 | Hex |
|------|------|-----|
| Primary | 파란색 계열 | `#3B82F6` (Tailwind blue-500) |
| Primary Dark | 네이비 | `#1E3A5F` |
| Primary Light | 연파랑 | `#60A5FA` |
| Primary BG | 연한 파랑 | `#DBEAFE` |

### Background & Surface

| 용도 | 색상 | Hex |
|------|------|-----|
| Page Background | 거의 흰색 | `#FAFAFA` ~ `#F9FAFB` |
| Card Surface | 순백 | `#FFFFFF` |
| Card Hover | 연한 회색 | `#F9FAFB` |
| Section BG (히어로) | 그라디언트 | `#EFF6FF → #DBEAFE` (blue-50 → blue-100) |

### Text

| 용도 | 색상 | Hex |
|------|------|-----|
| Heading | 거의 검정 | `#111827` (gray-900) |
| Body | 진한 회색 | `#374151` (gray-700) |
| Secondary | 중간 회색 | `#6B7280` (gray-500) |
| Muted / Hint | 연한 회색 | `#9CA3AF` (gray-400) |

### System (Semantic)

| 용도 | 색상 | Hex |
|------|------|-----|
| Success | 녹색 | `#10B981` |
| Warning | 주황 | `#F59E0B` |
| Danger | 빨강 | `#EF4444` |
| Info | 파랑 | `#3B82F6` |

### Accent / Tag

| 용도 | 색상 | Hex |
|------|------|-----|
| Tag BG | 연보라 | `#EDE9FE` (violet-100) |
| Tag Text | 진보라 | `#6D28D9` (violet-700) |
| Badge BG | 연파랑 | `#DBEAFE` |
| Badge Text | 진파랑 | `#1D4ED8` |

---

## 3. 타이포그래피 (Typography)

| 요소 | 폰트 | 크기 | 무게 | 행간 |
|------|------|------|------|------|
| **Body** | Inter, Noto Sans KR, system-ui | 14px (0.875rem) | 400 | 1.5 |
| **H1** (페이지 제목) | 동일 | 24px (1.5rem) | 700 (bold) | 1.3 |
| **H2** (섹션 제목) | 동일 | 18px (1.125rem) | 600 (semibold) | 1.4 |
| **H3** (카드 제목) | 동일 | 15px (0.9375rem) | 600 | 1.4 |
| **Caption / Hint** | 동일 | 12px (0.75rem) | 400 | 1.5 |
| **Button** | 동일 | 14px (0.875rem) | 500 (medium) | 1 |
| **Tag / Badge** | 동일 | 11–12px | 500 | 1 |
| **Navigation** | 동일 | 13px | 500 | 1 |

### 폰트 특성
- `font-feature-settings: "cv02", "cv03", "cv04", "cv11"` → Inter의 대체 글리프 활성화
- 한글은 Noto Sans KR 폴백
- 이모지는 시스템 기본 렌더링

---

## 4. 간격 시스템 (Spacing System)

| 토큰 | 값 | 용도 |
|------|----|----- |
| **xs** | 4px (0.25rem) | 인접 요소 간 미세 간격 |
| **sm** | 8px (0.5rem) | 아이콘-텍스트, 인라인 간격 |
| **md** | 12px (0.75rem) | 카드 내부 요소 간격 |
| **lg** | 16px (1rem) | 카드 패딩, 섹션 간격 |
| **xl** | 20px (1.25rem) | 카드 패딩(큰 카드) |
| **2xl** | 24px (1.5rem) | 섹션 간 구분, 페이지 패딩 |
| **3xl** | 32px (2rem) | 섹션 그룹 간격 |

### 레이아웃 간격
- **Page padding**: `px-6 py-6` (24px)
- **Card padding**: `p-4` ~ `p-5` (16~20px)
- **Grid gap**: `gap-3` (12px) ~ `gap-4` (16px)
- **Section 간격**: `space-y-4` (16px) ~ `space-y-6` (24px)

---

## 5. 컴포넌트 스타일 (Component Styles)

### 5-1. 카드 (Card)

```css
.card {
  background: #FFFFFF;
  border: 1px solid #E5E7EB;
  border-radius: 16px;          /* rounded-2xl */
  padding: 20px;                /* p-5 */
  transition: box-shadow 0.2s ease, transform 0.15s ease;
}

.card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
```

### 5-2. 버튼 (Button)

```css
/* Primary */
.btn-primary {
  background: #3B82F6;
  color: #FFFFFF;
  border-radius: 12px;          /* rounded-xl */
  padding: 8px 16px;           /* py-2 px-4 */
  font-size: 14px;
  font-weight: 500;
  min-height: 36px;
  transition: background 0.15s ease;
}

.btn-primary:hover {
  background: #2563EB;
}

.btn-primary:active {
  transform: scale(0.97);
}

/* Secondary */
.btn-secondary {
  background: #FFFFFF;
  color: #111827;
  border: 1px solid #E5E7EB;
  border-radius: 12px;
  padding: 8px 16px;
  font-size: 14px;
  min-height: 36px;
}

.btn-secondary:hover {
  background: #F9FAFB;
}
```

### 5-3. 입력 필드 (Input)

```css
.input {
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  border-radius: 12px;          /* rounded-xl */
  padding: 8px 12px;
  font-size: 14px;
  color: #111827;
  min-height: 36px;
}

.input:focus {
  background: #FFFFFF;
  border-color: #60A5FA;
  box-shadow: 0 0 0 2px #DBEAFE;
  outline: none;
}
```

### 5-4. 네비게이션 (Navigation)

```css
/* 사이드바 또는 상단 탭 */
.nav-item {
  font-size: 13px;
  font-weight: 500;
  color: #6B7280;
  padding: 8px 12px;
  border-radius: 8px;
  transition: all 0.15s ease;
}

.nav-item.active {
  color: #111827;
  font-weight: 600;
  background: #F3F4F6;
}

.nav-item:hover {
  background: #F9FAFB;
  color: #374151;
}
```

### 5-5. 태그 / 뱃지 (Tag / Badge)

```css
.tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
}

/* 카테고리 태그 */
.tag-category {
  background: #EDE9FE;
  color: #6D28D9;
}

/* 상태 뱃지 */
.badge-info {
  background: #DBEAFE;
  color: #1D4ED8;
}
```

### 5-6. 히어로 / CTA 배너

```css
.hero-banner {
  background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%);
  border-radius: 16px;
  padding: 24px 32px;
  border: 1px solid #BFDBFE;
}

.cta-banner {
  background: #3B82F6;
  color: #FFFFFF;
  border-radius: 12px;
  padding: 16px 24px;
}
```

### 5-7. 커뮤니티 피드 카드

```css
.feed-item {
  background: #FFFFFF;
  border: 1px solid #E5E7EB;
  border-radius: 12px;
  padding: 16px;
  transition: all 0.15s ease;
}

.feed-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transform: translateY(-1px);
}

.feed-meta {
  font-size: 12px;
  color: #9CA3AF;
}
```

---

## 6. 그림자 및 깊이 (Shadows & Elevation)

| 레벨 | CSS | 용도 |
|------|-----|------|
| **없음** | `box-shadow: none` | 기본 카드, 배지 |
| **Subtle** | `0 1px 2px rgba(0,0,0,0.04)` | 네비 바, 헤더 |
| **Card Hover** | `0 2px 8px rgba(0,0,0,0.06)` | 카드 호버 시 |
| **Dropdown** | `0 4px 16px rgba(0,0,0,0.08)` | 드롭다운, 모달 |
| **Modal** | `0 8px 32px rgba(0,0,0,0.12)` | 모달 오버레이 |

**특징:** 매우 가벼운 그림자 — opacity 0.04~0.12 범위. 플랫에 가까운 디자인.

---

## 7. 애니메이션 및 전환 (Animations & Transitions)

| 요소 | 속성 | 값 |
|------|------|-----|
| **범용 전환** | `transition` | `150ms cubic-bezier(0.4, 0, 0.2, 1)` |
| **카드 호버** | `box-shadow, transform` | `200ms ease` |
| **버튼 클릭** | `transform` | `scale(0.97)` instant |
| **모달 진입** | `opacity + transform` | `200ms ease-out`, scale 0.95→1, Y 8px→0 |
| **오버레이** | `opacity` | `150ms ease-out` |
| **맥동** | `opacity` | `2s ease-in-out infinite` (로딩) |

**원칙:** Apple 스타일 부드러운 전환. 과도한 애니메이션 없음.

---

## 8. 테두리 반경 (Border Radius)

| 토큰 | 값 | 용도 |
|------|----|----- |
| **sm** | 4px | 칩, 작은 뱃지 |
| **md** | 6px | 인라인 태그 |
| **lg** | 8px | 아이콘 버튼, 네비 아이템 |
| **xl** | 12px | 버튼, 입력 필드, 작은 카드 |
| **2xl** | 16px | 메인 카드, 히어로 |
| **full** | 9999px | 프로그레스바, 아바타 |

---

## 9. ERP 적용 시 핵심 차이점

### 현재 ERP (V:ON) vs Hanilians 비교

| 요소 | 현재 ERP | Hanilians 스타일 |
|------|---------|----------------|
| **카드 radius** | `rounded-2xl` (16px) ✅ | 동일 — 이미 일치 |
| **버튼 radius** | `rounded-xl` (12px) ✅ | 동일 — 이미 일치 |
| **입력 필드** | `rounded-xl` (12px) ✅ | 동일 — 이미 일치 |
| **색상 체계** | CSS 변수 + 4테마 ✅ | 유사한 blue 팔레트 |
| **폰트** | Inter + Noto Sans KR ✅ | 동일 — 이미 일치 |
| **그림자** | 카드 호버 `0 2px 8px` ✅ | 동일 — 이미 일치 |
| **히어로/CTA 배너** | ❌ 없음 | 그라디언트 배너 + CTA 버튼 |
| **이모지 섹션 제목** | ❌ 없음 | `⏱️ 시간표`, `🔥 새 소식` 등 |
| **카드 호버 uplift** | ❌ 없음 | `translateY(-1px)` 미세 상승 |
| **태그/뱃지 시스템** | 부분적 사용 | 체계적 `tag-{category}` 패턴 |
| **빈 상태 일러스트** | 텍스트만 | "메모가 없어요" + 이모티콘/일러스트 |
| **CTA 강조 배너** | ❌ 없음 | 의견수렴, 버그제보 등 배너 |
| **페이지네이션** | 커서 기반 | 숫자 페이지네이션 UI |

### 도입 가치가 높은 요소

1. **카드 호버 미세 상승 효과** — `translateY(-1px)` + 그림자 강화
2. **이모지 섹션 제목** — `📊 성과지표`, `💰 출자`, `📋 업무` 등
3. **CTA/안내 배너** — 그라디언트 배경 + 액션 버튼
4. **빈 상태 개선** — 이모티콘 + 안내 문구 + 생성 버튼
5. **태그/뱃지 체계** — 상태별 색상 코딩 일관성
6. **피드 카드 스타일** — 커뮤니티 피드형 최신 활동 표시
