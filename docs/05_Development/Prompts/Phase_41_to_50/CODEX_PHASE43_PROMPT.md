# Phase 43: 조합 서류 자동 생성 시스템 (웹 ERP 통합)

> 🔖 **작업 전 필수:** `docs/CODEX_RULES.md` 먼저 읽을 것.
> ⚠️ **비식별화 원칙:** 실존 정보 사용 금지.
> **완료 후:** CODEX_RULES.md §2의 Post-Work Checklist 수행.

**Priority:** P0 — 핵심 업무 자동화  
**의존성:** Phase 42 완료 상태 (이전 Phase에서 추가한 모든 기능 유지)  
**핵심 원칙:**
1. **실무 자동화** — 벤처투자조합 결성 시 반복되는 서류 작업을 시스템으로 자동화
2. **서식 100% 보존** — HWP 서류의 자간·장평·여백 등 서식을 유지하면서 변수만 치환
3. **ERP 통합** — 기존 조합(Fund) 데이터와 연동하여 변수 자동 매핑, 생성 이력 관리
4. **5단계 프로세스** — 고유번호 발급 → 수탁업무 → 결성총회 전 통지 → 결성총회 → 벤처투자조합 등록

---

## 배경: 조합 서류 자동 생성기

현재 `docs/조합_자동화/` 폴더에 독립 실행형 tkinter 앱으로 구현되어 있는 시스템을 웹 ERP에 통합한다.

### 기존 시스템 구조

```
docs/조합_자동화/
├── STRUCTURE.md         # 전체 구조 문서
├── app.py               # tkinter GUI (409줄)
├── generator.py         # 핵심 엔진: HWP COM + DOCX 치환 (250줄)
├── setup_templates.py   # 템플릿 마커 삽입 (298줄)
├── variables/           # 변수 JSON (참고용)
├── templates/           # {{마커}} 삽입된 템플릿 파일
└── output/              # 생성 결과물
```

### 핵심 엔진 (`generator.py`)

- **`HwpAutomation`**: HWP COM 자동화 (`win32com.client`) — `{{마커}}` → 실제값 치환
- **`replace_in_docx()`**: python-docx 기반 DOCX 치환 (단락 + 표 런 순회)
- **`generate_documents()`**: templates/ 폴더 재귀 순회 → HWP/DOCX 치환 + 나머지 파일 복사

### 변수(마커) 전체 목록 (43개)

| 키 | 설명 | 섹션 |
|---|---|---|
| `조합명` | 공식 조합 이름 | 기본정보 |
| `조합명_파일명` | 파일명용 (띄어쓰기 없음) | 기본정보 |
| `조합_호수` | 호수 단독 사용 | 기본정보 |
| `업무집행조합원_정식` | GP 법적 정식 명칭 | 기본정보 |
| `업무집행조합원_약칭` | GP 약칭 | 기본정보 |
| `대표이사` | 대표이사 이름 | 기본정보 |
| `대표펀드매니저` | 대표 펀드매니저 | 기본정보 |
| `사업자등록번호` | GP 사업자등록번호 | 번호 |
| `법인등록번호` | GP 법인등록번호 | 번호 |
| `고유번호` | 세무서 발급 고유번호 | 번호 |
| `총출자금_숫자` | 숫자 표기 (예: 2,275,000,000) | 규모 |
| `총출자금_한글` | 한글 표기 (예: 금이십이억칠천오백만원) | 규모 |
| `총출자금_기호` | 원화 기호 포함 (예: ₩2,275,000,000) | 규모 |
| `총출자좌수` | 출자좌수 | 규모 |
| `조합원총수` | 업무집행 + 유한책임 합계 | 규모 |
| `유한책임조합원수` | LP 수 | 규모 |
| `존속기간` | 조합 존속 기간 | 규모 |
| `결성총회일시_풀` | 전체 표기 | 일정 |
| `결성총회일_날짜` | 날짜만 | 일정 |
| `결성총회일_요일` | 요일만 | 일정 |
| `결성총회일_약식` | 약식 날짜 | 일정 |
| `소집통지날짜` | 총회 9일 전 | 일정 |
| `소집통지날짜_약식` | 약식 | 일정 |
| `등록신청일` | 총회 3일 후 | 일정 |
| `납입기한` | 납입 기한 | 일정 |
| `개업일` | 개업 날짜 | 일정 |
| `임대차_시작` | 임대차 시작일 | 일정 |
| `임대차_종료` | 임대차 종료일 | 일정 |
| `임대차_기간` | 시작~종료 | 일정 |
| `임대차_면적` | 임대 면적 | 장소·계좌 |
| `사업장주소_정식` | 정식 주소 | 장소·계좌 |
| `사업장주소_약식` | 약식 주소 | 장소·계좌 |
| `우편번호` | 우편번호 | 장소·계좌 |
| `전화번호` | 전화번호 | 장소·계좌 |
| `팩스번호` | 팩스번호 | 장소·계좌 |
| `납입계좌은행` | 납입 은행 | 장소·계좌 |
| `납입계좌번호` | 납입 계좌 | 장소·계좌 |
| `수탁기관` | 수탁 기관명 | 기관·보수 |
| `수탁보수` | 수탁 보수 | 기관·보수 |
| `외부감사인` | 감사 법인 | 기관·보수 |
| `감사보수` | 감사 보수 | 기관·보수 |
| `문서번호_통지` | 결성총회 통지 공문 번호 | 문서번호·담당자 |
| `문서번호_등록` | 벤처투자조합 등록 공문 번호 | 문서번호·담당자 |
| `담당자명` | 담당자 이름 | 문서번호·담당자 |
| `담당자이메일` | 담당자 이메일 | 문서번호·담당자 |
| `담당자연락처` | 담당자 연락처 | 문서번호·담당자 |

### 조합 결성 5단계 프로세스

```
1. 고유번호증 발급
   └─ 세무서에 조합 존재 등록
   └─ 서류: 신청서, 규약, 사업장 승낙서, 임대인 동의서, 법인등기, 인감, 사업자등록증

2. 수탁업무
   └─ 수탁기관에 자산 보관 계약
   └─ 서류: 사용인감 신고서, 규약, 법인서류

3. 결성총회 전 통지  ← 총회 9일 전 발송
   └─ 공문 + 서류 패키지 발송
   └─ 서류: 공문, 규약(안), 동의서류, 서면결의서 등 10여 종

4. 결성총회  ← 서면결의 방식
   └─ 6개 안건 가결
   └─ 서류: 결성총회 의사록

5. 벤처투자조합 등록  ← 총회 3일 후
   └─ 중소벤처기업부 12개 서류 제출
   └─ 서류: 등록신청서, 규약, 의사록, 조합원명부, 분류기준표 등
```

---

## Part 0. 전수조사 (필수)

### 기존 조합 자동화 코드 확인
- [ ] `docs/조합_자동화/STRUCTURE.md` — 전체 구조 문서 정독
- [ ] `docs/조합_자동화/generator.py` (250줄) — `HwpAutomation`, `replace_in_docx`, `generate_documents` 엔진 구조 확인
- [ ] `docs/조합_자동화/setup_templates.py` (298줄) — `KNOWN_VALUES` 마커 매핑, `HwpMarker`, `setup_templates` 확인
- [ ] `docs/조합_자동화/app.py` (409줄) — `FIELDS` 정의 (7개 섹션 43개 변수), GUI 동작 흐름 확인
- [ ] `docs/조합_자동화/variables/트리거메디테크3호_참고.json` — 3호 조합 변수값 전체 확인

### ERP 기존 코드 확인
- [ ] `backend/models/fund.py` — Fund 모델 필드 확인 (name, fund_type, commitment_total 등 → 변수 자동매핑 가능여부)
- [ ] `backend/routers/funds.py` — Fund CRUD API 확인
- [ ] `backend/models/` — GP, LP 관련 모델 확인
- [ ] `frontend/src/pages/FundDetailPage.tsx` — 조합 상세 페이지 구조 확인 (탭 추가 위치)
- [ ] `frontend/src/lib/api.ts` — API 타입/함수 구조 확인
- [ ] `backend/main.py` — 라우터 등록 구조 확인

---

## Part 1. 백엔드 — 서류 생성 엔진 통합

### 1-1. 핵심 엔진 모듈을 백엔드로 이식

#### [NEW] `backend/services/document_generator.py`

`docs/조합_자동화/generator.py`의 핵심 로직을 백엔드 서비스로 이식:

```python
"""
조합 서류 자동 생성 서비스
- HWP COM 자동화 (win32com)
- DOCX 마커 치환 (python-docx)
- 템플릿 폴더 재귀 처리
"""

class HwpAutomation:
    """HWP COM 래퍼 — generator.py의 HwpAutomation 그대로 이식"""
    # __enter__, __exit__, replace_in_file, _find_replace 그대로

def replace_in_docx(src, dst, replacements) -> tuple[bool, list]:
    """DOCX 마커 치환 — generator.py의 replace_in_docx 그대로 이식"""

async def generate_documents(
    variables: dict,
    template_dir: str,
    output_dir: str,
    stages: list[int] | None = None,   # 선택적 단계 필터 (1~5)
    progress_callback=None
) -> dict:
    """
    서류 일괄 생성.
    stages가 지정되면 해당 단계 폴더만 처리.  
    """
```

**설계 포인트:**
- `generator.py`의 `HwpAutomation`, `replace_in_docx`, `generate_documents` 3개를 그대로 이식
- HWP COM은 Windows 환경 전용이므로 서버가 Windows일 때만 동작. 리눅스 환경 분기: HWP 파일은 스킵하고 DOCX + 복사만 처리
- 비동기 래퍼: HWP COM은 동기 호출이므로 `asyncio.to_thread`로 감싼다
- `stages` 파라미터 추가: 5단계 중 특정 단계만 선택 생성 가능

### 1-2. 템플릿 관리

#### [NEW] `backend/services/template_manager.py`

```python
"""
조합 서류 템플릿 관리
- 템플릿 폴더 구조 조회
- 마커 삽입 (setup_templates 로직)
"""

TEMPLATE_BASE_DIR = "templates/fund_documents"   # 프로젝트 루트 기준

STAGES = {
    1: "1. 고유번호증 발급",
    2: "2. 수탁업무",
    3: "3. 결성총회 전 통지",
    4: "4. 결성총회",
    5: "5. 벤처투자조합 등록",
}

def get_template_structure() -> dict:
    """템플릿 폴더 구조를 트리 형태로 반환"""

def get_template_files(stage: int | None = None) -> list[dict]:
    """특정 단계(또는 전체)의 템플릿 파일 목록 반환"""
```

---

## Part 2. 백엔드 — 데이터 모델 및 API

### 2-1. 서류 생성 이력 모델

#### [NEW] `backend/models/document_generation.py`

```python
class DocumentGeneration(Base):
    """조합 서류 생성 이력"""
    __tablename__ = "document_generations"

    id: int                          # PK
    fund_id: int                     # FK → funds.id
    created_by: int                  # FK → users.id
    created_at: datetime             # 생성 시각
    status: str                      # "pending" | "processing" | "completed" | "failed"

    # 생성 설정
    variables_json: str              # 사용된 변수값 JSON (전체 스냅샷)
    stages: str | None               # 선택된 단계 (예: "1,2,3" 또는 null=전체)
    
    # 결과
    output_path: str | None          # 생성된 파일 경로
    total_files: int = 0             # 총 생성 파일 수
    success_count: int = 0           # 성공 수
    failed_count: int = 0            # 실패 수
    warnings_json: str | None        # 경고 목록 JSON
    error_message: str | None        # 실패 시 에러 메시지

class DocumentVariable(Base):
    """조합별 서류 변수 프리셋 (저장/불러오기용)"""
    __tablename__ = "document_variables"
    
    id: int                          # PK
    fund_id: int                     # FK → funds.id
    name: str                        # 프리셋 이름 (예: "4호 조합 기본값")
    variables_json: str              # 변수값 JSON
    is_default: bool = False         # 기본 프리셋 여부
    created_at: datetime
    updated_at: datetime
```

### 2-2. 스키마

#### [NEW] `backend/schemas/document_generation.py`

```python
class DocumentVariableCreate(BaseModel):
    """변수 프리셋 생성"""
    fund_id: int
    name: str
    variables: dict   # 변수 키-값 딕셔너리

class DocumentVariableUpdate(BaseModel):
    """변수 프리셋 수정"""
    name: str | None = None
    variables: dict | None = None
    is_default: bool | None = None

class DocumentGenerateRequest(BaseModel):
    """서류 생성 요청"""
    fund_id: int
    variables: dict              # 변수 키-값 딕셔너리
    stages: list[int] | None = None   # 1~5 중 선택, None이면 전체
    save_preset: bool = False    # 변수값을 프리셋으로 저장할지 여부
    preset_name: str | None = None

class DocumentGenerateResponse(BaseModel):
    """서류 생성 결과"""
    generation_id: int
    status: str
    total_files: int
    success_count: int
    failed_count: int
    warnings: list[str]
    download_url: str | None     # ZIP 다운로드 URL

class TemplateFileInfo(BaseModel):
    """템플릿 파일 정보"""
    stage: int
    stage_name: str
    file_name: str
    file_type: str   # "hwp" | "docx" | "pdf" | "other"
    relative_path: str

class TemplateStructure(BaseModel):
    """전체 템플릿 구조"""
    stages: list[dict]   # 단계별 파일 목록
    total_templates: int
    markers: list[str]   # 사용 가능한 마커 키 목록
```

### 2-3. API 라우터

#### [NEW] `backend/routers/document_generation.py`

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/document-generation/templates` | 템플릿 구조 조회 (단계별 파일 목록) |
| GET | `/api/document-generation/templates/{stage}` | 특정 단계 템플릿 파일 목록 |
| GET | `/api/document-generation/markers` | 사용 가능한 마커(변수) 목록 + 설명 |
| POST | `/api/document-generation/generate` | 서류 생성 요청 (비동기 처리) |
| GET | `/api/document-generation/{id}/status` | 생성 진행 상태 조회 |
| GET | `/api/document-generation/{id}/download` | 생성 완료 파일 ZIP 다운로드 |
| GET | `/api/document-generation/history` | 생성 이력 목록 (fund_id 필터) |
| GET | `/api/document-generation/history/{id}` | 생성 이력 상세 |
| DELETE | `/api/document-generation/history/{id}` | 생성 이력 삭제 + 파일 정리 |
| POST | `/api/document-variables` | 변수 프리셋 저장 |
| GET | `/api/document-variables?fund_id={id}` | 조합별 변수 프리셋 목록 |
| GET | `/api/document-variables/{id}` | 변수 프리셋 상세 |
| PUT | `/api/document-variables/{id}` | 변수 프리셋 수정 |
| DELETE | `/api/document-variables/{id}` | 변수 프리셋 삭제 |
| GET | `/api/document-generation/auto-fill/{fund_id}` | 조합 데이터 기반 변수 자동 채움 |

#### 자동 채움 API 상세 (`/auto-fill/{fund_id}`)

**조합(Fund) + GP + LP 데이터에서 자동 매핑 가능한 필드:**

```python
def auto_fill_variables(fund_id: int, db: Session) -> dict:
    """
    Fund, GP, LP 데이터로 변수 자동 채움.
    매핑 불가능한 필드는 빈 값으로 반환.
    """
    fund = db.query(Fund).get(fund_id)
    # gp = fund.gp_entity  (GP 엔티티 존재 시)
    
    auto_filled = {
        # Fund에서 자동 매핑
        "조합명": fund.name,
        "총출자금_숫자": format_number(fund.commitment_total),
        "총출자좌수": format_number(fund.commitment_total / 1_000_000),  # 1좌=100만원 가정
        "존속기간": f"{fund.duration_years}년" if fund.duration_years else "",
        
        # LP 집계
        "조합원총수": str(fund.lps.count() + 1),  # LP + GP
        "유한책임조합원수": str(fund.lps.count()),
        
        # GP에서 자동 매핑 (GP 엔티티가 있는 경우)
        "업무집행조합원_정식": gp.name if gp else "",
        "사업자등록번호": gp.business_number if gp else "",
        "대표이사": gp.representative if gp else "",
        
        # 나머지는 수동 입력 필요 → 빈 값
        "조합명_파일명": fund.name.replace(" ", ""),
        "결성총회일시_풀": "",
        "사업장주소_정식": "",
        # ...
    }
    return auto_filled
```

### 2-4. 비동기 생성 처리

서류 생성은 HWP COM 처리로 인해 수십 초~수 분 소요 가능. 비동기 처리:

```python
@router.post("/generate")
async def generate_documents_endpoint(
    request: DocumentGenerateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    # 1. DocumentGeneration 레코드 생성 (status="pending")
    generation = DocumentGeneration(
        fund_id=request.fund_id,
        created_by=current_user.id,
        status="pending",
        variables_json=json.dumps(request.variables, ensure_ascii=False),
        stages=",".join(str(s) for s in request.stages) if request.stages else None,
    )
    db.add(generation)
    db.commit()
    
    # 2. 백그라운드 태스크로 실제 생성 실행
    background_tasks.add_task(
        _run_generation, generation.id, request.variables, request.stages
    )
    
    # 3. 즉시 응답 (generation_id 반환)
    return {"generation_id": generation.id, "status": "pending"}
```

---

## Part 3. 백엔드 — 템플릿 파일 관리

### 3-1. 템플릿 저장 위치

#### [NEW] `templates/fund_documents/` 디렉터리

`docs/조합_자동화/templates/` 폴더 구조를 프로젝트 루트 `templates/fund_documents/`로 복사하여 사용:

```
templates/fund_documents/
├── 1. 고유번호증 발급/
│   ├── 1. 결성(고유)_고유번호발급 신청서.hwp
│   ├── 2. 조합_규약(최종).hwp
│   ├── 4. 결성(고유)_사업장 무상사용 승낙서.hwp
│   └── ...
├── 2. 수탁업무/
│   └── ...
├── 3. 결성총회 전 통지/
│   └── ...
├── 4. 결성총회/
│   └── ...
└── 5. 벤처투자조합 등록/
    └── ...
```

> **중요:** 템플릿 파일에는 이미 `{{마커}}`가 삽입되어 있어야 한다. `setup_templates.py`를 1회 실행하여 생성한 결과물을 여기에 배치.

### 3-2. 생성 결과물 저장

```
backend/uploads/document_generations/
└── {generation_id}/
    └── {조합명}/
        ├── 1. 고유번호증 발급/
        ├── 2. 수탁업무/
        └── ...
```

### 3-3. ZIP 다운로드

생성 완료 후 전체 폴더를 ZIP으로 압축하여 다운로드 제공:

```python
@router.get("/{generation_id}/download")
async def download_generated_documents(generation_id: int, ...):
    """생성된 서류를 ZIP으로 다운로드"""
    generation = db.query(DocumentGeneration).get(generation_id)
    zip_path = create_zip(generation.output_path)
    return FileResponse(zip_path, filename=f"{fund_name}_서류.zip")
```

---

## Part 4. 프론트엔드 — 서류 생성 UI

### 4-1. 조합 상세 페이지에 "서류 생성" 탭 추가

#### `pages/FundDetailPage.tsx` [MODIFY — 탭 추가]

기존 탭 구조에 `documents` 탭 추가:

```typescript
const TABS = [
  { id: 'overview', label: '조합 요약' },
  { id: 'info', label: '기본정보' },
  { id: 'capital', label: '자본 및 LP현황' },
  { id: 'portfolio', label: '투자 포트폴리오' },
  { id: 'nav', label: 'NAV' },
  { id: 'fees', label: '보수' },
  { id: 'terms', label: '규약 및 컴플라이언스' },
  { id: 'documents', label: '📄 서류 생성' },   // ← 추가
];
```

### 4-2. 서류 생성 탭 컴포넌트

#### [NEW] `frontend/src/components/fund/FundDocumentGenerator.tsx`

**주요 UI 구성:**

```
┌─ 📄 조합 서류 자동 생성 ──────────────────────────────────────────────┐
│                                                                        │
│  [프리셋 관리 바]                                                       │
│  ┌──────────────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ 📂 프리셋 선택 ▼ │  │ 💾 저장   │  │ ↻ 초기화  │  │ 🔄 자동채움  │  │
│  └──────────────────┘  └──────────┘  └───────── ┘  └───────────────┘  │
│                                                                        │
│  [단계 선택 체크박스]                                                    │
│  ☑ 1. 고유번호증 발급  ☑ 2. 수탁업무  ☑ 3. 결성총회 전 통지            │
│  ☑ 4. 결성총회        ☑ 5. 벤처투자조합 등록                           │
│                                                                        │
│  ┌── 조합 기본정보 ──────────────────────────────────────────────────┐ │
│  │  * 조합명                 [트리거 메디테크  호 조합              ] │ │
│  │  * 조합명 (파일명용)      [트리거메디테크호조합                  ] │ │
│  │  * 업무집행조합원 (정식)   [트리거투자파트너스 유한회사           ] │ │
│  │  ...                                                              │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  ┌── 번호 ───────────────────────────────────────────────────────────┐ │
│  │  * 사업자등록번호          [786-88-02871                         ] │ │
│  │  ...                                                              │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  ... (규모, 일정, 장소·계좌, 기관·보수, 문서번호·담당자 섹션)           │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  🚀  서류 생성  (5개 단계, 약 30개 파일)                           │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  [생성 이력]                                                            │
│  ┌────┬──────────────┬────────┬──────┬──────┬─────────────────────┐   │
│  │ #  │ 생성일시      │ 상태   │ 성공  │ 실패 │ 액션               │   │
│  ├────┼──────────────┼────────┼──────┼──────┼─────────────────────┤   │
│  │ 3  │ 2026-02-25   │ ✅ 완료│ 28   │ 0    │ [📥 다운로드] [🗑] │   │
│  │ 2  │ 2026-02-20   │ ✅ 완료│ 25   │ 3    │ [📥 다운로드] [🗑] │   │
│  │ 1  │ 2026-02-15   │ ❌ 실패│ 0    │ 30   │ [상세보기]   [🗑] │   │
│  └────┴──────────────┴────────┴──────┴──────┴─────────────────────┘   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**기능 상세:**

1. **변수 입력 폼**: `app.py`의 `FIELDS` 정의를 그대로 반영한 7개 섹션 폼
   - 필수 필드(`*` 표시): 조합명, 업무집행조합원_정식 등 — 빈 값이면 생성 버튼 비활성화
   - 선택 필드: 법인등록번호, 소집통지날짜_약식 등
   - 각 섹션은 접이식(collapsible) — 초기에는 "조합 기본정보"만 열림

2. **자동 채움** (`🔄 자동채움` 버튼): `/api/document-generation/auto-fill/{fund_id}` 호출
   - Fund 데이터에서 매핑 가능한 필드 자동 입력 (조합명, 총출자금 등)
   - 자동 채움 후 나머지 빈 필드를 노란색 하이라이트로 표시

3. **프리셋 관리**:
   - 드롭다운으로 저장된 프리셋 선택 → 폼에 값 로드
   - 💾 저장: 현재 폼 값을 프리셋으로 저장
   - ↻ 초기화: 모든 필드를 기본값(3호 조합 예시)으로 리셋

4. **단계 선택**: 5단계 중 생성할 단계를 체크박스로 선택. 기본값은 전체 선택

5. **생성 버튼**: 클릭 시 확인 다이얼로그 → 생성 요청 → 진행 상태 폴링
   - 생성 중: 프로그레스 바 + 처리 중 파일명 표시
   - 완료: 성공/실패 건수 + 다운로드 버튼

6. **생성 이력**: 하단에 해당 조합의 생성 이력 테이블
   - 상태 배지 (⏳ 처리 중 / ✅ 완료 / ❌ 실패)
   - 다운로드 버튼 (완료된 경우)
   - 삭제 버튼

### 4-3. 생성 진행 모달

#### [NEW] `frontend/src/components/fund/DocumentGenerationProgress.tsx`

서류 생성 요청 후 진행 상태를 보여주는 모달:

```
┌─ 서류 생성 중 ────────────────────────────────────────┐
│                                                        │
│  ████████████████████░░░░░░░░  70% (21/30)            │
│                                                        │
│  현재 처리: 결성(고유)_고유번호발급 신청서.hwp          │
│                                                        │
│  ✅ 1. 고유번호증 발급 — 8개 완료                      │
│  ✅ 2. 수탁업무 — 5개 완료                             │
│  ⏳ 3. 결성총회 전 통지 — 처리 중 (8/10)               │
│  ⬜ 4. 결성총회                                        │
│  ⬜ 5. 벤처투자조합 등록                               │
│                                                        │
│  [백그라운드로 전환]                                    │
└────────────────────────────────────────────────────────┘
```

- **5초 간격 폴링**: `/api/document-generation/{id}/status` 조회
- **백그라운드로 전환**: 모달 닫고 생성 이력 테이블에서 상태 확인 가능
- **완료 시**: 자동으로 다운로드 버튼 표시

---

## Part 5. 프론트엔드 — API 연동

#### `frontend/src/lib/api.ts` [MODIFY — 타입 및 API 함수 추가]

```typescript
// ── 서류 생성 타입 ──

interface DocumentVariable {
  id: number;
  fund_id: number;
  name: string;
  variables: Record<string, string>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface DocumentGeneration {
  id: number;
  fund_id: number;
  created_by: number;
  created_at: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_files: number;
  success_count: number;
  failed_count: number;
  warnings: string[];
  download_url: string | null;
}

interface DocumentGenerateRequest {
  fund_id: number;
  variables: Record<string, string>;
  stages?: number[];
  save_preset?: boolean;
  preset_name?: string;
}

interface TemplateStructure {
  stages: Array<{
    stage: number;
    stage_name: string;
    files: Array<{
      file_name: string;
      file_type: string;
      relative_path: string;
    }>;
  }>;
  total_templates: number;
  markers: string[];
}

interface MarkerInfo {
  key: string;
  description: string;
  section: string;
  required: boolean;
  default_value: string;
}

// ── API 함수 ──

// 템플릿
export const fetchTemplateStructure = () => api.get('/document-generation/templates');
export const fetchMarkers = () => api.get('/document-generation/markers');

// 서류 생성
export const generateDocuments = (data: DocumentGenerateRequest) =>
  api.post('/document-generation/generate', data);
export const fetchGenerationStatus = (id: number) =>
  api.get(`/document-generation/${id}/status`);
export const fetchGenerationHistory = (fundId: number) =>
  api.get(`/document-generation/history?fund_id=${fundId}`);
export const downloadGeneratedDocuments = (id: number) =>
  api.get(`/document-generation/${id}/download`, { responseType: 'blob' });
export const deleteGeneration = (id: number) =>
  api.delete(`/document-generation/history/${id}`);

// 변수 프리셋
export const fetchDocumentVariables = (fundId: number) =>
  api.get(`/document-variables?fund_id=${fundId}`);
export const createDocumentVariable = (data: { fund_id: number; name: string; variables: Record<string, string> }) =>
  api.post('/document-variables', data);
export const updateDocumentVariable = (id: number, data: Partial<DocumentVariable>) =>
  api.put(`/document-variables/${id}`, data);
export const deleteDocumentVariable = (id: number) =>
  api.delete(`/document-variables/${id}`);

// 자동 채움
export const fetchAutoFillVariables = (fundId: number) =>
  api.get(`/document-generation/auto-fill/${fundId}`);
```

---

## Part 6. DB 마이그레이션

#### [NEW] `backend/migrations/versions/xxx_add_document_generation.py`

Alembic 마이그레이션:

```python
def upgrade():
    # document_generations 테이블
    op.create_table(
        'document_generations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('fund_id', sa.Integer(), sa.ForeignKey('funds.id'), nullable=False),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('status', sa.String(20), nullable=False, default='pending'),
        sa.Column('variables_json', sa.Text(), nullable=False),
        sa.Column('stages', sa.String(20), nullable=True),
        sa.Column('output_path', sa.String(500), nullable=True),
        sa.Column('total_files', sa.Integer(), default=0),
        sa.Column('success_count', sa.Integer(), default=0),
        sa.Column('failed_count', sa.Integer(), default=0),
        sa.Column('warnings_json', sa.Text(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
    )
    
    # document_variables 테이블
    op.create_table(
        'document_variables',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('fund_id', sa.Integer(), sa.ForeignKey('funds.id'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('variables_json', sa.Text(), nullable=False),
        sa.Column('is_default', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
```

---

## Part 7. 라우터 등록 및 의존성

#### `backend/main.py` [MODIFY — 라우터 등록]

```python
from routers import document_generation

app.include_router(
    document_generation.router,
    prefix="/api",
    tags=["document-generation"],
)
```

#### `backend/requirements.txt` [MODIFY — 의존성 추가]

```
pywin32          # HWP COM 자동화 (Windows 전용)
python-docx      # DOCX 치환
```

> **참고:** `pywin32`는 이미 Windows 환경에 설치되어 있을 수 있으므로 확인 후 추가.

---

## Files to modify / create

| # | Type | Target | Description |
|---|------|--------|-------------|
| 1 | [NEW] | `backend/services/document_generator.py` | HWP COM + DOCX 치환 핵심 엔진 (generator.py 이식) |
| 2 | [NEW] | `backend/services/template_manager.py` | 템플릿 폴더 구조 관리 |
| 3 | [NEW] | `backend/models/document_generation.py` | DocumentGeneration, DocumentVariable 모델 |
| 4 | [NEW] | `backend/schemas/document_generation.py` | 서류 생성 관련 Pydantic 스키마 |
| 5 | [NEW] | `backend/routers/document_generation.py` | 서류 생성 API 라우터 (15개 엔드포인트) |
| 6 | [NEW] | `backend/migrations/versions/xxx_add_document_generation.py` | DB 마이그레이션 |
| 7 | [MODIFY] | `backend/main.py` | document_generation 라우터 등록 |
| 8 | [MODIFY] | `backend/requirements.txt` | pywin32, python-docx 추가 |
| 9 | [NEW] | `frontend/src/components/fund/FundDocumentGenerator.tsx` | 서류 생성 메인 UI 컴포넌트 |
| 10 | [NEW] | `frontend/src/components/fund/DocumentGenerationProgress.tsx` | 생성 진행 모달 컴포넌트 |
| 11 | [MODIFY] | `frontend/src/pages/FundDetailPage.tsx` | "서류 생성" 탭 추가 |
| 12 | [MODIFY] | `frontend/src/lib/api.ts` | 서류 생성 관련 타입 + API 함수 추가 |
| 13 | [COPY] | `templates/fund_documents/` | 템플릿 파일 배치 (setup_templates.py 결과물) |

---

## Acceptance Criteria

### Part 1-2 — 백엔드 엔진
- [ ] **AC-01:** `document_generator.py`의 `generate_documents()`가 HWP 파일의 `{{마커}}`를 실제값으로 치환하여 출력 폴더에 저장한다.
- [ ] **AC-02:** DOCX 파일의 마커 치환이 단락 + 표 안 셀에서 정상 동작한다.
- [ ] **AC-03:** PDF 등 비치환 파일은 그대로 복사된다.
- [ ] **AC-04:** `stages` 파라미터로 특정 단계만 선택 처리 가능하다.

### Part 3 — API
- [ ] **AC-05:** `/api/document-generation/generate` POST 요청 시 비동기로 생성이 시작되고 `generation_id`가 반환된다.
- [ ] **AC-06:** `/api/document-generation/{id}/status`로 진행 상태를 조회할 수 있다.
- [ ] **AC-07:** `/api/document-generation/{id}/download`로 생성된 파일을 ZIP으로 다운로드할 수 있다.
- [ ] **AC-08:** `/api/document-generation/auto-fill/{fund_id}`가 Fund 데이터 기반으로 자동 채움 변수를 반환한다.
- [ ] **AC-09:** 변수 프리셋 CRUD가 정상 동작한다.

### Part 4 — 프론트엔드
- [ ] **AC-10:** FundDetail 페이지에 "📄 서류 생성" 탭이 표시된다.
- [ ] **AC-11:** 7개 섹션 폼에 43개 변수를 입력할 수 있다. 필수 필드가 비어있으면 생성 버튼이 비활성화된다.
- [ ] **AC-12:** "🔄 자동채움" 클릭 시 Fund 데이터가 폼에 자동 입력된다.
- [ ] **AC-13:** 프리셋 저장/불러오기/초기화가 동작한다.
- [ ] **AC-14:** 서류 생성 요청 후 진행 모달에서 상태를 확인할 수 있다.
- [ ] **AC-15:** 생성 완료 후 ZIP 파일을 다운로드할 수 있다.
- [ ] **AC-16:** 생성 이력 테이블에서 과거 생성 기록을 확인하고 다운로드/삭제할 수 있다.

### 공통
- [ ] **AC-17:** Phase 31~42의 모든 기능 유지.
- [ ] **AC-18:** 서류 생성 중 다른 페이지 이동 시에도 백그라운드 생성이 중단되지 않는다.

---

## ⚠️ 주의: 절대 수정하지 말 것

1. `KrwAmountInput` — 건드리지 않는다
2. 기존 API 시그니처 (Task CRUD, Fund CRUD, Investment CRUD, LP CRUD, Workflow CRUD) — 유지 (확장만)
3. 기존 데이터 모델 구조 — 유지 (새 테이블만 추가)
4. Phase 31~42의 기존 구현 — 보강만, 삭제/재구성 금지
5. `docs/조합_자동화/` 원본 파일 — 참조만, 수정 금지
6. WorkflowsPage.tsx (140KB) — 이 파일은 건드리지 말 것

---

## 기술 참고사항

### HWP COM 자동화 주의사항
- HWP COM은 **Windows 전용**. 서버가 Windows여야 동작
- HWP 프로그램(한컴오피스 한글)이 서버에 설치되어 있어야 함
- COM 객체는 **단일 스레드**에서만 안전 → `asyncio.to_thread`로 실행
- 동시 생성 요청 시 큐잉 또는 세마포어로 COM 충돌 방지 필요
- `RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")`: 보안 모듈 등록 (파일 접근 허용)

### DOCX 치환 주의사항
- 마커가 여러 런(run)에 걸쳐 분할될 수 있음 → 런 결합 후 치환 방식 사용
- 표(table) 안 셀의 단락도 반드시 순회

### 파일명 치환
- 출력 파일명에 `{{조합명_파일명}}`이 포함된 경우 실제 조합명으로 치환
- 예: `트리거메디테크3호조합_규약.hwp` → `트리거메디테크4호조합_규약.hwp`
