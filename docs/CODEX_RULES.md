# CODEX_RULES.md — Codex 작업 전역 규칙

> **⚠️ 모든 Phase 프롬프트 시작 시 이 파일을 반드시 먼저 읽을 것.**
> 이 문서는 Codex가 V:ON ERP 프로젝트에서 작업할 때 항상 따라야 하는 전역 규칙을 정의합니다.

---

## 1. 작업 전 필수 확인 (Pre-Work Checklist)

Phase 작업을 시작하기 전에 다음 문서를 순서대로 읽을 것:

1. **PRD Master** → `docs/06_PRD/PRD_MASTER.md`
   - 전체 기능 인덱스 확인
   - 이번 Phase와 관련된 PRD 파일 식별

2. **관련 기능 PRD** → `docs/06_PRD/PRD_0X_*.md` (Phase와 관련된 파일)
   - 구현해야 할 User Story 목록 확인
   - 에러-프루프 규칙 확인

3. **플로우차트** → `docs/06_PRD/Flowchart/v_on_erp_comprehensive_flow.md`
   - 해당 페이지의 사용자/시스템 흐름 확인

4. **ERD** → `docs/02_Architecture/ERD/v_on_erp_erd.md`
   - DB 스키마 및 관계 확인

---

## 2. Phase 완료 후 필수 작업 (Post-Work Checklist)

Phase 구현이 끝나면 반드시 아래 순서로 문서를 업데이트할 것:

### Step 1 — 관련 PRD User Story 상태 업데이트

해당 Phase에서 구현/수정/삭제한 User Story를 찾아 상태를 업데이트한다.

```markdown
<!-- 완료된 경우 -->
| US-01 | 기능명 | 설명 | ✅ 완료 |

<!-- 삭제된 경우 -->
| ~~US-05~~ | ~~기능명~~ | ~~설명~~ | ❌ 삭제됨 |

<!-- 변경된 경우: 기존 설명을 새 내용으로 교체 -->
| US-03 | 기능명 | [변경된 설명] | 🔄 변경됨 |

<!-- 신규 추가된 경우: 새 행 추가 -->
| US-NEW | 신규 기능명 | 설명 | ✅ 완료 |
```

### Step 2 — PRD 변경 이력 테이블 업데이트

각 PRD 파일 하단의 변경 이력 테이블에 추가:

```markdown
| 2026-XX-XX | Phase XX 완료: [주요 변경 내용 한 줄 요약] |
```

### Step 3 — PRD_MASTER.md Phase 매핑 테이블 업데이트

`PRD_MASTER.md`의 Phase 매핑 섹션에 완료 기록:

```markdown
| Phase XX | PRD_0X_기능명 | ✅ 완료 | 2026-XX-XX |
```

---

## 3. 변경 유형별 PRD 처리 규칙

| 작업 유형 | PRD 처리 방법 |
|---|---|
| **기능 구현 완료** | 해당 US → `✅ 완료` 로 변경 |
| **기능 일부 변경** | US 설명 내용 수정 + `🔄 변경됨` 표시 |
| **기능 삭제** | US 행에 `~~취소선~~` 처리 + `❌ 삭제됨` 표시 |
| **신규 기능 추가** | US 행 신규 추가 + `✅ 완료` 표시 |
| **에러-프루프 로직 추가** | 해당 PRD의 "에러-프루프 규칙" 섹션 업데이트 |
| **플로우 변경** | `Flowchart/v_on_erp_comprehensive_flow.md` 해당 페이지 Mermaid 수정 |

---

## 4. 핵심 설계 원칙 (절대 위반 금지)

1. **SSOT 원칙:** `Fund.paid_in` 값은 `CapitalCallItem.paid=True` 합산으로만 갱신. 직접 수정 금지.
2. **에러-프루프 잠금:** 필수 서류 미첨부 또는 필수 금액 미기입 상태에서 [완료] 버튼이 활성화되면 안 됨.
3. **한글 금액 보조:** 금액 입력 필드에는 반드시 `KrwAmountInput` 컴포넌트를 사용. 직접 `<input type="number">` 사용 금지.
4. **등록성립일 수정 불가:** Fund 수정 폼에서 `formation_date` 필드는 항상 `readOnly` 처리.

---

## 5. PRD ↔ Phase 매핑 테이블

> Phase 완료 시 이 테이블을 업데이트할 것.

| Phase | 관련 PRD | 핵심 작업 내용 | 상태 | 완료일 |
|---|---|---|---|---|
| Phase 01~10 | - | 초기 CRUD 및 기반 구조 구축 | ✅ 완료 | - |
| Phase 11~20 | - | LP/캐피탈콜/투자 기능 구축 | ✅ 완료 | - |
| Phase 21~25 | PRD_04_Funds, PRD_05_LP | 펀드/LP 고도화 | ✅ 완료 | - |
| Phase 26~30 | PRD_03_Workflows, PRD_08 | 워크플로/문서 고도화 | ✅ 완료 | - |
| Phase 31 | PRD_02_TaskBoard | 업무보드 에러-프루프 재설계 | ✅ 완료 | 2026-02-22 |
| Phase 31_1 | PRD_01_Dashboard, PRD_02_TaskBoard | 업무보드 보조뷰(캘린더/파이프라인) UX 고도화 | ✅ 완료 | 2026-02-22 |
| Phase 31_2 | PRD_02_TaskBoard, PRD_03_Workflows, PRD_04_Funds | 카테고리 체계/교훈 리마인드, 워크플로 인스턴스 UX, 펀드 템플릿/통지 UI 정비 | ✅ 완료 | 2026-02-22 |
| Phase 31_3 | PRD_01_Dashboard, PRD_02_TaskBoard, PRD_03_Workflows, PRD_04_Funds | 워크플로 단계서류/자동 WorkLog, 체크리스트 통합, 대시보드 통지·보고 출처 통합, 펀드 템플릿 확장 | ✅ 완료 | 2026-02-22 |

---

## 6. Phase 프롬프트 표준 헤더 템플릿

> 모든 새 Phase 프롬프트 최상단에 아래 헤더를 붙여 사용할 것.

```markdown
> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 및 아래 참조 문서를 먼저 읽을 것.
>
> **참조 PRD:** docs/06_PRD/PRD_0X_기능명.md
> **참조 플로우차트:** docs/06_PRD/Flowchart/v_on_erp_comprehensive_flow.md (Page XX)
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist를 반드시 수행할 것.
```

---

## 7. 파일/폴더 구조 참조

```
docs/
├── 02_Architecture/
│   └── ERD/v_on_erp_erd.md             ← DB 스키마
├── 06_PRD/
│   ├── PRD_MASTER.md                   ← 허브 문서 (Phase 매핑 포함)
│   ├── PRD_01_Dashboard.md
│   ├── PRD_02_TaskBoard.md
│   ├── PRD_03_Workflows.md
│   ├── PRD_04_Funds.md
│   ├── PRD_05_LP_Management.md
│   ├── PRD_06_Investments.md
│   ├── PRD_07_Capital_Accounting.md
│   ├── PRD_08_Reports_Documents.md
│   ├── EVENT_TRACKING_SPEC.md
│   └── Flowchart/
│       └── v_on_erp_comprehensive_flow.md
frontend/
└── src/
    ├── pages/                          ← 20개 페이지 컴포넌트
    └── components/
        └── common/
            └── KrwAmountInput.tsx      ← 금액 입력 시 반드시 사용
```
