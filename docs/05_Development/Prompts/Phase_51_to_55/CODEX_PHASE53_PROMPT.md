# Phase 53: 정기 스캔 + 법률 개정 감지

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P2  
**의존성:** Phase 49 (규칙엔진), Phase 50 (벡터DB)  
**LLM:** ❌  
**추가 패키지:** `apscheduler`  
**예상 파일 수:** 7개 | **AC:** 7개

---

## Part 0. 전수조사 (필수)

- [ ] `backend/services/compliance_rule_engine.py` — Phase 49 규칙 엔진
- [ ] `backend/services/vector_db.py` — Phase 50 벡터 DB
- [ ] `backend/models/compliance.py` — ComplianceCheck 모델
- [ ] `backend/routers/compliance.py` — 기존 API
- [ ] `frontend/src/pages/CompliancePage.tsx` — 기존 UI

---

## Part 1. APScheduler 설정

#### [NEW] `backend/services/scheduler.py`

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger


class SchedulerService:
    """백그라운드 스케줄러 — 정기 작업 관리"""
    
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
    
    def start(self):
        """애플리케이션 시작 시 호출"""
        # 일간 스캔: 매일 오전 9시
        self.scheduler.add_job(
            self._daily_compliance_scan,
            CronTrigger(hour=9, minute=0),
            id="daily_compliance_scan",
            name="일간 준법감시 스캔",
            replace_existing=True,
        )
        
        # 주간 법률 개정 체크: 매주 월요일 오전 8시
        self.scheduler.add_job(
            self._weekly_law_amendment_check,
            CronTrigger(day_of_week="mon", hour=8, minute=0),
            id="weekly_law_amendment_check",
            name="주간 법률 개정 감지",
            replace_existing=True,
        )
        
        # 월간 전체 감사 스캔: 매월 1일 오전 7시
        self.scheduler.add_job(
            self._monthly_full_audit,
            CronTrigger(day=1, hour=7, minute=0),
            id="monthly_full_audit",
            name="월간 전체 감사 스캔",
            replace_existing=True,
        )
        
        self.scheduler.start()
    
    def stop(self):
        """애플리케이션 종료 시 호출"""
        self.scheduler.shutdown()
    
    async def _daily_compliance_scan(self):
        """일간 스캔 — 전체 조합 대상 주요 규칙 점검"""
        from services.periodic_compliance_scanner import PeriodicComplianceScanner
        scanner = PeriodicComplianceScanner()
        await scanner.run_daily_scan()
    
    async def _weekly_law_amendment_check(self):
        """주간 법률 개정 감지"""
        from services.law_amendment_monitor import LawAmendmentMonitor
        monitor = LawAmendmentMonitor()
        await monitor.check_amendments()
    
    async def _monthly_full_audit(self):
        """월간 전체 감사 — 모든 규칙 실행"""
        from services.periodic_compliance_scanner import PeriodicComplianceScanner
        scanner = PeriodicComplianceScanner()
        await scanner.run_full_audit()
```

#### [MODIFY] `backend/main.py`

```python
# 앱 시작/종료 시 스케줄러 관리
from services.scheduler import SchedulerService

scheduler = SchedulerService()

@app.on_event("startup")
async def startup_event():
    scheduler.start()

@app.on_event("shutdown")
async def shutdown_event():
    scheduler.stop()
```

---

## Part 2. 정기 스캐너

#### [NEW] `backend/services/periodic_compliance_scanner.py`

```python
from sqlalchemy.orm import Session
from database import SessionLocal
from models.fund import Fund
from models.compliance import FundComplianceRule, ComplianceCheck
from services.compliance_rule_engine import ComplianceRuleEngine


class ScanResult:
    """스캔 결과"""
    fund_id: int
    fund_name: str
    total_rules: int
    passed: int
    failed: int
    warnings: int
    new_violations: list[dict]


class PeriodicComplianceScanner:
    """정기 준법감시 스캐너"""
    
    def __init__(self):
        self.engine = ComplianceRuleEngine()
    
    async def run_daily_scan(self) -> list[ScanResult]:
        """일간 스캔 — 주요 규칙만 (L1~L3)"""
        db = SessionLocal()
        try:
            funds = db.query(Fund).filter(Fund.status == "운용중").all()
            results = []
            
            for fund in funds:
                rules = db.query(FundComplianceRule).filter(
                    (FundComplianceRule.fund_id == fund.id) | (FundComplianceRule.fund_id.is_(None)),
                    FundComplianceRule.is_active == True,
                    FundComplianceRule.level.in_(["L1", "L2", "L3"]),
                ).all()
                
                scan_result = ScanResult()
                scan_result.fund_id = fund.id
                scan_result.fund_name = fund.name
                scan_result.total_rules = len(rules)
                
                checks = []
                for rule in rules:
                    check = self.engine.evaluate_rule(rule, fund.id, db)
                    check.trigger_type = "scheduled"
                    check.trigger_source = "daily_scan"
                    db.add(check)
                    checks.append(check)
                
                scan_result.passed = sum(1 for c in checks if c.result == "pass")
                scan_result.failed = sum(1 for c in checks if c.result in ("fail", "error"))
                scan_result.warnings = sum(1 for c in checks if c.result == "warning")
                scan_result.new_violations = [
                    {"rule": rules[i].rule_name, "detail": c.detail}
                    for i, c in enumerate(checks) if c.result in ("fail", "error")
                ]
                
                results.append(scan_result)
            
            db.commit()
            
            # 위반 발견 시 알림 생성
            violations = [r for r in results if r.failed > 0]
            if violations:
                await self._create_notifications(violations, db)
            
            return results
        finally:
            db.close()
    
    async def run_full_audit(self) -> list[ScanResult]:
        """월간 전체 감사 — 모든 규칙 (L1~L5)"""
        db = SessionLocal()
        try:
            funds = db.query(Fund).all()
            results = []
            
            for fund in funds:
                checks = self.engine.evaluate_all(fund.id, db, trigger_type="scheduled")
                # ... 결과 집계 ...
                results.append(...)
            
            return results
        finally:
            db.close()
    
    async def _create_notifications(self, violations, db):
        """위반 발견 시 대시보드 알림 생성"""
        # urgent_alerts에 추가하거나 별도 notification 테이블 사용
        ...
```

---

## Part 3. 법률 개정 모니터

#### [NEW] `backend/services/law_amendment_monitor.py`

```python
import httpx
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from database import SessionLocal


class LawAmendmentMonitor:
    """국가법령정보센터 API로 법률 개정 자동 감지
    
    API: https://open.law.go.kr (국가법령정보 공동활용)
    """
    
    # 모니터링 대상 법률
    MONITORED_LAWS = [
        {"name": "자본시장과 금융투자업에 관한 법률", "mst": "001834"},
        {"name": "벤처투자 촉진에 관한 법률", "mst": "007361"},
        {"name": "여신전문금융업법", "mst": "000933"},
        {"name": "중소기업창업 지원법", "mst": "000640"},
    ]
    
    BASE_URL = "https://www.law.go.kr/DRF/lawSearch.do"
    
    async def check_amendments(self) -> list[dict]:
        """최근 7일간 법률 개정 여부 확인"""
        amendments = []
        since = (datetime.now() - timedelta(days=7)).strftime("%Y%m%d")
        
        async with httpx.AsyncClient() as client:
            for law in self.MONITORED_LAWS:
                try:
                    resp = await client.get(self.BASE_URL, params={
                        "OC": "antigravity",
                        "target": "law",
                        "MST": law["mst"],
                        "type": "JSON",
                    })
                    
                    if resp.status_code == 200:
                        data = resp.json()
                        # 개정일자 확인
                        amend_date = data.get("시행일자", "")
                        if amend_date >= since:
                            amendments.append({
                                "law_name": law["name"],
                                "amendment_date": amend_date,
                                "effective_date": data.get("시행일자", ""),
                                "summary": data.get("법령명_한글", ""),
                            })
                except Exception as e:
                    # API 오류 시 로깅만
                    print(f"Law check error for {law['name']}: {e}")
        
        # 개정 발견 시 알림 저장
        if amendments:
            await self._save_amendment_alerts(amendments)
        
        return amendments
    
    async def _save_amendment_alerts(self, amendments: list[dict]):
        """개정 알림을 DB에 저장"""
        db = SessionLocal()
        try:
            for amend in amendments:
                from models.compliance import ComplianceDocument
                # 기존 문서 갱신 필요 알림
                alert = ComplianceDocument(
                    title=f"[개정감지] {amend['law_name']}",
                    document_type="amendment_alert",
                    effective_date=datetime.strptime(amend["effective_date"], "%Y%m%d") if amend["effective_date"] else None,
                    content_summary=f"개정일: {amend['amendment_date']}, 시행일: {amend['effective_date']}",
                )
                db.add(alert)
            db.commit()
        finally:
            db.close()
```

---

## Part 4. 스케줄러 현황 API

#### [MODIFY] `backend/routers/compliance.py`

```python
@router.get("/api/compliance/scan-history")
def get_scan_history(
    period: str = "week",  # week, month, all
    db: Session = Depends(get_db),
):
    """스캔 실행 이력 조회"""
    checks = db.query(ComplianceCheck).filter(
        ComplianceCheck.trigger_type == "scheduled"
    ).order_by(ComplianceCheck.checked_at.desc()).limit(100).all()
    return checks

@router.get("/api/compliance/amendments")
def get_amendment_alerts(db: Session = Depends(get_db)):
    """법률 개정 알림 목록"""
    return db.query(ComplianceDocument).filter_by(
        document_type="amendment_alert"
    ).order_by(ComplianceDocument.created_at.desc()).limit(20).all()

@router.post("/api/compliance/scan/manual")
async def trigger_manual_scan(
    fund_id: int | None = None,
    db: Session = Depends(get_db),
):
    """수동 스캔 트리거"""
    scanner = PeriodicComplianceScanner()
    if fund_id:
        return scanner.engine.evaluate_all(fund_id, db, trigger_type="manual")
    else:
        return await scanner.run_daily_scan()
```

---

## Part 5. 프론트엔드

#### [MODIFY] `frontend/src/pages/CompliancePage.tsx`

스케줄링 + 법률 개정 탭 추가:

```
┌─ 정기 스캔 현황 ──────────────────────────────────┐
│                                                    │
│  스케줄:                                           │
│  일간 스캔: 매일 09:00 (L1~L3) | 마지막: 오늘 09:00│
│  주간 법률: 매주 월 08:00     | 마지막: 02/24 08:00│
│  월간 감사: 매월 1일 07:00    | 마지막: 03/01 07:00│
│                                                    │
│  [수동 스캔 실행]                                   │
│                                                    │
│  ── 최근 스캔 결과 ──                               │
│  03/01 일간: A조합 ✅ | B조합 ⚠️ 1건 | C조합 ✅    │
│  02/28 일간: 전체 ✅                                │
│  02/24 주간: 법률 개정 감지 없음                     │
│                                                    │
│  ── 법률 개정 알림 ──                               │
│  ⚠️ 벤처투자법 시행령 개정 (03/15 시행예정)          │
│  ℹ️ 자본시장법 일부 개정안 공포 (06/01 시행)         │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [NEW] | `backend/services/scheduler.py` | APScheduler 설정 |
| 2 | [NEW] | `backend/services/periodic_compliance_scanner.py` | 정기 스캐너 |
| 3 | [NEW] | `backend/services/law_amendment_monitor.py` | 법률 개정 감지 |
| 4 | [MODIFY] | `backend/main.py` | 스케줄러 시작/종료 |
| 5 | [MODIFY] | `backend/routers/compliance.py` | 스캔이력/개정알림/수동스캔 API |
| 6 | [MODIFY] | `frontend/src/pages/CompliancePage.tsx` | 스케줄+개정 탭 |
| 7 | [MODIFY] | `requirements.txt` | apscheduler, httpx 추가 |

---

## Acceptance Criteria

- [ ] **AC-01:** APScheduler가 앱 시작 시 활성화되고 종료 시 정리된다.
- [ ] **AC-02:** 일간 스캔(L1~L3)이 전체 운용중 조합에 대해 실행된다.
- [ ] **AC-03:** 스캔 결과에 조합별 pass/fail/warning 건수가 포함된다.
- [ ] **AC-04:** 위반 발견 시 알림이 생성되고 auto_task 규칙은 시정 Task가 생성된다.
- [ ] **AC-05:** 법률 개정 모니터가 국가법령정보센터 API를 호출하고 개정을 감지한다.
- [ ] **AC-06:** 수동 스캔 API가 즉시 실행 가능하다.
- [ ] **AC-07:** UI에서 스케줄 현황, 스캔 이력, 법률 개정 알림을 확인할 수 있다.
