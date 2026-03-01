# Phase 20_3: 대시보드·업무보드·캘린더·파이프라인 UX 개선

> **Priority:** P0

---

## Table of Contents

1. [Part 1 — 워크플로 카드 레이아웃 4건 고정](#part-1)
2. [Part 2 — 기한미지정 카드와 오늘 업무 병합](#part-2)
3. [Part 3 — 파이프라인 대기 업무 모달 인라인 수정](#part-3)
4. [Part 4 — 파이프라인 뒤로가기 뷰 보존](#part-4)
5. [Part 5 — 업무보드 조합 필터에 고유계정 포함](#part-5)
6. [Part 6 — 캘린더 업무 상세보기 + 완료 표시](#part-6)
7. [Part 7 — 파이프라인 1페이지 인터랙티브 레이아웃](#part-7)
8. [Part 8 — 대시보드 업무현황 아코디언](#part-8)
9. [Part 9 — 통지·보고 유기적 연동](#part-9)
10. [Files to create / modify](#files-to-create--modify)
11. [Acceptance Criteria](#acceptance-criteria)
12. [구현 주의사항](#구현-주의사항)

---

## 현재 상태 분석

### 워크플로 카드 영역 (DashboardPage.tsx L510-540)
- `max-h-[280px] overflow-y-auto`, 2열 그리드, 4건 초과 스크롤 안내 이미 구현
- 카드 1건 ≈ 88px → 4건(2행) = ~184px

### 기한미지정 카드 (DashboardPage.tsx L592)
- `<TaskList title="기한 미지정" ... defaultCollapsed={true} />` — 별도 카드, 기본 접힘

### 파이프라인 대기 업무 (TaskPipelineView + DashboardPage)
- `onClickTask(task, { editable: true })` → `openTaskDetail` → TaskDetailModal (상세 보기)
- 대기 업무 수정하려면 업무보드 이동 필요

### 뒤로가기 (DashboardPage.tsx L395)
- `dashboardView` = `useState` → 뒤로가기 시 초기값 `'default'`로 복원

### 업무보드 조합 필터 (TaskBoardPage.tsx L871-880)
- `fundsForFilter` 배열 → `<select>` 으로 펀드 목록만 표시
- **고유계정(GP Entity)은 미포함**

### 캘린더 (CalendarPage.tsx 468줄)
- `event_type === 'task'` 이벤트: `task_id` 연결, 클릭 시 "업무 보드에서 관리" 텍스트만 (L321)
- **task 이벤트 클릭 → 업무 상세 정보 확인 불가**
- 완료 이벤트: `bg-green-100` 색상만, **취소선(line-through) 없음**
- 완료 클릭 시 별도 모달 없음

### 파이프라인 레이아웃 (TaskPipelineView.tsx 302줄)
- 5컬럼 `flex gap-2`, 컬럼별 `min-h-[420px]` → 업무 늘어나면 세로 스크롤

### 대시보드 우측 통지·보고 (DashboardPage.tsx)
- `upcoming_reports`: `dashboard.py` L304-377에서 계산 (별도 모델 BizReport/RegularReport)
- `upcomingNotices`: FundNoticePeriod 기반
- **Task 모델에 is_notice/is_report 필드 없음** → 업무와 통지/보고 간 연결 불가

---

## Part 1 — 워크플로 카드 레이아웃 4건 고정

**수정 대상:** `DashboardPage.tsx` L513

```tsx
// 변경 전:
<div className="max-h-[280px] overflow-y-auto pr-1">

// 변경 후: 정확히 4건(2행) 높이
<div className="max-h-[190px] overflow-y-auto pr-1">
```

- 카드 1건 ≈ 88px, 2행 + gap-2(8px) = ~184px → 안전 마진 포함 190px
- **실제 렌더링 후 미세 조정 필요**
- 기존 스크롤 기능 + "↓ 스크롤하여 N건 더보기" 안내 유지

---

## Part 2 — 기한미지정 카드와 오늘 업무 병합

**기존 L592 제거 → 오늘 업무 카드 내 하단 서브섹션으로 통합:**

```
┌────────────────────┐  ┌────────────────────┐
│ 오늘 (3건 2h30m)   │  │ 내일 (2건 1h)      │
│  • 규약 검토       │  │  • LP 서류 취합     │
│  • 보고서 작성     │  │  • 계좌 확인        │
│  ─ ─ ─ ─ ─ ─ ─ ─  │  │                    │
│  📌 기한 미지정 (2)│  │                    │
│  • 참고자료 정리   │  │                    │
└────────────────────┘  └────────────────────┘
```

**이유:** 기한미지정 업무는 "오늘 처리할지 판단"해야 하므로 오늘 업무와 함께 노출. 접혀서 안 보이던 문제 해결.

**구현:** TaskList에 `noDeadlineTasks` prop 추가, 하단에 구분선 + dashed border 스타일로 렌더링

---

## Part 3 — 파이프라인 대기 업무 모달 인라인 수정

**대기 업무 클릭 → 바로 EditTaskModal 열기 (업무보드 이동 불필요)**

```tsx
const openTaskDetail = (task: Task, editable = true) => {
  if (dashboardView === 'pipeline' && editable) {
    setEditingTask(task)  // 바로 편집 모달
  } else {
    setSelectedTask(task)
    setSelectedTaskEditable(editable)
  }
}
```

**EditTaskModal 공통 컴포넌트 분리:**
- `[NEW] frontend/src/components/EditTaskModal.tsx` — TaskBoardPage에서 코드 이동
- TaskBoardPage, DashboardPage 모두에서 import

---

## Part 4 — 파이프라인 뒤로가기 뷰 보존

**`dashboardView`를 `useState` → URL `searchParam` 기반으로 변경:**

```tsx
import { useSearchParams } from 'react-router-dom'

const [searchParams, setSearchParams] = useSearchParams()
const dashboardView = searchParams.get('view') === 'pipeline' ? 'pipeline' : 'default'
const setDashboardView = (view: 'default' | 'pipeline') => {
  setSearchParams(view === 'pipeline' ? { view: 'pipeline' } : {}, { replace: false })
}
```

**동작:** 파이프라인 → `/dashboard?view=pipeline` → 업무보드 이동 → 뒤로가기 → URL 복원 → 파이프라인 유지

---

## Part 5 — 업무보드 조합 필터에 고유계정 포함

**수정 대상:** `TaskBoardPage.tsx` L871-880

```tsx
// 변경 전:
<option value="">전체 조합</option>
{fundsForFilter.map((fund) => (
  <option key={fund.id} value={fund.id}>{fund.name}</option>
))}

// 변경 후:
<option value="">전체</option>
{gpEntities.length > 0 && (
  <optgroup label="고유계정">
    {gpEntities.map((gp) => (
      <option key={`gp-${gp.id}`} value={`gp-${gp.id}`}>{gp.name}</option>
    ))}
  </optgroup>
)}
<optgroup label="조합">
  {fundsForFilter.map((fund) => (
    <option key={fund.id} value={fund.id}>{fund.name}</option>
  ))}
</optgroup>
```

**필터 로직 수정:**
- `fundFilter` 값이 `gp-{id}` 형태 → `task.gp_entity_id` 로 필터
- 숫자 → 기존 `task.fund_id` 로 필터

**GPEntity 데이터 fetch:**
```tsx
const { data: gpEntities = [] } = useQuery({
  queryKey: ['gp-entities'],
  queryFn: fetchGPEntities,
})
```

> **의존성:** Phase 20_2 Part 7(고유계정 모델/API) 구현 후 가능

---

## Part 6 — 캘린더 업무 상세보기 + 완료 표시

### 6-A. 캘린더 task 이벤트 클릭 → 업무 상세 모달

**현재 (L320-321):**
```tsx
{event.task_id ? (
  <span className="text-xs text-gray-400">업무 보드에서 관리</span>
) : ( ... )}
```

**변경 후:**
```tsx
{event.task_id ? (
  <button 
    onClick={() => openTaskDetailModal(event.task_id!)}
    className="secondary-btn"
  >
    상세 보기
  </button>
) : ( ... )}
```

**openTaskDetailModal:**
- `task_id`로 업무 데이터 fetch (`fetchTask(id)` API 호출)
- TaskDetailModal 또는 읽기전용 모달로 상세 정보 표시

### 6-B. 완료 업무 취소선 표시 (캘린더에서 제거하지 않음)

**캘린더 셀 내 이벤트 (L264-269):**
```tsx
// 변경 전:
<div className={`text-[11px] px-1.5 py-0.5 rounded truncate ${eventTone(event)}`}>
  {event.title}
</div>

// 변경 후:
<div className={`text-[11px] px-1.5 py-0.5 rounded truncate ${eventTone(event)} ${
  event.status === 'completed' ? 'line-through opacity-60' : ''
}`}>
  {event.title}
</div>
```

**리스트 뷰 (L371)에도 동일 적용:**
```tsx
<p className={`font-medium text-gray-800 ${event.status === 'completed' ? 'line-through opacity-60' : ''}`}>
```

### 6-C. 완료 업무 클릭 → 완료 정보 모달

완료된 업무(task 이벤트) 클릭 시 간단한 모달:

```tsx
function CompletionInfoModal({ task, onClose }) {
  return (
    <div className="fixed inset-0 z-50 ...">
      <div className="rounded-2xl bg-white p-6 shadow-xl max-w-sm">
        <h3 className="text-lg font-semibold text-emerald-700">✅ 완료된 업무</h3>
        <div className="mt-3 space-y-2 text-sm">
          <div><span className="text-gray-500">업무명:</span> {task.title}</div>
          <div><span className="text-gray-500">완료 시간:</span> {task.completed_at || '-'}</div>
          <div><span className="text-gray-500">실제 소요:</span> {task.actual_time || '-'}</div>
          {task.completion_memo && (
            <div><span className="text-gray-500">업무 기록:</span> {task.completion_memo}</div>
          )}
          {task.fund_name && (
            <div><span className="text-gray-500">관련 조합:</span> {task.fund_name}</div>
          )}
        </div>
        <button onClick={onClose} className="mt-4 w-full primary-btn">닫기</button>
      </div>
    </div>
  )
}
```

---

## Part 7 — 파이프라인 1페이지 인터랙티브 레이아웃

### 7-A. viewport 기반 고정 높이

```tsx
// TaskPipelineView.tsx — 전체 컨테이너
<div className="flex h-[calc(100vh-140px)] gap-2">
  {stageColumns.map(column => (
    <div className="flex h-full flex-1 flex-col rounded-lg border ...">
      <div className="shrink-0 ...">헤더 (라벨 + 건수)</div>
      <div className="flex-1 overflow-y-auto space-y-2 px-2 py-1">카드들</div>
    </div>
  ))}
</div>
```

### 7-B. 인터랙티브 유연 카드

업무가 많아져도 한 페이지에 맞추기 위한 전략:

**① 컴팩트 / 확장 전환:**
- 컬럼 내 업무 5건 이하: 일반 카드 (제목 + 마감일 + 예상시간)
- 6건 이상: **컴팩트 모드** 자동 전환 (제목만 1줄, hover 시 상세 팝업)

```tsx
const isCompact = columnTasks.length > 5

// 일반 카드:
<div className="rounded-lg border p-2.5">
  <p className="text-sm font-medium">{task.title}</p>
  <div className="mt-1 flex gap-2 text-xs text-gray-400">
    <span>{task.deadline}</span>
    <span>{task.estimated_time}</span>
  </div>
</div>

// 컴팩트 카드:
<div className="group relative rounded border px-2 py-1.5 hover:bg-blue-50 cursor-pointer">
  <p className="truncate text-xs">{task.title}</p>
  {/* hover 팝업 */}
  <div className="invisible absolute left-full top-0 ml-2 z-10 ... group-hover:visible">
    <p>{task.deadline}</p>
    <p>{task.estimated_time}</p>
    <p>{task.fund_name}</p>
  </div>
</div>
```

**② 워크플로우 대표 카드:**
- 동일 워크플로우에 속한 task들 → 대표 카드 1개로 축약 (프로그레스 바 포함)
- 클릭 → 워크플로우 상세 모달

**③ 완료 컬럼 축소:**
```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────┐
│   대기   │ │   오늘   │ │ 이번 주  │ │   예정   │ │ ✅  │
│ flex-1   │ │ flex-1   │ │ flex-1   │ │ flex-1   │ │ 3건 │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └─────┘
```

**④ 하단 워크플로우 진행현황 제거** (L220-255 삭제 → 대표 카드로 대체)

---

## Part 8 — 대시보드 업무현황 아코디언 (효율성 판단 후 결정)

### 아코디언 구성안

```
┌──────────────────────────────────────┐
│ ▼ 오늘 (3건 2h30m)     [+ 빠른추가] │
│   • 규약 검토           마감 09:00   │
│   • 보고서 작성         마감 12:00   │
│   • 회의록 정리         마감 17:00   │
│   ─ 📌 기한 미지정 (2)              │
│   • 참고자료 정리                    │
│   • 업무 매뉴얼                      │
├──────────────────────────────────────┤
│ ▸ 내일 (2건 1h)         [+ 빠른추가] │ ← 접힌 상태
├──────────────────────────────────────┤
│ ▸ 이번 주 (5건)                      │ ← 접힌 상태
├──────────────────────────────────────┤
│ ▸ 예정 (3건)                         │ ← 접힌 상태
├──────────────────────────────────────┤
│ ▸ 완료 (4건)                         │ ← 접힌 상태
└──────────────────────────────────────┘
```

**효율성 평가:**

| 기준 | 현재 (2열+패널전환) | 아코디언 |
|------|-------------------|---------|
| 정보 밀도 | 2열로 높음 | 1열, 접힘으로 보통 |
| 탐색 속도 | 패널 전환 필요 | 한 번에 모든 항목 접근 |
| 모바일 호환 | 2열→1열 전환 필요 | 자연스러움 |
| 오늘/내일 동시 비교 | 가능 (2열) | 펼치면 가능하나 스크롤 필요 |

**권장: 조건부 구현**
- **데스크탑(lg 이상):** 현재 2열 레이아웃 유지 → 정보 밀도가 더 높음
- **모바일/태블릿(md 이하):** 아코디언 전환 → 공간 효율적
- **혹은:** 오늘만 기본 펼침, 나머지 접힌 아코디언 → 하나의 스크롤 가능한 리스트

> **구현 판단:** 현재 패널 전환 방식(daily/weekly)이 이미 정보를 효율적으로 분리. 아코디언이 반드시 더 효율적이지 않음. **모바일 대응 용도로만 아코디언 적용하고, 데스크탑은 현재 레이아웃 유지 권장.**
>
> 단, 사용자가 원하면 전면 아코디언으로 전환 가능.

---

## Part 9 — 통지·보고 유기적 연동

### 9-A. 문제 분석

현재 통지/보고는 **별도 모델**(FundNoticePeriod, BizReport, RegularReport)로 관리되며, Task 모델과 직접 연결되지 않음. 사용자 요구: "업무를 통지/보고와 유기적으로 연결"

### 9-B. Task 모델에 통지/보고 플래그 추가

**수정:** `backend/models/task.py`

```python
class Task(Base):
    # ... 기존 필드 ...
    is_notice = Column(Boolean, nullable=False, default=False)    # 통지 관련 업무
    is_report = Column(Boolean, nullable=False, default=False)    # 보고 관련 업무
```

### 9-C. 업무 제목 자동 인식

업무 제목에 특정 키워드 → `is_notice`/`is_report` 자동 설정:

**프론트엔드 (AddTaskForm, EditTaskModal, QuickAddTaskModal):**

```tsx
// 제목 변경 시 자동 감지
const detectNoticeReport = (title: string) => {
  const noticeKeywords = ['통지', '소집', '안건']
  const reportKeywords = ['보고', '리포트', '월간', '분기', '연간']
  
  const hasNotice = noticeKeywords.some(kw => title.includes(kw))
  const hasReport = reportKeywords.some(kw => title.includes(kw))
  
  return { is_notice: hasNotice, is_report: hasReport }
}

// title onChange 핸들러에서:
const { is_notice, is_report } = detectNoticeReport(newTitle)
setIsNotice(is_notice)
setIsReport(is_report)
```

### 9-D. 업무 생성/수정 폼에 체크박스 추가

**AddTaskForm, EditTaskModal, QuickAddTaskModal에:**

```tsx
<div className="flex items-center gap-3">
  <label className="flex items-center gap-1.5 text-xs text-gray-600">
    <input 
      type="checkbox" 
      checked={isNotice} 
      onChange={(e) => setIsNotice(e.target.checked)}
      className="rounded border-gray-300"
    />
    📢 통지
  </label>
  <label className="flex items-center gap-1.5 text-xs text-gray-600">
    <input 
      type="checkbox" 
      checked={isReport} 
      onChange={(e) => setIsReport(e.target.checked)}
      className="rounded border-gray-300"
    />
    📊 보고
  </label>
</div>
```

자동 감지로 체크되지만 사용자가 수동 변경 가능.

### 9-E. 워크플로우 템플릿 단계에 통지/보고 속성

**워크플로우 템플릿 단계 데이터에 `is_notice`/`is_report` 필드 추가:**

```python
# WorkflowStep 모델
class WorkflowStep(Base):
    # ... 기존 필드 ...
    is_notice = Column(Boolean, nullable=False, default=False)
    is_report = Column(Boolean, nullable=False, default=False)
```

워크플로우 인스턴스 실행 시 개별 task 생성할 때 해당 필드 자동 복사.

### 9-F. 대시보드 통지/보고 탭 연동

**현재:** `upcoming_reports`와 `upcomingNotices`는 별도 모델 기반
**변경:** `is_report=True`인 task도 보고 탭에, `is_notice=True`인 task도 통지 탭에 표시

```python
# dashboard.py — 통지 목록 조회 시
notice_tasks = db.query(Task).filter(
    Task.is_notice == True,
    Task.status != 'completed',
    Task.deadline != None,
).order_by(Task.deadline).all()

# 기존 FundNoticePeriod 기반 데이터와 병합하여 반환
```

### 9-G. 업무 수정 시 누락 통지/보고 체크

EditTaskModal에서 기존 업무 수정 시에도 `is_notice`/`is_report` 체크박스 표시:

- 처음에 제목으로 자동 감지된 값 보여줌
- 사용자가 누락 발견 시 체크박스로 추가 가능
- 저장 시 Task 업데이트

---

## Files to create / modify

| # | Type | File | Changes |
|---|------|------|---------|
| 1 | **[MODIFY]** | `frontend/src/pages/DashboardPage.tsx` | Part 1(워크플로 max-h), Part 2(기한미지정 병합), Part 3(editingTask), Part 4(URL searchParam), Part 8(아코디언 조건부) |
| 2 | **[NEW]** | `frontend/src/components/EditTaskModal.tsx` | Part 3 — 공통 컴포넌트 분리 |
| 3 | **[MODIFY]** | `frontend/src/pages/TaskBoardPage.tsx` | Part 5(고유계정 필터), EditTaskModal import, Part 9(통지/보고 체크박스) |
| 4 | **[MODIFY]** | `frontend/src/components/TaskPipelineView.tsx` | Part 7(1페이지 레이아웃, 컴팩트/확장, 워크플로 대표카드) |
| 5 | **[MODIFY]** | `frontend/src/pages/CalendarPage.tsx` | Part 6(업무 클릭 상세보기, 완료 취소선, 완료 정보 모달) |
| 6 | **[MODIFY]** | `backend/models/task.py` | Part 9(`is_notice`, `is_report` 필드 추가) |
| 7 | **[MODIFY]** | `backend/routers/dashboard.py` | Part 9(통지/보고 task 병합 조회) |
| 8 | **[MODIFY]** | `frontend/src/lib/api.ts` | Task 타입에 `is_notice`/`is_report`, GPEntity fetch 등 |
| 9 | **[MODIFY]** | 관련 스키마/라우터 | `is_notice`/`is_report` 스키마 반영 |

---

## Acceptance Criteria

### Part 1: 워크플로 카드 4건 고정
- [ ] AC-01: 워크플로 카드 영역이 정확히 4건(2행) 높이
- [ ] AC-02: 스크롤 + 안내 텍스트 유지

### Part 2: 기한미지정 병합
- [ ] AC-03: 별도 TaskList 제거, 오늘 카드 내 서브섹션
- [ ] AC-04: dashed border + 📌 아이콘으로 시각 구분
- [ ] AC-05: 0건이면 미표시

### Part 3: 대기 모달 수정
- [ ] AC-06: 파이프라인 대기 클릭 → EditTaskModal 바로 열림
- [ ] AC-07: 수정 → invalidateQueries → 즉시 반영
- [ ] AC-08: EditTaskModal 공통 컴포넌트로 분리

### Part 4: 뒤로가기
- [ ] AC-09: URL `?view=pipeline` 기반 뷰 보존
- [ ] AC-10: 뒤로가기 → 파이프라인 복원

### Part 5: 고유계정 필터
- [ ] AC-11: `<optgroup label="고유계정">` + `<optgroup label="조합">` 구분
- [ ] AC-12: 고유계정 선택 시 `gp_entity_id` 기반 필터링

### Part 6: 캘린더
- [ ] AC-13: task 이벤트 클릭 → 업무 상세 모달 (제목, 마감, 예상시간, 카테고리 등)
- [ ] AC-14: 완료 업무 → 캘린더 칸에 `line-through` + `opacity-60`
- [ ] AC-15: 완료 업무 클릭 → 완료 시간, 실제 소요, 업무 기록 보여주는 모달
- [ ] AC-16: 캘린더에서 완료 업무 **제거하지 않음** (취소선으로 표시)

### Part 7: 파이프라인 1페이지
- [ ] AC-17: `h-[calc(100vh-140px)]` 고정, 세로 스크롤 없음
- [ ] AC-18: 6건 이상 → 컴팩트 카드 자동 전환
- [ ] AC-19: 워크플로 대표 카드로 축약
- [ ] AC-20: 완료 컬럼 축소 (카운트 배지)

### Part 8: 아코디언
- [ ] AC-21: (조건부) 모바일에서 아코디언 레이아웃 또는 효율성 판단 후 구현/제외

### Part 9: 통지·보고
- [ ] AC-22: Task에 `is_notice`/`is_report` 필드
- [ ] AC-23: 제목 키워드 자동 감지 (통지, 보고 등)
- [ ] AC-24: AddTaskForm/EditTaskModal에 📢 통지 / 📊 보고 체크박스
- [ ] AC-25: 대시보드 통지/보고 탭에 `is_notice`/`is_report` task도 표시

### 공통
- [ ] AC-26: `npm run build` TypeScript 에러 0건
- [ ] AC-27: 기존 기능 정상 동작

---

## 구현 주의사항

1. **파이프라인 1페이지** — `100vh` 기반이므로 모바일/작은 화면에서도 컬럼 내 스크롤만 허용
2. **컴팩트 카드 threshold** — 5건 기준은 조정 가능. 화면 높이 대비 동적 계산도 고려
3. **통지/보고 자동 감지** — 키워드는 한국어 기반이며 확장 가능하도록 배열로 관리
4. **고유계정 필터** — Phase 20_2 Part 7 (GPEntity 모델/API) 구현 전제
5. **캘린더 상세 모달** — CalendarEvent에 연결된 task_id로 API 호출 → fetchTask(id) 필요
6. **아코디언** — 효율성이 낮으면 구현 제외 가능. 프롬프트 내 판단 근거 제시
7. **EditTaskModal 분리** — 의존성(TimeSelect, HOUR_OPTIONS 등) 정확히 import
8. **console.log, print 디버깅 코드 남기지 않는다**
