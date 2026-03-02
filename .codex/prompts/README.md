# V:ON ERP — 프론트엔드 UX/UI 개선 업무명세서

## 개요

VC 관리직(1인 관리자) 입장에서 효율적인 업무를 위한 프론트엔드 전면 UX/UI 개선 작업입니다.

- **기술 스택**: React 19 + TypeScript + Vite + TailwindCSS v4 + React Query
- **참고 디자인**: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- **원칙**: 기존 기능(API 연동, CRUD, 필터, 모달 등)은 반드시 유지. UX/UI만 개선.

---

## 페이즈 목록

| 페이즈 | 파일명 | 내용 | 선행 조건 |
|--------|--------|------|-----------|
| Phase 1 | `phase1-design-system.md` | 테마 제거 + CSS 전면 교체 + 디자인 시스템 구축 | 없음 (첫 번째 실행) |
| Phase 2 | `phase2-dashboard.md` | 대시보드 UX/UI 개선 | Phase 1 |
| Phase 3 | `phase3-taskboard.md` | 업무 보드 UX/UI 개선 | Phase 1 |
| Phase 4 | `phase4-workflows.md` | 워크플로우 탭 UX/UI 개선 | Phase 1 |
| Phase 5 | `phase5-lp-i18n.md` | LP 관리 통합뷰 + 전체 영문 한글화 | Phase 1 |
| Phase 6 | `phase6-consistency.md` | 전체 통일성 + 나머지 페이지 개선 | Phase 1~5 |

---

## 각 페이즈 실행 지침

### Codex 실행 방법
각 페이즈 명세서 파일의 내용을 Codex에게 그대로 전달하여 실행합니다.
페이즈는 순서대로 실행하며, Phase 1이 반드시 먼저 완료되어야 합니다.
Phase 2~5는 Phase 1 이후 순서 무관하게 독립적으로 실행 가능합니다.

### 핵심 제약 사항
1. **기능 유지**: API 호출, 상태 관리, 이벤트 핸들러 등 기존 기능은 절대 변경 금지
2. **파일 구조 유지**: 컴포넌트 파일 위치, import 경로 변경 금지
3. **API 파라미터 유지**: `status: 'active'` 등 API로 전송되는 값은 영문 유지
4. **TypeScript 타입 유지**: 타입 정의 변경 금지
5. **빌드 확인**: 각 페이즈 완료 후 `cd frontend && npm run build` 로 빌드 오류 없음 확인

---

## 주요 변경 요약

### Phase 1 — 디자인 시스템
- `ThemeContext.tsx` 삭제, `Layout.tsx` 테마 코드 제거
- `index.css` 전면 교체 (단일 라이트 테마, 깔끔한 white/slate 팔레트)
- ShaderBackground 렌더링 제거
- "Search" → "검색" 변경

### Phase 2 — 대시보드
- StatCard 크기 5개 모두 동일하게 통일
- "운영진 Quick View" → "운영 현황", 기본 펼쳐진 상태
- 워크플로 패널 인디고→흰색 스타일로 정리
- 운영 요약 2x2 grid 배치

### Phase 3 — 업무 보드
- 카드 간격 `space-y-2.5`, `py-2.5` 패딩 추가
- 태그 최대 2개(카테고리+긴급도)로 제한
- 뷰 탭 스타일 통일 (`rounded-xl bg-slate-100`)
- 단순 필드 label→placeholder 전환

### Phase 4 — 워크플로우
- 탭 비활성 텍스트 `gray-400`→`slate-600` (가시성 확보)
- 정기 업무 캘린더 `overflow-x-auto` 스크롤 처리
- 단계 서류 박스 오버플로우 수정
- 인스턴스 카드 흰색 배경 통일

### Phase 5 — LP 관리 + 한글화
- LP 통합뷰: LP명 기준 그룹화 → 조합 참여 목록 펼쳐보기
- 전체 영문 텍스트(버튼, 상태, 빈 상태 메시지) 한글화
- `labelStatus()` 함수 매핑 완성

### Phase 6 — 통일성
- 모든 페이지 `page-header`, `card-base`, 버튼 클래스 통일
- 이모지 페이지 제목 제거
- 모달 스타일 통일
- 빈 상태 표시 통일

---

## 주요 파일 경로 참고

```
frontend/src/
├── index.css                          # 글로벌 CSS (Phase 1에서 교체)
├── App.css                            # 앱 레벨 CSS
├── components/
│   ├── Layout.tsx                     # 네비게이션 (Phase 1, 5)
│   ├── dashboard/
│   │   ├── DashboardDefaultView.tsx   # 대시보드 메인 (Phase 2)
│   │   ├── DashboardStatCard.tsx      # 통계 카드 (Phase 2)
│   │   ├── DashboardRightPanel.tsx    # 우측 패널 (Phase 2)
│   │   ├── DashboardWorkflowPanel.tsx # 워크플로 패널 (Phase 2)
│   │   └── DashboardTaskPanels.tsx    # 업무 패널 (Phase 2)
│   └── ui/
│       ├── FilterPanel.tsx            # 필터 패널 (Phase 3)
│       └── FormModal.tsx              # 폼 모달 (Phase 6)
├── contexts/
│   └── ThemeContext.tsx               # 삭제 대상 (Phase 1)
└── pages/
    ├── DashboardPage.tsx              # 대시보드 페이지 (Phase 2)
    ├── TaskBoardPage.tsx              # 업무 보드 (Phase 3)
    ├── WorkflowsPage.tsx              # 워크플로우 (Phase 4)
    ├── LPManagementPage.tsx           # LP 관리 (Phase 5)
    └── LPAddressBookPage.tsx          # LP 주소록 (Phase 5)
```
