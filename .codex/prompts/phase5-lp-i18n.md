# Phase 5 — LP 관리 통합뷰 + 전체 영문 한글화

## 배경 및 목표
1. **LP 관리**: 현재 LPManagementPage에서 조합별로 LP가 나열되어 동일한 LP가 여러 번 등장.
   → LP 개체(person/institution) 단위로 통합하여 한 LP가 어떤 조합에 참여했는지 펼쳐보는 방식으로 개선.
2. **영문 한글화**: 전체 UI에서 영문으로 표시되는 텍스트를 한글로 통일.

전제: Phase 1 완료 후 진행.

## 수정 대상 파일
- `frontend/src/pages/LPManagementPage.tsx`
- `frontend/src/pages/LPAddressBookPage.tsx`
- `frontend/src/components/Layout.tsx`
- `frontend/src/lib/labels.ts` (있다면)
- 기타 영문 문자열이 발견되는 파일들 (아래 목록 참조)

---

## 5-A. LPManagementPage — LP 통합 뷰 개선

**파일: `frontend/src/pages/LPManagementPage.tsx`**

현재 구조 분석:
- `fetchLPAddressBooks` API로 LP 목록을 가져온 후 테이블로 나열
- LP가 여러 조합에 출자하면 같은 LP 이름이 조합 수만큼 반복 표시

### 개선 방향:
LP를 먼저 그룹화한 뒤 **LP 개체 → 참여 조합 목록** 형태로 표시.

### 변경 사항:

1. **LP 목록 표시 방식 변경** — 테이블 → 카드 리스트 (접이식)

```tsx
// LP를 name 기준으로 그룹화하는 로직 추가
const groupedLPs = useMemo(() => {
  const map = new Map<string, LPAddressBook[]>()
  for (const book of visibleBooks) {
    const key = book.name
    const list = map.get(key) ?? []
    list.push(book)
    map.set(key, list)
  }
  return Array.from(map.entries()).map(([name, entries]) => ({
    name,
    type: entries[0].type,
    business_number: entries[0].business_number,
    contact: entries[0].contact,
    address: entries[0].address,
    memo: entries[0].memo,
    entries, // 조합별 출자 정보 목록
  }))
}, [visibleBooks])
```

2. **LP 카드 레이아웃**:
```tsx
{groupedLPs.map((lp) => (
  <div key={lp.name} className="rounded-xl border border-slate-200 bg-white shadow-xs">
    {/* LP 기본 정보 헤더 */}
    <div className="flex items-center justify-between px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{lp.name}</p>
        <p className="text-xs text-slate-500">{LP_TYPE_LABEL[lp.type] || lp.type} · {lp.contact || '-'}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="tag tag-gray">{lp.entries.length}개 조합</span>
        <button onClick={() => toggleExpand(lp.name)} className="icon-btn">
          <ChevronDown size={16} className={`transition-transform ${expandedLPs.has(lp.name) ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </div>

    {/* 조합 참여 목록 (펼침) */}
    {expandedLPs.has(lp.name) && (
      <div className="border-t border-slate-100 px-4 pb-3 pt-2">
        <div className="space-y-1.5">
          {lp.entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <span className="font-medium text-slate-700">{entry.fund_name || '공통'}</span>
              <span className="text-slate-500">출자 {formatAmount(entry.commitment)}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={() => startEdit(lp.entries[0])} className="secondary-btn btn-xs">수정</button>
          <button onClick={() => handleDeactivate(lp.entries[0].id)} className="danger-btn btn-xs">비활성화</button>
        </div>
      </div>
    )}
  </div>
))}
```

3. **expandedLPs state 추가**:
```tsx
const [expandedLPs, setExpandedLPs] = useState<Set<string>>(new Set())
const toggleExpand = (name: string) => {
  setExpandedLPs(prev => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    return next
  })
}
```

4. **기존 편집 폼** — 현재 카드 상단에 항상 표시되는 등록/수정 폼
   - 폼을 별도 섹션(`card-base`)으로 분리하여 목록 상단 또는 우측 패널로 배치
   - 폼 라벨:
     - `이름`, `유형`, `사업자등록번호/생년월일` → label 유지 (복잡 폼이므로)
     - 단, 연락처 / 주소 / 메모 → placeholder 사용, label 제거

5. **typeFilter** — 현재 별도 select:
   - 필터 select를 검색창 옆에 인라인으로 배치 (`flex gap-2` 레이아웃)

---

## 5-B. LPAddressBookPage — 중복 제거 정보 표시

**파일: `frontend/src/pages/LPAddressBookPage.tsx`**

현재 별도 페이지로 존재하는 LP 주소록.
LPManagementPage 개선 후 두 페이지의 역할을 명확히 구분:
- **LPAddressBook** (`/lp-address-book`): LP 마스터 데이터 관리 (이름, 유형, 연락처 등)
- **LPManagement** (`/lp-management`): 조합별 LP 출자 현황 관리

LPAddressBookPage 변경:
1. 등록 폼 라벨 정리 (5-A와 동일한 기준 적용):
   - `이름`, `유형` → label 유지
   - `사업자등록번호/생년월일` → label 유지 (필드명이 길어서 placeholder에 넣기 어려움)
   - `연락처`, `주소`, `메모` → label 제거, placeholder 적용
     - 연락처 placeholder: `"연락처"`
     - 주소 placeholder: `"주소"`
     - 메모 placeholder: `"메모 (선택)"`
2. 목록 테이블 스타일 통일:
   - `table-head-row`, `table-head-cell`, `table-body-cell` 클래스 사용
   - 행 hover: `hover:bg-slate-50`

---

## 5-C. 전체 영문 → 한글 변환

### Layout.tsx
| 위치 | 현재 | 변경 |
|------|------|------|
| 검색 버튼 텍스트 | `Search` | `검색` |
| 검색 단축키 설명 | `Ctrl+Space` | `Ctrl+Space` (유지) |
| 사용자 메뉴 role 표시 | `{user?.role}` 그대로 (role이 영문이면 아래 매핑 추가) | 아래 참조 |

role 매핑 추가 (Layout.tsx 사용자 메뉴 부분):
```tsx
const ROLE_LABEL: Record<string, string> = {
  admin: '관리자',
  manager: '매니저',
  viewer: '열람자',
  analyst: '분석가',
}
// 사용처: ROLE_LABEL[user?.role || ''] || user?.role
```

### 전체 페이지 공통 영문 패턴 찾기 및 교체

아래 패턴들을 `frontend/src` 전체에서 grep하여 한글로 변환:

1. **상태값 표시 문자열**:
   - `'active'` → `'진행 중'` (displayOnly, value는 유지)
   - `'completed'` → `'완료'`
   - `'inactive'` → `'비활성'`
   - `'pending'` → `'대기'`
   단, API로 전송되는 value는 영문 유지, **화면 표시 텍스트만** 한글화

2. **labels.ts 파일** (`frontend/src/lib/labels.ts`):
   - `labelStatus` 함수에서 영문 status → 한글 매핑 확인 및 누락분 추가:
   ```ts
   export function labelStatus(status: string): string {
     const map: Record<string, string> = {
       active:    '진행 중',
       completed: '완료',
       cancelled: '취소',
       inactive:  '비활성',
       pending:   '대기',
       skipped:   '건너뜀',
       overdue:   '지연',
       draft:     '초안',
       published: '공개',
       closed:    '종료',
     }
     return map[status] ?? status
   }
   ```

3. **버튼 / 액션 텍스트**:
   영문으로 남아있는 버튼 텍스트를 한글로 변환 (파일별 grep):
   - `"Save"` → `"저장"`
   - `"Cancel"` → `"취소"`
   - `"Edit"` → `"수정"`
   - `"Delete"` → `"삭제"`
   - `"Add"` → `"추가"`
   - `"Create"` → `"생성"`
   - `"Submit"` → `"제출"`
   - `"Loading..."` → `"불러오는 중..."`
   - `"No data"` → `"데이터 없음"`

4. **placeholder 텍스트**:
   - `"Search..."` → `"검색..."`
   - `"Enter name"` → `"이름 입력"`
   - `"Select..."` → `"선택..."`

5. **빈 상태 메시지** (EmptyState 등):
   - `"No items found"` → `"항목이 없습니다"`
   - `"No results"` → `"결과 없음"`

6. **DashboardRightPanel**:
   - `"운영진 Quick View"` → `"운영 현황"` (Phase 2에서 처리 가능, 여기서 중복 처리해도 됨)

7. **탭/필터 레이블**:
   - 파일 전체에서 영문 tab key가 화면에 표시되는 경우만 한글화

---

## 5-D. 공통 영문 잔여 항목 처리

아래 파일들을 순서대로 확인하여 사용자에게 표시되는 영문 텍스트 한글화:

**우선순위 높음** (사용자에게 자주 노출):
- `frontend/src/components/Layout.tsx`
- `frontend/src/pages/DashboardPage.tsx`
- `frontend/src/pages/TaskBoardPage.tsx`
- `frontend/src/pages/WorkflowsPage.tsx`
- `frontend/src/pages/LPManagementPage.tsx`
- `frontend/src/pages/FundsPage.tsx`
- `frontend/src/pages/InvestmentsPage.tsx`

**우선순위 보통** (관리자용, 덜 자주 노출):
- `frontend/src/pages/UsersPage.tsx`
- `frontend/src/pages/CompliancePage.tsx`
- `frontend/src/pages/AccountingPage.tsx`

**변환 시 주의사항**:
- `console.log`, `aria-label`, `title` 속성의 영문은 변환하지 않아도 됨
- API 요청 파라미터(`status: 'active'` 등) 값은 **절대 변환 금지**
- 변수명/함수명은 변환 금지
- TypeScript 타입 문자열 (`type Status = 'active' | 'completed'`) 변환 금지

---

## 검증 체크리스트
- [ ] LP 관리 페이지에서 같은 LP가 한 번만 표시 (조합 목록은 펼쳐보기)
- [ ] LP 펼침/접힘 동작 확인
- [ ] LP 수정/비활성화 동작 확인
- [ ] 검색 버튼에 "검색" 표시 확인
- [ ] 네비게이션 레이블 모두 한글
- [ ] 상태값 화면 표시 모두 한글 (value는 영문 유지)
- [ ] API 요청 파라미터 영문 유지 확인
- [ ] 빌드 오류 없음
