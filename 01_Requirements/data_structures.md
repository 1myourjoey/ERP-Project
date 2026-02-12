# 데이터 구조 정의

> ERP 시스템 데이터 모델
> 작성일: 2026-02-12

---

## 1. 작업 관리 (Task)

### 1.1 작업 보드 구조

**분류:** 아이젠하워 매트릭스

| 분류 | 설명 | 우선순위 |
|------|------|----------|
| Q1 | 긴급 & 중요 | 즉시 처리 |
| Q2 | 중요 & 비긴급 | 계획/자기개발 |
| Q3 | 긴급 & 비중요 | 위임 가능 |
| Q4 | 비긴급 & 비중요 | 나중에/제거 |

### 1.2 작업 필드

```
Task {
  id: string,
  title: string,           // 작업명
  deadline: datetime,      // 마감일시
  estimated_time: string,  // 예상 소요시간 (예: "2h", "30m", "1일")
  quadrant: enum,          // Q1, Q2, Q3, Q4
  memo: string,            // 메모 (워크플로우 연동 정보 포함)
  status: enum,            // pending, in_progress, completed
  created_at: datetime,
  completed_at: datetime,
  actual_time: string,     // 실제 소요시간
}
```

### 1.3 작업 메모 패턴

메모에서 파싱해야 할 패턴:
- 날짜: `목표: 2/13`, `2/13까지`, `이번 주 목표: 2/13`
- 워크플로우: `계약일(2/9) 15일 이내`
- 상태: `팀장님 리뷰✓`, `답변 대기 중`

---

## 2. 업무 일지 (Work Log)

### 2.1 일지 필드

```
WorkLog {
  id: string,
  date: date,              // 작업일
  category: string,        // 구분 (투심위, 투자계약, 조합감사 등)
  title: string,           // 작업명
  content: string,         // 내용
  status: enum,            // 완료, 진행중
  estimated_time: string,  // 예상 소요시간
  actual_time: string,     // 실제 소요시간
  time_diff: string,       // 차이 (예: "-30m", "+15m")
  details: string[],       // 세부사항
  lessons: string[],       // 교훈
  follow_ups: string[],    // 후속업무
}
```

### 2.2 카테고리 목록

| 카테고리 | 설명 |
|----------|------|
| 투심위 | 투자심의위원회 관련 |
| 투자계약 | 투자계약 체결 관련 |
| 투자 후 등록 | ERP 등록, 운용지시 등 |
| 조합감사 | 기말감사, 회계감사 |
| 내부보고회 | 분기별 내부보고회 |
| 연말정산 | 연말정산 관련 |
| 총무 | 일반 총무 업무 |
| 시스템 설정 | IT 관련 |
| 내부 프로세스 | 체크리스트, 양식 등 |
| 바이블 | 피투자기업 서류 관리 |
| LP바인더 | LP 관련 서류 관리 |

---

## 3. 워크플로우 (Workflow)

### 3.1 워크플로우 필드

```
Workflow {
  id: string,
  name: string,            // 워크플로우명
  trigger: string,         // 트리거 조건
  category: string,        // 카테고리
  steps: Step[],           // 단계 목록
  documents: Document[],   // 필수 서류
  warnings: string[],      // 주의사항
}

Step {
  order: number,
  name: string,            // 작업명
  timing: string,          // 타이밍 (D-7, D-day, D+2 등)
  estimated_time: string,  // 예상 소요시간
  quadrant: enum,          // Q1~Q4
  memo: string,            // 메모
  dependencies: string[],  // 선행 작업
}

Document {
  name: string,
  required: boolean,
  timing: string,          // 필요 시점
  notes: string,
}
```

---

## 4. 조합 (Fund)

### 4.1 조합 필드

```
Fund {
  id: string,
  name: string,            // 조합명
  type: enum,              // 투자조합, 사원총회 등
  registration_date: date, // 등록일
  status: enum,            // 운용중, 청산 등
  gp: string,              // GP (업무집행조합원)
  co_gp: string[],         // Co-GP
  lps: LP[],               // LP 목록
  aum: number,             // 운용자산
}

LP {
  id: string,
  name: string,
  type: enum,              // 개인, 법인, 조합 등
  commitment: number,      // 약정금액
  paid_in: number,         // 납입금액
  contact: string,
}
```

---

## 5. 투자 (Investment)

### 5. 투자 필드

```
Investment {
  id: string,
  fund_id: string,         // 투자 조합
  company_id: string,      // 피투자사
  investment_date: date,   // 투자일
  amount: number,          // 투자금액
  shares: number,          // 주식 수
  share_price: number,     // 주당 가격
  valuation: number,       // 밸류에이션
  contribution_rate: float,// 기여율
  instrument: enum,        // 보통주, 우선주, CB 등
  status: enum,            // 투자중, 회수, 손실 등
  documents: Document[],   // 관련 서류
}
```

---

## 6. 피투자사 (Portfolio Company)

### 6.1 피투자사 필드

```
Company {
  id: string,
  name: string,
  business_number: string, // 사업자등록번호
  ceo: string,             // 대표자
  address: string,
  industry: string,        // 업종
  vics_registered: boolean,// VICS 등록 여부
  investments: Investment[],
  documents: Document[],   // 바이블 서류
}
```

---

## 7. 일정 (Calendar Event)

### 7.1 일정 필드

```
CalendarEvent {
  id: string,
  title: string,
  date: date,
  time: time,              // 선택
  duration: number,        // 분 단위
  description: string,
  status: enum,            // pending, completed
  task_id: string,         // 연결된 작업
}
```

### 7.2 완료 표시

- 완료 시 제목 앞에 `(완)` 추가
- 예: `(완) 기말감사 요청자료 준비`

---

## 8. 체크리스트 (Checklist)

### 8.1 체크리스트 필드

```
Checklist {
  id: string,
  name: string,
  category: string,
  items: CheckItem[],
}

CheckItem {
  order: number,
  name: string,
  required: boolean,
  checked: boolean,
  notes: string,
}
```

---

**마지막 업데이트:** 2026-02-12
