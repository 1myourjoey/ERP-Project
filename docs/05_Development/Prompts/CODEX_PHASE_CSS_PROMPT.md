# Phase 23: Hanilians 디자인 레퍼런스 기반 ERP UI 개선

> **Priority:** P0
> **레퍼런스:** [hanilians_styleguide.md](./hanilians_styleguide.md) — https://www.hanilians.xyz/ 분석 결과
> **방법론:** [UI/UX 디자인 프롬프팅 전략 3단계](https://velog.io/@yurizoa/UIUX-%EB%94%94%EC%9E%90%EC%9D%B8-%ED%94%84%EB%A1%AC%ED%94%84%ED%8C%85-%EC%A0%84%EB%9E%B5) — styleguide 기반 구현

---

## 목표

`hanilians_styleguide.md`을 레퍼런스로, 현재 ERP의 **이미 일치하는 디자인 토큰은 유지**하면서 **도입 가치가 높은 6개 디자인 패턴**을 전체 페이지에 적용한다.

---

## Table of Contents

1. [Part 1 — 카드 인터랙션 개선](#part-1)
2. [Part 2 — 이모지 섹션 제목](#part-2)
3. [Part 3 — CTA / 안내 배너 시스템](#part-3)
4. [Part 4 — 빈 상태(Empty State) 개선](#part-4)
5. [Part 5 — 태그 · 뱃지 시스템 정규화](#part-5)
6. [Part 6 — 피드 카드 스타일 (최신 활동)](#part-6)

---

## 현재 ERP CSS 유지 사항 (변경 금지)

아래 토큰은 `hanilians_styleguide.md`와 이미 일치하므로 **절대 변경하지 않는다**:

- `--color-primary: #1E3A5F` / `--color-accent: #3B82F6`
- `--theme-bg`, `--theme-card`, `--theme-text` 등 CSS 변수 전체
- 테마 4종 (default, cream, mint, lavender)
- `card-base` → `rounded-2xl p-5` + border
- `primary-btn` → `rounded-xl bg-blue-600`
- `secondary-btn`, `danger-btn` 전체
- Font: `Inter, Noto Sans KR, system-ui`
- 전역 `.loading-state`, `.loading-spinner`, `.empty-state`
- 모달 애니메이션 (`modal-enter`, `overlay-enter`)
- `document-preview` 계열 전체
- `prefers-reduced-motion` 미디어 쿼리

---

## Part 1 — 카드 인터랙션 개선

### 1-A. 호버 시 미세 상승 효과

현재 `card-base:hover`는 그림자만 추가. 여기에 `translateY(-1px)` uplift 추가:

```css
/* index.css 수정 */
.card-base:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.07);
  transform: translateY(-1px);
}
```

### 1-B. 클릭 가능한 카드에 커서 추가

카드가 클릭 가능한 경우 (onClick 있는 경우) `cursor-pointer` 를 이미 적용 중인 곳은 유지, 누락된 곳 확인:

**확인 대상 페이지:**
- `DashboardPage.tsx` — StatCard, 워크플로 카드
- `FundOverviewPage.tsx` — 조합 카드
- `InvestmentsPage.tsx` — 투자 카드
- `TaskBoardPage.tsx` — 업무 카드

### 1-C. 카드 active 상태

터치 디바이스에서의 피드백:

```css
/* index.css 추가 */
.card-base:active {
  transform: scale(0.99);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
```

---

## Part 2 — 이모지 섹션 제목

### 2-A. 매핑 테이블

Hanilians처럼 섹션 제목에 이모지를 붙여 시각적 인식성과 친근감을 높인다.

| 페이지 | 현재 제목 | → 변경 후 |
|--------|---------|---------|
| DashboardPage | "오늘 업무" | "📋 오늘 업무" |
| DashboardPage | "진행 중인 워크플로" | "🔄 진행 중인 워크플로" |
| DashboardPage | "이번 주 업무" | "📅 이번 주 업무" |
| DashboardPage | "미수집 서류" | "📁 미수집 서류" |
| DashboardPage | "보고 마감" | "📊 보고 마감" |
| DashboardPage | "오늘 완료" | "✅ 오늘 완료" |
| FundOperationsPage | "LP 관리" | "👥 LP 관리" |
| FundOperationsPage | "성과지표" | "📈 성과지표" |
| FundOperationsPage | "출자" | "💰 출자" |
| FundOperationsPage | "배분" | "💸 배분" |
| FundOperationsPage | "총회" | "🏛️ 총회" |
| InvestmentsPage | 투자 목록 헤더 | "🏢 투자 포트폴리오" |
| WorkflowsPage | 워크플로 관리 | "⚙️ 워크플로 관리" |
| ChecklistsPage | 체크리스트 | "☑️ 체크리스트" |
| CalendarPage | 캘린더 | "🗓️ 캘린더" |
| WorkLogsPage | 업무일지 | "📝 업무일지" |
| ReportsPage | 보고 | "📑 보고" |
| BizReportsPage | 사업보고 | "🏢 사업보고" |
| ExitsPage | EXIT | "🚪 EXIT" |
| ValuationsPage | 밸류에이션 | "💎 밸류에이션" |
| TransactionsPage | 거래내역 | "💳 거래내역" |
| AccountingPage | 결산 | "🧮 결산" |
| DocumentsPage | 서류관리 | "📄 서류관리" |
| TaskBoardPage | 업무 보드 | "📌 업무 보드" |

### 2-B. 구현 방식

각 페이지의 `<h2 className="page-title">` 내용에 이모지 프리픽스만 추가:

```tsx
// 변경 전:
<h2 className="page-title">업무 보드</h2>

// 변경 후:
<h2 className="page-title">📌 업무 보드</h2>
```

`page-subtitle`은 변경하지 않는다.

---

## Part 3 — CTA / 안내 배너 시스템

### 3-A. 배너 CSS 클래스

Hanilians의 히어로 배너 + CTA 배너를 ERP에 도입:

```css
/* index.css 추가 */
.info-banner {
  background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%);
  border: 1px solid #BFDBFE;
  border-radius: 16px;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.info-banner-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: #DBEAFE;
  color: #2563EB;
}

.info-banner-text {
  flex: 1;
  font-size: 13px;
  color: #1E40AF;
}

.info-banner-action {
  flex-shrink: 0;
}

.warning-banner {
  background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%);
  border: 1px solid #FDE68A;
  border-radius: 16px;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.success-banner {
  background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
  border: 1px solid #A7F3D0;
  border-radius: 16px;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}
```

### 3-B. 적용 대상

| 위치 | 배너 유형 | 내용 |
|------|---------|------|
| DashboardPage 상단 | `info-banner` | 월간 보고 미생성 알림 (기존 `border-amber-300 bg-amber-50` → `warning-banner`로 교체) |
| FundOverviewPage | `info-banner` | "조합을 클릭하여 상세 정보를 확인하세요" 가이드 |
| TaskBoardPage | `info-banner` | 기한 임박 업무 알림 (기한 24시간 이내 업무 존재 시) |
| FundOperationsPage | `warning-banner` | "LP 약정 합계 불일치" 경고 (기존 `⚠️ 차이 있음` 텍스트 → 배너형) |

---

## Part 4 — 빈 상태(Empty State) 개선

### 4-A. 현재 문제

대부분 빈 상태가 단순 텍스트: `<p className="text-gray-400">데이터가 없습니다.</p>`

### 4-B. 개선 패턴

Hanilians의 "메모가 없어요" 스타일 → 이모지 + 설명 + 액션 버튼:

```tsx
// 공통 빈 상태 컴포넌트 패턴
function EmptyState({ emoji, message, action, actionLabel }: {
  emoji: string
  message: string
  action?: () => void
  actionLabel?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <span className="text-4xl">{emoji}</span>
      <p className="mt-3 text-sm text-gray-400">{message}</p>
      {action && actionLabel && (
        <button onClick={action} className="primary-btn mt-4 text-xs">
          {actionLabel}
        </button>
      )}
    </div>
  )
}
```

### 4-C. 빈 상태 매핑

| 페이지/섹션 | 이모지 | 메시지 | 액션 |
|-----------|--------|-------|------|
| 대시보드 — 오늘 업무 | 🎉 | "오늘 예정된 업무가 없어요" | "업무 추가" → Quick Add |
| 대시보드 — 워크플로 | 🔄 | "진행 중인 워크플로가 없어요" | "워크플로 시작" → navigate |
| 업무보드 — 업무 없음 | 📋 | "등록된 업무가 없어요" | "업무 추가" → Add form |
| 투자 — 목록 비어있음 | 🏢 | "등록된 투자건이 없어요" | "투자 등록" |
| 조합운영 — LP 없음 | 👥 | "등록된 LP가 없어요" | "LP 추가" |
| 조합운영 — 출자 없음 | 💰 | "등록된 출자 내역이 없어요" | "출자 등록" |
| 체크리스트 — 비어있음 | ☑️ | "체크리스트가 없어요" | "새 체크리스트" |
| 업무일지 — 비어있음 | 📝 | "작성된 업무일지가 없어요" | "일지 작성" |
| 메모/캘린더 — 비어있음 | 🗓️ | "등록된 일정이 없어요" | "일정 추가" |
| 서류 — 비어있음 | 📄 | "등록된 서류가 없어요" | - |
| 검색 결과 없음 | 🔍 | "검색 결과가 없어요" | - |

---

## Part 5 — 태그 · 뱃지 시스템 정규화

### 5-A. CSS 클래스 추가

현재 각 페이지에서 인라인으로 `bg-blue-100 text-blue-700` 등을 사용. 이를 재사용 가능한 클래스로 정규화:

```css
/* index.css 추가 */

/* 태그 기본 */
.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

/* 상태별 태그 */
.tag-blue {
  background: #DBEAFE;
  color: #1D4ED8;
}

.tag-green {
  background: #D1FAE5;
  color: #065F46;
}

.tag-amber {
  background: #FEF3C7;
  color: #92400E;
}

.tag-red {
  background: #FEE2E2;
  color: #991B1B;
}

.tag-purple {
  background: #EDE9FE;
  color: #5B21B6;
}

.tag-indigo {
  background: #E0E7FF;
  color: #3730A3;
}

.tag-gray {
  background: #F3F4F6;
  color: #374151;
}

.tag-emerald {
  background: #D1FAE5;
  color: #065F46;
}
```

### 5-B. 적용 대상

| 현재 인라인 스타일 | → 교체 태그 클래스 | 용도 |
|-----------------|---------------|------|
| `bg-blue-100 text-blue-700` | `tag tag-blue` | 업무 카테고리, 펀드 뱃지 |
| `bg-green-100 text-green-700` | `tag tag-green` | 완료 상태 |
| `bg-amber-100 text-amber-700` | `tag tag-amber` | 대기/주의 상태 |
| `bg-red-100 text-red-700` | `tag tag-red` | 긴급/삭제 |
| `bg-indigo-100 text-indigo-700` | `tag tag-indigo` | 워크플로 |
| `bg-gray-100 text-gray-700` | `tag tag-gray` | 일반/기본 |
| `bg-emerald-100 text-emerald-700` | `tag tag-emerald` | 성공/납입완료 |

**단, 기존 동작은 유지** — className만 교체하는 리팩토링. 기능 변경 없음.

---

## Part 6 — 피드 카드 스타일 (최신 활동)

### 6-A. 피드 카드 CSS

Hanilians 커뮤니티 피드 스타일을 대시보드에 적용:

```css
/* index.css 추가 */
.feed-card {
  background-color: var(--theme-card, #ffffff);
  border: 1px solid var(--theme-border, #e5e7eb);
  border-radius: 12px;
  padding: 12px 16px;
  transition: all 0.15s ease;
  cursor: pointer;
}

.feed-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transform: translateY(-1px);
}

.feed-card-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-text, #111827);
  line-height: 1.4;
}

.feed-card-meta {
  font-size: 12px;
  color: var(--theme-text-secondary, #9CA3AF);
  margin-top: 4px;
}
```

### 6-B. 적용 대상

대시보드 우측 패널의 **통지/보고/서류 목록**에 피드 카드 스타일 적용:

```tsx
// 변경 전 (각 항목이 단순 텍스트 리스트):
<div className="border-b py-2 text-sm">{item.title}</div>

// 변경 후:
<div className="feed-card" onClick={...}>
  <p className="feed-card-title">{item.title}</p>
  <p className="feed-card-meta">{item.fund_name} · {formatDate(item.due_date)}</p>
</div>
```

---

## Files to create / modify

| # | Type | File | Part | Changes |
|---|------|------|------|---------|
| 1 | **[MODIFY]** | `frontend/src/index.css` | 1,3,5,6 | 카드 호버 uplift, banner 클래스, tag 클래스, feed-card 추가 |
| 2 | **[MODIFY]** | `frontend/src/pages/DashboardPage.tsx` | 2,3,4,6 | 이모지 제목, 배너 교체, 빈 상태, 피드 카드 |
| 3 | **[MODIFY]** | `frontend/src/pages/TaskBoardPage.tsx` | 2,4 | 이모지 제목, 빈 상태 |
| 4 | **[MODIFY]** | `frontend/src/pages/FundOperationsPage.tsx` | 2,3,4 | 이모지 제목, 약정 불일치 배너, 빈 상태 |
| 5 | **[MODIFY]** | `frontend/src/pages/InvestmentsPage.tsx` | 2,4,5 | 이모지, 빈 상태, 태그 교체 |
| 6 | **[MODIFY]** | `frontend/src/pages/InvestmentDetailPage.tsx` | 5 | 태그 교체 |
| 7 | **[MODIFY]** | `frontend/src/pages/WorkflowsPage.tsx` | 2,4,5 | 이모지, 빈 상태, 태그 교체 |
| 8 | **[MODIFY]** | `frontend/src/pages/FundOverviewPage.tsx` | 1,2,3 | 카드 호버, 이모지, 가이드 배너 |
| 9 | **[MODIFY]** | `frontend/src/pages/FundDetailPage.tsx` | 5 | 태그 교체 |
| 10 | **[MODIFY]** | `frontend/src/pages/FundsPage.tsx` | 2 | 이모지 |
| 11 | **[MODIFY]** | `frontend/src/pages/ChecklistsPage.tsx` | 2,4 | 이모지, 빈 상태 |
| 12 | **[MODIFY]** | `frontend/src/pages/CalendarPage.tsx` | 2,4 | 이모지, 빈 상태 |
| 13 | **[MODIFY]** | `frontend/src/pages/WorkLogsPage.tsx` | 2,4 | 이모지, 빈 상태 |
| 14 | **[MODIFY]** | `frontend/src/pages/ReportsPage.tsx` | 2,4 | 이모지, 빈 상태 |
| 15 | **[MODIFY]** | `frontend/src/pages/BizReportsPage.tsx` | 2,4 | 이모지, 빈 상태 |
| 16 | **[MODIFY]** | `frontend/src/pages/ExitsPage.tsx` | 2,4 | 이모지, 빈 상태 |
| 17 | **[MODIFY]** | `frontend/src/pages/ValuationsPage.tsx` | 2,4 | 이모지, 빈 상태 |
| 18 | **[MODIFY]** | `frontend/src/pages/TransactionsPage.tsx` | 2,4 | 이모지, 빈 상태 |
| 19 | **[MODIFY]** | `frontend/src/pages/AccountingPage.tsx` | 2,4 | 이모지, 빈 상태 |
| 20 | **[MODIFY]** | `frontend/src/pages/DocumentsPage.tsx` | 2,4 | 이모지, 빈 상태 |
| 21 | **[MODIFY]** | `frontend/src/pages/TemplateManagementPage.tsx` | 2 | 이모지 |
| 22 | **[MODIFY]** | `frontend/src/components/SearchModal.tsx` | 4 | 검색 빈 상태 |

---

## Acceptance Criteria

### Part 1: 카드 인터랙션
- [ ] AC-01: `card-base:hover` 시 `translateY(-1px)` + 강화된 그림자 적용
- [ ] AC-02: `card-base:active` 시 `scale(0.99)` 적용
- [ ] AC-03: onClick이 있는 모든 카드에 `cursor-pointer` 확인

### Part 2: 이모지 섹션 제목
- [ ] AC-04: 모든 page-title에 이모지 프리픽스 추가 (매핑 테이블 24건 전부)
- [ ] AC-05: page-subtitle은 변경 없음

### Part 3: CTA/안내 배너
- [ ] AC-06: `info-banner`, `warning-banner`, `success-banner` CSS 클래스 추가
- [ ] AC-07: DashboardPage 월간 보고 알림 → `warning-banner` 교체
- [ ] AC-08: FundOperationsPage 약정 불일치 경고 → `warning-banner` 교체

### Part 4: 빈 상태
- [ ] AC-09: 모든 빈 상태에 이모지(4xl) + 설명 메시지 + 선택적 액션 버튼
- [ ] AC-10: 빈 상태 매핑 11건 전부 적용

### Part 5: 태그/뱃지
- [ ] AC-11: `tag`, `tag-{color}` CSS 클래스 8종 추가
- [ ] AC-12: 기존 인라인 태그 스타일을 클래스로 교체 (최소 주요 페이지 5곳)
- [ ] AC-13: 교체 후 기존 시각적 결과 동일

### Part 6: 피드 카드
- [ ] AC-14: `feed-card` 계열 CSS 클래스 추가
- [ ] AC-15: 대시보드 우측 패널 목록에 피드 카드 스타일 적용

### 공통
- [ ] AC-16: `npm run build` TypeScript 에러 0건
- [ ] AC-17: 기존 기능 정상 동작
- [ ] AC-18: CSS 변수 기반 테마 4종 전체에서 정상 렌더링
- [ ] AC-19: `hanilians_styleguide.md`의 "변경 금지" 항목들이 수정되지 않음
- [ ] AC-20: console.log/print 디버깅 코드 없음

---

## 구현 주의사항

1. **CSS 변수 호환:** 새 클래스(`info-banner`, `feed-card` 등)에서 `var(--theme-*)` 변수 사용하여 4개 테마 전체 호환 유지.
2. **태그 교체 범위:** 전체 페이지의 인라인 태그를 한 번에 교체하면 범위가 너무 넓으므로, 주요 5개 페이지(Dashboard, TaskBoard, Investments, FundOperations, Workflows)를 우선 교체하고, 나머지는 패턴이 동일하므로 일괄 적용.
3. **이모지 접근성:** screen reader에서 이모지가 읽히지 않도록 `aria-hidden="true"` 처리하거나, 이모지를 `<span role="img" aria-label="...">` 으로 감싸는 것은 선택사항 (ERP 내부 도구이므로 생략 가능).
4. **빈 상태 이모지 크기:** `text-4xl`(36px) — 너무 크지 않으면서 시각적 존재감.
5. **배너 그라디언트 테마 호환:** 기본/cream/mint/lavender 테마별로 배너 배경색이 어울리는지 확인. 기본 blue → 모든 테마에서 무난.
6. **feed-card의 --theme-card 사용:** 피드 카드 배경색을 CSS 변수로 설정하여 테마 전환 시 자동 반영.
7. **기존 hanilians_styleguide.md 참조:** 구현 시 컴포넌트별 정확한 수치(radius, padding, shadow)는 styleguide.md를 기준으로 한다.
