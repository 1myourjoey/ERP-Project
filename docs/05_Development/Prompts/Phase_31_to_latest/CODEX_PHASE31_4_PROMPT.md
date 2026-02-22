# Phase 31_4: 카테고리 순환 시스템 + 전체 시스템 무결성·정합성·ACID·효율성 감사

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
>
> **배경:** Phase 31~31_3 구현 완료 후, 전체 코드베이스(22 프론트엔드 페이지, 31 백엔드 라우터,
> 20 DB 모델, api.ts 1785줄)를 전수 감사하여 작성된 프롬프트입니다.
>
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist를 반드시 수행할 것.

**Priority:** P0 (System Integrity + Performance)

---

## Part 1. 카테고리 자동 등록 — 워크플로 → 업무 → 업무일지 → 교훈 순환 시스템

### 1-1. 현재 끊김 지점

```
[워크플로 템플릿] → category: "투자실행"
       ↓ 인스턴스 실행
[Task 생성] → category: null ← ⚠️ 미전파
       ↓ 완료
[WorkLog] → category: ? ← ⚠️ 불확실
       ↓ 교훈 조회
[CompleteModal] → 교훈 매칭 실패 ← ⚠️
```

### 1-2. 구현 내용

#### A. 워크플로 인스턴스 실행 시 카테고리 자동 전파
- `instantiate_workflow` API: 템플릿 `category` → 모든 생성 Task의 `category` 자동 설정
- 이미 Task에 category 있으면 덮어쓰지 않음

#### B. 워크플로 템플릿 저장 시 task_categories 자동 등록
- `create_workflow` / `update_workflow`: 템플릿 `category`를 `task_categories`에 자동 insert (없으면 추가, 있으면 무시)

#### C. 워크플로 단계 완료 → WorkLog의 category 설정
- Phase 31_3의 WorkLog 자동 생성 시 워크플로 category 사용

#### D. TemplateModal 카테고리 입력 개선
- 현재: 자유 텍스트 `<input>` (WorkflowsPage 646줄)
- 변경: `fetchTaskCategories()`를 호출하여 기존 카테고리를 `<datalist>`로 제안 + 새 카테고리 직접 입력 가능

#### E. 인스턴스 실행 시 `is_notice` / `is_report` 전파 확인
- 워크플로 단계의 `is_notice`, `is_report` → 생성 Task의 해당 필드로 전파되는지 확인
- 누락이면 추가

---

## Part 2. 트랜잭션 ACID 준수 — 전체 Backend 라우터

### 2-1. 현재 문제: Atomicity 부재

**전수 조사 결과:** 전체 31개 라우터에서:
- **`db.commit()` 150+ 회** 호출
- **`db.rollback()` 0회** — 단 하나도 없음
- **`try/except` 로 감싼 commit 0건**

이는 **다중 단계 쓰기 작업 도중 예외 발생 시 부분 데이터가 DB에 남는** 치명적 문제입니다.

#### 가장 위험한 케이스: `workflows.py`

`instantiate_workflow` (인스턴스 실행):
```python
# 1. WorkflowInstance 생성 → db.flush()
# 2. WorkflowStepInstance N개 생성 → 각각 db.flush()
# 3. Task N개 생성 → db.flush()
# 4. StepInstanceDocument 생성
# 5. db.commit()
```
→ **2단계에서 실패하면** Instance는 생성되었으나 Step이 일부만 존재하는 깨진 상태

`complete_workflow_step` (단계 완료):
```python
# 1. Step 상태 변경 → db.flush()
# 2. WorkLog 생성 (Phase 31_3)
# 3. 다음 단계 Task 생성
# 4. 조합 상태 업데이트 (결성 완료 시)
# 5. db.commit()
```
→ **3단계에서 실패하면** Step은 completed이나 다음 Task가 없는 상태

### 2-2. 구현 내용

#### A. 모든 쓰기 API에 try/except/rollback 패턴 적용

```python
# 표준 패턴:
try:
    # ... 비즈니스 로직 (flush 등)
    db.commit()
except Exception:
    db.rollback()
    raise
```

#### B. 적용 대상 (우선순위별)

| 우선순위 | 라우터 | 이유 |
|---|---|---|
| 🔴 P0 | `workflows.py` (25+ commits) | 다중 엔티티 동시 생성/수정, 가장 복잡 |
| 🔴 P0 | `task_completion.py` | 완료 + WorkLog + 문서 검증 동시 처리 |
| 🔴 P0 | `task_bulk.py` | N개 Task 일괄 처리 |
| 🔴 P0 | `capital_calls.py` (27KB) | 자금 관련 — 정합성 필수 |
| 🟡 P1 | `funds.py` (69KB) | 조합 생성/수정/마이그레이션 |
| 🟡 P1 | `tasks.py` | Task CRUD |
| 🟡 P1 | `worklogs.py` | WorkLog + Detail/Lesson/FollowUp 동시 생성 |
| 🟢 P2 | 나머지 라우터 | 단순 CRUD |

#### C. SQLAlchemy Session 레벨 보호

`database.py`의 `get_db()` 제너레이터에서 전역 보호 추가:
```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
```
→ 이 한 곳만 수정해도 **모든 라우터에 기본 rollback 보호 적용**
→ 단, 개별 라우터의 복잡한 로직에서는 명시적 try/except도 추가 권장

---

## Part 3. DB 인덱싱 최적화

### 3-1. 현재 문제: FK 컬럼 및 필터 컬럼에 인덱스 부재

**Task 모델 (`models/task.py`):**
```python
status = Column(String, default="pending")       # ← 필터 대상, index 없음
deadline = Column(DateTime, nullable=True)        # ← 정렬/필터 대상, index 없음
category = Column(String, nullable=True)          # ← 필터/JOIN 대상, index 없음
fund_id = Column(Integer, FK, nullable=True)      # ← JOIN 대상, index 없음
workflow_instance_id = Column(Integer, FK)         # ← JOIN 대상, index 없음
```

**WorkLog 모델 (`models/worklog.py`):**
```python
category = Column(String, nullable=False)          # ← 교훈 조회 JOIN 대상, index 없음
task_id = Column(Integer, FK, nullable=True)       # ← JOIN 대상, index 없음
date = Column(Date, nullable=False)                # ← 정렬 대상, index 없음
```

**WorkflowStepInstance (`models/workflow_instance.py`):**
```python
instance_id = Column(Integer, FK)                  # ← JOIN 대상, index 없음
task_id = Column(Integer, FK)                      # ← JOIN 대상, index 없음
```

### 3-2. 구현 내용

다음 컬럼에 `index=True` 추가:

| 모델 | 컬럼 | 이유 |
|---|---|---|
| `Task` | `status` | 업무보드 필터 `WHERE status = 'pending'` |
| `Task` | `deadline` | D-Day 정렬, 지연/임박 필터 |
| `Task` | `category` | 카테고리 필터, 교훈 리마인드 매칭 |
| `Task` | `fund_id` | 조합별 필터 |
| `Task` | `workflow_instance_id` | 워크플로 그룹 조회 |
| `Task` | `is_notice` | 대시보드 통지 탭 필터 |
| `Task` | `is_report` | 대시보드 보고 탭 필터 |
| `WorkLog` | `category` | 교훈 리마인드 조회 |
| `WorkLog` | `task_id` | WorkLog ↔ Task JOIN |
| `WorkLog` | `date` | 날짜순 정렬/필터 |
| `WorkflowStepInstance` | `instance_id` | 인스턴스 상세 조회 |
| `WorkflowStepInstance` | `task_id` | Task ↔ Step JOIN |
| `WorkflowStepInstanceDocument` | `step_instance_id` | 서류 목록 조회 |
| `CalendarEvent` | `date` / `start_date` | 캘린더 범위 조회 |

Alembic 마이그레이션으로 인덱스 추가:
```
alembic revision --autogenerate -m "add_performance_indexes"
alembic upgrade head
```

---

## Part 4. 데이터 무결성 제약 조건

### 4-1. 현재 문제: UniqueConstraint 부재

**전수 조사 결과:** 전체 20개 모델에서 `UniqueConstraint`가 **단 하나도 없음**.

위험한 케이스:
- `TaskCategory.name` — 동시 요청으로 같은 이름의 카테고리가 중복 생성 가능
- `WorkflowStepInstance` — 같은 instance_id + workflow_step_id 조합이 중복 가능

### 4-2. 구현 내용

```python
# task_category.py
class TaskCategory(Base):
    __tablename__ = "task_categories"
    name = Column(String, nullable=False, unique=True)  # ← unique 추가

# workflow_instance.py
class WorkflowStepInstance(Base):
    __table_args__ = (
        UniqueConstraint('instance_id', 'workflow_step_id', name='uq_step_instance'),
    )
```

---

## Part 5. N+1 쿼리 및 Over-fetching 최적화

### 5-1. 주요 N+1 패턴

**`dashboard.py` (24KB):**
- 대시보드 로드 시 Task → Fund, Task → GPEntity 등을 **개별 조회**하는 패턴 확인 필요
- `fetchDashboard`가 Task 목록을 가져온 후, 각 Task의 fund_name을 별도로 조인하는지 확인

**`tasks.py` — `_to_task_response`:**
- Task → Fund/GPEntity/Company를 **매번 개별 조회**하고 있으면 N+1 문제
- `joinedload` 또는 `subqueryload`로 최적화 필요

**`workflows.py` — 인스턴스 목록:**
- 인스턴스 목록 조회 시 각 인스턴스의 step_instances + step_documents를 개별 로딩하면 N+1

### 5-2. 구현 내용

- 모든 목록 조회 API에서 관계 엔티티를 `joinedload` / `selectinload` 으로 eager loading
- `dashboard.py`의 Task 조회에서 Fund/GPEntity/Company를 JOIN으로 한 번에 가져오기
- `_to_task_response` 안에서 추가 쿼리 없이 이미 로드된 관계 데이터 사용

---

## Part 6. 프론트엔드 효율성 — React 성능 최적화

### 6-1. 대형 컴포넌트 리렌더링 최적화

**현재 대형 파일:**
- `TaskBoardPage.tsx`: 1715줄
- `WorkflowsPage.tsx`: 1758줄
- `FundDetailPage.tsx`: 136KB (최대)

이 파일들에서:
1. **불필요한 리렌더링:** 부모 state 변경 시 자식 전체 리렌더링
2. **메모이제이션 부족:** 대형 리스트의 `useMemo` / `React.memo` 미적용

### 6-2. 구현 내용

1. **`React.memo` 적용:** `TaskItem`, `WorkflowGroupCard`, `WorkLogEntry` 등 반복 렌더링 컴포넌트에 memo 래핑
2. **`useMemo` 적용:** 필터링/정렬 로직 (예: `urgentTasks`, `overdueTasks`, 카테고리 필터링)에 useMemo 적용
3. **`useCallback` 적용:** 이벤트 핸들러 (onComplete, onDelete, onEdit)에 useCallback 적용
4. **대형 리스트 가상화:** 100건 이상 항목이 표시되는 리스트에 `react-window` 또는 CSS 기반 가상 스크롤 고려

---

## Part 7. 에러 핸들링 통일

### 7-1. 현재 문제

- Backend: `HTTPException` 사용하지만 **에러 코드 체계가 없음** (모두 문자열 detail)
- Frontend: `axios.interceptors`에서 모든 에러를 toast로 표시하지만, **에러 유형별 분기 없음**
- 네트워크 실패 vs 400 validation error vs 409 conflict → 모두 같은 toast

### 7-2. 구현 내용

1. **Backend 에러 코드 표준화:**
   ```python
   # 표준 에러 응답
   HTTPException(status_code=400, detail="카테고리 이름을 입력해주세요.")
   HTTPException(status_code=409, detail="이미 존재하는 카테고리입니다.")
   HTTPException(status_code=422, detail="날짜 형식이 올바르지 않습니다.")
   ```
   → 모든 라우터에서 일관된 한글 에러 메시지 확인/수정

2. **Frontend 에러 분기:**
   - 409 (Conflict): "이미 존재합니다" 계열 → 경고 toast
   - 422 (Validation): "입력값을 확인해주세요" → 인풋 하이라이트
   - 500 (Server Error): "서버 오류" → 재시도 버튼이 있는 toast

---

## Part 8. 연계 정합성 — 전수 점검 체크리스트

아래 항목을 **코드 레벨에서 하나씩 확인**하고, 문제가 있으면 수정:

### Backend 연계
- [ ] `instantiate_workflow`에서 Task 생성 시 `category`, `is_notice`, `is_report` 전파 확인
- [ ] `complete_workflow_step`에서 WorkLog 생성 시 `category`, `task_id` 설정 확인
- [ ] `worklog_lessons.py`: JOIN 방식이 `task_id NULL` 교훈도 조회하는지 확인 (OUTERJOIN)
- [ ] `dashboard/sidebar` API에서 `is_notice`/`is_report` Task 포함 여부 확인
- [ ] `task_categories` 자동 등록이 워크플로 + Task 양쪽에서 동작하는지 확인
- [ ] Fund 삭제 시 연관 Task/WorkflowInstance의 `fund_id`가 `SET NULL` 처리되는지 확인
- [ ] CapitalCall 생성 시 Fund 존재 검증 및 LP 존재 검증 확인

### Frontend 연계
- [ ] `queryInvalidation.ts` 공통 함수가 존재하고 모든 mutation에서 사용되는지 확인
- [ ] 모든 페이지의 `useQuery` queryKey가 invalidation 대상에 포함되는지 교차 확인
- [ ] `CalendarPage`와 `MiniCalendar`의 D-Day 색상 로직이 동일한 유틸을 공유하는지 확인
- [ ] `TaskPipelineView`가 대시보드에서 제거되고 업무보드에만 존재하는지 확인
- [ ] `CompleteModal` props에 `category`, `fund_id`가 전달되는지 확인
- [ ] 워크플로 `InstanceList`에서 `step_documents` 체크리스트가 렌더링되는지 확인
- [ ] 체크리스트가 워크플로 하위로 이동되었는지 확인

### 데이터 무결성
- [ ] Task.category → task_categories.name 논리적 정합성
- [ ] WorkLog.category → task_categories.name 논리적 정합성
- [ ] WorkflowTemplate.category → task_categories.name 논리적 정합성
- [ ] WorkflowStepInstanceDocument.checked 상태가 Backend에 올바르게 영속되는지
- [ ] 조합 삭제 시 연관 엔티티들이 고아 레코드 없이 처리되는지

### ACID / 트랜잭션
- [ ] `database.py` `get_db()`에 전역 rollback 보호 적용 확인
- [ ] `workflows.py`의 모든 다중 엔티티 쓰기 함수에 try/except/rollback 적용 확인
- [ ] `task_completion.py`의 완료 처리에 atomicity 보장 확인
- [ ] `capital_calls.py`의 자금 관련 쓰기에 try/except/rollback 적용 확인

---

## Files to modify / create

| # | Type | Target | Description |
|---|---|---|---|
| 1 | **[MODIFY]** | `backend/routers/workflows.py` | (1) 카테고리 자동 전파/등록, (2) is_notice/is_report 전파, (3) try/except/rollback |
| 2 | **[MODIFY]** | `backend/database.py` | `get_db()` 전역 rollback 보호 추가 |
| 3 | **[MODIFY]** | `backend/models/task.py` | status, deadline, category, fund_id 등 인덱스 추가 |
| 4 | **[MODIFY]** | `backend/models/worklog.py` | category, task_id, date 인덱스 추가 |
| 5 | **[MODIFY]** | `backend/models/workflow_instance.py` | instance_id, task_id 인덱스 + UniqueConstraint |
| 6 | **[MODIFY]** | `backend/models/task_category.py` | name unique 제약 추가 |
| 7 | **[MODIFY]** | `backend/routers/task_completion.py` | try/except/rollback 추가 |
| 8 | **[MODIFY]** | `backend/routers/capital_calls.py` | try/except/rollback 추가 |
| 9 | **[MODIFY]** | `backend/routers/worklogs.py` | try/except/rollback 추가 |
| 10 | **[MODIFY]** | `backend/routers/worklog_lessons.py` | JOIN → OUTERJOIN, WorkLog.category 매칭 추가 |
| 11 | **[MODIFY]** | `backend/routers/dashboard.py` | is_notice/is_report Task를 통지/보고에 포함 |
| 12 | **[MODIFY]** | `backend/routers/tasks.py` | _to_task_response N+1 최적화 (joinedload) |
| 13 | **[NEW]** | `frontend/src/lib/taskUrgency.ts` | D-Day 계산 공유 유틸 |
| 14 | **[MODIFY]** | `frontend/src/pages/WorkflowsPage.tsx` | TemplateModal 카테고리 datalist, InstanceList 서류 체크리스트 |
| 15 | **[MODIFY]** | `frontend/src/pages/TaskBoardPage.tsx` | React.memo, useMemo, useCallback 적용 |
| 16 | **[NEW]** | Alembic 마이그레이션 | 인덱스 + UniqueConstraint DDL |

---

## Acceptance Criteria

- [ ] **AC-01 (카테고리 순환):** 워크플로 저장 → task_categories 등록 → 인스턴스 실행 → Task category 전파 → WorkLog category 설정 → 교훈 리마인드 매칭 — 전체 순환 동작 확인.
- [ ] **AC-02 (ACID):** `database.py` `get_db()`에 전역 rollback 보호 적용. `workflows.py`의 다중 엔티티 쓰기에 try/except/rollback 적용. 부분 실패 시 데이터 롤백 확인.
- [ ] **AC-03 (인덱싱):** Task/WorkLog/WorkflowStepInstance의 주요 필터/JOIN 컬럼에 인덱스 추가. Alembic 마이그레이션 정상 실행.
- [ ] **AC-04 (UniqueConstraint):** `task_categories.name`에 unique 제약. 중복 이름 insert 시 409 에러 반환.
- [ ] **AC-05 (N+1):** 대시보드, 업무보드 Task 목록 조회 시 N+1 쿼리 제거. joinedload/selectinload 적용.
- [ ] **AC-06 (React 최적화):** TaskItem, WorkflowGroupCard에 React.memo 적용. 필터 로직에 useMemo 적용.
- [ ] **AC-07 (연계 정합성):** Part 8 체크리스트 전항목 확인 완료.
- [ ] **AC-08 (기존 유지):** Phase 31~31_3의 모든 기능 유지.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. Q1~Q4 칸반 구조 — 그대로 유지
3. Phase 31~31_3의 기존 구현 — 유지 (보강만, 삭제/재구성 금지)
4. `api.ts`의 기존 API 시그니처 — 유지 (내부 구현만 개선)
5. SQLAlchemy 모델의 기존 컬럼 타입/이름 — 유지 (인덱스/제약만 추가)
