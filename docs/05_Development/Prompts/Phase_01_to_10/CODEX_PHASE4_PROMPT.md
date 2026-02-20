# Codex Phase 4 Prompts — Quality & Usability Fixes

---

## 전체 한번에 실행할 프롬프트

```
이 프로젝트는 FastAPI + SQLAlchemy + SQLite 백엔드와 React + TypeScript + Vite 프론트엔드로 구성된 VC ERP 시스템이다.
docs/CODEX_PHASE4_QUALITY_SPEC.md 파일을 읽고 Q0부터 Q10까지 순서대로 모두 구현하라.

규칙:
1. 기존 API URL과 필드명은 변경하지 않고 확장만 한다
2. SQLite 호환 유지 (Float 사용, Numeric(asdecimal=False) 아님)
3. 프론트엔드 모든 텍스트는 한국어
4. npm run build 통과 필수
5. 새 컬럼 추가 시 backend/main.py의 ensure_sqlite_compat_columns()에 ALTER TABLE 추가
6. Pydantic v2 문법 사용
7. relationship 추가 시 back_populates 양방향 설정
8. 각 Q 항목을 개별 커밋으로 분리하여 커밋
```

---

## 개별 항목 프롬프트 (하나씩 실행 시)

### Q0: WorkflowsPage 한국어화

```
frontend/src/pages/WorkflowsPage.tsx 파일의 모든 영문 UI 텍스트를 한국어로 변환하라.

변환 대상:
- "Loading..." → "불러오는 중..."
- "New Template" → "새 템플릿"
- "Edit" → "수정"
- "Delete" → "삭제"
- placeholder="Template name" → placeholder="템플릿 이름"
- placeholder="Category" → placeholder="카테고리"
- placeholder="Total duration" → placeholder="총 소요 시간"
- placeholder="Trigger description" → placeholder="트리거 설명"
- "Steps" → "단계"
- placeholder 내 모든 영문 → 한국어
- "Documents" → "서류"
- "+ Add Document" → "+ 서류 추가"
- "Warnings" → "주의사항"
- "+ Add Warning" → "+ 주의사항 추가"
- "Warning"/"Lesson"/"Tip" option → "경고"/"교훈"/"팁"
- "Cancel" → "취소"
- "Start Workflow" → "워크플로우 시작"
- "Start" → "시작"
- "No active workflow instances." → "활성 워크플로우 인스턴스가 없습니다."
- "Cancel this workflow instance?" → "이 워크플로우 인스턴스를 취소하시겠습니까?"
- "Cancel workflow" → "워크플로우 취소"
- "Workflow Templates" → "워크플로우 템플릿"
- "Template Management" → "템플릿 관리"
- "Active Instances" → "활성 인스턴스"
- "N steps" 표시 → "N 단계"

파일 전체를 검색하여 영문 UI 텍스트를 누락없이 모두 한국어로 교체. npm run build 통과 확인.
```

### Q1: 금융 컬럼 타입 변경

```
VC ERP의 모든 금액/수량 필드가 Integer로 되어있어 소수점 처리 불가. Float로 변경하라.

대상 파일:
1. backend/models/fund.py: commitment_total, aum → Float
2. backend/models/investment.py: amount, shares, share_price, valuation → Float
3. backend/models/transaction.py: amount, balance_before, balance_after, realized_gain, cumulative_gain → Float
4. backend/models/valuation.py: value, prev_value, change_amount → Float
5. backend/models/phase3.py: total_amount(CapitalCall), principal_total, profit_total(Distribution), performance_fee(ExitCommittee) → Float

각 모델에 대응하는 schemas/ 파일에서도 해당 필드의 타입 힌트를 int → float로 변경.
SQLite에서는 Integer와 Float가 호환되므로 ALTER TABLE 불필요.
npm run build 통과, 프론트엔드 api.ts의 타입도 number이므로 변경 불필요.
```

### Q2: Fund 모델 필드 추가

```
backend/models/fund.py의 Fund 모델에 다음 필드를 추가하라:
- maturity_date: Date, nullable
- mgmt_fee_rate: Float, nullable (관리보수율 %)
- performance_fee_rate: Float, nullable (성과보수율 %)
- hurdle_rate: Float, nullable (허들레이트 %)
- account_number: String, nullable (운용계좌번호)

작업:
1. backend/models/fund.py에 컬럼 추가
2. backend/schemas/fund.py의 FundCreate, FundUpdate, FundResponse에 Optional 필드 추가
3. backend/main.py의 ensure_sqlite_compat_columns()에 ALTER TABLE 5건 추가
4. frontend/src/lib/api.ts의 Fund 인터페이스에 필드 추가
5. frontend/src/pages/FundDetailPage.tsx의 펀드 정보 편집 폼에 5개 필드 추가 (만기일: date, 나머지: number/text input)
6. 한국어 레이블 사용: 만기일, 관리보수율(%), 성과보수율(%), 허들레이트(%), 운용계좌번호
7. npm run build 통과 확인
```

### Q3: PortfolioCompany 필드 보강

```
backend/models/investment.py의 PortfolioCompany 모델에 다음 필드를 추가하라:
- corp_number: String, nullable (법인등록번호)
- founded_date: Date, nullable (설립일)
- analyst: String, nullable (담당 심사역)
- contact_name: String, nullable (담당자명)
- contact_email: String, nullable (이메일)
- contact_phone: String, nullable (전화번호)
- memo: Text, nullable (비고)

작업:
1. backend/models/investment.py에 컬럼 추가
2. backend/schemas/investment.py의 CompanyCreate, CompanyResponse에 Optional 필드 추가
3. backend/main.py의 ensure_sqlite_compat_columns()에 ALTER TABLE 7건 추가
4. frontend/src/lib/api.ts의 Company 인터페이스에 필드 추가
5. frontend/src/pages/InvestmentsPage.tsx의 회사 생성/편집 폼을 리팩터링:
   - 현재 document.getElementById() 사용하는 안티패턴을 useState 기반으로 변경
   - 위 7개 필드를 폼에 추가
   - 한국어 레이블 사용
6. npm run build 통과 확인
```

### Q4: Investment 모델 보강

```
backend/models/investment.py의 Investment 모델에 다음 필드를 추가하라:
- round: String, nullable (투자 라운드: Seed, Series A 등)
- valuation_pre: Float, nullable (Pre-money 밸류에이션)
- valuation_post: Float, nullable (Post-money 밸류에이션)
- ownership_pct: Float, nullable (지분율 %)
- board_seat: String, nullable (이사회: observer/board/none)

작업:
1. backend/models/investment.py에 컬럼 추가
2. backend/schemas/investment.py의 InvestmentCreate, InvestmentUpdate, InvestmentResponse에 Optional 필드 추가
3. backend/main.py의 ensure_sqlite_compat_columns()에 ALTER TABLE 5건 추가
4. frontend/src/lib/api.ts의 Investment 인터페이스에 필드 추가
5. frontend/src/pages/InvestmentDetailPage.tsx에 위 필드 표시/편집 추가
6. 한국어 레이블: 투자 라운드, Pre-money, Post-money, 지분율(%), 이사회 참여
7. npm run build 통과 확인
```

### Q5: 검색 범위 확대

```
backend/routers/search.py의 검색 대상을 확대하라.

현재: Task, Fund, Company, Investment, WorkflowInstance
추가:
1. BizReport — report_name 필드 검색, type: "biz_report", url: "/biz-reports"
2. RegularReport — report_target 필드 검색, type: "report", url: "/reports"
3. WorkLog — title 필드 검색, type: "worklog", url: "/worklogs"

각 모델 import하고 기존 패턴(ilike, limit(5), results.append)과 동일하게 구현.

프론트엔드:
frontend/src/components/SearchModal.tsx에서 검색 결과 type별 아이콘 매핑에 추가:
- biz_report → FileText
- report → Send
- worklog → BookOpen
lucide-react에서 import 추가.
```

### Q6: 기한없는 Task 대시보드 표시

```
backend/routers/dashboard.py에서 deadline이 None인 pending/in_progress Task가 아무 섹션에도 표시되지 않는 문제를 수정하라.

작업:
1. backend/routers/dashboard.py:
   - no_deadline_tasks 리스트 추가
   - pending_tasks 루프에서 deadline이 None이면 no_deadline_tasks에 추가하고 continue
   - 리턴 딕셔너리에 "no_deadline": no_deadline_tasks 추가

2. frontend/src/lib/api.ts:
   - DashboardResponse 타입에 no_deadline: Task[] 추가

3. frontend/src/pages/DashboardPage.tsx:
   - "예정" 섹션 아래에 "기한 미설정" 섹션 추가
   - data.no_deadline이 있고 length > 0일 때만 표시
   - 아이콘: Clock (text-slate-400)
```

### Q7: 워크플로우 첫 step 자동 활성화

```
backend/services/workflow_service.py의 instantiate_workflow() 함수에서 워크플로우 인스턴스 생성 시 첫 번째 step을 자동으로 "in_progress" 상태로 만들어라.

db.commit() 직전에 다음 로직 추가:
1. instance_id로 WorkflowStepInstance를 조회하되 WorkflowStep.order 오름차순 정렬
2. 첫 번째 step_instance의 status를 "in_progress"로 변경
3. 해당 step의 task_id가 있으면 그 Task도 "in_progress"로 변경

이미 이 로직이 있다면 중복 추가하지 말 것.
```

### Q8: 워크플로우 완료 notes → Task memo

```
backend/routers/workflows.py의 complete_step 함수에서 notes가 있을 때 연결된 Task의 memo에도 반영하라.

현재 코드 (약 line 247~252):
```python
if si.task_id:
    task = db.get(Task, si.task_id)
    if task:
        task.status = "completed"
        task.completed_at = datetime.now()
        task.actual_time = data.actual_time
```

다음으로 수정:
```python
if si.task_id:
    task = db.get(Task, si.task_id)
    if task:
        task.status = "completed"
        task.completed_at = datetime.now()
        task.actual_time = data.actual_time
        if data.notes:
            existing = task.memo or ""
            task.memo = f"{existing}\n[완료 메모] {data.notes}".strip()
```
```

### Q9: DocumentsPage 기능 보강

```
frontend/src/pages/DocumentsPage.tsx를 전면 리팩터링하여 서류 현황 관리 기능을 보강하라.

현재 86줄의 간소한 테이블에서 다음 기능으로 확장:

1. 상단에 통계 카드 3개: 전체 서류 수, 미수집 수, 수집률(%)
2. 필터 바: 상태별(전체/pending/requested/reviewing/collected), 조합별, 회사별 드롭다운
3. 테이블 컬럼: 서류명, 투자건(회사명), 조합명, 상태(labelStatus), 마감일, D-day 배지, 비고
4. 상태 변경: 각 행에 상태 변경 드롭다운 (select) → updateInvestmentDocument API 호출
5. D-day 배지: days_remaining에 따라 색상 구분 (지연:빨강, 3일내:빨강, 7일내:노랑, 그외:회색)
6. 빈 상태 메시지: "서류 데이터가 없습니다."
7. 모든 텍스트 한국어

기존 fetchDocumentStatus() API와 updateInvestmentDocument() API를 사용.
React Query로 데이터 조회, useMutation으로 상태 변경 후 invalidateQueries.
Toast로 성공/실패 피드백.
npm run build 통과 확인.
```

### Q10: 캘린더에 Task 마감일 표시

```
CalendarPage에 Task 마감일도 함께 표시하라.

1. backend/routers/calendar_events.py:
   - GET /api/calendar-events 엔드포인트에 include_tasks: bool = False 쿼리 파라미터 추가
   - include_tasks=True일 때 pending/in_progress Task 중 해당 연/월의 deadline을 이벤트로 추가
   - Task 이벤트 형식: id="task-{task.id}", title=task.title, event_date=deadline, event_type="task", color="#3b82f6"
   - Task 모델 import 필요

2. frontend/src/pages/CalendarPage.tsx:
   - API 호출에 include_tasks=true 파라미터 추가
   - Task 이벤트를 파란색으로 구분 표시
   - 이벤트 타입별 범례(캘린더 이벤트: 초록, Task 마감일: 파랑) 상단에 추가
   - 모든 텍스트 한국어

npm run build 통과 확인.
```
