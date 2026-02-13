# VC ERP Phase 2 — 1인 백오피스 실무 효율화 명세서

> 트리거투자파트너스 1인 백오피스 관리자를 위한 실무 중심 개선
> 작성일: 2026-02-13
> 대상 작업자: OpenAI CODEX
> PM: Claude Code

---

## 현재 상태 (Phase 1 완료 항목)

Phase 1 명세서(CODEX_IMPROVEMENT_PLAN.md)의 **20개 항목이 전부 구현 완료**되었다.

| 완료 항목 | 커밋 |
|-----------|------|
| FastAPI lifespan 전환 (P0-3) | `85b0ec2` |
| TypeScript `any` 타입 제거 (P0-2) | `2310d92` |
| Pydantic 검증 강화 (P3-1) | `85b0ec2` |
| 에러 응답 일관화 (P3-2) | `f515281` |
| 한국어 UI 전환 (P0-1) | `85b0ec2` |
| Toast 알림 시스템 (P4-4) | `dfc80f2` |
| 캘린더 월별 뷰 (P1-1) | `3c05f99` |
| Task↔Calendar 자동 연동 (P1-2) | `6a70542` |
| 조합 상세 페이지 (P1-4) | `b6f5138` |
| 투자 상세 페이지 (P1-5) | `7afa9d5` |
| Workflow 스텝 자동 활성화 (P1-3) | `bed8576` |
| 조합 결성 워크플로우 시드 (P2-1) | `41b5ff5` |
| 정기 총회 워크플로우 시드 (P2-2) | `41b5ff5` |
| 월보고 리마인더 (P2-3) | `258bfde` |
| 교훈 연동 (P2-4) | `c9c2d9d` |
| 대시보드 레이아웃 (P4-1) | `86786ee` |
| 드래그 앤 드롭 (P4-2) | `00d3933` |
| 반응형 사이드바 (P4-3) | `3662db4` |
| Alembic 마이그레이션 (P3-3) | `2c60e25` |
| API 스모크 테스트 | `399482c` |

---

## Phase 2 설계 원칙

### 이 시스템의 사용자는 누구인가

VC(벤처캐피탈) 백오피스를 **혼자** 운영하는 관리자 1명이다.

- 투심위, 투자계약, 서류관리, LP보고, 월보고를 모두 혼자 처리
- 한 번에 여러 건의 투자가 동시 진행될 수 있음
- 실수 방지와 마감 준수가 생명
- 외부 시스템(사내 ERP, 농금원, VICS, 홈택스)과의 수작업 연계가 많음

### 설계 기준

1. **기능 < 동선 단축**: 기능 수를 늘리는 것보다, 기존 기능에 **더 빠르게 도달**하는 것이 우선
2. **입력 < 자동화**: 사용자가 직접 입력하는 횟수를 줄이는 것이 핵심
3. **필요 없는 기능은 만들지 않음**: 1인 사용이므로 인증, 권한, 멀티테넌시 불필요

---

## 작업 목록

### A. 워크플로우 ↔ 투자건 연결 (핵심)

> **언어**: Python (Backend) + TypeScript (Frontend)
> **수정 파일**: `backend/models/workflow_instance.py`, `backend/schemas/workflow.py`, `backend/routers/workflows.py`, `backend/services/workflow_service.py`, `frontend/src/lib/api.ts`, `frontend/src/pages/WorkflowsPage.tsx`, `frontend/src/pages/InvestmentDetailPage.tsx`

**문제**: 현재 워크플로우 인스턴스가 투자건(Investment)이나 피투자사(Company)와 연결되지 않는다. "A사 투심위"를 실행해도 어떤 투자건인지 알 수 없다. 1인 관리자가 동시에 3~4건의 투자를 진행하면 혼동이 발생한다.

**작업**:

1. **`backend/models/workflow_instance.py`** — 필드 추가:
   ```python
   investment_id = Column(Integer, ForeignKey("investments.id"), nullable=True)
   company_id = Column(Integer, ForeignKey("portfolio_companies.id"), nullable=True)
   fund_id = Column(Integer, ForeignKey("funds.id"), nullable=True)
   ```

2. **`backend/schemas/workflow.py`** — 인스턴스 생성 스키마에 optional 필드 추가:
   ```python
   class WorkflowInstantiateInput(BaseModel):
       name: str
       trigger_date: str
       memo: str | None = None
       investment_id: int | None = None
       company_id: int | None = None
       fund_id: int | None = None
   ```

3. **`backend/routers/workflows.py`** — instantiate 엔드포인트에서 해당 필드 저장

4. **`frontend/src/pages/WorkflowsPage.tsx`** — 워크플로우 실행(instantiate) 폼에 드롭다운 추가:
   - "관련 조합" 선택 (선택사항)
   - "관련 피투자사" 선택 (선택사항)
   - 선택하면 인스턴스에 연결

5. **`frontend/src/pages/InvestmentDetailPage.tsx`** — 해당 투자건과 연결된 워크플로우 인스턴스 목록 표시
   - API: `fetchWorkflowInstances` 에 `investment_id` 필터 추가 (backend)

6. **`frontend/src/lib/api.ts`** — 관련 타입/함수 업데이트

**결과**: "메디테크3호 - A사 투심위" 처럼 어떤 조합의 어떤 회사 건인지 바로 보임

---

### B. 대시보드에서 바로 완료 처리

> **언어**: TypeScript (TSX)
> **수정 파일**: `frontend/src/pages/DashboardPage.tsx`
> **Backend 변경**: 없음 (기존 `PATCH /api/tasks/{id}/complete` 활용)

**문제**: 대시보드에서 오늘 할 일을 보고 완료하려면 `/tasks` 페이지로 이동해야 한다. 1인 관리자는 대시보드를 메인 화면으로 사용하므로, 여기서 바로 완료 처리가 가능해야 한다.

**작업**:

1. **TaskCard 컴포넌트 수정** — 왼쪽에 완료 버튼 (원형 체크버튼) 추가:
   ```tsx
   <button
     onClick={(e) => {
       e.stopPropagation()
       // actual_time 입력 없이 빠른 완료 (estimated_time을 actual_time으로 자동 채움)
       completeTaskMut.mutate({ id: task.id, actual_time: task.estimated_time || '0m' })
     }}
     className="mt-0.5 w-4 h-4 rounded-full border-2 border-slate-300 hover:border-green-500 hover:bg-green-50 shrink-0"
   />
   ```

2. **mutation 추가** — DashboardPage에 `completeTask` mutation:
   ```tsx
   const completeTaskMut = useMutation({
     mutationFn: ({ id, actual_time }: { id: number; actual_time: string }) => completeTask(id, actual_time),
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['dashboard'] })
       addToast('success', '작업을 완료했습니다.')
     },
   })
   ```

3. TaskCard의 `onClick` (페이지 이동)은 제목 클릭 시만 동작. 완료 버튼은 별도.

**결과**: 대시보드에서 원클릭 완료. 동선 1단계 → 0단계.

---

### C. 글로벌 검색 (Cmd+K / Ctrl+K)

> **언어**: Python (Backend) + TypeScript (Frontend)
> **신규 파일**: `backend/routers/search.py`, `frontend/src/components/SearchModal.tsx`
> **수정 파일**: `backend/main.py`, `frontend/src/components/Layout.tsx`, `frontend/src/lib/api.ts`

**문제**: 특정 피투자사, 조합, 투자건을 찾으려면 해당 메뉴를 클릭하고 스크롤해야 한다. 데이터가 많아질수록 비효율적이다.

**작업**:

1. **`backend/routers/search.py`** (Python, 신규) — 통합 검색 엔드포인트:
   ```python
   @router.get("/api/search")
   def search(q: str, db: Session = Depends(get_db)):
       """제목/이름에서 q를 LIKE 검색. 카테고리별 최대 5건씩 반환."""
       results = []
       # Tasks
       tasks = db.query(Task).filter(Task.title.ilike(f"%{q}%")).limit(5).all()
       for t in tasks:
           results.append({"type": "task", "id": t.id, "title": t.title, "url": "/tasks"})
       # Funds
       funds = db.query(Fund).filter(Fund.name.ilike(f"%{q}%")).limit(5).all()
       for f in funds:
           results.append({"type": "fund", "id": f.id, "title": f.name, "url": f"/funds/{f.id}"})
       # Companies
       companies = db.query(PortfolioCompany).filter(PortfolioCompany.name.ilike(f"%{q}%")).limit(5).all()
       for c in companies:
           results.append({"type": "company", "id": c.id, "title": c.name, "url": "/investments"})
       # Investments (회사명으로)
       # Workflow Instances
       instances = db.query(WorkflowInstance).filter(WorkflowInstance.name.ilike(f"%{q}%")).limit(5).all()
       for i in instances:
           results.append({"type": "workflow", "id": i.id, "title": i.name, "url": "/workflows"})
       return results
   ```

2. **`backend/main.py`** — `search` 라우터 등록

3. **`frontend/src/components/SearchModal.tsx`** (TypeScript, 신규):
   - `Ctrl+K` (또는 `Cmd+K`) 키보드 단축키로 모달 열기
   - 입력 필드 + 300ms debounce 검색
   - 결과를 카테고리별 (조합, 피투자사, 작업, 워크플로우) 그룹 표시
   - 결과 클릭 → `navigate(url)` 후 모달 닫기
   - ESC로 닫기

4. **`frontend/src/components/Layout.tsx`** — 상단 바에 검색 아이콘 + `SearchModal` 렌더

5. **`frontend/src/lib/api.ts`** — 검색 함수:
   ```typescript
   export interface SearchResult { type: string; id: number; title: string; url: string }
   export const search = (q: string): Promise<SearchResult[]> => api.get('/search', { params: { q } }).then(r => r.data)
   ```

**결과**: `Ctrl+K` → "메디" 입력 → "메디테크 3호" 조합 즉시 이동. 3초 내 원하는 곳 도달.

---

### D. 서류 수집 마감 D-day 추적

> **언어**: Python (Backend) + TypeScript (Frontend)
> **수정 파일**: `backend/models/investment.py`, `backend/schemas/investment.py`, `backend/routers/dashboard.py`, `frontend/src/pages/DashboardPage.tsx`, `frontend/src/pages/InvestmentDetailPage.tsx`

**문제**: 투자 후 서류(바이블)는 규약상 영업일 15일 이내 수탁사 송부가 원칙이다. 하지만 현재 서류에 "투자일 기준 몇 일 남았는지" 추적이 없다. 수집 마감일이 없으므로 지연이 발생한다.

**작업**:

1. **`backend/models/investment.py`** — `InvestmentDocument`에 필드 추가:
   ```python
   due_date = Column(Date, nullable=True)  # 서류 수집 마감일
   ```

2. **`backend/schemas/investment.py`** — 스키마에 `due_date` 추가

3. **`backend/routers/dashboard.py`** — `missing_documents` 응답에 `due_date`와 `days_remaining` 추가:
   ```python
   if doc.due_date:
       days_remaining = (doc.due_date - date.today()).days
   else:
       days_remaining = None
   ```

4. **`frontend/src/pages/DashboardPage.tsx`** — 미수 서류 카드에 마감일/잔여일 표시:
   - 잔여 3일 이내: 빨간색 뱃지 `D-3`
   - 잔여 7일 이내: 주황색 뱃지 `D-7`
   - 초과: 빨간 배경 + `지연` 표시

5. **`frontend/src/pages/InvestmentDetailPage.tsx`** — 서류 추가/수정 폼에 `due_date` 입력 필드 추가

**결과**: "A사 주주명부 D-3" 같은 마감 추적이 가능. 서류 누락 방지.

---

### E. 워크플로우 실행 시 서류 자동 생성

> **언어**: Python
> **수정 파일**: `backend/services/workflow_service.py`, `backend/routers/workflows.py`
> **Frontend 변경**: 없음 (기존 InvestmentDetailPage 서류 목록에 자동 반영)

**문제**: 워크플로우 템플릿에 필수 서류 목록이 정의되어 있지만, 인스턴스 실행 시 실제 `InvestmentDocument` 레코드가 생성되지 않는다. 관리자가 서류를 일일이 수동 등록해야 한다.

**전제**: A항목(워크플로우↔투자건 연결)이 완료되어야 함.

**작업**:

1. **`backend/services/workflow_service.py`** — `instantiate_workflow()` 함수 수정:
   - `investment_id`가 제공된 경우, 워크플로우 템플릿의 `documents` 목록을 순회
   - 각 문서에 대해 `InvestmentDocument` 레코드를 `status="pending"`으로 자동 생성
   ```python
   if investment_id:
       for doc in workflow.documents:
           existing = db.query(InvestmentDocument).filter(
               InvestmentDocument.investment_id == investment_id,
               InvestmentDocument.name == doc.name,
           ).first()
           if not existing:
               new_doc = InvestmentDocument(
                   investment_id=investment_id,
                   name=doc.name,
                   doc_type=doc.timing or "",
                   status="pending",
                   note=f"워크플로우 자동생성: {workflow.name}",
               )
               db.add(new_doc)
   ```

**결과**: "투자 후 서류처리" 워크플로우 실행 → 바이블, 등기부등본, 출자증서 등 6건의 서류가 자동 등록. 수동 입력 0건.

---

### F. 대시보드 워크플로우 진행 상세 표시

> **언어**: TypeScript (TSX)
> **수정 파일**: `frontend/src/pages/DashboardPage.tsx`
> **Backend 변경**: 없음 (기존 API로 충분)

**문제**: 대시보드의 "진행중 워크플로우" 카드가 이름과 진행률만 보여준다. 1인 관리자는 "다음에 뭘 해야 하는지"가 가장 중요한데, 현재 `next_step` 이름만 나오고 마감일이 없다.

**작업**:

1. **`backend/routers/dashboard.py`** — `active_workflows` 응답에 정보 추가:
   ```python
   active_workflows.append({
       "id": instance.id,
       "name": instance.name,
       "progress": f"{done}/{total}",
       "next_step": next_step_name,
       "next_step_date": next_step_date,  # 추가: 다음 스텝 예정일
       "company_name": company_name,       # 추가: 관련 피투자사명 (A항목 연동)
       "fund_name": fund_name,             # 추가: 관련 조합명
   })
   ```

2. **`frontend/src/pages/DashboardPage.tsx`** — 워크플로우 카드 개선:
   ```tsx
   <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
     <div className="flex items-center justify-between">
       <p className="text-sm font-medium text-indigo-800">{wf.name}</p>
       <span className="text-xs text-indigo-600">{wf.progress}</span>
     </div>
     {wf.company_name && (
       <p className="text-xs text-indigo-500 mt-0.5">{wf.fund_name} · {wf.company_name}</p>
     )}
     {wf.next_step && (
       <p className="text-xs text-indigo-700 mt-1.5 font-medium">
         다음: {wf.next_step}
         {wf.next_step_date && <span className="text-indigo-500 ml-1">({wf.next_step_date})</span>}
       </p>
     )}
   </div>
   ```

**결과**: "메디테크3호 A사 투심위 — 3/7 — 다음: 투심위 서류 사인 (2/17)" 한눈에 파악.

---

### G. 워크플로우 인스턴스 진행 바 시각화

> **언어**: TypeScript (TSX)
> **수정 파일**: `frontend/src/pages/WorkflowsPage.tsx`
> **Backend 변경**: 없음

**문제**: 워크플로우 인스턴스의 각 스텝이 텍스트 리스트로만 표시된다. 전체 진행 상황을 직관적으로 파악하기 어렵다.

**작업**:

1. **스텝 진행 바** — 인스턴스 상세 보기에 수평 진행 바 추가:
   ```tsx
   // 전체 스텝을 가로 타임라인으로 표시
   <div className="flex items-center gap-1 mb-4">
     {instance.step_instances.map((step, i) => (
       <div key={step.id} className="flex items-center">
         <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
           ${step.status === 'completed' ? 'bg-green-500 text-white' :
             step.status === 'in_progress' ? 'bg-blue-500 text-white' :
             'bg-slate-200 text-slate-500'}`}>
           {step.status === 'completed' ? '✓' : i + 1}
         </div>
         {i < instance.step_instances.length - 1 && (
           <div className={`w-8 h-0.5 ${step.status === 'completed' ? 'bg-green-400' : 'bg-slate-200'}`} />
         )}
       </div>
     ))}
   </div>
   ```

2. 기존 텍스트 리스트는 아래에 유지 (상세 정보용)

**결과**: `●─●─●─○─○─○─○` 형태로 현재 어디까지 진행됐는지 즉시 파악.

---

### H. 조합(Fund) 대시보드에 투자 현황 요약

> **언어**: TypeScript (TSX)
> **수정 파일**: `frontend/src/pages/FundDetailPage.tsx`
> **Backend 변경**: 없음 (기존 API 조합)

**문제**: 조합 상세 페이지에 LP 목록과 투자 목록만 있고, 조합 전체의 투자 현황 요약이 없다. LP 대면 미팅이나 보고 시 즉시 숫자를 확인할 수 없다.

**작업**:

1. **FundDetailPage 상단에 요약 카드 추가**:
   ```tsx
   <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
     <SummaryCard label="총 약정" value={formatKRW(fund.commitment_total)} />
     <SummaryCard label="운용규모(AUM)" value={formatKRW(fund.aum)} />
     <SummaryCard label="투자 건수" value={`${investments.length}건`} />
     <SummaryCard label="투자 금액 합계" value={formatKRW(totalInvestmentAmount)} />
   </div>
   ```

2. **금액 포맷 유틸리티**: `formatKRW(amount)` → `"12.5억"`, `"3,200만"` 형태
   - `frontend/src/lib/labels.ts`에 추가:
   ```typescript
   export function formatKRW(amount: number | null): string {
     if (amount == null) return '-'
     if (amount >= 100_000_000) return `${(amount / 100_000_000).toFixed(1)}억`
     if (amount >= 10_000) return `${(amount / 10_000).toFixed(0).toLocaleString()}만`
     return amount.toLocaleString()
   }
   ```

**결과**: 조합 상세 열면 "총 약정 100억 | AUM 85억 | 투자 12건 | 투자합계 72.3억" 즉시 확인.

---

## 불필요 항목 판단 (만들지 않을 것)

| 기능 | 불필요 판단 이유 |
|------|-----------------|
| 사용자 인증/권한 | 1인 사용. 로컬 네트워크에서만 접근 |
| 이메일 알림 | 1인이 직접 시스템을 확인. 알림 대상이 본인뿐 |
| 파일 업로드/저장소 | 실제 서류는 사내 ERP에 업로드. 이 시스템은 **메타데이터 추적**만 |
| PDF 리포트 생성 | LP 보고는 사내 ERP에서 출력. 이 시스템은 **작업 관리** 목적 |
| 실시간 WebSocket | 1인 사용이므로 React Query의 refetch로 충분 |
| Google Calendar 양방향 동기화 | Claude Code의 gcal.py로 이미 처리 중. ERP와 별도 관리 |
| 복잡한 차트/그래프 | LP 보고용 차트는 사내 ERP에서 생성. 이 시스템은 일일 업무 관리 |
| 다국어(i18n) | 한국어 단일 사용 |

---

## 기술 스택 (Phase 1과 동일)

| 구분 | 기술 |
|------|------|
| Backend | Python + FastAPI + SQLAlchemy + SQLite |
| Frontend | TypeScript + React 19 + Vite + Tailwind CSS |
| 서버 상태 | TanStack React Query |
| HTTP | Axios (`frontend/src/lib/api.ts`) |
| 아이콘 | Lucide React |

---

## 작업 순서 & 의존성

```
A (워크플로우↔투자건 연결)     ← 독립. 가장 먼저.
  ↓
E (워크플로우 실행 시 서류 자동생성)  ← A 완료 후.
  ↓
F (대시보드 워크플로우 상세)     ← A 완료 후.

B (대시보드 바로 완료)         ← 독립. 병렬 가능.
C (글로벌 검색)              ← 독립. 병렬 가능.
D (서류 마감 D-day)           ← 독립. 병렬 가능.
G (워크플로우 진행 바)         ← 독립. 병렬 가능.
H (조합 투자 현황 요약)        ← 독립. 병렬 가능.
```

### 권장 실행 순서

```
1. A  (워크플로우↔투자건 연결) — 다른 항목의 기반
2. B  (대시보드 바로 완료) — 가장 빈번한 동선 단축
3. E  (서류 자동 생성) — A 의존
4. F  (대시보드 워크플로우 상세) — A 의존
5. D  (서류 마감 D-day) — 서류 누락 방지
6. C  (글로벌 검색) — 데이터 증가 대비
7. G  (워크플로우 진행 바) — UX 개선
8. H  (조합 투자 현황 요약) — UX 개선
```

---

## CODEX 작업 규칙

1. **하나의 항목 = 하나의 커밋**. prefix: `feat:`, `fix:`, `refactor:`
2. **DB 필드 추가 시** `nullable=True` 필수. 기존 데이터 호환 유지.
3. **외부 라이브러리 추가 금지**. 기존 의존성 범위 내에서 해결.
4. **기존 코드 스타일 유지**: Python은 snake_case + type hint, TypeScript는 함수형 컴포넌트 + Tailwind.
5. **빌드 검증**: 각 커밋 후 `cd frontend && npm run build` 및 `cd backend && python -c "from main import app"` 확인.

---

## 파일 경로 참조

| 구분 | 경로 | 언어 |
|------|------|------|
| Backend 진입점 | `backend/main.py` | Python |
| 모델 | `backend/models/*.py` | Python |
| 스키마 | `backend/schemas/*.py` | Python |
| 라우터 | `backend/routers/*.py` | Python |
| 서비스 | `backend/services/workflow_service.py` | Python |
| 시드 | `backend/seed/seed_workflows.py` | Python |
| Frontend API + 타입 | `frontend/src/lib/api.ts` | TypeScript |
| 라벨 유틸 | `frontend/src/lib/labels.ts` | TypeScript |
| 레이아웃 | `frontend/src/components/Layout.tsx` | TSX |
| Toast | `frontend/src/contexts/ToastContext.tsx` | TSX |
| 페이지 | `frontend/src/pages/*.tsx` | TSX |

---

**작성자**: Claude Code (PM)
**작업 대상**: OpenAI CODEX
**마지막 업데이트**: 2026-02-13
