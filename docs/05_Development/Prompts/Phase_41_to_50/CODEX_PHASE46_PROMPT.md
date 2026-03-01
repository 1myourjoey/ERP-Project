# Phase 46: 조합별 가결산 자동화 (입출금 → 분개 → 재무제표)

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P0  
**의존성:** Phase 44 완료 (기존 Account/JournalEntry 모델 활용)  
**LLM:** ❌ 불필요 — 규칙 기반

**핵심 목표:** 매월 은행 입출금 내역만 입력하면 조합별로 자동 분개 → 가결산 → 재무제표(SFP/IS) 엑셀 다운로드까지 원스톱 처리

---

## Part 0. 전수조사 (필수)

- [ ] `backend/models/accounting.py` — Account, JournalEntry, JournalEntryLine 모델 (50줄)
- [ ] `backend/models/transaction.py` — Transaction 모델 (32줄)
- [ ] `backend/models/fund.py` — Fund 모델 (fund_id 기준)
- [ ] `backend/routers/accounting.py` — 기존 회계 API
- [ ] `backend/routers/transactions.py` — 기존 거래 API
- [ ] `frontend/src/pages/AccountingPage.tsx` — 기존 회계 UI
- [ ] `frontend/src/pages/TransactionsPage.tsx` — 기존 거래 UI
- [ ] `templates/3. 트리거 글로벌PEX 투자조합_가결산FS_2026년1월.xlsx` — 양식 참조

---

## Part 1. 백엔드 — 신규 모델

### 1-1. 은행 입출금 내역

#### [NEW] `backend/models/bank_transaction.py`

```python
class BankTransaction(Base):
    """조합별 은행 입출금 원장"""
    __tablename__ = "bank_transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id", ondelete="CASCADE"), nullable=False)
    
    transaction_date = Column(DateTime, nullable=False)
    withdrawal = Column(Numeric, default=0)        # 출금금액
    deposit = Column(Numeric, default=0)            # 입금금액
    balance_after = Column(Numeric, nullable=True)  # 거래후잔액
    description = Column(String, nullable=True)     # 거래내용 (NH증권수탁, 예금이자 등)
    counterparty = Column(String, nullable=True)    # 거래기록사항 (농식품모태펀드, 트리거투자 등)
    bank_branch = Column(String, nullable=True)     # 거래점
    account_number = Column(String, nullable=True)  # 계좌번호
    
    # 분개 연결
    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id"), nullable=True)
    auto_mapped = Column(Boolean, default=False)    # 자동 매핑 여부
    mapping_rule_id = Column(Integer, ForeignKey("auto_mapping_rules.id"), nullable=True)
    
    year_month = Column(String, nullable=False)     # "2026-01" (월별 관리용)
    created_at = Column(DateTime, server_default=func.now())
```

### 1-2. 자동 분개 매핑 규칙

#### [NEW] `backend/models/auto_mapping_rule.py`

```python
class AutoMappingRule(Base):
    """거래처 키워드 → 계정과목 자동 매핑 규칙"""
    __tablename__ = "auto_mapping_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=True)  # NULL이면 전체 조합 공통
    
    keyword = Column(String, nullable=False)        # 거래처 키워드 (부분일치)
    direction = Column(String, nullable=False)       # deposit | withdrawal
    
    # 분개 매핑
    debit_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    credit_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    
    # 메타
    description_template = Column(String, nullable=True)  # 적요 템플릿
    priority = Column(Integer, default=0)            # 높을수록 우선 적용
    use_count = Column(Integer, default=0)           # 사용 횟수 (학습 지표)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
```

### 1-3. 가결산 결과

#### [NEW] `backend/models/provisional_fs.py`

```python
class ProvisionalFS(Base):
    """조합별 월간 가결산 재무제표"""
    __tablename__ = "provisional_fs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id", ondelete="CASCADE"), nullable=False)
    year_month = Column(String, nullable=False)      # "2026-01"
    
    status = Column(String, default="draft")         # draft | confirmed | exported
    
    # SFP (재무상태표) — JSON으로 저장
    sfp_data = Column(Text, nullable=True)           # JSON: {유동자산, 투자자산, 부채, 자본 ...}
    
    # IS (손익계산서) — JSON으로 저장
    is_data = Column(Text, nullable=True)            # JSON: {영업수익, 영업비용, 당기순이익 ...}
    
    # 합산 요약
    total_assets = Column(Numeric, nullable=True)
    total_liabilities = Column(Numeric, nullable=True)
    total_equity = Column(Numeric, nullable=True)
    net_income = Column(Numeric, nullable=True)
    
    confirmed_at = Column(DateTime, nullable=True)
    confirmed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
```

---

## Part 2. 백엔드 — 입출금 파싱 서비스

#### [NEW] `backend/services/bank_statement_parser.py`

```python
class BankStatementParser:
    """복사-붙여넣기 또는 엑셀 데이터를 BankTransaction으로 변환"""
    
    def parse_clipboard_text(self, text: str, fund_id: int) -> list[dict]:
        """복사-붙여넣기 텍스트를 파싱
        
        은행 입출금 내역 형태:
        구분 | 거래일자 | 출금금액(원) | 입금금액(원) | 거래후잔액(원) | 거래내용 | 거래기록사항 | 거래점
        1   | 2025/03/31 15:15:27 | 63,012,492 | | 485,717,184 | NH증권수탁 | 트리거투자파트너스 | 농협 000221
        """
        ...
    
    def parse_excel(self, file_path: str, fund_id: int) -> list[dict]:
        """엑셀 파일에서 입출금 내역 파싱"""
        ...
```

---

## Part 3. 백엔드 — 자동 분개 서비스

#### [NEW] `backend/services/auto_journal.py`

```python
class AutoJournalService:
    """입출금 내역 → 자동 분개 생성"""
    
    def auto_map(self, bank_txns: list[BankTransaction], fund_id: int, db: Session) -> dict:
        """입출금 내역을 자동 매핑하여 분개 생성
        
        Returns: {
            "mapped": [매핑 성공 건 목록],
            "unmapped": [매핑 실패 건 목록 → 사용자 수동 선택 필요],
            "total": 전체 건수,
        }
        """
        rules = self._get_rules(fund_id, db)
        
        for txn in bank_txns:
            matched_rule = self._find_matching_rule(txn, rules)
            if matched_rule:
                # JournalEntry + JournalEntryLine 생성
                ...
                txn.auto_mapped = True
            else:
                # unmapped 목록에 추가
                ...
    
    def _find_matching_rule(self, txn: BankTransaction, rules: list) -> AutoMappingRule | None:
        """거래처명 키워드 매칭으로 규칙 찾기"""
        direction = "deposit" if txn.deposit > 0 else "withdrawal"
        for rule in rules:
            if rule.direction == direction and rule.keyword in (txn.counterparty or ""):
                return rule
        return None
    
    def learn_mapping(self, txn_id: int, debit_account_id: int, credit_account_id: int, db: Session):
        """수동 매핑 시 규칙 자동 학습 (다음에 같은 거래처면 자동 적용)"""
        ...
```

---

## Part 4. 백엔드 — 가결산 서비스

#### [NEW] `backend/services/provisional_fs_service.py`

```python
class ProvisionalFSService:
    """가결산 재무제표 자동 생성"""
    
    def generate(self, fund_id: int, year_month: str, db: Session) -> ProvisionalFS:
        """해당 월의 확정된 분개를 기반으로 SFP + IS 자동 생성"""
        
        # 1. 해당 월 JournalEntryLine 집계 (계정과목별 차변/대변 합계)
        # 2. 계정과목 category별 분류
        # 3. SFP 생성:
        #    - 유동자산: MMDA잔액 + 단기매매증권 + 미수금 + ...
        #    - 투자자산: 주목적투자자산 (기존 Investment 데이터 연동)
        #    - 부채: 미지급배당금 + 유동부채 + ...
        #    - 자본: 출자금 + 자본잉여금 + 이익잉여금
        # 4. IS 생성:
        #    - 영업수익: 투자수익 + 운용투자수익 + 기타영업수익(이자)
        #    - 영업비용: 관리보수 + 성과보수 + 수탁관리보수 + 회계감사 + ...
        #    - 영업이익 = 영업수익 - 영업비용
        #    - 당기순이익 = 영업이익 + 영업외수익 - 영업외비용 - 법인세
        ...
```

---

## Part 5. 백엔드 — 엑셀 다운로드

#### [NEW] `backend/services/fs_excel_exporter.py`

```python
class FSExcelExporter:
    """가결산 재무제표를 엑셀로 다운로드 (기존 양식 재현)"""
    
    def export(self, provisional_fs: ProvisionalFS, fund, db) -> str:
        """3개 시트로 구성된 엑셀 생성
        
        Sheet 1: 가결산전표 — 해당 월 분개 전표 목록
        Sheet 2: SFP — 재무상태표
                 자산 (유동자산/투자자산/비유동자산)
                 부채 (유동부채/비유동부채)
                 자본 (출자금/자본잉여금/이익잉여금)
        Sheet 3: IS — 손익계산서
                 영업수익/영업비용/영업이익/영업외/당기순이익
        """
        ...
```

---

## Part 6. 백엔드 — API

#### [NEW] `backend/routers/provisional_fs.py`

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/funds/{fund_id}/bank-transactions/parse` | 복사-붙여넣기 텍스트 파싱 |
| POST | `/api/funds/{fund_id}/bank-transactions/upload` | 엑셀 업로드 |
| GET | `/api/funds/{fund_id}/bank-transactions?year_month=` | 입출금 내역 조회 |
| POST | `/api/funds/{fund_id}/bank-transactions/auto-journal` | 자동 분개 실행 |
| POST | `/api/funds/{fund_id}/bank-transactions/{id}/manual-map` | 수동 매핑 + 학습 |
| GET | `/api/funds/{fund_id}/mapping-rules` | 매핑 규칙 조회 |
| POST | `/api/funds/{fund_id}/mapping-rules` | 매핑 규칙 추가 |
| PUT | `/api/mapping-rules/{id}` | 매핑 규칙 수정 |
| POST | `/api/funds/{fund_id}/provisional-fs/generate` | 가결산 생성 |
| GET | `/api/funds/{fund_id}/provisional-fs?year_month=` | 가결산 조회 |
| PUT | `/api/provisional-fs/{id}/confirm` | 가결산 확정 |
| GET | `/api/provisional-fs/{id}/download` | 엑셀 다운로드 |
| GET | `/api/provisional-fs/overview` | 전체 조합 가결산 현황 |

---

## Part 7. 프론트엔드 — 가결산 페이지

#### [NEW] `frontend/src/pages/ProvisionalFSPage.tsx`

```
┌─ 가결산 관리 ──────────────────────────────────────────┐
│                                                        │
│  조합: [트리거-글로벌PEX ▼]   월: [2026년 1월 ▼]         │
│                                                        │
│  ── Step 1: 입출금 내역 입력 ──                         │
│  [📋 복사-붙여넣기]  [📁 엑셀 업로드]                    │
│  ┌────────────────────────────────────────────┐        │
│  │ 여기에 은행 내역을 복사-붙여넣기 하세요        │        │
│  └────────────────────────────────────────────┘        │
│  [파싱 실행]                                            │
│                                                        │
│  ── Step 2: 입출금 내역 확인 ──                         │
│  No | 날짜      | 출금        | 입금        | 거래처     │
│  1  | 03/31     | 63,012,492 |            | GP 운용보수 │
│  2  | 03/28     | 1,499,925K |            | 저스트그린  │
│  ...                                                   │
│  총 13건 | 출금합계: 2,564M | 입금합계: 1,662M           │
│                                                        │
│  ── Step 3: 자동 분개 ──                               │
│  [자동 분개 실행]                                       │
│  ✅ 자동 매핑 11건 / ⚠️ 수동 필요 2건                    │
│                                                        │
│  ⚠️ No.5: OOO(주) 출금 150M → 계정: [선택 ▼]           │
│  ⚠️ No.9: 태성회계법인 출금 1.1M → 계정: [선택 ▼]       │
│  ☑ 이 거래처를 다음에도 같은 계정으로 자동 매핑            │
│                                                        │
│  [분개 확정]                                            │
│                                                        │
│  ── Step 4: 가결산 재무제표 ──                          │
│  [가결산 생성]                                          │
│                                                        │
│  [SFP 탭] [IS 탭]                                      │
│  (이미지와 동일한 양식으로 표시)                          │
│                                                        │
│  [📥 엑셀 다운로드]  [✅ 확정]                           │
└────────────────────────────────────────────────────────┘
```

### 7-2. 전체 조합 가결산 현황

#### [NEW] `frontend/src/components/provisional/FSOverview.tsx`

```
┌─ 2026년 1월 가결산 현황 ───────────────────┐
│                                            │
│  A조합: ✅ 확정 완료 — 자산 88억           │
│  B조합: ⚠️ 미확정 (2건 수동 매핑 필요)     │
│  C조합: ❌ 미입력                          │
│  D조합: ✅ 확정 완료 — 자산 45억           │
│                                            │
│  [전체 엑셀 일괄 다운로드]                  │
└────────────────────────────────────────────┘
```

---

## Part 8. 초기 계정과목 시드 데이터

#### [NEW] `backend/seeds/fund_accounts.py`

조합 표준 계정과목 시드:

```python
FUND_STANDARD_ACCOUNTS = [
    # 자산
    {"code": "1100000", "name": "유동자산", "category": "자산", "sub_category": "유동자산"},
    {"code": "1110100", "name": "보통예금", "category": "자산", "sub_category": "유동자산"},
    {"code": "1110106", "name": "MMDA", "category": "자산", "sub_category": "유동자산"},
    {"code": "1120100", "name": "단기매매증권", "category": "자산", "sub_category": "유동자산"},
    {"code": "1130100", "name": "미수금", "category": "자산", "sub_category": "유동자산"},
    {"code": "1130200", "name": "미수수익", "category": "자산", "sub_category": "유동자산"},
    {"code": "1200100", "name": "주목적투자자산", "category": "자산", "sub_category": "투자자산"},
    {"code": "1200200", "name": "비목적투자자산", "category": "자산", "sub_category": "투자자산"},
    # 부채
    {"code": "2100100", "name": "미지급배당금", "category": "부채", "sub_category": "유동부채"},
    {"code": "2100200", "name": "기타유동부채", "category": "부채", "sub_category": "유동부채"},
    # 자본
    {"code": "3100300", "name": "출자금", "category": "자본", "sub_category": "자본-출자금"},
    {"code": "3200100", "name": "자본잉여금", "category": "자본", "sub_category": "자본잉여금"},
    {"code": "3300100", "name": "이익잉여금", "category": "자본", "sub_category": "이익잉여금"},
    # 수익
    {"code": "4110100", "name": "투자수익", "category": "수익", "sub_category": "영업수익"},
    {"code": "4120100", "name": "운용투자수익", "category": "수익", "sub_category": "영업수익"},
    {"code": "4130100", "name": "기타영업수익", "category": "수익", "sub_category": "영업수익"},
    {"code": "4160206", "name": "MMDA이자", "category": "수익", "sub_category": "기타영업수익"},
    {"code": "4120700", "name": "기타조합수익", "category": "수익", "sub_category": "기타영업수익"},
    # 비용
    {"code": "4210100", "name": "관리보수", "category": "비용", "sub_category": "영업비용"},
    {"code": "4210200", "name": "성과보수", "category": "비용", "sub_category": "영업비용"},
    {"code": "4210300", "name": "수탁관리보수", "category": "비용", "sub_category": "영업비용"},
    {"code": "4210400", "name": "회계감사수수료", "category": "비용", "sub_category": "영업비용"},
    {"code": "4220100", "name": "투자비용", "category": "비용", "sub_category": "영업비용"},
    {"code": "4220200", "name": "운용투자비용", "category": "비용", "sub_category": "영업비용"},
    {"code": "4230100", "name": "기타영업비용", "category": "비용", "sub_category": "영업비용"},
    {"code": "4240100", "name": "판매비와관리비", "category": "비용", "sub_category": "영업비용"},
]
```

---

## Part 9. 초기 매핑 규칙 시드

#### [NEW] `backend/seeds/default_mapping_rules.py`

```python
DEFAULT_MAPPING_RULES = [
    # 입금 규칙
    {"keyword": "모태", "direction": "deposit", "debit": "1110106", "credit": "3100300", "desc": "출자금 납입"},
    {"keyword": "예금이자", "direction": "deposit", "debit": "1110106", "credit": "4160206", "desc": "MMDA이자"},
    {"keyword": "이자", "direction": "deposit", "debit": "1110106", "credit": "4130100", "desc": "이자수익"},
    # 출금 규칙 (GP명은 조합별로 설정 필요)
    {"keyword": "회계법인", "direction": "withdrawal", "debit": "4210400", "credit": "1110106", "desc": "회계감사수수료"},
    {"keyword": "감사법인", "direction": "withdrawal", "debit": "4210400", "credit": "1110106", "desc": "회계감사수수료"},
]
```

---

## ⚠️ 기능 보호 규칙

- 기존 `Account`, `JournalEntry`, `JournalEntryLine` 모델 **변경 금지** (확장만 가능)
- 기존 `AccountingPage`, `TransactionsPage` UI **변경 금지**
- 기존 API 엔드포인트 **변경 금지**

---

## Files to modify / create

| # | Type | Target |
|---|------|--------|
| 1 | [NEW] | `backend/models/bank_transaction.py` |
| 2 | [NEW] | `backend/models/auto_mapping_rule.py` |
| 3 | [NEW] | `backend/models/provisional_fs.py` |
| 4 | [NEW] | `backend/services/bank_statement_parser.py` |
| 5 | [NEW] | `backend/services/auto_journal.py` |
| 6 | [NEW] | `backend/services/provisional_fs_service.py` |
| 7 | [NEW] | `backend/services/fs_excel_exporter.py` |
| 8 | [NEW] | `backend/routers/provisional_fs.py` |
| 9 | [NEW] | `backend/seeds/fund_accounts.py` |
| 10 | [NEW] | `backend/seeds/default_mapping_rules.py` |
| 11 | [MODIFY] | `backend/models/__init__.py` — 신규 모델 등록 |
| 12 | [MODIFY] | `backend/main.py` — 라우터 등록 |
| 13 | [NEW] | `frontend/src/pages/ProvisionalFSPage.tsx` |
| 14 | [NEW] | `frontend/src/components/provisional/FSOverview.tsx` |
| 15 | [MODIFY] | `frontend/src/lib/api.ts` — 가결산 API 함수 |
| 16 | [MODIFY] | `frontend/src/App.tsx` — 라우트 추가 |
| 17 | [MODIFY] | 사이드바/네비게이션 — 메뉴 추가 |

---

## Acceptance Criteria

- [ ] **AC-01:** 복사-붙여넣기 텍스트를 파싱하여 BankTransaction으로 저장된다.
- [ ] **AC-02:** 엑셀 업로드로도 입출금 내역이 입력된다.
- [ ] **AC-03:** AutoMappingRule 기반으로 입출금이 자동 분개된다.
- [ ] **AC-04:** 매핑 안 되는 건은 UI에서 수동 계정 선택이 가능하다.
- [ ] **AC-05:** 수동 매핑 시 "다음에도 같은 계정" 학습이 동작한다.
- [ ] **AC-06:** 가결산 생성 시 SFP(재무상태표)가 자동 계산된다.
- [ ] **AC-07:** 가결산 생성 시 IS(손익계산서)가 자동 계산된다.
- [ ] **AC-08:** 기존 엑셀 양식(가결산전표/SFP/IS 3시트)과 동일한 엑셀이 다운로드된다.
- [ ] **AC-09:** 조합별·월별로 독립적으로 가결산이 관리된다.
- [ ] **AC-10:** 전체 조합 가결산 현황을 한눈에 볼 수 있다.
- [ ] **AC-11:** 분개 확정 전 수정/삭제가 가능하다.
- [ ] **AC-12:** 조합 최초 사용 시 표준 계정과목이 자동 생성된다.
