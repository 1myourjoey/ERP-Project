from __future__ import annotations

import json
import os
import re
from typing import Any

from services.variable_resolver import VariableResolver

try:
    from openai import AsyncOpenAI
except Exception:  # pragma: no cover - optional at runtime
    AsyncOpenAI = None  # type: ignore


class LLMMarkerIdentifier:
    """Identify variable candidates from extracted template text using GPT-4o."""

    SYSTEM_PROMPT = """당신은 VC 문서 템플릿 변수 식별 전문가입니다.
아래 문서 텍스트에서 변수화가 필요한 텍스트를 찾아 JSON으로 반환하세요.

출력 형식:
{
  "markers": [
    {
      "text": "원문의 대상 텍스트",
      "marker": "추천_마커명",
      "source": "fund|lp|gp|investment|manual",
      "confidence": 0.0
    }
  ]
}

규칙:
1) 고유명사(조합명/회사명/대표자), 날짜, 금액, 주소, 연락처, 문서번호를 우선 식별
2) marker는 가능하면 아래 사용 가능 목록에서 선택
3) confidence는 0~1 실수

사용 가능 마커 목록:
{available_markers}
"""

    def __init__(self) -> None:
        self.resolver = VariableResolver()
        self.client = AsyncOpenAI() if AsyncOpenAI is not None else None

    async def identify_markers(self, extracted_text: str) -> list[dict[str, Any]]:
        text = (extracted_text or "").strip()
        if not text:
            return []

        available = self.resolver.get_available_markers()
        available_markers = ", ".join(row["marker"] for row in available)

        if not self.client or not os.getenv("OPENAI_API_KEY"):
            return self._heuristic_identify(text, available)

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": self.SYSTEM_PROMPT.format(available_markers=available_markers),
                    },
                    {
                        "role": "user",
                        "content": (
                            "다음 템플릿 텍스트에서 변수 후보를 추출해 주세요.\n\n"
                            f"{text[:8000]}"
                        ),
                    },
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
            )
            payload = response.choices[0].message.content or "{}"
            decoded = json.loads(payload)
            rows = decoded.get("markers", []) if isinstance(decoded, dict) else decoded
            if not isinstance(rows, list):
                return []
            return [self._normalize_marker_row(row) for row in rows if isinstance(row, dict)]
        except Exception:
            return self._heuristic_identify(text, available)

    def _heuristic_identify(
        self,
        text: str,
        available: list[dict[str, str]],
    ) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []

        def add(value: str, marker: str, source: str, confidence: float) -> None:
            if not value.strip():
                return
            if any(item["text"] == value and item["marker"] == marker for item in rows):
                return
            rows.append(
                {
                    "text": value.strip(),
                    "marker": marker,
                    "source": source,
                    "confidence": confidence,
                }
            )

        # dates
        for matched in re.findall(r"\b\d{4}[./-]\d{1,2}[./-]\d{1,2}\b", text):
            add(matched, "오늘날짜_숫자", "manual", 0.6)

        # currency
        for matched in re.findall(r"\b\d{1,3}(?:,\d{3})+(?:원)?\b", text):
            add(matched, "조합_약정총액", "fund", 0.55)

        # already-marked braces should not be proposed as new text replacements
        existing_markers = set(re.findall(r"\{\{([^{}]+)\}\}", text))
        for marker in existing_markers:
            add(f"{{{{{marker}}}}}", marker, "manual", 0.99)

        if not rows:
            # Provide default scaffold using available marker definitions
            for row in available[:6]:
                rows.append(
                    {
                        "text": "",
                        "marker": row["marker"],
                        "source": row["source"].lower(),
                        "confidence": 0.3,
                    }
                )

        return rows

    @staticmethod
    def _normalize_marker_row(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "text": str(row.get("text", "")).strip(),
            "marker": str(row.get("marker", "")).strip(),
            "source": str(row.get("source", "manual")).strip().lower() or "manual",
            "confidence": float(row.get("confidence", 0.5) or 0.5),
        }
