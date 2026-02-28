# Phase 40: 문서 자동생성 빌더 6종

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> ⚠️ **비식별화 원칙:** 실존 정보 사용 금지.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P1  
**의존성:** Phase 39 (InternalReview + CompanyReview — D-01/D-05 빌더에서 사용)  
**후속:** Phase 41이 서류요청 공문 빌더(D-06) 결과를 활용

---

## Part 0. 전수조사 (필수)

- [ ] `services/document_builders/` — 기존 빌더 3종 구조 확인 (assembly_notice, official_letter, written_resolution)
- [ ] `services/document_builders/layout_utils.py` — 공용 레이아웃 유틸 확인
- [ ] `services/document_service.py` — 기존 문서 서비스 확인
- [ ] `routers/documents.py` — 기존 문서 API 확인
- [ ] `models/document_template.py` — DocumentTemplate 모델 확인
- [ ] `models/internal_review.py` — Phase 39 InternalReview + CompanyReview 확인
- [ ] `models/investment_review.py` — InvestmentReview 모델 확인
- [ ] `models/vote_record.py` — VoteRecord 모델 확인
- [ ] `models/transaction.py` — Transaction 모델 확인
- [ ] `models/fund.py` — Fund (trustee, account_number, gp 등) 확인

---

## Part 1. 빌더 목록 및 데이터 소스

| # | 빌더명 | 소스 모델 | 출력 | 트리거 시점 | 우선순위 |
|---|--------|----------|------|-----------|---------|
| D-01 | 후속관리보고서 | CompanyReview + Investment + PortfolioCompany | docx | 내부보고회 상세 페이지 | P1 |
| D-02 | 운용지시서 | Transaction + Fund (trustee, account) | docx | 거래 등록 후 수동 | P1 |
| D-03 | 출자증서 | LP + Fund | docx | LP 출자금 납입 완료 시 | P1 |
| D-04 | 투심위 의사록 | InvestmentReview + VoteRecord | docx | 투심위 완료 시 | P1 |
| D-05 | 내부보고회 통합보고서 | InternalReview + CompanyReview[] | docx | 내부보고회 완료 시 | P2 |
| D-06 | 피투자사 서류요청 공문 | Investment + Fund + PortfolioCompany | docx | 분기 시작 시 수동 | P2 |

---

## Part 2. 빌더 구현

### 2-1. D-01 후속관리보고서

#### `services/document_builders/follow_up_report.py` [NEW]

```python
"""
후속관리보고서 (피투자사별 1건)
양식: 테이블 기반 docx (python-docx)
데이터 소스: CompanyReview + Investment + PortfolioCompany
"""

TEMPLATE_FIELDS = [
    {"label": "기준일",       "source": "review.reference_date",         "format": "date"},
    {"label": "작성일",       "source": "today()",                       "format": "date"},
    {"label": "기업명",       "source": "company.name"},
    {"label": "대표자",       "source": "company.ceo"},
    {"label": "사업자번호",   "source": "company.business_number"},
    {"label": "업종",         "source": "company.industry"},
    {"label": "투자일",       "source": "investment.investment_date",     "format": "date"},
    {"label": "투자금액",     "source": "investment.amount",             "format": "currency"},
    {"label": "지분율",       "source": "investment.ownership_pct",      "format": "percent"},
    {"label": "분기 매출액",  "source": "cr.quarterly_revenue",          "format": "currency"},
    {"label": "분기 영업이익", "source": "cr.quarterly_operating_income", "format": "currency"},
    {"label": "분기 당기순이익","source": "cr.quarterly_net_income",      "format": "currency"},
    {"label": "총자산",       "source": "cr.total_assets",               "format": "currency"},
    {"label": "총부채",       "source": "cr.total_liabilities",          "format": "currency"},
    {"label": "현금성자산",   "source": "cr.cash_and_equivalents",       "format": "currency"},
    {"label": "임직원 수",    "source": "cr.employee_count"},
    {"label": "인원 변동",    "source": "cr.employee_change",            "format": "signed"},
    {"label": "자산건전성 등급","source": "cr.asset_rating"},
    {"label": "손상차손",     "source": "cr.impairment_type"},
    {"label": "이사회 참석",  "source": "cr.board_attendance"},
    {"label": "주요 이슈",    "source": "cr.key_issues",                 "multiline": True},
    {"label": "후속 조치",    "source": "cr.follow_up_actions",          "multiline": True},
    {"label": "종합 의견",    "source": "cr.investment_opinion"},
]

async def build_follow_up_report(company_review_id: int, db) -> bytes:
    """docx 바이트 반환"""
    # 1. CompanyReview 조회 → InternalReview → reference_date
    # 2. Investment 조회 → PortfolioCompany 조회
    # 3. python-docx로 테이블 생성 (layout_utils 활용)
    # 4. docx 바이트 반환
    pass
```

### 2-2. D-02 운용지시서

#### `services/document_builders/operation_instruction.py` [NEW]

```python
"""
운용지시서 — 출자금 납입/투자금 출금/배분금 지급 시 수탁사에 제출
금액/계좌번호 정확성이 핵심 (수탁사 반려 방지)
데이터 소스: Transaction + Fund (trustee, account_number)
"""

TEMPLATE_FIELDS = {
    "fund_name": "fund.name",
    "instruction_type": "transaction.type",         # 출자납입/투자집행/배분/경비지출
    "instruction_date": "today()",
    "amount": "transaction.amount",
    "amount_korean": "to_korean_currency(amount)",  # 금 일억오천만원정
    "from_account": "fund.account_number",
    "to_account": "resolve_to_account()",           # 거래 유형별 입금 계좌
    "to_account_holder": "resolve_account_holder()",
    "purpose": "transaction.memo",
    "trustee": "fund.trustee",
    "gp_name": "fund.gp",
}

async def build_operation_instruction(transaction_id: int, db) -> bytes:
    """docx 바이트 반환"""
    pass
```

> **`to_korean_currency()` 유틸 함수:** 숫자 → 한글 금액 변환 (예: 150000000 → "금 일억오천만원정") — `layout_utils.py`에 추가

### 2-3. D-03 출자증서

#### `services/document_builders/contribution_cert.py` [NEW]

```python
"""
출자증서 — LP 출자금 납입 완료 시 발행
데이터 소스: LP + Fund
"""

async def build_contribution_cert(fund_id: int, lp_id: int, db) -> bytes:
    """docx 바이트 반환"""
    # 필드: 조합명, LP명, 약정금액, 납입금액, 출자일, 지분율
    # 기본 레이아웃: 제목 + 본문 + 서명란
    pass
```

### 2-4. D-04 투심위 의사록

#### `services/document_builders/irc_minutes.py` [NEW]

```python
"""
투자심의위원회 의사록
데이터 소스: InvestmentReview + VoteRecord + Investment + PortfolioCompany
"""

async def build_irc_minutes(investment_review_id: int, db) -> bytes:
    """docx 바이트 반환"""
    # 필드: 회의일, 안건, 대상기업, 투자조건, 투표결과, 참석자, 결의내용
    pass
```

### 2-5. D-05 내부보고회 통합보고서

#### `services/document_builders/internal_review_report.py` [NEW]

```python
"""
내부보고회 통합보고서 — 조합 전체 피투자사 사후관리 종합
데이터 소스: InternalReview + CompanyReview[] (전체)
"""

async def build_internal_review_report(internal_review_id: int, db) -> bytes:
    """docx 바이트 반환"""
    # 구조:
    # 1. 표지: 조합명 + 분기 + 기준일
    # 2. 목차
    # 3. 종합 요약: 총 피투자사 수, 등급 분포, 손상 건수
    # 4. 피투자사별 섹션 (CompanyReview 순회):
    #    - 기업 기본 정보
    #    - 분기 재무 데이터 테이블
    #    - 자산건전성 등급 + 손상 플래그
    #    - 주요 이슈 / 후속 조치 / 의견
    # 5. 준법감시인 의견
    # 6. 참석자 서명란
    pass
```

### 2-6. D-06 피투자사 서류요청 공문

#### `services/document_builders/doc_request_letter.py` [NEW]

```python
"""
피투자사 서류요청 공문 — 분기 서류 7종 수집 요청
데이터 소스: Investment + Fund + PortfolioCompany
"""

REQUIRED_DOCS = [
    "재무제표 (분기/반기/결산)",
    "사업자등록증 사본",
    "주주명부",
    "법인등기부등본",
    "4대보험 가입자명부",
    "대표자 신용정보조회동의서",
    "기타 변동사항 보고서",
]

async def build_doc_request_letter(fund_id: int, investment_id: int,
                                     quarter: int, year: int, db) -> bytes:
    """docx 바이트 반환"""
    # 구조: 문서번호 + 수신(피투자사) + 참조 + 제목 + 본문(요청 사유 + 서류 목록 + 제출 기한)
    # 기존 official_letter.py 레이아웃 참조
    pass
```

---

## Part 3. 한글 금액 변환 유틸

#### `services/document_builders/layout_utils.py` [MODIFY — 확장]

```python
def to_korean_currency(amount: int) -> str:
    """숫자 → 한글 금액 변환 (예: 150000000 → '금 일억오천만원정')"""
    # 억, 천만, 백만, 십만, 만, 천, 백, 십, 일 단위 변환
    pass
```

---

## Part 4. API 엔드포인트

#### `routers/documents.py` [MODIFY — 확장]

기존 문서 API에 빌더 6종 추가:

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/documents/generate` | 범용 문서 생성 API |

**요청 body:**
```json
{
  "builder": "follow_up_report",    // 또는 operation_instruction, contribution_cert,
                                    // irc_minutes, internal_review_report, doc_request_letter
  "params": {
    "company_review_id": 1          // 빌더별 파라미터
  }
}
```

**빌더별 params:**
| builder | 필수 params |
|---------|------------|
| `follow_up_report` | `company_review_id` |
| `operation_instruction` | `transaction_id` |
| `contribution_cert` | `fund_id`, `lp_id` |
| `irc_minutes` | `investment_review_id` |
| `internal_review_report` | `internal_review_id` |
| `doc_request_letter` | `fund_id`, `investment_id`, `year`, `quarter` |

**응답:**
```json
{ "document_id": 42, "filename": "후속관리보고서_OO기업_2026Q1.docx", "download_url": "/api/documents/42/download" }
```

### Phase 39 연동 — 내부보고회 상세에서 문서 생성

#### `routers/internal_reviews.py` [MODIFY — 확장]

추가 엔드포인트:

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/internal-reviews/{id}/generate-report` | D-05 통합보고서 docx 자동 생성 |
| POST | `/api/internal-reviews/{id}/company-reviews/{cr_id}/generate-report` | D-01 후속관리보고서 docx 생성 |

---

## Part 5. 프론트엔드

### 5-1. 기존 페이지에 문서 생성 버튼 추가

#### `pages/InternalReviewPage.tsx` [MODIFY — 확장]

내부보고회 상세 페이지에:
- CompanyReview 카드에 [후속관리보고서 생성] 버튼 추가
- 하단에 [통합 보고서 생성] 버튼 추가

#### `pages/TransactionsPage.tsx` [MODIFY — 확장]

거래 상세/목록에:
- [운용지시서 생성] 버튼 추가 (Transaction 행에)

#### `pages/FundDetailPage.tsx` [MODIFY — 확장]

LP 탭에서:
- LP별 [출자증서 생성] 버튼 추가

#### `pages/InvestmentReviewPage.tsx` [MODIFY — 확장]

투심위 상세에서:
- [투심위 의사록 생성] 버튼 추가

### 5-2. 문서 이력 페이지 확장

#### `pages/DocumentsPage.tsx` [MODIFY — 확장]

기존 문서 목록에 신규 빌더 6종으로 생성된 문서도 표시

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [NEW] | `backend/services/document_builders/follow_up_report.py` | D-01 후속관리보고서 빌더 |
| 2 | [NEW] | `backend/services/document_builders/operation_instruction.py` | D-02 운용지시서 빌더 |
| 3 | [NEW] | `backend/services/document_builders/contribution_cert.py` | D-03 출자증서 빌더 |
| 4 | [NEW] | `backend/services/document_builders/irc_minutes.py` | D-04 투심위 의사록 빌더 |
| 5 | [NEW] | `backend/services/document_builders/internal_review_report.py` | D-05 내부보고회 통합보고서 |
| 6 | [NEW] | `backend/services/document_builders/doc_request_letter.py` | D-06 서류요청 공문 |
| 7 | [MODIFY] | `backend/services/document_builders/layout_utils.py` | to_korean_currency() 추가 |
| 8 | [MODIFY] | `backend/services/document_builders/__init__.py` | 신규 빌더 등록 |
| 9 | [MODIFY] | `backend/routers/documents.py` | 범용 /generate API에 6종 빌더 연결 |
| 10 | [MODIFY] | `backend/routers/internal_reviews.py` | 문서 생성 엔드포인트 추가 |
| 11 | [MODIFY] | `frontend/src/pages/InternalReviewPage.tsx` | 보고서 생성 버튼 |
| 12 | [MODIFY] | `frontend/src/pages/TransactionsPage.tsx` | 운용지시서 생성 버튼 |
| 13 | [MODIFY] | `frontend/src/pages/FundDetailPage.tsx` | 출자증서 생성 버튼 |
| 14 | [MODIFY] | `frontend/src/pages/InvestmentReviewPage.tsx` | 투심위 의사록 생성 버튼 |
| 15 | [MODIFY] | `frontend/src/pages/DocumentsPage.tsx` | 신규 문서 유형 표시 |
| 16 | [MODIFY] | `frontend/src/lib/api.ts` | 문서 생성 API 함수 확장 |

---

## Acceptance Criteria

- [ ] **AC-01:** 후속관리보고서(D-01) docx가 CompanyReview 데이터로 정상 생성된다.
- [ ] **AC-02:** 운용지시서(D-02) docx가 Transaction 데이터로 정상 생성된다.
- [ ] **AC-03:** 운용지시서의 한글 금액 변환이 정확하다 (예: 150,000,000 → "금 일억오천만원정").
- [ ] **AC-04:** 출자증서(D-03) docx가 LP/Fund 데이터로 정상 생성된다.
- [ ] **AC-05:** 투심위 의사록(D-04) docx가 InvestmentReview/VoteRecord 데이터로 정상 생성된다.
- [ ] **AC-06:** 내부보고회 통합보고서(D-05)가 전체 CompanyReview 데이터 포함하여 생성된다.
- [ ] **AC-07:** 서류요청 공문(D-06)이 7종 서류 목록과 제출 기한 포함하여 생성된다.
- [ ] **AC-08:** 각 페이지에서 해당 문서 생성 버튼이 동작한다.
- [ ] **AC-09:** 생성된 문서가 DocumentsPage에 표시되고 다운로드 가능하다.
- [ ] **AC-10:** Phase 31~39의 모든 기능 유지.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. 기존 document_builders 3종 (assembly_notice, official_letter, written_resolution) — 수정 금지
3. 기존 documents.py API 시그니처 — 유지 (확장만)
4. Phase 31~39의 기존 구현 — 보강만, 삭제/재구성 금지
