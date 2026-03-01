# Phase 54: 통합 준법감시 대시보드

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P2  
**의존성:** Phase 49~53 전체  
**LLM:** ❌  
**예상 파일 수:** 6개 | **AC:** 8개

---

## Part 0. 전수조사 (필수)

- [ ] `backend/models/compliance.py` — ComplianceCheck, FundComplianceRule
- [ ] `backend/models/pre_report_check.py` — Phase 52 사전검증 결과
- [ ] `backend/models/llm_usage.py` — Phase 51 LLM 사용량
- [ ] `backend/services/vector_db.py` — Phase 50 벡터DB 통계
- [ ] `backend/routers/compliance.py` — 기존 API
- [ ] `frontend/src/pages/CompliancePage.tsx` — 기존 UI

---

## Part 1. 통합 대시보드 API

#### [MODIFY] `backend/routers/compliance.py`

```python
@router.get("/api/compliance/dashboard")
def get_compliance_dashboard(db: Session = Depends(get_db)):
    """통합 준법감시 대시보드 데이터
    
    Returns:
        {
            "summary": {
                "total_rules": 45,
                "active_violations": 3,
                "warnings": 7,
                "passed": 35,
                "compliance_rate": 77.8
            },
            "fund_status": [
                {
                    "fund_id": 1,
                    "fund_name": "A조합",
                    "total_rules": 12,
                    "passed": 12,
                    "failed": 0,
                    "compliance_rate": 100.0,
                    "last_checked": "2026-03-01T09:00:00"
                },
                ...
            ],
            "recent_checks": [
                {
                    "id": 456,
                    "fund_name": "B조합",
                    "rule_name": "투자한도 초과",
                    "result": "fail",
                    "detail": "...",
                    "checked_at": "...",
                    "trigger_type": "scheduled"
                },
                ...
            ],
            "amendment_alerts": [
                {
                    "law_name": "벤처투자법 시행령",
                    "effective_date": "2026-03-15",
                    "days_remaining": 14,
                    "summary": "..."
                }
            ],
            "document_stats": {
                "laws": 24,
                "regulations": 12,
                "guidelines": 8,
                "agreements": 5,
                "internal": 3,
                "total_chunks": 1842
            },
            "llm_usage": {
                "month_total_tokens": 23400,
                "month_limit": 500000,
                "month_cost_usd": 0.47,
                "usage_rate": 4.7
            }
        }
    """
    from models.compliance import FundComplianceRule, ComplianceCheck, ComplianceDocument
    from models.fund import Fund
    from models.llm_usage import LLMUsage
    from services.vector_db import VectorDBService
    from datetime import datetime
    from sqlalchemy import func as sqla_func
    
    # 1. 현황 요약
    total_rules = db.query(FundComplianceRule).filter_by(is_active=True).count()
    
    # 최근 점검 기준 (조합별 마지막 점검)
    latest_checks = db.query(ComplianceCheck).order_by(
        ComplianceCheck.checked_at.desc()
    ).limit(200).all()
    
    active_violations = sum(1 for c in latest_checks if c.result in ("fail", "error"))
    warnings = sum(1 for c in latest_checks if c.result == "warning")
    passed = sum(1 for c in latest_checks if c.result == "pass")
    
    summary = {
        "total_rules": total_rules,
        "active_violations": active_violations,
        "warnings": warnings,
        "passed": passed,
        "compliance_rate": round(passed / max(len(latest_checks), 1) * 100, 1),
    }
    
    # 2. 조합별 현황
    funds = db.query(Fund).all()
    fund_status = []
    for fund in funds:
        fund_checks = [c for c in latest_checks if c.fund_id == fund.id]
        fund_status.append({
            "fund_id": fund.id,
            "fund_name": fund.name,
            "total_rules": len(fund_checks),
            "passed": sum(1 for c in fund_checks if c.result == "pass"),
            "failed": sum(1 for c in fund_checks if c.result in ("fail", "error")),
            "compliance_rate": round(
                sum(1 for c in fund_checks if c.result == "pass") / max(len(fund_checks), 1) * 100, 1
            ),
            "last_checked": max((c.checked_at for c in fund_checks), default=None),
        })
    
    # 3. 최근 점검 기록
    recent_checks_data = []
    for check in latest_checks[:20]:
        fund = db.query(Fund).get(check.fund_id)
        rule = db.query(FundComplianceRule).get(check.rule_id)
        recent_checks_data.append({
            "id": check.id,
            "fund_name": fund.name if fund else "",
            "rule_name": rule.rule_name if rule else "",
            "result": check.result,
            "detail": check.detail,
            "checked_at": check.checked_at,
            "trigger_type": check.trigger_type,
        })
    
    # 4. 법률 개정 알림
    amendments = db.query(ComplianceDocument).filter_by(
        document_type="amendment_alert"
    ).order_by(ComplianceDocument.created_at.desc()).limit(5).all()
    
    amendment_alerts = [{
        "law_name": a.title.replace("[개정감지] ", ""),
        "effective_date": str(a.effective_date) if a.effective_date else None,
        "summary": a.content_summary,
    } for a in amendments]
    
    # 5. 문서 인덱싱 현황
    try:
        vector_db = VectorDBService()
        doc_stats = vector_db.get_stats()
        total_chunks = sum(s["count"] for s in doc_stats.values())
    except Exception:
        doc_stats = {}
        total_chunks = 0
    
    # 6. LLM 사용 현황
    first_of_month = datetime.now().replace(day=1, hour=0, minute=0, second=0)
    month_tokens = db.query(sqla_func.sum(LLMUsage.total_tokens)).filter(
        LLMUsage.created_at >= first_of_month
    ).scalar() or 0
    month_cost = db.query(sqla_func.sum(LLMUsage.estimated_cost_usd)).filter(
        LLMUsage.created_at >= first_of_month
    ).scalar() or 0
    
    import os
    limit = int(os.getenv("LLM_MONTHLY_LIMIT", "500000"))
    
    return {
        "summary": summary,
        "fund_status": fund_status,
        "recent_checks": recent_checks_data,
        "amendment_alerts": amendment_alerts,
        "document_stats": {**{k: v["count"] for k, v in doc_stats.items()}, "total_chunks": total_chunks},
        "llm_usage": {
            "month_total_tokens": month_tokens,
            "month_limit": limit,
            "month_cost_usd": round(month_cost, 2),
            "usage_rate": round(month_tokens / max(limit, 1) * 100, 1),
        },
    }
```

---

## Part 2. 조합별 현황 위젯

#### [NEW] `frontend/src/components/compliance/FundComplianceGrid.tsx`

```
┌─ 조합별 준법감시 현황 ─────────────────────────────┐
│                                                     │
│  조합명           │ 규칙 │ 준수율  │ 위반│ 마지막점검│
│  A조합            │ 12   │ 100% ✅ │ 0  │ 오늘 09:00│
│  B조합            │ 15   │  87%  ⚠️│ 2  │ 오늘 09:00│
│  C조합            │ 10   │  60%  ❌│ 4  │ 어제 09:00│
│  D조합            │ 12   │ 100% ✅ │ 0  │ 오늘 09:00│
│                                                     │
│  [B조합] 클릭 → 해당 조합 위반 상세 보기             │
└─────────────────────────────────────────────────────┘
```

---

## Part 3. 감사 로그 타임라인

#### [NEW] `frontend/src/components/compliance/AuditTimeline.tsx`

```
┌─ 감사 로그 타임라인 ──────────────────────────────┐
│                                                    │
│  03/01 09:00 [스케줄] 일간 스캔                     │
│  ├ A조합 12건 점검 → 전체 pass ✅                   │
│  ├ B조합 15건 점검 → 위반 2건 발견 ❌                │
│  │   ├ 투자한도 초과 → Task 자동 생성               │
│  │   └ 보고서 미제출 D+3                            │
│  └ C조합 10건 점검 → 경고 1건                       │
│                                                    │
│  02/28 14:30 [이벤트] B조합 투자 실행               │
│  ├ 투자한도 체크 → pass ✅                          │
│                                                    │
│  02/28 09:00 [스케줄] 일간 스캔                     │
│  └ 전체 조합 pass ✅                                │
│                                                    │
│  [더 보기]                                          │
└────────────────────────────────────────────────────┘
```

---

## Part 4. 법률 개정 알림 패널

#### [NEW] `frontend/src/components/compliance/AmendmentAlerts.tsx`

```
┌─ 법률 개정 알림 ──────────────────────────────────┐
│                                                    │
│  ⚠️ 벤처투자법 시행령 개정                          │
│  시행일: 2026-03-15 (D-14)                         │
│  → 투자한도 관련 조항 변경 가능성                    │
│  [상세 보기] [관련 규칙 확인]                        │
│                                                    │
│  ℹ️ 자본시장법 일부 개정안 공포                      │
│  시행일: 2026-06-01 (D-92)                         │
│  [상세 보기]                                        │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## Part 5. 통합 대시보드 UI

#### [MODIFY] `frontend/src/pages/CompliancePage.tsx`

기존 탭 구조에 "대시보드" 탭을 최상단으로 추가:

```
┌─ 준법감시 ──────────────────────────────────────────┐
│                                                      │
│  [대시보드] [규칙관리] [점검기록] [법률질의] [문서]    │
│                                                      │
│  ── 현황 요약 ──                                     │
│  전체규칙 45 | ❌ 위반 3 | ⚠️ 경고 7 | ✅ 정상 35     │
│  준수율: 77.8%                                       │
│                                                      │
│  ┌──────────────────┐  ┌──────────────────────┐      │
│  │ 조합별 현황        │  │ 감사 로그 타임라인     │      │
│  │ (FundCompliance    │  │ (AuditTimeline)       │      │
│  │  Grid)             │  │                       │      │
│  └──────────────────┘  └──────────────────────┘      │
│                                                      │
│  ┌──────────────────┐  ┌──────────────────────┐      │
│  │ 법률 개정 알림     │  │ 인덱싱 현황 + LLM 사용│      │
│  │ (AmendmentAlerts)  │  │ 법률 24 | 시행령 12  │      │
│  │                    │  │ 토큰: 23.4K / 500K   │      │
│  └──────────────────┘  └──────────────────────┘      │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [MODIFY] | `backend/routers/compliance.py` | 통합 대시보드 API 추가 |
| 2 | [NEW] | `frontend/src/components/compliance/FundComplianceGrid.tsx` | 조합별 현황 위젯 |
| 3 | [NEW] | `frontend/src/components/compliance/AuditTimeline.tsx` | 감사 로그 타임라인 |
| 4 | [NEW] | `frontend/src/components/compliance/AmendmentAlerts.tsx` | 법률 개정 알림 |
| 5 | [MODIFY] | `frontend/src/pages/CompliancePage.tsx` | 대시보드 탭 + 위젯 통합 |
| 6 | [MODIFY] | `frontend/src/lib/api.ts` | 대시보드 API 함수 |

---

## Acceptance Criteria

- [ ] **AC-01:** 대시보드 API가 summary, fund_status, recent_checks, amendment_alerts, document_stats, llm_usage를 반환한다.
- [ ] **AC-02:** 현황 요약에 전체 규칙수, 위반/경고/정상 건수, 준수율이 표시된다.
- [ ] **AC-03:** 조합별 현황 그리드에 각 조합의 준수율과 위반 건수가 표시된다.
- [ ] **AC-04:** 조합 클릭 시 해당 조합의 위반 상세가 표시된다.
- [ ] **AC-05:** 감사 로그 타임라인에 최근 점검 기록이 시간순으로 표시된다.
- [ ] **AC-06:** 법률 개정 알림에 시행일과 D-day가 표시된다.
- [ ] **AC-07:** 문서 인덱싱 현황과 LLM 토큰 사용량이 표시된다.
- [ ] **AC-08:** 기존 CompliancePage의 다른 탭(규칙관리/점검기록/법률질의/문서) 기능이 유지된다.
