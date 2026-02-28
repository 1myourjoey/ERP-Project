# Phase 42: 실무 UX/UI 고도화 + 서브파티 연동 정합성

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> ⚠️ **비식별화 원칙:** 실존 정보 사용 금지.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P0 — 실무 사용성 직결  
**의존성:** Phase 36 완료 상태 (이전 Phase에서 추가한 모든 기능 유지)  
**핵심 원칙:**
1. **휴먼 에러 제로** — 시스템이 놓칠 수 있는 것을 알려주고, 빠뜨릴 수 없게 구조화
2. **실무자 관점 UX** — "지금 뭘 먼저 해야 하는가?"에 즉시 답할 수 있는 인터페이스
3. **유기적 연결** — 대시보드 ↔ 업무보드 ↔ 워크플로 ↔ 조합관리 ↔ 투자 간 데이터가 끊김 없이 흐를 것

---

## Part 0. 전수조사 (필수)

- [ ] `components/dashboard/DashboardDefaultView.tsx` (266줄) — 현재 StatCard 13개 (6+7) 구조 확인
- [ ] `components/dashboard/DashboardStatCard.tsx` — StatCard 컴포넌트 확인
- [ ] `components/dashboard/DashboardTaskPanels.tsx` — 업무 패널 구조 확인
- [ ] `components/dashboard/DashboardWorkflowPanel.tsx` — 워크플로 패널 구조 확인
- [ ] `components/dashboard/DashboardRightPanel.tsx` — 우측 패널 구조 확인
- [ ] `pages/TaskBoardPage.tsx` (1899줄) — Q1~Q4 칸반 + 캘린더 + 파이프라인 뷰 확인
- [ ] `components/CompleteModal.tsx` (199줄) — `fetchTaskCompletionCheck` + `missing_documents` + `can_complete` 로직 확인
- [ ] `routers/task_completion.py` — 완료 전 체크 API 확인
- [ ] `models/workflow.py` — WorkflowStep, WorkflowStepDocument (required, attachment_ids) 확인
- [ ] `models/workflow_instance.py` — WorkflowStepInstance, WorkflowStepInstanceDocument (checked, attachment_ids, required) 확인
- [ ] `pages/WorkflowsPage.tsx` (137449 bytes) — 워크플로 인스턴스 UI에서 문서 첨부 UX 확인
- [ ] `pages/FundDetailPage.tsx` (3274줄) — 탭 구조: overview/info/capital/portfolio/nav/fees/terms 확인
- [ ] `pages/FundOverviewPage.tsx` (221줄) — 조합개요 데이터 소스 확인
- [ ] `pages/InvestmentsPage.tsx` (760줄) — 조합투자 목록/등록 UI 확인
- [ ] `pages/InvestmentDetailPage.tsx` (922줄) — 투자 상세 + 워크플로 진행 표시 확인
- [ ] `pages/LPManagementPage.tsx` (342줄) — LP 관리 UI/라벨 확인
- [ ] `routers/dashboard.py` (30886 bytes) — 대시보드 API 전체 확인
- [ ] `lib/api.ts` — 대시보드/업무/워크플로 관련 타입 확인

---

## Part 1. 대시보드 개편

### 1-1. 현재 문제

현재 DashboardDefaultView는 **StatCard 13개가 2행**으로 나열됨:
- 행 1 (6개): 오늘 업무 / 이번주 / 진행 워크플로 / 미수집 서류 / 보고 마감 / 오늘 완료
- 행 2 (7개): 진행 심의 / 운용 NAV / 미납 LP / 미수령 보수 / 진행 보고 / 컴플라이언스 / 서류 수집

**문제:** 숫자 카드만 나열되어 "지금 뭘 해야 하는가?"를 알 수 없음. 운영진이 묻는 핵심 질문에 답하지 못함.

### 1-2. 개편 방향

**핵심 원칙: "오늘 출근해서 뭘 해야 하는가?"에 즉시 답하는 대시보드**

#### 구조 변경:

```
┌──────────────────────────────────────────────────────────────────┐
│  V:ON ERP — 2026년 2월 24일 (월)                                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [섹션 1: 긴급/주의 알림 배너]                                    │
│  ┌─ 🔴 기한 초과 ──────────────────────────────────────────────┐ │
│  │ • VICS 월보고 (OO조합) — D+2 기한 초과                      │ │
│  │ • 수시보고: OO기업 투자회수 → 마감 02/28 (D-4)              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  [섹션 2: 요약 카드 — 최대 4~5개로 축소, 핵심만]                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ 오늘 업무 │ │ 진행 중   │ │ 이번주    │ │ 완료     │           │
│  │  5건     │ │  3건     │ │  12건    │ │  8건 ✅  │           │
│  │ 예상 2h  │ │ WF 2건   │ │          │ │          │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                  │
│  [섹션 3: 오늘 할 일 — 우선순위 정렬 리스트]                      │
│  투명한 우선순위 리스트. 기한 임박 → 워크플로 현재 스텝 →          │
│  일반 업무 순으로 자동 정렬                                       │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ 1. 🔴 VICS 월보고 1308 작성 | OO조합 | D+2 기한 초과        │ │
│  │ 2. 🟡 출자금 납입 확인 | △△조합 | D-1 내일 마감             │ │
│  │ 3. 🔵 투자실행 워크플로 스텝 3/7 | □□기업 | 진행중           │ │
│  │ 4. ⬜ 서류 접수 확인 | OO기업 | 이번주                       │ │
│  │ 5. ⬜ LP 보고서 작성 | | 금주 내                              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  [섹션 4: 운영진 Quick View — 접이식 패널]                        │
│  ▸ 조합 현황 요약 (총 8개 조합, 운용 6 / 결성중 2)               │
│  ▸ 보고/컴플라이언스 현황                                         │
│  ▸ 진행 워크플로                                                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 1-3. 구현 상세

#### `components/dashboard/DashboardDefaultView.tsx` [MODIFY — 대폭 개편]

**변경 사항:**

1. **StatCard 13개 → 4~5개로 축소**: 오늘 업무(예상 소요시간 포함) / 진행 중(워크플로 포함) / 이번주 / 완료
2. **긴급 알림 배너**: 기한 초과(overdue) 업무 + 수시보고 마감 임박건을 상단에 눈에 띄게 표시. 기존 `urgentAlerts` + `overdueTodayCount` 데이터 활용
3. **오늘 할 일 우선순위 리스트**: 기존 DashboardTaskPanels의 "오늘/내일/이번주" 탭 분리 → **단일 우선순위 리스트**로 변경
   - 정렬 기준: ① 기한 초과(overdue) ② D-day ③ 워크플로 현재 스텝 ④ 기한 임박 ⑤ 일반
   - 각 업무에 긴급도 배지 표시 (🔴 초과, 🟡 오늘/내일, 🔵 워크플로, ⬜ 여유)
   - 목록이 길면 "상위 10건 표시 + 나머지 N건 더보기" 형태
4. **운영진 Quick View**: 접이식(collapsible) 패널로 조합 요약/보고 현황/워크플로 현황을 축약 표시
   - 기존 DashboardRightPanel 내용을 접이식으로 변환
   - 운영진이 자주 물어볼 수 있는 것: "LP 미납 있어?", "보수 수령했어?", "보고 마감 언제야?" → 해당 정보 1줄 요약으로 표시

#### `components/dashboard/DashboardTaskPanels.tsx` [MODIFY — 개편]

- 기존 "오늘/내일/이번주/예정/기한없음/완료" 6개 탭 → **"우선순위/이번주/완료"** 3개로 축소
- "우선순위" 탭: 모든 미완료 업무를 긴급도 순으로 정렬하여 표시
- 업무 카드에 **소속 조합명 + 카테고리 + D-Day** 항상 표시

#### `routers/dashboard.py` [MODIFY — 확장]

대시보드 API 응답에 추가:
```python
# 오늘 할 일 우선순위 리스트 (정렬된 상태)
"prioritized_tasks": [
    {
        "task": { ... },
        "urgency": "overdue" | "today" | "tomorrow" | "this_week" | "upcoming",
        "d_day": -2,  # 음수=초과, 0=오늘, 양수=남은일
        "workflow_info": { "name": "결성 워크플로", "step": "3/7", "step_name": "출자금 납입" } | null,
        "source": "manual" | "workflow" | "compliance"
    }
]
```

---

## Part 2. 업무보드 개선

### 2-1. 현재 문제

TaskBoardPage 1,899줄. 업무가 Q1~Q4 칸반에 나열되는데:
- 업무가 많아지면 **어떤 것이 가장 긴급한지** 파악 불가
- 워크플로 업무와 일반 업무 구분이 약함
- "필수 서류 미첨부" 경고가 나오지만 실제 첨부 방법이 없음

### 2-2. 구현 상세

#### `pages/TaskBoardPage.tsx` [MODIFY — UX 개선]

1. **Q1(긴급·중요) 칸 내 자동 정렬**: D-Day 기준 오름차순 자동 정렬 (가장 급한 것이 위)
   - 기한 초과: 빨간 배경 + "D+N 초과" 배지
   - 오늘 마감: 주황 배경 + "D-day" 배지
   - 내일 마감: 노랑 배경 + "D-1" 배지
2. **워크플로 업무 그룹화 개선**: 현재 `groupTasksByWorkflow` 함수가 있으나 시각적 구분이 약함
   - 워크플로 그룹 카드에 **전체 진행률 프로그레스 바** 추가
   - 현재 스텝 하이라이트 (파란 테두리)
   - 다음 스텝 미리보기
3. **상단 필터/정렬 바 개선**: 
   - "모든 업무" / "오늘 마감" / "이번주 마감" / "기한 초과" 빠른 필터 버튼
   - 기존 카테고리/조합 필터는 유지

### 2-3. 워크플로 필수 서류 완료 플로우 개선

**현재 문제:** `CompleteModal.tsx`에서 `fetchTaskCompletionCheck` API가 `missing_documents`를 반환하고 `can_complete=false`로 차단하지만, 실제로 서류를 첨부/확인하는 UI 플로우가 없음. 사용자가 "어떻게 완료하라는 거지?" 상태에 빠짐.

#### 서류 구조 현황 (확인 완료):
- `WorkflowStepDocument` → 워크플로 스텝별 필수 서류 정의 (required=True)
- `WorkflowStepInstanceDocument` → 인스턴스별 서류 인스턴스 (checked=False, attachment_ids=[])
- `fetchTaskCompletionCheck` → step_instance의 서류 중 required=True인데 checked=False인 것을 missing_documents로 반환
- **미싱 링크**: checked를 True로 변경하거나 attachment를 업로드하는 **UI가 없음**

#### 해결 방안:

##### `components/CompleteModal.tsx` [MODIFY — 근본 개선]

`missing_documents`가 있을 때 단순히 "미첨부" 경고만 표시하는 대신:

```
┌─ 완료 전 필수 서류 확인 ─────────────────────────────────┐
│                                                          │
│  이 업무를 완료하려면 아래 서류를 확인해야 합니다:          │
│                                                          │
│  ☐ 투자계약서 (필수)          [첨부] [확인 완료 ✓]       │
│  ☐ 사업계획서 (필수)          [첨부] [확인 완료 ✓]       │
│  ☑ 주주명부 (필수)            [첨부됨 ✓]                 │
│                                                          │
│  * "확인 완료"를 누르면 해당 서류를 확인했다는 의미입니다   │
│  * 파일 첨부는 선택사항이며, 최소한 확인 체크가 필요합니다  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**동작:**
1. CompleteModal에서 `missing_documents` 대신 **전체 서류 목록**을 표시 (checked 상태 포함)
2. 각 서류에 [확인 완료] 버튼: 클릭 시 `WorkflowStepInstanceDocument.checked = True` PATCH
3. 선택적으로 [첨부] 버튼: 기존 Attachment 업로드 API 활용하여 파일 업로드 → `attachment_ids` 업데이트
4. 모든 required 서류가 checked=True면 `can_complete=true`로 전환
5. 완료 버튼 활성화

##### `routers/task_completion.py` [MODIFY — 확장]

```
# 기존 GET /api/tasks/{id}/completion-check 수정:
# missing_documents를 단순 이름 목록 대신 구조화된 데이터로 반환

{
  "can_complete": false,
  "documents": [
    {
      "id": 1,
      "name": "투자계약서",
      "required": true,
      "checked": false,
      "has_attachment": false
    },
    {
      "id": 2,
      "name": "주주명부",
      "required": true,
      "checked": true,
      "has_attachment": true
    }
  ],
  "warnings": [...]
}
```

##### 서류 확인/첨부 API 추가

`routers/workflows.py` [MODIFY — 확장] 또는 새 서류 관련 라우터:

| Method | Endpoint | 설명 |
|--------|----------|------|
| PATCH | `/api/workflow-step-instance-documents/{id}/check` | 서류 확인 처리 (checked=True) |
| PATCH | `/api/workflow-step-instance-documents/{id}/uncheck` | 서류 확인 해제 (checked=False) |
| POST | `/api/workflow-step-instance-documents/{id}/attach` | 파일 첨부 (Attachment 업로드 + attachment_ids 업데이트) |

---

## Part 3. 조합개요 연동 확인

### 3-1. 현재 상태

`FundOverviewPage.tsx` (221줄): 조합별 요약 카드 (약정총액, 납입, 투자잔액, NAV, 투자율 등) 표시.

### 3-2. 조합개요 ↔ 서브파티 연동 확인 및 보강

#### `routers/funds.py` 또는 관련 API [MODIFY — 확장]

FundOverview API(`fetchFundOverview`)가 반환하는 데이터에 아래 항목이 올바르게 연동되어 있는지 확인하고, 누락된 것은 추가:

| 데이터 | 소스 | 연동 확인 |
|--------|------|----------|
| 약정총액(commitment_total) | Fund.commitment_total | 확인 |
| 납입총액(paid_in_total) | LP.paid_in 합산 | 확인 — LP 추가/수정 시 갱신되는지 확인 |
| 투자잔액 | Investment.amount 합산 (status=active) | 확인 |
| NAV | Valuation 최신값 | 확인 |
| 투자율 | 투자잔액 / 약정총액 × 100 | 확인 |
| LP 수 | LP count | 확인 |
| 피투자사 수 | Investment count (active) | 확인 |
| 진행 워크플로 건수 | WorkflowInstance (fund_id, status=active) count | **추가 필요 시** |
| 미완료 업무 건수 | Task (fund_id, status≠completed) count | **추가 필요 시** |

> **원칙:** 조합개요는 데이터를 "읽기만" 하는 뷰. 데이터의 입력/수정은 각 서브파티(LP관리, 투자관리, 워크플로 등)에서 수행하고, 조합개요는 실시간 computed 값을 표시.

---

## Part 4. 조합관리 (FundDetail) 개선

### 4-1. 현재 문제

FundDetailPage.tsx (3,274줄)의 탭 구조:
- `overview` (대시보드) / `info` (기본정보) / `capital` (자본 및 LP현황) / `portfolio` (투자 포트폴리오) / `nav` (NAV) / `fees` (보수) / `terms` (규약 및 컴플라이언스)

**"대시보드" 탭의 의미가 불명확** — 메인 대시보드와 역할 중복. 조합관리에서의 대시보드가 무엇을 보여줘야 하는지 재정의 필요.

### 4-2. 개선 사항

#### `pages/FundDetailPage.tsx` [MODIFY]

1. **"대시보드" 탭 → "조합 요약"으로 명칭 변경**: `{ id: 'overview', label: '대시보드' }` → `{ id: 'overview', label: '조합 요약' }`
2. **"조합 요약" 탭 내용 재구성**: 해당 조합에 대한 핵심 지표만 간결하게 표시:
   - 약정/납입/잔여 요약
   - 투자 포트폴리오 요약 (건수, 총 투자액)
   - 진행 중 워크플로
   - 최근 LP 변동
   - 미완료 업무 건수
3. **서브파티 연동 확인**: capital 탭에서 LP 추가/수정 시 → `조합 요약` 반영, portfolio 탭에서 투자 추가 시 → `조합 요약` 반영. 데이터가 별도 fetch로 이루어져 있으므로 `invalidateQueries` 패턴 확인

---

## Part 5. LP 관리 한글화

### 5-1. 현재 상태

LPManagementPage.tsx (342줄): LP 주소록 관리. 기본적 CRUD 동작은 정상.

### 5-2. 한글화 대상

#### `pages/LPManagementPage.tsx` [MODIFY]

아래 항목들의 영문 라벨/플레이스홀더를 한글로 변환:

| 현재 (확인 필요) | 한글 |
|-----------------|------|
| Type → 유형 | ✅ (LP_TYPE_LABELS 이미 존재 확인) |
| Commitment → 약정금액 | 확인 |
| Contact → 연락처 | 확인 |
| Business Number → 사업자번호 | 확인 |
| Address → 주소 | 확인 |
| Memo → 메모 | 확인 |
| Actions → 액션 | 확인 |
| 테이블 헤더, 버튼, 폼 라벨, 상태 메시지 | 전수 확인 후 한글화 |

> **주의:** 이미 한글화된 부분은 건드리지 말 것. 영문이 남아있는 부분만 한글로 변환.

#### 연동 확인:
- LP 추가/수정 → FundDetail capital 탭 반영 확인
- LP 삭제 → 연관 데이터(양수양도 등) 정합성 확인

---

## Part 6. 조합투자 (InvestmentDetail) 워크플로 UX 개선

### 6-1. 현재 문제

`InvestmentDetailPage.tsx` (922줄)에서 워크플로 진행 중이 보이는데:
- 워크플로 진행 상황의 시각적 표현이 부족
- 현재 어떤 스텝인지, 다음에 뭘 해야 하는지 바로 보이지 않음
- 서류 첨부 상태도 불명확

### 6-2. 개선 사항

#### `pages/InvestmentDetailPage.tsx` [MODIFY — 워크플로 섹션 개선]

투자 상세 페이지에서 워크플로 진행 중이 표시되는 섹션을 개선:

```
┌─ 진행 워크플로: 투자실행 ──────────────────────────────────────┐
│                                                                │
│  [프로그레스 바: ████████░░░░ 5/7 스텝 완료 (71%)]              │
│                                                                │
│  ✅ 1. 투심위 안건 회부     | 완료 02/10                       │
│  ✅ 2. 투심위 의결          | 완료 02/12                       │
│  ✅ 3. 투자계약서 작성      | 완료 02/15                       │
│  ✅ 4. 운용지시서 발송      | 완료 02/18                       │
│  ✅ 5. 투자금 송금 확인     | 완료 02/20                       │
│  ▶️ 6. 등기부등본 확인      | 진행중 (D-2)                     │
│       📎 서류: 등기부등본 [미첨부 ⚠️]                          │
│  ⬜ 7. 투자 사후 보고       | 예정 02/28                       │
│                                                                │
│  [현재 스텝 바로가기] [전체 워크플로 보기]                       │
└────────────────────────────────────────────────────────────────┘
```

**구현:**
1. 워크플로 전체 스텝을 세로 타임라인으로 표시
2. 완료 스텝: ✅ + 회색 텍스트 + 완료일
3. 현재 스텝: ▶️ + 강조 + D-Day 배지 + 필수 서류 상태
4. 대기 스텝: ⬜ + 예정일
5. 프로그레스 바: 완료 스텝 수 / 전체 스텝 수
6. 서류 미첨부 경고: 현재 스텝의 required 서류 중 미첨부건 표시

---

## Part 7. 전체 연동 정합성 점검

### 7-1. 데이터 흐름 확인

| 이벤트 | 영향 대상 | 확인 항목 |
|--------|----------|----------|
| LP 추가/수정 | FundDetail capital탭, FundOverview, Dashboard | invalidateQueries 정상 |
| LP 양수양도 완료 | FundDetail capital탭, LP관리 | 양도 후 LP 데이터 일관성 |
| 투자 등록 | FundDetail portfolio, FundOverview, InvestmentsPage | 투자 데이터 반영 |
| 워크플로 스텝 완료 | TaskBoard, Dashboard, InvestmentDetail | Task status 업데이트 + 서류 checked 연동 |
| 업무 완료 | Dashboard, TaskBoard | completedCount 갱신 |

### 7-2. API 정합성

- [ ] 모든 mutation에서 `invalidateQueries` 적절히 호출
- [ ] 대시보드 API가 긴급 업무 목록을 우선순위 정렬하여 반환
- [ ] 서류 확인/첨부 API 추가 후 CompleteModal 정상 동작

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [MODIFY] | `frontend/src/components/dashboard/DashboardDefaultView.tsx` | StatCard 축소 + 긴급 알림 상단 + 우선순위 리스트 + 접이식 패널 |
| 2 | [MODIFY] | `frontend/src/components/dashboard/DashboardTaskPanels.tsx` | 6탭 → "우선순위/이번주/완료" 3탭, 긴급도 정렬 |
| 3 | [MODIFY] | `frontend/src/components/dashboard/DashboardRightPanel.tsx` | 접이식 패널로 변환 |
| 4 | [MODIFY] | `frontend/src/components/dashboard/DashboardStatCard.tsx` | 필요 시 축소형 변형 추가 |
| 5 | [MODIFY] | `backend/routers/dashboard.py` | prioritized_tasks 우선순위 정렬 API 추가 |
| 6 | [MODIFY] | `frontend/src/pages/TaskBoardPage.tsx` | Q1 자동 정렬 + 워크플로 그룹 프로그레스 바 + 빠른 필터 |
| 7 | [MODIFY] | `frontend/src/components/CompleteModal.tsx` | 서류 확인 인라인 UI + 확인/첨부 버튼 + can_complete 실시간 갱신 |
| 8 | [MODIFY] | `backend/routers/task_completion.py` | completion-check 응답 구조 확장 (documents 배열) |
| 9 | [MODIFY] | `backend/routers/workflows.py` | 서류 확인/첨부 PATCH API 추가 |
| 10 | [MODIFY] | `frontend/src/pages/FundDetailPage.tsx` | "대시보드" → "조합 요약" 명칭 변경 + 내용 재구성 |
| 11 | [MODIFY] | `frontend/src/pages/FundOverviewPage.tsx` | 서브파티 연동 데이터 확인/보강 |
| 12 | [MODIFY] | `frontend/src/pages/LPManagementPage.tsx` | 한글화 (영문 라벨/플레이스홀더 → 한글) |
| 13 | [MODIFY] | `frontend/src/pages/InvestmentDetailPage.tsx` | 워크플로 타임라인 + 프로그레스 바 + 서류 상태 |
| 14 | [MODIFY] | `frontend/src/lib/api.ts` | 서류 확인/첨부 API 함수 + 타입, 우선순위 타입 |

---

## Acceptance Criteria

### Part 1 — 대시보드
- [ ] **AC-01:** StatCard가 4~5개로 축소되어 핵심 정보만 표시된다.
- [ ] **AC-02:** 기한 초과/긴급 업무 알림이 대시보드 상단에 눈에 띄게 표시된다.
- [ ] **AC-03:** 오늘 할 일이 우선순위 순으로 정렬된 리스트로 표시된다 (기한초과 → D-day → 워크플로 → 일반).
- [ ] **AC-04:** 운영진 Quick View가 접이식 패널로 조합/보고/워크플로 요약을 표시한다.

### Part 2 — 업무보드
- [ ] **AC-05:** Q1 칸반 내 업무가 D-Day 기준 자동 정렬된다.
- [ ] **AC-06:** 워크플로 업무 그룹에 전체 진행률 프로그레스 바가 표시된다.
- [ ] **AC-07:** 빠른 필터(오늘 마감/이번주/기한초과)가 동작한다.

### Part 2.5 — 워크플로 서류 완료 플로우
- [ ] **AC-08:** CompleteModal에서 필수 서류 목록이 체크/미체크 상태로 표시된다.
- [ ] **AC-09:** 서류 [확인 완료] 클릭 시 checked=True로 서버 반영된다.
- [ ] **AC-10:** 모든 필수 서류 확인 완료 후 완료 버튼이 활성화된다.
- [ ] **AC-11:** 서류에 파일 첨부가 가능하다 (선택사항).

### Part 3 — 조합개요
- [ ] **AC-12:** FundOverview에 LP/투자/워크플로 서브파티 데이터가 실시간 반영된다.

### Part 4 — 조합관리
- [ ] **AC-13:** FundDetail의 "대시보드" 탭이 "조합 요약"으로 변경되고, 해당 조합의 핵심 지표가 표시된다.

### Part 5 — LP 관리
- [ ] **AC-14:** LPManagementPage의 모든 영문 라벨/UI가 한글로 표시된다.
- [ ] **AC-15:** LP 추가/수정이 FundDetail + FundOverview에 정상 반영된다.

### Part 6 — 조합투자
- [ ] **AC-16:** InvestmentDetail에 워크플로 타임라인이 세로로 표시된다 (프로그레스 바 + 현재 스텝 + 서류 상태).

### 공통
- [ ] **AC-17:** Phase 31~36의 모든 기능 유지.
- [ ] **AC-18:** 모든 mutation에서 관련 쿼리 invalidation이 정상 동작한다.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. 기존 API 시그니처 (Task CRUD, Fund CRUD, Investment CRUD, LP CRUD, Workflow CRUD) — 유지 (확장만)
3. 기존 데이터 모델 구조 — 유지 (WorkflowStepInstanceDocument의 checked, attachment_ids 등 기존 필드 활용)
4. Phase 31~36의 기존 구현 — 보강만, 삭제/재구성 금지
5. WorkflowsPage.tsx (137KB) — 이 파일의 대규모 리팩토링은 이 Phase에서 하지 말 것. InvestmentDetailPage의 워크플로 섹션만 개선
