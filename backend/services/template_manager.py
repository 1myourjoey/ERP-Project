from __future__ import annotations

from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
TEMPLATE_BASE_DIR = PROJECT_ROOT / "templates" / "fund_documents"
OUTPUT_BASE_DIR = PROJECT_ROOT / "backend" / "uploads" / "document_generations"

STAGES: dict[int, str] = {
    1: "1. 고유번호증 발급",
    2: "2. 수탁업무",
    3: "3. 결성총회 전 통지",
    4: "4. 결성총회",
    5: "5. 벤처투자조합 등록",
}

MARKERS: list[dict[str, Any]] = [
    {"section": "조합 기본정보", "label": "조합명", "key": "조합명", "required": True, "description": "공식 조합 이름", "default_value": "트리거 메디테크  호 조합"},
    {"section": "조합 기본정보", "label": "조합명 (파일명용, 띄어쓰기 없음)", "key": "조합명_파일명", "required": True, "description": "파일명용 조합명", "default_value": "트리거메디테크호조합"},
    {"section": "조합 기본정보", "label": "조합 호수", "key": "조합_호수", "required": False, "description": "호수 단독 표기", "default_value": "3호"},
    {"section": "조합 기본정보", "label": "업무집행조합원 (정식)", "key": "업무집행조합원_정식", "required": True, "description": "GP 법적 정식 명칭", "default_value": "트리거투자파트너스 유한회사"},
    {"section": "조합 기본정보", "label": "업무집행조합원 (약칭)", "key": "업무집행조합원_약칭", "required": True, "description": "GP 약칭", "default_value": "트리거투자파트너스(유)"},
    {"section": "조합 기본정보", "label": "대표이사", "key": "대표이사", "required": True, "description": "대표이사 이름", "default_value": "서원일"},
    {"section": "조합 기본정보", "label": "대표펀드매니저", "key": "대표펀드매니저", "required": False, "description": "대표 펀드매니저", "default_value": "서원일"},
    {"section": "번호", "label": "사업자등록번호", "key": "사업자등록번호", "required": True, "description": "GP 사업자등록번호", "default_value": "786-88-02871"},
    {"section": "번호", "label": "법인등록번호", "key": "법인등록번호", "required": False, "description": "GP 법인등록번호", "default_value": "164714-0005810"},
    {"section": "번호", "label": "고유번호", "key": "고유번호", "required": True, "description": "세무서 발급 고유번호", "default_value": "479-80-03340"},
    {"section": "규모", "label": "총 출자금 (숫자)", "key": "총출자금_숫자", "required": True, "description": "숫자 표기", "default_value": "2,275,000,000"},
    {"section": "규모", "label": "총 출자금 (한글)", "key": "총출자금_한글", "required": True, "description": "한글 표기", "default_value": "금이십이억칠천오백만원"},
    {"section": "규모", "label": "총 출자금 (원화기호 포함)", "key": "총출자금_기호", "required": True, "description": "원화 기호 포함 표기", "default_value": "₩2,275,000,000"},
    {"section": "규모", "label": "총 출자좌수", "key": "총출자좌수", "required": True, "description": "출자 좌수", "default_value": "2,275"},
    {"section": "규모", "label": "조합원 총수", "key": "조합원총수", "required": True, "description": "업무집행 + 유한책임 합계", "default_value": "19"},
    {"section": "규모", "label": "유한책임조합원 수", "key": "유한책임조합원수", "required": True, "description": "LP 수", "default_value": "18"},
    {"section": "규모", "label": "존속기간", "key": "존속기간", "required": True, "description": "조합 존속 기간", "default_value": "5년"},
    {"section": "일정", "label": "결성총회 일시 (전체)", "key": "결성총회일시_풀", "required": True, "description": "전체 일시 표기", "default_value": "2025년 10월 24일(금요일) 오전 10시"},
    {"section": "일정", "label": "결성총회 날짜", "key": "결성총회일_날짜", "required": True, "description": "결성총회 날짜", "default_value": "2025년 10월 24일"},
    {"section": "일정", "label": "결성총회 요일", "key": "결성총회일_요일", "required": False, "description": "결성총회 요일", "default_value": "금요일"},
    {"section": "일정", "label": "결성총회 날짜 (약식)", "key": "결성총회일_약식", "required": False, "description": "약식 날짜", "default_value": "2025.10.24"},
    {"section": "일정", "label": "소집통지 날짜", "key": "소집통지날짜", "required": True, "description": "결성총회 9일 전", "default_value": "2025년 10월 15일"},
    {"section": "일정", "label": "소집통지 날짜 (약식)", "key": "소집통지날짜_약식", "required": False, "description": "약식 표기", "default_value": "2025. 10. 20"},
    {"section": "일정", "label": "등록신청일", "key": "등록신청일", "required": True, "description": "결성총회 3일 후", "default_value": "2025년   10월  27일"},
    {"section": "일정", "label": "납입기한", "key": "납입기한", "required": True, "description": "출자 납입 기한", "default_value": "2025년 10월 24일(금) 오전 10시까지"},
    {"section": "일정", "label": "개업일", "key": "개업일", "required": True, "description": "개업 날짜", "default_value": "2025.09.19"},
    {"section": "일정", "label": "임대차 시작일", "key": "임대차_시작", "required": False, "description": "임대차 시작일", "default_value": "2025.09.19"},
    {"section": "일정", "label": "임대차 종료일", "key": "임대차_종료", "required": False, "description": "임대차 종료일", "default_value": "2027.01.19"},
    {"section": "일정", "label": "임대차 기간", "key": "임대차_기간", "required": False, "description": "시작~종료", "default_value": "2025.09.19 ~ 2027.01.19"},
    {"section": "장소·계좌", "label": "사업장 주소 (정식)", "key": "사업장주소_정식", "required": True, "description": "정식 주소", "default_value": "서울특별시 마포구 양화로7길 70, 5층(서교동)"},
    {"section": "장소·계좌", "label": "사업장 주소 (약식)", "key": "사업장주소_약식", "required": False, "description": "약식 주소", "default_value": "서울 마포구 양화로7길 70,컬처큐브 5층"},
    {"section": "장소·계좌", "label": "우편번호", "key": "우편번호", "required": False, "description": "우편번호", "default_value": "04029"},
    {"section": "장소·계좌", "label": "전화번호", "key": "전화번호", "required": False, "description": "전화번호", "default_value": "02-2038-2456"},
    {"section": "장소·계좌", "label": "팩스번호", "key": "팩스번호", "required": False, "description": "팩스번호", "default_value": "02-6953-2456"},
    {"section": "장소·계좌", "label": "납입계좌 은행", "key": "납입계좌은행", "required": True, "description": "납입 은행명", "default_value": "국민은행"},
    {"section": "장소·계좌", "label": "납입계좌 번호", "key": "납입계좌번호", "required": True, "description": "납입 계좌번호", "default_value": "003190-15-050045"},
    {"section": "장소·계좌", "label": "임대차 면적", "key": "임대차_면적", "required": False, "description": "임대 면적", "default_value": "111.83㎡"},
    {"section": "기관·보수", "label": "수탁기관", "key": "수탁기관", "required": True, "description": "수탁 기관명", "default_value": "유안타증권"},
    {"section": "기관·보수", "label": "수탁보수", "key": "수탁보수", "required": True, "description": "수탁 보수", "default_value": "연간 400만원"},
    {"section": "기관·보수", "label": "외부감사인", "key": "외부감사인", "required": True, "description": "감사 법인", "default_value": "태성회계법인"},
    {"section": "기관·보수", "label": "감사보수", "key": "감사보수", "required": True, "description": "감사 보수", "default_value": "150만원"},
    {"section": "문서번호·담당자", "label": "문서번호 (결성총회 통지)", "key": "문서번호_통지", "required": False, "description": "결성총회 통지 공문 번호", "default_value": "트리거-2025-23호"},
    {"section": "문서번호·담당자", "label": "문서번호 (벤처투자조합 등록)", "key": "문서번호_등록", "required": False, "description": "벤처투자조합 등록 공문 번호", "default_value": "트리거-2025-28호"},
    {"section": "문서번호·담당자", "label": "담당자명", "key": "담당자명", "required": False, "description": "담당자 이름", "default_value": "홍운학"},
    {"section": "문서번호·담당자", "label": "담당자 이메일", "key": "담당자이메일", "required": False, "description": "담당자 이메일", "default_value": "hwh@triggerip.com"},
    {"section": "문서번호·담당자", "label": "담당자 연락처", "key": "담당자연락처", "required": False, "description": "담당자 연락처", "default_value": "010-9473-3142"},
]


def resolve_template_base_dir() -> Path:
    TEMPLATE_BASE_DIR.mkdir(parents=True, exist_ok=True)
    return TEMPLATE_BASE_DIR


def resolve_output_base_dir() -> Path:
    OUTPUT_BASE_DIR.mkdir(parents=True, exist_ok=True)
    return OUTPUT_BASE_DIR


def resolve_generation_output_dir(generation_id: int) -> Path:
    path = resolve_output_base_dir() / str(generation_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_marker_infos() -> list[dict[str, Any]]:
    return [dict(row) for row in MARKERS]


def get_marker_keys() -> list[str]:
    return [row["key"] for row in MARKERS]


def build_default_variables() -> dict[str, str]:
    return {row["key"]: str(row.get("default_value", "") or "") for row in MARKERS}


def normalize_stage(stage: int) -> int:
    if stage not in STAGES:
        raise ValueError("stage must be between 1 and 5")
    return stage


def _detect_stage_from_name(name: str) -> int | None:
    stripped = name.strip()
    for stage in STAGES:
        if stripped.startswith(f"{stage}."):
            return stage
    return None


def _file_type_from_suffix(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".hwp":
        return "hwp"
    if suffix == ".docx":
        return "docx"
    if suffix == ".pdf":
        return "pdf"
    return "other"


def _iter_selected_files(stage: int | None = None) -> list[tuple[int, Path]]:
    base_dir = resolve_template_base_dir()
    selected_stage = normalize_stage(stage) if stage is not None else None

    items: list[tuple[int, Path]] = []
    if not base_dir.exists():
        return items

    for child in sorted(base_dir.iterdir(), key=lambda row: row.name):
        if not child.is_dir():
            continue
        detected_stage = _detect_stage_from_name(child.name)
        if detected_stage is None:
            continue
        if selected_stage is not None and detected_stage != selected_stage:
            continue
        for file_path in sorted(child.rglob("*"), key=lambda row: str(row.relative_to(base_dir))):
            if file_path.is_file():
                items.append((detected_stage, file_path))
    return items


def get_template_files(stage: int | None = None) -> list[dict[str, Any]]:
    base_dir = resolve_template_base_dir()
    files: list[dict[str, Any]] = []
    for detected_stage, path in _iter_selected_files(stage=stage):
        files.append(
            {
                "stage": detected_stage,
                "stage_name": STAGES[detected_stage],
                "file_name": path.name,
                "file_type": _file_type_from_suffix(path),
                "relative_path": str(path.relative_to(base_dir)).replace("\\", "/"),
            }
        )
    return files


def get_template_structure() -> dict[str, Any]:
    stages: list[dict[str, Any]] = []
    total_templates = 0

    for stage, stage_name in STAGES.items():
        files = get_template_files(stage=stage)
        total_templates += len(files)
        stages.append(
            {
                "stage": stage,
                "stage_name": stage_name,
                "files": files,
            }
        )

    return {
        "stages": stages,
        "total_templates": total_templates,
        "markers": get_marker_keys(),
    }
