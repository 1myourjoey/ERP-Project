# Phase 6 — 전체 UX/UI 통일성 + 나머지 페이지 개선

## 배경 및 목표
Phase 1~5에서 핵심 페이지를 개선한 후, 나머지 모든 페이지에도 동일한 디자인 시스템을
적용하여 일관성을 확보합니다. 또한 전체 사용자 플로우에서 불편한 요소를 제거합니다.

전제: Phase 1~5 완료 후 진행.

## 6-A. 전체 페이지 공통 점검 항목

모든 페이지 (`frontend/src/pages/*.tsx`) 에 대해 아래 항목을 점검 및 수정:

### 6-A-1. 페이지 헤더 통일
모든 페이지의 헤더가 아래 패턴을 사용하는지 확인:
```jsx
<div className="page-header">
  <div>
    <h2 className="page-title">{페이지 제목}</h2>
    <p className="page-subtitle">{설명 (있는 경우)}</p>
  </div>
  {/* 오른쪽 액션 버튼 */}
</div>
```
- 이 패턴에서 벗어난 페이지는 통일
- 이모지 제목 (예: `📌 업무 보드`) → 이모지 제거하고 텍스트만 사용 (`업무 보드`)
  - 단, 이모지가 의미있는 시각 구분을 하는 경우(EmptyState 등)는 유지

### 6-A-2. 카드 통일
- `rounded-lg border bg-white` 스타일이 혼재하는 경우 → `card-base` 클래스로 통일
- 직접 인라인 스타일(`background: 'white', border: '1px solid ...'`) → TailwindCSS 클래스로 대체
- `shadow-lg`, `shadow-2xl` 등 과도한 그림자 → `shadow-sm` 또는 `shadow-md`로 완화

### 6-A-3. 버튼 통일
- 모든 기본 action 버튼 → `primary-btn` / `secondary-btn` / `danger-btn` / `ghost-btn`
- btn 크기 변형 → `btn-sm` / `btn-xs`
- 아이콘만 있는 버튼 → `icon-btn`
- 인라인 스타일로 버튼을 스타일링한 경우 → 위 클래스로 교체

### 6-A-4. 불필요한 라벨 제거 (전체 적용)
**제거 기준**: 다음 조건 **모두** 만족할 때 label 제거 후 placeholder 사용:
- 필드가 하나의 목적만 가짐 (업무명, 검색어, 메모 등)
- 필드 위치/순서로 충분히 맥락 파악 가능
- 폼 전체 필드가 3개 이하

**유지 기준**: 다음 중 하나라도 해당하면 label 유지:
- 날짜 picker / 숫자 입력 (기준월, 기준일 등 맥락 필요)
- 같은 행에 여러 유사 필드가 있는 경우 (단계명 + 오프셋일수 등)
- 체크박스 / 라디오 버튼 (label이 선택지를 설명)
- 5개 이상 필드가 있는 복잡한 폼

### 6-A-5. 공통 입력 스타일
- 모든 `<input>`, `<select>`, `<textarea>` → `form-input` 또는 `form-input-sm` 클래스 사용
- 인라인 스타일로 색/크기가 지정된 input → 클래스로 교체

---

## 6-B. 개별 페이지 주요 수정 사항

### FundsPage (`/funds`)
- 조합 카드 목록: `card-base` 스타일 통일
- 상태 배지: `tag tag-green` (운용 중), `tag tag-gray` (청산 등) 사용
- 펀드 생성 폼 라벨: 단순 필드(`펀드명`, `약칭` 등) → placeholder로 교체

### InvestmentsPage (`/investments`)
- 투자 목록 테이블: `table-head-row`, `table-head-cell`, `table-body-cell` 클래스 통일
- 영문 컬럼명 한글화:
  - `Company` → `피투자기업`
  - `Fund` → `펀드`
  - `Status` → `상태`
  - `Amount` → `금액`
  - `Date` → `일자`

### AccountingPage (`/accounting`)
- 제목 영문 확인 후 한글화
- 테이블 컬럼명 영문 → 한글

### CompliancePage (`/compliance`)
- 탭(법령 준수 현황, 규정 위반 등) 확인 후 영문 잔여 텍스트 한글화
- 카드 스타일 `card-base` 통일

### DocumentsPage (`/documents`)
- 파일 타입 배지 영문 유지 (PDF, DOCX 등 — 파일 포맷명은 영문이 표준)
- 그 외 버튼/상태 텍스트 한글화

### UsersPage (`/users`)
- 역할(role) 표시: `labelRole` 함수 추가 또는 Layout.tsx의 `ROLE_LABEL` 재사용
- `active` / `inactive` 상태 배지 한글화

### CalendarPage (`/calendar`)
- 캘린더 라이브러리가 있다면 locale 설정 한국어로 확인
- 커스텀 텍스트(버튼, 레이블) 한글화

### WorkLogsPage (`/worklogs`)
- 업무 일지 목록 테이블 정렬 확인
- 라벨 정리 (6-A-4 기준 적용)

### MyProfilePage (`/profile`)
- 프로필 편집 폼 라벨 정리
- `"Edit Profile"` 등 영문 텍스트 한글화

---

## 6-C. 모달 통일성 점검

모든 모달 컴포넌트 (`frontend/src/components/**/*.tsx` 중 Modal 포함):
1. 오버레이: `fixed inset-0 z-50 flex items-center justify-center bg-black/40 modal-overlay`
2. 모달 본체: `w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl modal-content`
3. 모달 헤더: 제목(`text-base font-semibold`) + 닫기 버튼(`icon-btn`)
4. 모달 푸터: 취소/확인 버튼을 `flex justify-end gap-2` 로 배치
5. `modal-content`, `modal-overlay` CSS 클래스 적용 (Phase 1 index.css에서 정의됨)

---

## 6-D. 빈 상태(Empty State) 통일

모든 페이지의 빈 상태 표시:
```jsx
// EmptyState 컴포넌트 사용 패턴 (이미 있는 컴포넌트 활용)
<EmptyState emoji="📋" message="등록된 항목이 없습니다." />

// 또는 CSS 클래스
<div className="empty-emoji-state">
  <span className="emoji">📋</span>
  <p className="message">등록된 항목이 없습니다.</p>
</div>
```
- `"No data"`, `"Nothing here"`, `"Empty"` 등 영문 빈 상태 메시지 전부 한글화

---

## 6-E. 토스트 / 알림 메시지 한글 확인

`frontend/src/contexts/ToastContext.tsx` 및 각 페이지의 `addToast` 호출:
- 성공 메시지: 이미 대부분 한글이나 영문 잔여 있으면 한글화
- 에러 메시지: `"Failed to fetch"`, `"Network error"` 등 → `"불러오기에 실패했습니다"`, `"네트워크 오류"` 등

---

## 6-F. 반응형 최종 점검

화면 크기별 점검:
- **1440px (데스크탑)**: 메인 사용 환경. 3컬럼 레이아웃 확인
- **1024px (태블릿)**: 2컬럼 레이아웃
- **768px (태블릿 소형)**: 1~2컬럼
- **375px (모바일)**: 1컬럼, 버튼 충분히 크게(min-height: 40px)

각 주요 페이지(대시보드, 업무보드, 워크플로우)에서 모바일 레이아웃 확인.

---

## 6-G. 검색 모달 (SearchModal) 개선

**파일: `frontend/src/components/SearchModal.tsx`**

1. placeholder: `"Search..."` → `"전체 검색..."` 또는 `"업무, 워크플로, 펀드 검색..."`
2. 검색 결과 없음: 영문 메시지 → 한글화
3. 검색 결과 카테고리 레이블(Tasks, Funds 등) → 한글

---

## 검증 체크리스트
- [ ] 모든 페이지 헤더 `page-header` 스타일 통일
- [ ] 모든 카드 `card-base` 스타일 통일
- [ ] 모든 버튼 클래스 통일
- [ ] 이모지 헤더 제거
- [ ] 영문 텍스트 잔여 없음 (사용자 표시용)
- [ ] 모달 스타일 통일 (`modal-content`, `modal-overlay` 클래스 적용)
- [ ] 빈 상태 표시 통일 (EmptyState 컴포넌트 또는 `.empty-emoji-state`)
- [ ] 모바일(375px) 각 페이지 레이아웃 정상
- [ ] 전체 빌드 (`npm run build`) 오류 없음
- [ ] 전체 기능 동작 확인 (API 연동, 필터, CRUD 등)
