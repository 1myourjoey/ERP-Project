# Phase 63: 태스크 & 워크플로우 UX 개선

> **의존성:** Phase 62 완료
> **근거:** `docs/UXUI_IMPROVEMENT_STRATEGY.md` §3.2, §3.4

**Priority:** P0 — 매일 사용하는 핵심 페이지

---

## Part 1. TaskBoardPage 필터 개선

### 1-1. FilterPanel 적용

#### [MODIFY] `frontend/src/pages/TaskBoardPage.tsx`

기존 8개 필터(뷰탭, 상태, 기한, 연도, 월, 펀드, 카테고리, 검색)를 Phase 60의 FilterPanel로 교체:

- **항상 표시 (visibleCount=3):** 뷰 탭(보드/캘린더/파이프라인), 상태 필터, 검색
- **접이식:** 기한, 연도/월, 펀드, 카테고리
- 활성 필터 수 배지 표시
- "초기화" 버튼

### 1-2. 태스크 카드 긴급 표시 개선

기존: `border-2 border-red-600 bg-red-200` (전체 카드 빨간색)
개선: `border-l-4 border-l-{color}` (좌측 바만) + StatusBadge로 긴급도 표시

```typescript
// 긴급도별 좌측 바 색상
overdue:   'border-l-[var(--color-danger)]'
today:     'border-l-[var(--color-danger)]'
this_week: 'border-l-[var(--color-warning)]'
later:     'border-l-[var(--theme-border)]'
```

### 1-3. 체크박스 터치 디바이스 대응

기존: `opacity-0 group-hover:opacity-100` (터치 불가)
개선:
- 데스크톱: hover 시 표시 (기존 유지)
- 모바일/태블릿: 항상 표시 (`md:opacity-0 md:group-hover:opacity-100`)
- 상단에 "선택 모드" 토글 버튼 추가

### 1-4. 드래그 앤 드롭 어포던스

- 태스크 카드 좌측에 `GripVertical` 아이콘 (Lucide) 표시 (hover 시)
- 드래그 중 카드 반투명 (opacity-70)
- 드롭 대상 사분면 하이라이트 강화 (`ring-2 ring-blue-400 bg-blue-50/30`)

---

## Part 2. WorkflowsPage 단계 편집 개선

### 2-1. 좌우 분할 레이아웃

#### [MODIFY] `frontend/src/pages/WorkflowsPage.tsx`

워크플로우 템플릿 편집 시 아코디언 중첩 제거 → 좌우 분할:

```
좌측 (1/3 너비): 단계 목록
  ├── ① 투심위 준비
  ├── ② 자료 제출
  ├── ③ 심의        ← 선택됨 (하이라이트)
  ├── ④ 의결
  └── [+ 단계 추가]

우측 (2/3 너비): 선택된 단계 상세 편집
  ├── 단계명: [심의          ]
  ├── 타이밍: [D-day    ▼]
  ├── 예상소요: [2h       ]
  ├── 사분면: [Q1 ▼]
  ├── 📎 필요 문서 (2건)
  │   ├── □ 투자검토보고서 (필수) [✏️] [🗑️]
  │   └── □ 재무제표 (선택)     [✏️] [🗑️]
  │   └── [+ 문서 추가]
  ├── ⚠️ 주의사항
  │   └── [+ 추가]
  └── [저장]
```

### 2-2. 단계 순서 변경

좌측 단계 목록에서 드래그로 순서 변경 가능.
`GripVertical` 아이콘 + 드래그 시 리스트 아이템 이동.

### 2-3. 단계 문서 편집 간소화

기존: 아코디언 → 문서 탭 → 문서 열기 → 편집 (4클릭)
개선: 우측 패널에서 문서 목록 바로 표시 → 인라인 편집 또는 작은 모달 (2클릭)

---

## Part 3. 워크플로우 인스턴스 뷰 개선

### 3-1. 타임라인 시각화 강화

워크플로우 인스턴스 상세에서 단계 진행 상황을 시각적 타임라인으로 표시:

```
──●──────●──────◉──────○──────○──
  ✓       ✓     진행중   대기    대기
 D-7     D-3    D-day   D+2    D+5
 준비     제출    심의    의결    통보
```

- `●` = 완료 (green)
- `◉` = 진행중 (blue, pulse 애니메이션)
- `○` = 대기 (gray)
- 각 노드 클릭 → 해당 단계 상세 (문서 체크리스트)

---

## 검증 체크리스트

- [ ] TaskBoardPage: FilterPanel 적용, 접이식 동작, 활성필터 배지
- [ ] 태스크 카드: 좌측 바 색상으로 긴급도 표시 (기존 전체 빨간 배경 제거)
- [ ] 체크박스: 모바일에서 항상 표시
- [ ] 드래그: 어포던스 아이콘 + 드롭 하이라이트
- [ ] WorkflowsPage: 좌우 분할 편집 동작
- [ ] 단계 순서 변경: 드래그 동작
- [ ] 워크플로우 인스턴스: 타임라인 시각화
- [ ] git commit: `feat: Phase 63 task and workflow UX`
