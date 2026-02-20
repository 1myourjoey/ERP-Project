# Phase 20_2: 대시보드·업무보드 UX 개선 + 조합운영 LP 총괄관리 + LP 양수양도 + 고유계정

> **Priority:** P0

---

## Table of Contents

1. [Part 1 — 업무보드 AddTaskForm 입력 레이블 추가](#part-1)
2. [Part 2 — 대시보드 빠른추가 내일 날짜 반영](#part-2)
3. [Part 3 — 파이프라인 뷰 1페이지 최적화](#part-3)
4. [Part 4 — 워크플로 카드 4건 제한 + 스크롤](#part-4)
5. [Part 5 — 조합운영 탭 LP 총괄관리](#part-5)
6. [Part 6 — LP 양수양도 워크플로우](#part-6)
7. [Part 7 — 조합관리 고유계정(GP 법인) 카드](#part-7)
8. [Files to create / modify](#files-to-create--modify)
9. [Acceptance Criteria](#acceptance-criteria)
10. [구현 주의사항](#구현-주의사항)

---

## 현재 상태 분석

### 업무보드 AddTaskForm (TaskBoardPage.tsx L232-401)
- **문제:** input에 레이블 없이 placeholder만 사용 (작업 제목, 날짜, 시간, 관련조합, 워크플로 템플릿)
- **비교:** EditTaskModal(L403-566)은 모든 필드에 `<label>` 태그 구현되어 있음
- 폼 구조: 제목 input → 날짜+시간+예상시간 row → 관련조합+워크플로 템플릿 row → 추가 버튼

### 대시보드 QuickAddTaskModal (DashboardPage.tsx L201-241)
- `openQuickAdd` (L323): `target === 'tomorrow'` 시 `addDays(date, 1)` 사용 → 내일 날짜 전달
- QuickAddTaskModal은 `defaultDate` prop으로 마감일 설정
- **상태:** 날짜 전달 자체는 `addDays`로 구현되어 있으나, 실제 동작 검증 필요. `addDays` 함수가 정확히 +1일을 반환하는지, 그리고 업무 생성 시 해당 날짜가 `deadline`으로 저장되는지 확인

### 파이프라인 뷰 (TaskPipelineView.tsx, 259줄)
- 5컬럼(대기/오늘/이번주/예정/완료) + 하단 "워크플로우 진행현황" 섹션(L220-255)
- 각 컬럼 `min-h-[420px]` → 업무 많으면 세로 스크롤 발생
- 워크플로우 연결 task가 개별 카드로 표시 → 화면 초과 원인

### 대시보드 워크플로 카드 (DashboardPage.tsx L371-396)
- `max-h-[340px] overflow-y-auto` → 스크롤 있으나 건수 제한 없음
- 2열 그리드 (`grid-cols-1 md:grid-cols-2`)

### LP 모델 (backend/models/fund.py L50-61)
- 현재 필드: `id, fund_id, name, type, commitment, paid_in, contact`
- **누락 필드:** 사업자등록번호(또는 생년월일), LP 주소
- FundsPage LP 입력(L184-254): name/type/commitment/paid_in/contact만 수집

### FundOperationsPage (608줄)
- 출자/배분/총회 섹션만 존재 → **LP 관리 섹션 없음**

### 고유계정(GP 법인)
- 현재 Fund 모델에 `gp` 필드(String)만 존재 — GP 법인 상세 정보 관리 기능 없음
- VC(벤처캐피탈), LLC형 VC, 신기술사업금융전문회사(신기사) 등 법인 유형 구분 필요

---

## Part 1 — 업무보드 AddTaskForm 입력 레이블 추가

**수정 대상:** `frontend/src/pages/TaskBoardPage.tsx` `AddTaskForm` (L329-399)

EditTaskModal과 동일한 스타일로 모든 input에 `<label>` 추가:

| 필드 | 현재 | 변경 |
|------|------|------|
| 제목 | `placeholder="작업 제목"` | `<label>제목</label>` + placeholder 유지 |
| 날짜 | `type="date"` 레이블 없음 | `<label>마감일</label>` |
| 시간 | `<option value="">시간</option>` | `<label>시간</label>` + option 유지 |
| 예상시간 | TimeSelect만 | `<label>예상 시간</label>` |
| 관련조합 | `<option value="">관련 조합</option>` | `<label>관련 조합</label>` + option 유지 |
| 워크플로 템플릿 | `<option value="">워크플로 템플릿</option>` | `<label>워크플로 템플릿</label>` + option 유지 |

**구현:**

```tsx
// 변경 전 (L331-337):
<input autoFocus value={title} onChange={...} placeholder="작업 제목" className="..." />

// 변경 후:
<div>
  <label className="mb-1 block text-xs text-gray-500">제목</label>
  <input autoFocus value={title} onChange={...} placeholder="작업 제목" className="..." />
</div>

// 날짜/시간/예상시간 행 (L339-361):
<div className="flex gap-1">
  <div className="flex-1">
    <label className="mb-0.5 block text-[10px] text-gray-400">마감일</label>
    <input type="date" ... />
  </div>
  <div className="w-20">
    <label className="mb-0.5 block text-[10px] text-gray-400">시간</label>
    <select ...>...</select>
  </div>
  <div className="w-24">
    <label className="mb-0.5 block text-[10px] text-gray-400">예상 시간</label>
    <TimeSelect ... />
  </div>
</div>

// 관련조합/워크플로 행 (L362-382):
<div className="grid grid-cols-2 gap-1">
  <div>
    <label className="mb-0.5 block text-[10px] text-gray-400">관련 조합</label>
    <select ...>...</select>
  </div>
  <div>
    <label className="mb-0.5 block text-[10px] text-gray-400">워크플로 템플릿</label>
    <select ...>...</select>
  </div>
</div>
```

> **주의:** 폼이 좁은 공간(사분면 컬럼 내)에 들어가므로 label은 `text-[10px]`으로 최소 크기 유지. 기존 레이아웃 깨지지 않도록 `div` 래퍼 추가.

---

## Part 2 — 대시보드 빠른추가 내일 날짜 반영

**수정 대상:** `frontend/src/pages/DashboardPage.tsx`

**현황 확인:** `openQuickAdd` (L323):
```tsx
const openQuickAdd = (target: 'today' | 'tomorrow', fundId?) => {
  setQuickAddDefaultDate(target === 'today' ? date : addDays(date, 1))
  ...
}
```

**확인 사항:**
1. `addDays` 함수가 정확히 +1일을 반환하는지 확인 → 이미 정상이면 수정 불필요
2. **만약 별도 `addDays` 유틸이 없이 직접 날짜 계산하는 경우:** ISO 포맷(`YYYY-MM-DD`)으로 +1일 정확히 반환하도록 수정

**추가 개선:**
- QuickAddTaskModal(L211-212)에서 표시되는 `마감일: {defaultDate}` 텍스트를 좀 더 명확하게:
```tsx
// 변경 전:
<p className="mb-3 text-xs text-gray-500">마감일: {defaultDate}</p>

// 변경 후:
<p className="mb-3 text-xs text-gray-500">
  마감일: {defaultDate}
  {defaultDate !== date && <span className="ml-1 text-blue-500">(내일)</span>}
</p>
```

- 내일 카드의 빠른추가 버튼 onClick(L408)도 점검: `openQuickAdd('tomorrow')` 정확히 호출하는지 확인

---

## Part 3 — 파이프라인 뷰 1페이지 최적화

### 3-A. 전체 높이 viewport 기반

```tsx
// TaskPipelineView.tsx
// 변경 전: min-h-[420px]
// 변경 후: 컨테이너를 h-[calc(100vh-160px)]로 고정, 각 컬럼 내부만 스크롤

<div className="flex h-[calc(100vh-160px)] gap-2">
  {stageColumns.map((column) => (
    <div className="flex h-full flex-1 flex-col rounded-lg border ...">
      <div className="shrink-0 mb-2 ...">헤더</div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">카드들</div>
    </div>
  ))}
</div>
```

### 3-B. 워크플로우 연결 업무 — 대표 카드 표시

동일 워크플로우에 속한 task들을 **대표 카드 1개로 축약**:

```
변경 전: 워크플로우 소속 task 5개가 각각 별도 카드
변경 후: 대표 카드 1개
┌──────────────────────────────────────┐
│ 📋 조합결성 워크플로우                  │
│ ▸ 현재: 규약(안) 작성                  │ ← 현재 pending 단계
│ ██████▒▒▒▒  2/6                      │ ← 프로그레스 바
│ V:ON 1호                              │ ← 조합명
└──────────────────────────────────────┘
```

**구현 로직:**
1. `activeWorkflows`의 각 워크플로우를 **next_step에 해당하는 task의 deadline 기준 컬럼**에 배치
2. 해당 워크플로우에 속한 개별 task들은 컬럼에서 제외 (중복 표시 방지)
3. 대표 카드 클릭 → `onClickWorkflow(wf)` 호출 → 워크플로우 상세 페이지 이동

**워크플로우 소속 task 식별:**
- task에 `workflow_instance_id` 필드가 있으면 해당 값으로 직접 식별 (가장 정확)
- 없으면 fallback: `activeWorkflows`의 `fund_id` + task의 `fund_id` 매칭

### 3-C. 완료 컬럼 축소

완료 컬럼을 좁은 너비 + 카운트만 표시:

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────┐
│   대기   │ │   오늘   │ │ 이번 주  │ │   예정   │ │ ✅  │
│ flex-1   │ │ flex-1   │ │ flex-1   │ │ flex-1   │ │ 3건 │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └─────┘
```

유지 이유: ① 성과감(오늘 몇 건 처리) ② 잘못 완료 확인 ③ 보고 참고

### 3-D. 하단 워크플로우 진행현황 제거

`TaskPipelineView.tsx` L220-255의 워크플로우 진행현황 섹션 전체 제거. 워크플로우 정보는 3-B의 대표 카드로 파이프라인 컬럼 안에 통합.

### 3-E. 대기 업무만 모달 수정 가능

```tsx
// TaskPipelineView props 변경
onClickTask: (task: Task, options?: { editable?: boolean }) => void

// 대기 컬럼: editable: true, 나머지: editable: false
// DashboardPage에서 TaskDetailModal에 editable prop 전달
// editable === false → 읽기전용 + 안내 문구 "파이프라인에서는 대기 업무만 수정 가능"
```

---

## Part 4 — 워크플로 카드 4건 제한 + 스크롤

**수정 대상:** `DashboardPage.tsx` L371-396

```tsx
// 변경 전: max-h-[340px]
// 변경 후: max-h-[280px] (4건 = 2행 높이)

<div className="max-h-[280px] overflow-y-auto pr-1">
  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
    {active_workflows.map(wf => ...기존 카드...)}
  </div>
</div>
{active_workflows.length > 4 && (
  <div className="mt-2 text-center text-[10px] text-gray-400">
    ↓ 스크롤하여 {active_workflows.length - 4}건 더보기
  </div>
)}
```

---

## Part 5 — 조합운영 탭 LP 총괄관리

### 5-A. LP 모델 확장

**수정 대상:** `backend/models/fund.py` LP 클래스

```python
class LP(Base):
    __tablename__ = "lps"
    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    commitment = Column(Integer, nullable=True)
    paid_in = Column(Integer, nullable=True)
    contact = Column(String, nullable=True)
    # ↓ 신규 필드 ↓
    business_number = Column(String, nullable=True)   # 사업자등록번호 또는 생년월일
    address = Column(String, nullable=True)            # LP 주소
    fund = relationship("Fund", back_populates="lps")
```

### 5-B. LP 스키마 확장

**수정:** `backend/schemas/` 관련 LP 스키마에 `business_number`, `address` 추가

```python
# LP 생성/수정 스키마
class LPInput(BaseModel):
    name: str
    type: str
    commitment: Optional[int] = None
    paid_in: Optional[int] = None
    contact: Optional[str] = None
    business_number: Optional[str] = None  # 추가
    address: Optional[str] = None           # 추가

# LP 응답 스키마
class LPResponse(BaseModel):
    id: int
    fund_id: int
    name: str
    type: str
    commitment: Optional[int] = None
    paid_in: Optional[int] = None
    contact: Optional[str] = None
    business_number: Optional[str] = None  # 추가
    address: Optional[str] = None           # 추가
```

### 5-C. 프론트엔드 LP 타입 확장

**수정:** `frontend/src/lib/api.ts` — LP 관련 타입에 `business_number`, `address` 추가

### 5-D. FundsPage LP 입력 폼 확장

**수정:** `FundsPage.tsx` L184-254 — LP 입력 행에 사업자등록번호, 주소 필드 추가:

```tsx
// 기존 grid: [2fr_1.2fr_1.6fr_1.6fr_auto]
// 변경: [2fr_1.2fr_1.6fr_1.6fr_1.4fr_1.6fr_auto]

<input placeholder="사업자등록번호/생년월일" ... />
<input placeholder="주소" ... />
```

### 5-E. FundDetailPage LP 수정 폼에도 동일 적용

`FundDetailPage.tsx`의 LP 추가/수정 폼에도 `business_number`, `address` 필드 추가

### 5-F. FundOperationsPage에 LP 관리 섹션 추가

**수정 대상:** `frontend/src/pages/FundOperationsPage.tsx`

기존 "출자" 섹션 위 또는 "성과지표" 섹션 아래에 **LP 관리** 섹션 추가:

```tsx
<Section title="LP 관리">
  {/* LP 목록 테이블 */}
  <table className="w-full text-sm">
    <thead className="bg-gray-50 text-xs text-gray-500">
      <tr>
        <th>LP명</th>
        <th>유형</th>
        <th>출자약정액</th>
        <th>납입출자금</th>
        <th>사업자등록번호</th>
        <th>주소</th>
        <th>연락처</th>
        <th>관리</th>
      </tr>
    </thead>
    <tbody>
      {lps.map(lp => (
        <tr key={lp.id}>
          <td>{lp.name}</td>
          <td>{lp.type}</td>
          <td className="text-right">{formatKRW(lp.commitment)}</td>
          <td className="text-right">{formatKRW(lp.paid_in)}</td>
          <td>{lp.business_number || '-'}</td>
          <td>{lp.address || '-'}</td>
          <td>{lp.contact || '-'}</td>
          <td>
            <button className="secondary-btn">수정</button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
  
  {/* LP 합산 정보 */}
  <div className="mt-2 text-xs text-gray-500">
    LP 약정 합계: {formatKRW(lpCommitmentSum)} | 
    총 약정액: {formatKRW(fundDetail?.commitment_total)} |
    {isMatched ? '✅ 정합' : '⚠️ 차이 있음'}
  </div>
  
  {/* LP 추가/수정 인라인 편집 */}
</Section>
```

### 5-G. 연동 포인트 (모든 LP 관련 기능 유기적 연결)

| 기능 | 연동 내용 |
|------|---------|
| FundsPage 조합 생성 → LP 추가 | `business_number`, `address` 포함 |
| FundDetailPage LP 수정 | `business_number`, `address` 포함 |
| FundOperationsPage LP 관리 | 전체 LP 필드 CRUD, 출자 데이터와 연동 |
| CapitalCallDetail | LP `paid_in` 반영 시 FundOperationsPage LP 목록도 갱신 |
| LP 양수양도 (Part 6) | `business_number`, `address` 양수인 정보 입력 |

---

## Part 6 — LP 양수양도 워크플로우

### 6-A. LPTransfer DB 모델

**수정:** `backend/models/fund.py`에 추가

```python
class LPTransfer(Base):
    __tablename__ = "lp_transfers"
    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    from_lp_id = Column(Integer, ForeignKey("lps.id"), nullable=False)
    to_lp_id = Column(Integer, ForeignKey("lps.id"), nullable=True)
    to_lp_name = Column(String, nullable=True)
    to_lp_type = Column(String, nullable=True)
    transfer_amount = Column(Integer, nullable=False)
    transfer_date = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="pending")  # pending/in_progress/completed/cancelled
    workflow_instance_id = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(Date, nullable=True)
    fund = relationship("Fund")
    from_lp = relationship("LP", foreign_keys=[from_lp_id])
    to_lp = relationship("LP", foreign_keys=[to_lp_id])
```

### 6-B. LP 양수양도 API

**새 파일:** `backend/routers/lp_transfers.py`

- `POST /funds/{fund_id}/lp-transfers` — 양수양도 생성 + 워크플로우 자동 시작
- `GET /funds/{fund_id}/lp-transfers` — 이력 조회
- `PATCH /funds/{fund_id}/lp-transfers/{id}` — 상태/메모 업데이트
- `POST /funds/{fund_id}/lp-transfers/{id}/complete` — 완료 처리 (LP 지분 이전)

### 6-C. LP교체 워크플로우 템플릿 (13단계)

```
LP교체 단계:
1. 조합원총회 공문 발송 (14일 이전, 규약 체크)
2. 의안설명서 준비 (공문 전)
3. 양도양수계획서 작성 (공문 전, 보충서류 추가 가능)
4. 우선매수권 행사 확인서 (공문 전)
5. 서면결의서 준비 (공문 전)
6. 조합 규약(개정안) 작성 (공문 전)
7. 규약신구대조표 작성 (엑셀)
8. 캐피탈콜 진행 (변경등록 전, 총회 가결시 가능)

규약변경 단계:
9. 조합원총회 공문 발송 (14일 이전)
10. 의안설명서 작성 (주제별 구성)
11. 서면의결서 준비 (의결 표 구성)
12. 규약 개정본 작성 (목차, 페이지 확인)
13. 규약 신구대조표 작성 (대조, 비고 간략)
```

### 6-D. 프론트엔드 UI

- FundDetailPage LP 행에 "양수양도" 버튼
- 양수양도 모달: 양도인(자동), 양도금액, 양수인(기존/신규 LP 선택), 예정일, 비고
- 양수양도 이력 섹션 (상태 배지 + 워크플로우 링크)
- **FundOperationsPage LP 관리에도 양수양도 버튼/이력 표시**

### 6-E. 워크플로우 완료 시 LP 지분 자동 이전

`workflows.py` `complete_step()`: 워크플로우 전체 완료(all_done) + category === 'LP교체' → from_lp.commitment 감소, to_lp 생성/commitment 증가, paid_in 비율 조정

### 6-F. fund_formation.md 업데이트

`03_Workflows/fund_formation.md`에 LP 양수양도 13단계 + 완료 후 처리(등록원부 변경, 출자증서 재배포, 농금원 처리) 문서 추가

---

## Part 7 — 조합관리 고유계정(GP 법인) 카드

### 7-A. 고유계정이란

GP 법인(운용사) 자체의 정보를 관리하는 기능. 조합(Fund)과는 별개로, 조합을 운용하는 **법인** 정보임.

GP 법인 유형 종류:
- **VC (벤처캐피탈/창업투자회사):** 중소벤처기업부 등록, 벤처투자조합 운용
- **LLC형 VC (유한회사형 창업투자회사):** 유한회사 형태의 VC
- **신기사 (신기술사업금융전문회사):** 금융위 인가, 신기술사업투자조합 운용
- **KIC (한국투자공사):** 국가 투자기관
- **기타 운용사:** PEF 운용사, 부동산 운용사 등

### 7-B. GPEntity DB 모델

**새 모델:** `backend/models/gp_entity.py`

```python
class GPEntity(Base):
    """GP 법인(고유계정) 정보"""
    __tablename__ = "gp_entities"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)                    # 법인명
    entity_type = Column(String, nullable=False)             # vc / llc_vc / nksa / other
    business_number = Column(String, nullable=True)          # 사업자등록번호
    registration_number = Column(String, nullable=True)      # 등록번호 (벤처기업확인서 등)
    representative = Column(String, nullable=True)           # 대표자명
    address = Column(String, nullable=True)                  # 주소
    phone = Column(String, nullable=True)                    # 전화번호
    email = Column(String, nullable=True)                    # 이메일
    founding_date = Column(Date, nullable=True)              # 설립일
    license_date = Column(Date, nullable=True)               # 인가/등록일
    capital = Column(Float, nullable=True)                   # 자본금
    notes = Column(Text, nullable=True)                      # 비고
    is_primary = Column(Integer, nullable=False, default=1)  # 당사(primary) 여부
```

### 7-C. GPEntity API

**새 파일:** `backend/routers/gp_entities.py`

- `GET /gp-entities` — 목록 조회
- `GET /gp-entities/{id}` — 상세 조회
- `POST /gp-entities` — 등록
- `PATCH /gp-entities/{id}` — 수정
- `DELETE /gp-entities/{id}` — 삭제

### 7-D. 프론트엔드 — FundsPage 상단 고유계정 카드

**수정:** `FundsPage.tsx` 조합 목록 상단에 고유계정 카드 추가:

```tsx
// 조합 목록 위에 고유계정 카드
<div className="card-base mb-4 border-l-4 border-l-blue-500">
  <div className="flex items-center justify-between">
    <div>
      <p className="text-xs text-blue-600 font-medium">고유계정 (GP 법인)</p>
      <h3 className="text-lg font-semibold text-gray-900">{gpEntity?.name || '미등록'}</h3>
      <div className="mt-1 flex gap-3 text-xs text-gray-500">
        <span>{ENTITY_TYPE_LABEL[gpEntity?.entity_type] || '-'}</span>
        <span>{gpEntity?.business_number || '-'}</span>
        <span>{gpEntity?.representative || '-'}</span>
      </div>
    </div>
    <button onClick={() => setShowGPEdit(true)} className="secondary-btn">
      {gpEntity ? '수정' : '등록'}
    </button>
  </div>
</div>
```

GP 법인 유형 레이블:
```tsx
const ENTITY_TYPE_LABEL: Record<string, string> = {
  vc: '창업투자회사 (VC)',
  llc_vc: '유한회사형 창업투자회사',
  nksa: '신기술사업금융전문회사 (신기사)',
  other: '기타 운용사',
}
```

### 7-E. 유기적 연동

| 연동 포인트 | 구현 |
|------------|------|
| 업무보드 AddTaskForm "관련 조합" | 고유계정도 선택 가능하도록 옵션에 추가 (구분: "── 고유계정 ──" 구분선) |
| 워크플로우 인스턴스 생성 | `fund_id` 대신 `gp_entity_id` 지정 가능 (법인 업무용) |
| DashboardPage 파이프라인 뷰 | 고유계정 연결 업무도 fund_name처럼 표시 |
| FundForm GP 필드 | 고유계정 선택 dropdown으로 변경 (기존 text → select from gp_entities) |

**Task/WorkflowInstance 모델에 gp_entity_id 추가:**

```python
# backend/models/ Task 및 WorkflowInstance에
gp_entity_id = Column(Integer, ForeignKey("gp_entities.id"), nullable=True)
```

프론트엔드 API 타입에도 `gp_entity_id`, `gp_entity_name` 추가.

---

## Files to create / modify

| # | Type | File | Changes |
|---|------|------|---------|
| 1 | **[MODIFY]** | `frontend/src/pages/TaskBoardPage.tsx` | AddTaskForm 전 input에 `<label>` 추가 |
| 2 | **[MODIFY]** | `frontend/src/pages/DashboardPage.tsx` | QuickAddTaskModal 내일 날짜 확인/수정, 워크플로 카드 4건 제한, 파이프라인 editable 제어 |
| 3 | **[MODIFY]** | `frontend/src/components/TaskPipelineView.tsx` | viewport 높이, 워크플로 대표카드, 완료 축소, 하단 진행현황 제거, 대기만 editable |
| 4 | **[MODIFY]** | `backend/models/fund.py` | LP에 `business_number`/`address` 추가, `LPTransfer` 모델 추가 |
| 5 | **[NEW]** | `backend/models/gp_entity.py` | `GPEntity` 모델 |
| 6 | **[NEW]** | `backend/routers/lp_transfers.py` | LP 양수양도 CRUD + 워크플로우 연동 |
| 7 | **[NEW]** | `backend/routers/gp_entities.py` | GP 법인 CRUD API |
| 8 | **[NEW]** | `backend/schemas/lp_transfer.py` | LP 양수양도 스키마 |
| 9 | **[NEW]** | `backend/schemas/gp_entity.py` | GP 법인 스키마 |
| 10 | **[MODIFY]** | `backend/main.py` | `lp_transfers`, `gp_entities` 라우터 등록 |
| 11 | **[MODIFY]** | `backend/routers/workflows.py` | LP교체 완료 시 LP 지분 자동 이전 |
| 12 | **[MODIFY]** | `frontend/src/lib/api.ts` | LP 확장 필드, LPTransfer, GPEntity 타입/API 함수 |
| 13 | **[MODIFY]** | `frontend/src/pages/FundsPage.tsx` | LP 입력에 business_number/address, 상단 고유계정 카드 |
| 14 | **[MODIFY]** | `frontend/src/pages/FundDetailPage.tsx` | LP 수정에 확장 필드, 양수양도 모달/이력 |
| 15 | **[MODIFY]** | `frontend/src/pages/FundOperationsPage.tsx` | LP 관리 섹션 추가 (CRUD + 양수양도) |
| 16 | **[MODIFY]** | `03_Workflows/fund_formation.md` | LP 양수양도 13단계 문서 추가 |
| 17 | **[MODIFY]** | 관련 백엔드 스키마 | LP 스키마에 `business_number`/`address` 추가 |

---

## Acceptance Criteria

### Part 1: 업무보드 레이블
- [ ] AC-01: AddTaskForm 모든 input에 `<label>` 태그 존재 (제목, 마감일, 시간, 예상시간, 관련조합, 워크플로 템플릿)
- [ ] AC-02: 레이블 추가 후 기존 레이아웃 유지 (사분면 컬럼 내 깨지지 않음)

### Part 2: 빠른추가 내일 날짜
- [ ] AC-03: 내일 카드에서 빠른추가 → defaultDate가 내일 날짜(+1일)
- [ ] AC-04: 모달에 "(내일)" 표시로 사용자 확인

### Part 3: 파이프라인 1페이지
- [ ] AC-05: 파이프라인 뷰 세로 스크롤 없이 viewport 내 완결
- [ ] AC-06: 워크플로우 업무 대표 카드 1개로 축약
- [ ] AC-07: 완료 컬럼 축소 (카운트 배지)
- [ ] AC-08: 하단 워크플로우 진행현황 제거
- [ ] AC-09: 대기 업무만 모달 수정, 나머지 읽기전용

### Part 4: 워크플로 카드 4건
- [ ] AC-10: 4건 높이 제한 + 초과 시 스크롤 + 안내

### Part 5: 조합운영 LP 관리
- [ ] AC-11: LP 모델에 `business_number`, `address` 추가
- [ ] AC-12: FundOperationsPage에 LP 관리 섹션 (CRUD + 전체 필드)
- [ ] AC-13: FundsPage LP 입력에 확장 필드 포함
- [ ] AC-14: 출자 데이터와 LP 관리가 양방향 연동

### Part 6: LP 양수양도
- [ ] AC-15: LPTransfer 모델 + API 구현
- [ ] AC-16: 양수양도 모달 + 워크플로우 13단계 자동 생성
- [ ] AC-17: 이력 표시 + 워크플로우 링크
- [ ] AC-18: 워크플로우 완료 → LP 지분 자동 이전

### Part 7: 고유계정
- [ ] AC-19: GPEntity 모델 + API 구현
- [ ] AC-20: FundsPage 상단 고유계정 카드 표시
- [ ] AC-21: 업무 추가 시 "관련 조합"에 고유계정 선택 가능
- [ ] AC-22: FundForm GP 필드가 고유계정 dropdown으로 연동

### 공통
- [ ] AC-23: `npm run build` TypeScript 에러 0건
- [ ] AC-24: 백엔드 pytest 전체 통과

---

## 구현 주의사항

1. **기존 기능 보호** — 모든 수정 후 빌드·테스트 필수
2. **AddTaskForm 레이블** — 좁은 공간이므로 `text-[10px]` 사용, div 래퍼로 레이아웃 유지
3. **LP 확장 필드** — 기존 데이터 호환: `nullable=True`, 마이그레이션 시 `ALTER TABLE lps ADD COLUMN`
4. **고유계정은 법인 성격** — 조합(Fund)과 분리. 조합 목록과 별도 관리하되, 업무/워크플로우에서 fund처럼 연결 가능
5. **고유계정 유형 조사** — VC, LLC형 VC, 신기사, PEF 운용사 등 한국 VC 업계 법인 유형 반영
6. **LP 양수양도 paid_in 비율 조정** — 양도 시 paid_in도 commitment 비율에 맞춰 이전
7. **워크플로우 소속 task 그룹화** — `workflow_instance_id` 기준으로 정확히 식별
8. **FundOperationsPage LP 관리** — 기존 출자 섹션과 연동. LP paid_in 변경 시 출자 이력과 정합성 유지
9. **console.log, print 디버깅 코드 남기지 않는다**
10. **고유계정→업무 연결** — Task/WorkflowInstance 모델에 `gp_entity_id` 추가 시 기존 `fund_id` null인 업무와 구분

---

## Phase 20_2 추가 반영사항 (2026-02-18)

### 사용자 추가 요청 반영
1. 파이프라인에서 `대기` 컬럼 카드만 수정 가능하도록 유지하고, 다른 컬럼 카드는 모달에서 읽기 중심으로 확인하도록 반영.
2. 워크플로우 카드를 클릭하면 대시보드 내 단계 확인 모달(`WorkflowStageModal`)이 열리도록 연결.
3. 파이프라인의 완료 카드(`completed`) 제거 및 4열 레이아웃(`대기/오늘/이번 주/예정`)으로 정리.
4. 파이프라인 카드 배경/좌측 포인트 컬러를 테마 팔레트(blue/indigo/emerald/amber/slate)로 통일.
5. 대시보드 업무현황을 카테고리 단위로 그룹화(오늘/내일/이번주/예정/팝업 목록 포함).
6. 워크플로우 대표 단계 표출 순서 오류 수정:
   - `backend/routers/dashboard.py`: 단계 `order` 기준 정렬 후 다음 단계 계산.
   - `backend/routers/workflows.py`: 인스턴스 상세 `step_instances`를 단계 `order` 기준 정렬 반환.
7. 파이프라인 카드 클릭 시 업무 상세 모달에서 세부 확인 및 완료 처리 가능하도록 유지/보강.

### 추가 안정화
- `backend/main.py`의 SQLite 호환 컬럼 보정 로직을 강화하여 누락 컬럼(예: `capital_call_items.memo`)이 있는 DB에서도 startup 시 안전하게 보정되도록 보완.

### 관련 파일
- `frontend/src/components/TaskPipelineView.tsx`
- `frontend/src/pages/DashboardPage.tsx`
- `backend/routers/dashboard.py`
- `backend/routers/workflows.py`
- `backend/main.py`
