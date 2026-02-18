# Phase 19: 전체 코드 연계성 감사 및 수정

> **목적:** Phase 1~18까지 구현된 모든 코드의 연계성을 빠짐없이 점검하고, 누락/불일치/비효율을 발견하여 수정한다.
> **원칙:** 수정 후 반드시 다중 검증(빌드→테스트→타입체크→수동점검)을 거쳐 누락 0건을 보장한다.

---

## 시스템 아키텍처 요약

### 백엔드 (FastAPI + SQLAlchemy)
| 계층 | 파일 수 | 위치 |
|------|---------|------|
| Models | 17 | `backend/models/` |
| Schemas | 16 | `backend/schemas/` |
| Routers | 23 | `backend/routers/` |
| Tests | 19 | `backend/tests/` |

### 프론트엔드 (React + TypeScript)
| 계층 | 파일 수 | 위치 |
|------|---------|------|
| Pages | 20 | `frontend/src/pages/` |
| Components | Layout, SearchModal 등 | `frontend/src/components/` |
| API Types & Functions | 1 (대형) | `frontend/src/lib/api.ts` |
| Contexts | 2 | `frontend/src/contexts/` |

---

## Part 1: 모델 ↔ 스키마 필드 일치 점검

### 점검 방법
각 모델 파일의 모든 Column을 스키마의 Create/Update/Response에 대조. 누락 필드가 있으면 추가.

### 점검 대상 (17개 모델)

| # | 모델 파일 | 스키마 파일 | 점검 항목 |
|---|-----------|------------|----------|
| 1 | `models/fund.py` (Fund, LP, FundNoticePeriod, FundKeyTerm) | `schemas/fund.py` | FundCreate/Update/Response/ListItem/FundOverviewItem ↔ Fund 모델 필드 일치 |
| 2 | `models/task.py` (Task) | `schemas/task.py` | TaskCreate/Update/Response ↔ Task 모델 |
| 3 | `models/workflow.py` (Workflow, WorkflowStep, WorkflowDocument, WorkflowWarning) | `schemas/workflow.py` | 모든 CRUD 스키마 ↔ 모델 |
| 4 | `models/workflow_instance.py` (WorkflowInstance, WorkflowStepInstance) | `schemas/workflow.py` | 인스턴스 관련 스키마 ↔ 모델 |
| 5 | `models/investment.py` (PortfolioCompany, Investment, InvestmentDocument) | `schemas/investment.py` | 투자 관련 스키마 ↔ 모델 |
| 6 | `models/phase3.py` (CapitalCall, CapitalCallItem, Distribution, DistributionItem, Assembly, ExitCommittee, ExitCommitteeFund, ExitTrade) | `schemas/phase3.py` | 8개 모델 전체 ↔ 스키마 |
| 7 | `models/transaction.py` | `schemas/transaction.py` | |
| 8 | `models/valuation.py` | `schemas/valuation.py` | |
| 9 | `models/biz_report.py` | `schemas/biz_report.py` | |
| 10 | `models/regular_report.py` | `schemas/regular_report.py` | |
| 11 | `models/accounting.py` (Account, JournalEntry, JournalEntryLine) | `schemas/accounting.py` | |
| 12 | `models/vote_record.py` | `schemas/vote_record.py` | |
| 13 | `models/checklist.py` (Checklist, ChecklistItem) | `schemas/checklist.py` | |
| 14 | `models/calendar_event.py` | `schemas/calendar_event.py` | |
| 15 | `models/worklog.py` (WorkLog, WorkLogDetail, WorkLogLesson, WorkLogFollowUp) | `schemas/worklog.py` | |
| 16 | `models/document_template.py` | (스키마 없으면 필요 여부 판단) | |

### 조치
- Response 스키마에 모델 필드가 빠져있으면 추가 (nullable로)
- Create/Update에 합리적으로 포함되어야 할 필드가 빠져있으면 추가
- 모델에만 있고 스키마에 없는 필드는 의도적 누락인지 확인

---

## Part 2: 스키마 ↔ 라우터 API 반환값 점검

### 점검 방법
각 라우터의 response_model과 실제 반환 데이터가 일치하는지 확인.

### 주요 점검 항목
1. `routers/funds.py` — list_funds의 반환이 FundListItem과 일치하는가? FundResponse와 Fund 모델의 모든 필드가 반환되는가?
2. `routers/funds.py` — fund_overview의 FundOverviewItem 빌드 시 모든 필드가 매핑되는가?
3. `routers/capital_calls.py` — batch/summary API 반환 형식이 프론트엔드 타입과 일치하는가?
4. `routers/dashboard.py` — DashboardResponse의 모든 필드가 실제로 채워지는가?
5. `routers/exits.py` — ExitCommittee/ExitTrade 관련 반환이 스키마와 일치하는가?
6. `routers/distributions.py` — Distribution/DistributionItem 반환 확인
7. `routers/assemblies.py` — Assembly 반환 확인
8. `routers/performance.py` — FundPerformance 반환이 프론트 타입과 일치하는가?
9. `routers/search.py` — SearchResult가 프론트 SearchResult 타입과 일치하는가?
10. `routers/worklogs.py` — insights 엔드포인트 반환이 프론트 WorkLogInsights 타입과 일치하는가?
11. `routers/documents.py` — 문서 생성/프리뷰 API가 프론트 함수와 일치하는가?

### 조치
- response_model 누락이면 추가
- 반환 필드와 스키마 불일치면 어느 쪽이든 수정
- 타입 불일치(int vs float, str vs date 등)가 있으면 통일

---

## Part 3: 프론트 타입(api.ts) ↔ 백엔드 스키마 필드 일치 점검

### 점검 방법
`frontend/src/lib/api.ts`의 모든 interface를 대응하는 백엔드 Response 스키마와 1:1 대조.

### 점검 대상 (주요 타입)

| 프론트 타입 | 대응 백엔드 스키마 |
|------------|------------------|
| Fund | FundResponse |
| FundInput | FundCreate/FundUpdate |
| FundOverviewItem | FundOverviewItem |
| LP, LPInput | LPResponse, LPCreate/LPUpdate |
| Task, TaskCreate | TaskResponse, TaskCreate |
| WorkflowTemplate, WorkflowListItem | WorkflowResponse, WorkflowListItem |
| WorkflowInstance, WorkflowStepInstance | WorkflowInstanceResponse |
| CapitalCall, CapitalCallInput | CapitalCallResponse, CapitalCallCreate |
| CapitalCallItem, CapitalCallItemInput | CapitalCallItemResponse, CapitalCallItemCreate |
| CapitalCallBatchInput | CapitalCallBatchCreate |
| CapitalCallSummary | /summary/{fund_id} 반환 타입 |
| Distribution, DistributionInput | DistributionResponse, DistributionCreate |
| DistributionItem | DistributionItemResponse |
| Assembly, AssemblyInput | AssemblyResponse, AssemblyCreate |
| ExitCommittee, ExitTrade | ExitCommitteeResponse, ExitTradeResponse |
| Transaction, TransactionInput | TransactionResponse, TransactionCreate |
| Valuation, ValuationInput | ValuationResponse, ValuationCreate |
| BizReport, BizReportInput | BizReportResponse, BizReportCreate |
| RegularReport, RegularReportInput | RegularReportResponse, RegularReportCreate |
| Account, AccountInput | AccountResponse, AccountCreate |
| JournalEntry, JournalEntryInput | JournalEntryResponse, JournalEntryInput |
| VoteRecord, VoteRecordInput | VoteRecordResponse, VoteRecordCreate |
| Checklist, ChecklistItem | ChecklistResponse, ChecklistItemResponse |
| CalendarEvent, CalendarEventInput | CalendarEventResponse, CalendarEventCreate |
| WorkLog, WorkLogInput, WorkLogInsights | WorkLogResponse, WorkLogCreate, insights 반환 |
| DocumentTemplate | DocumentTemplate 모델 |
| DashboardResponse | dashboard 라우터 반환 |
| FundPerformance | performance 라우터 반환 |
| SearchResult | search 라우터 반환 |

### 조치
- 프론트 타입에 없는 백엔드 필드 → 프론트에 추가 (optional)
- 프론트에만 있고 백엔드에 없는 필드 → 백엔드에 추가하거나 프론트에서 제거
- 타입 불일치 수정

---

## Part 4: 프론트 API 함수 ↔ 백엔드 라우터 엔드포인트 일치 점검

### 점검 방법
`api.ts`의 모든 API 함수 호출 경로를 백엔드 라우터의 @router.get/post/put/delete 데코레이터와 대조.

### 점검 항목
- URL 경로 일치 확인
- HTTP method 일치 확인
- 파라미터(query params, path params, body) 일치 확인
- 프론트에서 호출하지만 백엔드에 없는 엔드포인트 발견
- 백엔드에 있지만 프론트에서 호출하지 않는 엔드포인트 (필요 여부 판단)

---

## Part 5: 페이지 ↔ API 함수 연동 점검

### 점검 방법
각 페이지 컴포넌트가 사용하는 API 함수·타입이 실제로 정의되어 있는지, 반환값을 올바르게 사용하는지 확인.

### 점검 대상 (20개 페이지)

| 페이지 | 사용 API 함수 | 확인 |
|--------|-------------|------|
| DashboardPage | fetchDashboard, fetchUpcomingNotices, fetchTasks 등 | |
| TaskBoardPage | fetchTaskBoard, createTask, completeTask 등 | |
| FundsPage | fetchFunds, createFund | |
| FundDetailPage | fetchFund, updateFund, fetchFundLPs, createCapitalCallBatch, fetchCapitalCallSummary 등 | |
| FundOverviewPage | fetchFundOverview | |
| FundOperationsPage | fetchCapitalCalls, fetchDistributions, fetchAssemblies 등 | |
| InvestmentsPage | fetchInvestments, fetchCompanies, createInvestment 등 | |
| InvestmentDetailPage | fetchInvestment, fetchInvestmentDocuments, fetchVoteRecords 등 | |
| ExitsPage | fetchExitCommittees, fetchExitTrades 등 | |
| TransactionsPage | fetchTransactions | |
| ValuationsPage | fetchValuations | |
| AccountingPage | fetchAccounts, fetchJournalEntries, fetchTrialBalance 등 | |
| BizReportsPage | fetchBizReports | |
| ReportsPage | fetchRegularReports | |
| WorkflowsPage | fetchWorkflows, fetchWorkflowInstances 등 | |
| ChecklistsPage | fetchChecklists | |
| WorkLogsPage | fetchWorkLogs, fetchWorkLogInsights | |
| CalendarPage | fetchCalendarEvents | |
| DocumentsPage | fetchDocumentStatus | |
| TemplateManagementPage | fetchDocumentTemplates | |

---

## Part 6: 교차 기능 연계 점검

### 6-1. 출자금(CapitalCall) ↔ LP.paid_in 동기화
- [x] 이미 구현 확인: create/update/delete/batch 시 LP.paid_in 자동 갱신
- 추가 확인: FundDetailPage에서 LP 편집 시 CapitalCallItem과 불일치할 가능성 점검

### 6-2. 워크플로우 인스턴스 ↔ 업무(Task) 연동
- 워크플로우 단계 생성 시 Task 자동 생성 확인
- 워크플로우 단계 완료 시 Task 상태 동기화 확인
- Task 완료 시 워크플로우 단계 상태 동기화 확인

### 6-3. 대시보드 ↔ 전체 데이터 연동
- DashboardResponse의 fund_summary가 실제 fund 데이터와 일치하는가
- missing_documents가 실제 InvestmentDocument와 일치하는가
- upcoming_reports가 실제 RegularReport와 일치하는가
- upcoming_notices가 실제 FundNoticePeriod + WorkflowInstance와 일치하는가
- completed_today/this_week 카운트가 정확한가

### 6-4. 문서 템플릿 ↔ 펀드 데이터 연동
- 문서 생성 시 사용하는 변수(fund_name, formation_date 등)가 실제 DB 데이터와 매핑되는가
- 새로 추가된 필드(registration_number, registration_date)가 템플릿 변수에 포함되는가

### 6-5. 검색(Search) ↔ 전체 모델 커버리지
- 통합 검색이 모든 주요 엔티티를 검색하는가 (Fund, Company, Investment, Task, Workflow 등)
- 검색 결과 타입이 프론트 SearchResult와 일치하는가

### 6-6. 캘린더 ↔ 업무·워크플로우 연동
- include_tasks=true 시 Task 데이터가 캘린더에 올바르게 포함되는가
- 워크플로우 일정이 캘린더에 반영되는가

### 6-7. 성과(Performance) 계산 정확성
- IRR, TVPI, DPI 계산에 사용되는 데이터 소스가 올바른가
- 납입총액이 CapitalCallItem 합계와 일치하는가
- 분배총액이 DistributionItem 합계와 일치하는가

### 6-8. 회계(Accounting) ↔ 거래 연동
- 거래(Transaction) 생성 시 자동 분개 생성 확인
- CapitalCall/Distribution과 회계 연동 확인

---

## Part 7: 미구현 필드 보완

### 7-1. Fund 모델에 registration_number / registration_date 추가
앞서 감사에서 발견된 미구현 항목:
1. `backend/models/fund.py` — Fund에 `registration_number = Column(String, nullable=True)`, `registration_date = Column(Date, nullable=True)` 추가
2. `backend/schemas/fund.py` — FundCreate, FundUpdate, FundResponse, FundListItem, FundOverviewItem에 해당 필드 추가
3. Alembic 마이그레이션 생성 및 적용
4. `frontend/src/lib/api.ts` — Fund, FundInput, FundOverviewItem 인터페이스에 추가
5. `frontend/src/pages/FundsPage.tsx` — 카드에 고유번호·등록성립일 표시, FundForm에 입력필드 추가
6. `frontend/src/pages/FundDetailPage.tsx` — 기본정보에 표시, 수정폼에 입력필드 추가
7. `frontend/src/pages/FundOverviewPage.tsx` — 등록(성립)일 컬럼에 `registration_date || formation_date` fallback

---

## 검증 계획 (다중 검증 — 핵심)

### 검증 Round 1: 빌드 검증
```bash
cd frontend && npm run build
cd backend && python -m pytest tests/ -v --tb=short
```
- TypeScript 타입 에러 0건
- 백엔드 테스트 전체 통과

### 검증 Round 2: 타입 일치 자동 점검
Part 1~4 점검 항목을 모두 다시 한번 확인:
1. 모든 모델 Column이 Response 스키마에 존재하는지 grep으로 재확인
2. 모든 api.ts interface 필드가 백엔드 스키마에 존재하는지 대조
3. 모든 api.ts 함수의 URL이 라우터에 존재하는지 대조

### 검증 Round 3: 교차 기능 테스트
```bash
cd backend && python -m pytest tests/test_cross_features.py -v
cd backend && python -m pytest tests/test_fund_operations.py -v
cd backend && python -m pytest tests/test_dashboard.py -v
```

### 검증 Round 4: 전체 회귀 테스트
```bash
cd backend && python -m pytest tests/ -v --tb=long 2>&1 | tail -50
```
- 기존 모든 테스트 통과 확인
- 실패 테스트 있으면 수정 후 재실행

### 검증 Round 5: 최종 빌드 확인
```bash
cd frontend && npm run build
```
- 경고 0건 확인

---

## 주의사항
1. **기존 기능을 깨뜨리지 않는다** — 모든 수정 후 테스트 필수
2. **필드 추가는 nullable로** — 기존 데이터 호환성 유지
3. **한 번에 하나씩** — Part 1 수정 → 검증 → Part 2 수정 → 검증 순서로
4. **불확실한 변경은 하지 않는다** — 확실한 누락/불일치만 수정
5. **Alembic 마이그레이션은 Part 7 수행 시에만** — 모델 변경이 있을 때만
6. **console.log, print 디버깅 코드 남기지 않는다**
