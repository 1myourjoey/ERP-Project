# Phase 64: 펀드 & 투자 UX 개선

> **의존성:** Phase 63 완료
> **근거:** `docs/UXUI_IMPROVEMENT_STRATEGY.md` §3.3, §3.8

**Priority:** P0 — 펀드 운용의 핵심 화면

---

## Part 1. FundsPage LP 입력 개선

### 1-1. LP 7칼럼 인라인 → 카드 리스트 + Drawer

#### [MODIFY] `frontend/src/pages/FundsPage.tsx`

기존 `md:grid-cols-[2fr_1.2fr_1.6fr_1.6fr_1.4fr_1.6fr_1.4fr]` 7칼럼 인라인 폼 제거.

개선: LP 카드 리스트

```
┌──────────────────────────────────┐
│ (주)한국투자           [법인 ▼]  │
│ 약정: ₩5,000,000,000            │
│ 납입: ₩2,000,000,000 (40%)      │
│ ████████░░░░░░░░░░░ 40%         │
│                       [✏️] [🗑️]  │
└──────────────────────────────────┘
[+ LP 추가]
```

### 1-2. LP 편집 Drawer

[+ LP 추가] 또는 [✏️] 클릭 → DrawerOverlay 열림:

```
LP명: [주소록에서 검색... ▼]   ← LPAddressBook 자동완성
유형: [법인 ▼]
약정금액: [₩ 5,000,000,000]   ← KrwAmountInput 사용
납입금액: [₩ 2,000,000,000]
사업자번호: [123-45-67890]     ← 주소록 선택 시 자동채움
연락처: [010-1234-5678]        ← 주소록 선택 시 자동채움
주소: [서울시...]               ← 주소록 선택 시 자동채움

[취소]                [저장]
```

**LP 주소록 자동완성 구현:**
- 입력 시 `fetchLPAddressBooks({ keyword })` 호출
- 드롭다운에 매칭되는 LP 주소록 항목 표시
- 선택 시 사업자번호, 연락처, 주소 자동 채움
- "새 LP" 선택 시 빈 폼

### 1-3. 펀드 카드 액션 버튼

기존: 펀드 카드에 클릭 이벤트만 (편집/삭제 버튼 없음)
개선: hover 시 우상단에 액션 아이콘 표시

```
┌─ 1호 펀드 ──────────────── [✏️][🗑️] │
│ 상태: 운용중  유형: VC             │
│ 총약정: ₩50,000,000,000          │
│ LP: 8명  투자: 12건               │
│                      [상세보기 →]  │
└────────────────────────────────────┘
```

---

## Part 2. FundDetailPage 탭 구조 정리

### 2-1. 탭 축소 (8 → 5)

#### [MODIFY] `frontend/src/pages/FundDetailPage.tsx`

기존 8탭: 조합요약, 기본정보, 자본&LP, 투자포트폴리오, NAV추이, 보수, 규약&컴플라이언스, 서류생성

개선 5탭:
```
[개요] [자본 & LP] [투자] [재무] [서류]
```

통합 매핑:
- **개요** = 기존 조합요약 + 기본정보 (편집은 인라인 또는 모달)
- **자본 & LP** = LP 현황 + 자본금 콜 + 배분 + LP 납입이력
- **투자** = 투자 포트폴리오 + NAV 추이
- **재무** = 보수 + 규약 & 컴플라이언스 + 시산표
- **서류** = 서류 생성 + 핵심 조건

### 2-2. 폼 라벨 사이즈 개선

기존: `text-xs font-medium` (12px)
개선: `text-sm font-medium` (14px) for 주요 필드, `text-xs` for 보조 필드만

---

## Part 3. InvestmentsPage 반응형 개선

### 3-1. DataTable 적용

#### [MODIFY] `frontend/src/pages/InvestmentsPage.tsx`

기존 8칼럼 테이블 → DataTable 컴포넌트 적용:

```typescript
const columns: Column<Investment>[] = [
  { key: 'fund', header: '조합', priority: 1, render: (row) => row.fund_name },
  { key: 'company', header: '투자사', priority: 1, render: (row) => row.company_name },
  { key: 'instrument', header: '투자유형', priority: 2 },
  { key: 'amount', header: '투자금액', priority: 1, align: 'right', render: (row) => formatKRW(row.amount, 'eok') },
  { key: 'valuation', header: '밸류에이션', priority: 3, align: 'right' },
  { key: 'roi', header: 'ROI', priority: 2, align: 'right' },
  { key: 'status', header: '상태', priority: 1, render: (row) => <StatusBadge ... /> },
  { key: 'date', header: '투자일', priority: 3 },
];
```

모바일 카드 렌더:
```typescript
mobileCardRender: (row) => (
  <div className="feed-card">
    <div className="feed-card-title">{row.company_name}</div>
    <div className="feed-card-meta">{row.fund_name} · {formatKRW(row.amount, 'eok')}</div>
    <StatusBadge status={mapStatus(row.status)} label={row.status} />
  </div>
)
```

### 3-2. 기업 편집 Drawer 분리

기존: DrawerOverlay 내에서 보기/생성/편집 모드 혼합
개선:
- 기업 상세 보기 → DrawerOverlay (읽기 전용)
- 기업 편집 → FormModal
- 기업 생성 → FormModal

---

## Part 4. ValuationsPage & TransactionsPage 접근 경로

### 4-1. 투자 상세에서 접근

투자 상세 페이지(`/investments/:id`)에서 밸류에이션/거래 탭으로 직접 접근:

```
투자 상세: [개요] [밸류에이션] [거래이력] [서류]
```

### 4-2. 독립 페이지 유지

`/valuations`, `/transactions` 라우트는 유지 (전체 펀드 기준 조회용).
네비게이션 메뉴에서는 숨기되, 직접 URL 접근은 보장.

---

## 검증 체크리스트

- [ ] FundsPage: LP 카드 리스트 렌더링, hover 시 편집/삭제 아이콘
- [ ] LP Drawer: 주소록 자동완성 동작, 선택 시 필드 자동채움
- [ ] 펀드 카드: hover 시 액션 버튼 표시
- [ ] FundDetailPage: 5탭 구조, 기존 모든 기능 접근 가능
- [ ] InvestmentsPage: DataTable 반응형 (데스크톱 테이블 / 모바일 카드)
- [ ] 투자 상세: 밸류에이션/거래 탭 동작
- [ ] git commit: `feat: Phase 64 fund and investment UX`
