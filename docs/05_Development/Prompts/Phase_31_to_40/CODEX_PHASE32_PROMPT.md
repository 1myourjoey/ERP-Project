# Phase 32: 정기 업무 캘린더 + 워크플로 UX 리뉴얼 + 파일 첨부 + 체크리스트 고도화

> 🔖 **작업 전 필수:**
> 1. `docs/CODEX_RULES.md` 먼저 읽을 것.
> 2. 아래 Part 0의 전수조사 지침에 따라 **관련 유기적 연계 항목을 모두 확인**한 후 작업 시작.
>
> ⚠️ **비식별화 원칙:** 코드, 미리보기, 기본값에 실존 회사명·개인명·주소 사용 금지.
>
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P0

---

## Part 0. 구현 전 유기적 연계 전수조사 (필수)

**아래 파일/기능 간 연계를 반드시 코드 레벨에서 확인하고, 하나라도 누락 없이 연결할 것:**

### 0-1. 확인 필수 연계 맵

```
정기 업무 캘린더
  ├─→ WorkflowsPage (템플릿 + 인스턴스)
  ├─→ TaskBoardPage (자동 생성 Task)
  ├─→ CalendarPage + MiniCalendar (일정 표시)
  ├─→ DashboardDefaultView (긴급 배너)
  ├─→ DashboardRightPanel (통지/보고 탭)
  └─→ RegularReport / BizReport (기존 보고 모델)

워크플로 UX
  ├─→ TemplateManagementPage (서류 템플릿)
  ├─→ DocumentEditorModal (서류 생성/미리보기)
  ├─→ documents.py API (generate/preview)
  └─→ document_service.py (변수 치환 엔진)

체크리스트
  ├─→ ChecklistsPage (독립 또는 embedded)
  ├─→ WorkflowsPage (checklists 탭)
  └─→ TaskBoardPage (업무 생성 연계)
```

### 0-2. 조사 체크리스트

- [ ] `invalidateQueries` 패턴: 새로 추가하는 모든 mutation에서 `queryInvalidation.ts` 공통 함수 사용
- [ ] Task 자동 생성 시 `category`, `is_notice`, `is_report`, `fund_id` 전파 확인
- [ ] 새로 추가하는 API가 기존 `api.ts` 타입/export 패턴과 일관되는지 확인
- [ ] 대시보드 배너/통지/보고 탭에 새 정기 업무가 자동 포함되는지 확인
- [ ] CalendarEvent와 정기 업무 Task의 관계 확인

---

## Part 1. 정기 업무 캘린더 시스템

### 1-1. 정기 항목 정의 — VC 운용사 연간 법적 의무 스케줄

#### A. 분기보고 사이클 (연 4회 × 조합 수)

**법적 근거:** 투자계약서 통합형 제9조 — 보고 및 자료제출, 다음 분기 시작일로부터 60일 이내 제출

| 분기 | 단계 | 일정 | 상세 |
|---|---|---|---|
| 1Q/2Q/3Q/4Q | ① 피투자사 자료 요청 | 2/10, 5/10, 8/10, 11/10 | 피투자사에 재무제표·손익계산서 요청 |
| | ② 자료 수집 | 요청일 ~ +2주 | 피투자사로부터 서류 수집 |
| | ③ 취합 완료 | 해당 달 마지막 주 | 수집 서류 취합·검토 |
| | ④ 보고서 작성 완료 | 3/5, 6/5, 9/5, 12/5 | 분기보고서 Excel 작성 완료 |
| | ⑤ 보고회 소집 안내 | 작성완료 후 5일 이내 | LP 대상 소집 안내 발송 |
| | ⑥ 분기보고회 개최 | 소집 안내 후 | 내부 보고회 개최 |

#### B. 영업보고 사이클 (연 2회)

| 보고 | 준비 마감 | 서류 세트 | 개최 시기 |
|---|---|---|---|
| **온기 영업보고** | 3/10 | ① 총회소집공문 ② 의안설명서 ③ 영업보고서 ④ 감사보고서 ⑤ 의결권통보서 | 3월 중순~말 |
| **반기 영업보고** | 9/10 | ① 총회소집공문 ② 의안설명서 ③ 영업보고서 ④ 감사보고서 ⑤ 의결권통보서 | 9월 중순~말 |

#### C. 정기사원총회 (연 1회, 3월 — LLC 유한회사만)

| 항목 | 시기 | 법적 근거 |
|---|---|---|
| 소집 통지 | 총회일 **7일 전** | 상법 — 1주 전 서면/전자문서로 각 사원에게 통지 |
| 정기사원총회 개최 | 3월 중순~말 | 사원총회 = 최고 의사결정 기관 (이사회 없음) |
| 의결권 | 1좌 = 1의결권 | 정관으로 변경 가능 |
| **서류 5종** | 총회 전 준비 | 소집공문, 의안설명서, 재무제표증명원, 서면의결서, 의사록 |
| **적용 대상** | LLC 유한회사만 | 벤처투자회사(주식회사)는 해당 없음 |

### 1-2. 구현 내용

#### A. 정기 업무 스케줄 모델 (`models/periodic_schedule.py` NEW)

```python
class PeriodicSchedule(Base):
    __tablename__ = "periodic_schedules"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)            # "1Q 분기보고", "온기 영업보고" 등
    category = Column(String)                        # "분기보고" / "영업보고" / "정기사원총회"
    recurrence = Column(String)                      # "quarterly" / "semi-annual" / "annual"
    base_month = Column(Integer)                     # 시작 월
    base_day = Column(Integer)                       # 시작 일
    workflow_template_id = Column(Integer, FK("workflows.id"), nullable=True)
    fund_type_filter = Column(String, nullable=True) # null=전체, "LLC"=유한회사만
    is_active = Column(Boolean, default=True)
    steps_json = Column(Text, nullable=True)         # 단계별 일정 오프셋 JSON
    description = Column(Text, nullable=True)
```

`steps_json` 예시:
```json
[
  {"name": "피투자사 자료 요청", "offset_days": 0, "is_report": true},
  {"name": "자료 수집 완료", "offset_days": 14},
  {"name": "취합 완료", "offset_days": 20},
  {"name": "보고서 작성 완료", "offset_days": 23},
  {"name": "보고회 소집 안내", "offset_days": 28, "is_notice": true},
  {"name": "보고회 개최", "offset_days": 35}
]
```

#### B. 연간 일정 자동 생성 API

`POST /api/periodic-schedules/generate-year?year=2026`:
1. 활성 `PeriodicSchedule` 순회
2. 각 정기 항목 × 각 활성 조합(Fund)에 대해:
   - `fund_type_filter`가 "LLC"이면 해당 유한회사 조합만 대상
   - 워크플로 인스턴스 자동 생성 (연결된 `workflow_template_id` 사용)
   - 각 단계의 `offset_days`로 실제 마감일 계산 → Task `deadline` 설정
3. 생성된 Task에 `category`, `is_notice`/`is_report` 자동 설정

**연계 (6개 포인트):**
- **업무보드:** 자동 생성된 Task가 Q1~Q4 칸반에 표시
- **대시보드 배너:** 임박 마감 Task가 긴급 업무 배너에 표시
- **대시보드 통지/보고:** `is_notice`/`is_report` Task가 우측 패널에 포함
- **CalendarPage + MiniCalendar:** 정기 업무 Task의 deadline이 캘린더에 표시
- **워크플로:** 정기 워크플로 인스턴스의 진행률/단계 추적
- **RegularReport:** 정기 업무에서 생성된 보고가 `RegularReport` 테이블과 연계

#### C. 리마인드 시스템

각 정기 업무 Task에 대해 기존 D-Day 시스템 활용:
- D-7, D-3, D-1 에 해당하는 Task가 대시보드 배너에 자동 표시
- 업무보드 상단 배너: "📊 2Q 분기보고 자료 마감 D-3" 형태
- 추가 별도 구현 불필요 — 기존 D-Day 색상 코딩 + 긴급 배너 + 통지/보고 탭이 자동 연동

#### D. 기본 워크플로 템플릿 시드 데이터

시스템 초기 설정 시 (또는 마이그레이션) 다음 워크플로 기본 템플릿 자동 등록:

1. **분기보고 워크플로** — 6단계 (자료요청 → 수집 → 취합 → 작성 → 소집안내 → 개최)
2. **온기/반기 영업보고 워크플로** — 6단계 (소집공문 → 의안설명서 → 영업보고서 → 감사보고서 → 의결권통보서 → 총회개최)
3. **정기사원총회 워크플로** — 4단계 (소집통지 → 서류준비(5종) → 총회개최 → 의사록작성)

각 템플릿의 `step_documents`에 해당 서류 연결.

#### E. 정기 업무 캘린더 관리 UI

**위치:** 워크플로 페이지 내 **"정기 업무"** 탭

| UI 요소 | 상세 |
|---|---|
| **연간 뷰** | 12개월 가로 타임바에 정기 업무 블록이 색상으로 표시 (분기보고=파랑, 영업보고=초록, 사원총회=보라) |
| **정기 항목 목록** | 등록된 PeriodicSchedule CRUD (추가/수정/삭제) |
| **연간 생성 버튼** | `[2026년 정기 일정 일괄 생성]` → 확인 다이얼로그 → 모든 대상 조합에 인스턴스 생성 |
| **현황** | 각 조합별 정기 업무 진행 현황 매트릭스 |

---

## Part 2. 워크플로 UX/UI 리뉴얼

### 2-1. 현재 문제 분석

**TemplateModal (WorkflowsPage 427~870줄)의 UX 문제:**

| 문제 | 위치 | 상세 |
|---|---|---|
| **정보 밀도 과다** | 700~826줄 | 단계 하나가 4열 그리드에 10개 필드 + 서류 + 드래프트 입력이 모두 한 카드에 |
| **라벨 너무 작음** | 전체 | `text-[10px]` (10px) 라벨 — 읽기 어려움 |
| **서류 추가 혼란** | 758~821줄 | "직접 추가"와 "템플릿 추가"가 별도 입력 영역으로 분리 → 어디에 뭘 입력하는지 불명확 |
| **구간 구분 부재** | 전체 | 기본정보 / 단계 / 서류 / 주의사항이 시각적으로 구분되지 않음 (모두 같은 배경에 나열) |
| **순서 변경 불가** | 단계 | 단계 순서를 드래그나 ↑↓ 버튼 없이 직접 order 숫자 변경해야 |

### 2-2. 파일 첨부 시스템 (NEW)

**현재:** 서류 관련 기능이 **이름만** 등록 가능 — 실제 파일 첨부/다운로드 불가

**목표:** 워크플로 템플릿과 인스턴스에서 외부 파일을 첨부하면, 다음 실행 시에도 그 파일이 유지되어 다운로드 가능

#### A. 파일 업로드 Backend

```python
# routers/attachments.py (NEW)
@router.post("/api/attachments")
async def upload_attachment(file: UploadFile = File(...)):
    # 파일 저장 (로컬 uploads/ 폴더)
    # DB에 메타데이터 저장 (파일명, 크기, MIME 타입, 경로)
    # 반환: attachment_id, filename, size, url

@router.get("/api/attachments/{attachment_id}")
async def download_attachment(attachment_id: int):
    # 파일 스트리밍 반환

@router.delete("/api/attachments/{attachment_id}")
async def delete_attachment(attachment_id: int):
    # 파일 + DB 메타데이터 삭제
```

```python
# models/attachment.py (NEW)
class Attachment(Base):
    __tablename__ = "attachments"
    id = Column(Integer, primary_key=True)
    filename = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_size = Column(Integer)
    mime_type = Column(String)
    # 연결 대상 (polymorphic)
    entity_type = Column(String)   # "workflow_step_document", "checklist_item", "task", etc.
    entity_id = Column(Integer)
    created_at = Column(DateTime, default=func.now())
```

#### B. 워크플로 템플릿 서류에 파일 연결

- `WorkflowStepDocument`에 `attachment_ids: list[int]` (또는 별도 관계 테이블) 추가
- TemplateModal에서 서류 추가 시 파일 업로드 버튼 제공
- 업로드된 파일은 템플릿에 영구 저장 → 인스턴스 실행 시 자동 복제

#### C. 인스턴스에서 파일 다운로드

- 워크플로 인스턴스의 각 단계에서 연결된 파일을 다운로드 가능
- 추가 파일도 업로드 가능 (인스턴스 레벨)

### 2-3. TemplateModal 리디자인

#### A. 섹션 분리 — 시각적 구간

```
┌─────────────────────────────────┐
│ 📝 기본 정보                      │  ← 접기/펼치기 가능 아코디언
│   템플릿 이름 | 카테고리 | 총 기간   │
│   트리거 설명                     │
├─────────────────────────────────┤
│ 📋 단계 (N개)                    │  ← 아코디언, 각 단계도 접기/펼치기
│   ┌─ 1단계: 통지서 발송 ──────┐  │
│   │  시점: D-7 | 예상: 1h     │  │
│   │  ☐ 통지  ☐ 보고           │  │
│   │  📄 서류 (2개)            │  │  ← 서류 섹션이 시각적 카드→내부 리스트
│   │    ├ 소집통지서 [필수] 📎  │  │  ← 📎 = 파일 첨부됨
│   │    └ 의안설명서 [선택]     │  │
│   │  [+ 서류 추가]            │  │  ← 단일 버튼, 클릭 시 인라인 폼
│   │  [↑] [↓] [삭제]          │  │  ← 순서 이동 + 삭제
│   └────────────────────────┘  │
│   [+ 단계 추가]                  │
├─────────────────────────────────┤
│ 📄 공통 서류 (N개)               │  ← 아코디언
├─────────────────────────────────┤
│ ⚠️ 주의사항 (N개)               │  ← 아코디언
└─────────────────────────────────┘
```

#### B. 서류 추가 UX 통합

**현재:** "직접 추가"와 "템플릿에서 선택"이 별도 UI → 혼란

**변경:** 하나의 **[+ 서류 추가]** 버튼 클릭 시 인라인 폼이 나타남:

```
┌─────────────────────────────────┐
│ 서류 추가                         │
│ ┌──────────────────────┐        │
│ │ 서류명: [____________] │        │
│ │ ☐ 필수  시점: [_____]  │        │
│ │ 메모: [______________] │        │
│ │ 📎 파일 첨부: [파일선택] │  ← NEW │
│ │ 🔗 템플릿 연결: [선택▾] │        │
│ │    [추가]  [취소]      │        │
│ └──────────────────────┘        │
└─────────────────────────────────┘
```

- 템플릿 선택은 드롭다운 하나로 통합 (선택하면 서류명 자동 채움)
- 파일 첨부와 템플릿 연결을 동시에 할 수 있음
- 훨씬 직관적

#### C. 단계 순서 변경

- 각 단계에 **[↑] [↓]** 버튼 추가
- 클릭 시 인접 단계와 `order` 교환
- (선택) 드래그앤드롭 지원 (`@hello-pangea/dnd` 또는 순수 JS)

#### D. 라벨 크기 정상화

- `text-[10px]` → `text-xs` (12px) 이상으로 변경
- `form-label` 클래스가 최소 12px 보장

---

## Part 3. 체크리스트 고도화

### 3-1. 현재 문제 분석

**ChecklistsPage.tsx (605줄):**

| 문제 | 위치 | 상세 |
|---|---|---|
| **ItemForm 밀림** | 588줄 | 5열 그리드에 순서/이름/비고/필수/버튼이 한 줄에 → 화면 좁으면 줄바꿈으로 깨짐 |
| **버튼 불균형** | 374~395줄 | 상세 영역에 5개 버튼(업무추가, 워크플로변환, 워크플로→, 수정, 삭제)이 밀집 |
| **자세히보기 무반응** | 283~286줄 | `/workflows?tab=checklists`로 이동하지만 해당 탭 내용이 빈 것으로 보임 |
| **기능 중복** | 전체 | 워크플로 step_documents와 체크리스트가 사실상 같은 역할 |

### 3-2. 결론: 체크리스트 → 워크플로 내 **서류 점검** 기능으로 통합

**현재 체크리스트의 핵심 가치:**
- 특정 시점(투자심사, 결산 등)에 필요한 항목을 나열/체크하는 기능
- 이것은 워크플로의 `step_documents` 체크 기능과 동일

**통합 방안:**

| 기존 체크리스트 기능 | 워크플로 내 대응 |
|---|---|
| 체크리스트 이름/카테고리 | 워크플로 템플릿 이름/카테고리 |
| 체크리스트 항목 | 워크플로 단계의 step_documents |
| 항목 체크 | step_documents의 `checked` |
| 투자건 연결 | 워크플로 인스턴스의 `investment_id` |

### 3-3. 구현 내용

#### A. 체크리스트 → 워크플로 변환 강화

현재 `buildWorkflowTemplateFromChecklist` 함수(58~93줄)가 존재하지만 기본적.
- 변환 시 체크리스트 항목을 **step_documents**로도 변환 (현재는 단계명으로만 변환)
- 변환 후 원본 체크리스트에 "변환 완료" 라벨 표시 (현재 구현됨)

#### B. ChecklistsPage UX 수정

1. **ItemForm 레이아웃 개선:** 5열 → 2열 또는 스택 형태로 변경, 줄바꿈 방지
2. **버튼 정리:** 주요 액션(수정, 삭제)만 직접 표시, 나머지는 `···` 더보기 메뉴로 이동
3. **"자세히보기" 수정:** 클릭 시 체크리스트 상세를 인라인 확장하거나, 워크플로 변환 가이드 표시
4. **전체 레이아웃:** 버튼 크기 통일, 여백 정규화, 텍스트 줄바꿈 방지

#### C. 워크플로 내 체크리스트 탭 개선

현재 워크플로 페이지의 `checklists` 탭:
- embedded 모드로 ChecklistsPage 렌더링 → 동일한 UX 문제 존재
- 헤더에 "(레거시)" 표시 + "워크플로 통합" 안내 배너 존재

**개선:**
- 배너 문구를 더 명확하게: "체크리스트 항목을 워크플로 서류 점검으로 전환하면 단계별 서류 확인 + 리마인드를 함께 활용할 수 있습니다."
- 변환 버튼을 더 눈에 띄게 배치
- 이미 변환된 체크리스트는 회색 처리 + 연결된 워크플로 템플릿 링크 표시

---

## Files to modify / create

| # | Type | Target | Description |
|---|---|---|---|
| 1 | **[NEW]** | `backend/models/periodic_schedule.py` | PeriodicSchedule 모델 |
| 2 | **[NEW]** | `backend/routers/periodic_schedules.py` | 정기 업무 CRUD + 연간 생성 API |
| 3 | **[NEW]** | `backend/models/attachment.py` | Attachment 모델 (파일 첨부) |
| 4 | **[NEW]** | `backend/routers/attachments.py` | 파일 업로드/다운로드/삭제 API |
| 5 | **[MODIFY]** | `backend/routers/workflows.py` | 기본 워크플로 시드 데이터 + 정기 업무 인스턴스 생성 연결 |
| 6 | **[MODIFY]** | `frontend/src/pages/WorkflowsPage.tsx` | (1) TemplateModal 리디자인 — 아코디언 섹션, 서류추가 통합, ↑↓ 순서, 라벨 크기, (2) 정기 업무 탭 추가, (3) 체크리스트 탭 개선 |
| 7 | **[MODIFY]** | `frontend/src/pages/ChecklistsPage.tsx` | ItemForm 레이아웃, 버튼 정리, 자세히보기 수정 |
| 8 | **[MODIFY]** | `frontend/src/lib/api.ts` | 정기 업무/파일첨부 API 함수 + 타입 추가 |
| 9 | **[MODIFY]** | `frontend/src/components/dashboard/DashboardDefaultView.tsx` | 임박 정기 업무 표시 |
| 10 | **[MODIFY]** | `frontend/src/components/dashboard/DashboardRightPanel.tsx` | 보고/통지 탭에 정기 업무 포함 |
| 11 | **[NEW]** | `backend/uploads/` (디렉토리) | 업로드 파일 저장 위치 |
| 12 | **[NEW]** | Alembic 마이그레이션 | periodic_schedules + attachments 테이블 DDL |

---

## Acceptance Criteria

### Part 0 — 전수조사
- [ ] **AC-00:** 코드 구현 전 Part 0-2의 조사 체크리스트 전항목 확인 완료 후 작업 시작.

### Part 1 — 정기 업무 캘린더
- [ ] **AC-01:** 분기보고(4회)/영업보고(2회)/정기사원총회(1회) 정기 항목이 PeriodicSchedule에 등록된다.
- [ ] **AC-02:** 연간 생성 API로 모든 활성 조합에 워크플로 인스턴스가 자동 생성된다.
- [ ] **AC-03:** 정기사원총회는 LLC 유한회사 조합에만 생성된다 (벤처투자회사 제외).
- [ ] **AC-04:** 자동 생성 Task에 `category`, `is_notice`/`is_report`, `deadline`이 올바르게 설정된다.
- [ ] **AC-05:** 대시보드 배너/통지/보고 탭에 임박 정기 업무가 표시된다.
- [ ] **AC-06:** CalendarPage + MiniCalendar에 정기 업무 일정이 표시된다.
- [ ] **AC-07:** 정기 업무 관리 UI에서 CRUD + 연간 뷰가 동작한다.

### Part 2 — 워크플로 UX
- [ ] **AC-08:** TemplateModal이 아코디언 섹션(기본정보/단계/서류/주의사항)으로 분리된다.
- [ ] **AC-09:** 서류 추가가 단일 폼(서류명+필수+시점+메모+파일첨부+템플릿연결)으로 통합된다.
- [ ] **AC-10:** 단계 순서를 ↑↓ 버튼으로 변경할 수 있다.
- [ ] **AC-11:** 라벨이 최소 12px 이상으로 표시된다.
- [ ] **AC-12:** 파일 업로드/다운로드가 동작한다. 템플릿에 첨부한 파일이 인스턴스에서 다운로드된다.

### Part 3 — 체크리스트
- [ ] **AC-13:** ChecklistsPage ItemForm이 정상 레이아웃으로 표시된다 (줄바꿈 없음).
- [ ] **AC-14:** 상세 영역 버튼이 주요 액션 외 더보기 메뉴로 정리된다.
- [ ] **AC-15:** "자세히보기" 클릭 시 의미 있는 UI 반응이 있다.
- [ ] **AC-16:** 체크리스트→워크플로 변환 시 step_documents로도 변환된다.

### 공통
- [ ] **AC-17:** Phase 31~31_4의 모든 기능 유지.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. Q1~Q4 칸반 구조 — 그대로 유지
3. 기존 워크플로 데이터 구조 (WorkflowTemplate, WorkflowStep 등) — 유지 (확장만)
4. 기존 `documents.py` API 시그니처 — 유지 (확장만)
5. Phase 31~31_4의 기존 구현 — 보강만, 삭제/재구성 금지
6. 체크리스트 데이터 삭제 금지 — 기존 체크리스트는 유지하되 워크플로 변환 유도
