# Phase 5: UX 혁신 & 실용성 개편 — Codex Spec

> 디자인 시스템 전면 교체 + 기능 간 유기적 연결 강화 + 실무 동선 최적화
> 총 11개 항목, Q0~Q10

---

## CODEX 공통 규칙

1. Python 코드는 `backend/` 기준, TypeScript는 `frontend/src/` 기준
2. TailwindCSS v4 사용 (v3 문법과 대부분 호환, `@apply` 사용 자제)
3. 프론트엔드 텍스트 모두 한국어
4. `npm run build` 통과 필수
5. 기존 API URL/필드명 변경 금지, 확장만
6. 새 컬럼 추가 시 `backend/main.py`의 `ensure_sqlite_compat_columns()` 함수에 ALTER TABLE 추가
7. Pydantic v2 문법 사용
8. React Query v5 사용 (useQuery/useMutation)
9. 아이콘은 `lucide-react`에서만 import
10. 각 Q 항목을 개별 커밋으로 분리

---

## Q0: 디자인 시스템 전면 교체 — Apple-style Minimalist

### 디자인 원칙
- **Minimalist infographic style**: 불필요한 장식 제거
- **Apple-style clean aesthetics**: 넓은 여백, 얇은 회색 라인, 소프트 블루 악센트
- **Simple vector icons**: lucide-react 아이콘 최소 사용
- **Elegant & professional**: 금융 서비스에 어울리는 고급스러운 느낌

### 색상 팔레트 변경

```
Primary: #2563eb (blue-600) → 메인 액션
Accent: #3b82f6 (blue-500) → 호버, 링크
Background: #fafafa → 전체 배경 (기존 white에서 변경)
Surface: #ffffff → 카드 배경
Border: #e5e7eb (gray-200) → 매우 얇은 보더
Text Primary: #111827 (gray-900)
Text Secondary: #6b7280 (gray-500)
Text Tertiary: #9ca3af (gray-400)
Success: #059669 (emerald-600)
Warning: #d97706 (amber-600)
Danger: #dc2626 (red-600)
```

### 파일: `frontend/src/index.css`
전체 배경색 변경:
```css
body {
  background-color: #fafafa;
}
```

### 파일: `frontend/src/components/Layout.tsx`

#### 사이드바 전면 재디자인
기존 `bg-slate-900` 다크 사이드바 → **화이트 사이드바 + 얇은 우측 보더**:

```
사이드바 스타일:
- 배경: bg-white (dark sidebar 제거)
- 우측 보더: border-r border-gray-200
- 텍스트: text-gray-700 (기본), text-blue-600 (active)
- Active 항목: bg-blue-50 text-blue-600 font-medium (좌측 파란 바 3px)
- Hover: bg-gray-50
- 아이콘: text-gray-400 (기본), text-blue-500 (active)
- 로고 영역: 좌상단, 텍스트만 (VC ERP / 작은 서브텍스트)
```

#### 사이드바 카테고리 그룹화 (요구사항 #11)
NAV 배열을 카테고리별로 그룹화하여 세로형 구성:

```typescript
const NAV_GROUPS = [
  {
    label: null, // 카테고리 라벨 없음 (최상위)
    items: [
      { to: '/dashboard', label: '대시보드', icon: LayoutDashboard },
    ],
  },
  {
    label: '업무',
    items: [
      { to: '/tasks', label: '업무 보드', icon: KanbanSquare },
      { to: '/worklogs', label: '업무 기록', icon: BookOpen },
    ],
  },
  {
    label: '조합·투자',
    items: [
      { to: '/funds', label: '조합 관리', icon: Building2 },
      { to: '/investments', label: '투자 관리', icon: PieChart },
      { to: '/workflows', label: '워크플로우', icon: GitBranch },
    ],
  },
  {
    label: '재무·거래',
    items: [
      { to: '/transactions', label: '거래원장', icon: ListTree },
      { to: '/valuations', label: '가치평가', icon: LineChart },
      { to: '/accounting', label: '회계 관리', icon: Calculator },
    ],
  },
  {
    label: '보고·관리',
    items: [
      { to: '/biz-reports', label: '영업보고', icon: FileText },
      { to: '/reports', label: '보고공시', icon: Send },
      { to: '/fund-operations', label: '조합 운영', icon: Landmark },
      { to: '/exits', label: '회수 관리', icon: TrendingDown },
    ],
  },
  {
    label: '도구',
    items: [
      { to: '/checklists', label: '체크리스트', icon: CheckSquare },
      { to: '/documents', label: '서류 현황', icon: Files },
    ],
  },
]
```

- 캘린더 탭 **제거** (요구사항 #10에 따라 대시보드/업무보드 내장으로 이동)
- 각 그룹 사이에 `<div className="h-px bg-gray-100 mx-4 my-2" />` 구분선
- 그룹 라벨: `text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 mb-1`

#### 상단 헤더 재디자인
```
- 배경: bg-white, 하단 보더: border-b border-gray-100
- 좌측: 현재 페이지 타이틀 (breadcrumb 느낌, text-sm text-gray-500)
- 우측: 검색 버튼만 (기존과 동일, 보더 더 얇게)
- 모바일 햄버거: 유지
```

### 전체 페이지 공통 스타일 변경

모든 페이지(17개)에 적용할 스타일 가이드:

| 요소 | 기존 | 변경 |
|------|------|------|
| 페이지 제목 | `text-2xl font-bold text-slate-900` | `text-xl font-semibold text-gray-900` |
| 카드 | `bg-white border border-slate-200 rounded-xl` | `bg-white border border-gray-100 rounded-2xl shadow-sm` |
| 버튼 (primary) | `bg-blue-600 text-white rounded-lg` | `bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all` |
| 버튼 (secondary) | `bg-slate-100 rounded-lg` | `bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100` |
| 인풋 | `border border-slate-200 rounded-lg` | `border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400` |
| 테이블 행 | `border-b` | `border-b border-gray-50 hover:bg-gray-50/50` |
| 배지 | `bg-red-100 text-red-700` | `bg-red-50 text-red-600 font-medium` |
| 텍스트 색상 | `text-slate-*` | `text-gray-*` (slate→gray 전면 교체) |
| 간격 | `p-6` | `p-6 lg:p-8` (큰 화면에서 여백 확대) |

**작업**: 모든 17개 페이지 + Layout.tsx + SearchModal.tsx + Toast.tsx에서:
1. `text-slate-` → `text-gray-` 전면 치환
2. `bg-slate-` → `bg-gray-` 전면 치환
3. `border-slate-` → `border-gray-` 전면 치환
4. 카드 `rounded-xl` → `rounded-2xl shadow-sm`
5. 인풋에 `bg-gray-50 focus:bg-white` 추가

---

## Q1: 워크플로우 템플릿 카테고리화 + 세로형 구성

### 파일: `frontend/src/pages/WorkflowsPage.tsx`

현재: 좌측 2칸 그리드 (템플릿 리스트 | 활성 인스턴스)
변경: **세로 풀와이드 1단 레이아웃**

#### 구조 변경

```
┌─────────────────────────────────────────────┐
│ 워크플로우                    [+ 새 템플릿]  │
├─────────────────────────────────────────────┤
│ 탭: [템플릿] [활성 인스턴스] [완료]          │
├─────────────────────────────────────────────┤
│ 템플릿 탭 내용:                              │
│                                             │
│ ▸ 투자 (3)  ────────────────────────        │
│   투자심의위원회  |  투자계약 체결  |  투자후  │
│                                             │
│ ▸ 조합 (4)  ────────────────────────        │
│   고유번호증  |  수탁계약  |  결성총회  |  통합 │
│                                             │
│ ▸ 정기업무 (3)  ────────────────────         │
│   내부보고회  |  월보고  |  정기총회           │
└─────────────────────────────────────────────┘
```

#### 세부 구현

1. **상단 탭 바**: `templates` | `active` | `completed` 3개 탭
   - 탭 스타일: `border-b-2 border-blue-600` (active), `text-gray-400` (inactive)

2. **템플릿 탭** — 카테고리별 아코디언:
   - 워크플로우 템플릿의 `category` 필드로 그룹화
   - 각 카테고리: 접기/펼치기 가능한 섹션
   - 카테고리 헤더: `text-sm font-semibold text-gray-700` + 템플릿 수 배지
   - 템플릿 카드: 가로 나열 (flex-wrap), 클릭 시 상세 확장
   - 각 카드에 수정/삭제/시작 아이콘 버튼

3. **활성 인스턴스 탭** — 기존 ActiveInstances 컴포넌트 재사용, 풀와이드
4. **완료 탭** — `status=completed` 인스턴스 목록 (새로 추가)

5. **템플릿 생성/수정**: 기존 TemplateEditor를 모달(overlay)로 변경
   - `fixed inset-0 bg-black/40` 오버레이
   - 중앙 `max-w-2xl` 흰색 패널

---

## Q2: 업무 완료 → 업무 기록 자동 연동

### 개념
업무 보드 또는 대시보드에서 Task 완료 시, 자동으로 WorkLog 레코드를 생성하는 기능.
사용자가 on/off 토글 가능.

### Backend

#### 파일: `backend/routers/tasks.py`
`PATCH /api/tasks/{id}/complete` 엔드포인트 수정:

요청 body에 `auto_worklog` 필드 추가 (Optional[bool], default=None):
```python
class TaskCompleteRequest(BaseModel):
    actual_time: str
    auto_worklog: bool | None = None  # 추가
```

`auto_worklog=True`이면 Task 완료 시 WorkLog 자동 생성:
```python
if data.auto_worklog:
    from models.worklog import WorkLog, WorkLogDetail
    worklog = WorkLog(
        title=f"[완료] {task.title}",
        date=date.today().isoformat(),
        start_time=None,
        end_time=None,
        duration=data.actual_time,
        category="업무",
        summary=task.memo or f"{task.title} 완료",
    )
    db.add(worklog)
    db.flush()

    if task.memo:
        db.add(WorkLogDetail(worklog_id=worklog.id, content=task.memo))
```

### Frontend

#### 파일: `frontend/src/lib/api.ts`
`completeTask` 함수에 `auto_worklog` 파라미터 추가:
```typescript
export const completeTask = (id: number, actual_time: string, auto_worklog?: boolean) =>
  api.patch(`/tasks/${id}/complete`, { actual_time, auto_worklog }).then(r => r.data)
```

#### 파일: `frontend/src/pages/TaskBoardPage.tsx`
CompleteModal에 "업무 기록 자동 생성" 토글 추가:
```
┌──────────────────────────────┐
│ 작업 완료                     │
│                              │
│ 실제 소요시간: [1h30m      ] │
│                              │
│ ☑ 업무 기록 자동 생성         │
│                              │
│ [완료]  취소                  │
└──────────────────────────────┘
```
- 체크박스 기본값: localStorage에서 `autoWorklog` 키로 on/off 상태 저장
- `completeMutation.mutate({ id, actualTime, autoWorklog: checked })`

#### 파일: `frontend/src/pages/DashboardPage.tsx`
`handleQuickComplete`에서도 동일하게 적용:
- localStorage에서 autoWorklog 설정값 읽어서 전달
- Quick complete이므로 별도 UI 없이 설정값 자동 적용

---

## Q3: 업무 보드 완료 탭 — 월별/연도별 필터

### 파일: `frontend/src/pages/TaskBoardPage.tsx`

현재: 상태 필터 `진행 중 | 전체 | 완료` 3개 탭
변경: **완료 탭 선택 시 월별/연도별 필터 드롭다운 표시**

#### Backend 변경
`backend/routers/tasks.py`의 `GET /api/tasks/board` 엔드포인트에 필터 추가:

```python
@router.get("/api/tasks/board")
def get_board(
    status: str = "pending",
    year: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
):
```

`status=completed`이고 year/month가 있으면:
```python
if status == "completed" and (year or month):
    query = query.filter(Task.completed_at.isnot(None))
    if year:
        query = query.filter(extract('year', Task.completed_at) == year)
    if month:
        query = query.filter(extract('month', Task.completed_at) == month)
```
`from sqlalchemy import extract` 필요.

#### Frontend 변경

완료 탭 선택 시 필터 바 표시:
```
[진행 중] [전체] [완료]
                       ┌─────────────────────────┐
                       │ 2026년 ▾  │  2월 ▾      │
                       └─────────────────────────┘
```

- 연도 select: 현재 연도 ~ 현재 연도-2 (예: 2026, 2025, 2024)
- 월 select: 전체, 1월~12월
- 기본값: 현재 연도, 현재 월
- `fetchTaskBoard(statusFilter, year, month)` 호출

```typescript
const { data: board } = useQuery<TaskBoard>({
  queryKey: ['taskBoard', statusFilter, completedYear, completedMonth],
  queryFn: () => fetchTaskBoard(statusFilter,
    statusFilter === 'completed' ? completedYear : undefined,
    statusFilter === 'completed' ? completedMonth : undefined
  ),
})
```

`api.ts`의 `fetchTaskBoard` 수정:
```typescript
export const fetchTaskBoard = (status = 'pending', year?: number, month?: number) =>
  api.get('/tasks/board', { params: { status, year, month } }).then(r => r.data)
```

---

## Q4: 조합 ↔ 피투자사 양방향 연결

### 문제
현재 FundDetailPage에서 투자내역이 보이지만 피투자사로 이동하는 링크가 없음.
InvestmentsPage에서도 조합으로 이동하는 링크가 없음.

### 파일: `frontend/src/pages/FundDetailPage.tsx`

투자내역 섹션에서 각 투자건 클릭 시 `/investments/{id}`로 이동:
```tsx
<button
  onClick={() => navigate(`/investments/${inv.id}`)}
  className="w-full text-left p-3 rounded-xl border border-gray-100 hover:bg-gray-50"
>
  <div className="flex items-center justify-between">
    <span className="font-medium text-gray-800">{inv.company_name}</span>
    <ChevronRight size={16} className="text-gray-400" />
  </div>
  <p className="text-xs text-gray-500 mt-1">
    {inv.investment_date ? new Date(inv.investment_date).toLocaleDateString('ko-KR') : '-'} |
    {inv.amount ? formatKRW(inv.amount) : '-'} |
    {labelStatus(inv.status)}
  </p>
</button>
```

### 파일: `frontend/src/pages/InvestmentDetailPage.tsx`

상단 정보 영역에 연결된 조합 표시 + 클릭 시 `/funds/{fund_id}`로 이동:
```tsx
{investment.fund_id && (
  <button
    onClick={() => navigate(`/funds/${investment.fund_id}`)}
    className="text-xs text-blue-600 hover:underline"
  >
    {investment.fund_name || `조합 #${investment.fund_id}`} →
  </button>
)}
```

### 파일: `frontend/src/pages/InvestmentsPage.tsx`

투자 목록 테이블에서:
- 조합명 클릭 → `/funds/{fund_id}` 이동
- 회사명 클릭 → `/investments/{investment_id}` 이동 (기존 동작 유지)

---

## Q5: 투자 등록 시 포트폴리오 회사 자동 생성

### 문제
현재 흐름: 회사 먼저 등록 → 투자 등록 (2단계)
관리역 입장에서: **투자 등록하면서 회사도 같이 입력**하는 게 자연스러움

### 파일: `frontend/src/pages/InvestmentsPage.tsx`

투자 등록 폼 수정:
1. `company_id` 드롭다운에 **"+ 새 회사 추가"** 옵션 추가
2. 새 회사 추가 선택 시 인라인으로 회사명/사업자번호/대표자 최소 3개 필드만 표시
3. 투자 저장 시:
   - `company_id === 0` (새 회사)이면 먼저 `createCompany()`로 회사 생성
   - 생성된 `company.id`를 투자 데이터에 넣어서 `createInvestment()` 호출

```typescript
const handleCreateInvestment = async () => {
  let companyId = newInvestment.company_id

  // 새 회사 생성이 필요한 경우
  if (companyId === -1 && newCompanyName.trim()) {
    const company = await createCompany({
      name: newCompanyName.trim(),
      business_number: newCompanyBizNum,
      ceo: newCompanyCeo,
      // 나머지는 빈값
    })
    companyId = company.id
  }

  await createInvestment({
    ...newInvestment,
    company_id: companyId,
  })
}
```

UI:
```
조합: [조합 선택 ▾]
회사: [기존 회사 선택 ▾] 또는 [+ 새 회사]
      ┌ 새 회사 인라인 입력 ──────────────┐
      │ 회사명: [        ]                 │
      │ 사업자번호: [        ]             │
      │ 대표자: [        ]                 │
      └───────────────────────────────────┘
투자일: [    ]  금액: [    ]  ...
```

---

## Q6: 영업보고 → 조합 기반으로 전환

### 문제
현재 BizReportsPage는 **피투자사(company_id) 기반**으로 영업보고를 관리.
실무에서 영업보고는 **조합(fund) 대상**임. 조합 선택 → 재무제표 + 피투자사 현황 조회.

### Backend

#### 파일: `backend/models/biz_report.py`
`fund_id` 컬럼 추가:
```python
fund_id = Column(Integer, ForeignKey("funds.id"), nullable=True)
```

#### 파일: `backend/schemas/biz_report.py`
BizReportCreate, BizReportResponse에 `fund_id: int | None = None` 추가.

#### 파일: `backend/main.py`
```python
("biz_reports", "fund_id", "INTEGER"),
```

### Frontend

#### 파일: `frontend/src/pages/BizReportsPage.tsx`
전면 재설계:

```
┌─────────────────────────────────────────────┐
│ 영업보고                    [+ 보고서 작성]  │
├─────────────────────────────────────────────┤
│ 대상 조합: [조합 선택 ▾]   기간: [▾]       │
├─────────────────────────────────────────────┤
│                                             │
│ ┌── 조합 재무 요약 ───────────────────────┐ │
│ │ 약정총액: 100억  출자잔액: 50억         │ │
│ │ AUM: 80억       투자건수: 5건           │ │
│ └────────────────────────────────────────┘ │
│                                             │
│ ┌── 피투자사 현황 ────────────────────────┐ │
│ │ 회사명  | 보고유형 | 기간 | 상태 | 재무 │ │
│ │ A사     | 분기보고 | Q4   | 수신 | ...  │ │
│ │ B사     | 분기보고 | Q4   | 요청중| ... │ │
│ └────────────────────────────────────────┘ │
│                                             │
│ * 조합 선택 시 해당 조합의 투자건 목록 자동  │
│   로드 → 각 피투자사별 영업보고 관리          │
└─────────────────────────────────────────────┘
```

핵심 변경:
1. 필터 1순위: **조합 선택** (fund_id)
2. 조합 선택 시 → `fetchFund(fundId)` + `fetchInvestments({ fund_id })` 자동 호출
3. 조합 재무 요약 카드 표시 (약정, AUM, 투자건수)
4. 피투자사별 영업보고 테이블 (기존 company_id 기반 유지하되, 조합 필터로 자동 바인딩)
5. 보고서 작성 시 fund_id 자동 설정

#### 파일: `frontend/src/lib/api.ts`
BizReportInput, BizReport에 `fund_id: number | null` 추가.
fetchBizReports에 `fund_id` 파라미터 추가.

---

## Q7: 보고공시 → 수시보고 기록 용도로 수정

### 문제
현재 ReportsPage는 정기보고(농금원, VICS 등) 관리인데, 실무에서는 각 기관별 ERP가 따로 존재.
→ **어떤 것을 언제 보고해야 하는지 기록/추적하는 용도**로 전환.

### 파일: `frontend/src/pages/ReportsPage.tsx`
페이지 헤더 변경:
```
보고·공시 관리
정기/수시 보고 일정과 현황을 기록합니다.
(실제 보고는 농금원 ERP, VICS 등 각 기관 시스템에서 진행)
```

기존 기능(CRUD)은 유지하되 다음 추가:
1. **메모 필드 강화**: 각 보고 항목에 `memo` 필드를 크게 표시 (textarea)
   - "향후 자료 전달 예정" 등의 메모 기록용
2. **보고 대상 옵션 확대**: 기존 5개 + 추가
   ```
   기존: 농금원, VICS, LP, 내부보고회, 홈택스
   추가: 금감원, 한국벤처캐피탈협회, 기타
   ```
3. **status 옵션 수정**:
   ```
   기존: 미작성, 작성중, 검수중, 전송완료, 실패
   변경: 예정, 준비중, 제출완료, 확인완료
   ```
4. 레이아웃: 테이블 대신 **카드 리스트** (D-day 배지 큰 표시)

### Backend

#### 파일: `backend/routers/regular_reports.py`
status 필터에 새 값 허용 (기존 값도 호환 유지).

#### 파일: `frontend/src/lib/labels.ts`
새 상태 라벨 추가:
```typescript
예정: '예정',
준비중: '준비중',
제출완료: '제출완료',
확인완료: '확인완료',
```

---

## Q8: 체크리스트 활용 방안 재정립

### 분석
체크리스트는 워크플로우의 서류/주의사항과 일부 중복되지만, **워크플로우는 프로세스 자동화**, **체크리스트는 일회성 점검**에 사용.

### 활용 정의
- 워크플로우: 반복적 업무 프로세스 (투심위, 결성, 보고 등) → 자동 Task 생성
- 체크리스트: **특정 시점의 점검 목록** (투자 전 체크리스트, 연말 결산 체크리스트, 감사 준비 등)

### 파일: `frontend/src/pages/ChecklistsPage.tsx`
변경사항:
1. 페이지 설명 추가:
   ```
   체크리스트
   특정 시점의 점검 항목을 관리합니다. (예: 투자 전 점검, 연말 결산, 감사 준비)
   ```

2. **투자건 연결 기능** 추가:
   - 체크리스트에 `investment_id` 선택 옵션 (Optional)
   - 투자 상세 페이지에서 연결된 체크리스트 확인 가능

### Backend

#### 파일: `backend/models/checklist.py`
Checklist 모델에 `investment_id` 필드 추가:
```python
investment_id = Column(Integer, ForeignKey("investments.id"), nullable=True)
```

#### 파일: `backend/schemas/checklist.py`
ChecklistInput, ChecklistListItem에 `investment_id: int | None = None` 추가.

#### 파일: `backend/main.py`
```python
("checklists", "investment_id", "INTEGER"),
```

### 파일: `frontend/src/pages/InvestmentDetailPage.tsx`
투자 상세 페이지에 "체크리스트" 섹션 추가:
- `fetchChecklists({ investment_id })` 호출
- 체크리스트 목록 + 진행률 바

---

## Q9: 캘린더 → 대시보드/업무보드 내장 패널

### 문제
캘린더가 별도 탭이라 접근 빈도가 낮음. 대시보드/업무보드에서 바로 볼 수 있어야 실용적.

### 변경 사항

1. **App.tsx**: `/calendar` 라우트 **제거**
2. **Layout.tsx**: NAV에서 캘린더 항목 **제거** (Q0에서 이미 반영)

3. **캘린더 미니 컴포넌트 생성**: `frontend/src/components/MiniCalendar.tsx`
   - 월간 그리드 (작은 크기, 사이드패널용)
   - Task 마감일 도트 표시 (파란색)
   - 워크플로우 step 마감일 도트 표시 (보라색)
   - 캘린더 이벤트 도트 표시 (초록색)
   - 날짜 클릭 시 해당 날짜의 이벤트 목록 팝오버
   - 이벤트 추가/삭제는 팝오버 내에서 가능

4. **DashboardPage.tsx**: 우측 사이드바에 MiniCalendar 추가
   ```
   ┌──────────────────────────┬──────────────┐
   │ 오늘 작업 / 워크플로우    │ 미니 캘린더  │
   │ 내일 / 이번주 / 예정     │ 조합 요약    │
   │                          │ 보고 마감    │
   │                          │ 미수 서류    │
   └──────────────────────────┴──────────────┘
   ```

5. **TaskBoardPage.tsx**: 토글 버튼으로 캘린더 패널 on/off
   ```
   업무 보드                       [📅 캘린더]
   ┌─────────────────────┬──────────────────┐
   │ Q1 | Q2             │ 미니 캘린더      │
   │ Q3 | Q4             │ (토글 시 표시)   │
   └─────────────────────┴──────────────────┘
   ```
   - 기본: off (캘린더 숨김, 풀와이드 보드)
   - on: 2/3 + 1/3 레이아웃 (보드 | 캘린더)
   - 토글 상태는 localStorage 저장

### CalendarPage.tsx 유지
파일은 삭제하지 않고 남겨두되, 라우트와 네비게이션에서만 제거. 향후 전체 캘린더 뷰가 필요할 때 복원 가능.

---

## Q10: index.css 최종 정리

### 파일: `frontend/src/index.css`

전역 스타일 추가:
```css
/* Apple-style smooth transitions */
* {
  transition-property: background-color, border-color, color, opacity;
  transition-duration: 150ms;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background-color: #d1d5db;
  border-radius: 3px;
}

/* Input focus ring */
input:focus, select:focus, textarea:focus {
  outline: none;
}

body {
  background-color: #fafafa;
  font-feature-settings: "cv02", "cv03", "cv04", "cv11";
}
```

---

## 작업 순서 요약

| 순서 | 항목 | 핵심 변경 | 영향 파일 수 |
|------|------|-----------|------------|
| 1 | Q0: 디자인 시스템 | slate→gray, 사이드바 화이트, 카테고리 그룹 | **20+** |
| 2 | Q1: 워크플로우 세로형 | 카테고리 아코디언, 탭 구조, 모달 에디터 | 1 |
| 3 | Q2: 완료→업무기록 연동 | 백엔드 Task완료+WorkLog, 프론트 토글 | 4 |
| 4 | Q3: 완료 탭 필터 | 백엔드 year/month 필터, 프론트 드롭다운 | 2 |
| 5 | Q4: 조합↔피투자사 링크 | navigate 링크 추가 | 3 |
| 6 | Q5: 투자시 회사 자동 생성 | 인라인 회사 입력, 2-step API 호출 | 1 |
| 7 | Q6: 영업보고 조합 기반 | fund_id 추가, 조합→피투자사 자동 로드 | 4 |
| 8 | Q7: 보고공시 수정 | 상태/대상 옵션 변경, 메모 강화, 카드 UI | 2 |
| 9 | Q8: 체크리스트 연결 | investment_id 추가, 투자상세 연동 | 4 |
| 10 | Q9: 캘린더 내장 | MiniCalendar 컴포넌트, DashboardPage/TaskBoard 패널 | 4 |
| 11 | Q10: CSS 최종 정리 | index.css 전역 스타일 | 1 |
