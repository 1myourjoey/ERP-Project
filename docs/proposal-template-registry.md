# Proposal Template Registry

## 목적

제안서 작성의 중심을 `엑셀 파일 자체`가 아니라 `양식 메타데이터 + 매핑 규칙 + 검증 규칙`으로 옮긴다.

이 레이어가 생기면 다음이 가능해진다.

- 기관별 제안서 양식을 버전 단위로 관리
- 원본 엑셀 경로와 시트 구성을 시스템에 등록
- 셀 단위 매핑과 반복 테이블 매핑을 분리 관리
- 제출 전 누락값, 행 수 제한, 필수 셀 작성 여부를 검증
- 현재 `proposal_data` 기반 초안 시스템과 자연스럽게 연결

## 이번 단계에서 추가된 엔티티

- `proposal_templates`
  - 양식 마스터
  - 예: 성장금융 제안서, 농식품 모태펀드 양식
- `proposal_template_versions`
  - 같은 양식의 연도별/기관 개정본
  - 원본 파일 경로와 활성 버전 상태 보관
- `proposal_template_sheets`
  - 버전별 시트 카탈로그
- `proposal_template_field_mappings`
  - 고정 셀 매핑
  - 예: `selected_gp_entity.name -> 개요!B2`
- `proposal_template_table_mappings`
  - 반복 행 매핑
  - 예: `proposal_managers -> 핵심인력!A5`
- `proposal_template_validation_rules`
  - 필수값, 행 수, 대상 셀 검증 규칙

## 운영 흐름

1. `proposal_templates`에 기관/양식 마스터를 등록한다.
2. 새 엑셀 양식이 오면 `proposal_template_versions`를 만든다.
3. 원본 파일 경로를 넣으면 워크북 시트를 자동으로 읽어 `proposal_template_sheets`를 만든다.
4. 사람이 셀 매핑과 테이블 매핑을 채운다.
5. 검증 규칙을 등록한다.
6. 이전 버전을 복제해서 새 버전 초안을 만든다.
7. 이전 버전과 새 버전의 차이 나는 시트/매핑만 비교한다.
8. 버전을 `active`로 전환한다.
9. 이후 export 엔진은 활성 버전 기준으로 실제 양식 파일에 값을 주입한다.

## 현재 시스템과의 연결 방식

- 현재 `proposal_data`는 ERP/DB에서 제안서용 초안을 만든다.
- 새 레지스트리는 `어느 양식 파일의 어느 셀에 무엇을 넣을지`를 설명한다.
- 즉:
  - `proposal_data` = 데이터 원천과 초안 작업대
  - `proposal_template_registry` = 실제 엑셀 양식 설명서

## 다음 구현 우선순위

## 현재 제공 API

- `GET /api/proposal-templates`
- `POST /api/proposal-templates`
- `GET /api/proposal-templates/{template_id}`
- `PATCH /api/proposal-templates/{template_id}`
- `POST /api/proposal-templates/{template_id}/versions`
- `GET /api/proposal-template-versions/{version_id}`
- `PATCH /api/proposal-template-versions/{version_id}`
- `POST /api/proposal-template-versions/{version_id}/clone`
- `GET /api/proposal-template-versions/compare`
- `POST /api/proposal-template-versions/{version_id}/activate`

### 1. 폴더 인덱서

`C:\Users\1llal\Desktop\제안서 엑셀 양식` 폴더를 스캔해서

- 파일명
- 수정일
- 시트명
- 버전 후보

를 자동 등록하는 작업이 필요하다.

### 2. 매핑 편집 UI

최소 기능:

- 시트 목록
- 셀 주소 입력
- source path 선택
- 반복 테이블 시작 셀 입력
- 검증 규칙 입력

### 3. 실제 export 엔진 교체

지금은 일부 양식을 코드에서 새 workbook으로 생성한다.

장기적으로는 다음 순서로 바꾼다.

- 원본 템플릿 복사
- field mapping 주입
- table mapping 주입
- validation rule 검사
- 결과 파일 저장

### 4. 이전 회차 값 복사

제안서 작성 편의성을 위해 아래 기능이 중요하다.

- 직전 제출 회차 복사
- 기관별 공통값 재사용
- 누락값 하이라이트
- 변경된 셀만 비교 표시
