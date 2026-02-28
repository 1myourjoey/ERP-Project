# V:ON ERP — 코딩 업무명세서 (Coding Specification)

> **작성일:** 2026-02-24
> **대상 조직:** 트리거투자파트너스(유) — LLC형 창업투자회사
> **시스템:** V:ON ERP (GitHub: 1myourjoey/ERP-Project, Phase 36 완료)
> **핵심 목표:** 1~2인 관리역의 사후관리 누락 제로 + 문서 자동화
> **문서 버전:** v3.0 — 코딩 가능 업무명세서

---

## 1. 설계 철학

### 1.1 문제 정의
1인 관리역이 8개 조합 × 22개 피투자기업의 사후관리를 수행하면서 **놓치는 것들**:
- 수시보고 대상인지 판단 못함 (투자/회수/LP변경 시 모태펀드 보고 의무)
- 분기 서류 7종 수집 누락 (피투자사 22곳에 개별 요청·추적)
- 월보고 VICS 입력 데이터 불일치 (ERP 데이터 ↔ VICS 입력값)
- 투자제한 위반 사전 체크 부재 (동일기업 15%, 해외 20% 등)
- 손상차손 평가 기준 놓침 (자본잠식 50%, 3기 연속 적자 등)
- 내부보고회 기한 도래 인지 부재 (분기 종료 후 D+30~D+60)

### 1.2 해결 원칙
1. **규제 룰 엔진** — 가이드라인의 보고 의무·투자제한·손상 기준을 코드로 내장
2. **이벤트 드리븐 알림** — 투자/회수/LP변경 등 트리거 이벤트 발생 시 자동으로 해야 할 일 생성
3. **단일 진실 원천(SSOT)** — 한 곳에 입력 → 대시보드·보고서·VICS 데이터에 일관 반영
4. **최소 입력, 최대 자동화** — 사용자가 입력하는 것은 "사실"(금액, 날짜, 평가)만, 나머지는 시스템이 계산·생성

### 1.3 범위 한정 (이것만 한다)
| 포함 | 제외 |
|------|------|
| 조합·LP·투자 마스터 관리 | 제안서 관리 (HWP 정부양식) |
| 사후관리 규제 컴플라이언스 엔진 | 인사·총무·급여 |
| 문서 자동생성 (핵심 6종) | 전자결재·품의 |
| VICS 월보고 데이터 출력 | OCR 재무제표 파싱 |
| 내부보고회·영업보고 관리 | 기획·홍보 |
| 손상차손 평가 지원 | 복식부기 회계 엔진 |
| 워크플로우 (결성·투자) | Docker/OnlyOffice 연동 |
| D-Day 기반 Task 자동생성 | JWT 인증 (단일 사용자) |

---

## 2. 기술 스택 (확정)

| 구분 | 기술 | 비고 |
|------|------|------|
| 백엔드 | Python FastAPI 0.115+ | 29개 라우터 구현 완료 |
| 프론트엔드 | React + Vite + TypeScript | 20+ 페이지 구현 |
| DB | SQLite (개발) / PostgreSQL (운영) | Alembic 마이그레이션 |
| ORM | SQLAlchemy 2.0+ async | 30+ 테이블 |
| 문서 생성 | python-docx, openpyxl | docx/xlsx 자동 생성 |

---

## 3. 핵심 모듈 상세 스펙

> 각 모듈은 **DB 스키마 → API 엔드포인트 → 비즈니스 룰 → UI 스펙** 순서로 기술한다.

---

### 3.1 모듈 A: 규제 컴플라이언스 엔진 (신규 — 최우선)

**목적:** 농식품모태펀드·벤처펀드 사후관리 가이드라인의 보고 의무, 투자 제한, 손상차손 기준을 코드화하여 자동 알림·차단.

#### 3.1.1 DB 스키마

```python
# models/compliance.py

class ComplianceRule(Base):
    """가이드라인 규제 룰 마스터 — 시스템 seed 데이터"""
    __tablename__ = "compliance_rules"

    rule_id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str]  # "reporting" | "investment_limit" | "impairment" | "penalty"
    subcategory: Mapped[str]  # "periodic" | "adhoc" | "limit_same_company" | ...
    rule_code: Mapped[str] = mapped_column(unique=True)  # "RPT-M-01", "LMT-01", ...
    title: Mapped[str]  # "VICS 월간보고"
    description: Mapped[str]  # 상세 설명
    trigger_event: Mapped[str | None]  # "investment_created" | "lp_changed" | None(정기)
    frequency: Mapped[str | None]  # "monthly" | "quarterly" | "semi_annual" | "annual" | None(수시)
    deadline_rule: Mapped[str | None]  # "M+7d" | "Q+30d" | "event+5bd" 등
    target_system: Mapped[str | None]  # "VICS" | "농금원" | "내부" | "벤처협회"
    guideline_ref: Mapped[str | None]  # "농식품모태 가이드라인 제12조"
    is_active: Mapped[bool] = mapped_column(default=True)
    fund_type_filter: Mapped[str | None]  # "농식품" | "벤처" | "all" — 조합 유형별 적용


class ComplianceObligation(Base):
    """조합별 규제 의무 인스턴스 — 룰 + 조합 조합"""
    __tablename__ = "compliance_obligations"

    obligation_id: Mapped[int] = mapped_column(primary_key=True)
    rule_id: Mapped[int] = mapped_column(ForeignKey("compliance_rules.rule_id"))
    fund_id: Mapped[int] = mapped_column(ForeignKey("funds.fund_id"))

    # 기간 정보
    period_type: Mapped[str | None]  # "2026-01" | "2026-Q1" | "2026-H1" | None(수시)
    due_date: Mapped[date]

    # 상태 추적
    status: Mapped[str] = mapped_column(default="pending")
    # "pending" → "in_progress" → "completed" | "overdue" | "waived"
    completed_date: Mapped[date | None]
    completed_by: Mapped[str | None]
    evidence_note: Mapped[str | None]  # 완료 근거 메모

    # 연관 엔티티 (수시보고의 경우)
    investment_id: Mapped[int | None] = mapped_column(ForeignKey("investments.investment_id"))

    # 자동 생성 Task 연결
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.task_id"))

    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]


class InvestmentLimitCheck(Base):
    """투자 제한 사전 체크 결과 로그"""
    __tablename__ = "investment_limit_checks"

    check_id: Mapped[int] = mapped_column(primary_key=True)
    fund_id: Mapped[int] = mapped_column(ForeignKey("funds.fund_id"))
    investment_id: Mapped[int | None] = mapped_column(ForeignKey("investments.investment_id"))
    check_date: Mapped[datetime]

    rule_code: Mapped[str]  # "LMT-01" ~ "LMT-07"
    check_result: Mapped[str]  # "pass" | "warning" | "block"
    current_value: Mapped[float]  # 현재 비율/금액
    limit_value: Mapped[float]  # 제한 비율/금액
    detail: Mapped[str]  # 상세 계산 근거
```

#### 3.1.2 규제 룰 시드 데이터 (가이드라인 → 코드)

```python
# seed/compliance_rules_seed.py

COMPLIANCE_RULES = [
    # ═══ 정기 보고 의무 ═══
    {
        "rule_code": "RPT-M-01",
        "category": "reporting",
        "subcategory": "periodic",
        "title": "VICS 월간보고 (1308 투자현황)",
        "description": "전월 투자현황을 VICS 시스템에 보고. 코드 1308.",
        "frequency": "monthly",
        "deadline_rule": "M+7d",  # 매월 7일까지 (농식품모태)
        "target_system": "VICS",
        "guideline_ref": "농식품모태 사후관리 가이드라인 제10조",
        "fund_type_filter": "농식품",
    },
    {
        "rule_code": "RPT-M-02",
        "category": "reporting",
        "subcategory": "periodic",
        "title": "VICS 월간보고 (1309 조합현황)",
        "description": "조합 출자금 납입현황, LP 변동사항을 VICS에 보고. 코드 1309.",
        "frequency": "monthly",
        "deadline_rule": "M+7d",
        "target_system": "VICS",
        "guideline_ref": "농식품모태 사후관리 가이드라인 제10조",
        "fund_type_filter": "농식품",
    },
    {
        "rule_code": "RPT-M-03",
        "category": "reporting",
        "subcategory": "periodic",
        "title": "VICS 월간보고 (1329 운용현황)",
        "description": "조합 운용현황(현금, 투자잔액 등) VICS 보고. 코드 1329.",
        "frequency": "monthly",
        "deadline_rule": "M+9d",  # 매월 9일까지 (모태)
        "target_system": "VICS",
        "guideline_ref": "벤처펀드 사후관리 가이드라인 제8조",
        "fund_type_filter": "all",
    },
    {
        "rule_code": "RPT-M-04",
        "category": "reporting",
        "subcategory": "periodic",
        "title": "KiiPS ERP 운용보고",
        "description": "KiiPS ERP 시스템에 운용보고 데이터 입력.",
        "frequency": "monthly",
        "deadline_rule": "M+9d",
        "target_system": "KiiPS",
        "guideline_ref": "벤처펀드 사후관리 가이드라인",
        "fund_type_filter": "all",
    },
    {
        "rule_code": "RPT-Q-01",
        "category": "reporting",
        "subcategory": "periodic",
        "title": "내부보고회 (분기)",
        "description": "분기 종료 후 D+30~D+60 내 내부보고회 개최. 피투자사별 사후관리보고서 + 자산건전성평가 + 손상차손평가.",
        "frequency": "quarterly",
        "deadline_rule": "Q+60d",
        "target_system": "내부",
        "guideline_ref": "농식품모태 사후관리 가이드라인 제11조",
        "fund_type_filter": "all",
    },
    {
        "rule_code": "RPT-Q-02",
        "category": "reporting",
        "subcategory": "periodic",
        "title": "분기 피투자사 서류 7종 수집",
        "description": "피투자사별 재무제표, 사업자등록증, 주주명부, 법인등기부등본, 4대보험 가입내역, 대표자 신용정보, 기타 변동사항 수집.",
        "frequency": "quarterly",
        "deadline_rule": "Q+30d",
        "target_system": "내부",
        "guideline_ref": "농식품모태 사후관리 가이드라인 제11조",
        "fund_type_filter": "all",
    },
    {
        "rule_code": "RPT-H-01",
        "category": "reporting",
        "subcategory": "periodic",
        "title": "반기 영업보고서",
        "description": "반기 종료 후 45일 이내 LP 및 모태펀드에 영업보고서 제출.",
        "frequency": "semi_annual",
        "deadline_rule": "H+45d",
        "target_system": "농금원",
        "guideline_ref": "농식품모태 사후관리 가이드라인 제12조",
        "fund_type_filter": "농식품",
    },
    {
        "rule_code": "RPT-A-01",
        "category": "reporting",
        "subcategory": "periodic",
        "title": "연간 결산보고서",
        "description": "회계연도 종료 후 90일 이내 결산보고서 제출. 외부감사보고서 포함.",
        "frequency": "annual",
        "deadline_rule": "Y+90d",
        "target_system": "농금원",
        "guideline_ref": "농식품모태 사후관리 가이드라인 제13조",
        "fund_type_filter": "농식품",
    },

    # ═══ 수시 보고 의무 (이벤트 드리븐) ═══
    {
        "rule_code": "RPT-E-01",
        "category": "reporting",
        "subcategory": "adhoc",
        "title": "투자 실행 수시보고",
        "description": "신규 투자 집행 시 5영업일 이내 모태펀드에 보고. 투자기업명, 금액, 지분율, 투자조건 포함.",
        "trigger_event": "investment_created",
        "deadline_rule": "event+5bd",
        "target_system": "VICS",
        "guideline_ref": "농식품모태 사후관리 가이드라인 제14조",
        "fund_type_filter": "all",
    },
    {
        "rule_code": "RPT-E-02",
        "category": "reporting",
        "subcategory": "adhoc",
        "title": "투자 회수 수시보고",
        "description": "투자금 회수(엑싯) 시 5영업일 이내 보고. 회수금액, 수익률, 회수방법 포함.",
        "trigger_event": "investment_exited",
        "deadline_rule": "event+5bd",
        "target_system": "VICS",
        "guideline_ref": "농식품모태 사후관리 가이드라인 제14조",
        "fund_type_filter": "all",
    },
    {
        "rule_code": "RPT-E-03",
        "category": "reporting",
        "subcategory": "adhoc",
        "title": "조합원(LP) 변경 수시보고",
        "description": "LP 가입/탈퇴/지분양도 시 10영업일 이내 보고.",
        "trigger_event": "lp_changed",
        "deadline_rule": "event+10bd",
        "target_system": "VICS",
        "guideline_ref": "농식품모태 사후관리 가이드라인 제15조",
        "fund_type_filter": "all",
    },
    {
        "rule_code": "RPT-E-04",
        "category": "reporting",
        "subcategory": "adhoc",
        "title": "규약 변경 수시보고",
        "description": "조합 규약 변경 시 10영업일 이내 보고. 변경 전후 대비표 첨부.",
        "trigger_event": "fund_rules_changed",
        "deadline_rule": "event+10bd",
        "target_system": "농금원",
        "guideline_ref": "농식품모태 사후관리 가이드라인 제15조",
        "fund_type_filter": "all",
    },
    {
        "rule_code": "RPT-E-05",
        "category": "reporting",
        "subcategory": "adhoc",
        "title": "해외 투자 사전 보고",
        "description": "해외 기업 투자 시 사전 승인 또는 보고 필요. 투자 조합 출자총액의 20% 한도.",
        "trigger_event": "overseas_investment",
        "deadline_rule": "event-5bd",
        "target_system": "농금원",
        "guideline_ref": "농식품모태 사후관리 가이드라인 제7조",
        "fund_type_filter": "농식품",
    },
    {
        "rule_code": "RPT-E-06",
        "category": "reporting",
        "subcategory": "adhoc",
        "title": "배분 실행 수시보고",
        "description": "LP 배분 실행 시 보고. 배분금액, LP별 배분내역 포함.",
        "trigger_event": "distribution_executed",
        "deadline_rule": "event+5bd",
        "target_system": "VICS",
        "guideline_ref": "농식품모태 사후관리 가이드라인 제14조",
        "fund_type_filter": "all",
    },

    # ═══ 투자 제한 ═══
    {
        "rule_code": "LMT-01",
        "category": "investment_limit",
        "subcategory": "limit_same_company",
        "title": "동일기업 투자한도 15%",
        "description": "동일 기업에 대한 투자금액이 조합 출자총액의 15%를 초과할 수 없음.",
        "guideline_ref": "농식품모태 사후관리 가이드라인 제5조",
        "fund_type_filter": "농식품",
    },
    {
        "rule_code": "LMT-02",
        "category": "investment_limit",
        "subcategory": "limit_overseas",
        "title": "해외투자 한도 20%",
        "description": "해외 기업 투자 합계가 출자총액의 20%를 초과할 수 없음.",
        "guideline_ref": "농식품모태 사후관리 가이드라인 제7조",
        "fund_type_filter": "농식품",
    },
    {
        "rule_code": "LMT-03",
        "category": "investment_limit",
        "subcategory": "limit_affiliate",
        "title": "GP 계열사 투자 금지",
        "description": "GP(업무집행조합원) 및 그 특수관계인이 지배하는 기업에 투자 불가.",
        "guideline_ref": "농식품모태 사후관리 가이드라인 제6조",
        "fund_type_filter": "all",
    },
    {
        "rule_code": "LMT-04",
        "category": "investment_limit",
        "subcategory": "limit_real_estate",
        "title": "부동산 투자 제한",
        "description": "조합 자산으로 부동산 취득 불가 (운용목적 사무실 제외).",
        "guideline_ref": "농식품모태 사후관리 가이드라인 제8조",
        "fund_type_filter": "all",
    },
    {
        "rule_code": "LMT-05",
        "category": "investment_limit",
        "subcategory": "limit_listed",
        "title": "상장기업 투자 제한",
        "description": "코스닥/코스피 상장기업 투자 시 벤처기업 요건 충족 필요.",
        "guideline_ref": "벤처펀드 사후관리 가이드라인 제5조",
        "fund_type_filter": "벤처",
    },

    # ═══ 손상차손 기준 ═══
    {
        "rule_code": "IMP-01",
        "category": "impairment",
        "subcategory": "full_impairment",
        "title": "완전손상 — 자본잠식 50% 이상",
        "description": "피투자기업 자본잠식률 50% 이상 시 완전손상 검토 대상.",
        "guideline_ref": "모태펀드 손상차손 가이드라인 제7조",
        "fund_type_filter": "all",
    },
    {
        "rule_code": "IMP-02",
        "category": "impairment",
        "subcategory": "full_impairment",
        "title": "완전손상 — 3기 연속 당기순손실",
        "description": "3개 회계연도 연속 당기순손실 시 완전손상 검토.",
        "guideline_ref": "모태펀드 손상차손 가이드라인 제7조",
        "fund_type_filter": "all",
    },
    {
        "rule_code": "IMP-03",
        "category": "impairment",
        "subcategory": "full_impairment",
        "title": "완전손상 — 2기 연속 매출 감소",
        "description": "2개 회계연도 연속 매출액 감소 시 완전손상 검토.",
        "guideline_ref": "모태펀드 손상차손 가이드라인 제7조",
        "fund_type_filter": "all",
    },
    {
        "rule_code": "IMP-04",
        "category": "impairment",
        "subcategory": "partial_impairment",
        "title": "부분손상 — 장부가 대비 공정가치 하락",
        "description": "공정가치가 장부가 대비 유의적으로 하락한 경우 부분손상 검토. 회수가능가액 기준.",
        "guideline_ref": "모태펀드 손상차손 가이드라인 제8조",
        "fund_type_filter": "all",
    },

    # ═══ 자산건전성 등급 ═══
    {
        "rule_code": "RAT-AA",
        "category": "impairment",
        "subcategory": "asset_rating",
        "title": "AA등급 — 정상 (장부가 100% 이상 회수 예상)",
        "description": "수익성 양호, 영업현금흐름 양(+), 사업계획 정상 진행.",
        "guideline_ref": "사규4 제6조",
        "fund_type_filter": "all",
    },
    {
        "rule_code": "RAT-A",
        "category": "impairment",
        "subcategory": "asset_rating",
        "title": "A등급 — 보통 (장부가 70~100% 회수 예상)",
        "description": "수익성 보통, 일시적 실적 부진이나 회복 가능.",
        "guideline_ref": "사규4 제6조",
        "fund_type_filter": "all",
    },
    {
        "rule_code": "RAT-B",
        "category": "impairment",
        "subcategory": "asset_rating",
        "title": "B등급 — 주의 (장부가 30~70% 회수 예상)",
        "description": "2기 연속 적자 또는 매출 감소 추세.",
        "guideline_ref": "사규4 제6조",
        "fund_type_filter": "all",
    },
    {
        "rule_code": "RAT-C",
        "category": "impairment",
        "subcategory": "asset_rating",
        "title": "C등급 — 위험 (장부가 30% 미만 회수 예상)",
        "description": "자본잠식, 3기 연속 적자, 사업 지속성 의문.",
        "guideline_ref": "사규4 제6조",
        "fund_type_filter": "all",
    },
    {
        "rule_code": "RAT-D",
        "category": "impairment",
        "subcategory": "asset_rating",
        "title": "D등급 — 부실 (회수 불능)",
        "description": "청산·파산·폐업 또는 완전자본잠식.",
        "guideline_ref": "사규4 제6조",
        "fund_type_filter": "all",
    },
]
```

#### 3.1.3 API 엔드포인트

```
# router/compliance.py

GET    /api/compliance/rules                     # 전체 규제 룰 목록
GET    /api/compliance/rules/{rule_code}          # 개별 룰 상세

GET    /api/compliance/obligations                # 전체 의무 목록
  ?fund_id=1                                      # 조합별 필터
  ?status=pending,overdue                         # 상태 필터
  ?period=2026-Q1                                 # 기간 필터
  ?category=reporting                             # 카테고리 필터

POST   /api/compliance/obligations/{id}/complete  # 의무 이행 완료 처리
  body: { completed_by: str, evidence_note: str }

GET    /api/compliance/dashboard                  # 컴플라이언스 대시보드 요약
  → { overdue_count, due_this_week, due_this_month, by_fund: [...] }

POST   /api/compliance/check-investment-limits    # 투자 전 제한 사전 체크
  body: { fund_id, company_name, amount, is_overseas, is_affiliate }
  → { checks: [{ rule_code, result, current_pct, limit_pct, detail }] }
```

#### 3.1.4 비즈니스 룰 (자동화 로직)

```python
# services/compliance_engine.py

class ComplianceEngine:
    """
    1) 정기 의무 자동 생성 — 매월 1일 cron/스케줄러로 실행
    2) 수시 의무 이벤트 드리븐 — 투자/LP변경 등 이벤트 발생 시 실행
    3) 투자제한 사전 체크 — 투자 등록 전 자동 실행
    4) 손상차손 자동 판별 — 분기 BizReport 데이터 입력 완료 시 실행
    """

    def generate_periodic_obligations(self, year: int, month: int):
        """매월 1일: 해당 월의 정기 보고 의무 생성"""
        # 1. 모든 active 조합 조회
        # 2. 각 조합의 fund_type에 맞는 정기 룰 조회
        # 3. 월간: 매월 생성, 분기: 3,6,9,12월 생성, 반기: 6,12월 생성, 연간: 12월 생성
        # 4. ComplianceObligation 레코드 생성
        # 5. 연동된 Task 자동 생성 (due_date = 의무 마감일)
        pass

    def on_investment_created(self, investment: Investment):
        """투자 등록 이벤트 → 수시보고 의무 자동 생성"""
        # RPT-E-01 룰로 ComplianceObligation 생성
        # due_date = investment_date + 5 영업일
        # Task 자동 생성: "수시보고: {company_name} 투자 실행 보고"
        pass

    def on_investment_exited(self, investment: Investment):
        """투자 회수 이벤트 → 수시보고 의무 자동 생성"""
        # RPT-E-02 룰로 ComplianceObligation 생성
        pass

    def on_lp_changed(self, lp: LP, change_type: str):
        """LP 변경 이벤트 → 수시보고 의무 자동 생성"""
        # RPT-E-03 룰로 ComplianceObligation 생성
        # change_type: "joined" | "withdrawn" | "transferred"
        pass

    def on_distribution_executed(self, fund_id: int):
        """배분 실행 이벤트 → 수시보고 의무 자동 생성"""
        # RPT-E-06 룰로 ComplianceObligation 생성
        pass

    def check_investment_limits(self, fund_id: int, amount: float,
                                 company_name: str, is_overseas: bool) -> list[dict]:
        """투자 전 제한 사전 체크 — 결과 리스트 반환"""
        results = []
        fund = get_fund(fund_id)

        # LMT-01: 동일기업 15%
        existing = sum_investments_for_company(fund_id, company_name)
        total_after = existing + amount
        pct = total_after / fund.total_commitment * 100
        results.append({
            "rule_code": "LMT-01",
            "result": "pass" if pct <= 15 else ("warning" if pct <= 13 else "block"),
            "current_pct": round(pct, 2),
            "limit_pct": 15.0,
            "detail": f"동일기업 투자비율: {pct:.1f}% (기투자 {existing:,.0f} + 신규 {amount:,.0f})"
        })

        # LMT-02: 해외투자 20%
        if is_overseas:
            overseas_total = sum_overseas_investments(fund_id) + amount
            overseas_pct = overseas_total / fund.total_commitment * 100
            results.append({
                "rule_code": "LMT-02",
                "result": "pass" if overseas_pct <= 20 else "block",
                "current_pct": round(overseas_pct, 2),
                "limit_pct": 20.0,
            })

        return results

    def evaluate_impairment(self, investment_id: int) -> dict:
        """분기 BizReport 데이터 기반 손상차손 자동 판별"""
        # 최근 3분기 BizReportRequest 데이터 조회
        reports = get_recent_biz_reports(investment_id, quarters=12)

        result = {"rating": "AA", "impairment_type": "none", "flags": []}

        # IMP-01: 자본잠식 50% 이상
        latest = reports[0] if reports else None
        if latest and latest.total_equity and latest.paid_in_capital:
            erosion = (latest.paid_in_capital - latest.total_equity) / latest.paid_in_capital * 100
            if erosion >= 50:
                result["flags"].append("IMP-01: 자본잠식 {:.1f}%".format(erosion))
                result["impairment_type"] = "full"

        # IMP-02: 3기 연속 당기순손실
        annual_reports = get_annual_reports(investment_id, years=3)
        consecutive_losses = all(r.net_income < 0 for r in annual_reports if r.net_income is not None)
        if len(annual_reports) >= 3 and consecutive_losses:
            result["flags"].append("IMP-02: 3기 연속 당기순손실")
            result["impairment_type"] = "full"

        # IMP-03: 2기 연속 매출 감소
        if len(annual_reports) >= 3:
            revenues = [r.revenue for r in annual_reports]
            if revenues[0] < revenues[1] < revenues[2]:  # 최신→과거 순
                result["flags"].append("IMP-03: 2기 연속 매출 감소")
                if result["impairment_type"] != "full":
                    result["impairment_type"] = "partial"

        # 등급 자동 산정
        if result["impairment_type"] == "full":
            result["rating"] = "D" if erosion >= 100 else "C"
        elif result["impairment_type"] == "partial":
            result["rating"] = "B"
        elif latest and latest.net_income and latest.net_income < 0:
            result["rating"] = "A"

        return result
```

#### 3.1.5 UI 스펙

**페이지: `/compliance` — 컴플라이언스 대시보드**

```
┌──────────────────────────────────────────────────────────────┐
│  [요약 카드 4개]                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ 미이행    │ │ 이번주    │ │ 이번달    │ │ 완료     │        │
│  │    3건    │ │   5건    │ │   12건   │ │  45건    │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│                                                              │
│  [조합별 탭] 미래수산 | TH1 | TP2 | TGP | 뉴챕터 | 밸류체인  │
│                                                              │
│  [의무 목록 — 테이블]                                         │
│  상태 | 마감일 | 보고유형 | 규제근거 | 대상시스템 | 액션       │
│  ──────────────────────────────────────────────────────       │
│  RED  | 02/07 | VICS 월보고 1308 | 가이드라인 10조 | VICS | [완료처리] │
│  YEL  | 02/09 | VICS 월보고 1329 | 가이드라인 8조  | VICS | [완료처리] │
│  GRN  | 03/31 | 내부보고회 4Q   | 가이드라인 11조 | 내부 | [완료처리] │
│                                                              │
│  [수시보고 알림 배너]                                         │
│  ! (주)에이엠글로벌 투자 회수 등록됨 → 5영업일 내 수시보고 필요  │
│     마감: 2026-02-28 | [보고서 작성] [완료처리]               │
└──────────────────────────────────────────────────────────────┘
```

---

### 3.2 모듈 B: VICS 월보고 데이터 출력 (신규)

**목적:** ERP 데이터 → VICS 시스템 입력용 데이터 자동 산출. 매월 7일/9일 보고.

#### 3.2.1 DB 스키마

```python
# models/vics_report.py

class VicsMonthlyReport(Base):
    """VICS 월보고 데이터 스냅샷"""
    __tablename__ = "vics_monthly_reports"

    report_id: Mapped[int] = mapped_column(primary_key=True)
    fund_id: Mapped[int] = mapped_column(ForeignKey("funds.fund_id"))
    year: Mapped[int]
    month: Mapped[int]
    report_code: Mapped[str]  # "1308" | "1309" | "1329"

    # 데이터 (JSON)
    data_json: Mapped[dict] = mapped_column(JSON)
    # 1308: { investments: [{ company, amount, date, instrument, status }] }
    # 1309: { lps: [{ name, type, commitment, paid_in, changes }] }
    # 1329: { cash_balance, investment_total, nav, fee_paid, ... }

    status: Mapped[str] = mapped_column(default="draft")  # draft → confirmed → submitted
    confirmed_at: Mapped[datetime | None]
    submitted_at: Mapped[datetime | None]

    # 불일치 체크
    discrepancy_notes: Mapped[str | None]  # ERP 데이터와 차이 있을 때 메모
```

#### 3.2.2 API 엔드포인트

```
GET    /api/vics/reports/{fund_id}/{year}/{month}        # 월보고 데이터 조회
POST   /api/vics/reports/{fund_id}/{year}/{month}/generate  # ERP 데이터로 자동 생성
  → 1308: Fund의 Investment 테이블에서 해당월 투자현황 추출
  → 1309: LP 테이블에서 출자현황 + 변동사항 추출
  → 1329: Fund 잔액, 투자잔액, NAV 등 계산
POST   /api/vics/reports/{id}/confirm                    # 확인 완료
GET    /api/vics/reports/{id}/export-xlsx                 # VICS 입력용 엑셀 다운로드
```

#### 3.2.3 비즈니스 룰

```python
# services/vics_report_service.py

def generate_1308(fund_id: int, year: int, month: int) -> dict:
    """VICS 1308 — 투자현황"""
    investments = get_active_investments(fund_id)
    return {
        "investments": [
            {
                "company_name": inv.company_name,
                "biz_number": inv.biz_number,
                "instrument_type": inv.instrument_type,
                "investment_date": inv.investment_date,
                "investment_amount": inv.amount,
                "current_balance": calculate_balance(inv),
                "shares": inv.shares,
                "ownership_pct": calculate_ownership(inv),
                "status": inv.status,
            }
            for inv in investments
        ],
        "summary": {
            "total_invested": sum(inv.amount for inv in investments),
            "total_balance": sum(calculate_balance(inv) for inv in investments),
            "new_this_month": count_new_investments(fund_id, year, month),
            "exited_this_month": count_exits(fund_id, year, month),
        }
    }

def generate_1309(fund_id: int, year: int, month: int) -> dict:
    """VICS 1309 — 조합현황"""
    fund = get_fund(fund_id)
    lps = get_lps(fund_id)
    return {
        "fund_info": {
            "total_commitment": fund.total_commitment,
            "paid_in_total": fund.paid_in_total,
            "remaining_commitment": fund.total_commitment - fund.paid_in_total,
        },
        "lps": [
            {
                "name": lp.name,
                "lp_type": lp.lp_type,
                "commitment": lp.commitment,
                "paid_in": lp.paid_in,
                "ownership_pct": lp.ownership_pct,
            }
            for lp in lps
        ],
        "changes_this_month": get_lp_changes(fund_id, year, month),
    }

def generate_1329(fund_id: int, year: int, month: int) -> dict:
    """VICS 1329 — 운용현황"""
    fund = get_fund(fund_id)
    return {
        "cash_balance": get_bank_balance(fund_id, year, month),
        "investment_cost_total": sum_investment_costs(fund_id),
        "investment_fair_value_total": sum_fair_values(fund_id),
        "nav": calculate_nav(fund_id),
        "management_fee_paid": sum_fees(fund_id, year, month, "management"),
        "operating_expense": sum_fees(fund_id, year, month, "operating"),
        "distribution_total": sum_distributions(fund_id),
    }
```

#### 3.2.4 UI 스펙

**페이지: `/vics` — VICS 월보고**

```
┌────────────────────────────────────────────────────────────┐
│  VICS 월보고  [조합 선택 v] [2026년 v] [2월 v]             │
│                                                            │
│  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐  │
│  │ 1308 투자현황    │ │ 1309 조합현황    │ │ 1329 운용현황 │ │
│  │ V 생성완료       │ │ ! 미확인        │ │ X 미생성      │ │
│  │ [보기] [엑셀]   │ │ [보기] [엑셀]   │ │ [자동생성]    │ │
│  └─────────────────┘ └─────────────────┘ └──────────────┘  │
│                                                            │
│  [1308 상세 — 펼침]                                        │
│  피투자기업 | 투자일 | 투자금액 | 잔액 | 지분율 | 상태      │
│  ─────────────────────────────────────────────────         │
│  (주)에이엠글로벌 | 24.05.15 | 500M | 500M | 8.2% | 보유  │
│  ...                                                       │
│  합계: 투자 12건 | 총 투자금액 8,500M | 잔액 7,200M        │
│                                                            │
│  [! 불일치 경고] 1329 현금잔액과 통장 정리 잔액 차이: 12M   │
│  → 원인 메모: [_______________] [확인완료]                  │
└────────────────────────────────────────────────────────────┘
```

---

### 3.3 모듈 C: 내부보고회 + 손상차손 평가 (신규)

**목적:** 분기 내부보고회 프로세스 자동화. 피투자사별 사후관리보고서 + 자산건전성 등급 + 손상차손 판별.

#### 3.3.1 DB 스키마

```python
# models/internal_review.py

class InternalReview(Base):
    """내부보고회 마스터"""
    __tablename__ = "internal_reviews"

    review_id: Mapped[int] = mapped_column(primary_key=True)
    fund_id: Mapped[int] = mapped_column(ForeignKey("funds.fund_id"))
    year: Mapped[int]
    quarter: Mapped[int]  # 1~4

    reference_date: Mapped[date]  # 기준일 (분기 말일)
    review_date: Mapped[date | None]  # 보고회 개최일
    status: Mapped[str] = mapped_column(default="preparing")
    # "preparing" → "data_collecting" → "reviewing" → "completed"

    # 참석자
    attendees_json: Mapped[list | None] = mapped_column(JSON)
    # [{ name, title, role }]

    # 준법감시인 의견
    compliance_opinion: Mapped[str | None]
    compliance_officer: Mapped[str | None]

    # 회의록 문서 ID
    minutes_document_id: Mapped[int | None]

    created_at: Mapped[datetime]


class CompanyReview(Base):
    """피투자기업별 사후관리 보고서 (내부보고회 내)"""
    __tablename__ = "company_reviews"

    company_review_id: Mapped[int] = mapped_column(primary_key=True)
    review_id: Mapped[int] = mapped_column(ForeignKey("internal_reviews.review_id"))
    investment_id: Mapped[int] = mapped_column(ForeignKey("investments.investment_id"))

    # 분기 재무 데이터 (BizReportRequest에서 가져오거나 직접 입력)
    quarterly_revenue: Mapped[int | None]
    quarterly_operating_income: Mapped[int | None]
    quarterly_net_income: Mapped[int | None]
    total_assets: Mapped[int | None]
    total_liabilities: Mapped[int | None]
    total_equity: Mapped[int | None]
    cash_and_equivalents: Mapped[int | None]

    # 인력 변동
    employee_count: Mapped[int | None]
    employee_change: Mapped[int | None]  # 전분기 대비 증감

    # 자산건전성 등급
    asset_rating: Mapped[str | None]  # "AA" | "A" | "B" | "C" | "D"
    rating_reason: Mapped[str | None]

    # 손상차손 평가
    impairment_type: Mapped[str | None]  # "none" | "partial" | "full"
    impairment_amount: Mapped[int | None]
    impairment_flags_json: Mapped[list | None] = mapped_column(JSON)
    # ["IMP-01: 자본잠식 52%", "IMP-02: 3기 연속 적자"]

    # 주요 이슈 및 후속 조치
    key_issues: Mapped[str | None]
    follow_up_actions: Mapped[str | None]
    board_attendance: Mapped[str | None]

    # 투자 상태
    investment_opinion: Mapped[str | None]  # "유지" | "회수검토" | "추가투자검토" | "손상처리"
```

#### 3.3.2 API 엔드포인트

```
# router/internal_review.py

GET    /api/internal-reviews                          # 목록
  ?fund_id=1&year=2026
POST   /api/internal-reviews                          # 내부보고회 생성
  body: { fund_id, year, quarter }
  → 자동으로 해당 조합의 모든 피투자기업에 대한 CompanyReview 레코드 생성
  → BizReport 데이터가 있으면 재무데이터 자동 복사
  → 손상차손 자동 판별 실행 → impairment_flags 자동 세팅

GET    /api/internal-reviews/{id}                      # 상세 (CompanyReview 포함)
PATCH  /api/internal-reviews/{id}                      # 수정 (날짜, 참석자, 의견 등)

GET    /api/internal-reviews/{id}/company-reviews       # 피투자사별 보고서 목록
PATCH  /api/internal-reviews/{id}/company-reviews/{cr_id}  # 개별 보고서 수정
  body: { asset_rating, rating_reason, key_issues, follow_up_actions, ... }

POST   /api/internal-reviews/{id}/auto-evaluate         # 전체 피투자사 손상차손 일괄 자동 판별
POST   /api/internal-reviews/{id}/generate-minutes      # 회의록 docx 자동 생성
POST   /api/internal-reviews/{id}/generate-report       # 통합 보고서 docx 자동 생성
```

#### 3.3.3 UI 스펙

**페이지: `/internal-reviews/{id}` — 내부보고회 상세**

```
┌────────────────────────────────────────────────────────────────┐
│  미래수산식품투자조합 2026년 1분기 내부보고회                      │
│  기준일: 2026-03-31 | 보고회 예정일: 2026-04-28                  │
│  상태: 데이터 수집 중 (4/6 기업 완료)                             │
│                                                                │
│  [피투자기업 목록 — 카드]                                        │
│  ┌──────────────────────────────────────────────────┐          │
│  │ (주)에이엠글로벌                                    │          │
│  │ 등급: AA → [자동판별: AA] | 손상: 없음              │          │
│  │ 매출: 1,200M (전분기 1,150M +4.3%)                │          │
│  │ 순이익: 80M | 자산: 3,500M | 부채: 1,200M         │          │
│  │ [플래그 없음 V]                                     │          │
│  │ [상세편집] [보고서 미리보기]                         │          │
│  └──────────────────────────────────────────────────┘          │
│  ┌──────────────────────────────────────────────────┐          │
│  │ (주)광양이엔에스                                    │          │
│  │ 등급: [미평가] → [자동판별: B] !                     │          │
│  │ 매출: 300M (전분기 450M -33.3%)                    │          │
│  │ 순이익: -50M | 자산: 800M | 부채: 600M            │          │
│  │ [! IMP-03: 2기 연속 매출 감소]                       │          │
│  │ [상세편집] [보고서 미리보기]                         │          │
│  └──────────────────────────────────────────────────┘          │
│  ...                                                           │
│                                                                │
│  [하단 액션]                                                    │
│  [통합 보고서 생성] [회의록 생성] [보고회 완료 처리]               │
└────────────────────────────────────────────────────────────────┘
```

---

### 3.4 모듈 D: 문서 자동생성 빌더 (확장)

**목적:** 기존 3종 빌더에 핵심 6종을 추가하여 반복 문서 수기 작성 제거.

#### 3.4.1 빌더 목록 및 우선순위

| # | 빌더명 | 입력 데이터 | 출력 | 트리거 | 우선순위 |
|---|--------|-----------|------|--------|---------|
| D-01 | 후속관리보고서 | CompanyReview | docx | 내부보고회 생성 시 | P1 |
| D-02 | 운용지시서 | Transaction + Fund.trustee | docx | 출자/배분/투자 거래 등록 시 | P1 |
| D-03 | 출자증서 | LP + Fund | docx | LP 출자금 납입 완료 시 | P1 |
| D-04 | 투심위 의사록 | InvestmentReview + VoteRecord | docx | 투심위 완료 시 | P1 |
| D-05 | 내부보고회 통합보고서 | InternalReview + CompanyReview[] | docx | 내부보고회 데이터 확정 시 | P2 |
| D-06 | 피투자사 서류요청 공문 | Investment + Fund | docx | 분기 시작 시 자동 | P2 |

#### 3.4.2 D-01 후속관리보고서 빌더 상세

```python
# document_builders/follow_up_report.py

"""
후속관리보고서 (피투자사별 1건)
현재 양식: 18행 x 3열 테이블 docx
데이터 소스: CompanyReview + Investment + BizReportRequest
"""

TEMPLATE_STRUCTURE = {
    "title": "후속관리보고서",
    "sections": [
        {"label": "기준일", "source": "company_review.review.reference_date", "format": "YYYY년 MM월 DD일"},
        {"label": "작성일", "source": "today()", "format": "YYYY년 MM월 DD일"},
        {"label": "작성자", "source": "config.manager_name"},
        {"label": "확인자", "source": "config.director_name"},

        {"label": "기업명", "source": "investment.company_name"},
        {"label": "대표자", "source": "investment.ceo"},
        {"label": "벤처기업 여부", "source": "investment.is_venture"},
        {"label": "중소기업 여부", "source": "investment.is_sme"},

        {"label": "분기 매출액", "source": "company_review.quarterly_revenue", "format": "currency_million"},
        {"label": "분기 영업이익", "source": "company_review.quarterly_operating_income", "format": "currency_million"},
        {"label": "분기 당기순이익", "source": "company_review.quarterly_net_income", "format": "currency_million"},
        {"label": "총자산", "source": "company_review.total_assets", "format": "currency_million"},
        {"label": "총부채", "source": "company_review.total_liabilities", "format": "currency_million"},
        {"label": "현금성자산", "source": "company_review.cash_and_equivalents", "format": "currency_million"},

        {"label": "임직원 수", "source": "company_review.employee_count"},
        {"label": "인원 변동", "source": "company_review.employee_change", "format": "signed_int"},

        {"label": "이사회/주총 참석", "source": "company_review.board_attendance"},
        {"label": "주요 이슈", "source": "company_review.key_issues", "multiline": True},
        {"label": "후속 조치", "source": "company_review.follow_up_actions", "multiline": True},
        {"label": "종합 의견", "source": "company_review.investment_opinion"},
    ]
}

def build(company_review_id: int) -> bytes:
    """docx 바이트 반환"""
    cr = get_company_review(company_review_id)
    inv = get_investment(cr.investment_id)

    doc = Document()
    doc.add_heading("후속관리보고서", level=1)

    table = doc.add_table(rows=len(TEMPLATE_STRUCTURE["sections"]), cols=2)
    table.style = "Table Grid"

    for i, section in enumerate(TEMPLATE_STRUCTURE["sections"]):
        table.rows[i].cells[0].text = section["label"]
        value = resolve_value(section["source"], cr, inv)
        table.rows[i].cells[1].text = format_value(value, section.get("format"))

    return save_docx_bytes(doc)
```

#### 3.4.3 D-02 운용지시서 빌더 상세

```python
# document_builders/operation_instruction.py

"""
운용지시서 — 출자금 납입/투자금 출금/배분금 지급 시 수탁사에 제출
금액/계좌번호 오류 시 수탁사 반려 → 가장 에러 위험 높은 문서
"""

TEMPLATE_STRUCTURE = {
    "title": "운용지시서",
    "fields": {
        "fund_name": "investment.fund.name",           # 조합명
        "instruction_type": "transaction.tx_type",      # 출자납입/투자집행/배분/경비지출
        "instruction_date": "today()",
        "amount": "transaction.amount",                 # 금액 (원 단위)
        "amount_korean": "to_korean_currency(amount)",  # 금 일억오천만원정
        "from_account": "fund.bank_account",            # 출금 계좌
        "to_account": "resolve_to_account()",           # 입금 계좌 (피투자사/LP/경비)
        "to_account_holder": "resolve_account_holder()",
        "purpose": "transaction.description",
        "reference": "transaction.tx_id",
        "gp_name": "config.company_name",              # 트리거투자파트너스(유)
        "gp_representative": "config.representative",  # 서원일
    },
    "approval_line": ["작성: 김재욱", "확인: 이정민", "승인: 서원일"],
}
```

#### 3.4.4 문서 자동생성 API

```
# router/documents.py (기존 확장)

POST   /api/documents/generate
  body: {
    builder: "follow_up_report" | "operation_instruction" | "contribution_cert" |
             "irc_minutes" | "internal_review_report" | "doc_request_letter",
    params: { ... builder별 파라미터 ... }
  }
  → { document_id, filename, download_url }

GET    /api/documents/{id}/download    # docx 다운로드
GET    /api/documents                  # 생성 이력
```

---

### 3.5 모듈 E: 분기 서류 수집 추적 (BizReport 확장)

**목적:** 피투자사 22곳에서 분기마다 수집해야 하는 7종 서류의 수집 현황 추적 자동화.

#### 3.5.1 기존 BizReport에 추가할 필드

```python
# models/biz_report.py (기존 모델 확장)

class BizReportRequest(Base):
    """기존 모델에 아래 필드 추가"""
    # ... 기존 필드 유지 ...

    # 7종 서류 수집 상태 추가
    doc_financial_statement: Mapped[str] = mapped_column(default="not_requested")
    # "not_requested" | "requested" | "received" | "verified"
    doc_biz_registration: Mapped[str] = mapped_column(default="not_requested")
    doc_shareholder_list: Mapped[str] = mapped_column(default="not_requested")
    doc_corp_registry: Mapped[str] = mapped_column(default="not_requested")
    doc_insurance_cert: Mapped[str] = mapped_column(default="not_requested")
    doc_credit_report: Mapped[str] = mapped_column(default="not_requested")
    doc_other_changes: Mapped[str] = mapped_column(default="not_requested")

    # 서류 요청/수집 날짜
    request_sent_date: Mapped[date | None]
    request_deadline: Mapped[date | None]
    all_docs_received_date: Mapped[date | None]
```

#### 3.5.2 UI 스펙 — 서류 수집 매트릭스 (기존 BizReport 확장)

```
┌──────────────────────────────────────────────────────────────────────┐
│  미래수산식품투자조합 — 2026년 1분기 서류 수집 현황                      │
│  진행률: 4/6 기업 완료 (66.7%)                                        │
│                                                                      │
│  기업명        | 재무 | 사업자 | 주주 | 등기 | 보험 | 신용 | 기타 | 상태 │
│  ─────────────────────────────────────────────────────────────       │
│  에이엠글로벌  | V   | V    | V   | V   | V   | V   | V   | 완료 │
│  광양이엔에스  | V   | V    | V   | V   | V   | V   | _   | 6/7 │
│  에이스쿨링    | V   | V    | V   | _   | _   | _   | _   | 3/7 │
│  지알환경산업  | _   | _    | _   | _   | _   | _   | _   | 요청중 │
│  마루무역      | V   | V    | V   | V   | V   | V   | V   | 완료 │
│  밸류라움바이오 | V   | V    | V   | V   | V   | V   | V   | 완료 │
│                                                                      │
│  [미수집 기업 일괄 재요청 공문 생성]  [전체 확인 완료]                    │
└──────────────────────────────────────────────────────────────────────┘
```

---

### 3.6 모듈 F: D-Day 기반 Task 자동생성 (기존 확장)

**목적:** 정기/수시 보고 마감일 기반으로 Task를 자동 생성하여 누락 방지.

#### 3.6.1 기존 Task 모델에 추가할 필드

```python
# models/task.py (기존 모델 확장)

class Task(Base):
    # ... 기존 필드 유지 ...

    # 컴플라이언스 연동
    obligation_id: Mapped[int | None] = mapped_column(
        ForeignKey("compliance_obligations.obligation_id")
    )
    auto_generated: Mapped[bool] = mapped_column(default=False)
    source: Mapped[str | None]  # "compliance_engine" | "workflow" | "manual"
```

#### 3.6.2 자동 Task 생성 룰

```python
# services/task_auto_generator.py

TASK_GENERATION_RULES = [
    # 정기 보고 — D-3 사전 알림
    {
        "rule_codes": ["RPT-M-01", "RPT-M-02", "RPT-M-03", "RPT-M-04"],
        "task_template": "VICS 월보고 ({fund_name}) — {rule_title}",
        "d_day_offset": -3,  # 마감 3일 전 Task 생성
        "quadrant": "Q1",  # 긴급+중요
    },
    {
        "rule_codes": ["RPT-Q-01"],
        "task_template": "내부보고회 준비 ({fund_name}) — {year}년 {quarter}Q",
        "d_day_offset": -14,  # 마감 14일 전 Task 생성
        "quadrant": "Q1",
    },
    {
        "rule_codes": ["RPT-Q-02"],
        "task_template": "피투자사 서류 수집 ({fund_name}) — {year}년 {quarter}Q",
        "d_day_offset": -7,
        "quadrant": "Q1",
    },
    # 수시 보고 — 이벤트 발생 즉시
    {
        "rule_codes": ["RPT-E-01", "RPT-E-02", "RPT-E-03", "RPT-E-04", "RPT-E-05", "RPT-E-06"],
        "task_template": "수시보고: {event_description}",
        "d_day_offset": 0,  # 이벤트 발생 즉시
        "quadrant": "Q1",
    },
]
```

---

## 4. 기존 모듈 유지 사항 (변경 없음)

아래 모듈은 Phase 36에서 이미 구현 완료되어 변경 없이 유지한다. 위 신규 모듈과의 연동 포인트만 명시.

| 기존 모듈 | 유지 | 신규 모듈 연동 포인트 |
|-----------|------|---------------------|
| Fund CRUD | 그대로 | ComplianceObligation.fund_id FK |
| LP 관리 | 그대로 | LP 변경 시 compliance_engine.on_lp_changed() 호출 |
| Investment CRUD | 그대로 | 투자 생성 시 compliance_engine.on_investment_created() 호출 |
| Transaction 원장 | 그대로 | 거래 등록 시 D-02 운용지시서 자동생성 트리거 |
| Valuation | 그대로 | InternalReview.CompanyReview에서 공정가치 참조 |
| BizReport | **확장** | 7종 서류 상태 필드 추가 (모듈 E) |
| Workflow 엔진 | 그대로 | 워크플로우 스텝 완료 시 문서 자동생성 트리거 |
| DocumentTemplate | 그대로 | 신규 빌더 6종 추가 등록 |
| Task Board | **확장** | obligation_id FK 추가 (모듈 F) |
| Calendar | 그대로 | 내부보고회 일정 자동 등록 |
| WorkLog | 그대로 | - |
| Dashboard | **확장** | 컴플라이언스 요약 위젯 추가 |
| Checklist | 그대로 | - |
| Search | 그대로 | 신규 테이블 인덱싱 추가 |
| LP Transfer | 그대로 | on_lp_changed() 트리거 |
| InvestmentReview | 그대로 | 투심위 완료 시 D-04 의사록 자동생성 |
| Accounting | 그대로 | - |

---

## 5. 대시보드 통합 UI 스펙

**페이지: `/dashboard` — 메인 대시보드 (기존 확장)**

```
┌──────────────────────────────────────────────────────────────────────┐
│  V:ON ERP — 오늘의 현황 (2026-02-24)                                 │
│                                                                      │
│  ┌──── 컴플라이언스 ────┐ ┌──── 서류 수집 ─────┐ ┌──── 할 일 ────┐  │
│  │ 미이행 의무: 2건      │ │ 1Q26 수집률: 68%  │ │ 오늘: 5건     │  │
│  │ 이번주 마감: 3건      │ │ 미수집 기업: 7곳  │ │ 이번주: 12건  │  │
│  │ [상세보기]            │ │ [상세보기]         │ │ [상세보기]    │  │
│  └──────────────────────┘ └───────────────────┘ └──────────────┘  │
│                                                                      │
│  [긴급 알림]                                                         │
│  - VICS 월보고 (미래수산) 마감 D-3 (02/07)                           │
│  - 수시보고: (주)제이엘스탠다드 투자회수 → 마감 02/28                   │
│  - 내부보고회 (TGP) 4Q25 미완료 → 기한 초과 12일                      │
│                                                                      │
│  [조합별 Quick View]                                                  │
│  미래수산 | TH1 | TP2 | TGP | 뉴챕터 | 밸류체인                      │
│  ──────────────────────────                                          │
│  미래수산식품투자조합                                                  │
│  - LP 6명 | 피투자 6사 | 투자잔액 12,500M                            │
│  - 컴플라이언스: 정상 (미이행 0건)                                     │
│  - 1Q26 서류: 4/6 완료                                               │
│  - 다음 이벤트: 내부보고회 (04/28)                                    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 6. 구현 로드맵

### Phase A — 즉시 실행 (4주)

| 주차 | 작업 | 산출물 |
|------|------|--------|
| 1주 | ComplianceRule + ComplianceObligation 테이블 생성, 시드 데이터 입력, CRUD API | DB 마이그레이션, `/api/compliance/*` |
| 1주 | ComplianceEngine — 정기 의무 자동 생성 로직 | `services/compliance_engine.py` |
| 2주 | ComplianceEngine — 이벤트 드리븐 (투자/LP변경/배분) | 기존 라우터에 이벤트 훅 추가 |
| 2주 | 투자제한 사전 체크 로직 + Investment 생성 시 자동 실행 | `check_investment_limits()` |
| 3주 | D-01 후속관리보고서 빌더, D-02 운용지시서 빌더 | `document_builders/` 2종 |
| 3주 | D-03 출자증서 빌더, D-04 투심위 의사록 빌더 | `document_builders/` 2종 |
| 4주 | 컴플라이언스 대시보드 UI (프론트엔드) | `/compliance` 페이지 |
| 4주 | Task 자동생성 연동 (D-Day 기반) | Task 모듈 확장 |

### Phase B — 단기 확장 (4주)

| 주차 | 작업 | 산출물 |
|------|------|--------|
| 5주 | VICS 월보고 데이터 자동 산출 (1308/1309/1329) | `services/vics_report_service.py` |
| 5주 | VICS 엑셀 출력 | `/api/vics/reports/export-xlsx` |
| 6주 | InternalReview + CompanyReview 테이블, CRUD API | `/api/internal-reviews/*` |
| 6주 | 손상차손 자동 판별 연동 | `evaluate_impairment()` |
| 7주 | BizReportRequest 7종 서류 필드 확장 | DB 마이그레이션 |
| 7주 | 서류 수집 매트릭스 UI | BizReport 페이지 확장 |
| 8주 | D-05 내부보고회 통합보고서 빌더, D-06 서류요청 공문 빌더 | `document_builders/` 2종 |
| 8주 | 메인 대시보드 컴플라이언스 위젯 추가 | Dashboard 페이지 확장 |

### Phase C — 고도화 (필요 시)

| 작업 | 비고 |
|------|------|
| LP 보고서 자동생성 (반기/연간) | Fund 성과지표 (IRR, TVPI, DPI) 계산 연동 |
| 회사 프로필 DB화 | 현재 하드코딩된 회사 정보 → Company 테이블 |
| 알림 시스템 (이메일/슬랙) | D-3 알림을 push 방식으로 전환 |

---

## 7. 조합 마스터 데이터

### 7.1 운용 중인 조합 (8개)

| # | 조합명 | 약칭 | 상태 | 유형 | 피투자기업 수 |
|---|--------|------|------|------|------------|
| 01 | 미래수산식품투자조합 | 미래수산 | 운용 중 | 농식품 | 6개사 |
| 02 | 트리거 하이테크 1호 조합 | TH1 | 운용 중 | 벤처 | 1개사 (프로젝트) |
| 03 | 트리거 파마테크 2호 조합 | TP2 | 운용 중 | 벤처 | 1개사 (프로젝트) |
| 04 | 트리거-글로벌PEX투자조합 | TGP | 운용 중 | 벤처 | 8개사 |
| 05 | 나이스-트리거뉴챕터투자조합 | 뉴챕터 | 운용 중 | 벤처 | 3개사 |
| 06 | 미래수산밸류체인펀드 | 밸류체인 | 운용 중 | 농식품 | 3개사 |
| 07 | 트리거 메디테크 3호 조합 | TM3 | 결성 중 | 벤처 | - |
| 08 | 강원대-트리거 강원 미래성장 | 강원펀드 | 결성 중 | 벤처 | - |

**fund_type_filter 적용:**
- "농식품" 유형 조합: 미래수산, 밸류체인 → 농식품모태펀드 가이드라인 전체 적용
- "벤처" 유형 조합: TH1, TP2, TGP, 뉴챕터, TM3, 강원펀드 → 벤처펀드 가이드라인 적용
- "all" 룰: 모든 조합에 적용

### 7.2 피투자기업 (22개사 + 본계정 1건)

| 조합 | 피투자기업 | 투자유형 |
|------|-----------|---------|
| 미래수산 | (주)에이엠글로벌 | 블라인드 |
| 미래수산 | (주)광양이엔에스 | 블라인드 |
| 미래수산 | (주)에이스쿨링 | 블라인드 |
| 미래수산 | (주)지알환경산업 | 블라인드 |
| 미래수산 | (주)마루무역 | 블라인드 |
| 미래수산 | (주)밸류라움바이오 | 블라인드 |
| TH1 | (주)제이디솔루션 | 프로젝트 |
| TP2 | (주)씨엘팜 | 프로젝트 |
| TGP | (주)제이엘스탠다드 | 블라인드 |
| TGP | (주)퓨어 | 블라인드 |
| TGP | (주)저스트그린 | 블라인드 |
| TGP | (주)지오엔지 | 블라인드 |
| TGP | (주)에스앤디테크 | 블라인드 |
| TGP | 신선한생각농업회사법인(주) | 블라인드 |
| TGP | (주)페치 | 블라인드 |
| TGP | (주)더에잇이엔티 | 블라인드 |
| 뉴챕터 | (주)제이제이글로벌 | 블라인드 |
| 뉴챕터 | (주)팝쎈토이 | 블라인드 |
| 뉴챕터 | (주)플레이큐리오 | 블라인드 |
| 밸류체인 | (주)디엔엘그룹 | 블라인드 |
| 밸류체인 | (주)베리어스글로벌 | 블라인드 |
| 밸류체인 | (주)애쓰지마 | 블라인드 |
| 본계정 | 다름과이음 | 본계정 |

---

## 8. 범위 밖 (하지 않는 것)

| 항목 | 사유 |
|------|------|
| 제안서 관리 (04_제안) | HWP 정부 양식, 매년 변경. 폴더 유지. |
| 인사/총무/급여 | 10인 미만. 더존/알밤 등 외부 서비스. |
| 기획/홍보 | VC 백오피스 범위 아님. |
| 전자결재 | 1인 관리역. Task + 메모로 대체. |
| OCR 재무제표 파싱 | 형식 천차만별. 수기입력 + 이상치감지가 현실적. |
| 복식부기 회계 | 외부 회계법인 담당. 전표 초안까지만. |
| JWT 인증 | 단일 사용자. Phase C에서 필요 시. |
| Docker 배포 | Phase C. |
| OnlyOffice 연동 | Phase C. |

---

*본 문서는 농식품모태펀드 사후관리 가이드라인(26.01.22), 벤처펀드 사후관리 가이드라인 개정안(2512), VICS 월보고 가이드, 모태펀드 손상차손 가이드라인(250107), 자펀드 회계처리 가이드라인(240605), 그리고 트리거투자파트너스의 실제 업무 폴더/체크리스트/내부보고회 문서를 교차 분석하여 작성한 코딩 업무명세서이다. v2.0 대비 과잉 범위를 제거하고, 규제 컴플라이언스 엔진/VICS 월보고/내부보고회/손상차손 평가를 코딩 가능한 수준으로 상세화하였다.*
