from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any


DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


class MeetingPacketDocxService:
    def __init__(self) -> None:
        backend_dir = Path(__file__).resolve().parents[1]
        self._workspace_dir = backend_dir / "tools" / "meeting_docx"
        self._renderer_path = self._workspace_dir / "render.mjs"
        self._validator_path = (
            Path.home() / ".codex" / "skills" / "docx" / "scripts" / "office" / "validate.py"
        )

    def render(self, payload: dict[str, Any]) -> bytes:
        if not self._renderer_path.exists():
            raise RuntimeError(f"meeting docx renderer not found: {self._renderer_path}")
        with TemporaryDirectory(prefix="meeting_docx_") as temp_dir:
            temp_path = Path(temp_dir)
            payload_path = temp_path / "payload.json"
            output_path = temp_path / "document.docx"
            payload_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

            command = ["node", str(self._renderer_path), str(payload_path), str(output_path)]
            result = subprocess.run(
                command,
                cwd=str(self._workspace_dir),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            if result.returncode != 0:
                stderr = (result.stderr or result.stdout or "").strip()
                raise RuntimeError(f"meeting docx render failed: {stderr or 'unknown error'}")

            self._validate(output_path)
            return output_path.read_bytes()

    def _validate(self, output_path: Path) -> None:
        if not self._validator_path.exists():
            return
        result = subprocess.run(
            [sys.executable, str(self._validator_path), str(output_path)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env={
                **os.environ,
                "PYTHONUTF8": "1",
                "PYTHONIOENCODING": "utf-8",
            },
        )
        if result.returncode != 0:
            stderr = (result.stderr or result.stdout or "").strip()
            raise RuntimeError(f"generated docx validation failed: {stderr or 'unknown error'}")
