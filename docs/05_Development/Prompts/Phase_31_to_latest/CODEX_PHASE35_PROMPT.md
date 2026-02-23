# Phase 35: 회수 관리 고도화 + 보수 관리 (관리보수/성과보수)

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> ⚠️ **비식별화 원칙:** 실존 정보 사용 금지.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P0  
**의존성:** Phase 34 (가치평가 NAV + 출자/배분 데이터)  
**후속:** Phase 36이 보수 데이터를 영업보고에 활용

---

## Part 0. 전수조사 (필수)

- [ ] `models/exit.py` — ExitCommittee, ExitCommitteeFund, ExitTrade 구조 확인
- [ ] `routers/exits.py` — 기존 API 시그니처 확인
- [ ] `ExitsPage.tsx` (459줄) — 기존 3섹션 UI 구조 확인
- [ ] Phase 33 Transaction 확장과 ExitTrade의 관계 확인
- [ ] Phase 34 Valuation NAV/DistributionDetail이 정상 동작하는지 확인
- [ ] `FundDetailPage.tsx` — 보수 탭 추가 위치 확인
- [ ] `DashboardDefaultView.tsx` — 보수 알림 위젯 추가 위치

---

## Part 1. 회수 관리 고도화

### 1-1. 현재 구조 (ExitsPage 459줄)

- ExitCommittee: 회수위원회 (meeting_date, status, exit_strategy, memo)
- ExitCommitteeFund: 위원회별 대상 조합/투자건 (fund_id, investment_id)
- ExitTrade: 실제 회수 거래 (exit_type, amount, shares_sold, fees, realized_gain)

### 1-2. 모델 확장

#### `models/exit.py` [MODIFY]

```python
# ExitCommittee 확장
agenda_summary = Column(Text, nullable=True)      # 안건 요약
resolution = Column(Text, nullable=True)           # 결의 내용
attendees = Column(Text, nullable=True)            # 참석자 (JSON 배열)

# ExitTrade 확장
settlement_status = Column(String, default="미정산")  # 미정산 / 정산중 / 정산완료
settlement_date = Column(Date, nullable=True)
settlement_amount = Column(Numeric, nullable=True)   # 실제 정산 금액
related_transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True)
# Phase 33 거래 원장과 연결
```

### 1-3. API 추가

#### `routers/exits.py` [MODIFY]

기존 CRUD 유지 + 추가:

| Method | Endpoint | 설명 |
|---|---|---|
| PATCH | `/api/exit-trades/{id}/settle` | 정산 처리 (정산 금액 + 날짜 + 거래 원장 자동 등록) |
| GET | `/api/exits/dashboard` | 회수 대시보드 (투자건별 회수 현황 + 실현 수익률) |
| POST | `/api/exits/generate-distribution` | 회수 정산 → LP별 배분 자동 생성 |

**정산 처리 로직:**
1. ExitTrade에 settlement 정보 기록
2. Phase 33 거래 원장에 회수 거래 자동 등록 (type: ipo_sale/mna_sale 등)
3. Phase 34 Valuation을 실현가치로 자동 업데이트
4. LP별 배분 자동 생성 (DistributionDetail)

### 1-4. 프론트엔드

#### `ExitsPage.tsx` [MODIFY — 대폭 개선]

**현재: 3섹션 나열 → 개선: 탭 분리**

| 탭 | 내용 |
|---|---|
| **회수 대시보드** | 투자건별 회수 현황 카드 + 실현 수익률(IRR, MOIC) 차트 |
| **회수 위원회** | 위원회 CRUD + 안건/결의 + 대상 투자건 관리 (기존 개선) |
| **회수 거래** | 거래 CRUD + 정산 처리 + 거래 원장 연결 (기존 개선) |

**회수 대시보드:**
```
┌─ 투자건별 회수 현황 ─────────────────────────────┐
│ 기업명       | 투자액  | 회수액  | 수익률  | 상태   │
│ 테크스타트업  | ₩10억  | ₩25억  | 2.5x  | 완료   │
│ 바이오팜     | ₩5억   | ₩0    | -     | 보유중  │
│ 핀테크코리아  | ₩8억   | ₩3억   | 0.4x  | 일부회수│
└────────────────────────────────────────────────┘
```

**IRR/MOIC 자동 계산:**
- MOIC = 회수총액 ÷ 투자총액
- IRR = 투자일~회수일 기간의 내부수익률 (Newton-Raphson 근사)

---

## Part 2. 보수 관리 (NEW)

### 2-1. 모델

#### `models/fee.py` [NEW]

```python
class ManagementFee(Base):
    """관리보수 — 분기별 자동 계산"""
    __tablename__ = "management_fees"
    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), index=True)
    year = Column(Integer, nullable=False)
    quarter = Column(Integer, nullable=False)           # 1~4
    
    # 계산 기준
    fee_basis = Column(String, default="commitment")    # commitment / nav / invested
    fee_rate = Column(Numeric, nullable=False)           # 연간 요율 (예: 0.02 = 2%)
    basis_amount = Column(Numeric, nullable=False)       # 계산 기준 금액
    fee_amount = Column(Numeric, nullable=False)         # 보수 금액
    
    # 상태
    status = Column(String, default="계산완료")           # 계산완료 / 청구 / 수령
    invoice_date = Column(Date, nullable=True)
    payment_date = Column(Date, nullable=True)
    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())

class FeeConfig(Base):
    """조합별 보수 설정"""
    __tablename__ = "fee_configs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), unique=True)
    
    # 관리보수
    mgmt_fee_rate = Column(Numeric, default=0.02)        # 연 2%
    mgmt_fee_basis = Column(String, default="commitment") # commitment / nav / invested
    mgmt_fee_period = Column(String, default="operating") # operating / liquidation
    # 청산기간 중 요율 변경
    liquidation_fee_rate = Column(Numeric, nullable=True)
    liquidation_fee_basis = Column(String, nullable=True)
    
    # 성과보수
    hurdle_rate = Column(Numeric, default=0.08)           # 우선수익률 8%
    carry_rate = Column(Numeric, default=0.20)            # 성과보수율 20%
    catch_up_rate = Column(Numeric, nullable=True)        # Catch-up 비율
    clawback = Column(Boolean, default=True)              # Clawback 조항 여부

class PerformanceFeeSimulation(Base):
    """성과보수 시뮬레이션"""
    __tablename__ = "performance_fee_simulations"
    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), index=True)
    simulation_date = Column(Date, nullable=False)
    scenario = Column(String, default="base")             # worst / base / best
    
    total_paid_in = Column(Numeric)           # 총 납입액
    total_distributed = Column(Numeric)       # 총 배분액 (실현 + 미실현 NAV)
    hurdle_amount = Column(Numeric)           # 우선수익 기준 금액
    excess_profit = Column(Numeric)           # 초과 수익
    carry_amount = Column(Numeric)            # 성과 보수 금액
    lp_net_return = Column(Numeric)           # LP 순수익
    
    status = Column(String, default="시뮬레이션") # 시뮬레이션 / 확정 / 지급
    created_at = Column(DateTime, default=func.now())
```

### 2-2. API

#### `routers/fees.py` [NEW]

| Method | Endpoint | 설명 |
|---|---|---|
| **관리보수** | | |
| GET | `/api/fees/management` | 전체 관리보수 목록 |
| GET | `/api/fees/management/fund/{fund_id}` | 조합별 관리보수 이력 |
| POST | `/api/fees/management/calculate` | 분기별 관리보수 자동 계산 |
| PATCH | `/api/fees/management/{id}` | 보수 상태 변경 (청구/수령) |
| **보수 설정** | | |
| GET | `/api/fees/config/{fund_id}` | 조합 보수 설정 조회 |
| PUT | `/api/fees/config/{fund_id}` | 조합 보수 설정 저장 |
| **성과보수** | | |
| POST | `/api/fees/performance/simulate` | 성과보수 시뮬레이션 실행 |
| GET | `/api/fees/performance/fund/{fund_id}` | 조합별 시뮬레이션 이력 |
| PATCH | `/api/fees/performance/{id}` | 확정/지급 상태 변경 |
| GET | `/api/fees/waterfall/{fund_id}` | 워터폴 차트 데이터 |

**관리보수 자동 계산 로직:**
```python
def calculate_management_fee(fund_id, year, quarter):
    config = db.query(FeeConfig).filter_by(fund_id=fund_id).first()
    if config.mgmt_fee_basis == "commitment":
        basis = fund.total_commitment
    elif config.mgmt_fee_basis == "nav":
        basis = get_latest_nav(fund_id)  # Phase 34
    elif config.mgmt_fee_basis == "invested":
        basis = get_total_invested(fund_id)
    
    quarterly_fee = basis * config.mgmt_fee_rate / 4
    return ManagementFee(fund_id=fund_id, year=year, quarter=quarter,
                          fee_basis=config.mgmt_fee_basis, fee_rate=config.mgmt_fee_rate,
                          basis_amount=basis, fee_amount=quarterly_fee)
```

**성과보수 워터폴:**
```
총 배분 → LP 원금 반환 → LP 우선수익 (Hurdle) → GP Catch-up → GP/LP 이익 분배
```

### 2-3. 프론트엔드

#### `pages/FeeManagementPage.tsx` [NEW]

**3개 탭:**

| 탭 | 내용 |
|---|---|
| **보수 현황** | 조합별 관리보수 + 성과보수 현황 테이블 |
| **관리보수** | 분기별 계산 이력 + 자동 계산 버튼 + 청구/수령 상태 관리 |
| **성과보수** | 시뮬레이션(worst/base/best) + 워터폴 차트 + 확정/지급 |

**보수 현황 탭:**
```
┌─ 조합별 보수 현황 ────────────────────────────────┐
│ 조합명       | 관리보수 요율 | 금년 보수  | 성과보수    │
│ OO 1호 조합  | 약정 × 2%   | ₩3억     | 시뮬 ₩5억  │
│ △△ 2호 조합  | NAV × 1.5% | ₩1.2억   | 미발생     │
└────────────────────────────────────────────────┘
```

**워터폴 차트:**
- 가로 바 차트: 총배분 | LP 원금 | LP 우선수익 | GP Catch-up | GP 성과보수 | LP 잔여
- 색상: LP=파랑, GP=초록, Hurdle 구간=회색

#### `FundDetailPage.tsx` [MODIFY]

- "보수" 탭 추가: 해당 조합의 관리보수 이력 + 보수 설정 편집

#### 사이드바/라우터 [MODIFY]

- "자금 운용" 그룹에 "보수 관리" 메뉴 추가

---

## Files to modify / create

| # | Type | Target | Description |
|---|---|---|---|
| 1 | [MODIFY] | `backend/models/exit.py` | 위원회 확장 + 거래 정산 필드 |
| 2 | [MODIFY] | `backend/routers/exits.py` | settle + dashboard + generate-distribution API |
| 3 | [NEW] | `backend/models/fee.py` | ManagementFee + FeeConfig + PerformanceFeeSimulation |
| 4 | [NEW] | `backend/routers/fees.py` | 관리보수/성과보수/설정/워터폴 API |
| 5 | [MODIFY] | `frontend/src/pages/ExitsPage.tsx` | 탭 분리 + 대시보드 + IRR/MOIC + 정산 |
| 6 | [NEW] | `frontend/src/pages/FeeManagementPage.tsx` | 보수 현황/관리보수/성과보수 3탭 + 워터폴 |
| 7 | [MODIFY] | `frontend/src/pages/FundDetailPage.tsx` | 보수 탭 추가 |
| 8 | [MODIFY] | `frontend/src/lib/api.ts` | 회수/보수 API 함수 + 타입 |
| 9 | [MODIFY] | 사이드바/라우터 | 보수 관리 메뉴 |
| 10 | [NEW] | Alembic 마이그레이션 | exit 확장 + fee 3개 테이블 |

---

## Acceptance Criteria

- [ ] **AC-01:** ExitsPage가 3탭(대시보드/위원회/거래)으로 분리된다.
- [ ] **AC-02:** 투자건별 MOIC가 자동 계산되어 표시된다.
- [ ] **AC-03:** 회수 거래 정산 시 거래 원장(Phase 33)에 자동 등록된다.
- [ ] **AC-04:** 정산 완료 시 LP별 배분(Phase 34)이 자동 생성된다.
- [ ] **AC-05:** 조합별 관리보수가 분기별로 자동 계산된다.
- [ ] **AC-06:** 계산 기준(약정/NAV/투자금)을 조합 설정에서 변경 가능하다.
- [ ] **AC-07:** 성과보수 시뮬레이션(worst/base/best)이 동작하고 결과가 표시된다.
- [ ] **AC-08:** 워터폴 차트가 정상 표시된다.
- [ ] **AC-09:** FundDetailPage에 보수 탭이 표시된다.
- [ ] **AC-10:** Phase 31~34의 모든 기능 유지.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. ExitsPage의 기존 ExitCommittee/ExitTrade 데이터 구조 — 유지 (확장만)
3. 기존 exits.py CRUD API 시그니처 — 유지 (확장만)
4. Phase 31~34의 기존 구현 — 보강만, 삭제/재구성 금지
