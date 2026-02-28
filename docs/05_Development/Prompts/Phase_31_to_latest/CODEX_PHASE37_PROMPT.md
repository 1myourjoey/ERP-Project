# Phase 37: 규제 컴플라이언스 엔진 + D-Day 기반 Task 자동생성

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> ⚠️ **비식별화 원칙:** 실존 정보 사용 금지.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P0  
**의존성:** Phase 36 (영업보고 + 사용자 모델 완료)  
**후속:** Phase 38이 VICS 월보고에서 ComplianceObligation과 연동

---

## Part 0. 전수조사 (필수)

- [ ] `models/fund.py` — Fund 모델 필드 (type, commitment_total, status 등) 확인
- [ ] `models/investment.py` — Investment 모델 (fund_id, company_id, amount, status) 확인
- [ ] `models/fund.py` — LP 모델 (fund_id, commitment, paid_in) 확인
- [ ] `models/task.py` — Task 모델 (title, deadline, quadrant, status, fund_id, investment_id) 확인
- [ ] `models/transaction.py` — Transaction 모델 (type, amount, fund_id) 확인
- [ ] `routers/investments.py` — 투자 생성 API 확인
- [ ] `routers/funds.py` — LP 관련 API 확인 (lp_transfers 포함)
- [ ] `routers/distributions.py` — 배분 관련 API 확인
- [ ] `routers/tasks.py` — Task CRUD API 시그니처 확인
- [ ] `models/__init__.py` — 전체 모델 import 패턴 확인
- [ ] `main.py` — 라우터 등록 패턴 확인

---

## Part 1. 규제 컴플라이언스 엔진 — 데이터 모델

### 1-1. 신규 모델

#### `models/compliance.py` [NEW]

```python
from datetime import datetime, date as dt_date
from sqlalchemy import (
    Boolean, Column, Date, DateTime, Float, ForeignKey,
    Integer, String, Text, UniqueConstraint
)
from sqlalchemy.orm import relationship
from database import Base


class ComplianceRule(Base):
    """가이드라인 규제 룰 마스터 — 시스템 seed 데이터"""
    __tablename__ = "compliance_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category = Column(String, nullable=False)         # "reporting" | "investment_limit" | "impairment"
    subcategory = Column(String, nullable=False)       # "periodic" | "adhoc" | "limit_same_company" | ...
    rule_code = Column(String, nullable=False, unique=True, index=True)  # "RPT-M-01", "LMT-01", ...
    title = Column(String, nullable=False)             # "VICS 월간보고"
    description = Column(Text, nullable=True)          # 상세 설명
    trigger_event = Column(String, nullable=True)      # "investment_created" | "lp_changed" | None(정기)
    frequency = Column(String, nullable=True)          # "monthly" | "quarterly" | "semi_annual" | "annual" | None(수시)
    deadline_rule = Column(String, nullable=True)      # "M+7d" | "Q+30d" | "event+5bd" 등
    target_system = Column(String, nullable=True)      # "VICS" | "농금원" | "내부" | "KiiPS"
    guideline_ref = Column(String, nullable=True)      # "농식품모태 가이드라인 제12조"
    is_active = Column(Boolean, nullable=False, default=True)
    fund_type_filter = Column(String, nullable=True)   # "농식품" | "벤처" | "all"

    obligations = relationship("ComplianceObligation", back_populates="rule")


class ComplianceObligation(Base):
    """조합별 규제 의무 인스턴스 — 룰 + 조합 조합"""
    __tablename__ = "compliance_obligations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_id = Column(Integer, ForeignKey("compliance_rules.id"), nullable=False, index=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False, index=True)

    # 기간 정보
    period_type = Column(String, nullable=True)        # "2026-01" | "2026-Q1" | "2026-H1" | None(수시)
    due_date = Column(Date, nullable=False, index=True)

    # 상태 추적
    status = Column(String, nullable=False, default="pending")
    # "pending" → "in_progress" → "completed" | "overdue" | "waived"
    completed_date = Column(Date, nullable=True)
    completed_by = Column(String, nullable=True)
    evidence_note = Column(Text, nullable=True)        # 완료 근거 메모

    # 연관 엔티티 (수시보고의 경우)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=True)

    # 자동 생성 Task 연결
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    rule = relationship("ComplianceRule", back_populates="obligations")


class InvestmentLimitCheck(Base):
    """투자 제한 사전 체크 결과 로그"""
    __tablename__ = "investment_limit_checks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False, index=True)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=True)
    check_date = Column(DateTime, nullable=False, default=datetime.utcnow)

    rule_code = Column(String, nullable=False)         # "LMT-01" ~ "LMT-05"
    check_result = Column(String, nullable=False)      # "pass" | "warning" | "block"
    current_value = Column(Float, nullable=True)       # 현재 비율/금액
    limit_value = Column(Float, nullable=True)         # 제한 비율/금액
    detail = Column(Text, nullable=True)               # 상세 계산 근거
```

### 1-2. Task 모델 확장

#### `models/task.py` [MODIFY — 확장만]

기존 필드 전부 유지. 아래 필드만 **추가**:

```python
# 컴플라이언스 연동 (기존 필드 아래에 추가)
obligation_id = Column(Integer, ForeignKey("compliance_obligations.id"), nullable=True)
auto_generated = Column(Boolean, nullable=False, default=False)
source = Column(String, nullable=True)  # "compliance_engine" | "workflow" | "manual"
```

---

## Part 2. 규제 룰 시드 데이터

### 2-1. 시드 파일

#### `seed/compliance_rules_seed.py` [NEW]

PRD §3.1.2의 전체 룰을 seed 데이터로 구현. 아래는 카테고리별 요약:

| 카테고리 | 코드 범위 | 건수 | 설명 |
|---------|----------|------|------|
| 정기 보고 | RPT-M-01 ~ RPT-A-01 | 8건 | VICS 월보고, 내부보고회, 반기 영업보고, 연간결산 |
| 수시 보고 | RPT-E-01 ~ RPT-E-06 | 6건 | 투자실행, 회수, LP변경, 규약변경, 해외투자, 배분 |
| 투자 제한 | LMT-01 ~ LMT-05 | 5건 | 동일기업 15%, 해외 20%, GP계열사, 부동산, 상장기업 |
| 손상차손 | IMP-01 ~ IMP-04 | 4건 | 자본잠식 50%, 3기 연속 적자, 2기 연속 매출감소, 공정가치하락 |
| 자산건전성 등급 | RAT-AA ~ RAT-D | 5건 | AA(정상) ~ D(부실) |

**시드 데이터 형식:**

```python
COMPLIANCE_RULES = [
    # ═══ 정기 보고 의무 ═══
    {
        "category": "reporting",
        "subcategory": "periodic",
        "rule_code": "RPT-M-01",
        "title": "VICS 월간보고 (1308 투자현황)",
        "description": "전월 투자현황을 VICS 시스템에 보고. 코드 1308.",
        "frequency": "monthly",
        "deadline_rule": "M+7d",
        "target_system": "VICS",
        "guideline_ref": "농식품모태 사후관리 가이드라인 제10조",
        "fund_type_filter": "농식품",
    },
    # ... PRD §3.1.2의 전체 28건 모두 구현
    # RPT-M-02, RPT-M-03, RPT-M-04: VICS 월보고 (1309, 1329), KiiPS
    # RPT-Q-01: 내부보고회, RPT-Q-02: 분기 서류 7종 수집
    # RPT-H-01: 반기 영업보고서, RPT-A-01: 연간 결산보고서
    # RPT-E-01~E-06: 투자실행/회수/LP변경/규약변경/해외투자/배분 수시보고
    # LMT-01~05: 투자제한 5건
    # IMP-01~04: 손상차손 4건
    # RAT-AA~D: 자산건전성 등급 5건
]

async def seed_compliance_rules(db: AsyncSession):
    """seed 실행 함수 — 중복 방지 (rule_code unique)"""
    for rule_data in COMPLIANCE_RULES:
        existing = await db.execute(
            select(ComplianceRule).where(ComplianceRule.rule_code == rule_data["rule_code"])
        )
        if not existing.scalar_one_or_none():
            db.add(ComplianceRule(**rule_data))
    await db.commit()
```

### 2-2. 시드 실행 라우터

#### `routers/admin.py` [MODIFY — 확장]

기존 admin API에 추가:

```
POST   /api/admin/seed-compliance-rules    # 규제 룰 시드 데이터 등록
  → seed_compliance_rules() 실행
  → 응답: { "seeded": 28, "skipped": 0 }
```

---

## Part 3. 컴플라이언스 엔진 (비즈니스 로직)

### 3-1. 서비스 모듈

#### `services/compliance_engine.py` [NEW]

```python
class ComplianceEngine:
    """
    1) 정기 의무 자동 생성 — 매월 1일 또는 수동 호출
    2) 수시 의무 이벤트 드리븐 — 투자/LP변경/배분 이벤트 발생 시
    3) 투자제한 사전 체크 — 투자 등록 전 자동 실행
    4) 의무 상태 자동 업데이트 — due_date 경과 시 overdue로 변경
    """

    async def generate_periodic_obligations(self, year: int, month: int):
        """매월: 해당 월의 정기 보고 의무 자동 생성"""
        # 1. 모든 active Fund 조회 (status="active")
        # 2. 각 Fund.type에 맞는 정기 룰 조회 (fund_type_filter 매칭)
        # 3. frequency 기반 생성 판단:
        #    - monthly: 매월 생성
        #    - quarterly: month in [3,6,9,12] 일 때 생성
        #    - semi_annual: month in [6,12] 일 때 생성
        #    - annual: month == 12 일 때 생성
        # 4. deadline_rule 기반 due_date 계산:
        #    - "M+7d": 해당월 1일 + 7일
        #    - "Q+30d": 분기말 + 30일
        #    - "Q+60d": 분기말 + 60일
        #    - "H+45d": 반기말 + 45일
        #    - "Y+90d": 연말 + 90일
        # 5. ComplianceObligation 레코드 생성
        # 6. 연동 Task 자동 생성 (Part 4 참조)
        pass

    async def on_investment_created(self, investment_id: int, fund_id: int):
        """투자 등록 이벤트 → RPT-E-01 수시보고 의무 생성"""
        # due_date = event_date + 5 영업일 (토/일 제외 계산)
        pass

    async def on_investment_exited(self, investment_id: int, fund_id: int):
        """투자 회수 이벤트 → RPT-E-02 수시보고 의무 생성"""
        pass

    async def on_lp_changed(self, fund_id: int, change_type: str):
        """LP 변경 이벤트 → RPT-E-03 수시보고 의무 생성"""
        # change_type: "joined" | "withdrawn" | "transferred"
        # due_date = event_date + 10 영업일
        pass

    async def on_distribution_executed(self, fund_id: int):
        """배분 실행 이벤트 → RPT-E-06 수시보고 의무 생성"""
        pass

    async def check_investment_limits(self, fund_id: int, amount: float,
                                       company_name: str, is_overseas: bool = False) -> list[dict]:
        """투자 전 제한 사전 체크 — 결과 리스트 반환"""
        results = []

        # LMT-01: 동일기업 투자한도 15%
        # → 해당 Fund의 해당 company 기투자금 합산 + 신규금액 / commitment_total
        # → 15% 초과 시 "block", 13% 초과 시 "warning", 이하 "pass"

        # LMT-02: 해외투자 한도 20% (is_overseas=True일 때만 체크)
        # → 해당 Fund의 해외투자 합산 + 신규금액 / commitment_total

        # LMT-03: GP 계열사 투자 금지 (is_affiliate 파라미터 추가 고려)

        # 각 결과를 InvestmentLimitCheck 테이블에 로그 저장
        return results

    async def update_overdue_obligations(self):
        """due_date 경과한 pending 의무를 overdue로 변경"""
        pass
```

### 3-2. 이벤트 훅 — 기존 라우터에 연동

#### `routers/investments.py` [MODIFY — 확장]

투자 생성 API 내부에 이벤트 훅 추가:
```python
# 기존 POST /api/investments 로직 끝에 추가
# await compliance_engine.on_investment_created(new_investment.id, new_investment.fund_id)
```

> ⚠️ 기존 API 시그니처 및 응답 구조 **절대 변경 금지**. 기존 로직 뒤에 `try/except`로 감싼 후속 처리로만 추가.

#### `routers/funds.py` [MODIFY — 확장]

LP 변경 관련 API에 이벤트 훅 추가:
```python
# LP 생성(가입) 시: await compliance_engine.on_lp_changed(fund_id, "joined")
# LP 삭제(탈퇴) 시: await compliance_engine.on_lp_changed(fund_id, "withdrawn")
```

#### `routers/lp_transfers.py` [MODIFY — 확장]

LP 양도 완료 시 이벤트 훅:
```python
# LP 양도 완료 처리 시: await compliance_engine.on_lp_changed(fund_id, "transferred")
```

#### `routers/distributions.py` [MODIFY — 확장]

배분 실행 시 이벤트 훅:
```python
# 배분 생성/실행 시: await compliance_engine.on_distribution_executed(fund_id)
```

#### `routers/exits.py` [MODIFY — 확장]

회수 정산 완료 시 이벤트 훅:
```python
# 정산 완료 시: await compliance_engine.on_investment_exited(investment_id, fund_id)
```

---

## Part 4. D-Day 기반 Task 자동생성

### 4-1. Task 자동생성 서비스

#### `services/task_auto_generator.py` [NEW]

```python
TASK_GENERATION_RULES = [
    # 정기 보고 — D-3 사전 알림
    {
        "rule_codes": ["RPT-M-01", "RPT-M-02", "RPT-M-03", "RPT-M-04"],
        "task_template": "VICS 월보고 ({fund_name}) — {rule_title}",
        "d_day_offset": -3,    # 마감 3일 전 Task 생성
        "quadrant": "Q1",      # 긴급+중요
    },
    {
        "rule_codes": ["RPT-Q-01"],
        "task_template": "내부보고회 준비 ({fund_name}) — {year}년 {quarter}Q",
        "d_day_offset": -14,   # 마감 14일 전 Task 생성
        "quadrant": "Q1",
    },
    {
        "rule_codes": ["RPT-Q-02"],
        "task_template": "피투자사 서류 수집 ({fund_name}) — {year}년 {quarter}Q",
        "d_day_offset": -7,
        "quadrant": "Q1",
    },
    {
        "rule_codes": ["RPT-H-01", "RPT-A-01"],
        "task_template": "영업보고서 준비 ({fund_name}) — {rule_title}",
        "d_day_offset": -14,
        "quadrant": "Q1",
    },
    # 수시 보고 — 이벤트 발생 즉시
    {
        "rule_codes": ["RPT-E-01", "RPT-E-02", "RPT-E-03", "RPT-E-04", "RPT-E-05", "RPT-E-06"],
        "task_template": "수시보고: {event_description}",
        "d_day_offset": 0,     # 이벤트 발생 즉시
        "quadrant": "Q1",
    },
]


async def create_task_for_obligation(obligation, fund_name, rule_title):
    """ComplianceObligation에 연동된 Task 자동 생성"""
    # 1. TASK_GENERATION_RULES에서 해당 rule_code 매칭
    # 2. task_template에 fund_name, rule_title 등 치환
    # 3. deadline = obligation.due_date + d_day_offset
    # 4. Task 생성 (auto_generated=True, source="compliance_engine")
    # 5. obligation.task_id = new_task.id 업데이트
    pass
```

---

## Part 5. API 엔드포인트

### 5-1. 컴플라이언스 라우터

#### `routers/compliance.py` [NEW]

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/compliance/rules` | 전체 규제 룰 목록 |
| GET | `/api/compliance/rules/{rule_code}` | 개별 룰 상세 |
| GET | `/api/compliance/obligations` | 전체 의무 목록 (필터: fund_id, status, period, category) |
| POST | `/api/compliance/obligations/{id}/complete` | 의무 이행 완료 처리 (body: completed_by, evidence_note) |
| POST | `/api/compliance/obligations/{id}/waive` | 의무 면제 처리 (body: reason) |
| GET | `/api/compliance/dashboard` | 컴플라이언스 대시보드 요약 |
| POST | `/api/compliance/generate-periodic` | 정기 의무 수동 생성 (body: year, month) |
| POST | `/api/compliance/check-investment-limits` | 투자 전 제한 사전 체크 |
| POST | `/api/compliance/update-overdue` | 기한 초과 의무 일괄 overdue 업데이트 |

**대시보드 응답 형식:**
```json
{
  "overdue_count": 3,
  "due_this_week": 5,
  "due_this_month": 12,
  "completed_count": 45,
  "by_fund": [
    {
      "fund_id": 1,
      "fund_name": "OO투자조합",
      "overdue": 1,
      "pending": 3,
      "completed": 8
    }
  ]
}
```

**투자 제한 체크 요청/응답:**
```json
// Request
{ "fund_id": 1, "company_name": "OO기업", "amount": 500000000, "is_overseas": false }

// Response
{
  "checks": [
    {
      "rule_code": "LMT-01",
      "result": "pass",
      "current_pct": 8.5,
      "limit_pct": 15.0,
      "detail": "동일기업 투자비율: 8.5% (기투자 300M + 신규 500M)"
    }
  ],
  "overall": "pass"
}
```

---

## Part 6. 프론트엔드

### 6-1. 컴플라이언스 페이지

#### `pages/CompliancePage.tsx` [NEW]

```
┌──────────────────────────────────────────────────────────────┐
│  [요약 카드 4개]                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ 미이행    │ │ 이번주    │ │ 이번달    │ │ 완료     │        │
│  │ 기한초과  │ │ 마감 예정 │ │ 마감 예정 │ │ 이행 완료 │       │
│  │   3건 🔴 │ │   5건 🟡 │ │  12건    │ │  45건    │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│                                                              │
│  [조합별 탭] 전체 | OO 1호 | △△ 2호 | □□ 3호 | ...          │
│                                                              │
│  [필터] 상태: [전체|미이행|기한초과|완료]  카테고리: [전체|정기|수시] │
│                                                              │
│  [의무 목록 — 테이블]                                         │
│  상태 | 마감일 | D-Day | 보고유형 | 규제근거 | 대상시스템 | 액션 │
│  ──────────────────────────────────────────────────          │
│  🔴  | 02/07 | D+2   | VICS 월보고 1308 | 10조 | VICS | [완료처리] │
│  🟡  | 02/09 | D-0   | VICS 월보고 1329 | 8조  | VICS | [완료처리] │
│  ⬜  | 03/31 | D-50  | 내부보고회 1Q    | 11조 | 내부 | [완료처리] │
│                                                              │
│  [수시보고 알림 배너]                                         │
│  ⚠️ OO기업 투자 회수 등록됨 → 5영업일 내 수시보고 필요        │
│     마감: 2026-02-28 | [완료처리]                             │
└──────────────────────────────────────────────────────────────┘
```

**UI 상세:**
- 요약 카드: `/api/compliance/dashboard` 데이터 사용
- 테이블: `/api/compliance/obligations` 데이터 사용
- D-Day 표시: due_date 기준 오늘로부터 남은 일수 (음수면 초과)
- 상태별 색상: overdue=🔴, 이번주 마감=🟡, 여유=⬜, 완료=✅
- 완료처리 모달: completed_by (입력), evidence_note (입력) → POST /complete

### 6-2. 투자 제한 체크 UI

#### `pages/InvestmentsPage.tsx` [MODIFY — 확장]

기존 투자 등록 모달에 **투자 제한 사전 체크** 기능 추가:

- 투자 금액/기업명 입력 후 [제한 체크] 버튼
- `/api/compliance/check-investment-limits` 호출
- 결과를 모달 하단에 표시:
  - pass: ✅ 초록 배지
  - warning: ⚠️ 노랑 배지 (등록 가능하나 경고)
  - block: 🚫 빨강 배지 (등록 차단)

### 6-3. 대시보드 통합

#### `pages/DashboardPage.tsx` 또는 관련 컴포넌트 [MODIFY — 확장]

기존 대시보드에 **컴플라이언스 요약 위젯** 추가:

```
┌──── 컴플라이언스 ────┐
│ 미이행 의무: 2건      │
│ 이번주 마감: 3건      │
│ [상세보기 →]          │
└──────────────────────┘
```

### 6-4. 사이드바/라우터

- 사이드바에 "컴플라이언스" 메뉴 추가 (적절한 그룹에 배치)
- 라우터에 `/compliance` 경로 등록
- `api.ts`에 compliance 관련 API 함수 + 타입 전부 export

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [NEW] | `backend/models/compliance.py` | ComplianceRule + ComplianceObligation + InvestmentLimitCheck |
| 2 | [MODIFY] | `backend/models/task.py` | obligation_id, auto_generated, source 필드 추가 |
| 3 | [MODIFY] | `backend/models/__init__.py` | 신규 모델 import |
| 4 | [NEW] | `backend/seed/compliance_rules_seed.py` | 28건 규제 룰 시드 데이터 |
| 5 | [NEW] | `backend/services/compliance_engine.py` | 정기/수시 의무 생성 + 투자제한 체크 + overdue 처리 |
| 6 | [NEW] | `backend/services/task_auto_generator.py` | D-Day 기반 Task 자동 생성 |
| 7 | [NEW] | `backend/routers/compliance.py` | 컴플라이언스 전체 API |
| 8 | [MODIFY] | `backend/routers/admin.py` | 시드 실행 API 추가 |
| 9 | [MODIFY] | `backend/routers/investments.py` | 투자 생성 시 이벤트 훅 추가 |
| 10 | [MODIFY] | `backend/routers/funds.py` | LP 변경 시 이벤트 훅 추가 |
| 11 | [MODIFY] | `backend/routers/lp_transfers.py` | LP 양도 시 이벤트 훅 추가 |
| 12 | [MODIFY] | `backend/routers/distributions.py` | 배분 실행 시 이벤트 훅 추가 |
| 13 | [MODIFY] | `backend/routers/exits.py` | 회수 정산 시 이벤트 훅 추가 |
| 14 | [MODIFY] | `backend/main.py` | compliance 라우터 등록 |
| 15 | [NEW] | `frontend/src/pages/CompliancePage.tsx` | 컴플라이언스 대시보드 UI |
| 16 | [MODIFY] | `frontend/src/pages/InvestmentsPage.tsx` | 투자 제한 체크 UI |
| 17 | [MODIFY] | `frontend/src/pages/DashboardPage.tsx` | 컴플라이언스 위젯 |
| 18 | [MODIFY] | `frontend/src/lib/api.ts` | compliance API 함수 + 타입 |
| 19 | [MODIFY] | 사이드바/라우터 | 컴플라이언스 메뉴 + 경로 |
| 20 | [NEW] | Alembic 마이그레이션 | compliance 3 테이블 + task 확장 |

---

## Acceptance Criteria

- [ ] **AC-01:** ComplianceRule 28건이 시드로 등록된다.
- [ ] **AC-02:** 정기 의무가 월 단위로 자동 생성된다 (monthly/quarterly/semi_annual/annual).
- [ ] **AC-03:** 투자 등록 시 수시보고 의무(RPT-E-01)가 자동 생성된다.
- [ ] **AC-04:** LP 변경 시 수시보고 의무(RPT-E-03)가 자동 생성된다.
- [ ] **AC-05:** 배분/회수 시 해당 수시보고 의무가 자동 생성된다.
- [ ] **AC-06:** 의무 생성 시 연동 Task가 자동 생성된다 (auto_generated=True).
- [ ] **AC-07:** 투자 제한 사전 체크가 동작하고 결과(pass/warning/block)가 반환된다.
- [ ] **AC-08:** due_date 경과한 의무가 overdue로 자동 업데이트된다.
- [ ] **AC-09:** 컴플라이언스 대시보드 페이지가 정상 표시된다 (요약카드 + 조합탭 + 의무 테이블).
- [ ] **AC-10:** 투자 등록 모달에서 제한 체크 결과가 표시된다.
- [ ] **AC-11:** 메인 대시보드에 컴플라이언스 요약 위젯이 표시된다.
- [ ] **AC-12:** Phase 31~36의 모든 기능 유지.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. 기존 Task CRUD API 시그니처 — 유지 (필드 추가만)
3. 기존 Investment/LP/Distribution/Exit CRUD 시그니처 — 유지 (이벤트 훅 추가만)
4. Phase 31~36의 기존 구현 — 보강만, 삭제/재구성 금지
5. 이벤트 훅은 반드시 `try/except`로 감싸서 훅 실패가 본체 API를 중단시키지 않도록 할 것
