# Phase 65: 재무 & 회계 UX 개선

> **의존성:** Phase 64 완료
> **근거:** `docs/UXUI_IMPROVEMENT_STRATEGY.md` §3.5, §3.7

**Priority:** P1 — 재무 정확성에 직결

---

## Part 1. ExitsPage 정산 UX 개선

### 1-1. 정산 모달 (window.prompt 제거)

#### [MODIFY] `frontend/src/pages/ExitsPage.tsx`

`window.prompt("정산 금액?")`, `window.prompt("정산일?")` 제거 → ConfirmDialog promptMode 또는 전용 정산 모달:

```typescript
// 정산 모달 상태
const [settlementModal, setSettlementModal] = useState<{
  open: boolean;
  trade: ExitTrade | null;
}>({ open: false, trade: null });

// 정산 모달 내부 폼 (react-hook-form 사용)
const schema = z.object({
  settlement_amount: z.number().min(0, '정산금액을 입력해주세요'),
  settlement_date: z.string().min(1, '정산일을 입력해주세요'),
  auto_distribution: z.boolean().default(false),  // 정산 후 LP 배분 자동생성
});
```

모달 UI:
```
┌─ 매매 정산 처리 ─────────────────┐
│ 매매: A사 Series B (₩500,000,000)│
│                                   │
│ 정산금액 *                        │
│ [₩ _______________]  ← KrwAmountInput
│                                   │
│ 정산일 *                          │
│ [2026-03-01       ]              │
│                                   │
│ □ 정산 후 LP 배분 자동생성        │
│   (pro-rata 기준)                 │
│                                   │
│ [취소]              [정산 처리]    │
└───────────────────────────────────┘
```

### 1-2. 위원회 편집 Drawer화

기존 아코디언 3단 중첩 → DrawerOverlay:
- 위원회 행 클릭 → DrawerOverlay 열림
- Drawer 내에서 펀드 연결 카드 리스트
- 각 카드에 편집/삭제 버튼

---

## Part 2. AccountingPage 개선

### 2-1. 분개 불균형 경고 강화

#### [MODIFY] `frontend/src/pages/AccountingPage.tsx`

기존: 차대 합계 숫자 색상만 변경
개선: 불균형 시 경고 배너 + 저장 버튼 비활성화

```typescript
const isBalanced = totalDebit === totalCredit;

{!isBalanced && (
  <div className="warning-banner mt-3">
    <div className="info-banner-icon">⚠</div>
    <div className="info-banner-text">
      차변 합계 ({formatKRW(totalDebit)})와 대변 합계 ({formatKRW(totalCredit)})가
      일치하지 않습니다. 차이: {formatKRW(Math.abs(totalDebit - totalCredit))}
    </div>
  </div>
)}
```

### 2-2. 계정과목 폼 칼럼 정리

기존 7칼럼 → 4칼럼 (2행):
```
[코드] [계정명] [카테고리 ▼] [세부카테고리 ▼]
```

### 2-3. 인라인 편집 → FormModal

기존 "수정" 클릭 → 행 내 토글 → FormModal로 교체.

---

## Part 3. FeeManagementPage 시각화 개선

### 3-1. 수수료율 입력 개선

기존: step="0.0001" 숫자 입력만
개선: 입력값 옆에 퍼센트 표시

```
관리보수율: [0.02  ] = 2.0%
허들율:     [0.08  ] = 8.0%
캐리율:     [0.20  ] = 20.0%
```

### 3-2. 워터폴 시각화

기존: 텍스트 목록만
개선: 가로 바 차트로 비율 시각화

```
LP 원금 반환   ████████████████████████████  ₩40억 (80%)
LP 허들 수익   ████                          ₩4억  (8%)
GP Catch-up    ██                            ₩2억  (4%)
GP 캐리        ████                          ₩4억  (8%)
```

CSS: `var(--chart-series-N)` 색상 사용

### 3-3. 관리보수 카드 개선

기존: "2024 Q1 · ₩50,000,000 · nav" 압축 표시
개선: 카드형 + 상태 흐름 표시

```
┌─ 2024년 1분기 ────────────────┐
│ 관리보수: ₩50,000,000         │
│ 기준: NAV · 보수율: 2.0%      │
│ 상태: 미청구                   │
│           [청구] [수령 완료]    │
└────────────────────────────────┘
```

---

## Part 4. TransactionsPage 필터 개선

### 4-1. FilterPanel 적용

기존 6개 필터 → FilterPanel 적용:
- 항상 표시: 조합, 거래유형, 기간
- 접이식: 투자사, 세부유형, 투자건

### 4-2. 거래 카드 정보 구조화

기존 bread-crumb 스타일 ("조합: X · 투자사: Y") → 구조화:

```
┌─ 주식 매입 ──────────────── ₩500,000,000 │
│ 1호 펀드 → A사 (Series B)                │
│ 2026.02.15 · 주식 10,000주               │
│                              [상세보기]    │
└─────────────────────────────────────────── │
```

---

## 검증 체크리스트

- [ ] ExitsPage: 정산 모달 정상 동작, window.prompt 완전 제거
- [ ] ExitsPage: 위원회 Drawer 편집 동작
- [ ] AccountingPage: 차대 불균형 경고 배너 표시, 저장 버튼 비활성화
- [ ] AccountingPage: 계정과목 편집 FormModal 동작
- [ ] FeeManagementPage: 수수료율 퍼센트 표시, 워터폴 바 차트
- [ ] TransactionsPage: FilterPanel 동작
- [ ] git commit: `feat: Phase 65 financial and accounting UX`
