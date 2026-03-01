# Phase 54: 히스토리 학습 + 업무 효율

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P2  
**의존성:** Phase 49 (규칙엔진), Phase 53 (정기스캔) — 이력 데이터 축적 전제  
**LLM:** ❌ (통계/분석 기반)  
**예상 파일 수:** 9개 | **AC:** 8개

---

## Part 0. 전수조사 (필수)

- [ ] `backend/models/compliance.py` — ComplianceCheck (점검 이력), FundComplianceRule
- [ ] `backend/services/compliance_rule_engine.py` — 규칙 평가
- [ ] `backend/services/periodic_compliance_scanner.py` — 정기 스캔
- [ ] `backend/routers/compliance.py` — 기존 API
- [ ] `frontend/src/pages/CompliancePage.tsx` — 기존 UI

---

## Part 1. 이력 분석 서비스

#### [NEW] `backend/services/compliance_history_analyzer.py`

```python
from datetime import datetime, timedelta
from collections import Counter, defaultdict
from sqlalchemy.orm import Session
from sqlalchemy import func as sqla_func

from models.compliance import ComplianceCheck, FundComplianceRule
from models.fund import Fund
from models.task import Task


class ComplianceHistoryAnalyzer:
    """점검 이력 분석 — 패턴 감지, 규칙 효율화 제안, 리포트 생성"""
    
    def analyze_violation_patterns(self, fund_id: int, db: Session, months: int = 6) -> dict:
        """반복 위반 패턴 분석
        
        Returns:
            {
                "recurring_violations": [
                    {
                        "rule_code": "INV-LIMIT-001",
                        "rule_name": "투자한도 초과",
                        "violation_count": 5,
                        "months_violated": ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02"],
                        "severity": "error",
                        "pattern": "매월 반복",
                        "recommendation": "투자 의사결정 프로세스 점검 필요"
                    }
                ],
                "improving_areas": [...],   # 위반 감소 추세
                "worsening_areas": [...],   # 위반 증가 추세
            }
        """
        since = datetime.now() - timedelta(days=months * 30)
        
        checks = db.query(ComplianceCheck).filter(
            ComplianceCheck.fund_id == fund_id,
            ComplianceCheck.checked_at >= since,
        ).all()
        
        # 규칙별 위반 이력 집계
        rule_violations = defaultdict(list)
        for check in checks:
            if check.result in ("fail", "error"):
                month_key = check.checked_at.strftime("%Y-%m")
                rule_violations[check.rule_id].append(month_key)
        
        recurring = []
        for rule_id, months_list in rule_violations.items():
            unique_months = sorted(set(months_list))
            if len(unique_months) >= 2:  # 2개월 이상 반복
                rule = db.query(FundComplianceRule).get(rule_id)
                recurring.append({
                    "rule_code": rule.rule_code,
                    "rule_name": rule.rule_name,
                    "violation_count": len(months_list),
                    "months_violated": unique_months,
                    "severity": rule.severity,
                    "pattern": self._detect_pattern(unique_months),
                    "recommendation": self._generate_recommendation(rule, len(unique_months)),
                })
        
        return {
            "recurring_violations": sorted(recurring, key=lambda x: x["violation_count"], reverse=True),
            "improving_areas": self._find_improving(checks, since),
            "worsening_areas": self._find_worsening(checks, since),
        }
    
    def _detect_pattern(self, months: list[str]) -> str:
        """위반 패턴 감지"""
        if len(months) >= 6:
            return "지속적 반복 (6개월+)"
        elif len(months) >= 3:
            # 연속 여부 체크
            return "매월 반복" if self._is_consecutive(months) else "간헐적 반복"
        else:
            return "2회 발생"
    
    def _is_consecutive(self, months: list[str]) -> bool:
        """월이 연속인지 확인"""
        for i in range(1, len(months)):
            y1, m1 = map(int, months[i-1].split("-"))
            y2, m2 = map(int, months[i].split("-"))
            expected = (y1 * 12 + m1) + 1
            actual = y2 * 12 + m2
            if expected != actual:
                return False
        return True
    
    def _generate_recommendation(self, rule, count) -> str:
        """위반 횟수에 따른 권고사항"""
        if count >= 5:
            return f"{rule.rule_name} 반복 위반 심각 — 근본 원인 분석 및 프로세스 개선 필요"
        elif count >= 3:
            return f"{rule.rule_name} 반복 추세 — 담당자 교육 또는 자동화 도입 권고"
        else:
            return f"{rule.rule_name} 주의 필요"
    
    def _find_improving(self, checks, since):
        """위반 감소 추세 영역"""
        ...
    
    def _find_worsening(self, checks, since):
        """위반 증가 추세 영역"""
        ...


    def suggest_rule_adjustments(self, db: Session) -> list[dict]:
        """규칙 우선순위/빈도 자동 조정 제안
        
        - 위반 0건 규칙 → 점검 빈도 축소 제안
        - 반복 위반 규칙 → severity 격상 제안
        - 신규 법률 관련 규칙 → 추가 제안
        """
        rules = db.query(FundComplianceRule).filter_by(is_active=True).all()
        suggestions = []
        
        for rule in rules:
            six_months_ago = datetime.now() - timedelta(days=180)
            violation_count = db.query(ComplianceCheck).filter(
                ComplianceCheck.rule_id == rule.id,
                ComplianceCheck.result.in_(["fail", "error"]),
                ComplianceCheck.checked_at >= six_months_ago,
            ).count()
            
            total_checks = db.query(ComplianceCheck).filter(
                ComplianceCheck.rule_id == rule.id,
                ComplianceCheck.checked_at >= six_months_ago,
            ).count()
            
            if total_checks >= 10 and violation_count == 0:
                suggestions.append({
                    "rule_code": rule.rule_code,
                    "rule_name": rule.rule_name,
                    "current_level": rule.level,
                    "suggestion": "frequency_reduce",
                    "detail": f"6개월간 {total_checks}회 점검, 위반 0건 — 점검 빈도 축소 제안",
                })
            elif violation_count >= 5:
                suggestions.append({
                    "rule_code": rule.rule_code,
                    "rule_name": rule.rule_name,
                    "current_severity": rule.severity,
                    "suggestion": "severity_upgrade",
                    "detail": f"6개월간 {violation_count}회 위반 — severity 격상 제안 ({rule.severity} → error)",
                })
        
        return suggestions


    def get_remediation_stats(self, fund_id: int | None, db: Session) -> dict:
        """시정 Task 추적 통계
        
        Returns:
            {
                "total_tasks": 15,
                "completed": 10,
                "pending": 5,
                "completion_rate": 66.7,
                "avg_resolution_days": 3.2,
                "overdue_tasks": [...]
            }
        """
        query = db.query(ComplianceCheck).filter(
            ComplianceCheck.remediation_task_id.isnot(None)
        )
        if fund_id:
            query = query.filter(ComplianceCheck.fund_id == fund_id)
        
        checks_with_tasks = query.all()
        
        total = len(checks_with_tasks)
        completed = sum(1 for c in checks_with_tasks if c.resolved_at is not None)
        
        # 평균 시정 소요일
        resolution_days = []
        for c in checks_with_tasks:
            if c.resolved_at and c.checked_at:
                delta = (c.resolved_at - c.checked_at).days
                resolution_days.append(delta)
        
        avg_days = sum(resolution_days) / max(len(resolution_days), 1) if resolution_days else 0
        
        # 미완료 + 기한 초과 Task
        overdue = []
        for c in checks_with_tasks:
            if c.resolved_at is None:
                days_open = (datetime.now() - c.checked_at).days
                if days_open > 7:
                    task = db.query(Task).get(c.remediation_task_id)
                    overdue.append({
                        "task_id": c.remediation_task_id,
                        "task_title": task.title if task else "",
                        "days_open": days_open,
                        "rule_name": db.query(FundComplianceRule).get(c.rule_id).rule_name if c.rule_id else "",
                    })
        
        return {
            "total_tasks": total,
            "completed": completed,
            "pending": total - completed,
            "completion_rate": round(completed / max(total, 1) * 100, 1),
            "avg_resolution_days": round(avg_days, 1),
            "overdue_tasks": overdue,
        }
    

    def generate_monthly_report(self, fund_id: int, year_month: str, db: Session) -> dict:
        """월간 준법감시 리포트 자동 생성
        
        Returns:
            {
                "fund_name": "A조합",
                "period": "2026-02",
                "summary": { "total_checks": 45, "pass": 42, "fail": 2, "warning": 1 },
                "violations": [...],
                "recurring_patterns": [...],
                "remediation_status": {...},
                "recommendations": [...],
                "trend_vs_last_month": { "improved": 2, "worsened": 1, "unchanged": 42 },
            }
        """
        year, month = map(int, year_month.split("-"))
        start_date = datetime(year, month, 1)
        if month == 12:
            end_date = datetime(year + 1, 1, 1)
        else:
            end_date = datetime(year, month + 1, 1)
        
        fund = db.query(Fund).get(fund_id)
        
        checks = db.query(ComplianceCheck).filter(
            ComplianceCheck.fund_id == fund_id,
            ComplianceCheck.checked_at >= start_date,
            ComplianceCheck.checked_at < end_date,
        ).all()
        
        violations = [c for c in checks if c.result in ("fail", "error")]
        
        return {
            "fund_name": fund.name if fund else "",
            "period": year_month,
            "summary": {
                "total_checks": len(checks),
                "pass": sum(1 for c in checks if c.result == "pass"),
                "fail": sum(1 for c in checks if c.result in ("fail", "error")),
                "warning": sum(1 for c in checks if c.result == "warning"),
            },
            "violations": [{
                "rule_name": db.query(FundComplianceRule).get(v.rule_id).rule_name if v.rule_id else "",
                "detail": v.detail,
                "checked_at": str(v.checked_at),
            } for v in violations],
            "recurring_patterns": self.analyze_violation_patterns(fund_id, db, months=3)["recurring_violations"],
            "remediation_status": self.get_remediation_stats(fund_id, db),
            "recommendations": self.suggest_rule_adjustments(db),
        }
```

---

## Part 2. API

#### [MODIFY] `backend/routers/compliance.py`

```python
@router.get("/api/compliance/history/patterns")
def get_violation_patterns(
    fund_id: int,
    months: int = 6,
    db: Session = Depends(get_db),
):
    """반복 위반 패턴 조회"""
    analyzer = ComplianceHistoryAnalyzer()
    return analyzer.analyze_violation_patterns(fund_id, db, months)

@router.get("/api/compliance/history/suggestions")
def get_rule_suggestions(db: Session = Depends(get_db)):
    """규칙 조정 제안 조회"""
    analyzer = ComplianceHistoryAnalyzer()
    return analyzer.suggest_rule_adjustments(db)

@router.get("/api/compliance/history/remediation")
def get_remediation_stats(
    fund_id: int | None = None,
    db: Session = Depends(get_db),
):
    """시정 Task 추적 통계"""
    analyzer = ComplianceHistoryAnalyzer()
    return analyzer.get_remediation_stats(fund_id, db)

@router.get("/api/compliance/report/monthly")
def get_monthly_report(
    fund_id: int,
    year_month: str,
    db: Session = Depends(get_db),
):
    """월간 준법감시 리포트"""
    analyzer = ComplianceHistoryAnalyzer()
    return analyzer.generate_monthly_report(fund_id, year_month, db)

@router.get("/api/compliance/report/monthly/download")
def download_monthly_report(
    fund_id: int,
    year_month: str,
    db: Session = Depends(get_db),
):
    """월간 리포트 엑셀 다운로드"""
    ...
```

---

## Part 3. 프론트엔드

#### [NEW] `frontend/src/components/compliance/ViolationPatterns.tsx`

```
┌─ 반복 위반 패턴 ──────────────────────────────────┐
│                                                    │
│  🔴 투자한도 초과 — 5회 반복 (매월)                 │
│  위반 월: 10월, 11월, 12월, 1월, 2월               │
│  권고: 투자 의사결정 프로세스 점검 필요              │
│                                                    │
│  🟡 보고서 제출 지연 — 3회 반복                     │
│  위반 월: 11월, 1월, 2월                           │
│  권고: 담당자 교육 도입 권고                        │
│                                                    │
│  📈 개선 추세: LP 출자금 정합성 (3개월 연속 pass)    │
│  📉 악화 추세: 관리보수 계산 오류 (증가 추세)        │
└────────────────────────────────────────────────────┘
```

#### [NEW] `frontend/src/components/compliance/RuleSuggestions.tsx`

```
┌─ 규칙 조정 제안 ──────────────────────────────────┐
│                                                    │
│  💡 빈도 축소 제안:                                │
│  ├ DOC-EXIST-003: 6개월 45회 점검, 위반 0건        │
│  │ → 점검 빈도 일간→주간 축소 [적용]                │
│                                                    │
│  ⬆️ 격상 제안:                                     │
│  ├ INV-LIMIT-001: 6개월 5회 위반                   │
│  │ → severity warning→error 격상 [적용]            │
└────────────────────────────────────────────────────┘
```

#### [NEW] `frontend/src/components/compliance/RemediationTracker.tsx`

```
┌─ 시정 Task 추적 ──────────────────────────────────┐
│                                                    │
│  전체 15건 | ✅ 완료 10건 | ⏳ 진행중 5건           │
│  완료율: 66.7% | 평균 시정 소요: 3.2일              │
│                                                    │
│  ⚠️ 기한 초과 Task:                                │
│  ├ [컴플라이언스] 투자한도 초과 시정 — 12일 경과     │
│  ├ [컴플라이언스] 보고서 미제출 — 8일 경과           │
└────────────────────────────────────────────────────┘
```

#### [NEW] `frontend/src/components/compliance/MonthlyReport.tsx`

```
┌─ 월간 준법감시 리포트 ─────────────────────────────┐
│                                                     │
│  조합: [A조합 ▼]  월: [2026년 2월 ▼]                │
│  [리포트 생성]  [📥 엑셀 다운로드]                   │
│                                                     │
│  ── 요약 ──                                        │
│  전체 점검 45건 | pass 42 | fail 2 | warning 1     │
│                                                     │
│  ── 위반 상세 ──                                    │
│  ❌ 투자한도 초과 — 인앤솔루션 22.3%                 │
│  ❌ LP 출자금 불일치 — 차이 500만원                  │
│                                                     │
│  ── 반복 패턴 ──                                    │
│  🔴 투자한도: 5개월 연속 위반                        │
│                                                     │
│  ── 시정 현황 ──                                    │
│  완료율 66.7% | 미완료 5건                          │
│                                                     │
│  ── 전월 대비 ──                                    │
│  개선 2건 | 악화 1건 | 변동없음 42건                 │
└─────────────────────────────────────────────────────┘
```

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [NEW] | `backend/services/compliance_history_analyzer.py` | 이력 분석 + 패턴 감지 + 리포트 |
| 2 | [MODIFY] | `backend/routers/compliance.py` | 패턴/제안/시정/리포트 API |
| 3 | [NEW] | `frontend/src/components/compliance/ViolationPatterns.tsx` | 반복 위반 패턴 UI |
| 4 | [NEW] | `frontend/src/components/compliance/RuleSuggestions.tsx` | 규칙 조정 제안 UI |
| 5 | [NEW] | `frontend/src/components/compliance/RemediationTracker.tsx` | 시정 Task 추적 UI |
| 6 | [NEW] | `frontend/src/components/compliance/MonthlyReport.tsx` | 월간 리포트 UI |
| 7 | [MODIFY] | `frontend/src/pages/CompliancePage.tsx` | 학습/리포트 탭 추가 |
| 8 | [MODIFY] | `frontend/src/lib/api.ts` | 학습 API 함수 |
| 9 | [NEW] | `backend/schemas/compliance_history.py` | 응답 스키마 |

---

## Acceptance Criteria

- [ ] **AC-01:** 반복 위반 패턴이 6개월 이력 기반으로 분석된다 (2회 이상 반복 감지).
- [ ] **AC-02:** 개선/악화 추세가 식별된다.
- [ ] **AC-03:** 위반 0건 규칙에 빈도 축소 제안이 생성된다.
- [ ] **AC-04:** 반복 위반 규칙에 severity 격상 제안이 생성된다.
- [ ] **AC-05:** 시정 Task 완료율, 평균 소요일, 기한초과 목록이 조회된다.
- [ ] **AC-06:** 월간 준법감시 리포트가 자동 생성된다 (요약+위반+패턴+시정+전월대비).
- [ ] **AC-07:** 월간 리포트를 엑셀로 다운로드할 수 있다.
- [ ] **AC-08:** UI에서 패턴, 제안, 시정추적, 리포트 탭이 동작한다.
