# VC ERP 프론트엔드 UX/UI 전체 개선 전략

> 작성일: 2026-03-01
> 분석 범위: 35개 페이지, 47개 컴포넌트, index.css 디자인 토큰
> 목표: 1인 VC 관리자가 빠르고 정확하게 업무를 처리할 수 있는 UI/UX 달성

---

## 목차

1. [현재 UX/UI 진단 요약](#1-현재-uxui-진단-요약)
2. [크로스 페이지 일관성 문제](#2-크로스-페이지-일관성-문제)
3. [페이지별 상세 개선점](#3-페이지별-상세-개선점)
4. [디자인 시스템 정비 계획](#4-디자인-시스템-정비-계획)
5. [인터랙션 패턴 통일](#5-인터랙션-패턴-통일)
6. [정보 구조 개선](#6-정보-구조-개선)
7. [모바일/반응형 전략](#7-모바일반응형-전략)
8. [접근성 개선](#8-접근성-개선)
9. [성능 최적화](#9-성능-최적화)
10. [실행 로드맵](#10-실행-로드맵)

---

## 1. 현재 UX/UI 진단 요약

### 1.1 점수 카드

| 영역 | 현재 | 목표 | 핵심 이슈 |
|------|------|------|-----------|
| **디자인 일관성** | ★★☆☆☆ | ★★★★☆ | 페이지마다 버튼/색상/간격 다름 |
| **정보 계층** | ★★★☆☆ | ★★★★☆ | 중요 정보와 부가 정보 구분 약함 |
| **폼 사용성** | ★★☆☆☆ | ★★★★☆ | 7칼럼 인라인 폼, window.prompt() 남용 |
| **네비게이션** | ★★★☆☆ | ★★★★☆ | 키보드 접근성 부재, 모바일 메뉴 부족 |
| **피드백/상태 표시** | ★★☆☆☆ | ★★★★☆ | 로딩/에러/성공 표시 불일관 |
| **모바일 대응** | ★★☆☆☆ | ★★★★☆ | 테이블 오버플로우, 필터 패널 과다 |
| **접근성 (a11y)** | ★☆☆☆☆ | ★★★☆☆ | ARIA 라벨 부재, 색상 의존 |
| **성능** | ★★★☆☆ | ★★★★☆ | 코드 스플리팅 없음, 35페이지 초기 로드 |

### 1.2 가장 심각한 UX 문제 TOP 5

| 순위 | 문제 | 영향받는 페이지 | 사용자 영향 |
|------|------|----------------|-------------|
| 1 | **`window.prompt()` 사용** | Exits, Users, Calendar, Transactions | 디자인 시스템 파괴, 접근성 위반, 유효성 검증 불가 |
| 2 | **테이블 내 인라인 폼** | BizReports, Calendar, Documents, Accounting | 저장 시점 불명확, 스캔성 파괴, 실수 유발 |
| 3 | **색상만으로 상태 구분** | Documents, BizReports, Valuations, Tasks | 색맹 사용자 배제, WCAG 위반 |
| 4 | **7칼럼 인라인 LP 폼** | Funds, FundDetail | 모바일 완전 파괴, 라벨 10px로 읽기 불가 |
| 5 | **필터 과다 (8개+)** | TaskBoard, Transactions, BizReports | 인지 부하 과다, 필터 우선순위 불명확 |

---

## 2. 크로스 페이지 일관성 문제

### 2.1 버튼 스타일링 불일치

```
현재 상황:
┌──────────────┬──────────────────────────────────────────────┐
│ TaskBoard    │ bg-emerald-600 hover:bg-emerald-700 (완료)   │
│              │ border-red-200 bg-red-50 text-red-700 (삭제)  │
├──────────────┼──────────────────────────────────────────────┤
│ FundsPage    │ primary-btn (CSS 클래스)                      │
├──────────────┼──────────────────────────────────────────────┤
│ Investments  │ danger-btn (CSS 클래스)                       │
├──────────────┼──────────────────────────────────────────────┤
│ Exits        │ secondary-btn + 커스텀 bg (혼합)              │
├──────────────┼──────────────────────────────────────────────┤
│ BizReports   │ Tailwind 직접 사용 (일관성 없음)              │
└──────────────┴──────────────────────────────────────────────┘

개선 방향:
  모든 페이지에서 CSS 유틸리티 클래스만 사용
  - primary-btn: 주요 액션 (저장, 생성, 확인)
  - secondary-btn: 보조 액션 (취소, 닫기)
  - danger-btn: 위험 액션 (삭제, 비활성화)
  - ghost-btn: 부가 액션 (필터, 더보기)
  - btn-sm, btn-xs: 크기 변형
```

### 2.2 모달 vs 인라인 편집 혼재

```
현재 편집 패턴 (페이지별):

  UsersPage       → 모달 (fixed overlay)        ✓ 일관적
  CalendarPage    → 테이블 행 내 인라인 폼       ✗ 스캔성 파괴
  ExitsPage       → 행 내 토글 편집 (3단 중첩)   ✗ 과도한 깊이
  AccountingPage  → 인라인 행 편집 (클릭 활성화)  ✗ 2클릭 필요
  BizReportsPage  → onBlur 즉시 저장             ✗ 저장 시점 불명확
  DocumentsPage   → select 즉시 반영             ✗ 실수 복구 불가

개선 원칙:
  [1] 단일 필드 변경 → Inline Select/Toggle + 확인 토스트
  [2] 2~4 필드 변경 → Popover 또는 작은 모달
  [3] 5+ 필드 변경 → 전용 모달 또는 Drawer
  [4] 중첩 데이터 편집 → Drawer (측면 패널)
```

### 2.3 날짜/금액 포맷 불일치

```
날짜 표시:
  - 일부: toLocaleDateString('ko-KR') → "2026. 3. 1."
  - 일부: YYYY-MM-DD 직접 표시 → "2026-03-01"
  - 일부: 상대 시간 → "3일 전"

금액 표시:
  - 일부: formatKRW() 함수
  - 일부: toLocaleString('ko-KR') 직접 호출
  - 일부: 원화 기호 있음 (₩), 일부 없음
  - 일부: 만원/억 단위 변환, 일부: 원 단위 그대로

개선: 공통 포맷 유틸리티 강제 사용
  formatDate(date, style)    → '2026.03.01' | '3/1(월)' | '3일 전'
  formatAmount(amount, unit) → '₩1,234,567' | '12.3억' | '1,234천'
```

### 2.4 삭제/비활성 확인 불일치

```
현재:
  CalendarPage   → window.confirm("정말 삭제하시겠습니까?")
  ExitsPage      → window.confirm()
  AccountingPage → window.confirm()
  UsersPage      → 토스트 알림 (확인 없이 바로 실행)
  DocumentsPage  → 확인 없이 상태 즉시 변경

개선: 통일된 ConfirmDialog 컴포넌트
  <ConfirmDialog
    title="거래 삭제"
    message="이 거래를 삭제하면 관련 분개도 함께 삭제됩니다."
    confirmLabel="삭제"
    variant="danger"
    onConfirm={handleDelete}
  />
```

### 2.5 로딩/에러 상태 불일치

```
현재:
  Dashboard    → 부분 로딩 표시 (사이드바만)
  TaskBoard    → PageLoading 컴포넌트
  BizReports   → isLoading && '로딩 중...' 텍스트
  Documents    → 로딩 상태 없음 (mutation 중)
  Transactions → 필터 변경 시 피드백 없음

개선 계층:
  [1] 페이지 최초 로드 → 스켈레톤 로더 (PageSkeleton)
  [2] 데이터 갱신 중 → 섹션 상단 프로그레스 바
  [3] Mutation 진행 → 버튼 로딩 스피너 + disabled
  [4] 에러 발생 → 인라인 에러 배너 + 재시도 버튼
  [5] 빈 상태 → EmptyState 컴포넌트 (아이콘 + 안내 + CTA)
```

---

## 3. 페이지별 상세 개선점

### 3.1 대시보드 (DashboardPage)

**현재 문제:**
- 11개 useState로 모달 상태 관리 → 인지 부하
- DashboardOverlayLayer에 19+ props 전달 (prop drilling)
- 긴급 항목과 일반 태스크 시각적 구분 약함

**개선안:**

```
Before:                              After:
┌─────────────────────┐             ┌─────────────────────┐
│ 오늘 태스크 (5)      │             │ ⚡ 긴급 알림 (2건)    │ ← 최상단 배너
│  □ 태스크1           │             │  ! 출자금 콜 D-day   │
│  □ 태스크2           │             │  ! VICS 보고 기한    │
│  □ 태스크3           │             ├─────────────────────┤
│                      │             │ 💰 자금 현황         │ ← 핵심 KPI
│ 내일 태스크 (3)      │             │  1호: 잔여 12억      │
│  □ ...               │             │  2호: 잔여 25억      │
├─────────────────────┤             ├─────────────────────┤
│ 워크플로우            │             │ 📋 오늘 (4건 · 3h)  │ ← 시간 예측
│  진행중 3건           │             │  □ 투심위 안건 (2h)  │
│                      │             │  □ A사 보고서 (30m)  │
│ 펀드 요약             │             ├─────────────────────┤
│  1호: 100억           │             │ 📅 이번 주 주요      │
│  2호: 50억            │             │  3/3 총회 | 3/5 공시 │
└─────────────────────┘             └─────────────────────┘

핵심 변경:
  1. 모달 상태 → useReducer + ModalState enum 통합
  2. 긴급 알림 최상단 배너 (빨간 배경, 즉시 액션 버튼)
  3. 자금 현황 카드 추가 (현금흐름 예측 연결)
  4. 오늘 태스크에 예상 소요시간 합계 표시
  5. prop drilling → Context 또는 compound component 패턴
```

### 3.2 태스크 보드 (TaskBoardPage)

**현재 문제:**
- 필터 8개+ 가 헤더에 나열 → 인지 부하 과다
- 긴급 태스크에 2px 빨간 테두리 + 빨간 배경 → 시각적 과잉
- 체크박스가 hover에서만 표시 → 터치 디바이스에서 사용 불가
- 드래그 앤 드롭 어포던스 없음

**개선안:**

```
필터 영역 개선:
  Before: [보드|캘린더|파이프라인] [전체|대기|진행|완료] [전체|오늘|이번주|지난것]
          [2026▼] [전체 월▼] [조합 전체▼] [카테고리 관리]

  After:  [보드|캘린더|파이프라인]  [필터 (3) ▼]  [정렬: 마감일순 ▼]
                                      │
                                      ├── 상태: [전체|대기|진행|완료]
                                      ├── 기한: [전체|오늘|이번주|지난것]
                                      ├── 기간: [2026] [전체 월]
                                      ├── 조합: [전체 ▼]
                                      └── 카테고리: [관리 ▼]

태스크 카드 긴급 표시 개선:
  Before: border-2 border-red-600 bg-red-200 (전체 카드 빨간색)
  After:  border-l-4 border-l-red-500 (좌측 바만 빨간색) + 🔴 아이콘

체크박스 개선:
  Before: opacity-0 group-hover:opacity-100 (터치 불가)
  After:  항상 표시 (모바일) | hover 시 표시 (데스크톱)
          + 상단에 "선택 모드" 토글 버튼

드래그 앤 드롭:
  + 카드 좌측에 ⠿ (그립 아이콘) 표시
  + 드래그 시 카드 반투명 + 목표 영역 하이라이트
  + "Q1으로 이동" 툴팁 표시
```

### 3.3 펀드 관리 (FundsPage + FundDetailPage)

**현재 문제:**
- LP 폼이 7칼럼 그리드 → 모바일 파괴, 라벨 10px
- 펀드 카드에 편집/삭제 버튼 없음 → 어포던스 부재
- FundDetail 8개 탭에 편집 모달이 중첩

**개선안:**

```
LP 입력 개선:
  Before: 7칼럼 인라인 (LP명|유형|약정|납입|사업자번호|연락처|주소)
          라벨 text-[10px], 모바일에서 읽기 불가

  After:  LP 카드 리스트
          ┌──────────────────────────────┐
          │ (주)한국투자  [개인 ▼]  [✏️] [🗑️] │
          │ 약정: ₩5,000,000,000         │
          │ 납입: ₩2,000,000,000 (40%)   │
          │ ████████░░░░░░░░░░░ 40%      │
          │ 사업자번호: 123-45-67890      │
          └──────────────────────────────┘
          [+ LP 추가] ← 클릭 → Drawer 열림

LP 추가/편집 Drawer:
  ┌─ LP 정보 입력 ─────────────┐
  │ LP명: [주소록에서 검색... ▼] │ ← 자동완성
  │ 유형: [개인 ▼]              │
  │ 약정금액: [₩ 5,000,000,000] │
  │ 사업자번호: [자동채움]       │
  │ 연락처: [자동채움]           │
  │ 주소: [자동채움]             │
  │                             │
  │ [취소]          [저장]       │
  └─────────────────────────────┘

펀드 카드 개선:
  + hover 시 편집/삭제/복제 아이콘 표시
  + 카드 하단에 주요 지표 (LP 수, 약정총액, 납입률)
  + 클릭 → FundDetail 페이지로 이동 (명확한 화살표 아이콘)
```

### 3.4 워크플로우 (WorkflowsPage)

**현재 문제:**
- 단계 문서 폼이 아코디언 중첩 → 5단계 문서 수정 시 5번 열어야 함
- 첨부파일 관리가 여러 레벨에 분산
- 복잡한 nested state (ensureStepDocDraft 등)

**개선안:**

```
단계 편집 개선:
  Before: 아코디언 → 단계1 열기 → 문서 탭 → 문서1 열기 → 편집
          (4클릭, 콘텐츠 가려짐)

  After:  단계 목록 (좌측) | 단계 상세 (우측 Drawer)
          ┌─────────────┬──────────────────────┐
          │ ① 투심위 준비 │ ▶ 투심위 준비          │
          │ ② 자료 제출  │                        │
          │ ③ 심의       │ 타이밍: D-7             │
          │ ④ 의결       │ 예상소요: 2h            │
          │ ⑤ 통보       │ 사분면: Q1              │
          │              │                        │
          │              │ 📎 필요 문서 (2건)       │
          │              │  □ 투자검토보고서 (필수)  │
          │              │  □ 재무제표 (선택)       │
          │              │  [+ 문서 추가]           │
          │              │                        │
          │ [+ 단계 추가] │ [저장]    [취소]        │
          └─────────────┴──────────────────────┘

핵심:
  1. 좌측 단계 목록에서 클릭 → 우측에 해당 단계 상세 표시
  2. 문서 추가/편집이 같은 화면에서 처리
  3. 아코디언 중첩 제거 → 단일 계층 구조
```

### 3.5 엑시트 (ExitsPage)

**현재 문제:**
- 위원회 → 펀드연결 → 펀드항목 편집이 3단 중첩
- 정산 시 `window.prompt()`로 금액/날짜 입력
- 정산 후 LP 배분생성 버튼 출현이 예측 불가

**개선안:**

```
정산 플로우 개선:
  Before: window.prompt("정산 금액?") → window.prompt("정산일?")
  After:  정산 모달
          ┌─ 매매 정산 처리 ─────────────┐
          │                               │
          │ 매매: A사 Series B 주식 매각    │
          │ 매매금액: ₩500,000,000        │
          │                               │
          │ 정산금액: [₩ ____________]     │
          │ 정산일:   [2026-03-01    ]     │
          │                               │
          │ ⚠️ 정산 완료 시 LP 배분을       │
          │    자동으로 생성할 수 있습니다.  │
          │    □ 정산 후 LP 배분 자동생성   │
          │                               │
          │ [취소]           [정산 처리]    │
          └────────────────────────────────┘

위원회 편집 개선:
  Before: 아코디언 → 펀드 행 → 인라인 폼 (3단 중첩)
  After:  위원회 클릭 → Drawer 패널 (우측)
          Drawer 내에서 펀드 연결 카드 리스트로 관리
```

### 3.6 사업보고서 (BizReportsPage)

**현재 문제:**
- 서류수집 매트릭스가 이모지 버튼(✅📥📨⬜)으로만 구성 → 접근성 위반
- 요청 목록에서 재무 데이터 onBlur 즉시 저장 → 저장 시점 불명확
- 이상치 감지 결과가 인라인으로 삽입 → 놓치기 쉬움

**개선안:**

```
서류수집 매트릭스 개선:
  Before: ✅ 📥 📨 ⬜ (이모지, 텍스트 없음)
  After:  완료✓  수신📥  발송📨  미처리○  (텍스트 + 아이콘)
          + 셀 hover → 툴팁 ("재무제표 - 완료 (2026.02.28)")
          + 색상 + 아이콘 + 텍스트 3중 표시

재무 데이터 입력 개선:
  Before: onBlur → 즉시 DB 저장 (피드백 없음)
  After:  입력 필드 변경 → 우측에 "저장" 버튼 표시
          저장 클릭 → 스피너 → ✓ 체크 아이콘
          또는: 하단에 "변경사항 저장" 플로팅 바

이상치 알림 개선:
  Before: 인라인 섹션 (스크롤 필요)
  After:  감지 시 토스트 알림 → 전용 패널에 표시
          심각도별 색상 (🔴 critical / 🟡 warning / 🔵 info)
```

### 3.7 회계 (AccountingPage)

**현재 문제:**
- 계정과목 폼 7칼럼 인라인 → 모바일 불가
- 인라인 편집 시 2클릭 필요 (수정 버튼 → 필드 활성화)
- 차변/대변 불균형 시 시각적 피드백 약함

**개선안:**

```
분개 전표 불균형 경고 강화:
  Before: 합계 숫자 색상만 변경
  After:  ┌─ ⚠️ 차대 불일치 ──────────────────────┐
          │ 차변 합계: ₩10,000,000                   │
          │ 대변 합계: ₩ 8,000,000                   │
          │ 차이: ₩2,000,000                         │
          │ → 저장할 수 없습니다. 차대를 일치시켜주세요. │
          └──────────────────────────────────────────┘
          + 저장 버튼 disabled + 빨간 테두리
```

### 3.8 LP 관리 (LPManagementPage)

**현재 문제:**
- 테이블 11칼럼 → 수평 스크롤 심각
- 연계 조합 칼럼에 배지 과다 표시
- 비활성/재활성 버튼이 상태에 따라 레이아웃 시프트

**개선안:**

```
테이블 칼럼 우선순위화:
  데스크톱 (11칼럼): 이름, 유형, 사업자번호, 연락처, 약정액, 납입액, 진행률, 출자잔액, 연계조합, 상태, 작업
  태블릿 (6칼럼):   이름, 유형, 약정액, 납입액, 진행률, 작업
  모바일 (카드형):   이름 + 유형 배지
                    약정 ₩5,000,000,000
                    납입 ₩2,000,000,000 (40%)
                    ████████░░ 40%
                    [상세보기]

연계 조합 표시 개선:
  Before: [1호펀드] [2호펀드] [3호펀드] +2개 (배지 줄바꿈)
  After:  3개 조합 · [모두 보기] ← 클릭 → Popover 목록
```

### 3.9 사용자 관리 (UsersPage)

**현재 문제:**
- 권한 체크박스가 54개 라우트를 2칼럼 그리드 → 매우 김
- 비밀번호 초기화에 window.prompt() 사용
- 초대 모달과 사용자 모달 크기 불일치

**개선안:**

```
권한 관리 개선:
  Before: 54개 체크박스 평면 나열
  After:  카테고리별 그룹핑
          ┌─ 접근 권한 설정 ─────────────────────┐
          │                                       │
          │ 📊 대시보드 & 태스크                    │
          │   ☑ 대시보드  ☑ 태스크  ☑ 워크플로우    │
          │   ☑ 업무일지  ☑ 캘린더                 │
          │                                       │
          │ 💰 펀드 관리                            │
          │   ☑ 펀드  ☑ 투자  ☑ 자본금콜  ☑ 배분   │
          │   ☑ 엑시트  ☑ 밸류에이션               │
          │                                       │
          │ 📋 보고 & 컴플라이언스                   │
          │   ☐ 사업보고서  ☐ 컴플라이언스  ☐ VICS  │
          │   ☐ 내부검토                            │
          │                                       │
          │ [전체 선택] [전체 해제]                  │
          └─────────────────────────────────────────┘
```

### 3.10 로그인 (LoginPage)

**현재 문제:**
- placeholder만 사용 (라벨 없음) → 접근성 위반
- 에러 메시지 위치가 폼과 분리
- 링크(회원가입, 비밀번호 찾기)가 text-xs로 너무 작음

**개선안:**

```
  Before:                        After:
  ┌──────────────────┐          ┌──────────────────┐
  │ [아이디 또는 이메일]│          │ 아이디 또는 이메일  │ ← 라벨
  │ [비밀번호       ] │          │ [                ] │
  │                  │          │ 비밀번호           │ ← 라벨
  │ [로그인]         │          │ [        ] [👁]   │ ← 비밀번호 표시 토글
  │                  │          │                    │
  │ 회원가입 비번찾기  │          │ ⚠ 아이디 또는 비밀번호│ ← 인라인 에러
  └──────────────────┘          │   가 올바르지 않습니다│
                                │                    │
                                │ [로그인]            │
                                │                    │
                                │ ── 또는 ──         │
                                │ [G Google로 로그인] │
                                │                    │
                                │ 회원가입 · 비밀번호 찾기│ ← text-sm
                                └──────────────────────┘
```

---

## 4. 디자인 시스템 정비 계획

### 4.1 디자인 토큰 정리

현재 `index.css`의 CSS 변수 체계는 잘 구축되어 있으나, **실제 페이지에서 직접 Tailwind 클래스를 사용하는 경우**가 많아 토큰이 무시됨.

```
수정 필요한 패턴:

  ✗ bg-emerald-600 (Tailwind 직접)
  ✓ primary-btn (CSS 유틸리티 클래스)

  ✗ text-red-700 border-red-200 (인라인 색상)
  ✓ danger-btn (시스템 클래스)

  ✗ bg-gray-50 p-4 rounded-lg (조합)
  ✓ card-base (시스템 클래스)
```

### 4.2 신규 공통 컴포넌트 필요 목록

| 컴포넌트 | 용도 | 대체 대상 |
|----------|------|-----------|
| **ConfirmDialog** | 삭제/비활성 확인 | window.confirm(), window.prompt() |
| **FormModal** | 2~6 필드 편집 | 인라인 폼, 즉시 저장 패턴 |
| **FilterPanel** | 접이식 필터 그룹 | 8개+ 필터 나열 |
| **DataTable** | 반응형 테이블 + 정렬 + 페이지네이션 | 페이지마다 다른 테이블 |
| **StatusBadge** | 상태 표시 (아이콘+텍스트+색상) | 색상만 사용하는 tag 클래스 |
| **AmountDisplay** | 금액 포맷팅 + 단위 | 직접 toLocaleString() |
| **DateDisplay** | 날짜 포맷팅 + 상대시간 | 직접 포맷팅 |
| **PageSkeleton** | 페이지별 스켈레톤 로더 | PageLoading 스피너 |
| **InlineEdit** | 단일 필드 인라인 편집 | 전체 행 편집 모드 |
| **CardList** | 모바일용 카드 리스트 (테이블 대체) | 모바일에서 깨지는 테이블 |

### 4.3 색상 시맨틱 정의

```
상태 색상 통일:
  ┌──────────┬──────────┬──────────┬──────────────────┐
  │ 시맨틱   │ 색상     │ 아이콘   │ 사용처             │
  ├──────────┼──────────┼──────────┼──────────────────┤
  │ 위험/에러 │ red      │ ⚠️ / ✕  │ 삭제, 에러, 실패   │
  │ 경고     │ amber    │ ⚡      │ 기한 임박, 주의    │
  │ 성공     │ emerald  │ ✓       │ 완료, 성공, 승인   │
  │ 정보     │ blue     │ ℹ       │ 안내, 진행중       │
  │ 보류     │ gray     │ ○       │ 대기, 미처리       │
  │ 강조     │ purple   │ ★       │ 중요, 프리미엄     │
  ├──────────┼──────────┼──────────┼──────────────────┤
  │ 지연     │ red      │ 🔴      │ D+N일 초과        │
  │ 오늘     │ red      │ ⏰      │ D-day             │
  │ 이번주   │ amber    │ 📅      │ D-1~D-7          │
  │ 여유     │ gray     │ ○       │ D-7 이후          │
  └──────────┴──────────┴──────────┴──────────────────┘

원칙: 색상 + 아이콘 + 텍스트 3중 표시 (접근성)
```

---

## 5. 인터랙션 패턴 통일

### 5.1 CRUD 패턴 표준화

```
생성 (Create):
  간단한 엔티티 (카테고리, 일정) → 인라인 폼 + Enter 키
  복잡한 엔티티 (펀드, 투자)     → 전용 페이지 또는 대형 모달
  중간 엔티티 (태스크, LP)       → Drawer 패널

조회 (Read):
  목록 → 데스크톱: DataTable / 모바일: CardList
  상세 → Drawer 패널 또는 상세 페이지

수정 (Update):
  단일 필드 → InlineEdit (클릭 → 입력 → Enter/Blur 저장)
  다중 필드 → FormModal 또는 Drawer
  전체 수정 → 전용 페이지 (편집 모드)

삭제 (Delete):
  항상 ConfirmDialog 사용
  관련 데이터 영향 안내 ("이 펀드를 삭제하면 LP 5건, 투자 3건이 함께 삭제됩니다")
  되돌리기 옵션 (soft delete + 토스트 "실행 취소" 버튼)
```

### 5.2 네비게이션 패턴

```
주요 흐름 (1인 관리자 데일리):
  로그인 → 대시보드 → 긴급 항목 클릭 → 상세 페이지
                    → 오늘 태스크 클릭 → 태스크 상세 (Drawer)
                    → 워크플로우 클릭 → 워크플로우 인스턴스 (Drawer)

빠른 액션 (Cmd+K 또는 / 키):
  전역 검색 모달 (이미 SearchModal 존재)
  개선: 검색 결과에 "최근 항목", "바로가기" 섹션 추가
        예) "콜" 입력 → "자본금 콜 생성" "최근 콜 목록" 표시

브레드크럼 일관성:
  대시보드 > 펀드 > 1호 펀드 > LP 현황
  대시보드 > 투자 > A사 > 밸류에이션
  → 모든 페이지에서 현재 위치 표시
```

### 5.3 키보드 단축키

```
전역:
  Cmd/Ctrl + K → 전역 검색
  Cmd/Ctrl + N → 빠른 생성 (컨텍스트에 따라 태스크/펀드/투자)
  Escape      → 모달/Drawer 닫기

목록 페이지:
  J/K         → 항목 위/아래 이동
  Enter       → 선택한 항목 열기
  E           → 선택한 항목 편집
  Delete      → 선택한 항목 삭제 (ConfirmDialog)

폼:
  Tab         → 다음 필드
  Shift+Tab   → 이전 필드
  Cmd+Enter   → 폼 제출
  Escape      → 폼 취소
```

---

## 6. 정보 구조 개선

### 6.1 네비게이션 구조 재설계

```
현재 (평면적):
  대시보드 | 태스크 | 워크플로우 | 업무일지 | 펀드 | 투자 | 엑시트 |
  자본금콜 | 배분 | 밸류에이션 | 거래 | 회계 | 수수료 | 컴플라이언스 |
  사업보고서 | VICS | 내부검토 | LP관리 | 문서 | 템플릿 | 캘린더 |
  사용자 | 보고서 | 펀드운영

  → 25+ 메뉴 항목이 너무 많음

개선 (그룹화):
  ┌─ 업무 ─────────────────────┐
  │  📊 대시보드                │
  │  ☐ 태스크                  │
  │  🔄 워크플로우              │
  │  📝 업무일지                │
  │  📅 캘린더                  │
  ├─ 펀드 관리 ────────────────┤
  │  💼 펀드                   │
  │  📈 투자                   │
  │  💰 자본금 콜 & 배분        │ ← 통합
  │  🚪 엑시트                 │
  │  📊 밸류에이션 & 거래        │ ← 통합
  ├─ 재무 ─────────────────────┤
  │  🧾 회계                   │
  │  💵 수수료                  │
  ├─ 보고 & 컴플라이언스 ──────┤
  │  📋 사업보고서              │
  │  ✅ 컴플라이언스             │
  │  📊 VICS & 보고서           │ ← 통합
  │  🔍 내부검토                │
  ├─ 관리 ─────────────────────┤
  │  👥 LP 관리                │
  │  📄 문서 & 템플릿           │ ← 통합
  │  👤 사용자                  │
  └────────────────────────────┘

  25항목 → 15항목 (40% 축소)
```

### 6.2 페이지 정보 밀도 조절

```
원칙: 한 화면에 최대 3개 정보 블록

  Before (FundDetailPage):
    8개 탭 × 각 탭에 폼 + 테이블 + 모달 = 과부하

  After:
    탭 축소: 개요 | 자본 & LP | 투자 | 재무 | 서류
    각 탭: 최대 2개 섹션 (요약 카드 + 상세 테이블)
    상세 편집: Drawer로 분리
```

---

## 7. 모바일/반응형 전략

### 7.1 브레이크포인트 전략

```
현재: 페이지마다 다른 브레이크포인트 사용
개선: 통일된 3단계

  sm (< 768px):  모바일
    - 1칼럼 레이아웃
    - 테이블 → CardList 변환
    - 필터 패널 접이식
    - 네비게이션 → 하단 탭 바 또는 햄버거

  md (768px ~ 1279px):  태블릿
    - 2칼럼 레이아웃
    - 테이블 → 핵심 칼럼만 표시 (나머지 expand)
    - Drawer → 풀스크린 모달

  lg (≥ 1280px):  데스크톱
    - 3칼럼 레이아웃
    - 전체 테이블
    - Drawer → 사이드 패널
```

### 7.2 반응형 테이블 전략

```
DataTable 컴포넌트 동작:

  데스크톱:
    ┌────┬──────┬──────┬──────┬──────┬──────┐
    │ 이름│ 유형  │ 약정  │ 납입  │ 진행률│ 작업  │
    ├────┼──────┼──────┼──────┼──────┼──────┤
    │ A  │ 개인  │ 50억  │ 20억  │ 40% │ ✏🗑 │
    └────┴──────┴──────┴──────┴──────┴──────┘

  모바일:
    ┌───────────────────────────┐
    │ A                    [개인]│
    │ 약정 50억 · 납입 20억      │
    │ ████████░░░░░░░░░ 40%     │
    │                    [⋯ 더보기]│
    └───────────────────────────┘

  구현: columns 정의에 priority 필드 추가
    { key: 'name', priority: 1 }    // 항상 표시
    { key: 'type', priority: 2 }    // 태블릿+
    { key: 'amount', priority: 1 }  // 항상 표시
    { key: 'actions', priority: 1 } // 항상 표시
```

---

## 8. 접근성 개선

### 8.1 즉시 수정 항목

| 문제 | 위치 | 수정 |
|------|------|------|
| placeholder만 사용 (라벨 없음) | LoginPage | 명시적 `<label>` 추가 |
| 색상만으로 상태 구분 | Documents, BizReports, Tasks | 아이콘 + 텍스트 병행 |
| window.prompt() 사용 | Exits, Users, Calendar | ConfirmDialog/FormModal로 교체 |
| 드롭다운 키보드 탐색 불가 | Layout.tsx 네비게이션 | Arrow key 핸들러 추가 |
| 모달 포커스 트래핑 없음 | 모든 모달 | `focus-trap-react` 또는 수동 구현 |
| 이모지만으로 상태 표시 | BizReportsPage 매트릭스 | 텍스트 대체 + sr-only |

### 8.2 ARIA 적용 계획

```
모달/Drawer:
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"

테이블:
  role="table"
  aria-label="펀드 목록"
  aria-sort="ascending" (정렬 칼럼)

상태 배지:
  role="status"
  aria-label="상태: 완료"

알림:
  role="alert"
  aria-live="polite"

네비게이션:
  role="navigation"
  aria-label="주 메뉴"
  aria-expanded="true/false" (드롭다운)
```

---

## 9. 성능 최적화

### 9.1 코드 스플리팅

```typescript
// 현재: 모든 페이지 동기 import
import DashboardPage from './pages/DashboardPage';
import FundsPage from './pages/FundsPage';
// ... 35개 모두 즉시 로드

// 개선: React.lazy + Suspense
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const FundsPage = lazy(() => import('./pages/FundsPage'));

// 라우트 그룹별 청크
// chunk-core: Dashboard, Tasks, Workflows, WorkLogs
// chunk-fund: Funds, FundDetail, Investments, InvestmentDetail
// chunk-financial: Accounting, Transactions, Valuations, Fees
// chunk-compliance: Compliance, BizReports, VICS, InternalReview
// chunk-admin: Users, Documents, Templates, Calendar
```

### 9.2 React Query 최적화

```typescript
// 쿼리 키 상수화
export const queryKeys = {
  tasks: {
    all: ['tasks'] as const,
    board: () => [...queryKeys.tasks.all, 'board'] as const,
    detail: (id: number) => [...queryKeys.tasks.all, id] as const,
  },
  funds: {
    all: ['funds'] as const,
    detail: (id: number) => [...queryKeys.funds.all, id] as const,
    lps: (fundId: number) => [...queryKeys.funds.detail(fundId), 'lps'] as const,
  },
  // ...
} as const;

// staleTime 상수화
export const STALE_TIMES = {
  DASHBOARD: 30 * 1000,      // 30초
  LIST: 60 * 1000,            // 1분
  DETAIL: 5 * 60 * 1000,     // 5분
  STATIC: 30 * 60 * 1000,    // 30분 (카테고리 등)
} as const;
```

### 9.3 렌더링 최적화

```
[1] ErrorBoundary: 페이지별 에러 격리
[2] React.memo: 리스트 아이템 컴포넌트 (TaskCard, FundCard 등)
[3] useMemo: 필터링/정렬 결과 캐싱
[4] useCallback: 이벤트 핸들러 안정화 (특히 리스트 내)
[5] virtualization: 100+ 행 테이블에 react-virtual 적용
```

---

## 10. 실행 로드맵

### Phase U1: 디자인 시스템 기반 (1~2주)

> 목표: 공통 컴포넌트 라이브러리 구축

| 작업 | 파일 | 설명 |
|------|------|------|
| U1-1 | `components/ui/ConfirmDialog.tsx` | window.confirm/prompt 대체 |
| U1-2 | `components/ui/FormModal.tsx` | 표준 편집 모달 |
| U1-3 | `components/ui/StatusBadge.tsx` | 아이콘+텍스트+색상 통합 배지 |
| U1-4 | `components/ui/FilterPanel.tsx` | 접이식 필터 그룹 |
| U1-5 | `components/ui/DataTable.tsx` | 반응형 테이블 + 모바일 카드 |
| U1-6 | `lib/format.ts` | 날짜/금액 통합 포맷 유틸리티 |
| U1-7 | `lib/queryKeys.ts` | 쿼리 키 상수 |
| U1-8 | `lib/constants.ts` | 상태값, 색상 시맨틱 상수 |

### Phase U2: 핵심 페이지 개선 (2~3주)

> 목표: 매일 사용하는 페이지의 UX 품질 향상

| 작업 | 페이지 | 개선 내용 |
|------|--------|-----------|
| U2-1 | DashboardPage | 모달 상태 통합, 긴급 배너, KPI 카드 |
| U2-2 | TaskBoardPage | FilterPanel 적용, 카드 긴급 표시 개선, 체크박스 수정 |
| U2-3 | FundsPage | LP 카드 리스트화, Drawer 편집, 펀드카드 액션 |
| U2-4 | FundDetailPage | 탭 구조 정리, LP Drawer, 폼 라벨 개선 |
| U2-5 | WorkflowsPage | 단계 편집 좌우 분할, 아코디언 제거 |

### Phase U3: 보조 페이지 개선 (2~3주)

> 목표: 전체 앱의 일관성 확보

| 작업 | 페이지 | 개선 내용 |
|------|--------|-----------|
| U3-1 | ExitsPage | 정산 모달 교체, 중첩 편집 Drawer화 |
| U3-2 | BizReportsPage | 매트릭스 접근성, 저장 피드백, 이상치 패널 |
| U3-3 | AccountingPage | 폼 칼럼 정리, 불균형 경고 강화 |
| U3-4 | InvestmentsPage | 반응형 테이블, 편집 모달 분리 |
| U3-5 | CompliancePage | 법률 질의 결과 마크다운 렌더링 |
| U3-6 | LPManagementPage | 반응형 테이블, 연계조합 Popover |
| U3-7 | UsersPage | 권한 그룹핑, 비밀번호 모달, 모달 크기 통일 |
| U3-8 | DocumentsPage | StatusBadge 적용, 인라인 변경 확인 추가 |
| U3-9 | CalendarPage | 이벤트 색상 정리, 편집 모달화 |
| U3-10 | LoginPage | 라벨 추가, 비밀번호 표시 토글, 에러 위치 |

### Phase U4: 폼 시스템 & 성능 (1~2주)

> 목표: 폼 일관성 + 앱 성능 최적화

| 작업 | 설명 |
|------|------|
| U4-1 | react-hook-form + zod 도입 → 주요 폼에 적용 |
| U4-2 | api.ts 도메인별 분리 (10~15개 파일) |
| U4-3 | React.lazy 코드 스플리팅 (라우트 그룹별) |
| U4-4 | ErrorBoundary 페이지별 적용 |
| U4-5 | PageSkeleton 컴포넌트 적용 |

### Phase U5: 고급 UX (2~3주)

> 목표: 전문 ERP 수준의 사용 경험

| 작업 | 설명 |
|------|------|
| U5-1 | 전역 검색 강화 (최근항목, 바로가기, 카테고리) |
| U5-2 | 키보드 단축키 시스템 |
| U5-3 | 네비게이션 재구조화 (25→15 메뉴) |
| U5-4 | 다크 모드 지원 |
| U5-5 | 드래그 앤 드롭 어포던스 & 터치 지원 |
| U5-6 | 접근성 감사 & ARIA 적용 |

---

## 부록: 공통 컴포넌트 상세 스펙

### ConfirmDialog

```typescript
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  detail?: string;            // 영향 범위 설명
  confirmLabel?: string;      // "삭제" | "비활성화" | "확인"
  cancelLabel?: string;       // "취소"
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

// 사용 예:
<ConfirmDialog
  open={showDelete}
  title="펀드 삭제"
  message="1호 조합을 삭제하시겠습니까?"
  detail="LP 5건, 투자 3건, 자본금콜 2건이 함께 삭제됩니다."
  confirmLabel="삭제"
  variant="danger"
  onConfirm={handleDelete}
  onCancel={() => setShowDelete(false)}
/>
```

### StatusBadge

```typescript
interface StatusBadgeProps {
  status: 'success' | 'warning' | 'danger' | 'info' | 'pending' | 'overdue';
  label: string;
  size?: 'sm' | 'md';
}

// 렌더링:
// 🟢 완료    (emerald bg + ✓ icon + "완료" text)
// 🟡 이번주  (amber bg + 📅 icon + "이번주" text)
// 🔴 지연    (red bg + ⚠ icon + "D+3 지연" text)
// 항상 아이콘 + 텍스트 + 색상 3중 표시
```

### FilterPanel

```typescript
interface FilterPanelProps {
  filters: FilterConfig[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  onReset: () => void;
  activeCount: number;  // "필터 (3)" 배지 표시
}

// 데스크톱: 가로 나열 (최대 4개) + "더보기" 드롭다운
// 모바일: "필터 (3)" 버튼 → 바텀시트 or 드롭다운
```

### DataTable

```typescript
interface Column<T> {
  key: string;
  header: string;
  priority: 1 | 2 | 3;       // 1=항상, 2=태블릿+, 3=데스크톱만
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  render?: (row: T) => ReactNode;
  mobileRender?: (row: T) => ReactNode;  // 모바일 카드 내 표시
}

// 데스크톱: 표준 테이블
// 태블릿: priority 1-2만 표시 + expand row
// 모바일: CardList 자동 전환
```

---

## 부록: 우선순위 매트릭스

```
                     낮은 노력                  높은 노력
              ┌────────────────────┬────────────────────┐
              │                    │                    │
   높은       │ U1-1 ConfirmDialog │ U2-1 Dashboard     │
   임팩트     │ U1-3 StatusBadge   │ U2-3 FundsPage LP  │
              │ U1-6 format.ts     │ U2-5 WorkflowsPage │
              │ U3-10 LoginPage    │ U4-1 react-hook-form│
              │                    │ U5-3 Nav 재구조화   │
              ├────────────────────┼────────────────────┤
              │                    │                    │
   낮은       │ U1-7 queryKeys     │ U4-2 api.ts 분리   │
   임팩트     │ U1-8 constants     │ U4-3 코드 스플리팅  │
              │ U3-9 CalendarPage  │ U5-4 다크 모드      │
              │                    │ U5-6 접근성 감사    │
              └────────────────────┴────────────────────┘

  ★ 좌상단 Quick Win부터 실행
  ★ U1 (디자인 시스템) → U2 (핵심 페이지) → U3 (보조) → U4 (기술) → U5 (고급)
```

---

> 이 문서는 2026-03-01 기준 프론트엔드 코드 분석을 바탕으로 작성되었습니다.
> 개선 작업 진행에 따라 업데이트 필요합니다.
