from __future__ import annotations

import os
from typing import Any

from sqlalchemy.orm import Session

from models.llm_usage import LLMUsage

try:
    from openai import OpenAI
except Exception:  # pragma: no cover - optional dependency at runtime
    OpenAI = None  # type: ignore[assignment]


class MeetingPacketNarrativeService:
    def __init__(self) -> None:
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        self._model = os.getenv("OPENAI_MEETING_PACKET_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
        self._client = OpenAI(api_key=api_key) if api_key and OpenAI is not None else None

    def polish(
        self,
        *,
        db: Session,
        kind: str,
        fallback_text: str,
        context: dict[str, Any] | None = None,
        user_id: int | None = None,
    ) -> str:
        cleaned = (fallback_text or "").strip()
        if not cleaned or self._client is None:
            return cleaned

        context_lines = []
        for key, value in (context or {}).items():
            if value in (None, "", [], {}):
                continue
            context_lines.append(f"{key}: {value}")

        prompt = (
            "다음은 VC 조합 총회 패키지용 문안 초안이다.\n"
            "목표: 문장을 자연스럽고 공식적인 한국어로 다듬는다.\n"
            "제약:\n"
            "- 숫자, 날짜, 조합명, 인명, 근거 조항, 사실 관계를 바꾸지 않는다.\n"
            "- 새로운 사실이나 해석을 추가하지 않는다.\n"
            "- 지나치게 장황하게 쓰지 않는다.\n"
            "- 결과는 다듬어진 본문만 출력한다.\n\n"
            f"문서종류: {kind}\n"
            f"참고맥락:\n{chr(10).join(context_lines) if context_lines else '-'}\n\n"
            f"초안:\n{cleaned}"
        )
        try:
            response = self._client.responses.create(  # type: ignore[union-attr]
                model=self._model,
                input=prompt,
                temperature=0.2,
            )
        except Exception:
            return cleaned

        text = getattr(response, "output_text", None) or cleaned
        usage = getattr(response, "usage", None)
        if usage is not None:
            prompt_tokens = int(getattr(usage, "input_tokens", 0) or 0)
            completion_tokens = int(getattr(usage, "output_tokens", 0) or 0)
            total_tokens = int(getattr(usage, "total_tokens", prompt_tokens + completion_tokens) or 0)
            db.add(
                LLMUsage(
                    service="meeting_packet",
                    model=self._model,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=total_tokens,
                    estimated_cost_usd=0.0,
                    request_summary=f"{kind} polish",
                    user_id=user_id,
                )
            )
            db.flush()
        return str(text).strip() or cleaned
