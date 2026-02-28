# Phase 44: LP 납입 이력 관리 시스템 (기존 데이터 이전 및 출자 연동)

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> ⚠️ **비식별화 원칙:** 실존 정보 사용 금지.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P0 — 기존 조합 데이터 이전 핵심 기능  
**의존성:** Phase 43 완료 상태 (이전 Phase에서 추가한 모든 기능 유지)  
**핵심 원칙:**
1. **기존 데이터 이전 지원** — 기존 조합의 LP별 납입 이력을 수동 등록하여 과거 데이터를 시스템에 반영
2. **출자방식별 분기** — 조합의 출자방식(일시납/분할납/수시납)에 따라 납입 이력 표출이 달라짐
3. **출자요청 위저드 연동** — 차후 출자요청 위저드로 캐피탈콜 진행 시 자동으로 납입 이력에 기록
4. **기존 기능 무결성** — 기존 LP 그리드, 누적납입액, 캐피탈콜 시스템을 보강만 할 것

---

## 배경: 납입 이력 관리의 필요성

현재 시스템에서 LP의 `paid_in` (누적 납입액)은 단일 숫자값으로만 관리된다. 그러나 실무에서는:
- **언제 얼마를 납입했는지** 이력이 필요
- **납입기일 vs 실제 입금일**을 구분하여 관리해야 함
- **총약정액 대비 납입률**을 각 시점마다 추적해야 함
- 기존 운용 중인 조합의 과거 납입 데이터를 시스템에 등록할 수 있어야 함

### 출자방식별 차이

| 출자방식 | 특성 | 납입 이력 패턴 |
|---------|------|---------------|
| **일시납** | 한번에 전액 납입 | 레코드 1건 (자동 생성 가능) |
| **분할납** | 사전 합의된 일정에 따라 분납 | 정해진 일정별 레코드, 각 회차 금액·비율 명시 |
| **수시납** | 기간 미정, 캐피탈콜 요청 시 납입 | 캐피탈콜 발생 시마다 레코드 추가 |

### 핵심 UI 동작

1. **기존 LP 그리드**에서 LP 행을 **클릭하면** 납입 이력 상세가 펼쳐진다 (expandable row)
2. 펼쳐진 패널에서:
   - 납입 날짜, 금액, 약정 대비 비율(%)을 회차별로 보여준다
   - **납입기일** (예정일)과 **비고란**에 실제 입금 날짜를 별도 표시
   - 일시납 조합은 "일시납으로 전액 납입됨" 메시지 + 납입 기록 1건만 표시
3. **수동 납입 이력 추가** 버튼으로 과거 데이터를 입력
4. **출자요청 위저드**로 캐피탈콜 진행 시 → 해당 LP의 납입 이력에 자동 반영

---

## Part 0. 전수조사 (필수)

### 기존 코드 확인
- [ ] `backend/models/fund.py` — `Fund.contribution_type` 필드 확인 (일시/분할/수시)
- [ ] `backend/models/fund.py` — `LP.paid_in`, `LP.commitment` 필드 확인
- [ ] `backend/models/phase3.py` — `CapitalCall`, `CapitalCallItem`, `CapitalCallDetail` 모델 관계 확인
- [ ] `backend/routers/capital_calls.py` — `create_capital_call_batch`, `update_capital_call_item` 로직 확인 (납입 완료 시 LP paid_in 업데이트 흐름)
- [ ] `backend/routers/funds.py` — `calculate_lp_paid_in_from_calls` 함수 확인
- [ ] `frontend/src/pages/FundDetailPage.tsx` — `capitalGridRows` (line 1376), 자본 및 LP 현황 탭 (line 2139~2340)
- [ ] `frontend/src/pages/FundDetailPage.tsx` — `CapitalCallWizard` (line 847~1097)
- [ ] `frontend/src/lib/api.ts` — 기존 Capital Call 관련 API 호출 함수 확인
- [ ] `backend/schemas/phase3.py` — 기존 `CapitalCallItemResponse`, `CapitalCallBatchCreate` 스키마 확인
- [ ] `backend/models/__init__.py` — 모델 등록 구조 확인 (line 23~34)

---

## Part 1. 백엔드 — LP 납입 이력 모델

### 1-1. 납입 이력 모델

#### [NEW] `backend/models/lp_contribution.py`

```python
from datetime import date as dt_date, datetime

from sqlalchemy import Column, Integer, Float, ForeignKey, Date, DateTime, String, Text
from sqlalchemy.orm import relationship

from database import Base


class LPContribution(Base):
    """LP별 납입 이력 레코드. 납입 1회 = 1행."""
    __tablename__ = "lp_contributions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id", ondelete="CASCADE"), nullable=False, index=True)
    lp_id = Column(Integer, ForeignKey("lps.id", ondelete="CASCADE"), nullable=False, index=True)

    # 납입 정보
    due_date = Column(Date, nullable=False)              # 납입기일 (예정일)
    amount = Column(Float, nullable=False, default=0)     # 납입 금액
    commitment_ratio = Column(Float, nullable=True)       # 총약정액 대비 비율 (%)
    round_no = Column(Integer, nullable=True)             # 회차 (분할납: 1,2,3... / 수시납: 자동 부여)

    # 비고: 실제 입금 정보
    actual_paid_date = Column(Date, nullable=True)        # 실제 입금 날짜
    memo = Column(Text, nullable=True)                    # 비고란

    # 출자요청 연결 (캐피탈콜 연동 시 자동 세팅)
    capital_call_id = Column(Integer, ForeignKey("capital_calls.id", ondelete="SET NULL"), nullable=True, index=True)
    source = Column(String, nullable=False, default="manual")  # "manual" | "capital_call" | "migration"

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    fund = relationship("Fund")
    lp = relationship("LP")
    capital_call = relationship("CapitalCall")
```

**설계 포인트:**
- `due_date`는 **납입기일** (예정 날짜). 분할납은 정해진 일정, 수시납은 캐피탈콜 요청일
- `actual_paid_date`는 **실제 입금일**. 비고란에 해당하며, 별도로 표시
- `capital_call_id`로 출자요청 위저드와 연결. 수동 등록은 `null`
- `source` 필드: "manual" (수동 등록/기존 데이터 이전), "capital_call" (위저드 자동), "migration" (엑셀 마이그레이션)
- `commitment_ratio`는 저장 시 `(amount / lp.commitment) * 100`으로 자동 계산

### 1-2. 모델 등록

#### [MODIFY] `backend/models/__init__.py`

```python
# 기존 import에 추가:
from .lp_contribution import LPContribution

# __all__에 추가:
"LPContribution",
```

### 1-3. Fund.lps 및 LP에 relationship 추가

#### [MODIFY] `backend/models/fund.py`

LP 모델에 contributions relationship 추가:

```python
class LP(Base):
    # 기존 필드 유지...
    
    # 추가:
    contributions = relationship(
        "LPContribution", 
        back_populates="lp", 
        cascade="all, delete-orphan",
        order_by="LPContribution.due_date"
    )
```

---

## Part 2. 백엔드 — 스키마

### 2-1. 납입 이력 스키마

#### [NEW] `backend/schemas/lp_contribution.py`

```python
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class LPContributionCreate(BaseModel):
    """수동 납입 이력 생성 (기존 데이터 이전용)"""
    fund_id: int
    lp_id: int
    due_date: date                         # 납입기일
    amount: float = Field(gt=0)            # 납입 금액
    round_no: Optional[int] = None         # 회차 (미입력 시 자동 부여)
    actual_paid_date: Optional[date] = None  # 실제 입금 날짜
    memo: Optional[str] = None             # 비고
    source: str = "manual"                 # manual | migration


class LPContributionUpdate(BaseModel):
    """납입 이력 수정"""
    due_date: Optional[date] = None
    amount: Optional[float] = Field(default=None, gt=0)
    round_no: Optional[int] = None
    actual_paid_date: Optional[date] = None
    memo: Optional[str] = None


class LPContributionResponse(BaseModel):
    """납입 이력 응답"""
    id: int
    fund_id: int
    lp_id: int
    due_date: date
    amount: float
    commitment_ratio: Optional[float] = None  # 약정 대비 비율 (%)
    round_no: Optional[int] = None
    actual_paid_date: Optional[date] = None
    memo: Optional[str] = None
    capital_call_id: Optional[int] = None
    source: str
    created_at: datetime

    model_config = {"from_attributes": True}


class LPContributionListItem(LPContributionResponse):
    """리스트용 - LP명 포함"""
    lp_name: str = ""
    cumulative_amount: float = 0   # 해당 시점까지의 누적 납입액


class LPContributionSummary(BaseModel):
    """LP별 납입 요약 (클릭 시 표시)"""
    lp_id: int
    lp_name: str
    commitment: float                  # 총 약정액
    total_paid_in: float               # 누적 납입액
    paid_ratio: float                  # 약정 대비 납입률 (%)
    contribution_count: int            # 납입 횟수
    contribution_type: Optional[str]   # 조합의 출자방식 (일시/분할/수시)
    contributions: list[LPContributionListItem]  # 시간순 납입 이력


class BulkLPContributionCreate(BaseModel):
    """일괄 납입 이력 생성 (여러 건 한번에)"""
    fund_id: int
    contributions: list[LPContributionCreate]
```

---

## Part 3. 백엔드 — API 라우터

### 3-1. 납입 이력 API

#### [NEW] `backend/routers/lp_contributions.py`

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/funds/{fund_id}/lps/{lp_id}/contributions` | LP별 납입 이력 조회 (시간순) |
| GET | `/api/funds/{fund_id}/lps/{lp_id}/contributions/summary` | LP별 납입 요약 (총납입액, 비율 등) |
| POST | `/api/funds/{fund_id}/lps/{lp_id}/contributions` | 납입 이력 수동 추가 |
| POST | `/api/funds/{fund_id}/lps/{lp_id}/contributions/bulk` | 일괄 납입 이력 추가 |
| PUT | `/api/lp-contributions/{id}` | 납입 이력 수정 |
| DELETE | `/api/lp-contributions/{id}` | 납입 이력 삭제 |
| GET | `/api/funds/{fund_id}/contribution-overview` | 조합 전체 LP 납입 현황 요약 |

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.fund import Fund, LP
from models.lp_contribution import LPContribution
from schemas.lp_contribution import (
    LPContributionCreate,
    LPContributionUpdate,
    LPContributionResponse,
    LPContributionListItem,
    LPContributionSummary,
    BulkLPContributionCreate,
)

router = APIRouter(tags=["lp-contributions"])


def _calculate_commitment_ratio(amount: float, commitment: float) -> float | None:
    """약정액 대비 납입 비율 계산"""
    if not commitment or commitment <= 0:
        return None
    return round((amount / commitment) * 100, 4)


def _auto_round_no(db: Session, fund_id: int, lp_id: int) -> int:
    """해당 LP의 다음 회차 번호 자동 부여"""
    max_round = (
        db.query(LPContribution.round_no)
        .filter(LPContribution.fund_id == fund_id, LPContribution.lp_id == lp_id)
        .order_by(LPContribution.round_no.desc())
        .first()
    )
    return (max_round[0] or 0) + 1 if max_round else 1


def _sync_lp_paid_in(db: Session, lp_id: int):
    """LP의 paid_in 값을 납입 이력 합계로 동기화"""
    lp = db.query(LP).get(lp_id)
    if not lp:
        return
    total = (
        db.query(func.sum(LPContribution.amount))
        .filter(LPContribution.lp_id == lp_id)
        .scalar()
    ) or 0
    lp.paid_in = int(total)
    db.flush()


@router.get("/api/funds/{fund_id}/lps/{lp_id}/contributions")
def list_lp_contributions(
    fund_id: int,
    lp_id: int,
    db: Session = Depends(get_db),
):
    """LP별 납입 이력 조회 (시간순, 누적금액 포함)"""
    lp = db.query(LP).filter(LP.id == lp_id, LP.fund_id == fund_id).first()
    if not lp:
        raise HTTPException(404, "LP를 찾을 수 없습니다.")
    
    rows = (
        db.query(LPContribution)
        .filter(LPContribution.fund_id == fund_id, LPContribution.lp_id == lp_id)
        .order_by(LPContribution.due_date, LPContribution.round_no)
        .all()
    )
    
    result = []
    cumulative = 0
    for row in rows:
        cumulative += float(row.amount or 0)
        item = LPContributionListItem(
            **{c.name: getattr(row, c.name) for c in row.__table__.columns},
            lp_name=lp.name,
            cumulative_amount=cumulative,
        )
        result.append(item)
    
    return result


@router.get("/api/funds/{fund_id}/lps/{lp_id}/contributions/summary")
def get_lp_contribution_summary(
    fund_id: int,
    lp_id: int,
    db: Session = Depends(get_db),
):
    """LP별 납입 요약"""
    fund = db.query(Fund).get(fund_id)
    if not fund:
        raise HTTPException(404, "조합을 찾을 수 없습니다.")
    lp = db.query(LP).filter(LP.id == lp_id, LP.fund_id == fund_id).first()
    if not lp:
        raise HTTPException(404, "LP를 찾을 수 없습니다.")
    
    contributions = list_lp_contributions(fund_id, lp_id, db)
    total_paid = sum(c.amount for c in contributions)
    commitment = float(lp.commitment or 0)
    
    return LPContributionSummary(
        lp_id=lp.id,
        lp_name=lp.name,
        commitment=commitment,
        total_paid_in=total_paid,
        paid_ratio=round((total_paid / commitment * 100), 2) if commitment > 0 else 0,
        contribution_count=len(contributions),
        contribution_type=fund.contribution_type,
        contributions=contributions,
    )


@router.post("/api/funds/{fund_id}/lps/{lp_id}/contributions", status_code=201)
def create_lp_contribution(
    fund_id: int,
    lp_id: int,
    data: LPContributionCreate,
    db: Session = Depends(get_db),
):
    """납입 이력 수동 추가"""
    lp = db.query(LP).filter(LP.id == lp_id, LP.fund_id == fund_id).first()
    if not lp:
        raise HTTPException(404, "LP를 찾을 수 없습니다.")
    
    round_no = data.round_no or _auto_round_no(db, fund_id, lp_id)
    commitment = float(lp.commitment or 0)
    ratio = _calculate_commitment_ratio(data.amount, commitment)
    
    contribution = LPContribution(
        fund_id=fund_id,
        lp_id=lp_id,
        due_date=data.due_date,
        amount=data.amount,
        commitment_ratio=ratio,
        round_no=round_no,
        actual_paid_date=data.actual_paid_date,
        memo=data.memo,
        source=data.source or "manual",
    )
    db.add(contribution)
    _sync_lp_paid_in(db, lp_id)
    db.commit()
    db.refresh(contribution)
    
    return LPContributionResponse.model_validate(contribution)


@router.post("/api/funds/{fund_id}/lps/{lp_id}/contributions/bulk", status_code=201)
def bulk_create_lp_contributions(
    fund_id: int,
    lp_id: int,
    data: BulkLPContributionCreate,
    db: Session = Depends(get_db),
):
    """일괄 납입 이력 추가"""
    lp = db.query(LP).filter(LP.id == lp_id, LP.fund_id == fund_id).first()
    if not lp:
        raise HTTPException(404, "LP를 찾을 수 없습니다.")
    
    results = []
    for item in data.contributions:
        round_no = item.round_no or _auto_round_no(db, fund_id, lp_id)
        commitment = float(lp.commitment or 0)
        ratio = _calculate_commitment_ratio(item.amount, commitment)
        
        contribution = LPContribution(
            fund_id=fund_id,
            lp_id=lp_id,
            due_date=item.due_date,
            amount=item.amount,
            commitment_ratio=ratio,
            round_no=round_no,
            actual_paid_date=item.actual_paid_date,
            memo=item.memo,
            source=item.source or "manual",
        )
        db.add(contribution)
        results.append(contribution)
    
    _sync_lp_paid_in(db, lp_id)
    db.commit()
    
    return [LPContributionResponse.model_validate(r) for r in results]


@router.put("/api/lp-contributions/{contribution_id}")
def update_lp_contribution(
    contribution_id: int,
    data: LPContributionUpdate,
    db: Session = Depends(get_db),
):
    """납입 이력 수정"""
    contribution = db.query(LPContribution).get(contribution_id)
    if not contribution:
        raise HTTPException(404, "납입 이력을 찾을 수 없습니다.")
    
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(contribution, key, value)
    
    if data.amount is not None:
        lp = db.query(LP).get(contribution.lp_id)
        if lp:
            contribution.commitment_ratio = _calculate_commitment_ratio(
                data.amount, float(lp.commitment or 0)
            )
    
    _sync_lp_paid_in(db, contribution.lp_id)
    db.commit()
    db.refresh(contribution)
    
    return LPContributionResponse.model_validate(contribution)


@router.delete("/api/lp-contributions/{contribution_id}", status_code=204)
def delete_lp_contribution(
    contribution_id: int,
    db: Session = Depends(get_db),
):
    """납입 이력 삭제"""
    contribution = db.query(LPContribution).get(contribution_id)
    if not contribution:
        raise HTTPException(404, "납입 이력을 찾을 수 없습니다.")
    
    lp_id = contribution.lp_id
    db.delete(contribution)
    _sync_lp_paid_in(db, lp_id)
    db.commit()


@router.get("/api/funds/{fund_id}/contribution-overview")
def get_fund_contribution_overview(
    fund_id: int,
    db: Session = Depends(get_db),
):
    """조합 전체 LP 납입 현황 요약"""
    fund = db.query(Fund).get(fund_id)
    if not fund:
        raise HTTPException(404, "조합을 찾을 수 없습니다.")
    
    lps = db.query(LP).filter(LP.fund_id == fund_id).all()
    summaries = []
    for lp in lps:
        summary = get_lp_contribution_summary(fund_id, lp.id, db)
        summaries.append(summary)
    
    return {
        "fund_id": fund_id,
        "contribution_type": fund.contribution_type,
        "lp_summaries": summaries,
    }
```

### 3-2. 출자요청 위저드 연동

#### [MODIFY] `backend/routers/capital_calls.py`

`create_capital_call_batch` 함수에서 캐피탈콜 생성 시 **자동으로 LP별 납입 이력을 추가**하는 로직 삽입:

```python
# create_capital_call_batch 함수 내, 기존 CapitalCallItem 생성 후 추가:

from models.lp_contribution import LPContribution

# 캐피탈콜 아이템마다 LPContribution 자동 생성
for item in call_items:
    lp = db.query(LP).get(item.lp_id)
    commitment = float(lp.commitment or 0) if lp else 0
    ratio = round((item.amount / commitment) * 100, 4) if commitment > 0 else None
    
    existing_count = (
        db.query(LPContribution)
        .filter(LPContribution.fund_id == data.fund_id, LPContribution.lp_id == item.lp_id)
        .count()
    )
    
    contribution = LPContribution(
        fund_id=data.fund_id,
        lp_id=item.lp_id,
        due_date=data.call_date,
        amount=item.amount,
        commitment_ratio=ratio,
        round_no=existing_count + 1,
        capital_call_id=call.id,
        source="capital_call",
    )
    db.add(contribution)
```

### 3-3. 라우터 등록

#### [MODIFY] `backend/main.py`

```python
from routers import lp_contributions

app.include_router(lp_contributions.router)
```

---

## Part 4. 프론트엔드 — LP 납입 이력 패널

### 4-1. API 타입 및 함수 추가

#### [MODIFY] `frontend/src/lib/api.ts`

```typescript
// ── LP 납입 이력 타입 ──

export interface LPContribution {
  id: number
  fund_id: number
  lp_id: number
  due_date: string         // 납입기일
  amount: number
  commitment_ratio: number | null  // 약정 대비 %
  round_no: number | null
  actual_paid_date: string | null  // 실제 입금일
  memo: string | null
  capital_call_id: number | null
  source: string           // manual | capital_call | migration
  created_at: string
  lp_name?: string
  cumulative_amount?: number  // 누적 납입액
}

export interface LPContributionSummary {
  lp_id: number
  lp_name: string
  commitment: number
  total_paid_in: number
  paid_ratio: number          // %
  contribution_count: number
  contribution_type: string | null  // 조합의 출자방식
  contributions: LPContribution[]
}

export interface LPContributionInput {
  fund_id: int
  lp_id: int
  due_date: string
  amount: number
  round_no?: number | null
  actual_paid_date?: string | null
  memo?: string | null
  source?: string
}

// ── API 함수 ──

export const fetchLPContributions = (fundId: number, lpId: number) =>
  api.get(`/funds/${fundId}/lps/${lpId}/contributions`).then(r => r.data)

export const fetchLPContributionSummary = (fundId: number, lpId: number) =>
  api.get(`/funds/${fundId}/lps/${lpId}/contributions/summary`).then(r => r.data)

export const createLPContribution = (fundId: number, lpId: number, data: LPContributionInput) =>
  api.post(`/funds/${fundId}/lps/${lpId}/contributions`, data).then(r => r.data)

export const updateLPContribution = (id: number, data: Partial<LPContributionInput>) =>
  api.put(`/lp-contributions/${id}`, data).then(r => r.data)

export const deleteLPContribution = (id: number) =>
  api.delete(`/lp-contributions/${id}`)
```

### 4-2. LP 납입 이력 확장 패널

#### [MODIFY] `frontend/src/pages/FundDetailPage.tsx`

**변경 포인트 1: 상태 추가**

```typescript
// 기존 state 블록에 추가:
const [expandedLPId, setExpandedLPId] = useState<number | null>(null)
const [showAddContribution, setShowAddContribution] = useState(false)
```

**변경 포인트 2: LP 행 클릭 시 확장**

기존 LP 그리드 `<tr>` 행을 클릭 가능하게 만들고, `expandedLPId === lp.id` 일 때 아래에 납입 이력 패널 삽입:

```tsx
// capitalGridRows.flatMap 내부, 기존 editingLPId 체크 후에 추가:

if (expandedLPId === lp.id) {
  rows.push(
    <tr key={`contrib-${lp.id}`}>
      <td colSpan={6} className="px-0 py-0">
        <LPContributionPanel
          fundId={fundId}
          lpId={lp.id}
          lpName={lp.name}
          commitment={lp.commitment}
          contributionType={fundDetail?.contribution_type || null}
        />
      </td>
    </tr>,
  )
}
```

**변경 포인트 3: LP명 셀에 클릭 토글**

기존 LP명 `<td>` 셀에 클릭 이벤트 및 시각적 힌트 추가:

```tsx
<td
  className="sticky left-0 z-[1] bg-white px-3 py-2 font-medium text-gray-800 cursor-pointer hover:text-blue-700"
  onClick={() => setExpandedLPId(prev => prev === lp.id ? null : lp.id)}
>
  <span className="inline-flex items-center gap-1">
    {expandedLPId === lp.id ? '▼' : '▶'} {lp.name}
  </span>
</td>
```

### 4-3. LP 납입 이력 패널 컴포넌트

#### [NEW] `frontend/src/components/fund/LPContributionPanel.tsx`

**주요 UI:**

```
┌─ 📋 납입 이력 — [LP명] ────────────────────────────────────────────────────┐
│                                                                              │
│  [출자방식: 분할납]   총 약정: 50억   누적 납입: 30억 (60.0%)               │
│                                                                              │
│  ┌────┬──────────┬──────────┬──────────┬──────────┬─────────┬────────────┐   │
│  │ 회 │ 납입기일  │ 납입금액  │ 약정대비% │ 누적납입  │ 입금일   │ 비고       │   │
│  ├────┼──────────┼──────────┼──────────┼──────────┼─────────┼────────────┤   │
│  │ 1  │ 2024-03-15│ 10.0억   │ 20.0%    │ 10.0억   │ 03-15   │ 결성시 납입 │   │
│  │ 2  │ 2024-06-30│ 10.0억   │ 20.0%    │ 20.0억   │ 07-02   │ 2일 지연    │   │
│  │ 3  │ 2024-12-15│ 10.0억   │ 20.0%    │ 30.0억   │ 12-15   │            │   │
│  └────┴──────────┴──────────┴──────────┴──────────┴─────────┴────────────┘   │
│                                                                              │
│  [+ 납입 이력 추가]                                                          │
│                                                                              │
│  ┌─ 납입 이력 추가 ─────────────────────────────────────────────────────┐    │
│  │ 납입기일: [____-__-__]  금액: [___________]  실제입금일: [____]       │    │
│  │ 비고: [_______________]                         [저장] [취소]        │    │
│  └───────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ⓘ 일시납 조합: "전액 일시 납입으로 납입 이력이 자동 처리됩니다."            │
│  ⓘ 수시납 조합: "출자요청 위저드로 캐피탈콜 진행 시 자동으로 기록됩니다."    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**출자방식별 UI 분기:**

1. **일시납** (`contribution_type === '일시'`):
   - "전액 일시 납입" 안내 문구 표시
   - 납입 이력이 0건이면 자동으로 1건 생성 안내 또는 수동 등록 가능
   - 추가 버튼 비활성 (이미 1건 있는 경우)

2. **분할납** (`contribution_type === '분할'`):
   - 모든 기능 활성: 수동 추가, 수정, 삭제
   - 회차 번호 자동 부여
   - "정해진 일정에 따른 분할 납입" 안내

3. **수시납** (`contribution_type === '수시'`):
   - 모든 기능 활성
   - "출자요청 위저드로 캐피탈콜 진행 시 자동 기록됩니다" 안내
   - `source === 'capital_call'`인 행은 수정/삭제 제한 (캐피탈콜 연동 아이콘 표시)
   - 기존 데이터 수동 등록 가능

4. **미설정** (`contribution_type` 미입력):
   - 모든 기능 활성, 출자방식 설정 권장 안내

**컴포넌트 구현:**

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchLPContributionSummary,
  createLPContribution,
  updateLPContribution,
  deleteLPContribution,
  type LPContribution,
  type LPContributionSummary,
} from '../../lib/api'
import { formatKRW } from '../../lib/labels'
import { useToast } from '../../contexts/ToastContext'
import KrwAmountInput from '../common/KrwAmountInput'

interface LPContributionPanelProps {
  fundId: number
  lpId: number
  lpName: string
  commitment: number
  contributionType: string | null  // 일시 | 분할 | 수시 | null
}

export default function LPContributionPanel({
  fundId,
  lpId,
  lpName,
  commitment,
  contributionType,
}: LPContributionPanelProps) {
  // ... useQuery로 납입 이력 조회
  // ... 추가/수정/삭제 mutation
  // ... 출자방식별 분기 렌더링
}
```

---

## Part 5. DB 마이그레이션

Alembic 사용하지 않고 기존 패턴 따름 — `Base.metadata.create_all()` 시 자동 생성:

```python
# backend/database.py의 create_all 또는 main.py 시작 시 자동 생성
# 별도 마이그레이션 스크립트 불필요 (SQLite 기반이므로)
```

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [NEW] | `backend/models/lp_contribution.py` | LPContribution 모델 |
| 2 | [MODIFY] | `backend/models/__init__.py` | LPContribution import/export 추가 |
| 3 | [MODIFY] | `backend/models/fund.py` | LP 모델에 contributions relationship 추가 |
| 4 | [NEW] | `backend/schemas/lp_contribution.py` | 납입 이력 Pydantic 스키마 |
| 5 | [NEW] | `backend/routers/lp_contributions.py` | 납입 이력 CRUD API 라우터 |
| 6 | [MODIFY] | `backend/routers/capital_calls.py` | 캐피탈콜 생성 시 자동 납입 이력 연동 |
| 7 | [MODIFY] | `backend/main.py` | lp_contributions 라우터 등록 |
| 8 | [MODIFY] | `frontend/src/lib/api.ts` | LP 납입 이력 타입 + API 함수 추가 |
| 9 | [NEW] | `frontend/src/components/fund/LPContributionPanel.tsx` | LP 납입 이력 확장 패널 컴포넌트 |
| 10 | [MODIFY] | `frontend/src/pages/FundDetailPage.tsx` | LP 행 클릭 확장, 납입 이력 패널 삽입 |

---

## Acceptance Criteria

### Part 1-2 — 백엔드 모델/스키마
- [ ] **AC-01:** `lp_contributions` 테이블이 생성되고 `due_date`, `amount`, `commitment_ratio`, `actual_paid_date`, `memo`, `capital_call_id`, `source` 필드를 갖는다.
- [ ] **AC-02:** LP 삭제 시 연관된 LPContribution 레코드가 CASCADE로 함께 삭제된다.

### Part 3 — API
- [ ] **AC-03:** `GET /api/funds/{fund_id}/lps/{lp_id}/contributions` 요청 시 시간순으로 납입 이력과 누적금액을 반환한다.
- [ ] **AC-04:** `POST` 납입 이력 생성 시 `commitment_ratio`가 자동 계산되고, `round_no`가 자동 부여된다.
- [ ] **AC-05:** 납입 이력 생성/수정/삭제 시 해당 LP의 `paid_in` 값이 자동 동기화된다.
- [ ] **AC-06:** `GET .../contributions/summary` 요청 시 LP별 총납입, 비율, 이력 리스트를 반환한다.

### Part 3-2 — 출자요청 연동
- [ ] **AC-07:** 출자요청 위저드로 캐피탈콜 생성 시 각 LP별 LPContribution 레코드가 `source="capital_call"`로 자동 생성된다.
- [ ] **AC-08:** 자동 생성된 납입 이력의 `capital_call_id`가 해당 캐피탈콜 ID와 연결된다.

### Part 4 — 프론트엔드
- [ ] **AC-09:** 자본 및 LP 현황 탭에서 LP명을 클릭하면 납입 이력 패널이 펼쳐진다/접힌다.
- [ ] **AC-10:** 납입 이력 테이블에 회차, 납입기일, 납입금액, 약정대비%, 누적납입, 실제입금일, 비고가 표시된다.
- [ ] **AC-11:** 출자방식이 "일시"인 경우 적절한 안내 문구가 표시되고, 이미 1건 있으면 추가 버튼이 비활성화된다.
- [ ] **AC-12:** 출자방식이 "분할" 또는 "수시"인 경우 수동 납입 이력을 추가/수정/삭제할 수 있다.
- [ ] **AC-13:** `source === 'capital_call'`인 행에는 출자요청 연동 아이콘이 표시되고 삭제가 제한된다.
- [ ] **AC-14:** 납입 이력 추가 시 납입기일, 금액, 실제입금일, 비고를 입력할 수 있다.

### 공통
- [ ] **AC-15:** Phase 31~43의 모든 기능 유지.
- [ ] **AC-16:** 기존 LP 그리드의 누적 납입액 표시가 정상 동작한다.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. 기존 API 시그니처 (Task CRUD, Fund CRUD, Investment CRUD, LP CRUD, Workflow CRUD, CapitalCall CRUD) — 유지 (확장만)
3. 기존 데이터 모델 구조 — 유지 (새 테이블/관계만 추가)
4. Phase 31~43의 기존 구현 — 보강만, 삭제/재구성 금지
5. WorkflowsPage.tsx (140KB) — 이 파일은 건드리지 말 것
6. 기존 `capitalGridRows`의 계산 로직을 변경하지 말 것 (확장만)

---

## 기술 참고사항

### 기존 paid_in 동기화 주의
- 현재 LP의 `paid_in`은 수동 입력 값. Phase 44에서 `LPContribution` 레코드가 있으면 그 합계로 대체.
- 단, 레코드가 없는 LP는 기존 `paid_in` 값을 그대로 유지 (기존 데이터 보호)
- `_sync_lp_paid_in`은 해당 LP에 `LPContribution`이 **1건 이상** 있을 때만 동기화

### 캐피탈콜 자동 연동 시점
- `create_capital_call_batch`가 호출될 때 (위저드 완료 시)
- `CapitalCallItem`과 동시에 `LPContribution` 생성
- 캐피탈콜의 `paid` 상태 변경은 `LPContribution`의 `actual_paid_date` 업데이트로 연동 가능 (향후 확장)

### 프론트엔드 쿼리 키
- `['lpContributions', fundId, lpId]` — LP별 납입 이력
- `['lpContributionSummary', fundId, lpId]` — LP별 납입 요약
- 납입 이력 변경 시 `['fund', fundId]` 쿼리도 invalidate (paid_in 동기화 반영)
