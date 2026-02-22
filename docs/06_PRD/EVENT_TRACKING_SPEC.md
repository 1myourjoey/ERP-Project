# V:ON ERP — 이벤트 트래킹 정의서 (Event Tracking Specification)

> **문서 목적:** V:ON ERP 내에서 발생하는 모든 핵심 사용자 행동과 시스템 이벤트를 정의합니다.
> 이 스펙은 추후 분석 대시보드, 감사 로그(Audit Log), 또는 오류 추적 시스템 구축의 기반이 됩니다.
>
> **상위 문서:** [PRD_MASTER.md](./PRD_MASTER.md)
> **최종 업데이트:** 2026-02-22

---

## 1. 공통 이벤트 속성 (Global Properties)

> 모든 이벤트에 자동으로 포함되는 공통 매개변수입니다.

| 매개변수 | 유형 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `user_id` | Number | Yes | 이벤트를 발생시킨 사용자 ID | `3` |
| `user_email` | String | Yes | 사용자 이메일 | `"admin@v-on.co.kr"` |
| `event_timestamp` | Timestamp | Yes | 이벤트 발생 시각 (ISO 8601) | `"2026-02-22T17:30:00+09:00"` |
| `page_location` | String | Yes | 이벤트 발생 페이지 경로 | `"/funds/12"` |
| `fund_id` | Number | No | 연관된 조합 ID (있을 경우) | `12` |

---

## 2. 사용자 속성 (User Properties)

> 사용자 자체를 설명하는 고정 속성입니다. 이벤트가 아닌 사용자에 귀속됩니다.

| 속성 | 유형 | 설명 | 예시 |
|---|---|---|---|
| `role` | String | 사용자 권한 역할 | `"admin"`, `"viewer"` |
| `full_name` | String | 사용자 성명 | `"김관리"` |
| `is_active` | Boolean | 계정 활성 여부 | `true` |

---

## 3. 이벤트 정의 (Event Definitions)

### 3.1 인증 (Authentication)

#### `user_logged_in` — 로그인
| 매개변수 | 유형 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `user_id` | Number | Yes | 로그인한 사용자 ID | `3` |
| `signed_in_at` | Timestamp | Yes | 로그인 시각 | `"2026-02-22T09:00:00+09:00"` |

#### `user_logged_out` — 로그아웃
| 매개변수 | 유형 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `user_id` | Number | Yes | 로그아웃한 사용자 ID | `3` |
| `signed_out_at` | Timestamp | Yes | 로그아웃 시각 | `"2026-02-22T18:00:00+09:00"` |

---

### 3.2 조합(Fund) 관련 이벤트

#### `fund_created` — 조합 생성
| 매개변수 | 유형 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `fund_id` | Number | Yes | 생성된 조합 ID | `15` |
| `fund_name` | String | Yes | 조합명 | `"V:ON 1호 펀드"` |
| `fund_type` | String | Yes | 조합 유형 | `"창업투자조합"` |
| `gp_entity_id` | Number | Yes | 연결된 GP ID | `2` |
| `target_amount` | Number | Yes | 목표 결성액 (원) | `5000000000` |

#### `fund_status_changed` — 조합 상태 변경
| 매개변수 | 유형 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `fund_id` | Number | Yes | 조합 ID | `15` |
| `previous_status` | String | Yes | 변경 전 상태 | `"forming"` |
| `new_status` | String | Yes | 변경 후 상태 | `"active"` |

---

### 3.3 캐피탈콜 및 자금 관련 이벤트

#### `capital_call_created` — 캐피탈콜 생성
| 매개변수 | 유형 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `capital_call_id` | Number | Yes | 캐피탈콜 ID | `8` |
| `fund_id` | Number | Yes | 연결 조합 ID | `15` |
| `total_amount` | Number | Yes | 총 청구 금액 (원) | `1500000000` |
| `due_date` | String | Yes | 납입 기일 | `"2026-03-15"` |
| `lp_count` | Number | Yes | 대상 LP 수 | `12` |

#### `lp_payment_confirmed` — LP 납입 확인
| 매개변수 | 유형 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `capital_call_item_id` | Number | Yes | 납입 항목 ID | `34` |
| `lp_id` | Number | Yes | LP ID | `5` |
| `amount` | Number | Yes | 납입 금액 (원) | `125000000` |
| `paid_date` | String | Yes | 납입 확인일 | `"2026-03-14"` |

#### `fund_paid_in_updated` — 조합 납입액 SSOT 갱신
| 매개변수 | 유형 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `fund_id` | Number | Yes | 조합 ID | `15` |
| `previous_paid_in` | Number | Yes | 갱신 전 납입액 | `1000000000` |
| `new_paid_in` | Number | Yes | 갱신 후 납입액 | `1125000000` |

---

### 3.4 업무 보드(Task) 관련 이벤트

#### `task_created` — 업무 생성
| 매개변수 | 유형 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `task_id` | Number | Yes | Task ID | `101` |
| `title` | String | Yes | 업무명 | `"캐피탈콜 발송 확인"` |
| `quadrant` | String | Yes | 우선순위 사분면 | `"Q1"` |
| `deadline` | String | No | 마감일 | `"2026-02-25T18:00"` |
| `fund_id` | Number | No | 연결 조합 ID | `15` |

#### `task_completed` — 업무 완료
| 매개변수 | 유형 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `task_id` | Number | Yes | Task ID | `101` |
| `actual_time` | String | Yes | 실제 소요시간 | `"1.5h"` |
| `auto_worklog` | Boolean | Yes | WorkLog 자동생성 여부 | `true` |
| `days_until_deadline` | Number | No | 마감까지 남은 일수 (음수=지각) | `-1` |

#### `task_completion_blocked` — 완료 Lock 발동 (에러-프루프)
| 매개변수 | 유형 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `task_id` | Number | Yes | Task ID | `101` |
| `block_reason` | String | Yes | 차단 사유 | `"missing_document"`, `"missing_amount"` |

#### `task_moved` — 업무 사분면 이동 (드래그)
| 매개변수 | 유형 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `task_id` | Number | Yes | Task ID | `101` |
| `from_quadrant` | String | Yes | 이동 전 | `"Q2"` |
| `to_quadrant` | String | Yes | 이동 후 | `"Q1"` |

---

### 3.5 워크플로(Workflow) 관련 이벤트

#### `workflow_instance_created` — 워크플로 인스턴스 생성
| 매개변수 | 유형 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `workflow_id` | Number | Yes | 인스턴스 ID | `7` |
| `template_id` | Number | Yes | 기반 템플릿 ID | `3` |
| `fund_id` | Number | Yes | 연결 조합 ID | `15` |
| `template_name` | String | Yes | 템플릿명 | `"결성총회 개최"` |

#### `workflow_step_completed` — 워크플로 단계 완료
| 매개변수 | 유형 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `workflow_id` | Number | Yes | 인스턴스 ID | `7` |
| `step_id` | Number | Yes | 단계 ID | `22` |
| `step_name` | String | Yes | 단계명 | `"조합원 명부 취합"` |
| `step_order` | Number | Yes | 단계 순서 | `3` |

#### `workflow_step_blocked` — 워크플로 단계 Lock 발동 (에러-프루프)
| 매개변수 | 유형 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `workflow_id` | Number | Yes | 인스턴스 ID | `7` |
| `step_id` | Number | Yes | 단계 ID | `22` |
| `missing_document_name` | String | Yes | 누락된 필수 서류명 | `"조합원 명부 (PDF)"` |

---

### 3.6 투자(Investment) 관련 이벤트

#### `investment_created` — 투자 등록
| 매개변수 | 유형 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `investment_id` | Number | Yes | 투자 ID | `20` |
| `company_name` | String | Yes | 피투자 기업명 | `"스타트업A"` |
| `fund_id` | Number | Yes | 조합 ID | `15` |
| `amount` | Number | Yes | 투자 금액 (원) | `300000000` |

#### `valuation_recorded` — 가치평가 기록
| 매개변수 | 유형 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `valuation_id` | Number | Yes | 가치평가 ID | `9` |
| `investment_id` | Number | Yes | 투자 ID | `20` |
| `valuation_amount` | Number | Yes | 평가액 (원) | `600000000` |
| `valuation_date` | String | Yes | 평가 기준일 | `"2026-06-30"` |

#### `exit_recorded` — Exit(회수) 등록
| 매개변수 | 유형 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `exit_id` | Number | Yes | Exit ID | `4` |
| `investment_id` | Number | Yes | 투자 ID | `20` |
| `proceeds` | Number | Yes | 회수액 (원) | `900000000` |
| `exit_date` | String | Yes | 회수일 | `"2026-09-01"` |

---

### 3.7 문서 및 보고서 관련 이벤트

#### `document_uploaded` — 문서 업로드
| 매개변수 | 유형 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `document_id` | Number | Yes | 문서 ID | `55` |
| `document_name` | String | Yes | 파일명 | `"조합원명부_최종.pdf"` |
| `fund_id` | Number | No | 연결 조합 ID | `15` |
| `workflow_step_id` | Number | No | 연결 워크플로 단계 ID | `22` |

#### `report_submitted` — 보고서 제출 완료
| 매개변수 | 유형 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `report_id` | Number | Yes | 보고서 ID | `11` |
| `report_type` | String | Yes | 보고서 유형 | `"biz_report"`, `"regular_report"` |
| `fund_id` | Number | Yes | 연결 조합 ID | `15` |

---

## 4. 에러-프루프 이벤트 모니터링 요약

> 아래 이벤트들은 시스템의 에러-프루프 작동 여부를 측정하는 핵심 지표입니다.

| 이벤트명 | 의미 | 활용 예시 |
|---|---|---|
| `task_completion_blocked` | 업무 완료 차단 횟수 | "Lock이 하루 몇 번 발동되는가?" |
| `workflow_step_blocked` | 워크플로 단계 차단 횟수 | "어떤 서류가 가장 많이 누락되는가?" |
| `task_completed` (days_until_deadline < 0) | 마감 초과 완료 | "D-Day 지각 업무 비율" |

---

## 5. 변경 이력

| 날짜 | 버전 | 변경 내용 |
|---|---|---|
| 2026-02-22 | v0.1 | 최초 작성 |
