# Phase 26_1: 데이터 삭제 정합성, UI 일관성 및 자동화 데이터 보정

> **Priority:** P0

---

## Table of Contents

1. [Part 1 — 조합(Fund) 삭제 시 연관 데이터의 안전한 처리 방식 구축 (Soft-delete & Orphan Management)](#part-1)
2. [Part 2 — 시스템 자동 생성 데이터(System-generated)의 한글화 및 UI 일관성(Consistency) 확보](#part-2)
3. [Part 3 — 출자이력(Capital Callback History) 오류 데이터의 프로그래밍적 임의 보정 메커니즘 구축](#part-3)
4. [Files to create / modify](#files-to-create--modify)
5. [Acceptance Criteria](#acceptance-criteria)
6. [구현 주의사항 (Computer Science Rules)](#구현-주의사항-computer-science-rules)

---

## 현재 상태 및 문제점 분석

Phase 26의 기초 데이터 무결성 점검에 이어, 엣지 케이스 및 사용자 경험(UX) 직결 버그를 수정하는 심화 단계입니다.

**주요 문제점:**
1. **Cascade Delete 문제:** 현재 특정 조합(Fund) 데이터를 삭제할 때 하위 연관 데이터(Task 등) 처리에 대한 명확한 규칙 부재로 고아 데이터(Orphan Data)가 발생하거나 필요한 과거 기록까지 날아가는 위험이 존재합니다.
2. **자동화 로직 다국어/표현 불일치:** 출자 위저드나 LP 양수양도 시 백엔드에서 비즈니스 로직에 의해 자동 생성되는 워크플로 명칭이 영문(예: "Capital Call for Fund A", "LP Transfer Workflow")으로 하드코딩되어 생성되며, 단계 표기도 일관되지 않은 상태입니다. 이는 사용자에게 시스템의 파편화된 느낌을 줍니다. 또한 출자이력 UI에서 생성된 워크플로를 지칭할 때 "#123"과 같은 불친절한 형태에 그치며 클릭 시 즉각적인 라우팅(Linkage)이 안 됩니다.
3. **더미 데이터 잔재 및 납입률 초과 표기:** 개발 중 발생한 테스트 데이터들로 인해 일부 조합의 출자이력을 들어가면 납입금액과 비율이 100%를 아득히 초과한 비정상적인 상태로 렌더링되고 있습니다. 이는 전체 시스템의 신뢰도 하락 요소입니다.

이 단계는 **안전한 데이터 생명주기(Lifecycle) 관리**, **시스템 출력 포맷 통합**, 그리고 **오염 데이터의 스크립트 기반 강제 클렌징(Cleansing)**에 집중합니다.

---

## Part 1 — 조합(Fund) 삭제 시 연관 데이터의 안전한 처리 방식 구축 (Soft-delete & Orphan Management)

### 1-A. 데이터베이스 관계(Foreign Key) 및 Cascade 룰 재정의
- **목표:** 조합 데이터 마스터(Fund) 삭제 요청이 인입될 때, 해당 조합에 걸려있던 '진행중/대기중' 업무는 연쇄적으로 삭제 처리하되, '완료된' 업무나 중요 결재 이력은 고아 데이터 혹은 아카이브(Archive) 형태로 남겨야 함.
- 백엔드의 `Fund.delete` 라우팅 또는 서비스 계층에서 검증 로직을 작성합니다.
  - 해당 Fund ID를 가지고 있는 `Task` 또는 `WorkflowInstance` 목록을 우선 쿼리합니다.
  - 조건부 삭제: `status != 'completed'` (진행 중이거나 대기 중)인 데이터는 과감히 레코드 DB에서 `delete()`하거나 Soft-delete 처리.
  - 보존 대상: `status == 'completed'`인 데이터는 `fund_id` 컬럼을 방치(NULL 세팅)하거나, 조합명이 들어있던 스냅샷 필드를 살려둬서 히스토리 목록에는 남아 있도록 외래키(ForeignKey)의 `ondelete` 정책을 점검 및 수정(`SET NULL` 처리 등)해야 합니다.

---

## Part 2 — 시스템 자동 생성 데이터(System-generated)의 한글화 및 UI 일관성(Consistency) 확보

### 2-A. 생성 로직의 하드코딩 패터닝 및 다국어(한글) 통일
- 출자 위저드 및 양수양도 서비스 로직(`services/capital_call.py`, `services/lp_transfer.py` 등)에서 `WorkflowInstance` 객체를 강제 삽입할 때 사용되는 Title/Name 문자열을 전면 수정합니다.
- **예시 포맷 변경 (AS-IS → TO-BE):**
  - "Capital Call - [보안1호]" → "[보안1호] 제1차 출자요청(Capital Call) 결재"
  - "Transfer LP A to B" → "[보안1호] LP 양수양도 (A → B) 승인 단계"
- 단계명 역시 자동 배정될 때 명확한 한글 라벨("1. 서류검토", "2. 납입확인" 등)이 부여되도록 백엔드 생성 딕셔너리(Dictionary) 값을 교정합니다.

### 2-B. 출자이력(Capital Callback History) UI 개선 및 딥링크(Deep Link) 구현
- 하단 LP별 출자이력 테이블에서, 해당 납입 건이 어떠한 워크플로에 의해 승인되었는지를 나타내는 `linked_workflow_id` 또는 필드 값을 보여줄 때 일관된 한글명 포맷으로 렌더링합니다.
- 단순 텍스트 표기가 아닌 `<Link>` 혹은 `useNavigate` 훅을 활용한 반응형 버튼으로 래핑합니다.
  - 클릭 시 곧바로 `/workflows/{id}` (혹은 대시보드의 해당 워크플로 상세 모달)로 즉시 네비게이션 처리되도록 라우팅 파라미터를 연결해야 합니다.

---

## Part 3 — 출자이력(Capital Callback History) 오류 데이터의 프로그래밍적 임의 보정 메커니즘 구축

### 3-A. 1회성 데이터 무결성 보정 (DB Cleansing & Syncing)
- 현재 납입금액과 납입비율이 초과된 쓰레기 데이터들을 강제로 일치화(Truncate & Sync)하는 보정 스크립트 작성 및 1회성 실행 환경을 구축합니다.
- 백엔드에 다음과 같은 로직의 API 또는 CLI 스크립트(`scripts/fix_overpaid_lps.py`)를 개발합니다:
  - 1. 모든 LP(Limited Partner) 레코드를 순회.
  - 2. 만약 `LP.paid_in > LP.commitment_amount` 이면,
  - 3. 해당 LP의 마지막 출자 이력(`CapitalCallItem`) 금액을 임의로 삭감(`LP.commitment_amount - 이전까지의 누적액`)시켜버리고 나머지 초과 이력은 과감히 삭제(Hard Delete).
  - 4. 최종적으로 `LP.paid_in` 속성 값을 `LP.commitment_amount` 와 동일하게 맞추어 100% 캡(Cap)을 강제 씌웁니다.
  - 5. DB를 `commit()` 하여 시스템을 정상화 상태로 롤백.
- (물론 운영 환경에서는 위험한 로직이나, 현재는 테스트/개발 데이터의 오염이 심각하므로 강제 동기화가 필요합니다.)

---

## Files to create / modify

| # | Type | File | Changes |
|---|------|------|---------|
| 1 | **[MODIFY]** | `backend/routers/funds.py` | DELETE Fund 엔드포인트 내에 완료/미완료 Task 및 Workflow 조건부 분기 삭제/보존 로직 작성 |
| 2 | **[MODIFY]** | `backend/services/...` (capital call, lp transfer 등) | WorkflowInstance 생성 시 들어가는 `name`, `status_text` 문자열을 명확한 형식의 한글로 전면 교체 |
| 3 | **[MODIFY]** | `frontend/src/components/fund/...` (출자이력 테이블) | Linked Workflow 표기를 한글화된 제목으로 노출 및 딥링크 라우팅 앵커(`.navigate()`) 부착 |
| 4 | **[NEW]**| `backend/scripts/fix_overpaid_history.py` | 납입 초과된 LP의 `CapitalCallItem` 레코드들을 프로그래밍적으로 임의 단절/수정하여 100% 수준으로 맞추는 1회성 클렌징 스크립트 |

*(코덱스는 위 가이드뿐만 아니라 스스로 코드베이스를 `grep_search`하여 문제가 되는 정확한 경로와 파일들을 특정하고 작업해야 합니다.)*

---

## Acceptance Criteria

- [ ] AC-01: 화면에서 '조합 삭제' 액션 수행 시, 해당 조합에 속한 '진행 중'이거나 '대기 중'인 파이프라인/업무보드의 Task들과 연관된 진행 중 워크플로는 깔끔하게 삭제된다.
- [ ] AC-02: 조합이 삭제되더라도, 과거에 이미 상태가 '완료(Completed)'로 마킹되어 기록 보관 목적을 띄는 Task 데이터는 데이터베이스 및 완료된 이력 조회 창에서 증발되지 않고 정상 유지된다 (`fund_id` null 처리 등 고려).
- [ ] AC-03: 프론트엔드의 출자요청(Capital Call) 위저드나 LP 양수양도 기능을 통해 워크플로가 자동 인서트(Insert)된 상태를 조회하면, 워크플로의 이름 및 현재 단계가 한글로 명확하게 표현되어 시각적으로 이질감이 없다.
- [ ] AC-04: 개별 LP 혹은 조합의 세부 '출자 이력' 하단 테이블을 조회했을 때 연결된 워크플로 필드가 더 이상 영문이나 `#숫자` 텍스트로 보이지 않고 `[조합명] OOO 워크플로 진행건` 같은 형태로 렌더링되며, 클릭 시 해당 워크플로 상세 화면으로 정확히 랜딩(Routing)된다.
- [ ] AC-05: 제공된 보정(Cleansing) 스크립트를 백엔드 컨테이너 혹은 로컬 인터프리터에서 `python backend/scripts/fix_overpaid_history.py` 방식으로 작동시키면, 모든 조합을 통틀어 어떠한 환경에서도 납입비율 100%를 초과하는 데이터 표출 에러가 물리적으로 소멸한다. (초과 금액 컷 및 데이터 강제 보정 완료)

---

## 구현 주의사항 (Computer Science Rules)

1. **Relation Cascade의 함정 방어:** Django나 SQLAlchemy 등 백엔드 ORM 단에서 Fund 모델에 삭제(`DELETE`) 리퀘스트가 들어왔을 때 엮어있는 Task들이 단순한 `casclade='all, delete'` 옵션에 의해 완료된 업무까지 통째로 날아가지 않도록, 엔드포인트 안에서 직접 ORM 쿼리의 트랜잭션을 수동으로 섬세하게 분기 처리하십시오.
2. **React Router Linkage 안정성:** 프론트엔드 출자 이력 표에서 Workflow로 이동되는 네비게이션은, 이동 후 뒤로 가기(Back) 동작이 브라우저 히스토리 스택에 안전하게 쌓이는 아키텍처를 선택하십시오. 해당 워크플로 데이터를 Props로 내려주지 말고 즉각적으로 캐시나 API에서 `Fetch`해오도록 Parameter ID에만 의존해야 합니다.
3. **클렌징 스크립트는 Idempotency(멱등성)를 유지할 것:** 임의 데이터 조작 스크립트를 여러 번 실행하더라도 에러가 뿜어지지 않고, 결과 상태 공간이 동일함(한번 100%로 컷팅되었다면 두 번 컷팅되지 않음)을 보장하도록 안전하게 루프 및 조건 로직(`if paid_in >= commitment_amount:`)을 설계해야 합니다.
