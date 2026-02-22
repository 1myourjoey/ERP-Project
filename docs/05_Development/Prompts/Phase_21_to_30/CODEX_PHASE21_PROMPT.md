# Phase 21: UX/UI 10가지 심리학 법칙 + dotLottie 기반 전체 개선

> **Priority:** P0
> **참고:** [UX/UI의 10가지 심리학 법칙](https://incodom.kr/UX/UI%EC%9D%98_10%EA%B0%80%EC%A7%80_%EC%8B%AC%EB%A6%AC%ED%95%99_%EB%B2%95%EC%B9%99) + [dotLottie](https://dotlottie.io)

---

## A. 10가지 심리학 법칙 요약 및 적용 원칙

| # | 법칙 | 핵심 | 적용 기호 |
|---|------|------|---------|
| 1 | **제이콥의 법칙** | 사용자는 익숙한 디자인 패턴을 기대. 멘탈 모델 부조화 방지 | 🅙 |
| 2 | **피츠의 법칙** | 터치 대상 크기↑, 충분한 거리, 쉬운 도달 영역 배치 | 🅕 |
| 3 | **힉의 법칙** | 선택지 수 최소화, 복잡한 일 분할, 추천 강조 | 🅗 |
| 4 | **밀러의 법칙** | 7±2 덩어리, 콘텐츠를 작은 그룹으로 나누기 | 🅜 |
| 5 | **포스텔의 법칙** | 입력에 관용적, 출력에 엄격. 다양한 입력 수용 | 🅟 |
| 6 | **피크엔드 법칙** | 절정 순간 + 마지막 순간 경험 최적화 | 🅔 |
| 7 | **심미적 사용성 효과** | 보기 좋은 디자인 → 사용성이 뛰어나다고 인식 | 🅐 |
| 8 | **폰 레스토프 효과** | 차이 나는 요소만 기억. 핵심 요소 시각적 강조 | 🅥 |
| 9 | **테슬러의 법칙** | 복잡성 보존 — 시스템이 흡수, 사용자 부담↓ | 🅣 |
| 10 | **도허티 임계** | 0.4초 이내 피드백, 로딩 애니메이션으로 주의 유지 | 🅓 |

---

## B. dotLottie 도입 전략

### B-1. 패키지 설치

```bash
npm install @lottiefiles/dotlottie-react
```

### B-2. 적용 영역 (LottieAnimation 공통 컴포넌트)

```tsx
// [NEW] frontend/src/components/LottieAnimation.tsx
import { DotLottieReact } from '@lottiefiles/dotlottie-react'

interface LottieAnimationProps {
  src: string           // .lottie 파일 경로 또는 URL
  loop?: boolean
  autoplay?: boolean
  className?: string
  speed?: number
}

export default function LottieAnimation({ src, loop = true, autoplay = true, className, speed = 1 }: LottieAnimationProps) {
  return <DotLottieReact src={src} loop={loop} autoplay={autoplay} className={className} speed={speed} />
}
```

### B-3. 필요한 .lottie 애니메이션 파일 목록

| 파일명 | 용도 | 적용 위치 |
|--------|------|---------|
| `loading.lottie` | 전역 로딩 | 모든 페이지 isLoading 상태 |
| `empty-state.lottie` | 빈 상태 | 업무 없음, 데이터 없음 등 |
| `success-check.lottie` | 작업 성공 | Toast, 업무 완료, 저장 |
| `error-alert.lottie` | 에러 발생 | Toast 에러, API 실패 |
| `workflow-progress.lottie` | 워크플로 진행 | 워크플로 카드 진행표시 |
| `confetti.lottie` | 축하/달성 | 업무 전체 완료, 마일스톤 |
| `search-empty.lottie` | 검색 결과 없음 | SearchModal 결과 없음 |
| `calendar-check.lottie` | 일정 완료 | 캘린더 완료 애니메이션 |
| `rocket-launch.lottie` | 워크플로 시작 | 워크플로우 인스턴스 생성 |
| `document-scan.lottie` | 서류 처리 | 서류 수집 상태 |

> **소스:** [LottieFiles](https://lottiefiles.com/) 무료 라이브러리에서 다운로드 후 `frontend/public/animations/` 디렉토리에 배치

---

## C. 페이지별 개선 명세

### C-1. 전역 (Layout, Toast, 로딩)

#### 🅓 도허티 임계 — 로딩 애니메이션 교체

**현재:** `<div className="loading-spinner" />` (CSS 스피너)
**변경:** dotLottie 로딩 애니메이션

```tsx
// 현재 loading-state 패턴 (모든 페이지 공통):
if (isLoading) return <div className="loading-state"><div className="loading-spinner" /></div>

// 변경 후:
if (isLoading) return (
  <div className="loading-state">
    <LottieAnimation src="/animations/loading.lottie" className="w-20 h-20" />
    <p className="mt-2 text-xs text-gray-400">불러오는 중...</p>
  </div>
)
```

적용 대상: DashboardPage, TaskBoardPage, CalendarPage, FundsPage, FundDetailPage, FundOperationsPage, InvestmentsPage, InvestmentDetailPage, WorkflowsPage, DocumentsPage, ReportsPage, TransactionsPage, AccountingPage, ValuationsPage, ExitsPage, BizReportsPage, ChecklistsPage, WorkLogsPage, TemplateManagementPage, FundOverviewPage (전체 20페이지)

#### 🅓 도허티 — Toast 애니메이션

**현재:** Toast는 텍스트만 표시
**변경:** success → `success-check.lottie` (작은 체크 애니메이션), error → `error-alert.lottie`

```tsx
// Toast.tsx 수정
<div className="flex items-center gap-2">
  {type === 'success' && <LottieAnimation src="/animations/success-check.lottie" className="w-6 h-6" loop={false} />}
  {type === 'error' && <LottieAnimation src="/animations/error-alert.lottie" className="w-6 h-6" loop={false} />}
  <span>{message}</span>
</div>
```

#### 🅐 심미적 사용성 — 빈 상태(Empty State) 개선

현재 "업무 없음", "데이터 없음" 등은 단순 텍스트. dotLottie 일러스트로 교체:

```tsx
// 현재:
<p className="text-sm text-gray-400">업무 없음</p>

// 변경 후:
<div className="flex flex-col items-center py-6">
  <LottieAnimation src="/animations/empty-state.lottie" className="w-24 h-24 opacity-60" />
  <p className="mt-2 text-sm text-gray-400">업무 없음</p>
</div>
```

적용 대상: TaskList 빈 상태, 캘린더 날짜 일정 없음, 업무보드 사분면 빈 상태, 검색 결과 없음 등

#### 🅙 제이콥 — 사이드바 네비게이션 일관성

- Layout.tsx 사이드바: 현재 페이지를 확실하게 active 표시 (배경색, 아이콘 강조)
- 모든 페이지에서 헤더 레이아웃 패턴 통일: `page-title` + `page-subtitle` + 우측 액션 버튼

#### 🅕 피츠 — 터치 대상 최소 크기

**전역 CSS 규칙 추가:**

```css
/* index.css */
.primary-btn, .secondary-btn, .danger-btn {
  min-height: 36px;
  min-width: 36px;
  padding: 8px 16px;
}

/* 모든 select, input 최소 높이 */
select, input[type="text"], input[type="date"], input[type="number"], input[type="time"] {
  min-height: 36px;
}
```

---

### C-2. 대시보드 (DashboardPage.tsx)

#### 🅜 밀러 — StatCard 그룹화

현재: 6개 StatCard 일렬 → 밀러 법칙(7±2) 내이므로 적합
**개선:** 의미적 그룹화 — 업무 관련(3개) | 관리 관련(3개) 시각적 구분

```tsx
// 변경:
<div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
  {/* 업무 그룹 — 좌측 3개: 약간 다른 배경 */}
  <StatCard label="오늘 업무" ... />
  <StatCard label="이번 주" ... />
  <StatCard label="오늘 완료" ... variant="emerald" />
  {/* 관리 그룹 — 우측 3개 */}
  <StatCard label="진행 워크플로" ... />
  <StatCard label="미수집 서류" ... />
  <StatCard label="보고 마감" ... />
</div>
```

StatCard 그룹 간 미세한 시각적 구분: 업무 그룹에 좌측 선(accent) 추가 또는 그룹 라벨

#### 🅗 힉 — 업무 현황 패널 전환 단순화

현재: daily/weekly 좌우 전환 + 네비게이션 점
**개선:** 전환 방식을 더 직관적으로:

```tsx
// 변경 전: 좌우 화살표 + 점(dot) 인디케이터
// 변경 후: 탭 방식으로 명확히

<div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
  <button onClick={() => setTaskPanel('daily')} className={`... ${taskPanel === 'daily' ? activeClass : inactiveClass}`}>
    오늘/내일
  </button>
  <button onClick={() => setTaskPanel('weekly')} className={`... ${taskPanel === 'weekly' ? activeClass : inactiveClass}`}>
    이번 주/예정
  </button>
</div>
```

좌우 화살표와 점 인디케이터 제거 → 탭 UI로 교체 (사용자가 현재 위치를 명확히 인지)

#### 🅔 피크엔드 — 업무 완료 축하 애니메이션

**업무 완료 시 "피크" 순간 강화:**

```tsx
// 오늘 업무 전부 완료 시:
{todayTasks.length > 0 && todayTasks.every(t => t.status === 'completed') && (
  <div className="flex flex-col items-center py-4">
    <LottieAnimation src="/animations/confetti.lottie" className="w-32 h-32" loop={false} />
    <p className="text-sm font-medium text-emerald-700">🎉 오늘 업무를 모두 완료했습니다!</p>
  </div>
)}
```

#### 🅥 폰 레스토프 — 긴급 업무 시각적 강조

오늘 마감 + 아직 미완료 업무 → 빨강 띠/테두리로 차별화:

```tsx
// TaskList 내 개별 카드:
<div className={`... ${isOverdue ? 'border-l-4 border-l-red-500 bg-red-50/50' : 'border-gray-200'}`}>
```

#### 🅣 테슬러 — 빠른 추가(QuickAdd) 스마트 기본값

복잡성을 시스템이 흡수:
- 카테고리: 가장 많이 사용하는 카테고리를 자동 선택
- 예상 시간: 최근 업무 평균 시간 자동 입력
- 관련 조합: 마지막 선택한 조합 기억

```tsx
const lastCategory = localStorage.getItem('lastTaskCategory') || ''
const lastFundId = localStorage.getItem('lastTaskFundId') || ''
```

---

### C-3. 업무 보드 (TaskBoardPage.tsx)

#### 🅙 제이콥 — 사분면 레이아웃 관습 유지

현재 아이젠하워 매트릭스(Q1~Q4) 사용 → 일반적으로 익숙한 패턴. **유지하되 라벨 개선:**

```
| 긴급+중요 (Q1)      | 긴급하지 않음+중요 (Q2)    |
| 🔴 지금 해야 할 일  | 🟡 계획할 일              |
|-----------------------------------------------|
| 긴급+중요하지 않음 (Q3) | 중요하지 않음 (Q4)       |
| 🟠 위임 가능한 일    | ⚪ 검토할 일              |
```

각 사분면 헤더에 아이콘 + 색상 배지 일관 적용

#### 🅕 피츠 — 드래그 핸들 + 터치 영역

```tsx
// TaskItem에 드래그 핸들 명확화:
<div className="flex items-center gap-2 cursor-grab active:cursor-grabbing">
  <GripVertical size={14} className="text-gray-300" />
  <span className="flex-1">{task.title}</span>
</div>

// 하단 액션 버튼 최소 크기:
<button className="min-w-[32px] min-h-[32px] p-1.5 ...">
```

#### 🅜 밀러 — AddTaskForm 단계적 표시

현재: 모든 입력 필드 한 번에 표시

**변경:** 핵심 필드 → 확장 필드 2단계:
```
단계 1 (기본 표시):
- 제목 (필수)
- 마감일 + 시간

단계 2 (▸ 추가 옵션):
- 예상 시간
- 관련 조합
- 워크플로 템플릿
```

```tsx
const [showAdvanced, setShowAdvanced] = useState(false)

return (
  <div>
    <input placeholder="제목" ... />
    <div className="flex gap-1">
      <input type="date" ... />
      <select ...>시간</select>
    </div>
    
    <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-xs text-blue-500">
      {showAdvanced ? '▾ 옵션 접기' : '▸ 추가 옵션'}
    </button>
    
    {showAdvanced && (
      <div className="space-y-1 mt-1">
        <TimeSelect ... />
        <select>관련 조합</select>
        <select>워크플로 템플릿</select>
      </div>
    )}
  </div>
)
```

#### 🅟 포스텔 — 업무 생성 입력 관용

- 제목만 입력해도 업무 생성 가능 (나머지 null 허용) — 현재도 동일, **유지**
- 마감일: 자연어 입력 지원 추가 ("내일", "금요일", "다음주 월" → 날짜 자동 변환)

```tsx
// 자연어 날짜 파서 (간단 버전)
function parseNaturalDate(input: string, baseDate: string): string | null {
  const lower = input.trim()
  if (lower === '오늘') return baseDate
  if (lower === '내일') return addDays(baseDate, 1)
  if (lower === '모레') return addDays(baseDate, 2)
  const dayMap: Record<string, number> = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6, '일': 0 }
  // ... 확장 가능
  return null
}
```

#### 🅗 힉 — 완료 필터 선택지 최소화

현재 완료 탭: 연도 + 월 선택. **추천 기본값:**
- 기본: 이번 달 표시 (추가 선택 불필요)
- "전체 보기" 버튼으로 연/월 선택 노출

---

### C-4. 캘린더 (CalendarPage.tsx)

#### 🅙 제이콥 — 표준 캘린더 패턴

현재 월간/리스트 뷰 제공 → 일반적 캘린더 앱 패턴과 일치. **유지**

**개선:** 날짜 선택 시 하단 상세 패널이 부드럽게 전환 (현재 즉시 표시)

```tsx
<div className={`transition-all duration-200 ease-out ${selectedDate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
```

#### 🅥 폰 레스토프 — 오늘 날짜 + 긴급 일정 강조

현재: 오늘 = `bg-blue-50 font-bold`
**강화:** 오늘 셀에 미세한 ring + 오늘 마감 이벤트에 pulse 효과

```tsx
// 오늘 셀:
<div className={`... ${isToday ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>

// 오늘 마감 긴급 이벤트:
<div className={`... ${isUrgent ? 'animate-pulse-gentle' : ''}`}>
```

```css
/* index.css */
@keyframes pulse-gentle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
.animate-pulse-gentle { animation: pulse-gentle 2s ease-in-out infinite; }
```

#### 🅐 심미적 사용성 — 이벤트 색상 체계 개선

현재: 파란(업무)-인디고(일반)-빨강(긴급)-초록(완료)
**개선:** 호버 시 미세한 scale-up + 그림자 추가

```tsx
<div className={`... transition-all hover:scale-[1.02] hover:shadow-sm cursor-pointer ${eventTone(event)}`}>
```

---

### C-5. 조합 관리 (FundsPage, FundDetailPage, FundOperationsPage)

#### 🅜 밀러 — 조합 정보 그룹화

FundForm의 필드들을 의미 단위로 그룹화:

```
그룹 1: 기본 정보 (조합명, 유형, 상태)
그룹 2: 일정 (결성일, 등록일, 만기일, 해산일)
그룹 3: 운용 (GP, Co-GP, 수탁사, 총약정액)
그룹 4: LP 관리
```

각 그룹에 `<fieldset>` + `<legend>` 또는 섹션 헤더 적용:

```tsx
<fieldset className="rounded-lg border border-gray-200 p-4">
  <legend className="px-2 text-sm font-medium text-gray-600">기본 정보</legend>
  {/* 조합명, 유형, 상태 */}
</fieldset>
```

#### 🅗 힉 — FundOperationsPage 탭 정리

현재: 출자/배분/총회 + (Phase 20_2) LP관리. 탭 수 적정(4~5개)
**개선:** 가장 자주 사용하는 탭을 기본 선택 (출자 → 기본)

#### 🅣 테슬러 — LP 추가 시 스마트 기본값

```tsx
// LP 유형: 가장 일반적인 "법인" 기본 선택
const [lpType, setLpType] = useState('법인')

// 출자약정액: 총약정액 ÷ LP 수 자동 계산 제안
const suggestedCommitment = fundCommitment ? Math.floor(fundCommitment / (lps.length + 1)) : ''
```

---

### C-6. 투자 관리 (InvestmentsPage, InvestmentDetailPage)

#### 🅜 밀러 — 투자 목록 정보 밀도 관리

투자 카드에 표시 정보를 핵심 3~5항목으로 제한:
- 회사명 + 투자일 + 투자금액 + 상태 (4개)
- 나머지 정보는 상세 페이지에서

#### 🅐 심미적 사용성 — 투자 상태 배지 디자인

```tsx
const STATUS_BADGE: Record<string, string> = {
  '투자진행': 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
  '투자완료': 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
  '회수중': 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
  '엑시트': 'bg-purple-100 text-purple-700 ring-1 ring-purple-200',
}
```

ring 추가로 미세한 입체감 + 시각적 완성도↑

---

### C-7. 워크플로우 (WorkflowsPage, TemplateManagementPage)

#### 🅣 테슬러 — 템플릿 생성 복잡성 흡수

워크플로 단계 추가 시 기본값 제공:
- 예상 소요일: 이전 단계 기준 자동 계산
- 카테고리: 워크플로 유형에 따라 자동 제안

#### 🅓 도허티 — 워크플로 인스턴스 생성 피드백

```tsx
// 워크플로 인스턴스 생성 성공 시:
<LottieAnimation src="/animations/rocket-launch.lottie" className="w-16 h-16" loop={false} />
<p className="text-sm font-medium text-blue-700">워크플로우가 시작되었습니다!</p>
```

---

### C-8. 서류 관리 (DocumentsPage)

#### 🅥 폰 레스토프 — 미수집 서류 강조

```tsx
// 미수집 상태 시각 차별화:
<div className={`... ${doc.status === 'pending' ? 'border-l-4 border-l-amber-400 bg-amber-50/30' : ''}`}>
```

#### 🅓 도허티 — 서류 상태 변경 즉시 피드백

서류 수집 완료 표시 → `success-check.lottie` 인라인 재생

---

### C-9. 보고 관리 (ReportsPage, BizReportsPage)

#### 🅜 밀러 — 보고 목록을 기간별 그룹화

월간/분기별/연간 보고를 시각적으로 구분:

```tsx
<div className="space-y-4">
  <section>
    <h3 className="text-sm font-semibold text-gray-600">이번 달 보고</h3>
    {/* 해당 월 보고 목록 */}
  </section>
  <section>
    <h3 className="text-sm font-semibold text-gray-600">과거 보고</h3>
    {/* 나머지 */}
  </section>
</div>
```

---

### C-10. 업무 일지 (WorkLogsPage)

#### 🅔 피크엔드 — 일일 업무 마감 요약

하루 업무 일지 완료 시 "오늘의 성과" 요약:

```tsx
<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
  <LottieAnimation src="/animations/calendar-check.lottie" className="w-12 h-12 mx-auto" loop={false} />
  <p className="text-center text-sm font-medium text-emerald-700 mt-2">
    오늘 {completedCount}건의 업무를 완료했습니다!
  </p>
  <p className="text-center text-xs text-emerald-600">총 {totalHours} 시간 업무</p>
</div>
```

---

### C-11. 거래 내역 (TransactionsPage)

#### 🅟 포스텔 — 금액 입력 관용

```tsx
// 금액 입력 시 다양한 형식 수용:
// "1000000", "1,000,000", "100만", "1백만" → 모두 1000000으로 파싱
function parseKoreanAmount(input: string): number | null {
  let clean = input.replace(/,/g, '').replace(/\s/g, '')
  const unitMap: Record<string, number> = { '만': 10000, '백만': 1000000, '천만': 10000000, '억': 100000000 }
  for (const [unit, multiplier] of Object.entries(unitMap)) {
    if (clean.endsWith(unit)) {
      const num = parseFloat(clean.replace(unit, ''))
      return isNaN(num) ? null : num * multiplier
    }
  }
  const num = parseFloat(clean)
  return isNaN(num) ? null : num
}
```

---

### C-12. 결산/회계 (AccountingPage)

#### 🅜 밀러 — 회계 데이터 덩어리화

재무 데이터를 카테고리별로 접을 수 있는 섹션:
```
▼ 자산 (3항목)
  현금 및 현금성 자산: ₩...
  투자 자산: ₩...
  기타 자산: ₩...
▸ 부채 (2항목)
▸ 자본 (2항목)
```

---

### C-13. 밸류에이션 (ValuationsPage) / 엑시트 (ExitsPage)

#### 🅐 심미적 사용성 — 차트/그래프 디자인

- 배경색 트나지 않는 그라데이션
- 호버 시 데이터포인트 확대 + 툴팁

#### 🅥 폰 레스토프 — 핵심 수치 강조

IRR, MOIC 등 핵심 지표에 큰 폰트 + 색상 강조:
```tsx
<div className="text-3xl font-bold text-blue-700">{irr}%</div>
<p className="text-xs text-gray-500">IRR</p>
```

---

### C-14. 검색 (SearchModal.tsx)

#### 🅓 도허티 — 즉시 검색 + 결과 없음 피드백

- 타이핑 시 300ms debounce로 즉시 결과 표시
- 결과 없음 → `search-empty.lottie` 애니메이션

```tsx
{results.length === 0 && searchTerm && (
  <div className="flex flex-col items-center py-8">
    <LottieAnimation src="/animations/search-empty.lottie" className="w-20 h-20 opacity-50" />
    <p className="mt-2 text-sm text-gray-400">'{searchTerm}'에 대한 결과가 없습니다</p>
  </div>
)}
```

#### 🅗 힉 — 검색 결과 카테고리 분류

결과를 유형별로 그룹화: 업무 | 조합 | 투자 | 서류 등

---

### C-15. 체크리스트 (ChecklistsPage)

#### 🅔 피크엔드 — 체크리스트 완료 축하

모든 항목 체크 시:
```tsx
<LottieAnimation src="/animations/confetti.lottie" className="w-16 h-16" loop={false} />
```

#### 🅕 피츠 — 체크박스 터치 영역 확대

```tsx
<label className="flex items-center gap-2 min-h-[36px] px-2 cursor-pointer hover:bg-gray-50 rounded">
  <input type="checkbox" className="w-5 h-5" ... />
  <span>{item.title}</span>
</label>
```

---

### C-16. 파이프라인 (TaskPipelineView.tsx)

#### 🅜 밀러 — 컬럼별 업무 수 관리

컬럼당 표시 업무 수를 5~7개로 제한, 초과 시 "N건 더보기" 접기:

```tsx
const VISIBLE_LIMIT = 6
const visibleTasks = tasks.slice(0, VISIBLE_LIMIT)
const hiddenCount = tasks.length - VISIBLE_LIMIT

{hiddenCount > 0 && (
  <button onClick={() => setExpanded(!expanded)} className="text-xs text-blue-500">
    {expanded ? '접기' : `+${hiddenCount}건 더보기`}
  </button>
)}
```

#### 🅓 도허티 — 업무 이동 애니메이션

드래그 시 부드러운 전환:
```css
.pipeline-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.pipeline-card.dragging {
  transform: scale(1.03);
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
}
```

---

### C-17. CompleteModal (CompleteModal.tsx)

#### 🅔 피크엔드 — 완료 순간 극대화

업무 완료 모달에 성취감 있는 UI:
```tsx
<LottieAnimation src="/animations/success-check.lottie" className="w-16 h-16 mx-auto" loop={false} />
<h3 className="text-lg font-semibold text-emerald-700">업무 완료</h3>
<p className="text-xs text-gray-500">좋은 결과를 만들어냈습니다!</p>
```

#### 🅣 테슬러 — 실제 소요 시간 자동 제안

예상 시간이 있으면 기본값으로 채움:
```tsx
const [actualTime, setActualTime] = useState(task.estimated_time || '')
```

---

### C-18. 문서 편집 (DocumentEditorModal.tsx)

#### 🅟 포스텔 — 다양한 형식 붙여넣기 수용

- 엑셀/워드에서 복사 → 서식 자동 정리
- 들여쓰기, 줄바꿈 등 다양한 입력 수용

---

## D. CSS 디자인 시스템 개선

### D-1. 🅐 심미적 사용성 — 마이크로 인터랙션

```css
/* index.css — 전역 트랜지션 */
.card-base {
  transition: box-shadow 0.2s ease, transform 0.15s ease;
}
.card-base:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

/* 버튼 눌림 효과 */
.primary-btn:active, .secondary-btn:active {
  transform: scale(0.97);
}

/* 모달 진입 애니메이션 */
@keyframes modal-enter {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.modal-content {
  animation: modal-enter 0.2s ease-out;
}

/* 오버레이 페이드인 */
@keyframes overlay-enter {
  from { opacity: 0; }
  to { opacity: 1; }
}
.modal-overlay {
  animation: overlay-enter 0.15s ease-out;
}
```

### D-2. 🅕 피츠 — 일관된 터치 타겟

```css
/* 모든 인터랙티브 요소 최소 크기 */
button, [role="button"], a, select, input[type="checkbox"], input[type="radio"] {
  min-height: 32px;
}

/* 아이콘 버튼 (close, expand 등) */
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  min-height: 32px;
  border-radius: 8px;
  padding: 6px;
  transition: background-color 0.15s ease;
}
.icon-btn:hover {
  background-color: var(--color-gray-100);
}
```

### D-3. 🅥 폰 레스토프 — 포커스 링 개선

```css
/* 키보드 포커스 시 명확한 ring */
:focus-visible {
  outline: 2px solid var(--color-focus-ring, #3b82f6);
  outline-offset: 2px;
  border-radius: 4px;
}
```

---

## E. dotLottie 전용 적용 포인트 총정리

| # | 위치 | 파일 | 애니메이션 | 트리거 |
|---|------|------|----------|--------|
| 1 | 전역 로딩 | 모든 페이지 | `loading.lottie` | `isLoading === true` |
| 2 | Toast 성공 | Toast.tsx | `success-check.lottie` | toast 표시 |
| 3 | Toast 에러 | Toast.tsx | `error-alert.lottie` | toast 표시 |
| 4 | 빈 상태 | 다수 | `empty-state.lottie` | 목록 0건 |
| 5 | 검색 결과 없음 | SearchModal.tsx | `search-empty.lottie` | 결과 0건 |
| 6 | 업무 완료 | CompleteModal.tsx | `success-check.lottie` | 완료 모달 |
| 7 | 전체 완료 축하 | DashboardPage | `confetti.lottie` | 오늘 업무 전부 완료 |
| 8 | 워크플로 시작 | 워크플로 생성 | `rocket-launch.lottie` | 인스턴스 생성 |
| 9 | 체크리스트 완료 | ChecklistsPage | `confetti.lottie` | 전 항목 체크 |
| 10 | 업무 일지 요약 | WorkLogsPage | `calendar-check.lottie` | 일일 마감 |
| 11 | 서류 수집 완료 | DocumentsPage | `document-scan.lottie` | 상태 변경 |

---

## Files to create / modify

| # | Type | File | Changes |
|---|------|------|---------|
| 1 | **[NEW]** | `frontend/src/components/LottieAnimation.tsx` | dotLottie 래퍼 컴포넌트 |
| 2 | **[NEW]** | `frontend/public/animations/*.lottie` | 11종 로티 파일 (LottieFiles에서 다운로드) |
| 3 | **[MODIFY]** | `frontend/src/index.css` | 마이크로 인터랙션, 터치 타겟, 포커스 링, pulse-gentle |
| 4 | **[MODIFY]** | `frontend/src/components/Toast.tsx` | 로티 아이콘 추가 |
| 5 | **[MODIFY]** | `frontend/src/components/CompleteModal.tsx` | 완료 애니메이션 + 시간 자동 제안 |
| 6 | **[MODIFY]** | `frontend/src/components/SearchModal.tsx` | 검색 결과 없음 로티 + 카테고리 분류 |
| 7 | **[MODIFY]** | `frontend/src/pages/DashboardPage.tsx` | StatCard 그룹화, 탭 UI, 축하 애니메이션, 긴급 강조, 스마트 기본값 |
| 8 | **[MODIFY]** | `frontend/src/pages/TaskBoardPage.tsx` | AddTaskForm 2단계, 드래그 핸들, 터치 영역, 자연어 날짜, 완료 필터 |
| 9 | **[MODIFY]** | `frontend/src/pages/CalendarPage.tsx` | 오늘 강조, 이벤트 호버, 전환 애니메이션 |
| 10 | **[MODIFY]** | `frontend/src/pages/FundsPage.tsx` | 필드 그룹화 (fieldset) |
| 11 | **[MODIFY]** | `frontend/src/pages/FundDetailPage.tsx` | 정보 그룹화 |
| 12 | **[MODIFY]** | `frontend/src/pages/FundOperationsPage.tsx` | 탭 기본선택, LP 스마트 기본값 |
| 13 | **[MODIFY]** | `frontend/src/pages/InvestmentsPage.tsx` | 투자 카드 정보 밀도 제한, 상태 배지 |
| 14 | **[MODIFY]** | `frontend/src/pages/InvestmentDetailPage.tsx` | 핵심 수치 강조 |
| 15 | **[MODIFY]** | `frontend/src/pages/WorkflowsPage.tsx` | 인스턴스 생성 로티 피드백 |
| 16 | **[MODIFY]** | `frontend/src/pages/TemplateManagementPage.tsx` | 단계 생성 스마트 기본값 |
| 17 | **[MODIFY]** | `frontend/src/pages/DocumentsPage.tsx` | 미수집 강조, 수집완료 로티 |
| 18 | **[MODIFY]** | `frontend/src/pages/ReportsPage.tsx` | 기간별 그룹화 |
| 19 | **[MODIFY]** | `frontend/src/pages/BizReportsPage.tsx` | 기간별 그룹화 |
| 20 | **[MODIFY]** | `frontend/src/pages/WorkLogsPage.tsx` | 일일 마감 요약 로티 |
| 21 | **[MODIFY]** | `frontend/src/pages/TransactionsPage.tsx` | 금액 입력 관용 파서 |
| 22 | **[MODIFY]** | `frontend/src/pages/AccountingPage.tsx` | 데이터 덩어리화 접기/펼치기 |
| 23 | **[MODIFY]** | `frontend/src/pages/ValuationsPage.tsx` | 핵심 수치 강조 |
| 24 | **[MODIFY]** | `frontend/src/pages/ExitsPage.tsx` | 핵심 수치 강조 |
| 25 | **[MODIFY]** | `frontend/src/pages/ChecklistsPage.tsx` | 체크박스 터치 영역, 완료 축하 |
| 26 | **[MODIFY]** | `frontend/src/components/Layout.tsx` | 사이드바 active 표시 강화 |
| 27 | **[MODIFY]** | `frontend/src/components/TaskPipelineView.tsx` | 컬럼 업무 수 제한, 드래그 애니메이션 |

---

## Acceptance Criteria

### dotLottie 관련
- [ ] AC-01: `@lottiefiles/dotlottie-react` 설치 완료
- [ ] AC-02: `LottieAnimation` 공통 컴포넌트 생성
- [ ] AC-03: 11종 .lottie 파일 배치 (`public/animations/`)
- [ ] AC-04: 전체 20페이지 로딩 상태 → 로티 교체
- [ ] AC-05: Toast 성공/에러 → 로티 아이콘
- [ ] AC-06: 빈 상태 → 로티 일러스트

### 심리학 법칙 관련
- [ ] AC-07: 🅙 사이드바 active 표시 + 페이지 헤더 일관성
- [ ] AC-08: 🅕 모든 버튼/인풋 min-height 32px+
- [ ] AC-09: 🅗 AddTaskForm 2단계 (기본+추가옵션)
- [ ] AC-10: 🅜 StatCard 의미 그룹화, FundForm fieldset, 회계 접기
- [ ] AC-11: 🅟 금액 한국어 파서, 자연어 날짜 파서
- [ ] AC-12: 🅔 업무 완료 축하, 일일 마감 요약, 체크리스트 완료
- [ ] AC-13: 🅐 card-base 호버 그림자, 버튼 active scale, 모달 애니메이션
- [ ] AC-14: 🅥 긴급 업무 border-l-red, 미수집 서류 amber 강조, 포커스 링
- [ ] AC-15: 🅣 QuickAdd 스마트 기본값(localStorage), LP 자동 계산, 완료 시간 자동 제안
- [ ] AC-16: 🅓 0.4초 이내 피드백 (로티 + transition)

### 공통
- [ ] AC-17: `npm run build` TypeScript 에러 0건
- [ ] AC-18: 기존 기능 전체 정상 동작
- [ ] AC-19: console.log/print 디버깅 코드 없음

---

## 구현 주의사항

1. **dotLottie 파일:** LottieFiles.com 무료 라이브러리에서 비즈니스 스타일 애니메이션 선택. 과도한 컬러/모션 지양.
2. **로티 용량:** 개당 ~50KB 이하 유지. 대용량 시 lazy loading 적용.
3. **마이크로 인터랙션 과다 주의:** 모든 요소에 애니메이션 넣지 말 것. "절제된 움직임"이 핵심. (폰 레스토프: 너무 많은 시각적 차별화 → 집중 불가)
4. **아이콘 의미 혼란 방지 (힉):** 아이콘만으로 의미 전달하지 말고 반드시 레이블 동반
5. **접근성:** 색상에만 의존하는 강조 금지 (폰 레스토프). 폰트 굵기, 크기, 위치도 함께 활용
6. **localStorage 기본값:** 처음 방문 시 기본값 없으면 fallback 처리
7. **자연어 파서:** 한국어 전용. 인식 실패 시 원래 입력 유지 (포스텔: 관용적 수용)
8. **모달 애니메이션:** `prefers-reduced-motion` 미디어 쿼리 대응 → 모션 감소 설정 시 애니메이션 비활성화
9. **기존 스타일 파괴 금지:** CSS 변경은 기존 클래스에 추가/보강만. 기존 스타일 삭제·변경 시 전체 빌드 검증 필수
