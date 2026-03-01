# Phase 41: 분기 서류 수집 추적 + 대시보드 통합 + 최종 정합성 감사

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> ⚠️ **비식별화 원칙:** 실존 정보 사용 금지.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P1  
**의존성:** Phase 37~40 전체 (대시보드에 모든 데이터 통합)  
**후속:** 없음 (PRD 최종 Phase)

---

## Part 0. 전수조사 (필수)

- [ ] `models/biz_report.py` — BizReportRequest 현재 필드 확인 (서류 상태 필드 추가 대상)
- [ ] `routers/biz_reports.py` — 기존 API 시그니처 확인
- [ ] `pages/BizReportsPage.tsx` — 기존 UI 확인
- [ ] `models/compliance.py` — Phase 37 ComplianceObligation 확인
- [ ] `routers/compliance.py` — Phase 37 대시보드 API 확인
- [ ] `models/vics_report.py` — Phase 38 VICS 모델 확인
- [ ] `models/internal_review.py` — Phase 39 InternalReview 확인
- [ ] `pages/DashboardPage.tsx` — 현재 대시보드 위젯 구조 확인
- [ ] `routers/dashboard.py` — 현재 대시보드 API 확인

---

## Part 1. 분기 서류 수집 추적 (BizReportRequest 확장)

### 1-1. 모델 확장

#### `models/biz_report.py` [MODIFY — 확장]

BizReportRequest에 서류 7종 수집 상태 필드 추가:

```python
# 기존 필드 전부 유지 + 아래 추가

# 7종 서류 수집 상태
doc_financial_statement = Column(String, nullable=False, default="not_requested")
# "not_requested" | "requested" | "received" | "verified"
doc_biz_registration = Column(String, nullable=False, default="not_requested")
doc_shareholder_list = Column(String, nullable=False, default="not_requested")
doc_corp_registry = Column(String, nullable=False, default="not_requested")
doc_insurance_cert = Column(String, nullable=False, default="not_requested")
doc_credit_report = Column(String, nullable=False, default="not_requested")
doc_other_changes = Column(String, nullable=False, default="not_requested")

# 서류 요청/수집 날짜
request_sent_date = Column(Date, nullable=True)
request_deadline = Column(Date, nullable=True)
all_docs_received_date = Column(Date, nullable=True)
```

### 1-2. API 확장

#### `routers/biz_reports.py` [MODIFY — 확장]

기존 API 유지 + 서류 수집 관련 추가:

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/biz-reports/doc-collection-matrix` | 조합×분기 서류 수집 매트릭스 |
| PATCH | `/api/biz-report-requests/{id}/doc-status` | 개별 서류 상태 변경 |
| POST | `/api/biz-reports/{id}/send-doc-requests` | 미수집 기업 일괄 서류 요청 (request_sent_date 업데이트) |

**서류 수집 매트릭스 응답:**
```json
{
  "fund_id": 1,
  "fund_name": "OO 1호 조합",
  "quarter": "2026-Q1",
  "total_companies": 6,
  "completed_companies": 4,
  "completion_pct": 66.7,
  "companies": [
    {
      "company_name": "OO기업",
      "request_id": 1,
      "docs": {
        "financial_statement": "verified",
        "biz_registration": "verified",
        "shareholder_list": "verified",
        "corp_registry": "verified",
        "insurance_cert": "verified",
        "credit_report": "verified",
        "other_changes": "verified"
      },
      "received_count": 7,
      "status": "완료"
    },
    {
      "company_name": "△△기업",
      "request_id": 2,
      "docs": {
        "financial_statement": "received",
        "biz_registration": "received",
        "shareholder_list": "received",
        "corp_registry": "not_requested",
        "insurance_cert": "not_requested",
        "credit_report": "not_requested",
        "other_changes": "not_requested"
      },
      "received_count": 3,
      "status": "3/7"
    }
  ]
}
```

### 1-3. 프론트엔드

#### `pages/BizReportsPage.tsx` [MODIFY — 확장]

기존 탭에 **"서류 수집"** 탭 추가:

```
┌──────────────────────────────────────────────────────────────────────┐
│  OO 1호 조합 — 2026년 1분기 서류 수집 현황                            │
│  진행률: 4/6 기업 완료 (66.7%)  [프로그레스 바]                        │
│                                                                      │
│  기업명       | 재무 | 사업자 | 주주 | 등기 | 보험 | 신용 | 기타 | 상태│
│  ────────────────────────────────────────────────────────────       │
│  OO기업       | ✅  | ✅    | ✅  | ✅  | ✅  | ✅  | ✅  | 완료 │
│  △△기업       | ✅  | ✅    | ✅  | ⬜  | ⬜  | ⬜  | ⬜  | 3/7 │
│  □□기업       | ⬜  | ⬜    | ⬜  | ⬜  | ⬜  | ⬜  | ⬜  | 요청중│
│  ...                                                                 │
│                                                                      │
│  [미수집 기업 일괄 서류요청 공문 생성] [전체 확인 완료]                  │
└──────────────────────────────────────────────────────────────────────┘
```

**UI 상세:**
- 각 서류 셀 클릭 시 상태 순환: ⬜ → 📨(요청) → 📥(수신) → ✅(확인)
- [서류요청 공문 생성]: Phase 40 D-06 빌더 연동
- 상단 프로그레스 바: completed_companies / total_companies

---

## Part 2. 대시보드 통합

### 2-1. 대시보드 API 확장

#### `routers/dashboard.py` [MODIFY — 확장]

기존 대시보드 API에 Phase 37~41 데이터 통합:

```python
# 기존 대시보드 응답에 아래 위젯 데이터 추가

# 컴플라이언스 위젯 (Phase 37)
{
    "compliance": {
        "overdue_count": 2,
        "due_this_week": 3,
        "due_this_month": 8,
    }
}

# 서류 수집 위젯 (Phase 41)
{
    "doc_collection": {
        "current_quarter": "2026-Q1",
        "completion_pct": 68.0,
        "pending_companies": 7,
    }
}

# 긴급 알림 (Phase 37 overdue + 수시보고)
{
    "urgent_alerts": [
        {"type": "overdue", "message": "VICS 월보고 (OO조합) D+2 기한 초과", "due_date": "2026-02-07"},
        {"type": "adhoc", "message": "수시보고: OO기업 투자 회수 → 마감 02/28", "due_date": "2026-02-28"},
        {"type": "internal_review", "message": "내부보고회 (△△조합) 4Q25 미완료 D+12", "due_date": "2026-01-31"},
    ]
}
```

### 2-2. 대시보드 UI 확장

#### `pages/DashboardPage.tsx` 또는 관련 컴포넌트 [MODIFY — 확장]

```
┌──────────────────────────────────────────────────────────────────────┐
│  V:ON ERP — 오늘의 현황                                              │
│                                                                      │
│  ┌──── 컴플라이언스 ────┐ ┌──── 서류 수집 ─────┐ ┌──── 할 일 ────┐  │
│  │ 미이행 의무: 2건 🔴  │ │ 1Q26 수집률: 68%  │ │ 오늘: 5건     │  │
│  │ 이번주 마감: 3건     │ │ 미수집 기업: 7곳  │ │ 이번주: 12건  │  │
│  │ [상세보기 →]         │ │ [상세보기 →]       │ │ [상세보기 →]  │  │
│  └──────────────────────┘ └───────────────────┘ └──────────────┘  │
│                                                                      │
│  [긴급 알림]  ─────────────────────────────────────                  │
│  🔴 VICS 월보고 (OO조합) 마감 D+2 (02/07) — 기한 초과               │
│  🟡 수시보고: OO기업 투자회수 → 마감 02/28                            │
│  🟡 내부보고회 (△△조합) 4Q25 미완료 → D+12                          │
│                                                                      │
│  [조합별 Quick View]                                                  │
│  OO 1호 | △△ 2호 | □□ 3호 | ...                                    │
│  ──────────────────────────                                          │
│  OO 1호 조합                                                         │
│  - LP 6명 | 피투자 6사 | 투자잔액 12,500M                            │
│  - 컴플라이언스: 정상 (미이행 0건) ✅                                 │
│  - 1Q26 서류: 4/6 완료                                               │
│  - 다음 이벤트: 내부보고회 (04/28)                                    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Part 3. 최종 정합성 감사

Phase 37~41에서 추가된 모든 기능에 대해 아래 항목을 전수 확인:

### 3-1. 데이터 정합성

- [ ] 새 모델(ComplianceRule, ComplianceObligation, InvestmentLimitCheck, VicsMonthlyReport, InternalReview, CompanyReview)에 적절한 **인덱스** 설정
- [ ] FK 컬럼에 `index=True` 적용
- [ ] `ondelete="CASCADE"` 적용 확인
- [ ] `UniqueConstraint` 필요한 곳 적용

### 3-2. API 정합성

- [ ] 모든 새 router가 `main.py`에 등록
- [ ] 모든 새 모델이 `models/__init__.py`에 import
- [ ] try/except/rollback 패턴 적용
- [ ] 에러 응답이 한글 메시지 포함

### 3-3. 프론트 정합성

- [ ] 모든 새 API 함수가 `api.ts`에 export
- [ ] 모든 mutation에서 `invalidateQueries` 적절히 호출
- [ ] 새 페이지가 라우터에 등록
- [ ] 사이드바에 메뉴 추가

### 3-4. 유기적 연계 최종 점검

| 연계 | 확인 항목 |
|------|----------|
| 투자 생성 → 컴플라이언스 | on_investment_created() 수시보고 생성 |
| LP 변경 → 컴플라이언스 | on_lp_changed() 수시보고 생성 |
| 배분/회수 → 컴플라이언스 | 해당 이벤트 훅 정상 |
| 컴플라이언스 → Task | 의무 생성 시 Task 자동 생성 |
| VICS 보고 → Fund/LP/Investment | 데이터 정확성 |
| 내부보고회 → BizReportRequest | 재무 데이터 자동 복사 |
| 내부보고회 → 손상차손 평가 | 자동 판별 정확성 |
| 문서 빌더 → 각 모델 | 6종 빌더 정상 생성 |
| 서류 수집 → BizReportRequest | 7종 상태 추적 정상 |
| 대시보드 → Phase 37~41 전체 | 위젯 데이터 표시 정상 |

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [MODIFY] | `backend/models/biz_report.py` | BizReportRequest에 7종 서류 상태 필드 추가 |
| 2 | [MODIFY] | `backend/routers/biz_reports.py` | 서류 수집 매트릭스 + 상태변경 API |
| 3 | [MODIFY] | `backend/routers/dashboard.py` | 컴플라이언스/서류수집/긴급알림 위젯 데이터 |
| 4 | [MODIFY] | `frontend/src/pages/BizReportsPage.tsx` | 서류 수집 탭 추가 |
| 5 | [MODIFY] | `frontend/src/pages/DashboardPage.tsx` | 컴플라이언스/서류수집 위젯 + 긴급알림 |
| 6 | [MODIFY] | `frontend/src/lib/api.ts` | 서류수집 + 대시보드 확장 API 함수 |
| 7 | [NEW] | Alembic 마이그레이션 | BizReportRequest 7종 필드 추가 |

---

## Acceptance Criteria

### Part 1 — 서류 수집
- [ ] **AC-01:** BizReportRequest에 7종 서류 상태가 추적된다.
- [ ] **AC-02:** 서류 수집 매트릭스가 조합×기업별로 표시된다.
- [ ] **AC-03:** 각 서류 상태를 개별 변경할 수 있다.
- [ ] **AC-04:** 미수집 기업 일괄 서류요청 공문을 생성할 수 있다 (Phase 40 D-06 연동).

### Part 2 — 대시보드
- [ ] **AC-05:** 대시보드에 컴플라이언스 요약 위젯이 표시된다.
- [ ] **AC-06:** 대시보드에 서류 수집 현황 위젯이 표시된다.
- [ ] **AC-07:** 긴급 알림(overdue, 수시보고, 내부보고회 미완료)이 표시된다.
- [ ] **AC-08:** 조합별 Quick View에 컴플라이언스/서류 현황이 포함된다.

### Part 3 — 정합성
- [ ] **AC-09:** Part 3의 모든 정합성 체크리스트 통과.
- [ ] **AC-10:** Phase 31~40의 모든 기능 유지.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. 기존 BizReportRequest CRUD API 시그니처 — 유지 (확장만)
3. 기존 Dashboard API 시그니처 — 유지 (데이터 추가만)
4. Phase 31~40의 기존 구현 — 보강만, 삭제/재구성 금지
