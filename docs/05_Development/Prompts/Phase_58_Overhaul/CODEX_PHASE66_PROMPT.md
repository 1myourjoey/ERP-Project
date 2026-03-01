# Phase 66: 보고·컴플라이언스·관리 UX 개선

> **의존성:** Phase 65 완료
> **근거:** `docs/UXUI_IMPROVEMENT_STRATEGY.md` §3.6, §3.8, §3.9, §3.10

**Priority:** P1 — 전체 앱 일관성 확보

---

## Part 1. BizReportsPage 접근성 & 사용성 개선

### 1-1. 서류수집 매트릭스 접근성

#### [MODIFY] `frontend/src/pages/BizReportsPage.tsx`

기존: 이모지 버튼만 (✅📥📨⬜, 텍스트 없음)
개선: StatusBadge + 텍스트 + 툴팁

```typescript
// 기존: <button>✅</button>
// 개선:
<button
  className="tag tag-green text-xs"
  title={`${docName} - 완료 (${completedDate})`}
  aria-label={`${docName} 완료`}
>
  <Check size={12} /> 완료
</button>
```

상태별 표시:
```
완료  → tag-green + ✓ + "완료"
수신  → tag-blue  + ↓ + "수신"
발송  → tag-amber + → + "발송"
미처리 → tag-gray  + ○ + "미처리"
```

### 1-2. 재무 데이터 저장 피드백

기존: onBlur 즉시 저장 (피드백 없음)
개선:
1. 값 변경 시 필드에 파란 테두리 (변경됨 표시)
2. 하단에 "변경사항 N건" + "저장" 플로팅 바 표시
3. 저장 클릭 → 스피너 → 성공 토스트

```typescript
// 변경 추적
const [pendingChanges, setPendingChanges] = useState<Map<string, any>>(new Map());

// 플로팅 저장 바
{pendingChanges.size > 0 && (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
    <div className="card-base flex items-center gap-4 px-6 py-3">
      <span className="text-sm">변경사항 {pendingChanges.size}건</span>
      <button className="primary-btn btn-sm" onClick={saveAll}>저장</button>
      <button className="ghost-btn btn-sm" onClick={discardAll}>취소</button>
    </div>
  </div>
)}
```

### 1-3. 이상치 감지 결과 패널

기존: 인라인 섹션 (스크롤 시 놓침)
개선: 감지 시 토스트 알림 + 전용 패널 (우측 또는 상단)

---

## Part 2. CompliancePage 개선

### 2-1. 법률 질의 결과 마크다운 렌더링

기존: `whitespace-pre-wrap` (일반 텍스트)
개선: 간단한 마크다운 파싱 (볼드, 리스트, 링크)

```typescript
// 간단한 마크다운 렌더러 (외부 라이브러리 없이)
function renderSimpleMarkdown(text: string): React.ReactNode {
  // **볼드** → <strong>
  // - 리스트 → <ul><li>
  // [링크](url) → <a>
  // \n → <br>
}
```

### 2-2. 컴플라이언스 대시보드 StatusBadge 적용

기존: 색상만으로 pass/warning/fail 구분
개선: StatusBadge 컴포넌트 적용
```
pass    → StatusBadge status="success" label="적합"
warning → StatusBadge status="warning" label="주의"
fail    → StatusBadge status="danger" label="위반"
```

---

## Part 3. UsersPage 개선

### 3-1. 권한 체크박스 카테고리 그룹핑

#### [MODIFY] `frontend/src/pages/UsersPage.tsx`

기존: 54개 체크박스 평면 나열
개선: 도메인별 그룹 (Phase 62의 NAV_GROUPS 구조 활용)

```typescript
const ROUTE_GROUPS = [
  {
    label: '업무',
    routes: ['dashboard', 'tasks', 'workflows', 'worklogs', 'calendar', 'checklists'],
  },
  {
    label: '펀드 관리',
    routes: ['funds', 'fund-detail', 'fund-overview', 'investments', 'investment-detail',
             'capital-calls', 'distributions', 'exits', 'valuations', 'transactions'],
  },
  {
    label: '재무',
    routes: ['accounting', 'provisional-fs', 'fee-management'],
  },
  {
    label: '보고 & 컴플라이언스',
    routes: ['compliance', 'biz-reports', 'vics', 'internal-reviews', 'reports'],
  },
  {
    label: '관리',
    routes: ['lp-management', 'documents', 'templates', 'users', 'fund-operations'],
  },
];
```

각 그룹에 "전체 선택" / "전체 해제" 토글.
하단에 "전체 선택" / "전체 해제" 버튼.

### 3-2. 비밀번호 초기화 모달

기존: `window.prompt("새 비밀번호?")`
개선: ConfirmDialog promptMode

```typescript
<ConfirmDialog
  open={resetPasswordModal.open}
  title="비밀번호 초기화"
  message={`${resetPasswordModal.userName}의 비밀번호를 초기화합니다.`}
  promptMode
  promptLabel="새 비밀번호"
  promptType="text"
  variant="warning"
  onPromptConfirm={(newPassword) => handleResetPassword(resetPasswordModal.userId, newPassword)}
  onCancel={() => setResetPasswordModal({ open: false })}
/>
```

### 3-3. 모달 크기 통일

사용자 생성/편집 모달과 초대 모달: 모두 `max-w-2xl` 통일.

---

## Part 4. DocumentsPage 개선

### 4-1. 상태 변경 확인 추가

기존: select 즉시 반영 (확인 없이)
개선: select 변경 → ConfirmDialog

```typescript
const handleStatusChange = (docId: number, newStatus: string) => {
  setConfirmChange({ docId, newStatus, open: true });
};

<ConfirmDialog
  open={confirmChange.open}
  title="서류 상태 변경"
  message={`상태를 "${newStatusLabel}"로 변경하시겠습니까?`}
  onConfirm={() => mutateStatus(confirmChange.docId, confirmChange.newStatus)}
  onCancel={() => setConfirmChange({ open: false })}
/>
```

### 4-2. D-day 배지 StatusBadge 적용

기존: `tag tag-red` (색상만)
개선: StatusBadge + 아이콘

---

## Part 5. CalendarPage 개선

### 5-1. 이벤트 편집 모달화

기존: 테이블 행 인라인 폼
개선: FormModal로 이벤트 편집

### 5-2. 이벤트 삭제 ConfirmDialog

기존: `window.confirm()`
개선: ConfirmDialog (이미 Phase 60에서 시범 적용)

### 5-3. 이벤트 색상 정리

기존: Orange가 "오늘"과 "투심위" 양쪽에 중복 사용
개선: 색상 체계 정리

```
일반 일정  → tag-blue
투심위     → tag-purple
마감       → tag-red
완료       → tag-green
오늘       → tag-amber (강조 border)
```

---

## Part 6. LoginPage 개선

### 6-1. 라벨 추가

#### [MODIFY] `frontend/src/pages/LoginPage.tsx`

기존: placeholder만 사용
개선: 명시적 `<label>` + placeholder 유지

```tsx
<FormField label="아이디 또는 이메일" required>
  <input
    className="form-input"
    placeholder="이메일 또는 아이디 입력"
    {...register('username')}
  />
</FormField>
```

### 6-2. 비밀번호 표시 토글

```tsx
<div className="relative">
  <input
    type={showPassword ? 'text' : 'password'}
    className="form-input pr-10"
    ...
  />
  <button
    type="button"
    className="absolute right-3 top-1/2 -translate-y-1/2 icon-btn"
    onClick={() => setShowPassword(!showPassword)}
    aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
  >
    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
  </button>
</div>
```

### 6-3. 에러 메시지 인라인 배치

기존: 폼 상단 별도 배너
개선: 폼 필드 아래 인라인 에러 + 필드 빨간 테두리

### 6-4. 링크 사이즈 개선

기존: `text-xs` (너무 작음)
개선: `text-sm`

---

## 검증 체크리스트

- [ ] BizReportsPage: 매트릭스 접근성 (아이콘+텍스트+색상), 저장 플로팅 바
- [ ] CompliancePage: 법률 질의 결과 마크다운 렌더링, StatusBadge
- [ ] UsersPage: 권한 그룹핑, 비밀번호 초기화 모달, window.prompt 제거
- [ ] DocumentsPage: 상태 변경 확인 다이얼로그, StatusBadge
- [ ] CalendarPage: 이벤트 편집 모달, 삭제 ConfirmDialog, 색상 정리
- [ ] LoginPage: 라벨, 비밀번호 토글, 인라인 에러, 링크 크기
- [ ] 전체 앱에서 window.confirm() / window.prompt() 사용처 0건 확인
- [ ] git commit: `feat: Phase 66 reporting and admin UX`
