# Phase 58~70 종합 개선 실행 가이드

> **근거 문서:**
> - `docs/ERP_ANALYSIS_AND_STRATEGY.md` — 시스템 전체 분석/개선 전략
> - `docs/UXUI_IMPROVEMENT_STRATEGY.md` — UX/UI 개선 전략
>
> **원칙:** 각 Phase를 순서대로 실행. 이전 Phase 완료 확인 후 다음 진행.
> **기존 기능 무결성:** 모든 Phase에서 기존 동작을 깨뜨리지 않을 것.

---

## 전체 구조 (3 Track × 13 Phase)

```
Track 1: 코드 안정화 & 디자인 시스템     (Phase 58~61)
Track 2: UX/UI 전면 개선                 (Phase 62~66)
Track 3: 기능 연계 & 핵심 누락 기능       (Phase 67~70)
```

### Phase 한눈에 보기

| Phase | 제목 | Track | 핵심 산출물 |
|-------|------|-------|-------------|
| **58** | Backend 안정화 | 1 | main.py 정리, 영업일 통합, 감사 로그, .env.example |
| **59** | Frontend 코드 정비 | 1 | api.ts 분리, queryKeys, constants, ErrorBoundary |
| **60** | UI 공통 컴포넌트 라이브러리 | 1 | ConfirmDialog, StatusBadge, FilterPanel, DataTable 등 8종 |
| **61** | 폼 시스템 & 코드 스플리팅 | 1 | react-hook-form+zod, React.lazy, PageSkeleton |
| **62** | 대시보드 & 네비게이션 UX 개선 | 2 | 브리핑 뷰, 모달상태 통합, 네비 재구조화 |
| **63** | 태스크 & 워크플로우 UX 개선 | 2 | FilterPanel 적용, 카드 개선, 워크플로우 좌우분할 |
| **64** | 펀드 & 투자 UX 개선 | 2 | LP 카드/Drawer, FundDetail 탭 정리, 반응형 테이블 |
| **65** | 재무 & 회계 UX 개선 | 2 | 정산 모달, 분개 경고, 수수료 시각화, 반응형 |
| **66** | 보고·컴플라이언스·관리 UX 개선 | 2 | 매트릭스 접근성, 권한 그룹핑, 로그인 개선 |
| **67** | 데이터 연계 자동화 | 3 | 엑시트→배분, 회계 자동분개, BizReport→Valuation |
| **68** | 현금흐름 & 수수료 자동화 | 3 | 현금흐름 예측, 수수료 자동 계산, IRR/TVPI/DPI |
| **69** | LP 보고서 & 엑셀 내보내기 | 3 | 분기 LP 보고서 자동생성, Excel import/export |
| **70** | 알림 시스템 & 대시보드 고도화 | 3 | 알림 센터, 정기업무 예고, 원클릭 액션 |

---

## 의존성 맵

```
Phase 58 (BE 안정화)
  │
  ├─→ Phase 59 (FE 코드 정비)
  │     │
  │     ├─→ Phase 60 (공통 컴포넌트)
  │     │     │
  │     │     ├─→ Phase 61 (폼 & 스플리팅)
  │     │     │     │
  │     │     │     └─→ Phase 62~66 (UX 개선 Track)
  │     │     │           62 → 63 → 64 → 65 → 66
  │     │     │
  │     │     └─→ Phase 67 (데이터 연계) ← Phase 58 BE 안정화도 필요
  │     │           │
  │     │           ├─→ Phase 68 (현금흐름 & 수수료)
  │     │           │     │
  │     │           │     └─→ Phase 69 (LP 보고서 & 엑셀)
  │     │           │
  │     │           └─→ Phase 70 (알림 & 대시보드 고도화)
  │     │
```

---

## 실행 방법

각 Phase 프롬프트 파일을 순서대로 AI에게 전달:

```
Phase 58: CODEX_PHASE58_PROMPT.md 를 읽고 그대로 구현하세요.
Phase 59: CODEX_PHASE59_PROMPT.md 를 읽고 그대로 구현하세요.
...
```

**Phase 간 검증 체크리스트:**
1. `npm run dev` (프론트) + `python -m uvicorn main:app --port 8000` (백엔드) 정상 기동
2. 기존 페이지 기본 동작 확인 (대시보드, 태스크, 펀드)
3. 콘솔 에러 없음
4. git commit 완료
