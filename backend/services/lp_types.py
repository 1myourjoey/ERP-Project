from __future__ import annotations

import re

LP_TYPE_INSTITUTIONAL = "유한책임조합원(기관투자자)"
LP_TYPE_INDIVIDUAL = "유한책임조합원(개인투자자)"
LP_TYPE_GP = "업무집행조합원(GP)"
LP_TYPE_SPECIAL_MOTAE = "특별조합원(모태)"
LP_TYPE_SPECIAL_NONG_MOTAE = "특별조합원(농모태)"
LP_TYPE_SPECIAL_GROWTH = "특별조합원(성장금융)"
LP_TYPE_SPECIAL_OTHER_POLICY = "특별조합원(기타정책자금)"

LP_TYPE_OPTIONS = (
    LP_TYPE_INSTITUTIONAL,
    LP_TYPE_INDIVIDUAL,
    LP_TYPE_GP,
    LP_TYPE_SPECIAL_MOTAE,
    LP_TYPE_SPECIAL_NONG_MOTAE,
    LP_TYPE_SPECIAL_GROWTH,
    LP_TYPE_SPECIAL_OTHER_POLICY,
)

LP_TYPE_GROUP_LIMITED = "유한책임조합원"
LP_TYPE_GROUP_GP = "업무집행조합원"
LP_TYPE_GROUP_SPECIAL = "특별조합원"

MIGRATION_LP_TYPE_OPTIONS = (
    LP_TYPE_INSTITUTIONAL,
    LP_TYPE_INDIVIDUAL,
    LP_TYPE_SPECIAL_MOTAE,
    LP_TYPE_SPECIAL_NONG_MOTAE,
    LP_TYPE_SPECIAL_GROWTH,
    LP_TYPE_SPECIAL_OTHER_POLICY,
)

_KEY_PATTERN = re.compile(r"[\s\-_()/]+")


def _normalize_key(value: str | None) -> str:
    text = (value or "").strip()
    if not text:
        return ""
    return _KEY_PATTERN.sub("", text).casefold()


def _build_alias_map() -> dict[str, str]:
    aliases: dict[str, str] = {}

    def register(canonical: str, *values: str) -> None:
        for value in (canonical, *values):
            key = _normalize_key(value)
            if key:
                aliases[key] = canonical

    register(
        LP_TYPE_INSTITUTIONAL,
        "institutional",
        "기관투자자",
        "기관",
        "법인",
        "corporate",
        "limitedpartnerinstitutional",
    )
    register(
        LP_TYPE_INDIVIDUAL,
        "individual",
        "개인투자자",
        "개인",
        "limitedpartnerindividual",
    )
    register(
        LP_TYPE_GP,
        "gp",
        "업무집행조합원",
        "공동업무집행",
        "공동gp",
        "cogp",
        "co-gp",
        "generalpartner",
    )
    register(
        LP_TYPE_SPECIAL_MOTAE,
        "모태",
        "motae",
        "motaefund",
    )
    register(
        LP_TYPE_SPECIAL_NONG_MOTAE,
        "농모태",
        "nongmotae",
        "nong-motae",
        "nongmotaefund",
    )
    register(
        LP_TYPE_SPECIAL_GROWTH,
        "성장금융",
        "growthfinance",
        "growth-finance",
    )
    register(
        LP_TYPE_SPECIAL_OTHER_POLICY,
        "특별조합원",
        "정책출자자",
        "정책자금",
        "기타정책자금",
        "정책",
        "정부기관",
        "government",
        "policy",
        "policymoney",
        "specialpartner",
    )
    return aliases


_LP_TYPE_ALIAS_MAP = _build_alias_map()
_LP_TYPE_OPTION_SET = set(LP_TYPE_OPTIONS)
_MIGRATION_LP_TYPE_SET = set(MIGRATION_LP_TYPE_OPTIONS)
_SPECIAL_LP_TYPE_SET = {
    LP_TYPE_SPECIAL_MOTAE,
    LP_TYPE_SPECIAL_NONG_MOTAE,
    LP_TYPE_SPECIAL_GROWTH,
    LP_TYPE_SPECIAL_OTHER_POLICY,
}


def normalize_lp_type(value: str | None) -> str | None:
    text = (value or "").strip()
    if not text:
        return None
    return _LP_TYPE_ALIAS_MAP.get(_normalize_key(text), text)


def coerce_lp_type(value: str | None) -> str:
    normalized = normalize_lp_type(value)
    if not normalized:
        raise ValueError("type must not be empty")
    if normalized not in _LP_TYPE_OPTION_SET:
        raise ValueError("unsupported LP type")
    return normalized


def normalize_lp_type_group(value: str | None) -> str | None:
    normalized = normalize_lp_type(value)
    if normalized in {LP_TYPE_INSTITUTIONAL, LP_TYPE_INDIVIDUAL}:
        return LP_TYPE_GROUP_LIMITED
    if normalized == LP_TYPE_GP:
        return LP_TYPE_GROUP_GP
    if normalized in _SPECIAL_LP_TYPE_SET:
        return LP_TYPE_GROUP_SPECIAL
    return normalized


def is_gp_lp_type(value: str | None) -> bool:
    return normalize_lp_type(value) == LP_TYPE_GP


def is_special_lp_type(value: str | None) -> bool:
    normalized = normalize_lp_type(value)
    return normalized in _SPECIAL_LP_TYPE_SET


def is_supported_lp_type(value: str | None) -> bool:
    normalized = normalize_lp_type(value)
    return normalized in _LP_TYPE_OPTION_SET


def is_supported_migration_lp_type(value: str | None) -> bool:
    normalized = normalize_lp_type(value)
    return normalized in _MIGRATION_LP_TYPE_SET
