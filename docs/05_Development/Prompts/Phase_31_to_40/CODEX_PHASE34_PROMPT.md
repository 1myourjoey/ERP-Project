# Phase 34: 가치평가 고도화 + 출자/배분 계획 LP별 세분화

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> ⚠️ **비식별화 원칙:** 실존 정보 사용 금지.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P0  
**의존성:** Phase 33 (거래 원장 세분화)  
**후속:** Phase 35가 이 Phase의 NAV + 출자 데이터를 전제로 함

---

## Part 0. 전수조사 (필수)

- [ ] `models/valuation.py` — 기존 컬럼/관계 확인
- [ ] `routers/valuations.py` — 기존 API 시그니처 확인 (확장만, 삭제 금지)
- [ ] `ValuationsPage.tsx` — 기존 UI 구조 확인
- [ ] `models/capital_call.py` — 기존 모델 구조 확인
- [ ] `routers/capital_calls.py` — 기존 CRUD 확인
- [ ] `models/distribution.py` — Distribution 구조 확인
- [ ] `routers/distributions.py` — 기존 CRUD 확인
- [ ] `FundOperationsPage.tsx` (317줄) — FundCapitalRow 인터페이스 확인
- [ ] `FundDetailPage.tsx` — 탭 구조 확인 (NAV 차트 추가 위치)
- [ ] Phase 33의 Transaction 확장 필드가 정상 반영되었는지 확인

---

## Part 1. 가치평가 고도화

### 1-1. 모델 확장

#### `models/valuation.py` [MODIFY]

기존 필드 유지 + 추가:

```python
# 평가 방법론
valuation_method = Column(String, nullable=True)       # DCF / Comparable / Cost / Recent Transaction / NAV
instrument_type = Column(String, nullable=True)        # 보통주 / CB / CPS / RCPS / BW

# 유형별 세부
conversion_price = Column(Numeric, nullable=True)      # 전환가격 (CB/CPS/RCPS)
exercise_price = Column(Numeric, nullable=True)        # 행사가격 (BW)
liquidation_pref = Column(Numeric, nullable=True)      # 잔여재산분배 우선권 배수 (CPS/RCPS)
participation_cap = Column(Numeric, nullable=True)     # 참가 상한

# 평가 결과
fair_value_per_share = Column(Numeric, nullable=True)  # 주당 공정가치
total_fair_value = Column(Numeric, nullable=True)      # 총 공정가치
book_value = Column(Numeric, nullable=True)            # 장부가
unrealized_gain_loss = Column(Numeric, nullable=True)  # 미실현 손익

# 재원별
fund_id = Column(Integer, ForeignKey("funds.id"), nullable=True, index=True)

# 평가 기준일
valuation_date = Column(Date, nullable=True)           # 평가 기준일 (분기말 등)
```

### 1-2. API 추가

#### `routers/valuations.py` [MODIFY]

기존 CRUD 유지 + 추가:

| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/api/valuations/nav-summary` | 조합별 총 NAV 요약 |
| GET | `/api/valuations/history/{investment_id}` | 특정 투자건의 시계열 가치 변동 |
| POST | `/api/valuations/bulk` | 분기 말 일괄 평가 등록 |
| GET | `/api/valuations/dashboard` | 가치평가 대시보드 데이터 (전체 NAV, 투자건별 최신 평가) |

### 1-3. 프론트엔드

#### `ValuationsPage.tsx` [MODIFY — 대폭 개선]

1. **가치평가 대시보드 (상단):**
   ```
   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ 전체 NAV  │ │ 미실현손익 │ │ 평가건수  │ │ 미평가건수 │
   │  ₩112억  │ │  +₩23억  │ │   15건   │ │   3건    │
   └──────────┘ └──────────┘ └──────────┘ └──────────┘
   ```

2. **투자건별 최신 평가 테이블:**
   - 기업명 | 투자수단 | 장부가 | 공정가치 | 미실현손익 | 평가일 | 평가방법
   - 미실현손익 색상: 양수=초록, 음수=빨강

3. **평가 이력 차트 (상세 모달):**
   - 선택 투자건의 시점별 공정가치 꺾은선 그래프
   - 장부가 대비 hover로 비교

4. **일괄 평가:**
   - 분기 말 기준 버튼 → 전 투자건에 대한 평가 폼 일괄 표시
   - 기존 평가값 자동 불러오기 + 수정

5. **재원별 뷰:** 조합별 필터

#### `FundDetailPage.tsx` [MODIFY]

- NAV 차트 탭 추가: 해당 조합의 시점별 NAV 추이 라인 차트

#### `DashboardDefaultView.tsx` [MODIFY]

- 전체 운용 NAV 위젯 추가

---

## Part 2. 출자/배분 계획 LP별 세분화

### 2-1. 모델 추가

#### `models/capital_call.py` [MODIFY — 모델 추가]

```python
class CapitalCallDetail(Base):
    """출자 요청의 LP별 상세"""
    __tablename__ = "capital_call_details"
    id = Column(Integer, primary_key=True, autoincrement=True)
    capital_call_id = Column(Integer, ForeignKey("capital_calls.id", ondelete="CASCADE"), index=True)
    lp_id = Column(Integer, ForeignKey("lps.id"), index=True)
    commitment_ratio = Column(Numeric, nullable=True)     # 약정 비율 (%)
    call_amount = Column(Numeric, nullable=False)          # 요청 금액
    paid_amount = Column(Numeric, default=0)               # 납입 금액
    paid_date = Column(Date, nullable=True)
    status = Column(String, default="미납입")               # 미납입 / 일부납입 / 완납
    reminder_sent = Column(Boolean, default=False)
```

#### `models/distribution.py` [MODIFY — 모델 추가]

```python
class DistributionDetail(Base):
    """배분의 LP별 상세"""
    __tablename__ = "distribution_details"
    id = Column(Integer, primary_key=True, autoincrement=True)
    distribution_id = Column(Integer, ForeignKey("distributions.id", ondelete="CASCADE"), index=True)
    lp_id = Column(Integer, ForeignKey("lps.id"), index=True)
    distribution_amount = Column(Numeric, nullable=False)
    distribution_type = Column(String, default="수익배분")  # 원금반환 / 수익배분 / 세금원천징수
    paid = Column(Boolean, default=False)
```

### 2-2. API 추가

#### `routers/capital_calls.py` [MODIFY]

기존 CRUD 유지 + 추가:

| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/api/capital-calls/{id}/details` | LP별 출자 상세 |
| POST | `/api/capital-calls/{id}/details/auto-generate` | LP 약정비율 기반 자동 생성 |
| PATCH | `/api/capital-call-details/{id}` | LP별 납입 확인/수정 |

#### `routers/distributions.py` [MODIFY]

| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/api/distributions/{id}/details` | LP별 배분 상세 |
| POST | `/api/distributions/{id}/details/auto-generate` | LP 지분비율 기반 자동 생성 |
| PATCH | `/api/distribution-details/{id}` | LP별 배분 확인/수정 |

### 2-3. 프론트엔드

#### `FundOperationsPage.tsx` [MODIFY — 대폭 개선]

1. **LP별 출자 현황 그리드:**
   ```
   LP명          | 약정액     | 1차 출자  | 2차 출자  | 3차 출자  | 납입합계  | 잔여
   OO개발(주)    | ₩50억    | ✅ ₩20억 | ✅ ₩15억 | 🟡 ₩10억 | ₩35억   | ₩15억
   △△투자       | ₩30억    | ✅ ₩12억 | ✅ ₩9억  | ⬜ -     | ₩21억   | ₩9억
   ```

2. **출자 요청 시 LP별 자동 계산:** 요청 총액 입력 → 약정 비율로 LP별 금액 자동 산출

3. **배분 계획:** 배분 총액 → LP별 지분 비율로 자동 산출 + 유형(원금/수익/세금) 선택

4. **미납 알림:** 미납 LP 하이라이트 + 대시보드 알림

---

## Files to modify / create

| # | Type | Target | Description |
|---|---|---|---|
| 1 | [MODIFY] | `backend/models/valuation.py` | method, instrument_type, fair_value, NAV 필드 |
| 2 | [MODIFY] | `backend/routers/valuations.py` | nav-summary, history, bulk, dashboard API |
| 3 | [NEW] | `backend/models/capital_call_detail.py` 또는 확장 | CapitalCallDetail 모델 |
| 4 | [NEW] | `backend/models/distribution_detail.py` 또는 확장 | DistributionDetail 모델 |
| 5 | [MODIFY] | `backend/routers/capital_calls.py` | LP별 상세 + auto-generate API |
| 6 | [MODIFY] | `backend/routers/distributions.py` | LP별 상세 + auto-generate API |
| 7 | [MODIFY] | `frontend/src/pages/ValuationsPage.tsx` | NAV 대시보드 + 이력 차트 + 일괄 평가 |
| 8 | [MODIFY] | `frontend/src/pages/FundOperationsPage.tsx` | LP별 그리드 + 자동 계산 + 미납 표시 |
| 9 | [MODIFY] | `frontend/src/pages/FundDetailPage.tsx` | NAV 차트 탭 |
| 10 | [MODIFY] | `frontend/src/components/dashboard/DashboardDefaultView.tsx` | NAV 위젯 |
| 11 | [MODIFY] | `frontend/src/lib/api.ts` | 타입/함수 추가 |
| 12 | [NEW] | Alembic 마이그레이션 | valuation 확장 + capital_call_details + distribution_details |

---

## Acceptance Criteria

- [ ] **AC-01:** 가치평가 대시보드에 전체 NAV, 미실현손익, 평가/미평가 건수가 표시된다.
- [ ] **AC-02:** 투자유형별(CB/CPS/RCPS/BW) 세부 필드가 입력 가능하다.
- [ ] **AC-03:** 시점별 가치 변동 차트가 표시된다.
- [ ] **AC-04:** 분기 말 일괄 평가가 동작한다.
- [ ] **AC-05:** 재원별(조합별) 가치평가가 구분된다.
- [ ] **AC-06:** 출자 요청 시 LP별 금액이 약정 비율로 자동 계산된다.
- [ ] **AC-07:** LP별 납입 상태(미납/일부/완납)가 표시된다.
- [ ] **AC-08:** 배분 시 LP별 금액이 자동 계산되고 유형(원금/수익/세금)을 선택할 수 있다.
- [ ] **AC-09:** FundDetailPage에 NAV 추이 차트가 표시된다.
- [ ] **AC-10:** 미납 LP가 대시보드에 알림된다.
- [ ] **AC-11:** Phase 31~33의 모든 기능 유지.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. 기존 Valuation CRUD API 시그니처 — 유지 (확장만)
3. 기존 CapitalCall / Distribution CRUD — 유지 (확장만)
4. FundOperationsPage의 기존 종합 뷰 — 유지 (LP별 뷰 추가)
5. Phase 31~33의 기존 구현 — 보강만, 삭제/재구성 금지
