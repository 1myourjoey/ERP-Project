# Phase 68: 현금흐름 & 수수료 자동화

> **의존성:** Phase 67 완료
> **근거:** `docs/ERP_ANALYSIS_AND_STRATEGY.md` §4.1 핵심 누락 (P0)

**Priority:** P0 — VC 펀드 운용의 핵심 기능
**핵심 원칙:**
1. **실시간 데이터 기반** — CapitalCall, Distribution, ManagementFee 등 기존 데이터 활용
2. **수동 입력 병행** — 예측값은 수정 가능, 확정값은 잠금
3. **펀드별 독립** — 각 펀드 별도 현금흐름/수수료 관리

---

## Part 1. 현금흐름 예측 (Cash Flow Projection)

### 1-1. 현금흐름 서비스

#### [NEW] `backend/services/cashflow_projection.py`

```python
"""펀드별 현금흐름 예측 서비스.

데이터 소스:
- CapitalCall (예정/완료) → 유입
- Distribution (예정/완료) → 유출
- ManagementFee (청구/수령) → 유출
- ExitTrade (예정/정산) → 유입
- 운영비 (고정 월간 추정) → 유출

출력: 월별 유입/유출/잔액 예측 (최대 24개월)
"""

from datetime import date, timedelta
from typing import Optional

class CashFlowItem:
    date: date
    category: str          # 'capital_call' | 'distribution' | 'mgmt_fee' | 'exit' | 'operating'
    description: str
    inflow: float
    outflow: float
    source_id: Optional[int]
    source_type: Optional[str]
    is_confirmed: bool     # 확정(실적) vs 예측

class CashFlowProjection:
    fund_id: int
    fund_name: str
    current_balance: float
    monthly_summary: list[MonthlySummary]  # 월별 요약
    items: list[CashFlowItem]              # 개별 항목

class MonthlySummary:
    year_month: str         # '2026-03'
    total_inflow: float
    total_outflow: float
    net: float
    ending_balance: float

async def project_cashflow(
    db: Session,
    fund_id: int,
    months_ahead: int = 12,
    operating_cost_monthly: float = 0,
) -> CashFlowProjection:
    """
    1. 확정 데이터 수집 (과거 실적)
       - 완료된 CapitalCall → inflow (확정)
       - 완료된 Distribution → outflow (확정)
       - 수령된 ManagementFee → outflow (확정)
       - 정산된 ExitTrade → inflow (확정)

    2. 예측 데이터 수집 (미래 예정)
       - 진행중 CapitalCall (미납분) → inflow (예측)
       - 예정 Distribution → outflow (예측)
       - 미청구 ManagementFee (분기별 자동 추정) → outflow (예측)
       - 진행중 ExitTrade (미정산) → inflow (예측)
       - 워크플로우 인스턴스에서 콜/배분 예정 추출

    3. 월별 합산 + 잔액 계산
    """
    ...
```

### 1-2. API 엔드포인트

#### [NEW] `backend/routers/cashflow.py`

```python
@router.get("/funds/{fund_id}/cashflow")
async def get_fund_cashflow(
    fund_id: int,
    months_ahead: int = 12,
    operating_cost: float = 0,
    db: Session = Depends(get_db),
):
    """펀드별 현금흐름 예측 조회."""
    return await project_cashflow(db, fund_id, months_ahead, operating_cost)

@router.get("/cashflow/all")
async def get_all_funds_cashflow(
    months_ahead: int = 6,
    db: Session = Depends(get_db),
):
    """전체 펀드 현금흐름 요약."""
    funds = db.query(Fund).filter(Fund.status == 'active').all()
    results = []
    for fund in funds:
        projection = await project_cashflow(db, fund.id, months_ahead)
        results.append({
            'fund_id': fund.id,
            'fund_name': fund.name,
            'current_balance': projection.current_balance,
            'next_month_net': projection.monthly_summary[0].net if projection.monthly_summary else 0,
        })
    return results
```

### 1-3. 프론트엔드: 현금흐름 대시보드

#### [NEW] `frontend/src/pages/CashFlowPage.tsx`

또는 FundDetailPage의 "재무" 탭에 통합.

레이아웃:
```
┌─ 현금흐름 예측 ──────────────────────────────────┐
│ 조합 선택: [1호 펀드 ▼]  기간: [12개월 ▼]        │
├──────────────────────────────────────────────────┤
│ 현재 잔액: ₩12,345,678,000                       │
│                                                   │
│ [월별 바 차트]                                    │
│  3월   4월   5월   6월   7월   8월                │
│  ██    ██    ██    ██    ██    ██   ← 유입 (파랑) │
│  ▓▓    ▓▓    ▓▓    ▓▓    ▓▓    ▓▓   ← 유출 (주황) │
│  ──    ──    ──    ──    ──    ──   ← 잔액 (선)   │
│                                                   │
│ [상세 테이블]                                     │
│ 월     | 유입        | 유출        | 순액    | 잔액 │
│ 3월    | ₩3억 (콜)   | ₩5천 (수수료)| +2.5억 | ₩14.8억│
│ 4월    | -           | ₩5천       | -0.5억 | ₩14.3억│
│ ...                                               │
├──────────────────────────────────────────────────┤
│ ⚠ 6월 잔액 경고: 잔액이 ₩5억 이하로 떨어질 수 있음 │
└──────────────────────────────────────────────────┘
```

차트: Recharts BarChart + LineChart 조합 (이미 의존성에 있을 수 있음, 확인 필요).

---

## Part 2. 수수료 자동 계산

### 2-1. 분기별 관리보수 자동 계산 서비스

#### [NEW] `backend/services/fee_auto_calculator.py`

```python
"""분기별 관리보수 자동 계산.

FeeConfig 기반으로 해당 분기의 관리보수를 자동 계산.
basis 유형별 계산:
- commitment: 총 약정액 × 보수율 / 4
- nav: NAV × 보수율 / 4
- invested: 투자실행액 × 보수율 / 4
"""

async def calculate_quarterly_fee(
    db: Session,
    fund_id: int,
    year: int,
    quarter: int,
) -> ManagementFee:
    """
    1. FeeConfig 조회 (fund_id)
    2. basis 유형에 따라 기준액 산정
    3. fee_amount = basis_amount * fee_rate / 4
    4. ManagementFee 레코드 생성 (status='calculated')
    5. 자동 분개 생성 (status='미결재')
    """
    ...

async def auto_calculate_all_funds(
    db: Session,
    year: int,
    quarter: int,
) -> list[dict]:
    """전체 활성 펀드의 분기 수수료 일괄 계산."""
    ...
```

### 2-2. 스케줄러 연동

#### [MODIFY] `backend/services/scheduler.py`

분기 시작 시 자동 계산 트리거:

```python
# 매분기 1일 (1월, 4월, 7월, 10월) 자동 실행
scheduler.add_job(
    auto_calculate_all_funds,
    trigger='cron',
    month='1,4,7,10',
    day=1,
    hour=9,
    args=[get_db_session(), current_year, current_quarter],
)
```

---

## Part 3. IRR / TVPI / DPI 자동 계산

### 3-1. 수익률 계산 서비스

#### [NEW] `backend/services/performance_calculator.py`

```python
"""펀드 수익률 자동 계산.

Transaction, CapitalCall, Distribution 데이터 기반으로:
- IRR (Internal Rate of Return) - scipy.optimize 사용
- TVPI (Total Value to Paid-In) = (분배총액 + 잔존가치) / 납입총액
- DPI (Distributions to Paid-In) = 분배총액 / 납입총액
"""

import numpy as np
from scipy.optimize import brentq

async def calculate_fund_performance(
    db: Session,
    fund_id: int,
    as_of_date: date | None = None,
) -> dict:
    """
    Returns: {
      irr: float | None,           # 연환산 IRR (소수점)
      tvpi: float,                  # 배수
      dpi: float,                   # 배수
      total_paid_in: float,
      total_distributed: float,
      residual_value: float,        # 최신 Valuation 합계
      as_of_date: str,
    }
    """
    # 1. 납입 총액: LP.paid_in 합계 또는 CapitalCallDetail 합계
    # 2. 분배 총액: DistributionDetail 합계
    # 3. 잔존가치: 최신 Valuation fair_value 합계
    # 4. IRR 계산: 캐시플로우 시계열 구성 → brentq로 IRR 도출
    # 5. TVPI = (분배총액 + 잔존가치) / 납입총액
    # 6. DPI = 분배총액 / 납입총액
    ...
```

### 3-2. API 엔드포인트

#### [MODIFY] `backend/routers/performance.py`

```python
@router.get("/funds/{fund_id}/performance")
async def get_fund_performance(
    fund_id: int,
    as_of_date: str | None = None,
    db: Session = Depends(get_db),
):
    return await calculate_fund_performance(db, fund_id, as_of_date)

@router.get("/performance/all")
async def get_all_funds_performance(db: Session = Depends(get_db)):
    """전체 펀드 수익률 요약."""
    funds = db.query(Fund).filter(Fund.status == 'active').all()
    results = []
    for fund in funds:
        perf = await calculate_fund_performance(db, fund.id)
        results.append({ 'fund_id': fund.id, 'fund_name': fund.name, **perf })
    return results
```

### 3-3. 프론트엔드: 수익률 카드

FundDetailPage "개요" 탭에 수익률 카드 추가:

```
┌─────────┬─────────┬─────────┐
│  IRR    │  TVPI   │  DPI    │
│  8.5%   │  1.25x  │  0.40x  │
│ ↑ 1.2%  │ ↑ 0.05  │ ↑ 0.10  │
└─────────┴─────────┴─────────┘
```

대시보드 사이드바에도 전체 펀드 수익률 요약 추가.

---

## Part 4. scipy 의존성 처리

`scipy`는 무거운 라이브러리. 대안 검토:
1. `numpy-financial` 패키지 사용 (경량)
2. 자체 IRR 구현 (Newton-Raphson method)
3. scipy 그대로 사용 (이미 설치되어 있을 수 있음)

```bash
pip install numpy-financial  # 또는 scipy가 이미 있으면 그대로 사용
```

---

## 검증 체크리스트

- [ ] 현금흐름 API: `/api/funds/{id}/cashflow` 정상 응답 (월별 유입/유출/잔액)
- [ ] 현금흐름 UI: 바 차트 + 테이블 렌더링
- [ ] 잔액 경고: 특정 임계값 이하 시 경고 표시
- [ ] 수수료 자동 계산: `calculate_quarterly_fee` 정상 동작
- [ ] 수수료 스케줄러: 분기 시작 시 트리거 등록
- [ ] IRR/TVPI/DPI: `calculate_fund_performance` 정상 계산
- [ ] 수익률 카드: FundDetailPage + 대시보드에 표시
- [ ] git commit: `feat: Phase 68 cashflow and fee automation`
