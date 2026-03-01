# Phase 67: 데이터 연계 자동화

> **의존성:** Phase 58 (BE 안정화) + Phase 60 (공통 컴포넌트)
> **근거:** `docs/ERP_ANALYSIS_AND_STRATEGY.md` §3 기능 연계성 분석

**Priority:** P0 — 수작업 제거의 핵심
**핵심 원칙:**
1. **자동화는 제안형** — 자동 생성 후 사용자 확인/승인 필요
2. **기존 수동 경로 유지** — 자동화가 실패해도 수동 입력 가능
3. **트랜잭션 일관성** — 연계 작업은 하나의 DB 트랜잭션에서 처리

---

## Part 0. 전수조사 (필수)

- [ ] `backend/routers/exits.py` — ExitTrade 생성/정산 로직
- [ ] `backend/routers/distributions.py` — Distribution 생성 로직
- [ ] `backend/services/auto_journal.py` — 기존 자동 분개 로직 범위
- [ ] `backend/routers/biz_reports.py` — BizReport 승인/완료 로직
- [ ] `backend/routers/valuations.py` — Valuation 생성 로직
- [ ] `backend/routers/compliance.py` — 의무사항 생성 시 task 연결
- [ ] `backend/models/compliance.py` — ComplianceObligation 필드 확인 (template_id 유무)

---

## Part 1. 엑시트 → 배분 자동 연결

### 1-1. 정산 완료 시 배분 자동생성 서비스

#### [NEW] `backend/services/exit_distribution_service.py`

```python
"""엑시트 정산 → 배분 자동생성 서비스.

ExitTrade 정산 완료 시:
1. 해당 펀드의 LP별 지분 비율(pro-rata) 계산
2. Distribution 레코드 자동생성 (status='draft')
3. DistributionDetail LP별 레코드 생성
4. 관련 회계 분개 자동생성 (draft)
"""

async def create_distribution_from_exit(
    db: Session,
    exit_trade_id: int,
    auto_journal: bool = True,
) -> dict:
    """
    Returns: {
      distribution_id: int,
      details_count: int,
      journal_entry_id: int | None,
      message: str,
    }
    """
    # 1. ExitTrade 조회 + 검증 (settlement_status == '정산완료')
    # 2. Fund의 LP 목록 조회 + 각 LP의 지분 비율 계산
    #    pro_rata = lp.commitment / total_commitment
    # 3. Distribution 생성 (dist_type='exit', status='draft')
    # 4. LP별 DistributionDetail 생성
    #    distribution_amount = exit_trade.net_amount * pro_rata
    # 5. auto_journal=True 시 자동 분개 생성
    #    차) 투자자산 감소 / 대) 배분금 (LP별)
    ...
```

### 1-2. API 엔드포인트

#### [MODIFY] `backend/routers/exits.py`

정산 처리 엔드포인트에 `auto_distribution` 파라미터 추가:

```python
@router.patch("/{trade_id}/settle")
async def settle_exit_trade(
    trade_id: int,
    settlement_amount: float,
    settlement_date: str,
    auto_distribution: bool = False,  # 새 파라미터
    db: Session = Depends(get_db),
):
    # 기존 정산 로직
    ...

    # 자동 배분 생성
    if auto_distribution:
        result = await create_distribution_from_exit(db, trade_id)
        return { "trade": trade, "distribution": result }

    return { "trade": trade }
```

### 1-3. 프론트엔드 연동

Phase 65에서 만든 정산 모달의 `auto_distribution` 체크박스와 연결.
정산 성공 시 → 토스트: "배분 초안이 생성되었습니다. 배분 탭에서 확인하세요."

---

## Part 2. 회계 자동 분개 강화

### 2-1. 이벤트별 분개 매핑 정의

#### [MODIFY] `backend/services/auto_journal.py`

현재 지원하는 자동 분개 + 새로 추가할 분개:

```python
JOURNAL_TEMPLATES = {
    # 기존
    'capital_call_paid': {
        'debit': '보통예금',
        'credit': '출자금',
        'description': 'LP 출자금 납입',
    },
    # 새로 추가
    'distribution_exit': {
        'debit': '투자자산',  # 감소
        'credit': '배분금',
        'description': '엑시트 배분',
    },
    'management_fee': {
        'debit': '관리보수수익',
        'credit': '미수관리보수',
        'description': '관리보수 청구',
    },
    'management_fee_received': {
        'debit': '보통예금',
        'credit': '미수관리보수',
        'description': '관리보수 수령',
    },
    'performance_fee': {
        'debit': '성과보수수익',
        'credit': '미수성과보수',
        'description': '성과보수 확정',
    },
}
```

### 2-2. 워크플로우 단계 완료 → 분개 트리거

#### [MODIFY] `backend/routers/workflows.py`

워크플로우 단계 완료 시, 해당 단계의 `name` 또는 `memo`에 분개 키워드가 포함되면 자동 분개:

```python
# 단계 완료 후
if "출자금 입금" in step_instance.name or "납입확인" in step_instance.name:
    # capital_call_paid 분개 자동생성
    ...
```

**주의:** 자동 분개는 `status='미결재'`로 생성. 사용자가 결재 확인 필요.

---

## Part 3. 사업보고서 → 밸류에이션 연동

### 3-1. BizReport 완료 시 밸류에이션 업데이트 제안

#### [NEW] `backend/services/biz_report_valuation_sync.py`

```python
"""사업보고서 재무데이터 → 밸류에이션 반영 제안 서비스.

BizReport의 매출/영업이익/순이익 데이터를 분석하여
해당 투자의 Valuation 업데이트를 제안.
"""

async def suggest_valuation_updates(
    db: Session,
    biz_report_id: int,
) -> list[dict]:
    """
    Returns: [
      {
        investment_id: int,
        company_name: str,
        current_fair_value: float,
        suggested_fair_value: float,
        change_pct: float,
        reason: str,  # "매출 30% 증가 → 상향 제안"
      },
      ...
    ]
    """
    ...
```

### 3-2. API 엔드포인트

#### [MODIFY] `backend/routers/biz_reports.py`

```python
@router.get("/{report_id}/valuation-suggestions")
async def get_valuation_suggestions(report_id: int, db: Session = Depends(get_db)):
    return await suggest_valuation_updates(db, report_id)
```

### 3-3. 프론트엔드: 밸류에이션 제안 패널

BizReportsPage 상세 뷰에 "밸류에이션 제안" 섹션 추가:

```
┌─ 밸류에이션 업데이트 제안 ──────────────┐
│ A사: ₩50억 → ₩65억 (↑30%) - 매출 증가  │
│ B사: ₩30억 → ₩25억 (↓17%) - 영업손실   │
│                                         │
│ [일괄 적용]  [개별 검토]                 │
└─────────────────────────────────────────┘
```

---

## Part 4. 컴플라이언스 → 문서생성 연동

### 4-1. ComplianceObligation에 template_id 추가

#### Alembic 마이그레이션

```python
# compliance_obligations 테이블에 template_id 컬럼 추가
op.add_column('compliance_obligations',
    sa.Column('template_id', sa.Integer, sa.ForeignKey('document_templates.id'), nullable=True)
)
```

### 4-2. 의무사항 뷰에서 문서 생성 버튼

CompliancePage 의무사항 목록에서:
- `template_id`가 있는 의무사항 → "문서 생성" 버튼 표시
- 클릭 → 해당 템플릿으로 문서 생성 (변수 자동 채움)

---

## Part 5. LP 주소록 ↔ 펀드 LP 연동 강화

### 5-1. 주소록 변경 시 연관 LP 업데이트 제안

#### [NEW] `backend/routers/lp_address_books.py` (기존 파일 수정)

LP 주소록 수정 시, 해당 주소록을 참조하는 Fund LP가 있으면:

```python
@router.put("/{address_id}")
async def update_lp_address(address_id: int, data: LPAddressBookUpdate, db: Session = Depends(get_db)):
    # 기존 업데이트
    ...

    # 연관 LP 찾기
    related_lps = db.query(LP).filter(LP.address_book_id == address_id).all()
    if related_lps:
        return {
            "address": updated,
            "related_lps_count": len(related_lps),
            "sync_suggestion": True,
            "message": f"{len(related_lps)}개 조합의 LP 정보도 함께 업데이트할 수 있습니다.",
        }

    return { "address": updated }
```

### 5-2. LP 모델에 address_book_id 필드 추가

#### Alembic 마이그레이션

```python
op.add_column('lps',
    sa.Column('address_book_id', sa.Integer, sa.ForeignKey('lp_address_books.id'), nullable=True)
)
```

Phase 64에서 구현한 LP Drawer의 주소록 자동완성 선택 시 이 필드에 ID 저장.

---

## Part 6. 감사 로그 활성화 (Phase 58 미들웨어 검증)

Phase 58에서 만든 AuditLogMiddleware가 실제로 모든 CRUD 작업을 기록하는지 검증:

- [ ] POST /api/funds → audit_logs에 action='create', target_type='fund' 기록
- [ ] PUT /api/tasks/1 → action='update', target_type='task', target_id=1 기록
- [ ] DELETE /api/investments/1 → action='delete' 기록
- [ ] 로그에 user_id, ip_address 정확히 기록

---

## 검증 체크리스트

- [ ] 엑시트 정산 + auto_distribution → Distribution 자동생성 (status=draft)
- [ ] 자동 분개: 콜 납입, 배분, 수수료 → JournalEntry 자동생성 (status=미결재)
- [ ] BizReport 완료 → 밸류에이션 제안 API 정상 응답
- [ ] ComplianceObligation template_id → 문서 생성 버튼 동작
- [ ] LP 주소록 수정 → 연관 LP 업데이트 제안 메시지
- [ ] LP 모델에 address_book_id 연결 동작
- [ ] 감사 로그: 주요 CRUD 작업 기록 확인
- [ ] git commit: `feat: Phase 67 data integration automation`
