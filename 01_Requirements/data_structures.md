# 데이터 구조 정의

> ERP 시스템 데이터 모델 — business_overview.md 영역 매핑
> 작성일: 2026-02-13

---

## 영역별 모델 맵

```
A. 조합 관리          B. 투자 관리          C. 회수 관리
┌──────────┐         ┌──────────────┐      ┌──────────────┐
│ Fund     │◄────────│ Investment   │─────▶│ ExitCommittee│
│ LP       │         │ InvestmentDoc│      │ ExitTrade    │
│ Capital  │         │ Transaction  │◄─────│              │
│ Assembly │         └──────┬───────┘      └──────────────┘
└────┬─────┘                │
     │              D. 포트폴리오            E. 서류 관리
     │              ┌──────────────┐      ┌──────────────┐
     │              │ Company      │      │ DocumentSet  │
     └─────────────▶│ Valuation    │      │ Document     │
                    │ BizReport    │      └──────────────┘
                    └──────────────┘
     F. 회계                  I. 작업·기록
     ┌──────────────┐      ┌──────────────┐
     │ Account      │      │ Task         │
     │ JournalEntry │      │ WorkLog      │
     │ BankAccount  │      │ Workflow*    │
     └──────────────┘      │ Checklist    │
                           │ CalendarEvent│
                           └──────────────┘
```

---

## A. 조합 관리

### Fund (조합)

```
Fund {
  id: int (PK)
  name: string                  // 조합명 (필수)
  type: enum                    // 투자조합 | 사원총회
  formation_date: date          // 결성일
  maturity_date: date           // 만기일 → 자동 알림
  status: enum                  // 결성전 | 운용중 | 청산중 | 청산완료
  gp: string                    // GP (업무집행조합원)
  co_gp: string[]               // Co-GP (복수)
  trustee: string               // 수탁사
  commitment_total: decimal     // 약정총액 (자동 합산)
  aum: decimal                  // 운용자산 (자동 계산)
  mgmt_fee_rate: decimal        // 관리보수율 (%)
  performance_fee_rate: decimal // 성과보수율 (%)
  hurdle_rate: decimal          // 허들레이트 (%)
  account_number: string        // 대표 계좌번호
  memo: string
  created_at: datetime
  updated_at: datetime

  -- 관계 --
  lps: LP[]
  investments: Investment[]
  capital_calls: CapitalCall[]
  distributions: Distribution[]
  assemblies: Assembly[]
  accounting_ledger: Ledger
}
```

**영역:** A-2 (기본정보), A-4 (출자·배분), A-6 (수익률)

### LP (조합원/출자자)

```
LP {
  id: int (PK)
  fund_id: int (FK → Fund)
  name: string                  // LP명 (필수)
  type: enum                    // 개인 | 법인 | 모태펀드 | 연기금 | 기타
  commitment: decimal           // 약정금액
  paid_in: decimal              // 납입금액 (출자 등록 시 자동 갱신)
  ownership_pct: decimal        // 지분율 (자동 계산: commitment / fund.commitment_total)
  contact_name: string          // 담당자명
  contact_email: string         // 이메일
  contact_phone: string         // 전화번호
  tax_deduction: boolean        // 소득공제 대상 여부 (개인LP)
  memo: string
  created_at: datetime
}
```

**영역:** A-3

### CapitalCall (출자)

```
CapitalCall {
  id: int (PK)
  fund_id: int (FK → Fund)
  call_date: date               // 출자 기준일
  call_type: enum               // 설립출자 | 추가출자 | 멀티클로징
  total_amount: decimal         // 출자 총액
  memo: string
  created_at: datetime

  -- 관계 --
  items: CapitalCallItem[]      // LP별 납입 내역
  operation_order: OperationOrder  // 운용지시서
}

CapitalCallItem {
  id: int (PK)
  capital_call_id: int (FK)
  lp_id: int (FK → LP)
  amount: decimal               // 납입금액 (지분율 기반 자동 계산, 수동 조정 가능)
  paid: boolean                 // 납입 확인
  paid_date: date               // 실제 납입일
}
```

**영역:** A-4 (출자)
**자동 연결:** 출자 확정 → JournalEntry 자동 생성 (차변: 현금, 대변: 출자금)

### Distribution (배분)

```
Distribution {
  id: int (PK)
  fund_id: int (FK → Fund)
  dist_date: date               // 배분 기준일
  dist_type: enum               // 원금배분 | 수익배분 | 잔여재산배분
  principal_total: decimal      // 배분 원금 총액
  profit_total: decimal         // 배분 수익 총액
  performance_fee: decimal      // 성과보수 지급액
  memo: string
  created_at: datetime

  -- 관계 --
  items: DistributionItem[]     // LP별 배분 내역
  operation_order: OperationOrder
}

DistributionItem {
  id: int (PK)
  distribution_id: int (FK)
  lp_id: int (FK → LP)
  principal: decimal            // 원금 배분액 (자동 계산)
  profit: decimal               // 수익 배분액 (자동 계산)
}
```

**영역:** A-4 (배분)
**자동 연결:** 배분 확정 → JournalEntry 자동 생성

### Assembly (조합원 총회)

```
Assembly {
  id: int (PK)
  fund_id: int (FK → Fund)
  type: enum                    // 결성총회 | 정기총회 | 임시총회
  date: date                    // 총회 일자
  agenda: string                // 안건
  status: enum                  // 준비중 | 소집통지완료 | 개최완료
  minutes_completed: boolean    // 의사록 작성 완료
  memo: string
  created_at: datetime

  -- 관계 --
  documents: Document[]         // 총회 서류 (소집통지, 의안, 의사록 등)
  workflow_instance: WorkflowInstance
}
```

**영역:** A-5

### FundPerformance (수익률/성과) — 뷰 또는 계산 모델

```
FundPerformance {
  fund_id: int (FK → Fund)
  as_of_date: date              // 기준일
  irr: decimal                  // IRR (내부수익률)
  tvpi: decimal                 // TVPI (Total Value / Paid-In)
  dpi: decimal                  // DPI (Distribution / Paid-In)
  rvpi: decimal                 // RVPI (Residual Value / Paid-In)
  total_invested: decimal       // 투자 총액
  total_distributed: decimal    // 배분 총액
  residual_value: decimal       // 잔존가치 (가치평가 기반)
  mgmt_fee_cumulative: decimal  // 관리보수 누적
}
```

**영역:** A-6 — 자동 계산 (Investment, Distribution, Valuation 데이터 기반)

---

## B. 투자 관리

### PortfolioCompany (피투자사)

```
PortfolioCompany {
  id: int (PK)
  name: string                  // 기업명 (필수)
  business_number: string       // 사업자등록번호
  corp_number: string           // 법인등록번호
  ceo: string                   // 대표이사
  address: string               // 본점 소재지
  industry: string              // 업종
  founded_date: date            // 설립일
  vics_registered: boolean      // VICS 등록 여부
  analyst: string               // 담당 심사역
  contact_name: string          // 연락 담당자
  contact_email: string
  contact_phone: string
  memo: string
  created_at: datetime
  updated_at: datetime

  -- 관계 --
  investments: Investment[]
  valuations: Valuation[]
  biz_reports: BizReport[]
  documents: Document[]         // 바이블
}
```

**영역:** D-1

### Investment (투자)

```
Investment {
  id: int (PK)
  fund_id: int (FK → Fund)
  company_id: int (FK → PortfolioCompany)
  investment_date: date         // 투자일
  amount: decimal               // 투자금액
  shares: int                   // 주식 수
  share_price: decimal          // 주당 가격
  valuation_pre: decimal        // Pre-money 밸류에이션
  valuation_post: decimal       // Post-money 밸류에이션
  ownership_pct: decimal        // 지분율
  instrument: enum              // 보통주 | 우선주 | CB | BW | SAFE | 기타
  round: string                 // Seed | Series A | B | C | 브릿지 등
  status: enum                  // 투자중 | 일부회수 | 전액회수 | 손실처리
  board_seat: enum              // 이사 | 감사 | 옵저버 | 없음
  memo: string
  created_at: datetime
  updated_at: datetime

  -- 관계 --
  documents: InvestmentDocument[]
  transactions: Transaction[]
  workflow_instances: WorkflowInstance[]
}
```

**영역:** B-2, B-3
**추가 필드 (기존 대비):** valuation_pre, valuation_post, ownership_pct, round, board_seat

### InvestmentDocument (투자 서류)

```
InvestmentDocument {
  id: int (PK)
  investment_id: int (FK → Investment)
  name: string                  // 서류명
  doc_type: enum                // pre_investment | contract | post_investment
  doc_category: string          // 세부 분류 (등기부, 정관, 계약서 등)
  status: enum                  // 미수집 | 요청중 | 수집완료 | 원본보관 | 수탁사송부 | 해당없음
  due_date: date                // 수집 마감일 → D-day 추적
  collected_date: date          // 실제 수집일
  note: string
  created_at: datetime
  updated_at: datetime
}
```

**영역:** E-1, E-3

### Transaction (거래원장)

```
Transaction {
  id: int (PK)
  investment_id: int (FK → Investment)
  fund_id: int (FK → Fund)
  company_id: int (FK → PortfolioCompany)
  transaction_date: date        // 거래일
  type: enum                    // 투자 | 추가투자 | 전환 | 감자 | 매각 | 상환 | 배당 | 합병 | 기타
  amount: decimal               // 거래 금액 (+/-)
  shares_change: int            // 주식 수 변동 (+/-)
  balance_before: decimal       // 거래 전 잔액 (자동)
  balance_after: decimal        // 거래 후 잔액 (자동)
  realized_gain: decimal        // 실현손익
  cumulative_gain: decimal      // 누적손익 (자동)
  memo: string
  created_at: datetime

  -- 관계 --
  journal_entry: JournalEntry   // 자동 생성된 전표
}
```

**영역:** B-4
**자동 연결:** 등록 → JournalEntry 자동 생성 + FundPerformance 재계산

---

## C. 회수 관리

### ExitCommittee (회수위원회)

```
ExitCommittee {
  id: int (PK)
  company_id: int (FK → PortfolioCompany)
  status: enum                  // 수정중 | 표결중 | 가결 | 부결 | 종료
  meeting_date: datetime        // 개최 일시
  location: string              // 장소
  agenda: string                // 안건명
  exit_strategy: string         // 회수 전략 (IPO | M&A | 세컨더리 | 상환 | 청산)
  analyst_opinion: text         // 담당심사역 의견
  vote_result: string           // 표결 결과 요약
  memo: string
  created_at: datetime

  -- 관계 --
  funds: ExitCommitteeFund[]    // 대상 재원(조합) 목록
  exit_trades: ExitTrade[]
  documents: Document[]
}

ExitCommitteeFund {
  id: int (PK)
  exit_committee_id: int (FK)
  fund_id: int (FK → Fund)
  investment_id: int (FK → Investment)
}
```

**영역:** C-1

### ExitTrade (회수 거래)

```
ExitTrade {
  id: int (PK)
  exit_committee_id: int (FK → ExitCommittee)  // 가결된 위원회만
  investment_id: int (FK → Investment)
  fund_id: int (FK → Fund)
  exit_type: enum               // IPO매도 | M&A | 세컨더리 | 상환 | 청산배분 | 배당
  trade_date: date              // 거래일
  amount: decimal               // 회수 금액
  shares_sold: int              // 매도 주식 수
  price_per_share: decimal      // 주당 매도가
  fees: decimal                 // 수수료/세금
  net_amount: decimal           // 순회수액 (자동: amount - fees)
  realized_gain: decimal        // 실현손익 (자동 계산)
  memo: string
  created_at: datetime

  -- 관계 --
  transaction: Transaction      // 거래원장 자동 등록
  operation_order: OperationOrder
}
```

**영역:** C-2
**자동 연결:** 등록 → Transaction (B-4) + JournalEntry (F) + FundPerformance (A-6)

---

## D. 포트폴리오 관리 (추가 모델)

### Valuation (가치평가)

```
Valuation {
  id: int (PK)
  company_id: int (FK → PortfolioCompany)
  investment_id: int (FK → Investment)   // 투자건별 평가
  fund_id: int (FK → Fund)              // 재원별 평가
  as_of_date: date              // 평가 기준일
  evaluator: enum               // 자체평가 | 외부평가사명
  method: enum                  // 최근거래가 | DCF | 비교법 | 순자산법 | 기타
  instrument: enum              // 보통주 | 우선주 | CB 등 (투자유형별)
  value: decimal                // 평가 금액
  prev_value: decimal           // 전기 평가 금액
  change_amount: decimal        // 변동액 (자동: value - prev_value)
  change_pct: decimal           // 변동률 (자동)
  basis: text                   // 산출 근거
  created_at: datetime
}
```

**영역:** D-2
**자동 연결:** 등록 → FundPerformance (A-6) RVPI 갱신, LP보고 데이터 반영 (G-2)

### BizReport (영업보고 — 피투자사 제출)

```
BizReport {
  id: int (PK)
  company_id: int (FK → PortfolioCompany)
  report_type: enum             // 분기보고 | 월보고 | 일반보고
  period: string                // 보고 기간 (예: "2026-Q1")
  status: enum                  // 요청전 | 요청중 | 수신 | 검수완료
  requested_date: date          // 요청 발송일
  received_date: date           // 수신일
  reviewed_date: date           // 검수 완료일
  analyst_comment: text         // 심사역 의견

  -- 재무 데이터 (주요 항목) --
  revenue: decimal              // 매출
  operating_income: decimal     // 영업이익
  net_income: decimal           // 당기순이익
  total_assets: decimal         // 총자산
  total_liabilities: decimal    // 총부채
  employees: int                // 종업원 수

  memo: string
  created_at: datetime

  -- 관계 --
  attachments: Document[]       // 첨부 (재무제표, 사업계획서 등)
}
```

**영역:** D-3

### VoteRecord (의결권 행사 기록)

```
VoteRecord {
  id: int (PK)
  company_id: int (FK → PortfolioCompany)
  investment_id: int (FK → Investment)
  vote_type: enum               // 주주총회 | 이사회 | 서면결의
  date: date                    // 의결 일자
  agenda: string                // 안건
  decision: enum                // 찬성 | 반대 | 기권 | 미행사
  memo: string
  created_at: datetime
}
```

**영역:** D-4

---

## E. 서류·계약 관리

### DocumentSet (서류 세트)

```
DocumentSet {
  id: int (PK)
  name: string                  // 세트명 (예: "A사 투자 바이블", "1호조합 LP바인더")
  set_type: enum                // 투자바이블 | LP바인더 | 총회서류 | 결성서류 | 기타
  entity_type: enum             // investment | fund | company | assembly
  entity_id: int                // 연결된 엔티티 ID
  total_docs: int               // 전체 서류 수 (자동)
  completed_docs: int           // 수집 완료 수 (자동)
  completion_pct: decimal       // 완료율 (자동)
  created_at: datetime
}
```

### Document (개별 서류)

```
Document {
  id: int (PK)
  document_set_id: int (FK → DocumentSet)     // 세트 소속 (선택)
  investment_id: int (FK → Investment)         // 투자건 연결 (선택)
  fund_id: int (FK → Fund)                    // 조합 연결 (선택)
  company_id: int (FK → PortfolioCompany)     // 기업 연결 (선택)
  name: string                  // 서류명
  doc_type: enum                // pre_investment | contract | post_investment | lp_binder | assembly | formation | etc
  doc_category: string          // 세부 분류
  status: enum                  // 미수집 | 요청중 | 수집완료 | 원본보관 | 수탁사송부 | 해당없음
  due_date: date                // 수집 마감일
  collected_date: date          // 실제 수집일
  issuer: string                // 발급처
  required: boolean             // 필수 여부
  file_path: string             // 파일 경로 (향후 파일 업로드 시)
  note: string
  created_at: datetime
  updated_at: datetime
}
```

**영역:** E-1, E-2, E-3
**D-day 추적:** due_date 기준 → days_remaining 계산 → 대시보드 알림

---

## F. 회계·재무

### Account (계정과목)

```
Account {
  id: int (PK)
  fund_id: int (FK → Fund)     // 조합별 계정과목 (또는 공통)
  code: string                  // 계정코드 (예: "101", "401")
  name: string                  // 계정명 (예: "현금", "투자주식")
  category: enum                // 자산 | 부채 | 자본 | 수익 | 비용
  sub_category: string          // 중분류 (유동자산, 고정자산 등)
  normal_side: enum             // 차변 | 대변 (정상잔액 방향)
  is_active: boolean
  display_order: int
}
```

### JournalEntry (전표)

```
JournalEntry {
  id: int (PK)
  fund_id: int (FK → Fund)
  ledger_id: int                // 회계원장 구분
  entry_date: date              // 회계일
  entry_type: enum              // 일반분개 | 자동전표
  source_type: string           // 생성 출처 (capital_call | distribution | transaction | exit_trade | manual)
  source_id: int                // 출처 레코드 ID
  description: string           // 적요
  status: enum                  // 미결재 | 결재완료
  created_at: datetime

  -- 관계 --
  lines: JournalEntryLine[]
}

JournalEntryLine {
  id: int (PK)
  journal_entry_id: int (FK)
  account_id: int (FK → Account)
  debit: decimal                // 차변 금액
  credit: decimal               // 대변 금액
  memo: string                  // 적요 (라인별)
  counterpart: string           // 관리항목 (거래처, 계좌번호)
}
```

**영역:** F-3
**자동 전표 매핑:**
| source_type | 차변 | 대변 |
|-------------|------|------|
| capital_call | 현금 | 출자금 |
| investment (transaction) | 투자주식 | 현금 |
| exit_trade | 현금 | 투자주식 + 처분이익 |
| distribution | 출자금/이익잉여금 | 현금 |
| mgmt_fee | 관리보수 | 현금 |

### BankAccount (계좌)

```
BankAccount {
  id: int (PK)
  fund_id: int (FK → Fund)
  bank_name: string             // 은행명
  account_number: string        // 계좌번호
  account_type: enum            // 운용 | 수탁 | 보관 | 기타
  balance: decimal              // 현재 잔액
  is_primary: boolean           // 대표 계좌 여부
  memo: string
}
```

**영역:** F-6

---

## G. 보고·공시

### RegularReport (정기 보고)

```
RegularReport {
  id: int (PK)
  report_target: enum           // 농금원 | VICS | LP | 내부보고회 | 홈택스
  fund_id: int (FK → Fund)     // 대상 조합 (null이면 전체)
  period: string                // 보고 기간 (예: "2026-01", "2026-H1", "2026")
  due_date: date                // 보고 마감일
  status: enum                  // 미작성 | 작성중 | 검수중 | 전송완료 | 실패
  submitted_date: date          // 실제 전송일
  memo: string
  created_at: datetime

  -- 관계 --
  task_id: int (FK → Task)     // 연결된 작업
}
```

**영역:** G-1, G-2, G-3, G-4

### LPReport (LP 보고 상세)

```
LPReport {
  id: int (PK)
  fund_id: int (FK → Fund)
  report_type: enum             // 정기(반기) | 정기(연간) | 수시
  period: string                // 보고 기간
  status: enum                  // 생성 | 확정 | 전송요청 | 전송성공 | 전송실패
  confirmed_date: date          // 확정일 (확정 후 데이터 변경 불가)
  transmitted_date: date        // 전송일

  -- 보고 항목 포함 여부 --
  includes_org_info: boolean    // 운용기관 정보
  includes_investment_info: boolean  // 투자기업 정보
  includes_valuation: boolean   // 가치평가
  includes_fee_info: boolean    // 보수 정보
  includes_assembly: boolean    // 총회 정보
  includes_call_plan: boolean   // 출자 계획

  memo: string
  created_at: datetime
}
```

**영역:** G-2

---

## I. 작업·일정·기록 (백본)

### Task (작업)

```
Task {
  id: int (PK)
  title: string                 // 작업명 (주어 포함 전체 표기)
  deadline: datetime            // 마감일시 (평일만)
  estimated_time: string        // 예상 소요시간 ("2h", "30m")
  quadrant: enum                // Q1 | Q2 | Q3 | Q4
  memo: string                  // 메모 (워크플로우/날짜 패턴 포함)
  status: enum                  // pending | in_progress | completed
  delegate_to: string           // 위임 대상 (1인이지만 외부 위임 추적)
  created_at: datetime
  completed_at: datetime
  actual_time: string           // 실제 소요시간

  -- 연결 --
  workflow_instance_id: int (FK → WorkflowInstance)  // 워크플로우 스텝에서 생성된 경우
  calendar_event_id: int (FK → CalendarEvent)        // 캘린더 연동
}
```

**메모 파싱 패턴:**
- `목표: 2/13`, `2/13까지`, `~2/15` → 목표 날짜
- `계약일(2/9) 15일 이내` → 마감 계산
- `팀장님 리뷰✓` → 상태 표시

### WorkLog (업무 기록)

```
WorkLog {
  id: int (PK)
  date: date                    // 작업일
  category: string              // 카테고리 (아래 목록)
  title: string                 // 작업명
  content: string               // 내용
  status: enum                  // 완료 | 진행중
  estimated_time: string        // 예상 소요시간
  actual_time: string           // 실제 소요시간
  time_diff: string             // 차이 (자동: "-30m", "+15m")
  task_id: int (FK → Task)     // 연결된 작업
  created_at: datetime

  -- 관계 --
  details: WorkLogDetail[]
  lessons: WorkLogLesson[]
  follow_ups: WorkLogFollowUp[]
}

WorkLogDetail {
  id: int (PK)
  worklog_id: int (FK)
  content: string
  order: int
}

WorkLogLesson {
  id: int (PK)
  worklog_id: int (FK)
  content: string
  order: int
}

WorkLogFollowUp {
  id: int (PK)
  worklog_id: int (FK)
  content: string
  target_date: date             // 후속업무 목표일
  order: int
}
```

**카테고리:** 투심위 | 투자계약 | 투자후등록 | 거래변동 | 회수 | 조합결성 | 조합총회 | 조합감사 | 가치평가 | 영업보고 | 월보고 | LP보고 | 내부보고회 | 바이블 | 연말정산 | 총무 | 시스템설정

### Workflow (워크플로우 — 기존 유지)

```
Workflow {
  id: int (PK)
  name: string                  // 워크플로우명
  trigger_description: string   // 트리거 조건
  category: string              // 카테고리
  total_duration: string        // 총 소요기간

  -- 관계 --
  steps: WorkflowStep[]
  documents: WorkflowDocument[]
  warnings: WorkflowWarning[]
}

WorkflowStep {
  id: int (PK)
  workflow_id: int (FK)
  order: int
  name: string                  // 작업명
  timing: string                // D-7, D-day, D+2 등
  timing_offset_days: int       // 트리거일 대비 오프셋
  estimated_time: string
  quadrant: enum                // Q1~Q4
  memo: string
  dependencies: string[]        // 선행 작업
}

WorkflowDocument {
  id: int (PK)
  workflow_id: int (FK)
  name: string
  required: boolean
  timing: string                // 필요 시점
  notes: string
}

WorkflowWarning {
  id: int (PK)
  workflow_id: int (FK)
  content: string
  category: enum                // warning | lesson | tip
}
```

### WorkflowInstance (워크플로우 인스턴스)

```
WorkflowInstance {
  id: int (PK)
  workflow_id: int (FK → Workflow)
  name: string                  // 인스턴스명 (예: "A사 시리즈A 투자계약")
  trigger_date: date            // 트리거 기준일
  status: enum                  // active | completed | cancelled
  memo: string
  created_at: datetime
  completed_at: datetime

  -- 연결 (Phase 2) --
  investment_id: int (FK → Investment)
  company_id: int (FK → PortfolioCompany)
  fund_id: int (FK → Fund)

  -- 관계 --
  step_instances: WorkflowStepInstance[]
}

WorkflowStepInstance {
  id: int (PK)
  instance_id: int (FK → WorkflowInstance)
  workflow_step_id: int (FK → WorkflowStep)
  calculated_date: date         // 계산된 예정일 (trigger_date + offset)
  status: enum                  // pending | in_progress | completed | skipped
  completed_at: datetime
  actual_time: string
  notes: string
  task_id: int (FK → Task)     // 자동 생성된 Task
}
```

### CalendarEvent (캘린더)

```
CalendarEvent {
  id: int (PK)
  title: string
  date: date
  time: time                    // 선택
  duration: int                 // 분 단위
  description: string
  status: enum                  // pending | completed
  task_id: int (FK → Task)     // 연결된 작업
  gcal_event_id: string        // Google Calendar 이벤트 ID
  created_at: datetime
}
```

### Checklist (체크리스트)

```
Checklist {
  id: int (PK)
  name: string                  // 체크리스트명
  category: string              // 영역 (투심위, 계약, 결성 등)
  workflow_step_id: int (FK)   // 워크플로우 스텝 연결 (선택)

  -- 관계 --
  items: ChecklistItem[]
}

ChecklistItem {
  id: int (PK)
  checklist_id: int (FK)
  order: int
  name: string
  required: boolean
  checked: boolean
  notes: string
}
```

### OperationOrder (운용지시서)

```
OperationOrder {
  id: int (PK)
  fund_id: int (FK → Fund)
  order_type: enum              // 출자운용지시 | 투자운용지시 | 배분운용지시 | 회수운용지시
  order_date: date              // 운용지시일
  status: enum                  // 작성중 | 상신 | 승인 | 실행완료
  bank_name: string             // 은행
  account_number: string        // 계좌번호
  process_date: date            // 처리요청일
  amount: decimal               // 금액
  memo: string
  created_at: datetime

  -- 출처 연결 --
  source_type: string           // capital_call | distribution | investment | exit_trade
  source_id: int
}
```

---

## 영역 간 자동 연결 정리

| 이벤트 | 자동 생성 | 자동 갱신 |
|--------|----------|----------|
| 출자 확정 (CapitalCall) | JournalEntry, OperationOrder | LP.paid_in, Fund.aum |
| 투자 실행 (Transaction:투자) | JournalEntry, InvestmentDocument(바이블) | Fund.aum, FundPerformance |
| 거래 변동 (Transaction) | JournalEntry | Investment 잔액, FundPerformance |
| 가치평가 등록 (Valuation) | - | FundPerformance(RVPI), LPReport 데이터 |
| 회수 거래 (ExitTrade) | Transaction, JournalEntry, OperationOrder | FundPerformance(DPI) |
| 배분 확정 (Distribution) | JournalEntry, OperationOrder | LP 배분이력 |
| 워크플로우 스텝 활성화 | Task, CalendarEvent | - |
| 워크플로우 인스턴스 생성 | InvestmentDocument(필수서류) | DocumentSet 완료율 |
| 서류 마감 D-3 | Task(리마인더) | - |
| 월말 (시스템) | Task(월보고), RegularReport | - |
| 분기말 (시스템) | Task(가치평가, 내부보고회) | - |

---

**마지막 업데이트:** 2026-02-13
