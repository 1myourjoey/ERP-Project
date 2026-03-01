# Phase 69: LP 보고서 & 엑셀 내보내기

> **의존성:** Phase 68 완료
> **근거:** `docs/ERP_ANALYSIS_AND_STRATEGY.md` §4.1 핵심 누락 (P0, P1)

**Priority:** P0 — 분기 LP 보고서는 VC 관리자 필수 업무
**핵심 원칙:**
1. **기존 문서생성 시스템 활용** — DocumentTemplate + variable_resolver 확장
2. **데이터 자동 수집** — Phase 68의 수익률/현금흐름 서비스 활용
3. **검토/수정 가능** — 자동 생성 후 반드시 사용자 검토 단계

---

## Part 1. 분기 LP 보고서 자동 생성

### 1-1. LP 보고서 데이터 수집 서비스

#### [NEW] `backend/services/lp_report_service.py`

```python
"""분기 LP 보고서 데이터 수집 & DOCX 생성.

보고서 구성:
1. 펀드 개요 (명칭, 설정일, 총약정, 현재 상태)
2. 투자 현황 (포트폴리오 기업 목록, 투자금액, 밸류에이션)
3. 수익률 (IRR, TVPI, DPI)
4. 수수료 명세 (관리보수, 성과보수)
5. 자금 현황 (총 납입, 총 배분, 잔여 약정)
6. 주요 이벤트 (분기 내 투자/엑시트/콜/배분)
"""

async def collect_lp_report_data(
    db: Session,
    fund_id: int,
    year: int,
    quarter: int,
) -> dict:
    """
    Returns: {
      fund: { name, type, formation_date, status, total_commitment, ... },
      period: { year, quarter, start_date, end_date },
      portfolio: [
        { company, investment_date, amount, current_valuation, unrealized_gain, status },
        ...
      ],
      performance: { irr, tvpi, dpi, total_paid_in, total_distributed, residual_value },
      fees: { mgmt_fee_ytd, performance_fee_ytd, total_fees_ytd },
      capital: {
        total_commitment, total_paid_in, total_distributed,
        remaining_commitment, paid_in_ratio,
      },
      events: [
        { date, type, description, amount },
        ...
      ],
      lp_summary: [
        { lp_name, commitment, paid_in, distributions, nav_share },
        ...
      ],
    }
    """
    # Phase 68의 calculate_fund_performance, project_cashflow 활용
    ...

async def generate_lp_report_docx(
    db: Session,
    fund_id: int,
    year: int,
    quarter: int,
) -> bytes:
    """
    1. collect_lp_report_data로 데이터 수집
    2. LP 보고서 템플릿 조회 (DocumentTemplate)
    3. 변수 치환 (variable_resolver 확장)
    4. DOCX 바이트 반환
    """
    ...
```

### 1-2. LP 보고서 API

#### [NEW] `backend/routers/lp_reports.py`

```python
@router.post("/funds/{fund_id}/lp-report/generate")
async def generate_lp_report(
    fund_id: int,
    year: int,
    quarter: int,
    db: Session = Depends(get_db),
):
    """LP 보고서 초안 생성."""
    docx_bytes = await generate_lp_report_docx(db, fund_id, year, quarter)
    # DocumentGeneration 레코드 생성 (status='draft')
    # 파일 저장
    return { "generation_id": gen.id, "message": "LP 보고서 초안이 생성되었습니다." }

@router.get("/funds/{fund_id}/lp-report/preview")
async def preview_lp_report_data(
    fund_id: int,
    year: int,
    quarter: int,
    db: Session = Depends(get_db),
):
    """LP 보고서 데이터 미리보기 (생성 전 확인용)."""
    return await collect_lp_report_data(db, fund_id, year, quarter)
```

### 1-3. 프론트엔드: LP 보고서 생성 UI

FundDetailPage "서류" 탭 또는 별도 버튼:

```
┌─ LP 보고서 생성 ──────────────────────┐
│ 조합: 1호 펀드                         │
│ 기간: [2026 ▼] [1분기 ▼]              │
│                                        │
│ [미리보기]  [보고서 생성]               │
│                                        │
│ ── 미리보기 ──                          │
│ 투자 현황: 12건 / 총 ₩45억             │
│ 수익률: IRR 8.5% · TVPI 1.25x         │
│ 수수료: 관리보수 ₩1.2억 (YTD)          │
│ 주요 이벤트: 2건 (투자 1, 배분 1)       │
│                                        │
│ [수정 후 생성]  [바로 생성]             │
└────────────────────────────────────────┘
```

---

## Part 2. 엑셀 내보내기

### 2-1. 범용 엑셀 내보내기 서비스

#### [NEW] `backend/services/excel_export.py`

```python
"""범용 엑셀 내보내기 서비스.

openpyxl 기반. 각 도메인별 export 함수 제공.
"""

from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from io import BytesIO

def create_styled_workbook() -> Workbook:
    """기본 스타일이 적용된 워크북 생성."""
    wb = Workbook()
    # 헤더 스타일: 파란 배경, 흰 글씨, 굵게
    # 금액 셀: 오른쪽 정렬, 천단위 콤마
    # 날짜 셀: YYYY-MM-DD 포맷
    return wb

async def export_fund_summary(db: Session, fund_id: int) -> bytes:
    """펀드 요약 엑셀."""
    wb = create_styled_workbook()
    # Sheet 1: 펀드 기본정보
    # Sheet 2: LP 현황
    # Sheet 3: 투자 현황
    # Sheet 4: 자본금 콜 이력
    # Sheet 5: 배분 이력
    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()

async def export_investments(db: Session, filters: dict) -> bytes:
    """투자 목록 엑셀."""
    ...

async def export_transactions(db: Session, filters: dict) -> bytes:
    """거래 이력 엑셀."""
    ...

async def export_compliance_report(db: Session, fund_id: int, year: int, month: int) -> bytes:
    """컴플라이언스 월간 보고 엑셀."""
    ...

async def export_worklogs(db: Session, filters: dict) -> bytes:
    """업무일지 엑셀."""
    ...
```

### 2-2. 엑셀 내보내기 API

#### [NEW] `backend/routers/excel_export.py`

```python
from fastapi.responses import StreamingResponse

@router.get("/export/fund/{fund_id}")
async def export_fund(fund_id: int, db: Session = Depends(get_db)):
    data = await export_fund_summary(db, fund_id)
    return StreamingResponse(
        BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=fund_{fund_id}_summary.xlsx"},
    )

@router.get("/export/investments")
async def export_investments_excel(fund_id: int | None = None, db: Session = Depends(get_db)):
    ...

@router.get("/export/transactions")
async def export_transactions_excel(fund_id: int | None = None, db: Session = Depends(get_db)):
    ...

@router.get("/export/compliance/{fund_id}")
async def export_compliance_excel(fund_id: int, year: int, month: int, db: Session = Depends(get_db)):
    ...

@router.get("/export/worklogs")
async def export_worklogs_excel(date_from: str | None = None, date_to: str | None = None, db: Session = Depends(get_db)):
    ...
```

### 2-3. 엑셀 가져오기 (Import)

#### [NEW] `backend/services/excel_import.py`

```python
"""엑셀 가져오기 서비스.

업로드된 엑셀 파일에서 데이터를 파싱하여 검증 → 미리보기 → 확정 Import.
"""

async def parse_excel_preview(file_bytes: bytes, import_type: str) -> dict:
    """
    엑셀 파싱 → 검증 → 미리보기 데이터 반환.

    import_type: 'investments' | 'lps' | 'transactions' | 'valuations'

    Returns: {
      total_rows: int,
      valid_rows: int,
      error_rows: list[{ row: int, errors: list[str] }],
      preview: list[dict],  # 처음 10행
    }
    """
    ...

async def confirm_excel_import(
    db: Session,
    file_bytes: bytes,
    import_type: str,
    options: dict,
) -> dict:
    """
    검증 통과한 데이터 실제 DB에 저장.

    Returns: {
      imported_count: int,
      skipped_count: int,
      errors: list[str],
    }
    """
    ...
```

### 2-4. 프론트엔드: 내보내기 버튼

각 주요 테이블 페이지에 "엑셀 다운로드" 버튼 추가:

```typescript
// 공통 훅
function useExcelExport(endpoint: string, filename: string) {
  const download = async (params?: Record<string, any>) => {
    const response = await api.get(endpoint, { params, responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([response.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  return { download };
}
```

적용 페이지:
- FundsPage: "펀드 요약 엑셀"
- InvestmentsPage: "투자 목록 엑셀"
- TransactionsPage: "거래 이력 엑셀"
- WorkLogsPage: "업무일지 엑셀"
- CompliancePage: "컴플라이언스 보고 엑셀"

### 2-5. 프론트엔드: 가져오기 위저드

#### [NEW] `frontend/src/components/ExcelImportWizard.tsx`

3단계 위저드:
```
Step 1: 파일 업로드
  [파일 선택] 또는 드래그 앤 드롭
  유형 선택: [투자 ▼] [LP ▼] [거래 ▼] [밸류에이션 ▼]

Step 2: 미리보기 & 검증
  ┌─────────────────────────────────────┐
  │ 총 50행 | 유효 48행 | 오류 2행       │
  │                                     │
  │ [미리보기 테이블]                     │
  │ 행 12: "금액" 필드 누락              │
  │ 행 35: "펀드ID" 존재하지 않음         │
  └─────────────────────────────────────┘

Step 3: 확정
  [가져오기 실행] → 결과 표시
```

---

## Part 3. 의존성 추가

```bash
pip install openpyxl  # 엑셀 읽기/쓰기
```

이미 설치되어 있을 수 있음 (python-docx와 함께). 확인 후 추가.

---

## 검증 체크리스트

- [ ] LP 보고서 데이터 미리보기 API 정상 응답
- [ ] LP 보고서 DOCX 생성 → 다운로드 가능
- [ ] LP 보고서 UI: 기간 선택 → 미리보기 → 생성 플로우
- [ ] 엑셀 내보내기: 각 페이지에서 다운로드 버튼 동작
- [ ] 엑셀 내보내기: 파일 정상 열림, 스타일 적용
- [ ] 엑셀 가져오기: 업로드 → 미리보기 → 오류 표시 → 확정
- [ ] git commit: `feat: Phase 69 LP reports and Excel import/export`
