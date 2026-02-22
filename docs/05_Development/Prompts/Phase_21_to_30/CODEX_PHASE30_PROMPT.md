# Phase 30: 글로벌 디자인 시스템(Design System) 전면 도입 및 UI/UX 규격 통일

> **Priority:** P1 (System-wide UI Consistency & Design Polish)

---

## 🚨 치명적 핵심 원칙 (Non-negotiable Rules): "기능적 무결성 및 시스템 안정성 보존"

지금까지 Phase 29를 거치며 강력한 정보 구조(IA)와 기능 연동을 완성했습니다.
본 Phase 30은 오직 **"CSS 클래스, 여백(Padding/Margin), 폰트 크기, 버튼 색상 등 시각적 규격(Visual Specs)"**만을 통일하는 100% 프론트엔드 퍼블리싱/스타일링 작업입니다.

1. **Zero Functionality Modification:** React 컴포넌트 내부의 상태(useState, useEffect), React Query 무효화 로직, 백엔드 API 호출 규격, 라우팅(Navigate) 이벤트는 단 1mg도 건드려서는 안 됩니다.
2. **이벤트 바인딩 생존 보장:** 앨리먼트의 모양(className 등)을 바꾸는 과정에서, 기존 엘리먼트가 들고 있던 `onClick`, `onChange`, `onSubmit` 등의 기능 트리거가 유실되지 않도록 극도로 유의하십시오.
3. **디자인 토큰(Design Tokens) 선언적 접근:** `tailwind.config.ts` 나 `index.css` 의 공통 유틸리티 클래스를 최우선으로 활용하여, 하드코딩된 스타일을 배제하고 단일 진실의 원천(SSOT) 기반으로 스타일을 통일하십시오.

---

## 🎨 현황 분석 및 개편 목표 (Why we need this)

현재 V:ON ERP는 여러 페이즈를 거쳐 개발되면서, 페이지마다 동일한 '취소 버튼'이나 '카드 레이아웃'의 크기, 여백, 텍스트 크기 등 미세한 차이가 누적된 상태입니다 (Design Debt).
이러한 미세한 불일치는 시스템의 '엔터프라이즈(Enterprise)' 급 신뢰도를 깎아먹습니다. 

따라서 전체 페이지에 쓰이는 핵심 UI 컴포넌트(버튼, 카드, 제목, 표 등)의 간격과 크기를 SaaS 글로벌 규격으로 **강제 통일(Standardization)**하여 압도적인 시각적 쾌적함을 부여합니다.

---

## Part 1. 브랜드 타이포그래피(Typography) 및 간격(Spacing) 규격화

**1-A. 페이지 제목(Header) 및 타이틀 통일**
- **Page Title (`h2`):** 모든 페이지 최상단 대제목 (예: 🏢 투자 관리)은 `text-2xl font-bold text-gray-900` 로 통일하고, 하단 시스템 설명(`p`)은 `text-sm text-gray-500` 로 고정합니다.
- **Section Title (`h3`):** 카드 내부의 각 섹션 제목은 항상 `text-base font-semibold text-gray-800 border-b pb-2 mb-4` 형식으로 통일하여 구조적인 안정감을 줍니다.

**1-B. 여백(Padding, Margin) 및 레이아웃 그리드(Grid)**
- **Page Wrapper:** 모든 라우팅 페이지 최상단 컨테이너는 `<div className="page-container space-y-6 p-6">` 로 여백을 넉넉하고 일관되게 잡습니다.
- **Card Wrapper (`card-base`):** 각 섹션 블록은 `<div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">` 로 규격을 일치시킵니다. 기존에 제각각 놀던 `p-2`, `p-4`, `p-5` 를 일괄 교체합니다.

---

## Part 2. 핵심 UI 컴포넌트(Component) 통일화

**2-A. 액션 버튼 (Buttons)**
현재 섞여 있는 버튼들을 아래의 4단계 규격으로 강제 맵핑합니다. 모든 버튼은 높이(height)와 라운딩(rounding)을 맞춰주세요.
*   **Primary Button (`primary-btn`):** 저장, 생성 등 핵심 액션. (`bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors`)
*   **Secondary Button (`secondary-btn`):** 취소, 닫기 등 보조 액션. (`bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium rounded-lg px-4 py-2 text-sm transition-colors`)
*   **Danger Button (`danger-btn`):** 삭제, 비활성화 등. (`bg-white border border-red-200 text-red-600 hover:bg-red-50 font-medium rounded-lg px-4 py-2 text-sm transition-colors`)
*   **Text/Icon Button:** 표 내부 액션 등. (`text-blue-600 hover:text-blue-800 text-xs px-2 py-1`)

**2-B. 폼 입력 필드 (Inputs, Selects, Textareas)**
*   모든 폼 요소는 높이 통일: `.form-input { w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 }`
*   라벨(Label): `<label className="mb-1.5 block text-xs font-semibold text-gray-700">` 로 간격과 진하기를 맞춥니다.

**2-C. 데이터 테이블(Data-Grid) 통일**
*   테이블 헤더(`th`): 높이 `py-3` 및 배경색 `bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wider` 적용.
*   테이블 바디(`td`): `py-3 border-b border-gray-100 text-sm text-gray-800`.
*   기존에 좁았던 표 내부 위아래 여백을 넓혀 호흡을 개선합니다.

---

## Files to modify

| # | Type | Target | Description |
|---|---|---|---|
| 1 | **[MODIFY]** | `frontend/src/index.css` | `.primary-btn`, `.secondary-btn`, `.card-base`, `.page-container` 등의 글로벌 CSS 유틸리티 클래스를 세밀한 규격으로 강제 오버라이드. |
| 2 | **[MODIFY]** | `frontend/src/pages/*.tsx` | 전역 페이지를 순회하며(Dashboard, Funds, Investments, Workflows 등) 제각각 작성된 하드코딩 CSS 클래스(`p-2`, `m-1` 등)를 일괄 제거하고 공통 클래스로 매핑. |
| 3 | **[MODIFY]** | `frontend/src/components/*` | 재사용 모달, 서랍(Drawer), 헤더 네비게이션 등에 폰트, 버튼 및 규격 강제 적용. |

---

## Acceptance Criteria
- [ ] AC-01: UX 디자인 시스템(버튼, 카드, 타이포그래피, 인풋 등) 개편 시 모든 기존 Data Fetching 및 Mutate 로직이 완벽히 생존해야 한다. 단 1개의 함수라도 깨질 경우 즉각 롤백한다. (Regression Zero)
- [ ] AC-02: 모든 페이지의 1뎁스 제목(`h2`) 크기와 여백이 자로 잰 듯 정확히 동일한 위치에 있어야 한다.
- [ ] AC-03: 시스템 내의 모든 [저장]/[취소] 버튼이 동일한 라운딩, 폰트 크기, 높이를 가져야 한다.
- [ ] AC-04: 카드의 모서리 곡률(Border-Radius), 외곽선 색상(Border-Color), 그리고 패딩 간격(Spacing)이 페이지마다 널뛰기하지 않고 단일한 컴포넌트처럼 일관되어야 한다.
