# Phase 33: 투자 심의 파이프라인 + 거래 원장 세분화 + 기존 UX 고도화

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
>
> ⚠️ **비식별화 원칙:** 실존 회사명·인명 사용 금지. 예시: `"테크스타트업(주)"`, `"홍길동"` 등 가명 사용.
>
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P0  
**의존성:** 없음 (기반 레이어)  
**후속:** Phase 34가 이 Phase의 거래 원장을 전제로 함

---

## Part 0. 전수조사 (필수)

구현 전 아래 연계 항목을 코드 레벨에서 확인:

- [ ] `investments` 테이블 구조 — 심의에서 자동 생성할 레코드 구조 확인
- [ ] `transactions.py` 라우터 — 기존 거래 CRUD 시그니처 확인 (확장, 삭제 금지)
- [ ] `TransactionsPage.tsx` — 기존 UI 구조 확인
- [ ] `ExitsPage.tsx` (459줄) — 회수 거래(ExitTrade)와 Transaction의 관계 확인
- [ ] `InvestmentDetailPage.tsx` — 탭 구조 확인 (심의 이력 탭 추가 위치)
- [ ] `DashboardDefaultView.tsx` — 배너/위젯 추가 위치 확인
- [ ] `CalendarPage.tsx` + `MiniCalendar` — 이벤트 표시 구조 확인
- [ ] `api.ts` — 기존 export/타입 패턴 확인
- [ ] `queryInvalidation.ts` — 공통 invalidate 함수 확인

---

## Part 1. 투자 심의 프로세스 (NEW)

### 1-1. 데이터 모델

#### `models/investment_review.py` [NEW]

```python
class InvestmentReview(Base):
    __tablename__ = "investment_reviews"
    id = Column(Integer, primary_key=True, autoincrement=True)
    company_name = Column(String, nullable=False)        # 대상 기업명
    sector = Column(String, nullable=True)               # 업종
    stage = Column(String, nullable=True)                 # Seed / Pre-A / Series A / B / C+
    deal_source = Column(String, nullable=True)           # 소싱 경로 (자체발굴/추천/공모 등)
    reviewer = Column(String, nullable=True)              # 담당 심사역
    status = Column(String, default="소싱")
    # status: 소싱 → 검토중 → 실사중 → 상정 → 의결 → 집행 → 완료 / 중단
    
    # 투자 개요
    target_amount = Column(Numeric, nullable=True)        # 투자 희망 금액
    pre_valuation = Column(Numeric, nullable=True)        # Pre-money 밸류에이션
    post_valuation = Column(Numeric, nullable=True)       # Post-money
    instrument = Column(String, nullable=True)            # 보통주/우선주/CB/CPS/RCPS/BW/SA
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=True, index=True)
    
    # 진행 일정
    review_start_date = Column(Date, nullable=True)
    dd_start_date = Column(Date, nullable=True)
    committee_date = Column(Date, nullable=True)
    decision_date = Column(Date, nullable=True)
    execution_date = Column(Date, nullable=True)
    
    # 의결 결과
    review_opinion = Column(Text, nullable=True)          # 심사역 종합 의견
    committee_opinion = Column(Text, nullable=True)       # 투심위 의견
    decision_result = Column(String, nullable=True)       # 승인 / 반려 / 보류 / 조건부승인
    rejection_reason = Column(Text, nullable=True)        # 중단/반려 사유
    
    # 연결
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=True)
    # 의결 완료 후 investment로 전환 시 연결
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class ReviewComment(Base):
    """검토 과정 코멘트 이력"""
    __tablename__ = "review_comments"
    id = Column(Integer, primary_key=True, autoincrement=True)
    review_id = Column(Integer, ForeignKey("investment_reviews.id", ondelete="CASCADE"), index=True)
    author = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    comment_type = Column(String, default="opinion")
    # comment_type: opinion / question / risk / positive / decision / memo
    created_at = Column(DateTime, default=func.now())
```

### 1-2. API

#### `routers/investment_reviews.py` [NEW]

| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/api/investment-reviews` | 전체 목록 (status 필터 지원) |
| GET | `/api/investment-reviews/{id}` | 상세 (코멘트 포함) |
| POST | `/api/investment-reviews` | 신규 등록 |
| PUT | `/api/investment-reviews/{id}` | 수정 |
| DELETE | `/api/investment-reviews/{id}` | 삭제 |
| PATCH | `/api/investment-reviews/{id}/status` | 상태 변경 (파이프라인 이동) |
| POST | `/api/investment-reviews/{id}/convert` | 의결 완료 → Investment 자동 생성 |
| GET | `/api/investment-reviews/{id}/comments` | 코멘트 목록 |
| POST | `/api/investment-reviews/{id}/comments` | 코멘트 추가 |
| DELETE | `/api/review-comments/{id}` | 코멘트 삭제 |
| GET | `/api/investment-reviews/weekly-summary` | 주간 보고 요약 (상태별 카운트 + 최근 활동) |

**상태 전이 규칙:**
```
소싱 → 검토중 → 실사중 → 상정 → 의결 → 집행 → 완료
                                    ↘ 중단 (어느 단계에서든 가능)
```

**convert 엔드포인트:**
1. `decision_result`가 "승인"인 경우만 허용
2. `investments` 테이블에 자동 레코드 생성 (`company_name`, `fund_id`, `instrument`, `target_amount` 매핑)
3. `investment_id` 역참조 설정

### 1-3. 프론트엔드

#### `pages/InvestmentReviewPage.tsx` [NEW]

**칸반 보드 뷰:**
```
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│ 소싱 (3) │ │검토중(2) │ │실사중(1) │ │ 상정 (1)│ │ 의결 (0)│ │집행/완료 │
│         │ │         │ │         │ │         │ │         │ │         │
│ ┌─────┐ │ │ ┌─────┐ │ │ ┌─────┐ │ │ ┌─────┐ │ │         │ │         │
│ │카드A│ │ │ │카드D│ │ │ │카드F│ │ │ │카드G│ │ │         │ │         │
│ └─────┘ │ │ └─────┘ │ │ └─────┘ │ │ └─────┘ │ │         │ │         │
│ ┌─────┐ │ │ ┌─────┐ │ │         │ │         │ │         │ │         │
│ │카드B│ │ │ │카드E│ │ │         │ │         │ │         │ │         │
│ └─────┘ │ │ └─────┘ │ │         │ │         │ │         │ │         │
└─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
```

**카드 내용:** 기업명 / 업종 / 투자금액 / 심사역 / 최근 활동일

**검토 상세 모달 또는 사이드 패널:**
- 기업 정보 (이름, 업종, 투자단계)
- 투자 구조 (금액, 밸류에이션, 수단)
- 진행 일정 타임라인
- 코멘트 히스토리 (채팅형 타임라인, 유형별 아이콘)
- 첨부 파일 (Phase 32 파일 첨부 시스템 활용)
- 상태 변경 버튼

**주간 보고 탭:**
- 상태별 건수 표시 (소싱 3 | 검토 2 | 실사 1 | ...)
- 금주 신규 건, 상태 변경 건, 코멘트 추가 건 리스트

#### `InvestmentDetailPage.tsx` [MODIFY]

- "심의 이력" 탭 추가: 해당 투자건에 연결된 InvestmentReview가 있으면 코멘트 타임라인 표시

#### 사이드바/라우터 [MODIFY]

- 사이드바에 "투자 심의" 메뉴 추가 (투자 그룹 내)

---

## Part 2. 거래 원장 세분화

### 2-1. 모델 확장

#### `models/transaction.py` [MODIFY]

기존 Transaction 모델에 필드 추가:

```python
# 추가 필드
transaction_subtype = Column(String, nullable=True)    # follow_on, conversion, mna_sale 등
counterparty = Column(String, nullable=True)           # 거래 상대방
conversion_detail = Column(Text, nullable=True)        # 전환 거래 상세 (JSON: 전환가, 전환주수 등)
settlement_date = Column(Date, nullable=True)           # 결제일 (거래일과 다를 수 있음)
```

### 2-2. API 확장

#### `routers/transactions.py` [MODIFY]

기존 CRUD 유지 + 추가:

| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/api/transactions/ledger` | 거래 원장 조회 (기간, 유형, 투자건 필터) |
| GET | `/api/transactions/summary` | 거래 요약 (유형별 건수/금액) |

### 2-3. 프론트엔드

#### `TransactionsPage.tsx` [MODIFY]

1. **거래 유형 필터:** 드롭다운으로 투자/회수/전환/배당 등 필터
2. **등록 폼 동적화:** 거래 유형 선택 시 필수 필드가 변경
   - 투자: 금액, 주수, 단가 필수
   - 전환: 전환가격, 전환주수, 원 수단 필수
   - 회수: 매도가, 매도주수, 실현손익 필수
3. **거래 원장 뷰:** 시점별 누적 잔액 표시
4. **기존 CRUD:** 시그니처 유지, 필드만 추가

---

## Part 3. 기존 UX 고도화

### 3-1. `FundOverviewPage.tsx` [MODIFY]

상단에 KPI 카드 추가:
```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ 총 약정액  │ │  투자율   │ │  배분율   │ │ 운용 NAV │
│  ₩150억  │ │  67.3%   │ │  12.5%   │ │  ₩112억  │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```
- 조합 상태 배지 (운용중/청산중/청산완료)
- 리스트에 진행률 바 추가

### 3-2. `LPManagementPage.tsx` [MODIFY]

- LP 유형 필터 (개인/법인/기관투자자/정부기관)
- 약정/납입 진행률 바 (약정 대비 납입 비율)
- LP 카드에 출자 잔액 표시

### 3-3. `AccountingPage.tsx` [MODIFY]

- 계정별 원장 뷰 추가: 특정 계정과목 선택 시 해당 전표만 필터 + 잔액 표시
- 합계 잔액 표시

### 3-4. `ReportsPage.tsx` [MODIFY]

- 상태 배지 (요청→수집→작성→완료)
- 조합별 보고 현황 매트릭스 뷰

### 3-5. 전체 공통

- Skeleton UI: PageLoading 컴포넌트를 콘텐츠 형태에 맞는 Skeleton으로 교체
- 에러 바운더리 + 재시도 버튼
- Empty State 통일: 아이콘 + 문구 + CTA

---

## Files to modify / create

| # | Type | Target | Description |
|---|---|---|---|
| 1 | [NEW] | `backend/models/investment_review.py` | InvestmentReview + ReviewComment 모델 |
| 2 | [NEW] | `backend/routers/investment_reviews.py` | 심의 CRUD + 상태전이 + convert + 주간보고 API |
| 3 | [MODIFY] | `backend/models/transaction.py` | subtype, counterparty, conversion_detail 필드 추가 |
| 4 | [MODIFY] | `backend/routers/transactions.py` | ledger, summary 엔드포인트 추가 |
| 5 | [NEW] | `frontend/src/pages/InvestmentReviewPage.tsx` | 칸반 보드 + 상세 + 주간보고 |
| 6 | [MODIFY] | `frontend/src/pages/TransactionsPage.tsx` | 유형 필터 + 동적 폼 + 원장 뷰 |
| 7 | [MODIFY] | `frontend/src/pages/InvestmentDetailPage.tsx` | 심의 이력 탭 |
| 8 | [MODIFY] | `frontend/src/pages/FundOverviewPage.tsx` | KPI 카드 + 상태 배지 |
| 9 | [MODIFY] | `frontend/src/pages/LPManagementPage.tsx` | 유형 필터 + 진행률 바 |
| 10 | [MODIFY] | `frontend/src/pages/AccountingPage.tsx` | 계정별 원장 + 잔액 |
| 11 | [MODIFY] | `frontend/src/pages/ReportsPage.tsx` | 상태 매트릭스 |
| 12 | [MODIFY] | `frontend/src/lib/api.ts` | 심의/거래 API 함수 + 타입 |
| 13 | [MODIFY] | 사이드바/라우터 | 투자 심의 메뉴 추가 |
| 14 | [NEW] | Alembic 마이그레이션 | investment_reviews + review_comments + transaction 확장 |

---

## Acceptance Criteria

- [ ] **AC-01:** 투자 심의 칸반 보드에서 카드를 보고 상태별 건수를 확인할 수 있다.
- [ ] **AC-02:** 검토 상세에서 코멘트를 추가하고, 코멘트 타임라인이 표시된다.
- [ ] **AC-03:** 상태 변경이 정의된 전이 규칙에 따라 동작한다.
- [ ] **AC-04:** 의결 완료 건을 Investment로 자동 전환(convert)할 수 있다.
- [ ] **AC-05:** 주간 보고 뷰에서 상태별 카운트 + 최근 활동이 표시된다.
- [ ] **AC-06:** 거래 유형이 10종으로 세분화되고, 유형 필터가 동작한다.
- [ ] **AC-07:** 거래 등록 시 유형에 따라 필수 필드가 자동 변경된다.
- [ ] **AC-08:** FundOverviewPage에 KPI 카드(약정액, 투자율, 배분율)가 표시된다.
- [ ] **AC-09:** LPManagementPage에 유형 필터 + 납입 진행률 바가 표시된다.
- [ ] **AC-10:** AccountingPage에 계정별 원장 뷰가 동작한다.
- [ ] **AC-11:** 대시보드에 진행 중 심의건 카운트가 표시된다.
- [ ] **AC-12:** CalendarPage에 투심위 일정이 표시된다.
- [ ] **AC-13:** Phase 31~32의 모든 기능 유지.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. Q1~Q4 칸반 구조 — 그대로 유지
3. 기존 Transaction CRUD API 시그니처 — 유지 (확장만)
4. ExitsPage의 기존 회수위원회/거래 구조 — 유지 (Phase 35에서 고도화)
5. Phase 31~32의 기존 구현 — 보강만, 삭제/재구성 금지
