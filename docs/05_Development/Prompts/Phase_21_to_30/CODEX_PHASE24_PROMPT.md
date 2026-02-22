# Phase 24: 카드 클릭 애니메이션 분리 + 조합관리 UX 개선 + 워크플로우 모달 충돌 수정 + 데이터 마이그레이션 + LP 주소록

> **Priority:** P0
> **Goal:** 대시보드 외 카드 클릭 튕김 제거, 조합/LP 입력 반복 제거, 워크플로우 템플릿 UX 버그 수정, 조합/LP 데이터 이관 체계 구축, LP 주소록 도입

---

## Table of Contents

1. [Part 1 - 카드 클릭 튕김 애니메이션 정책 분리](#part-1---카드-클릭-튕김-애니메이션-정책-분리)
2. [Part 2 - 조합 관리 UX/데이터 입력 개선](#part-2---조합-관리-ux데이터-입력-개선)
3. [Part 3 - 조합투자 워크플로우 탭 UI 버그 수정](#part-3---조합투자-워크플로우-탭-ui-버그-수정)
4. [Part 4 - 조합/LP 데이터 마이그레이션 방식 구현](#part-4---조합lp-데이터-마이그레이션-방식-구현)
5. [Part 5 - LP 주소록 구현 및 연계](#part-5---lp-주소록-구현-및-연계)
6. [Files to Create / Modify](#files-to-create--modify)
7. [Acceptance Criteria](#acceptance-criteria)
8. [구현 주의사항](#구현-주의사항)

---

## 현재 상태 요약

1. 전역 카드 스타일(`frontend/src/index.css`)에 `.card-base:active { transform: scale(0.99); }`가 있어 대시보드 외 탭에서도 클릭 시 튕김이 발생.
2. 조합 생성 폼(`frontend/src/pages/FundsPage.tsx`)과 조합 수정 폼(`frontend/src/pages/FundDetailPage.tsx`)의 입력 항목이 불일치해 생성 후 재입력이 필요.
3. 조합 수정에서 등록성립일(`registration_date`) 수정 UX가 불완전하거나 누락되어 있음.
4. 조합 유형 옵션에 `농림수산식품투자조합`이 없음.
5. 조합 생성 시 LP 유형이 `GP`여도 고유계정(GP Entity)의 사업자번호/주소/법인명이 자동 반영되지 않음.
6. 워크플로우 탭(`frontend/src/pages/WorkflowsPage.tsx`)의 `새 템플릿` 버튼 라벨에 `+`가 중복 표기되고, 템플릿 모달이 상단 네비게이션(`Layout.tsx`의 `h-14`)과 시각 충돌.
7. 조합/LP 대량 입력을 위한 표준 이관(엑셀 업로드) 경로가 부재.
8. LP 재사용을 위한 주소록(마스터 데이터) 테이블/화면/API가 없음.

---

## Part 1 - 카드 클릭 튕김 애니메이션 정책 분리

### 1-A. 요구사항

`대시보드 이외` 탭에서 카드 클릭 시 튕겨 보이는 애니메이션을 제거한다.

### 1-B. 구현 원칙

1. 전역 `.card-base:active`의 `scale`을 제거해 기본 카드 클릭 튕김을 비활성화.
2. 대시보드에서만 필요한 카드 인터랙션은 별도 클래스(예: `.dashboard-card`)로 분리.
3. 대시보드(`frontend/src/pages/DashboardPage.tsx`) 카드에만 분리 클래스 적용.
4. 버튼(`.primary-btn`, `.secondary-btn`) 애니메이션은 이번 범위에서 유지.

### 1-C. 완료 기준

1. `DashboardPage`를 제외한 모든 탭 카드 클릭 시 scale 변화가 없어야 한다.
2. 대시보드 카드의 호버/클릭 인터랙션은 기존 UX 의도를 유지해야 한다.

---

## Part 2 - 조합 관리 UX/데이터 입력 개선

### 2-A. 조합 수정에서 등록성립일 수정 가능화

1. `FundDetailPage`의 조합 수정 폼에 `registration_date` 입력을 명시적으로 노출/활성화.
2. `updateFund` payload에 `registration_date`가 누락 없이 반영되도록 정리.
3. 조회 카드/상세 요약에도 변경값이 즉시 반영되도록 쿼리 무효화 정리.

### 2-B. 조합 유형 추가

1. 조합 유형 옵션에 `농림수산식품투자조합` 추가.
2. 적용 위치:
`frontend/src/pages/FundsPage.tsx`
`frontend/src/pages/FundDetailPage.tsx`
3. 레거시 데이터 호환:
기존 값이 있어도 깨지지 않아야 하며, 문자열 비교 하드코딩이 있다면 함께 보정.

### 2-C. 조합 생성 시 LP 유형 `GP` 자동입력

1. 조합 생성 폼에서 LP row의 `type === 'GP'` 선택 시, 현재 선택된 조합 GP(`form.gp`)와 매칭되는 고유계정 정보를 자동 주입:
`LP명 <- GP 법인명`
`사업자등록번호 <- GP business_number`
`주소 <- GP address`
2. 자동입력은 최초 1회 주입 + 사용자가 수동 수정 가능하도록 구현.
3. 매칭되는 GP 정보가 없으면 경고 메시지 표시(토스트 또는 인라인).
4. 적용 대상:
`frontend/src/pages/FundsPage.tsx`의 생성 폼 LP 입력 구간.

### 2-D. 최초 생성 후 재입력 불편 해소

1. 생성/수정 폼 필드 불일치 해소:
생성(`FundsPage`)과 수정(`FundDetailPage`)에서 동일한 핵심 필드를 다루도록 컴포넌트 공용화.
2. 권장 구조:
`frontend/src/components/funds/FundCoreFields.tsx` 신설 후 생성/수정 페이지에서 재사용.
3. 최소 공통 필드:
조합명, 조합유형, 상태, 결성일, 등록번호, 등록성립일, 만기일, 해산일, GP, Co-GP, 신탁사, 총약정액, GP출자금, 출자방식, 투자기간종료일, 관리보수율, 성과보수율, 허들, 운용계좌.
4. 생성 직후 다시 수정하지 않아도 운영 가능한 수준으로 초기 입력을 완결.

---

## Part 3 - 조합투자 워크플로우 탭 UI 버그 수정

### 3-A. `새 템플릿` 버튼의 `+` 중복 제거

1. 현재 버튼은 아이콘 `Plus` + 텍스트 `+ 새 템플릿`이 동시 표기됨.
2. 텍스트의 `+` 제거하여 `새 템플릿`만 표기.
3. 대상:
`frontend/src/pages/WorkflowsPage.tsx`

### 3-B. 템플릿 모달의 상단 네비게이션 충돌 제거

1. 상단 네비 높이(`Layout.tsx`의 `h-14`)를 고려해 모달 오버레이 위치를 조정.
2. 권장:
오버레이를 `top-14` 기준으로 내려 배치하고 모달 컨테이너 `max-h`를 `calc(100vh - navHeight - margin)`으로 제한.
3. `create`/`edit` 모달 모두 동일하게 적용.
4. 스크롤은 모달 내부에서 처리되며, 네비와 겹치지 않아야 한다.

---

## Part 4 - 조합/LP 데이터 마이그레이션 방식 구현

### 4-A. 구현 목표

업무 데이터는 수기 입력을 유지하되, `조합정보 + LP정보`는 엑셀 기반으로 안전하게 이관 가능하게 만든다.

### 4-B. 백엔드 구현

1. `backend/routers/funds.py`에 마이그레이션 API 추가:
`GET /api/funds/migration-template`
`POST /api/funds/migration-validate`
`POST /api/funds/migration-import`
2. 템플릿 포맷:
Sheet `Funds`, Sheet `LPs`, Sheet `Guide`.
3. 파싱 라이브러리:
기존 코드베이스와 일관되게 `openpyxl` 사용.
4. 검증 규칙:
필수값, enum(status/type), 날짜형식(YYYY-MM-DD), 숫자형식(0 이상), LP의 조합 참조키 존재 여부.
5. Import 모드:
`insert` / `upsert` 지원.
6. Upsert 키 권장:
Fund: `registration_number` 우선, 없으면 `name + formation_date`.
LP: `fund_key + business_number` 우선, 없으면 `fund_key + name`.
7. 트랜잭션:
검증 실패 시 롤백, 성공 시 일괄 커밋.
8. 응답:
성공/실패 건수, 행별 에러 목록(row, column, reason) 반환.

### 4-C. 프론트 구현

1. 조합 관리 영역(권장: `FundsPage` 또는 `FundOverviewPage`)에 마이그레이션 카드 추가.
2. 기능:
템플릿 다운로드, 파일 업로드, 사전검증 결과표, 확정 Import 실행.
3. UX:
검증 통과 전에는 Import 버튼 비활성화.
4. Import 성공 후 관련 쿼리 무효화:
`funds`, `fund`, `fundOverview`.

---

## Part 5 - LP 주소록 구현 및 연계

### 5-A. 도메인 설계

LP를 조합별 하위 데이터로만 두지 않고, 재사용 가능한 `LP 주소록 마스터`를 도입한다.

### 5-B. 백엔드 구현

1. 신규 모델/스키마/라우터 추가:
`LPAddressBook` (예: `backend/models/lp_address_book.py`)
`backend/schemas/lp_address_book.py`
`backend/routers/lp_address_book.py`
2. 최소 필드:
`id`, `name`, `type`, `business_number`, `address`, `contact`, `memo`, `gp_entity_id(optional)`, `is_active`, `created_at`, `updated_at`.
3. API:
목록/검색, 생성, 수정, 비활성화(soft delete 권장), 상세.
4. 데이터 일관성:
`business_number` 중복 정책 정의(완전 unique 또는 name+business_number unique).
5. DB 마이그레이션 파일 생성 및 `backend/main.py`에 라우터 등록.

### 5-C. 프론트 구현

1. 신규 페이지:
`frontend/src/pages/LPAddressBookPage.tsx`
2. 네비게이션 추가:
`frontend/src/components/Layout.tsx` 메뉴에 `LP 주소록` 진입점 추가.
3. LP 입력 연계:
`FundsPage` 조합 생성 LP 입력
`FundDetailPage` LP 추가/수정 입력
에서 `주소록에서 선택`을 제공하고 선택 즉시 필드 자동입력.
4. GP 자동입력과 주소록 충돌 정책:
`LP유형=GP` 선택 시 우선 GP 정보 자동입력, 이후 사용자가 필요 시 주소록값으로 덮어쓸 수 있게 명시.

### 5-D. 마이그레이션 연계

1. Part 4의 엑셀 Import 과정에서 LP 데이터는 주소록에도 동시 반영(옵션 토글 제공).
2. 이미 존재하는 주소록 레코드는 upsert 규칙으로 병합.

---

## Files to Create / Modify

### Frontend

1. `frontend/src/index.css`
2. `frontend/src/pages/DashboardPage.tsx`
3. `frontend/src/pages/FundsPage.tsx`
4. `frontend/src/pages/FundDetailPage.tsx`
5. `frontend/src/pages/WorkflowsPage.tsx`
6. `frontend/src/components/Layout.tsx`
7. `frontend/src/lib/api.ts`
8. `frontend/src/lib/labels.ts` (상태/라벨 보정 필요 시)
9. `frontend/src/components/funds/FundCoreFields.tsx` (신규, 공용화)
10. `frontend/src/pages/LPAddressBookPage.tsx` (신규)

### Backend

1. `backend/models/fund.py` (필요 시 연계 수정)
2. `backend/models/lp_address_book.py` (신규)
3. `backend/schemas/fund.py` (마이그레이션 API 입력/응답 모델)
4. `backend/schemas/lp_address_book.py` (신규)
5. `backend/routers/funds.py` (migration validate/import/template)
6. `backend/routers/lp_address_book.py` (신규 CRUD)
7. `backend/main.py` (router 등록)
8. `backend/migrations/versions/<new_revision>.py` (신규 테이블/인덱스)

---

## Acceptance Criteria

1. 대시보드 외 탭에서 카드 클릭 시 튕김(scale) 애니메이션이 발생하지 않는다.
2. 조합 수정에서 등록성립일을 수정하고 저장하면 즉시 반영된다.
3. 조합 유형 목록에 `농림수산식품투자조합`이 노출되고 정상 저장된다.
4. 조합 생성에서 LP 유형 `GP` 선택 시 고유계정 기반 자동입력이 동작한다.
5. 생성/수정 폼 필드가 실질적으로 통일되어 생성 후 재입력 필요가 크게 줄어든다.
6. 워크플로우 탭의 `새 템플릿` 버튼 라벨에서 중복 `+`가 제거된다.
7. 템플릿 생성/수정 모달이 상단 네비게이션과 겹치지 않는다.
8. 조합/LP 엑셀 템플릿 다운로드, 검증, Import가 end-to-end로 동작한다.
9. LP 주소록 화면에서 CRUD 가능하며, 조합 LP 입력 시 주소록 자동입력을 사용할 수 있다.
10. Import/주소록/조합 수정 후 관련 목록/상세 화면의 데이터 동기화가 깨지지 않는다.

---

## 구현 주의사항

1. 기존 라우트/기능(출자요청, 워크플로우, 조합상세, 보고서)에 영향이 없도록 변경 범위를 분리.
2. 전역 CSS 변경은 최소화하고, 페이지별 클래스 분리로 사이드이펙트를 통제.
3. 마이그레이션 Import는 반드시 `validate -> import` 2단계로 구성.
4. 업로드 파일 에러 메시지는 사용자 친화적으로 row/column 기준으로 반환.
5. 주소록/조합LP 동기화 시 중복 생성 방지 정책(업서트 키)을 코드와 문서에 명확히 남길 것.
6. 한글 문자열/파일 인코딩은 UTF-8 기준으로 유지.

