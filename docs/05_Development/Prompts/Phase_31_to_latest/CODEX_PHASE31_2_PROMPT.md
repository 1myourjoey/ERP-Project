# Phase 31_2: 보조 뷰 레이아웃 정비 + 카테고리 체계 + 업무일지 학습 + UX 다듬기 + 워크플로 UX

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 및 아래 참조 문서를 먼저 읽을 것.
>
> **참조 PRD:** `docs/06_PRD/PRD_01_Dashboard.md`, `docs/06_PRD/PRD_02_TaskBoard.md`, `docs/06_PRD/PRD_04_Funds.md`
> **참조 플로우차트:** `docs/06_PRD/Flowchart/v_on_erp_comprehensive_flow.md`
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist를 반드시 수행할 것.

**Priority:** P1 (UX/Efficiency)

---

## Part 1. 파이프라인 레이아웃 개편

> **대상 파일:** `frontend/src/components/TaskPipelineView.tsx` (685줄)

### 1-1. 핵심 요구: 화이트 카드 컨테이너에 스테이지 열이 꽉 채워지게

**현재 문제:**
현재 파이프라인은 `card-base` (또는 상위 div) 안에 4개 스테이지 열이 `flex flex-1`로 균등 배치됩니다.
하지만 각 스테이지 열 **안의** Task 카드들이 단순 리스트로 쌓여서, 업무가 많아지면 스크롤이 길어지고
줄어들면 빈 공간이 남습니다.

**변경 후:**
- 전체 화이트 카드(`card-base` 또는 `rounded-2xl bg-white border`) 안에서
  **4개 스테이지 열이 컨테이너 높이를 가득 채우도록** `h-full` 적용
- 각 스테이지 열 내부의 Task/워크플로 카드들이 **컨테이너 크기에 맞춰 자동으로 크기 조정** (auto-fit)
  - 업무가 적으면 카드 높이가 넉넉하게
  - 업무가 많으면 카드가 컴팩트해지되 모두 보임 (극단적으로 많으면 스크롤)
- **구현 방법:** 각 스테이지 열의 내부 컨텐츠 영역에 `flex flex-col flex-1 min-h-0 overflow-y-auto` 적용.
  카드 자체는 `flex-shrink` 허용하여 공간에 맞게 축소
- 모든 카드는 **흰색 배경**(`bg-white border border-gray-200 rounded-lg`) 스타일 통일

### 1-2. 대기(No Deadline) 영역을 상단 가로 배치

```
┌──────────────────────────────────────────────────────┐
│  화이트 카드 컨테이너 (rounded-2xl bg-white)           │
│  ┌────────────────────────────────────────────────┐   │
│  │ 📥 대기 (기한 미배정)  3건    ← 가로 스크롤    │   │
│  │ [카드] [카드] [카드] [카드]                     │   │
│  └────────────────────────────────────────────────┘   │
│  ┌──────────┬──────────┬──────────┬──────────┐       │
│  │ 🔴 지연  │ 🔥 오늘  │ ⚠️ 이번주│ ⏳ 예정  │       │
│  │ (auto-   │ (auto-   │ (auto-   │ (auto-   │       │
│  │  fit)    │  fit)    │  fit)    │  fit)    │       │
│  │          │          │          │          │       │
│  └──────────┴──────────┴──────────┴──────────┘       │
└──────────────────────────────────────────────────────┘
```

- **상단 대기 행:** `flex overflow-x-auto gap-3` 가로 스크롤, 카드 너비 고정(`min-w-[224px]`)
- **하단 4열:** Phase 31_1에서 추가한 Overdue 포함 4개 스테이지
- 대기 카드 hover 시 "클릭하여 마감일 배정" 툴팁 표시
- 대기 카드 클릭 → `onClickTask` → EditTaskModal에서 마감일 설정

### 1-3. 업무보드 Q1~Q4의 대기 처리 — 현재 유지

추론 결과: 칸반(Q1~Q4)은 우선순위 기반이므로 대기 행 추가 시 2×2 구조가 깨져 복잡도만 증가.
**→ 업무보드 Q1~Q4 구조 변경 없음. 대기 분리는 파이프라인에서만.**

---

## Part 2. 업무보드 상단 배너 개선 — 지연 + 임박 통합 표시

> **대상 파일:** `frontend/src/pages/TaskBoardPage.tsx` (배너 영역)

### 2-1. 현재 문제

현재 배너(`info-banner`)는 **기한 24시간 이내** 업무만 표시.
**지연(Overdue)** 업무(`deadline < now`)는 포함되지 않음.

### 2-2. 구현 내용

배너를 2단 구성으로 변경:

```
┌─ 지연 배너 (빨강) ───────────────────────────┐
│ 🔴 기한 경과 업무가 3건 있습니다.  [업무 확인] │
└──────────────────────────────────────────────┘
┌─ 임박 배너 (주황) ───────────────────────────┐
│ ⏰ 24시간 이내 마감 업무가 5건 있습니다.       │
└──────────────────────────────────────────────┘
```

- 지연 필터: `deadline < Date.now() && status !== 'completed'`
- 임박 필터: 기존 `urgentTasks` 로직 유지
- 지연 배너: `bg-red-50 border-red-200 text-red-900`
- 0건이면 해당 배너 숨김

---

## Part 3. 카테고리 체계 정비 + 업무일지 교훈 리마인드

> **대상:** `TaskBoardPage.tsx` (AddTaskForm), `CompleteModal.tsx`, Backend

### 3-1. 업무 추가 시 카테고리 선택 누락 — 해결

**현재 문제:** `AddTaskForm`(TaskBoardPage 372~469줄)에 카테고리 선택 필드가 **없음**.
카테고리는 `EditTaskModal`(수정 시)에만 존재.

**구현 내용:**
- `AddTaskForm`에 **카테고리 `<select>` 필드 추가** (관련 대상 옆에 배치)
- 기존 `EditTaskModal`의 카테고리 목록과 동일한 소스 사용
- 기본값: 빈 문자열 (선택하지 않아도 생성 가능)

### 3-2. 카테고리 관리 기능 추가

**현재 문제:** 카테고리 목록이 하드코딩되어 있거나 Backend에서 고정 반환됨.
실무자가 새 카테고리를 추가하거나 불필요한 카테고리를 삭제할 수 없음.

**구현 내용:**

#### Backend
```
GET  /api/task-categories              → 카테고리 목록 조회
POST /api/task-categories              → 카테고리 추가 { "name": "신규카테고리" }
DELETE /api/task-categories/{id}       → 카테고리 삭제 (사용 중인 카테고리는 삭제 불가, 에러 반환)
```

#### Frontend — 카테고리 관리 UI
- **위치:** 업무보드(`TaskBoardPage`) 상단 또는 설정 메뉴에 `[카테고리 관리]` 버튼 추가
- 버튼 클릭 → 간단한 모달/드로어:
  - 현재 카테고리 목록 표시 (각각 삭제 버튼)
  - 하단에 `[+ 새 카테고리 추가]` 인풋
  - 삭제 시 해당 카테고리가 사용 중이면 "N건의 업무에서 사용 중입니다" 경고

### 3-3. 교훈 리마인드 — 카테고리 기반 (조합 무관)

**핵심 변경:** 교훈 매칭 조건을 **카테고리 기반으로** 변경 (같은 유형의 업무면 다른 조합이라도 매칭)

`CompleteModal`이 열릴 때:
1. 해당 Task의 `category`를 기준으로 과거 업무일지의 `lessons` 조회
2. 조합(fund_id)은 **추가 가중치**로만 사용 (같은 조합 교훈은 위쪽에 정렬)
3. 최근 5건 표시

**Backend API:**
```
GET /api/worklogs/lessons?category={category}&fund_id={fund_id}&limit=5
```
- `category` 일치 → 필수 조건
- `fund_id` 일치 → 우선 정렬 (같은 조합 교훈이 먼저 표시되되, 다른 조합 교훈도 포함)

**CompleteModal UI:**
```
💡 과거 교훈 리마인드 (접기/펼치기)
┌─────────────────────────────────────┐
│ • 간인 순서 틀리지 않도록 주의        │  ← 같은 조합
│ • 주민번호 뒷자리 블러처리 필수       │  ← 다른 조합, 같은 카테고리
│ • 등기부등본 주식수 교차확인 필수      │  ← 다른 조합, 같은 카테고리
└─────────────────────────────────────┘
```

**CompleteModal props 확장:**
```ts
interface CompleteTaskLike {
  title: string
  estimated_time: string | null
  fund_name?: string | null
  category?: string | null     // ← 추가
  fund_id?: number | null      // ← 추가
}
```

---

## Part 4. CompleteModal UX 개선

> **대상 파일:** `frontend/src/components/CompleteModal.tsx` (93줄)

### 4-1. 현재 문제

Lottie 애니메이션(h-16 w-16) + "좋은 결과를 만들고 있습니다." 텍스트가 매 완료마다 반복.
1~2인 실무자에게는 불필요한 인터랙션이며, 교훈 리마인드가 추가되면 공간이 부족해짐.

### 4-2. 구현 내용

1. **Lottie 애니메이션 블록 + 텍스트 제거**
2. 모달 헤더: `✅ 업무 완료` (기존 유지)
3. 확보된 공간에 교훈 리마인드 섹션 배치
4. 모달 전체 높이 최적화 — 한 화면에 모든 필드 표시

---

## Part 5. 조합관리 — 템플릿 한글화 + 도움말

> **대상:** FundDetailPage의 템플릿 다운로드 기능 (코드 위치 검색 필요)

### 5-1. 구현 내용

1. **파일명 한글화:** `lp_bulk_upload_template.xlsx` → `LP_일괄등록_양식.xlsx`
2. **엑셀 컬럼 헤더 한글화:** `name` → `LP명`, `commitment_amount` → `약정금액`
3. **도움말 행 추가:** 헤더 아래 첫 행에 입력 안내 (연한 회색, 예시 텍스트)

**코드 위치 찾기:**
- Frontend: `download`, `blob`, `xlsx`, `template` 키워드 검색
- Backend: `openpyxl`, `xlsxwriter`, `pandas`, `FileResponse` 검색

---

## Part 6. 조합 상세 — 통지기간 수정 UI 정리

> **대상:** FundDetailPage 또는 WorkflowsPage의 통지기간 수정 모달

**참고:** `WorkflowsPage.tsx` 72줄에 `DEFAULT_NOTICE_TYPES` 배열이 있음:
```ts
const DEFAULT_NOTICE_TYPES = [
  { notice_type: 'assembly', label: '총회 소집 통지' },
  { notice_type: 'capital_call_initial', label: '최초 출자금 납입 요청' },
  ...
]
```

### 6-1. 구현 내용

1. **영어 코드값(`notice_type`) 숨김:**
   UI 렌더링 시 `label`(한글 표시명)만 표시.
   `notice_type` 값은 내부 key로만 사용.
   - 변경 전: `capital_call_initial / 최초 출자금 납입 요청`
   - 변경 후: `최초 출자금 납입 요청`

2. **통지일수 + 기준 인라인 표시:**
   - 수정 모드: `[10] 영업일` (input + suffix)
   - 읽기 모드: `10영업일` (한 토큰, 붙여서 이어 읽기)

---

## Part 7. 워크플로 탭 UX 개선

> **대상 파일:** `frontend/src/pages/WorkflowsPage.tsx` (1758줄)

### 7-1. 현재 문제

워크플로 페이지에서 진행 중인 인스턴스들을 보여주는데:
- 인스턴스 목록이 단순 리스트로 나열됨
- 진행률 시각화가 약함
- 다음 단계/마감일 강조가 부족

### 7-2. 구현 내용

#### A. 진행 중 워크플로 인스턴스 카드 개선

각 인스턴스 카드에:
1. **Progress Bar 추가:** 현재 `3/7` 텍스트만 있다면 → 시각적 Progress Bar 함께 표시
2. **현재 단계 강조:** 현재 진행 중인 단계를 볼드 + 파란색으로 하이라이트
3. **D-Day 배지:** 다음 단계 마감일이 가까우면 빨강(지연)/주황(오늘)/노랑(이번주) 배지 표시
4. **빠른 액션:** 카드에 `[다음 단계 보기]` 버튼 → 클릭 시 상세 Drawer 바로 열림

#### B. 인스턴스 정렬

마감이 임박한 인스턴스가 상단에 오도록 기본 정렬 변경:
`지연(Overdue) → 오늘 마감 → 이번 주 → 예정 → 기한 없음`

#### C. 상단 요약 배너

워크플로 인스턴스 목록 위에 간단한 요약 배너:
```
진행 중 5건 | 🔴 지연 1건 | 이번 주 마감 2건
```

---

## Files to modify / create

| # | Type | Target | Description |
|---|---|---|---|
| 1 | **[MODIFY]** | `frontend/src/components/TaskPipelineView.tsx` | 대기 상단 가로 분리, 4열 auto-fit 레이아웃, 흰색 카드 통일 |
| 2 | **[MODIFY]** | `frontend/src/pages/TaskBoardPage.tsx` | (1) 지연+임박 2단 배너, (2) AddTaskForm 카테고리 선택 추가, (3) 카테고리 관리 버튼/모달 |
| 3 | **[MODIFY]** | `frontend/src/components/CompleteModal.tsx` | Lottie/텍스트 제거, 교훈 리마인드 섹션 추가, props 확장 (category, fund_id) |
| 4 | **[NEW]** | `backend/routers/task_categories.py` | 카테고리 CRUD API (GET/POST/DELETE) |
| 5 | **[NEW]** | `backend/routers/worklog_lessons.py` | 교훈 조회 API (category 기반, fund_id 가중치) |
| 6 | **[MODIFY]** | `frontend/src/pages/FundDetailPage.tsx` | 템플릿 다운로드 파일명+헤더 한글화, 통지기간 UI 정리 |
| 7 | **[MODIFY]** | `frontend/src/pages/WorkflowsPage.tsx` | 진행 중 인스턴스 카드 개선 (Progress Bar, D-Day 배지, 정렬, 요약 배너) |
| 8 | **[MODIFY]** | Backend 엑셀 생성 코드 (위치 검색 필요) | 컬럼 한글화 + 도움말 행 |

---

## Acceptance Criteria

- [ ] **AC-01 (파이프라인 레이아웃):** 파이프라인 뷰의 4열 스테이지가 흰색 카드 컨테이너 높이를 가득 채우고, 업무 수에 따라 카드 크기가 자동 조정된다. 대기 업무는 상단 가로 스크롤 영역에 별도 배치된다.
- [ ] **AC-02 (지연 배너):** 업무보드 상단에 기한 경과/24시간 이내 임박 업무가 별도 배너로 표시된다.
- [ ] **AC-03 (카테고리 추가 시 선택):** AddTaskForm에서 업무 생성 시 카테고리를 선택할 수 있다.
- [ ] **AC-04 (카테고리 관리):** 업무보드에서 카테고리를 추가/삭제할 수 있는 관리 UI가 제공된다.
- [ ] **AC-05 (교훈 리마인드):** CompleteModal에서 동일 카테고리의 과거 교훈이 최대 5건 표시된다 (조합 무관, 같은 조합 우선 정렬).
- [ ] **AC-06 (CompleteModal 간소화):** Lottie + "좋은 결과를 만들고 있습니다" 제거. 모달 높이 최적화.
- [ ] **AC-07 (템플릿 한글화):** 엑셀 다운로드 파일명과 컬럼 헤더가 한글이며 입력 안내 포함.
- [ ] **AC-08 (통지기간 UI):** 영어 코드 숨김, `10영업일` 인라인 표시.
- [ ] **AC-09 (워크플로 UX):** 진행 중 인스턴스에 Progress Bar, D-Day 배지, 임박순 정렬, 요약 배너가 적용된다.
- [ ] **AC-10 (기존 유지):** Q1~Q4 칸반, Bulk Action, 에러프루프 검증, SVG 관계선 등 모두 유지.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. Q1~Q4 칸반 구조 — 그대로 유지
3. `CompleteModal`의 에러프루프 검증 로직 (Phase 31) — 유지
4. WorkLogsPage의 기존 인사이트 KPI 구조 — 유지
5. 파이프라인의 SVG 관계선 렌더링 로직 — 유지
6. `DEFAULT_NOTICE_TYPES` 배열의 key값(`notice_type`) — 내부적으로 유지, UI에서만 숨김
