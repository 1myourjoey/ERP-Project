# Phase 49: 준법감시 규칙 엔진 (L1~L5 규칙)

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P1  
**의존성:** Phase 44  
**LLM:** ❌ 불필요 (규칙 기반)  
**예상 파일 수:** 10개 | **AC:** 8개

---

## Part 0. 전수조사 (필수)

- [ ] `backend/models/fund.py` — Fund 모델 (fund_type, commitment_total 등)
- [ ] `backend/models/investment.py` — Investment 모델
- [ ] `backend/models/lp.py` — LP 모델
- [ ] `backend/routers/investments.py` — 투자 API (트리거 삽입 대상)
- [ ] `backend/routers/funds.py` — 조합 API (트리거 삽입 대상)
- [ ] `frontend/src/pages/CompliancePage.tsx` — 기존 컴플라이언스 UI

---

## Part 1. 컴플라이언스 모델

#### [NEW] `backend/models/compliance.py`

```python
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String, Text, ForeignKey, Boolean, Float, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class ComplianceDocument(Base):
    """법규/규약 문서 메타데이터"""
    __tablename__ = "compliance_documents"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)              # "자본시장법", "벤처투자법" 등
    document_type = Column(String, nullable=False)       # law, regulation, guideline, agreement, internal
    version = Column(String, nullable=True)              # "2024-01-01 개정"
    effective_date = Column(DateTime, nullable=True)     # 시행일
    content_summary = Column(Text, nullable=True)
    file_path = Column(String, nullable=True)            # 원본 파일 경로
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    
    rules = relationship("FundComplianceRule", back_populates="document")


class FundComplianceRule(Base):
    """조합별 준수 규칙 (L1~L5)"""
    __tablename__ = "fund_compliance_rules"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id", ondelete="CASCADE"), nullable=True)  # NULL이면 전체 적용
    document_id = Column(Integer, ForeignKey("compliance_documents.id"), nullable=True)
    
    # 규칙 정의
    rule_code = Column(String, nullable=False, unique=True)   # "INV-LIMIT-001"
    rule_name = Column(String, nullable=False)                 # "동일 기업 투자한도"
    level = Column(String, nullable=False)                     # L1, L2, L3, L4, L5
    category = Column(String, nullable=False)                  # investment, reporting, capital, governance
    description = Column(Text, nullable=True)
    
    # 규칙 조건 (JSON)
    condition = Column(JSON, nullable=False)
    # L1: {"type": "exists", "target": "document", "document_type": "수탁계약"}
    # L2: {"type": "range", "target": "investment_ratio", "max": 0.20}
    # L3: {"type": "deadline", "target": "report", "days_before": 7}
    # L4: {"type": "cross_validate", "source": "lp_commitment_sum", "target": "fund_commitment_total"}
    # L5: {"type": "composite", "rules": ["INV-LIMIT-001", "REL-PARTY-001"]}
    
    # 액션
    severity = Column(String, default="warning")          # info, warning, error, critical
    auto_task = Column(Boolean, default=False)             # 위반 시 자동 Task 생성
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    
    document = relationship("ComplianceDocument", back_populates="rules")
    checks = relationship("ComplianceCheck", back_populates="rule")


class ComplianceCheck(Base):
    """감사 로그 — 규칙 점검 기록"""
    __tablename__ = "compliance_checks"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_id = Column(Integer, ForeignKey("fund_compliance_rules.id"), nullable=False)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    
    checked_at = Column(DateTime, server_default=func.now())
    result = Column(String, nullable=False)                # pass, fail, warning, error
    actual_value = Column(String, nullable=True)           # 실제 값
    threshold_value = Column(String, nullable=True)        # 기준 값
    detail = Column(Text, nullable=True)                   # 상세 사유
    
    # 트리거 정보
    trigger_type = Column(String, nullable=True)           # manual, event, scheduled
    trigger_source = Column(String, nullable=True)         # "investment_create", "fund_update" 등
    trigger_source_id = Column(Integer, nullable=True)     # 트리거 원본 ID
    
    # 시정 Task 연결
    remediation_task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    
    rule = relationship("FundComplianceRule", back_populates="checks")
```

---

## Part 2. 규칙 엔진

#### [NEW] `backend/services/compliance_rule_engine.py`

```python
from sqlalchemy.orm import Session
from models.compliance import FundComplianceRule, ComplianceCheck
from models.fund import Fund
from models.investment import Investment


class ComplianceRuleEngine:
    """L1~L5 준법감시 규칙 평가 엔진"""
    
    def evaluate_rule(self, rule: FundComplianceRule, fund_id: int, db: Session) -> ComplianceCheck:
        """단일 규칙 평가 → ComplianceCheck 기록 반환"""
        condition = rule.condition
        rule_type = condition.get("type")
        
        if rule_type == "exists":
            return self._evaluate_l1_exists(rule, fund_id, condition, db)
        elif rule_type == "range":
            return self._evaluate_l2_range(rule, fund_id, condition, db)
        elif rule_type == "deadline":
            return self._evaluate_l3_deadline(rule, fund_id, condition, db)
        elif rule_type == "cross_validate":
            return self._evaluate_l4_cross(rule, fund_id, condition, db)
        elif rule_type == "composite":
            return self._evaluate_l5_composite(rule, fund_id, condition, db)
        else:
            raise ValueError(f"Unknown rule type: {rule_type}")
    
    def evaluate_all(self, fund_id: int, db: Session, trigger_type: str = "manual") -> list[ComplianceCheck]:
        """조합의 전체 활성 규칙 평가"""
        rules = db.query(FundComplianceRule).filter(
            (FundComplianceRule.fund_id == fund_id) | (FundComplianceRule.fund_id.is_(None)),
            FundComplianceRule.is_active == True,
        ).all()
        
        results = []
        for rule in rules:
            check = self.evaluate_rule(rule, fund_id, db)
            check.trigger_type = trigger_type
            db.add(check)
            results.append(check)
            
            # 위반 시 자동 Task 생성
            if check.result in ("fail", "error") and rule.auto_task:
                self._create_remediation_task(check, rule, fund_id, db)
        
        db.commit()
        return results
    
    def _evaluate_l1_exists(self, rule, fund_id, condition, db) -> ComplianceCheck:
        """L1: 존재 여부 체크 (예: 수탁계약 존재 확인)"""
        target = condition.get("target")
        # 예: documents 테이블에서 해당 문서유형 존재 확인
        ...
    
    def _evaluate_l2_range(self, rule, fund_id, condition, db) -> ComplianceCheck:
        """L2: 수치 범위 검증 (예: 투자한도 20% 초과 여부)"""
        target = condition.get("target")
        max_val = condition.get("max")
        
        if target == "investment_ratio":
            fund = db.query(Fund).get(fund_id)
            # 각 투자건의 비율 계산
            investments = db.query(Investment).filter_by(fund_id=fund_id).all()
            for inv in investments:
                ratio = inv.amount / fund.commitment_total if fund.commitment_total else 0
                if ratio > max_val:
                    return ComplianceCheck(
                        rule_id=rule.id, fund_id=fund_id,
                        result="fail",
                        actual_value=f"{ratio:.2%}",
                        threshold_value=f"{max_val:.2%}",
                        detail=f"{inv.company_name} 투자비율 {ratio:.2%} > 한도 {max_val:.2%}",
                    )
        
        return ComplianceCheck(rule_id=rule.id, fund_id=fund_id, result="pass")
    
    def _evaluate_l3_deadline(self, rule, fund_id, condition, db) -> ComplianceCheck:
        """L3: 기한 기반 (예: 보고서 제출 D-7)"""
        ...
    
    def _evaluate_l4_cross(self, rule, fund_id, condition, db) -> ComplianceCheck:
        """L4: 교차 검증 (예: LP 출자금 합계 = 약정총액)"""
        ...
    
    def _evaluate_l5_composite(self, rule, fund_id, condition, db) -> ComplianceCheck:
        """L5: 복합 조건 (여러 규칙 AND/OR 조합)"""
        ...
    
    def _create_remediation_task(self, check, rule, fund_id, db):
        """위반 시 시정 Task 자동 생성"""
        from models.task import Task
        task = Task(
            title=f"[컴플라이언스] {rule.rule_name} 위반 시정",
            description=check.detail,
            fund_id=fund_id,
            category="컴플라이언스",
            priority="high",
            status="pending",
        )
        db.add(task)
        db.flush()
        check.remediation_task_id = task.id
```

---

## Part 3. ERP 이벤트 트리거

#### [MODIFY] `backend/routers/investments.py`

투자 생성/수정 시 컴플라이언스 자동 체크:

```python
# 투자 생성 API 내부에 추가
@router.post("/api/investments")
def create_investment(...):
    # ... 기존 투자 생성 로직 ...
    
    # 컴플라이언스 자동 체크
    from services.compliance_rule_engine import ComplianceRuleEngine
    engine = ComplianceRuleEngine()
    checks = engine.evaluate_all(
        fund_id=investment.fund_id,
        db=db,
        trigger_type="event",
    )
    
    # 위반 있으면 응답에 경고 포함
    violations = [c for c in checks if c.result in ("fail", "error")]
    if violations:
        # 투자는 생성하되 경고 반환
        ...
```

#### [MODIFY] `backend/routers/funds.py`

조합 변경 시에도 동일 패턴.

---

## Part 4. API

#### [MODIFY] `backend/routers/compliance.py`

```python
# 규칙 CRUD
GET    /api/compliance/rules?fund_id=             # 규칙 목록
POST   /api/compliance/rules                       # 규칙 생성
PUT    /api/compliance/rules/{id}                  # 규칙 수정
DELETE /api/compliance/rules/{id}                  # 규칙 삭제

# 점검 실행
POST   /api/compliance/check/{fund_id}             # 수동 점검 실행
GET    /api/compliance/checks?fund_id=&limit=      # 점검 기록 조회

# 문서 관리
GET    /api/compliance/documents                   # 법규 문서 목록
POST   /api/compliance/documents                   # 법규 문서 등록

# 대시보드 (기존 확장)
GET    /api/compliance/dashboard                   # 현황 요약
```

---

## Part 5. 프론트엔드

#### [MODIFY] `frontend/src/pages/CompliancePage.tsx`

기존 페이지에 탭 추가:
- **규칙 관리** 탭: 규칙 CRUD + L1~L5 필터  
- **점검 기록** 탭: ComplianceCheck 타임라인  
- **수동 점검** 버튼: 선택한 조합 전체 규칙 실행  

---

## Part 6. 초기 규칙 시드

#### [NEW] `backend/seeds/compliance_rules.py`

```python
DEFAULT_COMPLIANCE_RULES = [
    {
        "rule_code": "INV-LIMIT-001",
        "rule_name": "동일 기업 투자한도 (20%)",
        "level": "L2",
        "category": "investment",
        "condition": {"type": "range", "target": "investment_ratio", "max": 0.20},
        "severity": "error",
        "auto_task": True,
    },
    {
        "rule_code": "DOC-EXIST-001",
        "rule_name": "수탁계약 존재 확인",
        "level": "L1",
        "category": "governance",
        "condition": {"type": "exists", "target": "document", "document_type": "수탁계약"},
        "severity": "warning",
    },
    {
        "rule_code": "RPT-DEADLINE-001",
        "rule_name": "분기 보고서 제출 기한 (D-7 경고)",
        "level": "L3",
        "category": "reporting",
        "condition": {"type": "deadline", "target": "quarterly_report", "days_before": 7},
        "severity": "warning",
        "auto_task": True,
    },
    {
        "rule_code": "CAP-CROSS-001",
        "rule_name": "출자금 합계 정합성",
        "level": "L4",
        "category": "capital",
        "condition": {"type": "cross_validate", "source": "lp_commitment_sum", "target": "fund_commitment_total"},
        "severity": "error",
    },
    # ... 기본 10~15개 규칙
]
```

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [NEW] | `backend/models/compliance.py` | ComplianceDocument, FundComplianceRule, ComplianceCheck |
| 2 | [NEW] | `backend/services/compliance_rule_engine.py` | L1~L5 규칙 평가 엔진 |
| 3 | [MODIFY] | `backend/routers/compliance.py` | 규칙 CRUD + 점검 API 확장 |
| 4 | [MODIFY] | `backend/routers/investments.py` | 투자 시 자동 체크 트리거 |
| 5 | [MODIFY] | `backend/routers/funds.py` | 조합 변경 시 체크 트리거 |
| 6 | [NEW] | `backend/seeds/compliance_rules.py` | 기본 규칙 시드 |
| 7 | [MODIFY] | `backend/models/__init__.py` | 컴플라이언스 모델 등록 |
| 8 | [MODIFY] | `backend/main.py` | 시드 실행 |
| 9 | [MODIFY] | `frontend/src/pages/CompliancePage.tsx` | 규칙관리+점검기록 탭 |
| 10 | [MODIFY] | `frontend/src/lib/api.ts` | 컴플라이언스 API 함수 |

---

## Acceptance Criteria

- [ ] **AC-01:** L1 규칙(존재 체크)이 동작한다 — 수탁계약 미존재 시 warning.
- [ ] **AC-02:** L2 규칙(수치 범위)이 동작한다 — 투자비율 20% 초과 시 error.
- [ ] **AC-03:** L3 규칙(기한)이 동작한다 — 보고서 D-7 시 warning.
- [ ] **AC-04:** L4 규칙(교차 검증)이 동작한다 — LP 합계 ≠ 약정총액 시 error.
- [ ] **AC-05:** 투자 생성 시 관련 규칙이 자동으로 점검된다.
- [ ] **AC-06:** 위반 시 severity=error이고 auto_task=true이면 시정 Task가 자동 생성된다.
- [ ] **AC-07:** ComplianceCheck에 점검 결과가 감사 로그로 기록된다.
- [ ] **AC-08:** UI에서 규칙 관리(CRUD)와 점검 기록 조회가 가능하다.
