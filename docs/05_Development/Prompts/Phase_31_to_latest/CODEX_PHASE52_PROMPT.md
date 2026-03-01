# Phase 52: 사전 보고 검증 (4유형 교차검증)

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P2  
**의존성:** Phase 49 (규칙엔진), Phase 51 (RAG 법률해석)  
**LLM:** ✅ (L2 검증 시 GPT-4o 사용)  
**예상 파일 수:** 7개 | **AC:** 8개

---

## Part 0. 전수조사 (필수)

- [ ] `backend/services/compliance_rule_engine.py` — Phase 49 규칙 엔진
- [ ] `backend/services/legal_rag.py` — Phase 51 RAG 서비스
- [ ] `backend/models/compliance.py` — ComplianceCheck 모델
- [ ] `backend/routers/reports.py` — 기존 보고서 API
- [ ] `backend/models/report.py` — Report 모델
- [ ] `frontend/src/pages/ReportsPage.tsx` — 기존 보고서 UI

---

## Part 1. 사전 검증 모델

#### [NEW] `backend/models/pre_report_check.py`

```python
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class PreReportCheck(Base):
    """보고서 사전 검증 결과"""
    __tablename__ = "pre_report_checks"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    report_id = Column(Integer, ForeignKey("reports.id", ondelete="CASCADE"), nullable=False)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    
    checked_at = Column(DateTime, server_default=func.now())
    overall_status = Column(String, nullable=False)     # pass, warning, error
    
    # 4유형 각각의 결과
    legal_check = Column(JSON, nullable=True)           # 법적 오류 검증 결과
    cross_check = Column(JSON, nullable=True)           # 교차 검증 결과
    guideline_check = Column(JSON, nullable=True)       # 가이드라인 검증 결과
    contract_check = Column(JSON, nullable=True)        # 계약 일치성 검증 결과
    
    total_errors = Column(Integer, default=0)
    total_warnings = Column(Integer, default=0)
    total_info = Column(Integer, default=0)
    
    # 시정 Task 생성 건수
    tasks_created = Column(Integer, default=0)
    
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
```

---

## Part 2. 사전 검증 서비스

#### [NEW] `backend/services/pre_report_checker.py`

```python
from sqlalchemy.orm import Session
from models.pre_report_check import PreReportCheck
from models.report import Report
from models.fund import Fund
from models.lp import LP
from services.compliance_rule_engine import ComplianceRuleEngine


class PreReportChecker:
    """보고서 제출 전 4유형 교차 검증
    
    Type 1: 법적 오류 — 법률 위반 여부
    Type 2: 교차 검증 — 데이터 정합성
    Type 3: 가이드라인 — 내부 지침 준수
    Type 4: 계약 일치성 — 규약/계약 대비
    """
    
    def __init__(self):
        self.rule_engine = ComplianceRuleEngine()
    
    def check_all(self, report_id: int, fund_id: int, db: Session) -> PreReportCheck:
        """4유형 검증 실행"""
        report = db.query(Report).get(report_id)
        fund = db.query(Fund).get(fund_id)
        
        legal = self._check_legal(report, fund, db)
        cross = self._check_cross_validation(report, fund, db)
        guideline = self._check_guideline(report, fund, db)
        contract = self._check_contract(report, fund, db)
        
        # 합산
        all_findings = legal + cross + guideline + contract
        errors = [f for f in all_findings if f["severity"] == "error"]
        warnings = [f for f in all_findings if f["severity"] == "warning"]
        infos = [f for f in all_findings if f["severity"] == "info"]
        
        overall = "error" if errors else ("warning" if warnings else "pass")
        
        # 시정 Task 생성 (error 건만)
        tasks_created = 0
        if errors:
            tasks_created = self._create_remediation_tasks(errors, fund_id, report_id, db)
        
        result = PreReportCheck(
            report_id=report_id,
            fund_id=fund_id,
            overall_status=overall,
            legal_check=legal,
            cross_check=cross,
            guideline_check=guideline,
            contract_check=contract,
            total_errors=len(errors),
            total_warnings=len(warnings),
            total_info=len(infos),
            tasks_created=tasks_created,
        )
        db.add(result)
        db.commit()
        
        return result
    
    def _check_legal(self, report, fund, db) -> list[dict]:
        """Type 1: 법적 오류 검증
        
        - 투자한도 초과 여부
        - 필수 보고 항목 누락
        - 법정 기한 준수
        """
        findings = []
        
        # 투자한도 체크
        from models.investment import Investment
        investments = db.query(Investment).filter_by(fund_id=fund.id).all()
        for inv in investments:
            if fund.commitment_total and fund.commitment_total > 0:
                ratio = (inv.amount or 0) / fund.commitment_total
                if ratio > 0.20:
                    findings.append({
                        "type": "legal",
                        "severity": "error",
                        "title": "동일기업 투자한도 초과",
                        "detail": f"{inv.company_name}: {ratio:.1%} (한도 20%)",
                        "reference": "자본시장법 제81조",
                    })
        
        return findings
    
    def _check_cross_validation(self, report, fund, db) -> list[dict]:
        """Type 2: 교차 검증 — 데이터 정합성
        
        - LP 출자금 합계 = 약정총액
        - 투자금 합계 ≤ 운용자산
        - 기간별 수익률 계산 정합성
        """
        findings = []
        
        # LP 출자금 합계 검증
        lps = db.query(LP).filter_by(fund_id=fund.id).all()
        lp_sum = sum(lp.commitment_amount or 0 for lp in lps)
        
        if fund.commitment_total and abs(lp_sum - fund.commitment_total) > 1:
            findings.append({
                "type": "cross",
                "severity": "error",
                "title": "LP 출자약정 합계 불일치",
                "detail": f"LP 합계: {lp_sum:,.0f} ≠ 약정총액: {fund.commitment_total:,.0f}",
                "difference": abs(lp_sum - fund.commitment_total),
            })
        
        # 투자금 합계 ≤ 약정총액
        from models.investment import Investment
        inv_total = db.query(func.sum(Investment.amount)).filter_by(fund_id=fund.id).scalar() or 0
        if fund.commitment_total and inv_total > fund.commitment_total:
            findings.append({
                "type": "cross",
                "severity": "warning",
                "title": "투자 합계 > 약정총액",
                "detail": f"투자합계: {inv_total:,.0f} > 약정총액: {fund.commitment_total:,.0f}",
            })
        
        return findings
    
    def _check_guideline(self, report, fund, db) -> list[dict]:
        """Type 3: 가이드라인 — 내부 지침 준수
        
        - 보고서 필수 항목 포함 여부
        - 양식 규격 준수
        - 승인 절차 완료 여부
        """
        findings = []
        
        # 보고서 상태 체크
        if report.status not in ("approved", "submitted"):
            findings.append({
                "type": "guideline",
                "severity": "warning",
                "title": "보고서 미승인",
                "detail": f"현재 상태: {report.status} — 제출 전 승인 필요",
            })
        
        return findings
    
    def _check_contract(self, report, fund, db) -> list[dict]:
        """Type 4: 계약 일치성 — 규약/계약 대비
        
        - 분배비율 규약 일치
        - 관리보수율 계약 일치
        - 존속기한 확인
        """
        findings = []
        
        # 존속기한 경과 체크
        from datetime import date
        if fund.expiration_date and fund.expiration_date < date.today():
            findings.append({
                "type": "contract",
                "severity": "warning",
                "title": "조합 존속기한 경과",
                "detail": f"존속기한: {fund.expiration_date} — 연장 결의 필요",
            })
        
        return findings
    
    def _create_remediation_tasks(self, errors, fund_id, report_id, db) -> int:
        """error 건에 대해 시정 Task 자동 생성"""
        from models.task import Task
        count = 0
        for error in errors:
            task = Task(
                title=f"[보고서검증] {error['title']}",
                description=f"보고서 ID: {report_id}\n{error['detail']}\n참조: {error.get('reference', '')}",
                fund_id=fund_id,
                category="보고서검증",
                priority="high",
                status="pending",
            )
            db.add(task)
            count += 1
        return count
```

---

## Part 3. API

#### [MODIFY] `backend/routers/reports.py`

```python
@router.post("/api/reports/{report_id}/pre-check")
def run_pre_report_check(
    report_id: int,
    db: Session = Depends(get_db),
):
    """보고서 사전 검증 실행
    
    Returns:
        {
            "overall_status": "warning",
            "total_errors": 1,
            "total_warnings": 2,
            "total_info": 0,
            "legal_check": [...],
            "cross_check": [...],
            "guideline_check": [...],
            "contract_check": [...],
            "tasks_created": 1,
        }
    """
    report = db.query(Report).get(report_id)
    checker = PreReportChecker()
    return checker.check_all(report_id, report.fund_id, db)

@router.get("/api/reports/{report_id}/pre-checks")
def get_pre_report_checks(
    report_id: int,
    db: Session = Depends(get_db),
):
    """보고서의 사전 검증 이력"""
    return db.query(PreReportCheck).filter_by(report_id=report_id).order_by(
        PreReportCheck.checked_at.desc()
    ).all()
```

---

## Part 4. 프론트엔드

#### [MODIFY] `frontend/src/pages/ReportsPage.tsx`

보고서 상세 페이지에 사전 검증 영역 추가:

```
┌─ 보고서 상세: 2026년 1월 월보고 ─────────────────────┐
│                                                       │
│  [기존 보고서 내용...]                                 │
│                                                       │
│  ── 사전 검증 ──                                      │
│  [🔍 검증 실행]                                       │
│                                                       │
│  결과: ⚠️ 경고 2건, ❌ 오류 1건                        │
│                                                       │
│  ❌ 법적 오류                                         │
│  ├ 동일기업 투자한도 초과: 인앤솔루션 22.3% (한도 20%)  │
│  │ 참조: 자본시장법 제81조                             │
│  │ → 시정 Task 생성됨 ✅                               │
│                                                       │
│  ⚠️ 교차 검증                                         │
│  ├ LP 출자약정 합계 불일치: 차이 500만원                │
│                                                       │
│  ⚠️ 계약 일치성                                       │
│  ├ 조합 존속기한 경과: 2025-12-31                      │
│                                                       │
│  ✅ 가이드라인: 이상 없음                               │
└───────────────────────────────────────────────────────┘
```

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [NEW] | `backend/models/pre_report_check.py` | PreReportCheck 모델 |
| 2 | [NEW] | `backend/services/pre_report_checker.py` | 4유형 검증 서비스 |
| 3 | [MODIFY] | `backend/routers/reports.py` | 사전검증 API 추가 |
| 4 | [MODIFY] | `backend/models/__init__.py` | PreReportCheck 등록 |
| 5 | [MODIFY] | `frontend/src/pages/ReportsPage.tsx` | 검증 UI 추가 |
| 6 | [MODIFY] | `frontend/src/lib/api.ts` | 사전검증 API 함수 |
| 7 | [NEW] | `backend/schemas/pre_report_check.py` | 요청/응답 스키마 |

---

## Acceptance Criteria

- [ ] **AC-01:** 법적 오류 검증이 실행된다 (투자한도 초과 감지).
- [ ] **AC-02:** 교차 검증이 실행된다 (LP 합계 ≠ 약정총액 감지).
- [ ] **AC-03:** 가이드라인 검증이 실행된다 (미승인 보고서 경고).
- [ ] **AC-04:** 계약 일치성 검증이 실행된다 (존속기한 경과 경고).
- [ ] **AC-05:** severity=error인 건에 대해 시정 Task가 자동 생성된다.
- [ ] **AC-06:** 검증 결과가 PreReportCheck에 저장되고 이력 조회가 가능하다.
- [ ] **AC-07:** UI에서 검증 실행 + 결과 4유형별 표시가 동작한다.
- [ ] **AC-08:** 기존 보고서 CRUD 기능이 유지된다.
