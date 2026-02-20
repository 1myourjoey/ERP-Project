# Phase 18: 출자금 납입 요청 워크플로우 — 조합 세부카드에서 출자 요청·이력 관리

> **Priority:** P1
> **Focus:** 조합 세부카드 출자이력에서 "출자 요청" 버튼 → 위자드 워크플로우 → LP별 납입금액 자동 계산 → 차수별 상세 열람

---

## Table of Contents

1. [Part 1 — 출자 요청 위자드 (프론트엔드)](#part-1--출자-요청-위자드-프론트엔드)
2. [Part 2 — 백엔드 모델 확장 + API 보강](#part-2--백엔드-모델-확장--api-보강)
3. [Part 3 — 출자이력 차수별 상세 보기 (FundDetailPage)](#part-3--출자이력-차수별-상세-보기-funddetailpage)
4. [Part 4 — 조합운영 페이지 연동 (FundOperationsPage)](#part-4--조합운영-페이지-연동-fundoperationspage)
5. [Part 5 — 연계 시스템 동기화](#part-5--연계-시스템-동기화)
6. [Files to create / modify](#files-to-create--modify)
6. [Acceptance Criteria](#acceptance-criteria)
7. [구현 주의사항](#구현-주의사항)

---

## 개요

### 현재 상태

- `CapitalCall` 모델과 `CapitalCallItem` 모델이 이미 존재하고, CRUD API 11개가 구현됨.
- `FundDetailPage.tsx` 에 출자 이력 테이블 존재 (차수·납입일·납입금액·납입비율·비고). 단, LP별 상세 없음.
- `FundOperationsPage.tsx` 에 출자 섹션 존재 (출자 등록/수정/삭제 + LP 항목 내역). 단, 순수 데이터 입력 방식.
- `FundNoticePeriod` 모델에 `capital_call_initial`(10일), `capital_call_additional`(10일) 등 통지기간 정의됨.
- `list_funds` API (`routers/funds.py`)가 `LP.paid_in` 합산으로 `paid_in_total`을 계산하여 FundsPage 조합카드에 표시.
- `performance` API (`routers/performance.py`)가 CapitalCall 데이터를 cashflow로 사용하여 IRR/TVPI/DPI 계산.
- `FundOverviewPage.tsx`에서 조합별 `total_paid_in`, `paid_in_ratio` 테이블 표시.
- `TemplateManagementPage.tsx`에 출자금 납입 관련 공문 템플릿 존재.

### 목표

1. **조합 세부카드** (`FundDetailPage`) 출자이력 영역에 **"출자 요청"** 버튼 추가
2. 버튼 클릭 시 **Step-by-Step 위자드** 열림:
   - Step 1: 납입일 지정 + 통지기간 자동 확인 → 발송 마감일 계산
   - Step 2: 총 약정금액 대비 요청 비율(%) 입력 → 총 출자 요청 금액 자동 계산
   - Step 3: LP 목록 확인 + LP별 요청 금액(약정금액 × 요청비율) 자동 계산 → 미세 조정 가능
   - Step 4: 최종 확인 + 등록
3. **출자이력 차수 클릭** 시 해당 차수의 **LP별 납입 상세** (요청일자, 납입일자, LP별 금액, 약정 대비 %) 모달/드로어 표시
4. 위 정보가 **조합운영** (`FundOperationsPage`)에서도 동일하게 열람 가능
5. **LP별 납입 확인(paid=true) 시 `LP.paid_in` 자동 갱신** → FundsPage 조합카드 납입현황, FundOverviewPage 자동 반영
6. **출자 등록 시 성과지표(IRR/TVPI 등) 자동 반영** — `performance.py`가 CapitalCall을 cashflow로 사용하므로 추가 작업 불필요
7. **출자 요청 후 공문 생성 연동** — 위자드 Step 4에서 "출자요청 공문 생성" 옵션 제공

### 전체 흐름

```
┌──────────────────────────────────────────────────────────┐
│  조합투자 → 조합 세부카드 → 출자 이력                       │
│                                                          │
│  [출자이력 테이블]                                         │
│  ┌─────────┬────────┬──────────┬──────────┬────────┐      │
│  │ 차수    │ 납입일  │ 납입금액  │ 납입비율  │ 비고   │      │
│  ├─────────┼────────┼──────────┼──────────┼────────┤      │
│  │ 최초결성 │ 25.04.10│ 30억    │ 30%     │ 최초   │      │
│  │ 1차 ►   │ 25.07.15│ 20억    │ 20%     │ 추가   │ ← 클릭 │
│  │ 2차 ►   │ 25.12.01│ 30억    │ 30%     │ 추가   │      │
│  ├─────────┼────────┼──────────┼──────────┼────────┤      │
│  │ 합계    │        │ 80억    │ 80%     │        │      │
│  └─────────┴────────┴──────────┴──────────┴────────┘      │
│                                                          │
│  [+ 출자 요청] ← 버튼                                     │
│                                                          │
│  ▼ 클릭 시 위자드 모달 열림                                │
│  ┌────────────────────────────────────────┐               │
│  │ Step 1/4: 납입일 · 통지기간             │               │
│  │                                        │               │
│  │ 납입일:   [2026-03-15]                  │               │
│  │ 출자유형: [수시출자 ▼]                    │               │
│  │ 통지기간: capital_call_additional = 10일  │               │
│  │ 발송 마감: 2026-03-05                   │               │
│  │ ⚠️ 통지기간이 부족합니다!  (선택적 경고)   │               │
│  │                          [다음 →]       │               │
│  └────────────────────────────────────────┘               │
│  ┌────────────────────────────────────────┐               │
│  │ Step 2/4: 출자 비율 · 금액              │               │
│  │                                        │               │
│  │ 총 약정금액: 100억                       │               │
│  │ 기 납입:    80억 (80%)                   │               │
│  │ 잔여 약정:  20억 (20%)                   │               │
│  │                                        │               │
│  │ 요청 비율: [20] %                        │               │
│  │ 요청 금액: 20억                          │               │
│  │                          [← 이전] [다음 →]│              │
│  └────────────────────────────────────────┘               │
│  ┌────────────────────────────────────────┐               │
│  │ Step 3/4: LP별 요청 금액                │               │
│  │                                        │               │
│  │ ┌──────┬──────────┬──────────┬────────┐│               │
│  │ │ LP명 │ 약정금액  │ 요청금액  │ 비율   ││               │
│  │ ├──────┼──────────┼──────────┼────────┤│               │
│  │ │ A 기관│ 30억    │ 6억      │ 20%   ││               │
│  │ │ B 기관│ 20억    │ 4억      │ 20%   ││               │
│  │ │ C GP │ 10억    │ 2억      │ 20%   ││               │
│  │ │ ...  │         │ [수정가능]│        ││               │
│  │ ├──────┼──────────┼──────────┼────────┤│               │
│  │ │ 합계  │ 100억   │ 20억     │ 20%   ││               │
│  │ └──────┴──────────┴──────────┴────────┘│               │
│  │                          [← 이전] [다음 →]│              │
│  └────────────────────────────────────────┘               │
│  ┌────────────────────────────────────────┐               │
│  │ Step 4/4: 최종 확인                     │               │
│  │                                        │               │
│  │ 납입일: 2026-03-15                      │               │
│  │ 출자유형: 수시출자                       │               │
│  │ 발송마감: 2026-03-05                    │               │
│  │ 요청 비율: 20% (20억)                    │               │
│  │ 대상 LP: 5명                            │               │
│  │                                        │               │
│  │                      [← 이전] [등록]     │               │
│  └────────────────────────────────────────┘               │
└──────────────────────────────────────────────────────────┘
```

---

## Part 1 — 출자 요청 위자드 (프론트엔드)

> **위치:** `FundDetailPage.tsx` 에 모달 컴포넌트 추가

### 1-A. 출자 이력 영역에 "출자 요청" 버튼 추가

```tsx
// FundDetailPage.tsx — 출자 이력 테이블 하단에 추가
<div className="card-base">
  <div className="flex items-center justify-between mb-2">
    <h3 className="text-sm font-semibold text-gray-700">출자 이력</h3>
    <button
      onClick={() => setShowCapCallWizard(true)}
      className="primary-btn inline-flex items-center gap-1 text-xs"
    >
      <Plus size={14} />
      출자 요청
    </button>
  </div>
  {/* 기존 테이블 */}
</div>
```

### 1-B. 위자드 모달 — `CapitalCallWizard`

4단계 스텝으로 구성. **같은 파일 내** 또는 별도 컴포넌트로 분리.

```tsx
interface CapCallWizardProps {
  fund: FundDetail          // 조합 상세 정보
  lps: LP[]                 // LP 목록
  noticePeriods: FundNoticePeriod[]  // 통지기간 목록
  existingCalls: CapitalCall[]      // 기존 출자 이력 (차수 번호 계산용)
  onClose: () => void
  onSubmit: (data: CapitalCallCreate, items: CapitalCallItemCreate[]) => void
}
```

#### Step 1: 납입일 · 통지기간 확인

```tsx
// 상태
const [callDate, setCallDate] = useState('')  // 납입일
const [callType, setCallType] = useState('additional')  // 출자 유형

// 통지기간 자동 계산
const noticePeriod = useMemo(() => {
  const typeKey = callType === 'initial' ? 'capital_call_initial' : 'capital_call_additional'
  const found = noticePeriods.find(np => np.notice_type === typeKey)
  return found?.business_days ?? 10  // 기본 10일
}, [callType, noticePeriods])

// 발송 마감일 = 납입일 - 통지기간 (영업일 기준)
const sendDeadline = useMemo(() => {
  if (!callDate) return null
  return subtractBusinessDays(new Date(callDate), noticePeriod)
}, [callDate, noticePeriod])

// 경고: 오늘이 발송 마감일 이후이면 통지기간 부족 경고
const isLateNotice = useMemo(() => {
  if (!sendDeadline) return false
  return new Date() > sendDeadline
}, [sendDeadline])
```

```tsx
// UI
<div className="space-y-4">
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">납입일</label>
    <input type="date" value={callDate} onChange={e => setCallDate(e.target.value)}
      className="w-full rounded border px-3 py-2 text-sm" />
  </div>
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">출자 유형</label>
    <select value={callType} onChange={e => setCallType(e.target.value)}
      className="w-full rounded border px-3 py-2 text-sm">
      <option value="initial">최초 출자</option>
      <option value="additional">수시 출자</option>
      <option value="regular">정기 출자</option>
    </select>
  </div>
  <div className="rounded-lg bg-blue-50 p-3 text-sm">
    <p className="text-blue-700">통지기간: {noticePeriod}영업일</p>
    <p className="text-blue-700">발송 마감: {sendDeadline ? formatDate(sendDeadline) : '-'}</p>
  </div>
  {isLateNotice && (
    <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
      ⚠️ 오늘 기준 통지기간이 부족합니다. 규약 위반 가능성이 있습니다.
    </div>
  )}
</div>
```

#### Step 2: 출자 비율 · 금액

```tsx
const [requestPercent, setRequestPercent] = useState<number>(0)  // 요청 비율 %

const commitmentTotal = fund.commitment_total || 0
const existingPaidIn = existingCalls.reduce((sum, c) => sum + (c.total_amount || 0), 0)
  + initialPaidIn  // 최초 결성 포함
const remainingCommitment = commitmentTotal - existingPaidIn
const remainingPercent = commitmentTotal ? Math.round((remainingCommitment / commitmentTotal) * 100) : 0

const requestAmount = Math.round(commitmentTotal * (requestPercent / 100))
```

```tsx
<div className="space-y-4">
  <div className="grid grid-cols-3 gap-3">
    <div className="rounded-lg bg-gray-50 p-3">
      <p className="text-xs text-gray-500">총 약정금액</p>
      <p className="text-sm font-semibold text-gray-800">{formatKRW(commitmentTotal)}</p>
    </div>
    <div className="rounded-lg bg-gray-50 p-3">
      <p className="text-xs text-gray-500">기 납입</p>
      <p className="text-sm font-semibold text-gray-800">
        {formatKRW(existingPaidIn)} ({commitmentTotal ? Math.round((existingPaidIn / commitmentTotal) * 100) : 0}%)
      </p>
    </div>
    <div className="rounded-lg bg-emerald-50 p-3">
      <p className="text-xs text-emerald-600">잔여 약정</p>
      <p className="text-sm font-semibold text-emerald-700">
        {formatKRW(remainingCommitment)} ({remainingPercent}%)
      </p>
    </div>
  </div>

  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">요청 비율 (%)</label>
    <div className="flex items-center gap-3">
      <input type="number" min={0} max={remainingPercent} step={1}
        value={requestPercent} onChange={e => setRequestPercent(Number(e.target.value))}
        className="w-28 rounded border px-3 py-2 text-sm" />
      <span className="text-sm text-gray-500">%</span>
      <span className="text-sm font-medium text-gray-800">= {formatKRW(requestAmount)}</span>
    </div>
  </div>

  {requestPercent > remainingPercent && (
    <p className="text-xs text-red-500">⚠️ 잔여 약정({remainingPercent}%)을 초과하는 비율입니다.</p>
  )}
</div>
```

#### Step 3: LP별 요청 금액

```tsx
// LP별 요청 금액 자동 계산
const [lpAmounts, setLpAmounts] = useState<{ lp_id: number; lp_name: string; commitment: number; amount: number }[]>([])

useEffect(() => {
  if (step === 3) {
    setLpAmounts(lps.map(lp => ({
      lp_id: lp.id,
      lp_name: lp.name,
      commitment: lp.commitment || 0,
      amount: Math.round((lp.commitment || 0) * (requestPercent / 100)),
    })))
  }
}, [step, lps, requestPercent])

const lpTotal = lpAmounts.reduce((sum, lp) => sum + lp.amount, 0)
```

```tsx
<div className="space-y-3">
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-xs text-gray-500">
        <tr>
          <th className="px-3 py-2 text-left">LP명</th>
          <th className="px-3 py-2 text-right">약정금액</th>
          <th className="px-3 py-2 text-right">요청금액</th>
          <th className="px-3 py-2 text-right">비율</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {lpAmounts.map((lp, i) => (
          <tr key={lp.lp_id}>
            <td className="px-3 py-2">{lp.lp_name}</td>
            <td className="px-3 py-2 text-right">{formatKRW(lp.commitment)}</td>
            <td className="px-3 py-2 text-right">
              <input type="number" value={lp.amount}
                onChange={e => {
                  const updated = [...lpAmounts]
                  updated[i] = { ...updated[i], amount: Number(e.target.value) }
                  setLpAmounts(updated)
                }}
                className="w-28 rounded border px-2 py-1 text-right text-sm" />
            </td>
            <td className="px-3 py-2 text-right text-gray-500">
              {lp.commitment ? `${((lp.amount / lp.commitment) * 100).toFixed(1)}%` : '-'}
            </td>
          </tr>
        ))}
        <tr className="bg-gray-50 font-semibold">
          <td className="px-3 py-2">합계</td>
          <td className="px-3 py-2 text-right">{formatKRW(commitmentTotal)}</td>
          <td className="px-3 py-2 text-right">{formatKRW(lpTotal)}</td>
          <td className="px-3 py-2 text-right">
            {commitmentTotal ? `${((lpTotal / commitmentTotal) * 100).toFixed(1)}%` : '-'}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

#### Step 4: 최종 확인 · 등록

```tsx
<div className="space-y-4">
  <div className="rounded-lg bg-gray-50 p-4 space-y-2 text-sm">
    <div className="flex justify-between"><span className="text-gray-500">납입일</span><span>{callDate}</span></div>
    <div className="flex justify-between"><span className="text-gray-500">출자유형</span><span>{labelCallType(callType)}</span></div>
    <div className="flex justify-between"><span className="text-gray-500">발송 마감</span><span>{sendDeadline ? formatDate(sendDeadline) : '-'}</span></div>
    <div className="flex justify-between"><span className="text-gray-500">요청 비율</span><span>{requestPercent}%</span></div>
    <div className="flex justify-between"><span className="text-gray-500">요청 금액</span><span className="font-semibold">{formatKRW(lpTotal)}</span></div>
    <div className="flex justify-between"><span className="text-gray-500">대상 LP</span><span>{lpAmounts.length}명</span></div>
  </div>

  {isLateNotice && (
    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
      ⚠️ 통지기간이 부족하지만 등록은 가능합니다. 규약을 확인하세요.
    </div>
  )}
</div>
```

#### 등록 로직

"등록" 버튼 클릭 시:

```tsx
const handleSubmit = async () => {
  // 1. CapitalCall 생성
  const capitalCall = await createCapitalCall({
    fund_id: fund.id,
    call_date: callDate,
    call_type: callType,
    total_amount: lpTotal,
    memo: `${requestPercent}% 출자 요청`,
  })

  // 2. CapitalCallItem 일괄 생성 (LP별)
  for (const lp of lpAmounts) {
    await createCapitalCallItem(capitalCall.id, {
      lp_id: lp.lp_id,
      amount: lp.amount,
      paid: false,
      paid_date: null,
    })
  }

  // 3. 쿼리 무효화 + 모달 닫기
  queryClient.invalidateQueries({ queryKey: ['capitalCalls', fund.id] })
  queryClient.invalidateQueries({ queryKey: ['fund', fund.id] })
  addToast('success', `${requestPercent}% 출자 요청이 등록되었습니다.`)
  onClose()
}
```

### 1-C. 영업일 계산 유틸리티

```tsx
// 간단한 영업일 계산 (주말 제외, 공휴일 미포함)
function subtractBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let remaining = days
  while (remaining > 0) {
    result.setDate(result.getDate() - 1)
    const dayOfWeek = result.getDay()
    if (dayOfWeek !== 0 && dayOfWeek !== 6) remaining--  // 주말 제외
  }
  return result
}
```

---

## Part 2 — 백엔드 모델 확장 + API 보강

### 2-A. CapitalCall 모델에 `request_percent` 필드 추가

현재 `CapitalCall` 에는 요청 비율 정보가 없음. 추가:

```python
# backend/models/phase3.py — CapitalCall 수정
class CapitalCall(Base):
    __tablename__ = "capital_calls"

    # 기존 필드 ...
    request_percent = Column(Float, nullable=True)  # 신규: 약정 대비 요청 비율 (%)
```

### 2-B. 스키마 수정

```python
# backend/schemas/phase3.py

class CapitalCallCreate(BaseModel):
    fund_id: int
    call_date: date
    call_type: str
    total_amount: float = 0
    request_percent: Optional[float] = None   # 신규
    memo: Optional[str] = None

class CapitalCallUpdate(BaseModel):
    # ... 기존 + 추가
    request_percent: Optional[float] = None   # 신규

class CapitalCallResponse(BaseModel):
    id: int
    fund_id: int
    call_date: date
    call_type: str
    total_amount: float
    request_percent: Optional[float] = None   # 신규
    memo: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}
```

### 2-C. API — 출자 요청 일괄 등록 엔드포인트 (선택)

LP별 항목을 하나씩 POST 하는 대신, 한 번에 등록하는 **Batch API** 추가:

```python
# backend/routers/capital_calls.py — 추가

class CapitalCallBatchCreate(BaseModel):
    fund_id: int
    call_date: date
    call_type: str
    total_amount: float
    request_percent: float | None = None
    memo: str | None = None
    items: list[CapitalCallItemCreate]  # LP별 항목 일괄

@router.post("/api/capital-calls/batch", response_model=CapitalCallResponse, status_code=201)
def create_capital_call_batch(data: CapitalCallBatchCreate, db: Session = Depends(get_db)):
    """출자 요청 + LP별 항목 일괄 등록"""
    _ensure_fund(db, data.fund_id)

    call = CapitalCall(
        fund_id=data.fund_id,
        call_date=data.call_date,
        call_type=data.call_type,
        total_amount=data.total_amount,
        request_percent=data.request_percent,
        memo=data.memo,
    )
    db.add(call)
    db.flush()  # call.id 확보

    for item_data in data.items:
        lp = db.get(LP, item_data.lp_id)
        if not lp:
            raise HTTPException(404, f"LP {item_data.lp_id} not found")
        if lp.fund_id != data.fund_id:
            raise HTTPException(409, "LP must belong to the same fund")
        item = CapitalCallItem(
            capital_call_id=call.id,
            lp_id=item_data.lp_id,
            amount=item_data.amount,
            paid=1 if item_data.paid else 0,
            paid_date=item_data.paid_date,
        )
        db.add(item)

    db.commit()
    db.refresh(call)
    return call
```

### 2-D. API — 출자 이력 통계 엔드포인트

FundDetailPage에서 출자 이력 요약을 효율적으로 보여주기 위한 API:

```python
@router.get("/api/capital-calls/summary/{fund_id}")
def get_capital_call_summary(fund_id: int, db: Session = Depends(get_db)):
    """조합별 출자 이력 요약 — 차수별 납입 현황"""
    _ensure_fund(db, fund_id)
    fund = db.get(Fund, fund_id)

    calls = db.query(CapitalCall).filter(
        CapitalCall.fund_id == fund_id
    ).order_by(CapitalCall.call_date.asc()).all()

    result = []
    for i, call in enumerate(calls):
        items = db.query(CapitalCallItem).filter(
            CapitalCallItem.capital_call_id == call.id
        ).all()

        paid_count = sum(1 for item in items if item.paid)
        total_count = len(items)
        paid_amount = sum(item.amount for item in items if item.paid)

        result.append({
            "id": call.id,
            "round": i + 1,                          # N차
            "call_date": str(call.call_date),         # 요청일
            "call_type": call.call_type,
            "total_amount": call.total_amount,
            "request_percent": call.request_percent,
            "paid_count": paid_count,
            "total_count": total_count,
            "paid_amount": paid_amount,
            "commitment_ratio": round((call.total_amount / fund.commitment_total) * 100, 1) if fund.commitment_total else 0,
            "memo": call.memo,
        })

    return {
        "fund_id": fund_id,
        "commitment_total": fund.commitment_total,
        "total_paid_in": sum(c["paid_amount"] for c in result),
        "calls": result,
    }
```

### 2-E. DB 마이그레이션

```
alembic revision --autogenerate -m "add request_percent to capital_calls"
alembic upgrade head
```

---

## Part 3 — 출자이력 차수별 상세 보기 (FundDetailPage)

### 3-A. 차수 행 클릭 시 상세 모달/드로어

출자이력 테이블의 차수명(`1차 캐피탈콜` 등)을 **클릭 가능**하게 변경.

```tsx
// FundDetailPage.tsx — 출자이력 tbody
{sortedCapitalCalls.map((call, index) => (
  <tr key={call.id} className="cursor-pointer hover:bg-gray-50"
      onClick={() => setExpandedCallId(expandedCallId === call.id ? null : call.id)}>
    <td className="px-3 py-2">
      <span className="text-blue-600 hover:underline">
        {index + 1}차 캐피탈콜 ▸
      </span>
    </td>
    <td className="px-3 py-2">{call.call_date || '-'}</td>
    <td className="px-3 py-2 text-right">{formatKRW(call.total_amount || 0)}</td>
    <td className="px-3 py-2 text-right">
      {fundDetail.commitment_total ? `${(((call.total_amount || 0) / fundDetail.commitment_total) * 100).toFixed(1)}%` : '-'}
    </td>
    <td className="px-3 py-2 text-gray-500">{call.memo || call.call_type || '-'}</td>
  </tr>
))}
```

### 3-B. 상세 패널 (인라인 확장 또는 모달)

```tsx
// 차수 클릭 시 아래로 확장되는 상세 패널
{expandedCallId === call.id && (
  <tr>
    <td colSpan={5} className="px-3 py-3 bg-blue-50/50">
      <CapitalCallDetail capitalCallId={call.id} commitmentTotal={fundDetail.commitment_total || 0} />
    </td>
  </tr>
)}
```

```tsx
// CapitalCallDetail 컴포넌트
function CapitalCallDetail({ capitalCallId, commitmentTotal }: { capitalCallId: number; commitmentTotal: number }) {
  const { data: items } = useQuery({
    queryKey: ['capitalCallItems', capitalCallId],
    queryFn: () => fetchCapitalCallItems(capitalCallId),
  })

  if (!items) return <p className="text-xs text-gray-400">로딩중...</p>

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-600">LP별 납입 상세</p>
      <table className="w-full text-xs">
        <thead className="bg-white text-gray-500">
          <tr>
            <th className="px-2 py-1 text-left">LP명</th>
            <th className="px-2 py-1 text-right">요청금액</th>
            <th className="px-2 py-1 text-right">약정 대비 %</th>
            <th className="px-2 py-1 text-center">납입여부</th>
            <th className="px-2 py-1 text-left">납입일</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map(item => (
            <tr key={item.id}>
              <td className="px-2 py-1">{item.lp_name}</td>
              <td className="px-2 py-1 text-right">{formatKRW(item.amount)}</td>
              <td className="px-2 py-1 text-right">
                {commitmentTotal ? `${((item.amount / commitmentTotal) * 100).toFixed(1)}%` : '-'}
              </td>
              <td className="px-2 py-1 text-center">
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${item.paid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {item.paid ? '납입' : '미납'}
                </span>
              </td>
              <td className="px-2 py-1 text-gray-500">{item.paid_date || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

---

## Part 4 — 조합운영 페이지 연동 (FundOperationsPage)

### 4-A. 출자 섹션에서 동일한 차수별 상세 보기

`FundOperationsPage.tsx`의 기존 `callExpandedId` 메커니즘에 **CapitalCallDetail 컴포넌트** 재사용:

```tsx
{callExpandedId === row.id && (
  <div className="mt-2 rounded bg-gray-50 p-2 space-y-2">
    <CapitalCallDetail capitalCallId={row.id} commitmentTotal={fundCommitmentTotal} />

    {/* 기존 LP 항목 추가/수정/삭제 UI도 유지 */}
    <div className="border-t pt-2 mt-2">
      <p className="text-xs font-semibold text-gray-500 mb-1">LP 항목 관리</p>
      {/* 기존 newCallItem 등 코드 유지 */}
    </div>
  </div>
)}
```

### 4-B. 공유 컴포넌트로 분리

`CapitalCallDetail`을 별도 파일로 분리하여 두 페이지에서 import:

```
frontend/src/components/CapitalCallDetail.tsx  [NEW]
```

---

---

## Part 5 — 연계 시스템 동기화

> **핵심:** 출자 요청은 여러 시스템에 걸쳐 데이터가 연동되므로, 누락 없이 동기화해야 한다.

### 5-A. LP.paid_in ↔ CapitalCallItem.paid 동기화

**현재 구조:** FundsPage 조합카드의 `납입현황`은 `LP.paid_in` 합산값을 표시. 이 값은 `backend/routers/funds.py`의 `list_funds` API에서 계산.
```python
paid_in_totals = {
    int(fund_id): float(total or 0)
    for fund_id, total in (
        db.query(LP.fund_id, func.coalesce(func.sum(LP.paid_in), 0))
        .group_by(LP.fund_id)
        .all()
    )
}
```

**필요한 동기화:** `FundOperationsPage`에서 CapitalCallItem의 `paid` 상태를 `true`로 변경할 때, 해당 LP의 `paid_in` 값도 자동 갱신되어야 함.

```python
# backend/routers/capital_calls.py — update_capital_call_item 수정
def update_capital_call_item(...):
    # ... 기존 로직 ...
    
    # 납입 상태 변경 시 LP.paid_in 자동 갱신
    if "paid" in payload:
        lp = db.get(LP, row.lp_id)
        if payload["paid"] and not row.paid:  # 미납 → 납입
            lp.paid_in = (lp.paid_in or 0) + row.amount
        elif not payload["paid"] and row.paid:  # 납입 → 미납 (취소)
            lp.paid_in = max(0, (lp.paid_in or 0) - row.amount)
    
    # ... 나머지 로직 ...
```

**영향 범위:**
- ✅ `FundsPage` 조합카드 납입현황 자동 갱신
- ✅ `FundOverviewPage` 납입총액/납입비율 자동 갱신
- ✅ `FundOperationsPage` 성과지표(paid_in_total) 자동 갱신
- ✅ `FundDetailPage` LP 목록의 납입액 자동 갱신

### 5-B. IRR/성과지표 연동 (자동 — 추가 작업 불필요)

`performance.py`가 이미 `CapitalCall`을 cashflow로 사용:
```python
capital_calls = db.query(CapitalCall).filter(CapitalCall.fund_id == fund_id, ...)
for row in capital_calls:
    cashflows.append((row.call_date, -amount))  # 출자를 음(-)의 cashflow로
```
→ 새로운 출자 요청 등록 시 IRR/TVPI/DPI/RVPI **자동 반영**. 추가 코드 불필요.

### 5-C. 출자 요청 공문 생성 연동

위자드 Step 4(최종 확인)에서 **"출자요청 공문 생성"** 체크박스 옵션 제공:

```tsx
// Step 4 최종확인 UI
<div className="mt-3">
  <label className="flex items-center gap-2 text-sm">
    <input type="checkbox" checked={generateDoc} onChange={e => setGenerateDoc(e.target.checked)} />
    출자금 납입 요청 공문 자동 생성
  </label>
  {generateDoc && (
    <p className="ml-6 text-xs text-gray-500 mt-1">
      등록 후 문서 생성 페이지로 이동합니다. (템플릿: 출자금 납입 요청)
    </p>
  )}
</div>
```

등록 완료 후 `generateDoc`이 true이면:
```tsx
if (generateDoc) {
  navigate(`/documents/generate?template=capital_call&fund_id=${fund.id}&call_id=${capitalCall.id}`)
}
```

### 5-D. 대시보드 연동 (선택사항 — Phase 19로 분리 가능)

대시보드의 "진행 중 워크플로우" 영역에 미납 출자 요청 알림 표시.
→ 이 기능은 Phase 18 범위가 과도해질 수 있으므로, 필요 시 Phase 19로 분리.

---

## Files to create / modify

| # | Type | File | Changes |
|---|------|------|---------|
| 1 | **[MODIFY]** | `backend/models/phase3.py` | `CapitalCall`에 `request_percent` 컬럼 추가 |
| 2 | **[MODIFY]** | `backend/schemas/phase3.py` | Create/Update/Response 스키마에 `request_percent` 추가. `CapitalCallBatchCreate` 신규 |
| 3 | **[MODIFY]** | `backend/routers/capital_calls.py` | `POST /batch` 일괄등록 API, `GET /summary/{fund_id}` 통계 API 추가, `update_capital_call_item`에 LP.paid_in 동기화 로직 추가 |
| 4 | **[NEW]** | Alembic migration | `request_percent` 컬럼 추가 |
| 5 | **[MODIFY]** | `frontend/src/pages/FundDetailPage.tsx` | "출자 요청" 버튼, 위자드 모달, 차수 클릭 상세 패널, 공문 생성 연동 |
| 6 | **[MODIFY]** | `frontend/src/pages/FundOperationsPage.tsx` | `CapitalCallDetail` 컴포넌트 연동 |
| 7 | **[NEW]** | `frontend/src/components/CapitalCallDetail.tsx` | LP별 납입 상세 테이블 공유 컴포넌트 |
| 8 | **[MODIFY]** | `frontend/src/lib/api.ts` | `createCapitalCallBatch`, `fetchCapitalCallSummary` API 함수 + 타입 추가 |

---

## Acceptance Criteria

### Part 1: 출자 요청 위자드
- [ ] AC-01: FundDetailPage 출자이력 영역에 "출자 요청" 버튼 표시
- [ ] AC-02: 위자드 Step 1 — 납입일 입력 시 통지기간(영업일) 기반 발송마감일 자동 계산
- [ ] AC-03: 위자드 Step 1 — 통지기간 부족 시 경고 메시지 표시
- [ ] AC-04: 위자드 Step 2 — 총 약정금액/기납입/잔여약정 요약 카드 표시
- [ ] AC-05: 위자드 Step 2 — 요청 비율(%) 입력 시 요청 금액 자동 계산
- [ ] AC-06: 위자드 Step 3 — LP 목록에 약정금액 × 요청비율로 LP별 금액 자동 산출
- [ ] AC-07: 위자드 Step 3 — LP별 금액 직접 수정 가능
- [ ] AC-08: 위자드 Step 4 — 최종 요약 확인 후 등록 시 CapitalCall + CapitalCallItem 일괄 생성
- [ ] AC-09: 위자드 Step 4 — "출자요청 공문 생성" 옵션 체크 시 등록 후 문서 생성 페이지로 이동
- [ ] AC-10: 등록 후 출자이력 테이블 자동 갱신

### Part 2: 백엔드
- [ ] AC-11: `CapitalCall` 모델에 `request_percent` 컬럼 정상 추가
- [ ] AC-12: `POST /api/capital-calls/batch` — CapitalCall + Items 일괄 등록
- [ ] AC-13: `GET /api/capital-calls/summary/{fund_id}` — 차수별 납입 현황 반환

### Part 3: 차수별 상세
- [ ] AC-14: 출자이력 차수명 클릭 시 LP별 상세 패널 확장
- [ ] AC-15: LP별 상세에 LP명, 요청금액, 약정 대비 %, 납입여부, 납입일 표시
- [ ] AC-16: FundOperationsPage에서도 동일한 LP별 상세 열람 가능

### Part 5: 연계 시스템
- [ ] AC-17: CapitalCallItem paid 변경 시 LP.paid_in 자동 갱신
- [ ] AC-18: LP.paid_in 갱신 후 FundsPage 조합카드 납입현황에 자동 반영
- [ ] AC-19: 새 출자 등록 후 성과지표(IRR/TVPI) 조회 시 자동 반영 확인
- [ ] AC-20: 위자드에서 "출자요청 공문 생성" 옵션 선택 시 문서 생성 페이지로 정상 이동

### 일반
- [ ] AC-21: 프론트엔드 빌드 성공
- [ ] AC-22: 기존 CapitalCall CRUD API 회귀 테스트 통과

---

## 구현 주의사항

1. **기존 API 하위호환:** `request_percent`는 `nullable=True`이므로 기존 데이터에 영향 없음. 기존 CRUD API도 그대로 동작.
2. **영업일 계산:** 현재는 주말만 제외. 향후 한국 공휴일 처리가 필요할 수 있으며, Phase 18에서는 주말만 제외하는 간단한 방식으로 구현.
3. **CapitalCallDetail 컴포넌트:** FundDetailPage와 FundOperationsPage 사이에서 공유하도록 `components/` 하위에 분리.
4. **위자드 상태 관리:** Step 간 이동 시 이전 Step의 입력값 유지. 모달 닫기 시 상태 초기화.
5. **LP.paid_in 업데이트 시점:**
   - 출자 **요청 등록** 시 → LP의 `paid_in` **미갱신** (아직 납입 전)
   - 출자 항목 **paid=true** 변경 시 → LP의 `paid_in` **자동 갱신** (백엔드 `update_capital_call_item`에서 처리)
   - 이 동기화로 `FundsPage 조합카드`, `FundOverviewPage`, `performance API` 모두 자동 반영
6. **포맷 함수:** `formatKRW`, `formatDate` 등 기존 유틸리티 함수 재사용. 새로 만들지 않음.
7. **IRR 자동 반영:** `performance.py`가 이미 `CapitalCall.call_date` + `total_amount`를 cashflow로 사용하므로, 새 출자 등록만으로 IRR/TVPI/DPI 자동 반영. 추가 코드 불필요.
8. **문서 템플릿 연동:** 위자드 완료 후 공문 생성은 기존 `TemplateManagementPage`의 템플릿을 활용. query parameter로 fund_id + call_id 전달.
9. **대시보드 연동:** 미납 출자 알림 등은 범위 초과 시 Phase 19로 분리.

---

**Last updated:** 2026-02-17
