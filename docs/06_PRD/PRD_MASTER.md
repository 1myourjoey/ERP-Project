# V:ON ERP — PRD Master (허브 문서)

> **문서 목적:** V:ON ERP 전체 제품의 방향, 대상 사용자, 기능 범위를 정의하는 최상위 기획 문서입니다.
> 본 문서는 **허브(Hub)** 역할을 하며, 각 기능의 상세 스펙은 아래 Spoke 문서를 참조하세요.
>
> **업데이트 규칙:** 기능 PRD 파일을 추가/삭제할 때마다 아래 `## 기능 인덱스` 섹션을 반드시 동시에 수정할 것.

---

## 제품 개요

| 항목 | 내용 |
|---|---|
| **제품명** | V:ON ERP |
| **버전** | Phase 31_2 (완료) |
| **최종 업데이트** | 2026-02-22 |
| **담당자** | VC 관리팀 |
| **상태** | 🟢 Phase 31_2 완료 |

### 제품 목표

> **"1~2인 소수 정예 VC 관리팀이 수백억 원의 자금 흐름과 수천 장의 서류를 휴먼 에러 없이, 누락 없이 처리할 수 있도록 돕는 올인원 백오피스 ERP"**

### 대상 사용자 (Target User)

| 사용자 유형 | 설명 |
|---|---|
| **VC 관리팀 실무자** | 캐피탈콜, 분배, 서류 처리 등 일상 운영 업무 담당 |
| **VC 경영진/파트너** | 대시보드를 통한 포트폴리오 현황 파악 |

### 핵심 설계 철학

1. **에러-프루프(Error-Proof):** 필수 서류/금액 미기입 시 완료 처리 불가 (강제 Lock)
2. **단일 진실 공급원(SSOT):** 납입액, 분배액 등 재무 수치는 단 하나의 원천에서 자동 계산
3. **한글 금액 보조:** 조 단위 금액 입력 시 "O억 O천만 원" 실시간 파싱으로 오입력 방지
4. **D-Day 강제:** 업무는 마감일 기준 자동 분류, 실무자가 기한을 놓칠 수 없는 구조

---

## 범위 정의 (Scope)

### ✅ 범위 안 (In Scope)

- 조합(Fund) 생성 및 생애주기 관리 (결성 → 운용 → 청산)
- LP 명부 및 출자/분배 관리
- 업무 보드(Task) 및 워크플로(SOP) 관리
- 투자 포트폴리오 관리 (가치평가, Exit)
- 자금 거래 및 회계 원장 관리
- 규제 기관/LP 대상 보고서 및 문서 자동 생성
- 체크리스트 기반 서류 검수

### ❌ 범위 밖 (Out of Scope)

- 외부 은행 자동이체 시스템 연동
- 세금계산서 자동 발행
- 타 ERP (SAP, Oracle) 통합
- 모바일 앱 (현재는 Web only)
- AI 기반 투자 의사결정 지원

---

## MVP 정의

1차 MVP: **조합 관리 + 캐피탈콜 + 업무 보드**
- LP 명부 등록 및 캐피탈콜 발행/납입 확인
- 마감일 기반 Task 보드
- 기본 워크플로 템플릿 (결성/청산)

---

## 기능 인덱스 (Spoke 문서 목록)

> 기능 추가 시 이 목록에 행을 추가하고, 삭제 시 행을 제거할 것.

| # | 기능 영역 | 관련 페이지 | 상태 | PRD 문서 |
|---|---|---|---|---|
| 01 | 게이트웨이 대시보드 | `/dashboard` | 🟡 개발 중 | [PRD_01_Dashboard.md](./PRD_01_Dashboard.md) |
| 02 | 업무 보드 | `/tasks`, `/worklogs` | 🟡 개발 중 | [PRD_02_TaskBoard.md](./PRD_02_TaskBoard.md) |
| 03 | 워크플로 관리 | `/workflows` | 🟡 개발 중 | [PRD_03_Workflows.md](./PRD_03_Workflows.md) |
| 04 | 조합(Fund) 관리 | `/funds`, `/fund-overview`, `/funds/:id`, `/fund-operations` | 🟡 개발 중 | [PRD_04_Funds.md](./PRD_04_Funds.md) |
| 05 | LP 관리 | `/lp-management` | 🟡 개발 중 | [PRD_05_LP_Management.md](./PRD_05_LP_Management.md) |
| 06 | 투자/포트폴리오 | `/investments`, `/investments/:id`, `/valuations`, `/exits` | 🟡 개발 중 | [PRD_06_Investments.md](./PRD_06_Investments.md) |
| 07 | 자금 및 회계 | `/transactions`, `/accounting` | 🟡 개발 중 | [PRD_07_Capital_Accounting.md](./PRD_07_Capital_Accounting.md) |
| 08 | 보고서 및 문서 | `/biz-reports`, `/reports`, `/checklists`, `/documents`, `/templates` | 🟡 개발 중 | [PRD_08_Reports_Documents.md](./PRD_08_Reports_Documents.md) |

---

## 시스템 아키텍처 참조

| 문서 | 경로 |
|---|---|
| ERD (데이터베이스 구조) | [v_on_erp_erd.md](../02_Architecture/ERD/v_on_erp_erd.md) |
| 전체 시스템 플로우차트 | [v_on_erp_comprehensive_flow.md](./Flowchart/v_on_erp_comprehensive_flow.md) |
| 이벤트 트래킹 정의서 | [EVENT_TRACKING_SPEC.md](./EVENT_TRACKING_SPEC.md) |
| **Codex 작업 전역 규칙** | [CODEX_RULES.md](../CODEX_RULES.md) |

---

## Phase 매핑

| Phase | 관련 PRD | 상태 | 완료일 |
|---|---|---|---|
| Phase 31 | PRD_01_Dashboard, PRD_02_TaskBoard | ✅ 완료 | 2026-02-22 |
| Phase 31_1 | PRD_01_Dashboard, PRD_02_TaskBoard | ✅ 완료 | 2026-02-22 |
| Phase 31_2 | PRD_02_TaskBoard, PRD_03_Workflows, PRD_04_Funds | ✅ 완료 | 2026-02-22 |

---

## 변경 이력

| 날짜 | 버전 | 변경 내용 |
|---|---|---|
| 2026-02-22 | v0.1 | 최초 작성 |
| 2026-02-22 | v0.2 | Phase 31 완료 반영 (대시보드/업무보드 에러-프루프 및 Bulk 고도화) |
| 2026-02-22 | v0.3 | 업무보드 D-Day 카드 시인성 강화(카드 배경 대비 및 상태 배지 명확화) |
| 2026-02-22 | v0.4 | Phase 31_1 완료 반영 (업무보드 보조뷰 3탭·캘린더 Quick Complete·대시보드 파이프라인 단순화) |
| 2026-02-22 | v0.5 | Phase 31_2 완료 반영 (카테고리 관리/교훈 리마인드, 워크플로 인스턴스 UX, 펀드 템플릿/통지 UI 정비) |
