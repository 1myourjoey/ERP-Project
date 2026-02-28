# 조합 서류 자동 생성기 — 코드 구조 문서

> 이 문서는 AI 코드 어시스턴트(Codex 등)가 프로젝트 구조를 파악하고
> 기존 코드와 결합하기 위해 작성되었습니다.

---

## 1. 프로젝트 개요

벤처투자조합 결성에 필요한 서류(HWP, DOCX)를 **변수값만 바꿔** 자동으로
일괄 생성하는 도구입니다.

- **형식 보존 방식**: HWP 파일은 한글(HWP) COM 자동화로 처리 → 자간·장평·여백 등 서식 100% 유지
- **핵심 아이디어**: 원본 파일 안의 특정 텍스트를 `{{마커}}` 형태로 치환해 템플릿화 → 생성 시 마커를 실제 값으로 역치환

---

## 2. 디렉터리 구조

```
조합_자동화/
│
├── app.py                      # GUI 진입점 (tkinter)
├── generator.py                # 핵심 엔진: HWP COM + DOCX 치환
├── setup_templates.py          # 초기 1회 실행: 원본 → 마커 삽입 템플릿 생성
│
├── variables/
│   └── 트리거메디테크3호_참고.json   # 3호 조합 완성 변수값 (참고·복사용)
│
├── templates/                  # setup_templates.py 실행 후 자동 생성
│   ├── 1. 고유번호증 발급/
│   │   ├── 1. 결성(고유)_고유번호발급 신청서.hwp   ← {{마커}} 삽입됨
│   │   ├── 2. 트리거 메디테크 3호 조합_규약(최종).hwp
│   │   ├── 4. 결성(고유)_사업장 무상사용 승낙서(...).hwp
│   │   ├── 5. 결성(고유)_전대차 임대인 동의서(...).hwp
│   │   ├── 6. 결성(고유)_법인등기부등본(3개월이내).pdf  ← 그대로 복사
│   │   ├── 7. 결성(고유)_법인인감증명서(3개월이내).pdf
│   │   └── 8. 결성(고유)_사업자등록증.pdf
│   │
│   ├── 2. 수탁업무/
│   │   ├── 트리거 메디테크 3호 조합 사용인감 신고서.docx
│   │   ├── 트리거 메디테크 3호 조합_규약(최종).hwp
│   │   └── [법인서류 PDF들] ← 그대로 복사
│   │
│   ├── 3. 결성총회 전 통지/
│   │   ├── [공문] 트리거 메디테크 3호 조합_결성총회 개최 및 출자이행 통지.hwp
│   │   ├── 별첨1. 조합규약(안)_별표3. 조합원 동의서.hwp
│   │   ├── 별첨1. 트리거 메디테크 3호 조합_규약(최종).hwp
│   │   ├── 별첨2. 투자의사결정 심의기구 운영방안.hwp
│   │   ├── 별첨4. 개인정보 수집·이용·제공 동의서.hwp
│   │   ├── 별첨5. 고객거래확인서(개인).docx
│   │   ├── 별첨6. 서면결의서.hwp
│   │   ├── 첨부1. 결성총회 소집통지서.hwp
│   │   ├── 첨부2. 결성총회 의안설명서.hwp
│   │   └── [트리거 메디테크 3호 조합] 결성총회 통지 서류/  ← PDF 패키지 폴더
│   │
│   ├── 4. 결성총회/
│   │   ├── (트리거_메디테크_3호_조합)_결성총회 의사록(미날인).docx
│   │   └── [PDF·TXT 파일들]
│   │
│   └── 5. 벤처투자조합 등록/
│       ├── 1.1 결성(등록)_벤처투자조합 등록신청서.hwp
│       ├── 1.2 결성(등록)_조합규약(날인필요).hwp
│       ├── 1.3 결성(등록)_결성총회의사록.docx
│       ├── 1.5 결성(등록)_조합원명부.hwp
│       ├── 1.9 결성(등록)_조합분류기준표.hwp
│       ├── 트리거 메디테크 3호 조합_조합등록 신청의 건_공문_양식.hwp
│       └── 등록서류/  ← PDF 패키지 폴더
│
└── output/
    └── [조합명]/               # generate_documents() 실행 후 자동 생성
        └── (templates/ 와 동일한 폴더 구조)
```

---

## 3. 파일별 역할

### `generator.py`

핵심 엔진. 두 가지 클래스·함수를 제공합니다.

#### `class HwpAutomation`

```python
with HwpAutomation(visible=False) as hwp_auto:
    ok, not_found = hwp_auto.replace_in_file(src_path, dst_path, replacements)
```

- `visible`: 한글 창 표시 여부 (False = 백그라운드 처리)
- `replace_in_file(src, dst, replacements)`:
  - `replacements`: `{"마커키": "실제값", ...}` 딕셔너리
  - 반환: `(성공여부: bool, 미치환 마커 목록: list)`
  - 내부적으로 HWP `AllReplace` 액션 사용
  - `{{마커키}}` → `실제값` 형태로 치환

#### `replace_in_docx(src, dst, replacements)`

```python
ok, not_found = replace_in_docx(src_path, dst_path, replacements)
```

- python-docx 기반
- 단락(paragraph) + 표(table) 안 런(run) 전체 순회하여 치환
- 반환: `(성공여부: bool, 미치환 마커 목록: list)`

#### `generate_documents(variables, template_dir, output_dir, progress_callback=None)`

```python
results = generate_documents(
    variables={"조합명": "트리거 메디테크 4호 조합", ...},
    template_dir="./templates",
    output_dir="./output",
    progress_callback=lambda cur, tot, msg: print(f"[{cur}/{tot}] {msg}")
)
# results = {"success": [...], "failed": [...], "warnings": [...]}
```

- `templates/` 폴더 전체를 재귀 순회
- `.hwp` → `HwpAutomation` 처리
- `.docx` → `replace_in_docx` 처리
- 나머지(PDF, TXT 등) → `shutil.copy2` 그대로 복사
- 출력 경로: `output_dir/variables["조합명"]/` (원본 폴더 구조 유지)

---

### `setup_templates.py`

최초 1회 실행. 3호 조합 완성본에서 알려진 값을 `{{마커}}` 로 치환해 `templates/` 생성.

#### `KNOWN_VALUES` 리스트

```python
KNOWN_VALUES = [
    ("실제값 문자열", "마커키"),
    ...
]
# 길이 내림차순 정렬 필수 (긴 문자열 먼저 치환해야 부분치환 오류 방지)
```

#### `setup_templates(source_dir, template_dir, log_callback=None)`

```python
result = setup_templates(
    source_dir=r"C:\...\[트리거메디테크3호조합]_비식별",
    template_dir="./templates",
    log_callback=lambda cur, tot, msg: print(msg)
)
# result = {"hwp": N, "docx": N, "copy": N, "failed": [...]}
```

---

### `app.py`

tkinter GUI. `generator.py`와 `setup_templates.py`를 import하여 사용.

- `FIELDS` 리스트: GUI 입력 폼 정의 `(섹션, 라벨, 키, 기본값, 필수여부)`
- 기능:
  - 변수값 JSON 저장/불러오기
  - 템플릿 준비 (setup_templates 호출)
  - 서류 생성 (generate_documents 호출)
  - 진행 로그 + 프로그레스바
  - 출력 폴더 바로 열기

---

## 4. 변수(마커) 전체 목록

문서 안에서 `{{키}}` 형태로 삽입됩니다.

| 키 | 3호 조합 예시값 | 설명 |
|---|---|---|
| `조합명` | 트리거 메디테크 3호 조합 | 공식 조합 이름 |
| `조합명_파일명` | 트리거메디테크3호조합 | 파일명용 (띄어쓰기 없음) |
| `조합_호수` | 3호 | 호수만 단독 사용 시 |
| `업무집행조합원_정식` | 트리거투자파트너스 유한회사 | 법적 정식 명칭 |
| `업무집행조합원_약칭` | 트리거투자파트너스(유) | 문서 내 약칭 |
| `대표이사` | 서원일 | |
| `대표펀드매니저` | 서원일 | |
| `사업자등록번호` | 786-88-02871 | |
| `법인등록번호` | 164714-0005810 | |
| `고유번호` | 479-80-03340 | 세무서 발급 |
| `총출자금_숫자` | 2,275,000,000 | 숫자 표기 |
| `총출자금_한글` | 금이십이억칠천오백만원 | 한글 표기 |
| `총출자금_기호` | ₩2,275,000,000 | 원화 기호 포함 |
| `총출자좌수` | 2,275 | |
| `조합원총수` | 19 | 업무집행 + 유한책임 합계 |
| `유한책임조합원수` | 18 | LP 수 |
| `결성총회일시_풀` | 2025년 10월 24일(금요일) 오전 10시 | 전체 표기 |
| `결성총회일_날짜` | 2025년 10월 24일 | 날짜만 |
| `결성총회일_요일` | 금요일 | |
| `결성총회일_약식` | 2025.10.24 | 약식 |
| `소집통지날짜` | 2025년 10월 15일 | 결성총회 9일 전 |
| `소집통지날짜_약식` | 2025. 10. 20 | |
| `등록신청일` | 2025년   10월  27일 | 결성총회 3일 후 |
| `납입기한` | 2025년 10월 24일(금) 오전 10시까지 | |
| `개업일` | 2025.09.19 | |
| `임대차_시작` | 2025.09.19 | |
| `임대차_종료` | 2027.01.19 | |
| `임대차_기간` | 2025.09.19 ~ 2027.01.19 | |
| `임대차_면적` | 111.83㎡ | |
| `사업장주소_정식` | 서울특별시 마포구 양화로7길 70, 5층(서교동) | |
| `사업장주소_약식` | 서울 마포구 양화로7길 70,컬처큐브 5층 | |
| `우편번호` | 04029 | |
| `전화번호` | 02-2038-2456 | |
| `팩스번호` | 02-6953-2456 | |
| `납입계좌은행` | 국민은행 | |
| `납입계좌번호` | 003190-15-050045 | |
| `수탁기관` | 유안타증권 | |
| `수탁보수` | 연간 400만원 | 부가세 별도 |
| `외부감사인` | 태성회계법인 | |
| `감사보수` | 150만원 | 부가세 별도 |
| `존속기간` | 5년 | |
| `문서번호_통지` | 트리거-2025-23호 | 결성총회 통지 공문 번호 |
| `문서번호_등록` | 트리거-2025-28호 | 벤처투자조합 등록 공문 번호 |
| `담당자명` | 홍운학 | |
| `담당자이메일` | hwh@triggerip.com | |
| `담당자연락처` | 010-9473-3142 | |

---

## 5. 프로세스 흐름 (조합 결성 5단계)

```
1. 고유번호증 발급
   └─ 세무서에 조합 존재 등록
   └─ 결과물: 고유번호증 (479-80-03340)

2. 수탁업무
   └─ 수탁기관(유안타증권)에 자산 보관 계약
   └─ 1단계 고유번호증을 첨부서류로 사용

3. 결성총회 전 통지  ← 총회 9일 전 발송
   └─ 공문 + 서류 패키지 발송
   └─ 날인 필요 서류: 별첨3(조합원동의서), 별첨4(개인정보동의서),
                      별첨5(고객거래확인서), 별첨6(서면결의서)

4. 결성총회  ← 서면결의 방식
   └─ 6개 안건 가결 (규약, 투자심의기구, 수탁사, 개인정보동의, 고객거래확인, 외부감사인)
   └─ 결과물: 결성총회 의사록, 출자금납입확인서

5. 벤처투자조합 등록  ← 총회 3일 후
   └─ 중소벤처기업부에 12개 서류 제출
   └─ 공문 번호: 트리거-2025-28호
```

---

## 6. HWP COM API 핵심 사용법

```python
import win32com.client

hwp = win32com.client.Dispatch("HWPFrame.HwpObject")

# 보안 모듈 등록 (파일 경로 접근 허용)
hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")

# 창 숨기기 (백그라운드 처리)
hwp.XHwpWindows.Item(0).Visible = False

# 파일 열기
hwp.Open("C:/경로/파일.hwp", "HWP", "forceopen:true")

# 전체 찾아 바꾸기
act = hwp.CreateAction("AllReplace")
pset = act.CreateSet()
act.GetDefault(pset)
pset.SetItem("FindString", "{{조합명}}")
pset.SetItem("ReplaceString", "트리거 메디테크 4호 조합")
pset.SetItem("ReplaceMode", 1)   # 1 = 모두 바꾸기
act.Execute(pset)

# HWP 형식으로 저장 (서식 유지)
hwp.SaveAs("C:/경로/출력.hwp", "HWP")

# 닫기
hwp.Clear(1)   # 변경사항 폐기
hwp.Quit()
```

---

## 7. 의존성

```
Python 3.10+
pywin32          (HWP COM 자동화)
python-docx      (DOCX 치환)
tkinter          (GUI, Python 표준 포함)
```

설치:
```bash
pip install pywin32 python-docx
```

---

## 8. 실행 순서

```bash
# 1단계: 최초 1회 — 원본에서 템플릿 생성
python setup_templates.py --source "C:\...\[트리거메디테크3호조합]_비식별"

# 2단계: 매번 — GUI 실행 후 값 입력하여 서류 생성
python app.py
```

또는 GUI에서 [템플릿 준비] → [서류 생성] 순서로 실행.

---

## 9. 확장 포인트

- **새 변수 추가**: `variables/` JSON에 키 추가 + `app.py`의 `FIELDS` 리스트에 행 추가
- **새 조합 서식 추가**: `templates/` 폴더에 마커 삽입된 HWP 파일 추가
- **배치 처리**: `generator.generate_documents()` 를 직접 호출하는 CLI 스크립트 작성 가능
- **웹 UI 연동**: `generator.py`는 독립 모듈이므로 FastAPI/Flask 백엔드에서 import 가능
