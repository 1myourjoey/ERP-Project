# 대시보드 리디자인: 최종 설계안

작성일: 2026-03-03
대상: 1인 VC 백오피스 관리자 (트리거투자파트너스)

---

## 1. 설계 원칙

1. **스크롤 금지** — 상하좌우 스크롤 없이 한 화면에 전체 구조 파악
2. **대시보드 ≠ TaskBoard** — 상태 파악 + 진입점, 태스크 상세 관리는 TaskBoardPage
3. **VC 도메인 우선** — 펀드·투자·컴플라이언스가 태스크보다 상위
4. **리스크 감지** — 각 도메인의 건강 점수와 위험 알림을 시각적으로 표현
5. **중복 금지** — 같은 데이터가 2번 표시되면 하나를 없앤다
6. **빈 상태 숨김** — 데이터 없는 영역은 축약

---

## 2. 화면 제약 분석

| 환경 | 가용 너비 | 가용 높이 |
|------|----------|----------|
| 1920×1080 (FHD 모니터) | ~1432px | ~986px |
| 1366×768 (노트북) | ~1318px | ~674px |

- 상단 내비게이션: 54px 고정
- page-container: max-width 1480px, padding 24px 좌우, 20px 상하
- **설계 기준: 1920×1080에서 스크롤 없음, 1366×768에서도 최소 스크롤**

---

## 3. 픽셀 예산 (1080p 기준, 총 ~986px)

```
[A] 헤더 행 (날짜 + 전체 건강 점수 + 빠른 액션)     ─  44px
[B] 긴급 알림 바 (조건부: 문제 있을 때만)            ─  36px (평상시 0px)
[C] 도메인 건강 카드 6개 (가로 1행)                  ─ 100px
[D] 메인 콘텐츠 2칼럼                                ─ 420px
    [D-L] 좌 2/3: 오늘 핵심 + 이번 주 마감
    [D-R] 우 1/3: 펀드 현황 테이블
[E] 하단 3칼럼                                       ─ 360px
    [E-1] 투자 파이프라인
    [E-2] 진행 워크플로
    [E-3] 보고/서류 마감
─────────────────────────────────────────────────────
합계: 44 + 0~36 + 100 + 420 + 360 = 924~960px (986px 이내 ✓)
```

---

## 4. 레이아웃 설계

```
┌─────────────────────────────────────────────────────────────────┐
│ [A] 2026-03-03(월)  전체 ██████████░░ 84점  [+업무] [캘린더]  │
├─────────────────────────────────────────────────────────────────┤
│ [B] ⚠ 컴플라이언스 위반 1건 · 서류 기한초과 2건 · 분개 미결재3│ ← 0건이면 이 행 숨김
├──────────┬──────────┬──────────┬──────────┬──────────┬─────────┤
│ [C]      │          │          │          │          │         │
│ 📋업무   │ 💰펀드   │ 📊투자   │ ⚖컴플   │ 📄보고   │ 📁서류  │
│ ██░ 72   │ ████ 95  │ ███░ 90  │ ██░░ 68  │ ███░ 85  │ ██░░ 74│
│ 지연2건  │ 활성3개  │ 심의7건  │ 위반1건  │ 마감2건  │ 미수3건│
├──────────┴──────────┴──────────┴──────────┴──────────┴─────────┤
│ [D]                                                            │
│ ┌─ 오늘 핵심 업무 ──────────────┐ ┌─ 펀드 현황 ─────────────┐ │
│ │ 🔴 펀드A 분기보고 초안   1h   │ │ 펀드A │120억│LP12│85%│✓│ │
│ │ 🔴 컴플 자본금비율 확인  10m  │ │ 펀드B │ 45억│LP 5│60%│⚠│ │
│ │ 🟠 VICS 월간보고 입력    30m  │ │ 펀드C │ 20억│LP 3│100%│✓││
│ │ 🟠 LP 서명 수령 확인     15m  │ │                         │ │
│ │ 🟡 분개 미결재 확인      20m  │ │ 총 NAV 185억            │ │
│ │ ────────────────────────────  │ │ 미납 LP 1건             │ │
│ │ 이번 주 마감 (5건)            │ │                         │ │
│ │ 3/5 수수료 정산               │ │                         │ │
│ │ 3/6 LP 서명 마감              │ │                         │ │
│ │ 3/7 컴플라이언스 점검         │ │                         │ │
│ │ 3/7 VICS 제출                 │ │                         │ │
│ │ [태스크보드 →]                │ │ [펀드 목록 →]           │ │
│ └───────────────────────────────┘ └─────────────────────────┘ │
├────────────────────┬───────────────────┬──────────────────────┤
│ [E-1]              │ [E-2]             │ [E-3]                │
│ 투자 파이프라인    │ 진행 워크플로     │ 보고/서류 마감       │
│                    │                   │                      │
│ 소싱  ●●●  3건    │ ▶ 투자심의-A사    │ 보고                 │
│ 검토  ●●   2건    │   ████░░░ 3/7     │ 3/4 LP보고    D-1   │
│ 실사  ●    1건    │ ▶ 펀드결성-2호    │ 3/7 VICS      D-4   │
│ 의결  ●    1건    │   ██░░░░░ 2/5     │                      │
│                    │ ▶ LP모집-1호      │ 서류                 │
│                    │   ████░░░ 4/6     │ 주주명부 A사  D+6   │
│ [심의 현황 →]     │ [워크플로 →]      │ 등기부 B사    D+2   │
│                    │                   │ [서류 현황 →]        │
└────────────────────┴───────────────────┴──────────────────────┘
```

---

## 5. 리스크 감지 시스템 (건강 점수) 설계

### 5.1 점수 개념

각 도메인에 0~100 건강 점수를 부여한다.
점수가 높을수록 건강하고, 낮을수록 관리자의 주의가 필요하다.

| 점수 범위 | 상태 | 색상 | 의미 |
|----------|------|------|------|
| 90~100 | 양호 | 초록 | 문제 없음, 접힌 상태 유지 가능 |
| 70~89 | 주의 | 노랑/주황 | 곧 문제가 될 수 있음, 확인 필요 |
| 0~69 | 위험 | 빨강 | 즉시 조치 필요, 긴급 알림 바에 표시 |

### 5.2 도메인별 점수 산정 기준

#### 📋 업무 (Tasks)
```
base = 100
overdue_tasks       → 건당 -12점
today_due_tasks     → 건당  -5점
this_week_due_tasks → 건당  -2점
no_progress_tasks   → 건당  -3점  (생성 후 3일 이상 진행 없음)
최저 0점
```

#### 💰 펀드 (Funds)
```
base = 100
unpaid_lp           → 건당  -8점
nav_not_updated     → 30일 초과 시 -15점
capital_call_overdue→ 건당 -10점
최저 0점
```

#### 📊 투자 심의 (Investment Review)
```
base = 100
stale_review        → 2주 이상 상태 변경 없는 건당 -8점
overdue_dd          → 실사 기한 초과 건당 -12점
no_reviewer_assigned→ 건당 -5점
최저 0점
```

#### ⚖ 컴플라이언스 (Compliance)
```
base = 100
violation           → 건당 -20점 (가장 높은 감점)
approaching_deadline→ 3일 이내 건당 -8점
overdue_obligation  → 건당 -15점
최저 0점
```

#### 📄 보고 (Reports)
```
base = 100
overdue_report      → 건당 -15점
approaching_report  → 3일 이내 건당 -5점
draft_not_started   → 마감 7일 이내인데 미착수 건당 -8점
최저 0점
```

#### 📁 서류 (Documents)
```
base = 100
overdue_document    → 건당 -12점
approaching_doc     → 3일 이내 건당 -5점
long_overdue        → 7일 초과 건당 추가 -5점
최저 0점
```

#### 전체 점수
```
전체 점수 = 6개 도메인 점수의 가중 평균
가중치: 컴플라이언스(25%) > 펀드(20%) > 보고(15%) = 서류(15%) > 업무(15%) > 투자(10%)
```

### 5.3 시각적 표현

각 도메인 카드에 **4px 높이의 프로그레스 바** + **점수 숫자**:

```
┌────────────┐
│ ⚖ 컴플     │
│ ██░░░░ 68  │  ← 빨간색 바, 숫자 빨강
│ 위반 1건   │
└────────────┘

┌────────────┐
│ 💰 펀드    │
│ █████░ 95  │  ← 초록색 바, 숫자 초록
│ 활성 3개   │
└────────────┘
```

상단 전체 점수도 동일한 프로그레스 바로 표시:
```
전체 ████████░░░░ 84점
```

### 5.4 긴급 알림 바 트리거 조건

아래 조건 중 하나라도 해당하면 [B] 긴급 알림 바가 표시됨:
- 도메인 점수가 70 미만인 곳이 있음
- 컴플라이언스 위반 건이 1건 이상
- 기한 초과 7일 이상인 미수 서류가 있음
- 분개 미결재가 5건 이상 누적
- LP 미납이 존재

---

## 6. 백엔드 구현 계획

### 6.1 새 API 엔드포인트

```
GET /api/dashboard/health
```

**응답 스키마:**
```json
{
  "overall_score": 84,
  "domains": {
    "tasks": {
      "score": 72,
      "factors": {
        "overdue_count": 2,
        "today_due_count": 3,
        "week_due_count": 5,
        "stale_count": 1
      },
      "label": "지연 2건",
      "severity": "warning"
    },
    "funds": {
      "score": 95,
      "factors": {
        "active_count": 3,
        "unpaid_lp_count": 0,
        "nav_stale": false,
        "total_nav": 18500000000
      },
      "label": "활성 3개",
      "severity": "good"
    },
    "investment_review": {
      "score": 90,
      "factors": {
        "pipeline_count": 7,
        "stale_count": 0,
        "by_stage": {"소싱": 3, "검토중": 2, "실사중": 1, "의결": 1}
      },
      "label": "심의 7건",
      "severity": "good"
    },
    "compliance": {
      "score": 68,
      "factors": {
        "violation_count": 1,
        "overdue_count": 0,
        "approaching_count": 2,
        "total_obligations": 24,
        "completed_obligations": 21
      },
      "label": "위반 1건",
      "severity": "danger"
    },
    "reports": {
      "score": 85,
      "factors": {
        "overdue_count": 0,
        "approaching_count": 2,
        "not_started_count": 0
      },
      "label": "마감 2건",
      "severity": "warning"
    },
    "documents": {
      "score": 74,
      "factors": {
        "overdue_count": 2,
        "approaching_count": 1,
        "long_overdue_count": 1
      },
      "label": "미수 3건",
      "severity": "warning"
    }
  },
  "alerts": [
    {
      "type": "compliance_violation",
      "message": "컴플라이언스 위반 1건",
      "domain": "compliance",
      "action_url": "/compliance"
    },
    {
      "type": "document_overdue",
      "message": "서류 기한초과 2건",
      "domain": "documents",
      "action_url": "/documents"
    },
    {
      "type": "journal_pending",
      "message": "분개 미결재 3건",
      "domain": "accounting",
      "action_url": "/accounting"
    }
  ]
}
```

### 6.2 구현 위치

```
backend/
├── routers/dashboard.py        ← 기존 대시보드 라우터에 /health 엔드포인트 추가
├── services/health_score.py    ← 신규: 점수 계산 로직
```

`health_score.py`에서 각 도메인별 점수를 독립 함수로 분리:
```python
def calc_task_score(db: Session) -> DomainHealth: ...
def calc_fund_score(db: Session) -> DomainHealth: ...
def calc_compliance_score(db: Session) -> DomainHealth: ...
def calc_report_score(db: Session) -> DomainHealth: ...
def calc_document_score(db: Session) -> DomainHealth: ...
def calc_investment_score(db: Session) -> DomainHealth: ...
def calc_overall_score(domains: dict) -> int: ...
```

### 6.3 기존 API 정리

현재 대시보드는 5개 API를 호출한다:
```
GET /api/dashboard/base
GET /api/dashboard/workflows
GET /api/dashboard/sidebar
GET /api/dashboard/completed
GET /api/dashboard/summary
```

리디자인 후:
```
GET /api/dashboard/health          ← 신규 (점수 + 알림)
GET /api/dashboard/today           ← base에서 오늘 업무만 추출 (축소)
GET /api/dashboard/deadlines       ← 이번 주 마감 통합 (태스크+보고+서류)
GET /api/dashboard/funds-snapshot  ← 펀드 현황 요약 행
GET /api/dashboard/workflows       ← 기존 유지
GET /api/dashboard/pipeline        ← 투자 심의 단계별 집계 (신규)
```

---

## 7. 프론트엔드 구현 계획

### 7.1 컴포넌트 구조

```
DashboardPage.tsx                  ← 전면 재작성
├── DashboardHeader.tsx            ← [A] 날짜 + 전체 점수 + 액션 버튼
├── DashboardAlertBar.tsx          ← [B] 긴급 알림 (조건부)
├── DashboardHealthCards.tsx       ← [C] 6개 도메인 건강 카드
├── DashboardMainContent.tsx       ← [D] 2칼럼
│   ├── TodayPriorities.tsx        ← [D-L] 오늘 핵심 + 이번 주 마감
│   └── FundSnapshot.tsx           ← [D-R] 펀드 현황 테이블
└── DashboardBottomRow.tsx         ← [E] 3칼럼
    ├── InvestmentPipeline.tsx     ← [E-1] 파이프라인
    ├── ActiveWorkflows.tsx        ← [E-2] 워크플로
    └── ReportDocDeadlines.tsx     ← [E-3] 보고/서류 마감
```

### 7.2 삭제 대상 (기존 컴포넌트)

| 컴포넌트 | 이유 |
|---------|------|
| DashboardDefaultView.tsx | 전면 교체 |
| DashboardStatCard.tsx | HealthCard로 대체 |
| DashboardTaskPanels.tsx | TaskBoardPage로 이관 |
| DashboardRightPanel.tsx | FundSnapshot + ReportDocDeadlines로 분리 |
| DashboardTaskList.tsx | 삭제 (TaskBoardPage에서 처리) |
| modals/DashboardPopupModal.tsx | 불필요 (각 페이지로 이동) |

### 7.3 HealthCard 컴포넌트 상세

```tsx
// 100px 높이, 6등분 가로 배치
<HealthCard
  icon={Scale}
  label="컴플라이언스"
  score={68}
  severity="danger"     // good | warning | danger
  summary="위반 1건"
  onClick={() => navigate('/compliance')}
/>
```

프로그레스 바 색상:
- good (90+): `bg-emerald-500`
- warning (70~89): `bg-amber-500`
- danger (<70): `bg-red-500`

### 7.4 TodayPriorities 상세

오늘 업무 + 보고 + 서류 + 컴플라이언스를 **하나의 리스트로 통합**:
```tsx
interface PriorityItem {
  type: 'task' | 'report' | 'document' | 'compliance'
  urgency: 'overdue' | 'today' | 'this_week'
  title: string
  context: string        // 펀드명 또는 회사명
  estimated_time?: string
  action_url: string
}
```

긴급도별 아이콘:
- overdue: 🔴 빨간 점
- today: 🟠 주황 점
- this_week: 🟡 노란 점

**최대 표시 건수**: 8건 (오늘 핵심 5건 + 이번 주 마감 3건)
초과 시 "[태스크보드 →]" 또는 "[전체 N건 보기 →]"로 페이지 이동

### 7.5 FundSnapshot 테이블

```
┌────────┬──────┬────┬─────┬────┬────┐
│ 펀드명  │ NAV  │ LP │ 출자율│컴플│서류│
├────────┼──────┼────┼─────┼────┼────┤
│ 펀드A  │ 120억│ 12 │ 85% │ ✓  │ 2건│
│ 펀드B  │  45억│  5 │ 60% │ ⚠  │ 0건│
│ 펀드C  │  20억│  3 │100% │ ✓  │ 1건│
├────────┼──────┼────┼─────┼────┼────┤
│ 합계   │ 185억│ 20 │     │    │ 3건│
└────────┴──────┴────┴─────┴────┴────┘
```

각 행 클릭 → `/funds/{id}` 이동

---

## 8. 구현 순서

### Phase 1: 백엔드 (건강 점수 API)
1. `services/health_score.py` 작성 — 6개 도메인 점수 계산
2. `routers/dashboard.py`에 `GET /health` 엔드포인트 추가
3. 기존 `/base` 응답에서 오늘 업무 데이터 분리 → `/today` 엔드포인트
4. `GET /pipeline` 엔드포인트 추가 (투자 심의 단계별 집계)
5. `GET /funds-snapshot` 엔드포인트 추가
6. `GET /deadlines` 엔드포인트 추가 (태스크+보고+서류 통합 마감)

### Phase 2: 프론트엔드 (레이아웃 구축)
1. 새 컴포넌트 생성: Header, AlertBar, HealthCards
2. 새 컴포넌트 생성: TodayPriorities, FundSnapshot
3. 새 컴포넌트 생성: InvestmentPipeline, ActiveWorkflows, ReportDocDeadlines
4. DashboardPage.tsx 전면 교체
5. API 연결 (React Query)

### Phase 3: 정리
1. 미사용 컴포넌트 삭제
2. 미사용 API 엔드포인트 정리 또는 deprecated 처리
3. 테스트 및 반응형 조정
