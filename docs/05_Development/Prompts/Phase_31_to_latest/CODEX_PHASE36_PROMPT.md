# Phase 36: 영업보고 자동화 + 역할/권한 관리 + 최종 정합성 감사

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> ⚠️ **비식별화 원칙:** 실존 정보 사용 금지.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P0  
**의존성:** Phase 33~35 전체 (보고서에 모든 데이터 활용)  
**후속:** 없음 (최종 Phase)

---

## Part 0. 전수조사 (필수)

- [ ] `models/biz_report.py` — 기존 BizReport 모델 확인 (확장만, 삭제 금지)
- [ ] `routers/biz_reports.py` — 기존 API 시그니처 확인
- [ ] `BizReportsPage.tsx` — 기존 UI 구조 확인
- [ ] Phase 32 정기 캘린더의 "영업보고" 스케줄 확인 (워크플로 연결)
- [ ] Phase 33 InvestmentReview API 정상 동작 확인
- [ ] Phase 34 Valuation NAV-summary + CapitalCallDetail/DistributionDetail 확인
- [ ] Phase 35 ManagementFee + PerformanceFeeSimulation 확인
- [ ] `api.ts` — 전체 export 패턴 확인

---

## Part 1. 영업보고 자동화

### 1-1. 영업보고 워크플로 개요

> **Phase 32 확인 결과:** Phase 32에서는 영업보고의 **스케줄 시점** (3.10 온기 / 9.10 반기)만 정기 캘린더에 등록.
> **실제 보고 워크플로** (템플릿 → 요청 → 수집 → 검수 → 생성 → 전송)는 여기서 구현.

```
[템플릿 설정] → [데이터 요청] → [투자사 데이터 수집] → [검수 + 특이점 감지] → [보고서 생성] → [LP 전송]
```

### 1-2. 데이터 모델

#### `models/biz_report.py` [MODIFY — 확장]

기존 BizReport 유지 + 추가 모델:

```python
class BizReportTemplate(Base):
    """영업보고 템플릿 — 어떤 데이터를 수집할지 정의"""
    __tablename__ = "biz_report_templates"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)                  # "분기보고 v1", "온기 영업보고" 등
    report_type = Column(String, nullable=False)           # quarterly / semi-annual / annual
    required_fields = Column(Text, nullable=True)          # JSON: 수집 필드 목록
    template_file_id = Column(Integer, nullable=True)      # Phase 32 Attachment 연결
    instructions = Column(Text, nullable=True)             # 피투자사 안내 사항
    created_at = Column(DateTime, default=func.now())

class BizReportRequest(Base):
    """영업보고 데이터 요청 — 피투자사별 수집 추적"""
    __tablename__ = "biz_report_requests"
    id = Column(Integer, primary_key=True, autoincrement=True)
    biz_report_id = Column(Integer, ForeignKey("biz_reports.id", ondelete="CASCADE"), index=True)
    investment_id = Column(Integer, ForeignKey("investments.id"), index=True)
    
    # 요청/수집 상태
    request_date = Column(Date, nullable=True)
    deadline = Column(Date, nullable=True)
    status = Column(String, default="미요청")               # 미요청 → 요청 → 제출 → 검수중 → 완료 / 반려
    
    # 수집 데이터 (피투자사 재무)
    revenue = Column(Numeric, nullable=True)               # 매출
    operating_income = Column(Numeric, nullable=True)      # 영업이익
    net_income = Column(Numeric, nullable=True)            # 당기순이익
    total_assets = Column(Numeric, nullable=True)          # 총자산
    total_equity = Column(Numeric, nullable=True)          # 자본총계
    cash = Column(Numeric, nullable=True)                  # 현금성자산
    employees = Column(Integer, nullable=True)             # 직원 수
    
    # 전기 대비 (자동 계산 또는 수동)
    prev_revenue = Column(Numeric, nullable=True)
    prev_operating_income = Column(Numeric, nullable=True)
    prev_net_income = Column(Numeric, nullable=True)
    
    # 심사역 검수
    comment = Column(Text, nullable=True)                  # 분기별 코멘트
    reviewer_comment = Column(Text, nullable=True)         # 검수 의견
    risk_flag = Column(String, nullable=True)              # 정상 / 주의 / 위험
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

class BizReportAnomaly(Base):
    """영업보고 특이점 — 자동 감지 결과"""
    __tablename__ = "biz_report_anomalies"
    id = Column(Integer, primary_key=True, autoincrement=True)
    request_id = Column(Integer, ForeignKey("biz_report_requests.id", ondelete="CASCADE"), index=True)
    anomaly_type = Column(String)                          # 매출급변 / 영업손실전환 / 자본잠식 / 현금고갈 / 적자지속 / 매출정체
    severity = Column(String)                              # 주의(🟡) / 위험(🔴)
    detail = Column(Text)                                  # 상세 설명
    acknowledged = Column(Boolean, default=False)           # 확인 여부
    created_at = Column(DateTime, default=func.now())
```

### 1-3. 특이점 감지 룰 엔진

#### `services/biz_report_anomaly.py` [NEW]

| 특이점 | 감지 룰 | 심각도 |
|---|---|---|
| 매출 급변 | 전분기 대비 ±30% | 🟡 주의 |
| 영업손실 전환 | 전분기 (+) → 당분기 (-) | 🔴 위험 |
| 자본잠식 | 자본총계 < 0 또는 납입자본의 50% 미만 | 🔴 위험 |
| 현금 고갈 | 현금 < 월평균비용 × 3 | 🔴 위험 |
| 적자 지속 | 2분기 연속 순손실 | 🟡 주의 |
| 매출 정체 | 3분기 연속 ±5% 이내 | 🟡 주의 |
| 코멘트 미입력 | comment 빈 값 | ⚠️ 알림 |

### 1-4. API

#### `routers/biz_reports.py` [MODIFY — 확장]

기존 CRUD 유지 + 추가:

| Method | Endpoint | 설명 |
|---|---|---|
| **템플릿** | | |
| GET | `/api/biz-report-templates` | 템플릿 목록 |
| POST | `/api/biz-report-templates` | 템플릿 생성 |
| **요청** | | |
| GET | `/api/biz-reports/{id}/requests` | 피투자사별 요청 목록 |
| POST | `/api/biz-reports/{id}/requests/generate` | 해당 조합 투자건 기준 요청 일괄 생성 |
| PATCH | `/api/biz-report-requests/{id}` | 데이터 입력/상태 변경 |
| **검수** | | |
| POST | `/api/biz-report-requests/{id}/detect-anomalies` | 특이점 감지 실행 |
| GET | `/api/biz-report-requests/{id}/anomalies` | 특이점 목록 |
| GET | `/api/biz-report-requests/{id}/comment-diff` | 전분기 코멘트 diff |
| **생성** | | |
| POST | `/api/biz-reports/{id}/generate-excel` | Excel 보고서 자동 생성 |
| POST | `/api/biz-reports/{id}/generate-docx` | DOCX 회의록 자동 생성 |
| **현황** | | |
| GET | `/api/biz-reports/matrix` | 조합×분기 매트릭스 현황 |

### 1-5. 프론트엔드

#### `BizReportsPage.tsx` [MODIFY — 대폭 개선]

**기존:** 기본 CRUD → **개선:** 3탭 구조

| 탭 | 내용 |
|---|---|
| **보고 현황** | 조합×분기 매트릭스 + 상태 표시 |
| **보고 상세** | 피투자사별 데이터 입력 + 특이점 배지 + 코멘트 비교 |
| **보고서 생성** | Excel/DOCX 자동 생성 + 다운로드 |

**보고 현황 매트릭스:**
```
조합명          | 1Q      | 2Q      | 3Q      | 4Q
OO 1호 조합    | ✅ 완료  | 🟡 수집중 | ⬜ 예정  | ⬜ 예정
△△ 2호 조합    | ✅ 완료  | 🟡 검수중 | ⬜ 예정  | ⬜ 예정
```

**보고 상세:**
- 피투자사별 재무 데이터 입력 폼
- 전분기 데이터 자동 불러오기 (비교용)
- 특이점 배지: `⚠️ 매출급변 (+32%))` `🔴 영업손실전환`
- 코멘트 side-by-side diff (변경 부분 하이라이트)

**보고서에 자동 포함되는 데이터 (Phase 33~35 연계):**
- 가치평가 NAV (Phase 34)
- 투자 현황/수익률 (Phase 33 거래 원장)
- LP별 출자/배분 현황 (Phase 34)
- 관리보수/성과보수 (Phase 35)

---

## Part 2. 역할/권한 관리 (RBAC)

### 2-1. 모델

#### `models/user.py` [NEW]

```python
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=True)          # 향후 로그인 용
    role = Column(String, default="viewer")                # admin / manager / reviewer / viewer
    department = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    last_login_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())
```

| 역할 | 설명 | 접근 |
|---|---|---|
| `admin` | 총괄 관리자 | 전체 CRUD + 설정 + 사용자 관리 |
| `manager` | 운용 담당 | Fund/Investment CRUD + 보고서 작성 |
| `reviewer` | 심사역 | 투자 심의 + 검토 의견 + 조회 |
| `viewer` | 조회 전용 | 읽기만 |

> **현재 단계:** 인증(로그인) 시스템은 미구현. RBAC 모델과 UI만 준비하고, 실제 접근 제어는 향후 Phase에서 미들웨어로 적용.

### 2-2. API

#### `routers/users.py` [NEW]

| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/api/users` | 사용자 목록 |
| POST | `/api/users` | 사용자 등록 |
| PUT | `/api/users/{id}` | 수정 (역할 변경 포함) |
| PATCH | `/api/users/{id}/deactivate` | 비활성화 |

### 2-3. 프론트엔드

#### 설정 페이지 내 "사용자 관리" 탭

- 사용자 목록 테이블 (이름, 이메일, 역할, 상태, 마지막 로그인)
- 사용자 추가/수정 모달
- 역할 변경 드롭다운
- 비활성화 버튼

---

## Part 3. 최종 정합성 감사

Phase 33~35에서 추가된 모든 기능에 대해 아래 항목을 전수 확인:

### 3-1. 데이터 정합성

- [ ] 새 모델(InvestmentReview, ReviewComment, CapitalCallDetail, DistributionDetail, ManagementFee, FeeConfig, PerformanceFeeSimulation, BizReportTemplate, BizReportRequest, BizReportAnomaly, User)에 적절한 **인덱스** 설정
- [ ] FK 컬럼에 `index=True` 적용
- [ ] `ondelete="CASCADE"` 적용 확인
- [ ] `UniqueConstraint` 필요한 곳 적용 (예: FeeConfig의 fund_id unique)

### 3-2. API 정합성

- [ ] 모든 새 router가 `main.py`에 등록
- [ ] 모든 새 모델이 `models/__init__.py`에 import
- [ ] try/except/rollback 패턴 적용 (Phase 31_4 ACID 가이드라인)
- [ ] 에러 응답이 한글 메시지 포함

### 3-3. 프론트 정합성

- [ ] 모든 새 API 함수가 `api.ts`에 export
- [ ] 모든 mutation에서 `invalidateQueries` 적절히 호출
- [ ] 새 페이지가 라우터에 등록
- [ ] 사이드바에 메뉴 추가

### 3-4. 유기적 연계 최종 점검

| 연계 | 확인 항목 |
|---|---|
| 투자 심의 → Investment | convert 시 정상 연결 |
| 거래 원장 → Fund 통계 | 거래 등록 시 투자총액/회수총액 업데이트 |
| 가치평가 → 보수 계산 | NAV 기반 관리보수 계산 정상 |
| 출자/배분 → 보수 계산 | 납입 금액 기반 성과보수 계산 정상 |
| 회수 → 거래 원장 | 정산 시 자동 등록 |
| 회수 → LP 배분 | 정산 시 배분 자동 생성 |
| 영업보고 → Phase 33~35 데이터 | NAV, 투자현황, 보수 데이터 보고서 반영 |
| 정기 캘린더 → 워크플로 | 분기보고/영업보고 인스턴스 연결 |
| 대시보드 → 전체 | 심의건수, NAV, 미납LP, 보수, 보고진행 표시 |

---

## Files to modify / create

| # | Type | Target | Description |
|---|---|---|---|
| 1 | [MODIFY] | `backend/models/biz_report.py` | BizReportTemplate + BizReportRequest + BizReportAnomaly 추가 |
| 2 | [NEW] | `backend/services/biz_report_anomaly.py` | 특이점 감지 룰 엔진 |
| 3 | [MODIFY] | `backend/routers/biz_reports.py` | 템플릿/요청/검수/생성/매트릭스 API |
| 4 | [NEW] | `backend/models/user.py` | User 모델 |
| 5 | [NEW] | `backend/routers/users.py` | 사용자 CRUD |
| 6 | [MODIFY] | `frontend/src/pages/BizReportsPage.tsx` | 3탭(현황 매트릭스/상세/생성) + 특이점 + 코멘트 diff |
| 7 | [MODIFY] | 설정 페이지 | 사용자 관리 탭 추가 |
| 8 | [MODIFY] | `frontend/src/lib/api.ts` | 영업보고/사용자 API 함수 + 타입 |
| 9 | [NEW] | Alembic 마이그레이션 | biz_report 확장 + users |

---

## Acceptance Criteria

### Part 1 — 영업보고
- [ ] **AC-01:** 영업보고 템플릿을 생성하고 관리할 수 있다.
- [ ] **AC-02:** 피투자사별 데이터 요청을 일괄 생성할 수 있다.
- [ ] **AC-03:** 피투자사별 재무 데이터를 입력하고 상태가 추적된다.
- [ ] **AC-04:** 특이점(매출급변, 영업손실전환 등)이 자동 감지된다.
- [ ] **AC-05:** 전분기 코멘트와 현분기 코멘트의 diff가 표시된다.
- [ ] **AC-06:** 수집된 데이터 기반 Excel/DOCX 보고서가 자동 생성된다.
- [ ] **AC-07:** 조합×분기 매트릭스에 보고 현황이 표시된다.
- [ ] **AC-08:** Phase 33~35 데이터(NAV, 투자현황, 보수)가 보고서에 반영된다.

### Part 2 — RBAC
- [ ] **AC-09:** 사용자를 등록하고 역할(admin/manager/reviewer/viewer)을 설정할 수 있다.
- [ ] **AC-10:** 사용자 관리 UI가 설정 페이지에 표시된다.

### Part 3 — 정합성
- [ ] **AC-11:** Part 3의 모든 정합성 체크리스트 통과.
- [ ] **AC-12:** Phase 31~35의 모든 기능 유지.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. 기존 BizReport CRUD API 시그니처 — 유지 (확장만)
3. Phase 31~35의 기존 구현 — 보강만, 삭제/재구성 금지
4. 현 단계에서 인증(JWT/세션) 미들웨어는 구현하지 않는다 — RBAC 모델과 UI만 준비
