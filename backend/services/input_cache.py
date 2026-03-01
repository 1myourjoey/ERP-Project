from __future__ import annotations

import json
import threading
from datetime import datetime
from pathlib import Path
from typing import Any


class InputCacheService:
    """Caches manual template inputs by fund/template/marker."""

    _LOCK = threading.Lock()

    def __init__(self) -> None:
        base_dir = Path(__file__).resolve().parents[1] / "uploads"
        base_dir.mkdir(parents=True, exist_ok=True)
        self.cache_path = base_dir / "template_input_cache.json"

    def save_inputs(
        self,
        db,  # kept for interface consistency
        fund_id: int,
        template_id: int,
        manual_vars: dict[str, str],
    ) -> None:
        if not manual_vars:
            return
        now = datetime.utcnow().isoformat()
        payload = self._load()
        key = self._base_key(fund_id=fund_id, template_id=template_id)
        if key not in payload or not isinstance(payload[key], dict):
            payload[key] = {}

        for marker_name, value in manual_vars.items():
            payload[key][str(marker_name)] = {
                "value": str(value),
                "updated_at": now,
            }
        self._save(payload)

    def get_last_inputs(self, db, fund_id: int, template_id: int) -> dict[str, str]:
        payload = self._load()
        key = self._base_key(fund_id=fund_id, template_id=template_id)
        row = payload.get(key, {})
        if not isinstance(row, dict):
            return {}
        result: dict[str, str] = {}
        for marker_name, value_obj in row.items():
            if isinstance(value_obj, dict):
                result[str(marker_name)] = str(value_obj.get("value", ""))
            else:
                result[str(marker_name)] = str(value_obj)
        return result

    @staticmethod
    def _base_key(fund_id: int, template_id: int) -> str:
        return f"fund:{fund_id}:template:{template_id}"

    def _load(self) -> dict[str, Any]:
        with self._LOCK:
            if not self.cache_path.exists():
                return {}
            try:
                raw = self.cache_path.read_text(encoding="utf-8")
                loaded = json.loads(raw or "{}")
            except Exception:
                return {}
            return loaded if isinstance(loaded, dict) else {}

    def _save(self, payload: dict[str, Any]) -> None:
        with self._LOCK:
            self.cache_path.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
