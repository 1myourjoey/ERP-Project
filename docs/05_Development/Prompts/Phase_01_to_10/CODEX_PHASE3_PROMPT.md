# Codex 실행 프롬프트

> 이 파일은 OpenAI Codex에 전달할 프롬프트입니다.
> 명세서: `docs/CODEX_PHASE3_SPEC.md`

---

## 프롬프트 (복사하여 Codex에 전달)

```
You are implementing Phase 3 of the VC ERP system. The full specification is at `docs/CODEX_PHASE3_SPEC.md`. Read it completely before starting.

This project is a VC back-office ERP system for a solo administrator. The tech stack is:
- Backend: Python + FastAPI + SQLAlchemy + SQLite (in `backend/`)
- Frontend: React 19 + TypeScript + Vite + Tailwind CSS 4 + React Query 5 (in `frontend/`)

Previous phases (Phase 1: 20 items, Phase 2: 8 items) are fully complete. Phase 3 added transaction/valuation/exit/fund-operations pages but they are in English.

## Your tasks (execute in order, one commit per Q item):

### Q0: Korean localization for 4 new pages + Layout NAV
Read `docs/CODEX_PHASE3_SPEC.md` section Q0. Change ALL English UI text to Korean in:
1. `frontend/src/components/Layout.tsx` — NAV labels + search button text
2. `frontend/src/pages/TransactionsPage.tsx`
3. `frontend/src/pages/ValuationsPage.tsx`
4. `frontend/src/pages/FundOperationsPage.tsx`
5. `frontend/src/pages/ExitsPage.tsx`
Also add new statuses to `frontend/src/lib/labels.ts` STATUS_LABEL.
DO NOT change API field names, DB values, or variable names. Only change display text.

### Q1: BizReport (영업보고) — full-stack CRUD
Read spec Q1. Create:
- `backend/models/biz_report.py` (BizReport model)
- `backend/schemas/biz_report.py` (Create/Update/Response schemas)
- `backend/routers/biz_reports.py` (GET list+detail, POST, PUT, DELETE)
- Register in `backend/models/__init__.py` and `backend/main.py`
- Add API functions + types in `frontend/src/lib/api.ts`
- Create `frontend/src/pages/BizReportsPage.tsx` (filter/create/edit/delete, all Korean UI)
- Add route in `App.tsx` and NAV entry in `Layout.tsx` (label: '영업보고', icon: FileText, position: after 투자 관리)

### Q2: RegularReport (보고·공시) — full-stack CRUD
Read spec Q2. Create:
- `backend/models/regular_report.py`
- `backend/schemas/regular_report.py`
- `backend/routers/regular_reports.py` (include days_remaining in response)
- Register model and router
- Add API functions + types in api.ts
- Create `frontend/src/pages/ReportsPage.tsx` (with due_date D-day badges, all Korean UI)
- Add route and NAV entry (label: '보고·공시', icon: Send)

### Q3: Accounting basics (회계 기초) — simplified
Read spec Q3. Create:
- `backend/models/accounting.py` (Account, JournalEntry, JournalEntryLine)
- `backend/schemas/accounting.py`
- `backend/routers/accounting.py` (accounts CRUD + journal entries CRUD with lines + trial-balance endpoint)
- `backend/seed/seed_accounts.py` (16 standard accounts)
- Call seed in `main.py` lifespan
- Register model and router
- Add API functions + types in api.ts
- Create `frontend/src/pages/AccountingPage.tsx` (3 tabs: 계정과목, 전표, 합계잔액, all Korean UI)
- Add route and NAV entry (label: '회계 관리', icon: Calculator)

### Q4: VoteRecord (의결권 행사) — integrated into InvestmentDetail
Read spec Q4. Create:
- `backend/models/vote_record.py`
- `backend/schemas/vote_record.py`
- `backend/routers/vote_records.py`
- Register model and router
- Add API functions + types in api.ts
- Add "의결권 행사 이력" section to `frontend/src/pages/InvestmentDetailPage.tsx` (table with add/edit/delete)
- No separate page needed

### Q5: Dashboard enhancement
Read spec Q5. Modify:
- `backend/routers/dashboard.py` — add upcoming_reports to response
- `frontend/src/pages/DashboardPage.tsx` — add "보고 마감" card in sidebar + 5th stat card

## Rules:
1. One commit per Q item. Commit message: `feat: Q0 Korean localization for phase3 pages`
2. All new UI text MUST be in Korean
3. API field names stay English. UI display text = Korean.
4. No new npm/pip packages
5. Follow existing code patterns (check TransactionsPage.tsx, biz_reports.py for reference)
6. After each Q item, verify: `cd frontend && npm run build` and `cd backend && python -c "from main import app; print('OK')"`
7. New models → add to `backend/models/__init__.py`
8. New routers → add to `backend/main.py`
9. New pages → add to both `App.tsx` (Route) and `Layout.tsx` (NAV)
10. DB fields must be nullable with defaults for backward compatibility
```

---

## 항목별 개별 프롬프트 (한 번에 하나씩 실행할 경우)

### Q0만 실행할 때:

```
Read `docs/CODEX_PHASE3_SPEC.md` section Q0 completely.

Localize all English UI text to Korean in these files:
1. `frontend/src/components/Layout.tsx` — change NAV labels (Dashboard→대시보드, Task Board→업무 보드, Workflows→워크플로우, Work Logs→업무 기록, Funds→조합 관리, Investments→투자 관리, Transaction Ledger→거래원장, Valuations→가치평가, Fund Operations→조합 운영, Exit Management→회수 관리, Checklists→체크리스트, Documents→서류 현황, Calendar→캘린더). Also change "Search" to "검색" in the header.
2. `frontend/src/pages/TransactionsPage.tsx` — all English labels to Korean per spec
3. `frontend/src/pages/ValuationsPage.tsx` — all English labels to Korean per spec
4. `frontend/src/pages/FundOperationsPage.tsx` — all English labels to Korean per spec
5. `frontend/src/pages/ExitsPage.tsx` — all English labels to Korean per spec
6. `frontend/src/lib/labels.ts` — add new status labels per spec

DO NOT change: API field names, variable names, DB values. Only change user-visible display text.
After changes, run: `cd frontend && npm run build` to verify.
Commit: `feat: Q0 Korean localization for phase3 pages`
```

### Q1만 실행할 때:

```
Read `docs/CODEX_PHASE3_SPEC.md` section Q1 completely.

Implement BizReport (영업보고 수집·관리) full-stack CRUD:

Backend:
1. Create `backend/models/biz_report.py` with BizReport model (company_id FK, report_type, period, status, financial fields)
2. Create `backend/schemas/biz_report.py` with Create/Update schemas
3. Create `backend/routers/biz_reports.py` with GET list (filters: company_id, report_type, status), GET detail, POST, PUT, DELETE. Include company_name in responses.
4. Add import to `backend/models/__init__.py`
5. Register router in `backend/main.py`

Frontend:
6. Add BizReport types and API functions to `frontend/src/lib/api.ts`
7. Create `frontend/src/pages/BizReportsPage.tsx` — Korean UI, filters, create form, table with inline edit, status badges, expandable financial data section
8. Add route `/biz-reports` in `App.tsx`
9. Add NAV entry in `Layout.tsx`: { to: '/biz-reports', label: '영업보고', icon: FileText } after 투자 관리

All UI text must be Korean. Follow existing code patterns (reference: TransactionsPage.tsx).
Verify: `cd frontend && npm run build` and `cd backend && python -c "from main import app; print('OK')"`
Commit: `feat: Q1 add biz report collection and management`
```

### Q2~Q5도 동일한 패턴으로 개별 실행 가능 (명세서 참조)

---

## 전체를 한 번에 실행할 때의 프롬프트 (위 "프롬프트" 섹션 전체 사용)
