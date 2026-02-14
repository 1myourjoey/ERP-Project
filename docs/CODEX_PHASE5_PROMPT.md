# Codex Phase 5 Prompts — UX 혁신 & 실용성 개편

---

## 전체 한번에 실행할 프롬프트

```
이 프로젝트는 FastAPI + SQLAlchemy + SQLite 백엔드와 React + TypeScript + Vite + TailwindCSS v4 프론트엔드로 구성된 VC ERP 시스템이다.
docs/CODEX_PHASE5_SPEC.md 파일을 읽고 Q0부터 Q10까지 순서대로 모두 구현하라.

규칙:
1. 기존 API URL과 필드명은 변경하지 않고 확장만 한다
2. 프론트엔드 모든 텍스트는 한국어
3. npm run build 통과 필수
4. 새 컬럼 추가 시 backend/main.py의 ensure_sqlite_compat_columns()에 ALTER TABLE 추가
5. Pydantic v2 문법 사용
6. 아이콘은 lucide-react에서만 import
7. 색상은 slate 대신 gray 사용 (text-slate-* → text-gray-*, bg-slate-* → bg-gray-*, border-slate-* → border-gray-*)
8. 각 Q 항목을 개별 커밋으로 분리하여 커밋
9. CalendarPage.tsx 파일은 삭제하지 말 것 (라우트/네비게이션에서만 제거)
10. 기존 기능을 유지하면서 개선할 것 (기존 CRUD가 깨지면 안됨)
```

---

## 개별 항목 프롬프트 (하나씩 실행 시)

### Q0: 디자인 시스템 전면 교체

```
VC ERP 프론트엔드의 디자인 시스템을 Apple-style minimalist로 전면 교체하라.

1. 색상 전면 교체 — 모든 프론트엔드 파일(.tsx, .css)에서:
   - text-slate-* → text-gray-*
   - bg-slate-* → bg-gray-*
   - border-slate-* → border-gray-*
   대상 파일: src/pages/*.tsx, src/components/*.tsx, src/index.css 전부

2. frontend/src/index.css에 전역 스타일 추가:
   body { background-color: #fafafa; }
   커스텀 스크롤바 (width 6px, 회색 thumb, transparent track)

3. frontend/src/components/Layout.tsx 사이드바 전면 재디자인:
   - 기존 bg-slate-900 다크 사이드바 → bg-white + border-r border-gray-200 화이트 사이드바
   - 텍스트: text-gray-600 기본, active 시 text-blue-600 + bg-blue-50 + 좌측 3px 파란 바 (border-l-[3px] border-blue-600)
   - 아이콘: text-gray-400 기본, active 시 text-blue-500
   - 로고: text-gray-900 font-bold (배경 없이)
   - hover: hover:bg-gray-50

4. Layout.tsx의 NAV 배열을 카테고리 그룹으로 재구성:
   NAV_GROUPS 배열로 변경하여 카테고리별 세로 구성:
   - (라벨 없음): 대시보드
   - "업무": 업무 보드, 업무 기록
   - "조합·투자": 조합 관리, 투자 관리, 워크플로우
   - "재무·거래": 거래원장, 가치평가, 회계 관리
   - "보고·관리": 영업보고, 보고공시, 조합 운영, 회수 관리
   - "도구": 체크리스트, 서류 현황
   캘린더는 NAV에서 제거 (별도 탭 불필요, 대시보드에 내장 예정).
   각 그룹 사이에 얇은 회색 구분선 (h-px bg-gray-100 mx-4 my-2).
   그룹 라벨: text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 mb-1

5. 모든 페이지 공통 스타일 업데이트:
   - 카드: rounded-xl → rounded-2xl shadow-sm
   - 인풋: bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 rounded-xl
   - 페이지 제목: text-xl font-semibold (기존 text-2xl font-bold)

6. 상단 헤더: border-b border-gray-100 (더 얇게)

npm run build 통과 확인. 기존 기능이 깨지지 않도록 주의.
```

### Q1: 워크플로우 카테고리화 + 세로형 구성

```
frontend/src/pages/WorkflowsPage.tsx를 전면 재구성하라.

현재: 2칸 그리드 (좌: 템플릿 리스트, 우: 활성 인스턴스)
변경: 세로 풀와이드 1단 레이아웃 + 탭 구조

1. 상단: 페이지 제목 + [+ 새 템플릿] 버튼
2. 탭 바: [템플릿] [활성 인스턴스] [완료된 인스턴스]
   - 탭 스타일: 하단 border-b-2 방식

3. 템플릿 탭 내용:
   - 워크플로우 templates를 category 필드로 그룹화
   - 각 카테고리: 아코디언 형태 (클릭 시 접기/펼치기)
   - 카테고리 헤더: text-sm font-semibold + 템플릿 수 배지 + ChevronDown/ChevronUp 아이콘
   - 카테고리 내 템플릿: flex flex-wrap gap-3으로 가로 카드 나열
   - 각 카드: 템플릿 이름, step 수, 소요시간 + 수정/삭제/시작 아이콘 버튼
   - 카드 클릭 시 상세 확장 (아코디언 내부)

4. 활성 인스턴스 탭: 기존 ActiveInstances 컴포넌트 재사용 (풀와이드)
5. 완료 탭: fetchWorkflowInstances({status:'completed'}) 호출하여 완료된 인스턴스 목록

6. 템플릿 생성/수정: 기존 TemplateEditor를 모달(overlay)로 변경
   - fixed inset-0 bg-black/40 z-50 오버레이
   - 중앙 max-w-2xl bg-white rounded-2xl p-6 max-h-[90vh] overflow-auto

모든 텍스트 한국어. npm run build 통과 확인.
```

### Q2: 업무 완료 → 업무 기록 자동 연동

```
Task 완료 시 WorkLog를 자동 생성하는 기능을 구현하라 (on/off 토글 가능).

1. backend/routers/tasks.py:
   - PATCH /api/tasks/{id}/complete 엔드포인트의 요청 body에 auto_worklog: bool | None = None 추가
   - auto_worklog=True이면 Task 완료 후 WorkLog 자동 생성:
     title: "[완료] {task.title}"
     date: 오늘 날짜
     duration: actual_time 값
     category: "업무"
     summary: task.memo 또는 "{task.title} 완료"
   - WorkLog, WorkLogDetail 모델 import 필요

2. frontend/src/lib/api.ts:
   - completeTask 함수 시그니처 변경:
     completeTask(id: number, actual_time: string, auto_worklog?: boolean)
   - 요청 body에 auto_worklog 포함

3. frontend/src/pages/TaskBoardPage.tsx:
   - CompleteModal에 "업무 기록 자동 생성" 체크박스 추가
   - 체크박스 기본값: localStorage.getItem('autoWorklog') === 'true'
   - 체크박스 변경 시 localStorage.setItem('autoWorklog', String(checked))
   - completeMutation.mutate에 autoWorklog 값 전달
   - 완료 후 worklogs 쿼리도 invalidate: queryClient.invalidateQueries({ queryKey: ['worklogs'] })

4. frontend/src/pages/DashboardPage.tsx:
   - handleQuickComplete에서 localStorage 읽어서 auto_worklog 전달
   - completeTask(task.id, task.estimated_time || '0m', autoWorklog)

npm run build 통과 확인.
```

### Q3: 업무 보드 완료 탭 월별/연도별 필터

```
업무 보드의 완료 탭에서 월별/연도별 필터를 추가하라.

1. backend/routers/tasks.py:
   - GET /api/tasks/board 엔드포인트에 year: int | None = None, month: int | None = None 파라미터 추가
   - status=completed이고 year/month 있으면 Task.completed_at 기준 필터:
     from sqlalchemy import extract
     if year: query = query.filter(extract('year', Task.completed_at) == year)
     if month: query = query.filter(extract('month', Task.completed_at) == month)

2. frontend/src/lib/api.ts:
   - fetchTaskBoard 시그니처 변경:
     fetchTaskBoard(status = 'pending', year?: number, month?: number)
   - params에 year, month 추가

3. frontend/src/pages/TaskBoardPage.tsx:
   - useState로 completedYear (기본: 현재 연도), completedMonth (기본: 현재 월)
   - statusFilter === 'completed'일 때만 필터 UI 표시:
     연도 select: 현재 연도, 현재-1, 현재-2
     월 select: 전체(값: undefined), 1월~12월
   - useQuery queryKey에 year/month 포함:
     queryKey: ['taskBoard', statusFilter, completedYear, completedMonth]
   - fetchTaskBoard 호출 시 completed이면 year/month 전달

npm run build 통과 확인.
```

### Q4: 조합 ↔ 피투자사 양방향 연결

```
조합 상세와 투자 상세 사이에 양방향 네비게이션 링크를 추가하라.

1. frontend/src/pages/FundDetailPage.tsx:
   - 투자내역 섹션의 각 투자건을 클릭 가능하게 변경
   - 클릭 시 navigate(`/investments/${inv.id}`) 호출
   - 회사명, 투자일, 금액, 상태 표시 + ChevronRight 아이콘

2. frontend/src/pages/InvestmentDetailPage.tsx:
   - 상단 정보 영역에 연결된 조합 표시
   - 조합명 클릭 시 navigate(`/funds/${investment.fund_id}`) 이동
   - 스타일: text-blue-600 hover:underline

3. frontend/src/pages/InvestmentsPage.tsx:
   - 투자 목록에서 조합명 클릭 → /funds/{fund_id} 이동
   - 회사명 클릭 → /investments/{id} 이동 (기존 유지)

useNavigate import 필요. npm run build 통과 확인.
```

### Q5: 투자 등록 시 포트폴리오 회사 자동 생성

```
frontend/src/pages/InvestmentsPage.tsx에서 투자 등록 시 회사를 새로 생성할 수 있게 하라.

현재: 회사를 먼저 등록해야 투자 등록 가능
변경: 투자 등록 폼의 회사 드롭다운에 "+ 새 회사 추가" 옵션 추가

1. 회사 select에 value=-1인 "+ 새 회사 추가" 옵션 추가
2. company_id === -1 선택 시 인라인 입력 필드 3개 표시:
   - 회사명 (필수)
   - 사업자번호
   - 대표자
3. 투자 저장 로직:
   - company_id === -1이면: 먼저 createCompany() 호출하여 회사 생성 → 반환된 id로 createInvestment() 호출
   - 기존 회사 선택이면: 바로 createInvestment() 호출
4. 회사 생성 후 companies 쿼리 invalidate
5. 에러 처리: 회사 생성 실패 시 투자 생성 시도하지 않음

한국어 텍스트. npm run build 통과 확인.
```

### Q6: 영업보고 조합 기반으로 전환

```
영업보고(BizReportsPage)를 피투자사 대상에서 조합 대상으로 전환하라.

1. backend/models/biz_report.py:
   - BizReport 모델에 fund_id 컬럼 추가:
     fund_id = Column(Integer, ForeignKey("funds.id"), nullable=True)

2. backend/schemas/biz_report.py:
   - BizReportCreate, BizReportResponse에 fund_id: int | None = None 추가

3. backend/routers/biz_reports.py:
   - GET /api/biz-reports에 fund_id 필터 파라미터 추가

4. backend/main.py ensure_sqlite_compat_columns():
   ("biz_reports", "fund_id", "INTEGER") 추가

5. frontend/src/lib/api.ts:
   - BizReportInput, BizReport에 fund_id: number | null 추가
   - fetchBizReports에 fund_id 파라미터 추가

6. frontend/src/pages/BizReportsPage.tsx 전면 재설계:
   - 1순위 필터: 조합 선택 (fetchFunds로 드롭다운)
   - 조합 선택 시:
     a) 조합 정보 요약 카드 표시 (약정총액, AUM, 투자건수)
     b) 해당 조합의 투자건 목록 자동 로드 (fetchInvestments({fund_id}))
     c) 각 피투자사별 영업보고 테이블
   - 보고서 작성 시 fund_id 자동 설정
   - 기존 company_id 기반 CRUD 기능 유지
   - 필터에 기간(report_type), 상태 유지

한국어 텍스트. npm run build 통과 확인.
```

### Q7: 보고공시 수시보고 기록 용도 수정

```
frontend/src/pages/ReportsPage.tsx를 수시보고 기록 용도로 수정하라.

1. 페이지 헤더 변경:
   제목: "보고·공시 관리"
   부제목: "정기/수시 보고 일정과 현황을 기록합니다. 실제 보고는 각 기관 시스템에서 진행합니다."

2. 보고 대상(REPORT_TARGET_OPTIONS) 확대:
   기존: ['농금원', 'VICS', 'LP', '내부보고회', '홈택스']
   변경: ['농금원', 'VICS', 'LP', '내부보고회', '홈택스', '금감원', '한국벤처캐피탈협회', '기타']

3. 상태(STATUS_OPTIONS) 변경:
   기존: ['미작성', '작성중', '검수중', '전송완료', '실패']
   변경: ['예정', '준비중', '제출완료', '확인완료']

4. frontend/src/lib/labels.ts에 새 상태 라벨 추가:
   예정: '예정', 준비중: '준비중', 제출완료: '제출완료', 확인완료: '확인완료'

5. 메모 필드 강화:
   - 목록 표시에서 memo가 있으면 말줄임 표시
   - 편집 시 textarea로 크게 표시 (rows=4)
   - placeholder: "보고 관련 메모 (예: 자료 전달 예정, 담당자 연락처 등)"

6. 레이아웃: 기존 테이블 → 카드 리스트로 변경
   각 카드에: 보고대상, 조합명, 기간, 상태 배지, D-day 배지, 메모 프리뷰

npm run build 통과 확인.
```

### Q8: 체크리스트 투자건 연결

```
체크리스트에 투자건 연결 기능을 추가하라.

1. backend/models/checklist.py:
   - Checklist 모델에 investment_id 컬럼 추가:
     investment_id = Column(Integer, ForeignKey("investments.id"), nullable=True)

2. backend/schemas/checklist.py:
   - ChecklistInput에 investment_id: int | None = None 추가
   - ChecklistListItem에 investment_id: int | None = None 추가

3. backend/routers/checklists.py:
   - GET /api/checklists에 investment_id 필터 파라미터 추가
   - 체크리스트 생성/수정 시 investment_id 저장

4. backend/main.py ensure_sqlite_compat_columns():
   ("checklists", "investment_id", "INTEGER") 추가

5. frontend/src/lib/api.ts:
   - ChecklistInput, ChecklistListItem에 investment_id 추가
   - fetchChecklists에 investment_id 파라미터 추가

6. frontend/src/pages/ChecklistsPage.tsx:
   - 체크리스트 생성/수정 폼에 "연결 투자건" 드롭다운 추가 (선택사항)
   - fetchInvestments, fetchCompanies로 투자 목록 표시
   - 페이지 상단 설명: "특정 시점의 점검 항목을 관리합니다."

7. frontend/src/pages/InvestmentDetailPage.tsx:
   - 투자 상세 페이지에 "체크리스트" 섹션 추가
   - fetchChecklists({investment_id}) 호출
   - 각 체크리스트 카드: 이름, 카테고리, 진행률(완료/전체) 바

npm run build 통과 확인.
```

### Q9: 캘린더 → 대시보드/업무보드 내장 패널

```
캘린더를 별도 탭에서 제거하고 대시보드/업무보드 내장 패널로 전환하라.

1. frontend/src/App.tsx:
   - /calendar 라우트 제거 (import도 제거)
   - CalendarPage.tsx 파일 자체는 삭제하지 말 것

2. Layout.tsx에서 캘린더 NAV 항목이 이미 Q0에서 제거되었는지 확인. 아니면 제거.

3. 새 파일 frontend/src/components/MiniCalendar.tsx 생성:
   - Props: { year: number, month: number, onMonthChange: (y, m) => void }
   - 월간 그리드 (7열 x 6행), 작은 크기
   - 각 날짜 셀: 오늘 강조 (bg-blue-600 text-white rounded-full)
   - Task 마감일 있는 날: 하단 파란 도트 (w-1 h-1 rounded-full bg-blue-500)
   - fetchDashboard 또는 fetchCalendarEvents로 이벤트 데이터 로드
   - 날짜 클릭 시: 해당 날짜 이벤트 목록을 아래에 표시
   - 월 이동: < > 버튼
   - 이벤트 추가: 날짜 클릭 시 간단한 인라인 폼 (제목, 시간)
   - 삭제: X 버튼

4. frontend/src/pages/DashboardPage.tsx:
   - 우측 사이드바 최상단에 MiniCalendar 추가 (조합 요약 위)

5. frontend/src/pages/TaskBoardPage.tsx:
   - 상단 우측에 캘린더 토글 버튼 추가 (CalendarDays 아이콘)
   - 토글 on: 메인 영역을 2/3 + 1/3로 분할, 우측에 MiniCalendar
   - 토글 off: 기존 풀와이드 보드
   - 토글 상태: localStorage('taskBoardCalendar')에 저장
   - 기본: off

npm run build 통과 확인.
```

### Q10: CSS 최종 정리

```
frontend/src/index.css에 최종 전역 스타일을 정리하라.

다음 내용을 추가/확인:

body {
  background-color: #fafafa;
  font-feature-settings: "cv02", "cv03", "cv04", "cv11";
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Slim scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background-color: #d1d5db; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background-color: #9ca3af; }

/* Focus ring reset (Tailwind handles it) */
input:focus, select:focus, textarea:focus { outline: none; }

기존 index.css 내용과 중복되지 않도록 확인.
Tailwind 설정과 충돌하지 않도록 주의.
npm run build 통과 확인.
```
