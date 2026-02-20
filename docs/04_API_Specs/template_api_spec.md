# 백엔드 API 명세 템플릿 (Backend API Specifications)

본 프로젝트는 FastAPI 라이브러리의 자동화된 OpenAPI(Swagger UI: `/docs`) 구조를 사용합니다.
단, 외부 연동(K-IFRS, 국세청, 외부 출자자 시스템 등)이나 내부의 복잡한 비즈니스 로직(결재, 트랜잭션 등)을 위해 **명시적 문서화가 필요한 타겟 API**는 이곳에 기록하십시오.

---

## 1. 개요 (Overview)
- **API 명칭:** [ex: 출자요청(Capital Call) 납입 전체 승인 및 동기화 API]
- **담당자 / 작성일:**
- **연관 화면 / 모듈:** [ex: Dashboard, Fund Detail]

---

## 2. API Endpoint 규격 (Specification)
- **HTTP Method:** `POST` / `GET` / `PUT` / `DELETE` / `PATCH`
- **URI:** `[baseUrl]/api/workflows/{id}/pay`
- **설명:** [ex: 납입 확인 워크플로우를 진행상태를 '완료'로 바꾸며, 관련된 모든 CapitalCallItem 의 paid 상태를 1로 변경하고 펀드의 전체 납입금액을 실시간으로 캐시-서버 DB에 동기화함.]

---

## 3. Request (요청 데이터)

### Headers
| Key | Value (Type) | Required | Description |
|---|---|---|---|
| `Authorization` | Bearer [token] | Y | JWT 인증 토큰 (세션 쿠키로 대체 가능) |
| `Content-Type` | `application/json` | Y | 기본 JSON 통신 |

### Path Variables & Params
| Name | Type | Required | Description |
|---|---|---|---|
| `workflow_id` | Integer | Y | 워크플로우 인스턴스의 고유 식별자 |

### Body Payload
```json
// Example if needed:
{
  "memo": "최종 송금 완료건, 이체 확인증 회계팀 전달 요망",
  "paid_date": "2026-02-20"
}
```

---

## 4. Response (응답 결과)

### 성공 케이스 (200 OK or 201 Created)
- 백엔드에서 반환하는 결과 코드 및 데이터 구조.
```json
{
  "status": "success",
  "message": "해당 출자요청 건에 대한 100% 납입 처리가 성공적으로 DB에 합산되었습니다."
}
```

### 에러 처리 (Exception Handling)
| Status Code | Error Message (JSON) | Cause |
|---|---|---|
| `400 Bad Request` | `"납입 총액이 약정 총액을 초과할 수 없습니다."` | CapitalCallItem의 총합이 LP.commitment_amount 를 오버했을 때 (Transaction Rollback 됨) |
| `404 Not Found` | `"해당 워크플로우를 찾을 수 없습니다."` | workflow_id 가 잘못된 경우 |
| `409 Conflict` | `"이미 납입이 완료된 건입니다."` | 멱등성 에러: 중복 호출 발생 시 |

---

## 5. C.S. 레벨 디버깅 / 주의사항 (Implementation Rules)
- 프론트엔드 연동 호출 시, 이 API가 200 OK를 떨어뜨리면 반드시 `queryClient.invalidateQueries(['funds'])` 형태로 Query Key 무효화를 쏴야 합니다.
- 백엔드는 중간에 DB Exception이 발생할 경우 반드시 `db.rollback()` 커맨드를 트랜잭션 에러 헨들러에 삽입하여 데이터 원장(Commitment Ledger)이 오염되는 것을 사전에 막아야 합니다.
