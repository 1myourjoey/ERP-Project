# Phase 38: VICS 월보고 데이터 자동 산출

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> ⚠️ **비식별화 원칙:** 실존 정보 사용 금지.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P0  
**의존성:** Phase 37 (ComplianceObligation 중 RPT-M-01/02/03이 VICS 보고와 연동)  
**후속:** Phase 39 내부보고회에서 CompanyReview 재무 데이터와 연동

---

## Part 0. 전수조사 (필수)

- [ ] `models/fund.py` — Fund (commitment_total, account_number, trustee) 확인
- [ ] `models/fund.py` — LP (name, type, commitment, paid_in) 확인
- [ ] `models/investment.py` — Investment (fund_id, company_id, amount, shares, status, instrument) 확인
- [ ] `models/transaction.py` — Transaction (type, amount, fund_id) 확인
- [ ] `models/valuation.py` — Valuation (nav, fair_value 등) 확인
- [ ] `models/fee.py` — ManagementFee (fee_amount) 확인
- [ ] `models/compliance.py` — Phase 37에서 추가된 ComplianceObligation 확인
- [ ] `routers/funds.py` — LP 관련 API 확인
- [ ] `services/compliance_engine.py` — Phase 37에서 추가된 엔진 확인
- [ ] `frontend/src/lib/api.ts` — export 패턴 확인

---

## Part 1. 데이터 모델

#### `models/vics_report.py` [NEW]

```python
from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from database import Base


class VicsMonthlyReport(Base):
    """VICS 월보고 데이터 스냅샷"""
    __tablename__ = "vics_monthly_reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    report_code = Column(String, nullable=False)       # "1308" | "1309" | "1329"

    # 데이터 (JSON 직렬화된 텍스트)
    data_json = Column(Text, nullable=True)
    # 1308: { investments: [...], summary: {...} }
    # 1309: { fund_info: {...}, lps: [...], changes_this_month: [...] }
    # 1329: { cash_balance, investment_cost_total, investment_fair_value_total, nav, ... }

    status = Column(String, nullable=False, default="draft")
    # "draft" → "confirmed" → "submitted"
    confirmed_at = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, nullable=True)

    # 불일치 메모
    discrepancy_notes = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
```

> **UniqueConstraint 권장:** (fund_id, year, month, report_code) 조합 unique

---

## Part 2. 비즈니스 로직

#### `services/vics_report_service.py` [NEW]

3개 보고 코드별 데이터 자동 산출:

### 2-1. 1308 — 투자현황

```python
async def generate_1308(fund_id: int, year: int, month: int) -> dict:
    """VICS 1308 — 투자현황 데이터 산출"""
    # 1. 해당 Fund의 모든 active Investment 조회
    # 2. 각 Investment에 대해:
    #    - company_name: PortfolioCompany.name
    #    - biz_number: PortfolioCompany.business_number
    #    - instrument_type: Investment.instrument
    #    - investment_date: Investment.investment_date
    #    - investment_amount: Investment.amount
    #    - current_balance: 투자잔액 (회수 차감)
    #    - shares: Investment.shares
    #    - ownership_pct: Investment.ownership_pct
    #    - status: Investment.status
    # 3. summary 계산:
    #    - total_invested: 전체 투자금액 합산
    #    - total_balance: 잔액 합산
    #    - new_this_month: 해당 월 신규 투자 건수
    #    - exited_this_month: 해당 월 회수 건수
    return {"investments": [...], "summary": {...}}
```

### 2-2. 1309 — 조합현황

```python
async def generate_1309(fund_id: int, year: int, month: int) -> dict:
    """VICS 1309 — 조합현황 데이터 산출"""
    # 1. Fund 기본 정보:
    #    - total_commitment: Fund.commitment_total
    #    - paid_in_total: LP 전체 paid_in 합산
    #    - remaining_commitment: commitment_total - paid_in_total
    # 2. LP 목록:
    #    - name, type, commitment, paid_in, ownership_pct
    # 3. 해당 월 LP 변동 사항:
    #    - LPTransfer 테이블에서 해당 월 양도 내역 조회
    return {"fund_info": {...}, "lps": [...], "changes_this_month": [...]}
```

### 2-3. 1329 — 운용현황

```python
async def generate_1329(fund_id: int, year: int, month: int) -> dict:
    """VICS 1329 — 운용현황 데이터 산출"""
    # 1. cash_balance: 통장 잔액 (Transaction 기반 계산 또는 직접 입력)
    # 2. investment_cost_total: 투자 원가 합산
    # 3. investment_fair_value_total: 최신 Valuation fair_value 합산
    # 4. nav: 최신 NAV (Valuation 테이블)
    # 5. management_fee_paid: 해당 연도 관리보수 합산 (Fee 테이블)
    # 6. operating_expense: 운영 경비 (Transaction type="경비" 합산)
    # 7. distribution_total: 배분 총액
    return {
        "cash_balance": ...,
        "investment_cost_total": ...,
        "investment_fair_value_total": ...,
        "nav": ...,
        "management_fee_paid": ...,
        "operating_expense": ...,
        "distribution_total": ...,
    }
```

### 2-4. 엑셀 출력

```python
async def export_vics_xlsx(report_id: int) -> bytes:
    """VICS 입력용 엑셀 파일 생성 (openpyxl)"""
    # report_code별 시트 구성:
    # 1308: 투자현황 테이블 (기업명, 사업자번호, 투자유형, 투자일, 금액, 잔액, 지분율, 상태)
    # 1309: 조합현황 테이블 (LP명, 유형, 약정, 납입, 지분율)
    # 1329: 운용현황 요약 (항목-금액 세로 테이블)
    pass
```

---

## Part 3. API 엔드포인트

#### `routers/vics_reports.py` [NEW]

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/vics/reports` | 월보고 목록 (필터: fund_id, year, month) |
| GET | `/api/vics/reports/{id}` | 개별 보고 상세 (data_json 포함) |
| POST | `/api/vics/reports/generate` | ERP 데이터로 자동 생성 (body: fund_id, year, month, report_code) |
| POST | `/api/vics/reports/{id}/confirm` | 확인 완료 처리 |
| POST | `/api/vics/reports/{id}/submit` | 제출 완료 처리 |
| PATCH | `/api/vics/reports/{id}` | 불일치 메모 수정 등 |
| GET | `/api/vics/reports/{id}/export-xlsx` | VICS 입력용 엑셀 다운로드 |

**자동 생성 요청/응답:**
```json
// Request
{ "fund_id": 1, "year": 2026, "month": 2, "report_code": "1308" }

// Response
{ "id": 42, "status": "draft", "data_json": {...}, "created_at": "..." }
```

---

## Part 4. 프론트엔드

#### `pages/VicsReportPage.tsx` [NEW]

```
┌────────────────────────────────────────────────────────────┐
│  VICS 월보고  [조합 선택 ▾] [2026년 ▾] [2월 ▾]             │
│                                                            │
│  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐  │
│  │ 1308 투자현황    │ │ 1309 조합현황    │ │ 1329 운용현황 │ │
│  │ ✅ 생성완료       │ │ ⚠️ 미확인        │ │ ❌ 미생성      │ │
│  │ [보기] [엑셀]   │ │ [보기] [엑셀]   │ │ [자동생성]    │ │
│  └─────────────────┘ └─────────────────┘ └──────────────┘  │
│                                                            │
│  [선택된 보고 상세 — 펼침]                                    │
│  ─ 1308 투자현황 ─                                         │
│  피투자기업 | 투자일 | 투자금액 | 잔액 | 지분율 | 상태      │
│  ─────────────────────────────────────────────────         │
│  OO기업 | 24.05.15 | 500M | 500M | 8.2% | 보유            │
│  △△기업 | 24.08.20 | 300M | 300M | 5.1% | 보유            │
│  ...                                                       │
│  합계: 투자 12건 | 총 투자금액 8,500M | 잔액 7,200M        │
│                                                            │
│  [⚠️ 불일치 경고] 1329 현금잔액과 계산 잔액 차이: 12M       │
│  → 원인 메모: [_______________] [확인완료]                  │
│                                                            │
│  [하단] [확인 완료] [제출 완료]                               │
└────────────────────────────────────────────────────────────┘
```

**UI 상세:**
- 조합/연/월 선택 시 해당 3개 보고(1308/1309/1329) 상태 카드 표시
- 카드 클릭 시 아래 상세 테이블 펼침
- [자동생성] 클릭 시 `/api/vics/reports/generate` 호출
- [엑셀] 클릭 시 `/api/vics/reports/{id}/export-xlsx` 다운로드
- 불일치 메모: 사용자가 원인 메모 입력 후 확인 가능

### 사이드바/라우터

- 사이드바에 "VICS 월보고" 메뉴 추가 (적절한 그룹에 배치)
- 라우터에 `/vics` 경로 등록
- `api.ts`에 vics 관련 API 함수 + 타입 전부 export

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [NEW] | `backend/models/vics_report.py` | VicsMonthlyReport 모델 |
| 2 | [MODIFY] | `backend/models/__init__.py` | VicsMonthlyReport import |
| 3 | [NEW] | `backend/services/vics_report_service.py` | 1308/1309/1329 데이터 산출 + 엑셀 |
| 4 | [NEW] | `backend/routers/vics_reports.py` | VICS 월보고 전체 API |
| 5 | [MODIFY] | `backend/main.py` | vics_reports 라우터 등록 |
| 6 | [NEW] | `frontend/src/pages/VicsReportPage.tsx` | VICS 월보고 페이지 |
| 7 | [MODIFY] | `frontend/src/lib/api.ts` | vics API 함수 + 타입 |
| 8 | [MODIFY] | 사이드바/라우터 | VICS 월보고 메뉴 + 경로 |
| 9 | [NEW] | Alembic 마이그레이션 | vics_monthly_reports 테이블 |

---

## Acceptance Criteria

- [ ] **AC-01:** 조합별 1308 투자현황 데이터가 ERP 데이터로 자동 생성된다.
- [ ] **AC-02:** 조합별 1309 조합현황 데이터가 LP 정보 기반으로 자동 생성된다.
- [ ] **AC-03:** 조합별 1329 운용현황 데이터가 NAV/보수/거래 기반으로 자동 생성된다.
- [ ] **AC-04:** 생성된 데이터를 VICS 입력용 엑셀로 다운로드할 수 있다.
- [ ] **AC-05:** 보고 상태(draft → confirmed → submitted)를 관리할 수 있다.
- [ ] **AC-06:** 불일치 메모를 입력하고 확인할 수 있다.
- [ ] **AC-07:** VICS 월보고 페이지 UI가 정상 표시된다 (조합/연/월 선택 + 3개 카드 + 상세).
- [ ] **AC-08:** Phase 31~37의 모든 기능 유지.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. 기존 Fund/LP/Investment/Transaction/Valuation/Fee 모델 — 읽기만, 수정 금지
3. Phase 31~37의 기존 구현 — 보강만, 삭제/재구성 금지
