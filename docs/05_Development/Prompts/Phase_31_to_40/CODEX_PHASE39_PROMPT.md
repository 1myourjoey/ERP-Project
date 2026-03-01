# Phase 39: 내부보고회 + 손상차손 자동 평가

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> ⚠️ **비식별화 원칙:** 실존 정보 사용 금지.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P0  
**의존성:** Phase 37 (ComplianceObligation RPT-Q-01 내부보고회 의무), Phase 38 (VICS 데이터 산출 패턴 참조)  
**후속:** Phase 40 문서 자동생성에서 후속관리보고서 + 내부보고회 통합보고서 생성

---

## Part 0. 전수조사 (필수)

- [ ] `models/investment.py` — Investment (fund_id, company_id, amount, shares, ownership_pct) 확인
- [ ] `models/biz_report.py` — BizReportRequest (revenue, net_income, total_equity 등 재무 필드) 확인
- [ ] `models/valuation.py` — Valuation 모델 (fair_value, nav 등) 확인
- [ ] `models/compliance.py` — Phase 37 ComplianceObligation 확인
- [ ] `services/compliance_engine.py` — Phase 37 엔진 확인
- [ ] `routers/biz_reports.py` — BizReport 관련 API 확인
- [ ] `models/__init__.py` — import 패턴 확인
- [ ] `main.py` — 라우터 등록 패턴 확인

---

## Part 1. 데이터 모델

#### `models/internal_review.py` [NEW]

```python
from datetime import datetime
from sqlalchemy import (
    Column, Date, DateTime, Float, ForeignKey,
    Integer, String, Text
)
from sqlalchemy.orm import relationship
from database import Base


class InternalReview(Base):
    """내부보고회 마스터"""
    __tablename__ = "internal_reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    quarter = Column(Integer, nullable=False)           # 1~4

    reference_date = Column(Date, nullable=True)        # 기준일 (분기 말일)
    review_date = Column(Date, nullable=True)           # 보고회 개최일
    status = Column(String, nullable=False, default="preparing")
    # "preparing" → "data_collecting" → "reviewing" → "completed"

    # 참석자 (JSON 배열 직렬화)
    attendees_json = Column(Text, nullable=True)        # [{ name, title, role }]

    # 준법감시인 의견
    compliance_opinion = Column(Text, nullable=True)
    compliance_officer = Column(String, nullable=True)

    # 회의록 문서 ID
    minutes_document_id = Column(Integer, nullable=True)

    # 컴플라이언스 의무 연결
    obligation_id = Column(Integer, ForeignKey("compliance_obligations.id"), nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    company_reviews = relationship("CompanyReview", back_populates="review", cascade="all, delete-orphan")


class CompanyReview(Base):
    """피투자기업별 사후관리 보고서 (내부보고회 내)"""
    __tablename__ = "company_reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)
    review_id = Column(Integer, ForeignKey("internal_reviews.id", ondelete="CASCADE"), nullable=False, index=True)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=False, index=True)

    # 분기 재무 데이터 (BizReportRequest에서 가져오거나 직접 입력)
    quarterly_revenue = Column(Float, nullable=True)
    quarterly_operating_income = Column(Float, nullable=True)
    quarterly_net_income = Column(Float, nullable=True)
    total_assets = Column(Float, nullable=True)
    total_liabilities = Column(Float, nullable=True)
    total_equity = Column(Float, nullable=True)
    cash_and_equivalents = Column(Float, nullable=True)
    paid_in_capital = Column(Float, nullable=True)      # 납입자본금 (자본잠식 계산용)

    # 인력 변동
    employee_count = Column(Integer, nullable=True)
    employee_change = Column(Integer, nullable=True)    # 전분기 대비 증감

    # 자산건전성 등급
    asset_rating = Column(String, nullable=True)        # "AA" | "A" | "B" | "C" | "D"
    rating_reason = Column(Text, nullable=True)

    # 손상차손 평가
    impairment_type = Column(String, nullable=True)     # "none" | "partial" | "full"
    impairment_amount = Column(Float, nullable=True)
    impairment_flags_json = Column(Text, nullable=True) # JSON: ["IMP-01: 자본잠식 52%", ...]

    # 주요 이슈 및 후속 조치
    key_issues = Column(Text, nullable=True)
    follow_up_actions = Column(Text, nullable=True)
    board_attendance = Column(String, nullable=True)    # 이사회/주총 참석 여부

    # 투자 의견
    investment_opinion = Column(String, nullable=True)  # "유지" | "회수검토" | "추가투자검토" | "손상처리"

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    review = relationship("InternalReview", back_populates="company_reviews")
```

> **UniqueConstraint 권장:** (review_id, investment_id) 조합 unique

---

## Part 2. 손상차손 자동 평가 로직

#### `services/impairment_evaluator.py` [NEW]

```python
async def evaluate_impairment(investment_id: int, db) -> dict:
    """
    분기 BizReport/CompanyReview 데이터 기반 손상차손 자동 판별.
    ComplianceRule IMP-01 ~ IMP-04를 코드로 실행.

    Returns:
        {
            "rating": "AA" | "A" | "B" | "C" | "D",
            "impairment_type": "none" | "partial" | "full",
            "flags": ["IMP-01: 자본잠식 52%", ...],
            "detail": { ... 각 지표 상세 ... }
        }
    """
    # 1. IMP-01: 자본잠식 50% 이상
    #    - paid_in_capital > 0 이고 total_equity < paid_in_capital * 0.5
    #    → impairment_type = "full"

    # 2. IMP-02: 3기 연속 당기순손실
    #    - 해당 investment_id의 최근 3개 분기(또는 연간) BizReportRequest 조회
    #    - net_income이 모두 < 0
    #    → impairment_type = "full"

    # 3. IMP-03: 2기 연속 매출 감소
    #    - 최근 3개 분기 revenue 비교 (최신 < 이전 < 그 이전)
    #    → impairment_type = "partial" (full이 아닌 경우)

    # 4. 등급 자동 산정
    #    - full → "D" (완전자본잠식) 또는 "C" (자본잠식 50% 이상)
    #    - partial → "B"
    #    - net_income < 0 (현분기만) → "A"
    #    - 모두 양호 → "AA"

    return result
```

---

## Part 3. API 엔드포인트

#### `routers/internal_reviews.py` [NEW]

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/internal-reviews` | 목록 (필터: fund_id, year, quarter) |
| POST | `/api/internal-reviews` | 내부보고회 생성 (body: fund_id, year, quarter) |
| GET | `/api/internal-reviews/{id}` | 상세 (CompanyReview 포함) |
| PATCH | `/api/internal-reviews/{id}` | 수정 (날짜, 참석자, 의견 등) |
| DELETE | `/api/internal-reviews/{id}` | 삭제 |
| GET | `/api/internal-reviews/{id}/company-reviews` | 피투자사별 보고서 목록 |
| PATCH | `/api/internal-reviews/{id}/company-reviews/{cr_id}` | 개별 보고서 수정 |
| POST | `/api/internal-reviews/{id}/auto-evaluate` | 전체 피투자사 손상차손 일괄 자동 판별 |
| POST | `/api/internal-reviews/{id}/complete` | 보고회 완료 처리 |

**POST /api/internal-reviews 생성 시 자동 동작:**
1. 해당 조합의 모든 active 투자건에 대해 CompanyReview 레코드 자동 생성
2. 가장 최근 BizReportRequest 재무 데이터가 있으면 자동 복사
3. 손상차손 자동 판별 실행 → impairment_flags_json, asset_rating 자동 세팅
4. reference_date = 분기 말일 자동 계산 (Q1=3/31, Q2=6/30, Q3=9/30, Q4=12/31)

**POST /auto-evaluate 응답:**
```json
{
  "evaluated": 6,
  "results": [
    {
      "company_review_id": 1,
      "company_name": "OO기업",
      "rating": "AA",
      "impairment_type": "none",
      "flags": []
    },
    {
      "company_review_id": 2,
      "company_name": "△△기업",
      "rating": "B",
      "impairment_type": "partial",
      "flags": ["IMP-03: 2기 연속 매출 감소"]
    }
  ]
}
```

---

## Part 4. 프론트엔드

### 4-1. 내부보고회 목록 페이지

#### `pages/InternalReviewPage.tsx` [NEW]

```
┌────────────────────────────────────────────────────────────────┐
│  내부보고회 관리                                                │
│                                                                │
│  [+ 내부보고회 생성]                                            │
│                                                                │
│  [필터] 조합: [전체 ▾] 연도: [2026 ▾]                          │
│                                                                │
│  조합명        | 분기 | 기준일     | 보고일     | 상태   | 액션   │
│  ──────────────────────────────────────────────────────       │
│  OO 1호 조합   | 1Q  | 2026-03-31 | 2026-04-28 | 준비중 | [상세] │
│  OO 1호 조합   | 4Q  | 2025-12-31 | 2026-01-28 | 완료   | [상세] │
│  △△ 2호 조합   | 1Q  | 2026-03-31 | -          | 미생성 |        │
└────────────────────────────────────────────────────────────────┘
```

### 4-2. 내부보고회 상세 페이지

```
┌────────────────────────────────────────────────────────────────┐
│  OO 1호 조합 2026년 1분기 내부보고회                              │
│  기준일: 2026-03-31 | 보고회 예정일: [날짜 입력]                  │
│  상태: 데이터 수집 중 (4/6 기업 완료)                             │
│                                                                │
│  [피투자기업 목록 — 카드]                                        │
│  ┌──────────────────────────────────────────────────┐          │
│  │ OO기업                                            │          │
│  │ 등급: AA ✅ | 손상: 없음                            │          │
│  │ 매출: 1,200M (전분기 1,150M +4.3%)                │          │
│  │ 순이익: 80M | 자산: 3,500M | 부채: 1,200M         │          │
│  │ [플래그 없음]                                      │          │
│  │ [상세편집] [보고서 미리보기]                         │          │
│  └──────────────────────────────────────────────────┘          │
│  ┌──────────────────────────────────────────────────┐          │
│  │ △△기업                                            │          │
│  │ 등급: B ⚠️ | 손상: 부분손상                          │          │
│  │ 매출: 300M (전분기 450M -33.3%) 📉                │          │
│  │ 순이익: -50M 🔴 | 자산: 800M | 부채: 600M         │          │
│  │ [⚠️ IMP-03: 2기 연속 매출 감소]                     │          │
│  │ [상세편집] [보고서 미리보기]                         │          │
│  └──────────────────────────────────────────────────┘          │
│  ...                                                           │
│                                                                │
│  [하단 액션]                                                    │
│  [전체 손상 자동판별] [보고회 완료 처리]                           │
└────────────────────────────────────────────────────────────────┘
```

**CompanyReview 상세편집 모달:**
- 재무 데이터 수정 폼 (자동 복사된 값 수정 가능)
- 자산건전성 등급 드롭다운 (AA/A/B/C/D) + 사유 입력
- 손상차손 유형 드롭다운 (없음/부분/전액) + 금액 입력
- 주요 이슈 / 후속 조치 / 투자 의견 텍스트 입력
- 이사회/주총 참석 여부

### 4-3. 사이드바/라우터

- 사이드바에 "내부보고회" 메뉴 추가
- 라우터에 `/internal-reviews` (목록), `/internal-reviews/:id` (상세) 등록
- `api.ts`에 internal-reviews 관련 API 함수 + 타입 전부 export

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [NEW] | `backend/models/internal_review.py` | InternalReview + CompanyReview |
| 2 | [MODIFY] | `backend/models/__init__.py` | 신규 모델 import |
| 3 | [NEW] | `backend/services/impairment_evaluator.py` | 손상차손 자동 판별 로직 |
| 4 | [NEW] | `backend/routers/internal_reviews.py` | 내부보고회 전체 API |
| 5 | [MODIFY] | `backend/main.py` | internal_reviews 라우터 등록 |
| 6 | [NEW] | `frontend/src/pages/InternalReviewPage.tsx` | 내부보고회 목록 + 상세 UI |
| 7 | [MODIFY] | `frontend/src/lib/api.ts` | internal-reviews API 함수 + 타입 |
| 8 | [MODIFY] | 사이드바/라우터 | 내부보고회 메뉴 + 경로 |
| 9 | [NEW] | Alembic 마이그레이션 | internal_reviews + company_reviews 테이블 |

---

## Acceptance Criteria

- [ ] **AC-01:** 내부보고회를 생성하면 해당 조합의 모든 active 투자건에 대한 CompanyReview가 자동 생성된다.
- [ ] **AC-02:** 가장 최근 BizReportRequest 재무 데이터가 CompanyReview에 자동 복사된다.
- [ ] **AC-03:** 손상차손 자동 판별이 동작하고 IMP-01~04 플래그가 설정된다.
- [ ] **AC-04:** 자산건전성 등급(AA~D)이 자동 산정된다.
- [ ] **AC-05:** CompanyReview별 재무 데이터, 등급, 이슈, 의견을 수정할 수 있다.
- [ ] **AC-06:** 전체 피투자사 손상차손 일괄 자동 판별이 동작한다.
- [ ] **AC-07:** 내부보고회 목록/상세 페이지가 정상 표시된다.
- [ ] **AC-08:** 보고회 완료 처리가 동작한다.
- [ ] **AC-09:** Phase 31~38의 모든 기능 유지.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. 기존 BizReport/BizReportRequest 모델 — 읽기만, 수정 금지
3. 기존 Investment 모델 — 읽기만, 수정 금지
4. Phase 31~38의 기존 구현 — 보강만, 삭제/재구성 금지
