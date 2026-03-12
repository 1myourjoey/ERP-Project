from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any
from uuid import uuid4
from xml.etree.ElementTree import ParseError
from zipfile import BadZipFile, ZipFile

try:
    from defusedxml.ElementTree import fromstring
except ImportError:  # pragma: no cover - fallback for environments without refreshed deps
    from xml.etree.ElementTree import fromstring

from services.generated_attachment_service import UPLOAD_DIR


DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
REQUIRED_DOCX_PARTS = ("[Content_Types].xml", "_rels/.rels", "word/document.xml")


class MeetingPacketDocxService:
    def __init__(self) -> None:
        backend_dir = Path(__file__).resolve().parents[1]
        self._workspace_dir = backend_dir / "tools" / "meeting_docx"
        self._renderer_path = self._workspace_dir / "render.mjs"
        self._runtime_temp_dir = UPLOAD_DIR / "_runtime" / "meeting_docx"
        self._runtime_temp_dir.mkdir(parents=True, exist_ok=True)

    def render(self, payload: dict[str, Any]) -> bytes:
        if not self._renderer_path.exists():
            raise RuntimeError(f"총회 패키지 Word 렌더러를 찾을 수 없습니다: {self._renderer_path}")
        temp_path = self._runtime_temp_dir / f"meeting_docx_{uuid4().hex}"
        try:
            temp_path.mkdir(parents=True, exist_ok=False)
            payload_path = temp_path / "payload.json"
            output_path = temp_path / "document.docx"
            payload_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

            command = ["node", str(self._renderer_path), str(payload_path), str(output_path)]
            try:
                result = subprocess.run(
                    command,
                    cwd=str(self._workspace_dir),
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                )
            except FileNotFoundError as exc:
                raise RuntimeError("총회 패키지 Word 렌더러 실행에 실패했습니다. Node.js를 찾을 수 없습니다.") from exc
            if result.returncode != 0:
                stderr = (result.stderr or result.stdout or "").strip()
                raise RuntimeError(f"총회 패키지 Word 렌더링에 실패했습니다: {stderr or 'unknown error'}")

            self._validate(output_path)
            return output_path.read_bytes()
        except RuntimeError:
            raise
        except OSError as exc:
            detail = exc.strerror or str(exc)
            raise RuntimeError(f"총회 패키지 Word 임시 파일 처리에 실패했습니다: {detail}") from exc
        finally:
            shutil.rmtree(temp_path, ignore_errors=True)

    def _validate(self, output_path: Path) -> None:
        try:
            with ZipFile(output_path) as archive:
                names = set(archive.namelist())
                missing = [part for part in REQUIRED_DOCX_PARTS if part not in names]
                if missing:
                    raise RuntimeError(
                        f"생성된 Word 파일 검증에 실패했습니다: 필수 파트가 없습니다 ({', '.join(missing)})"
                    )
                for part_name in names:
                    if part_name.endswith("/") or not part_name.endswith(".xml"):
                        continue
                    fromstring(archive.read(part_name))
        except RuntimeError:
            raise
        except BadZipFile as exc:
            raise RuntimeError("생성된 Word 파일이 올바른 DOCX(zip) 형식이 아닙니다.") from exc
        except ParseError as exc:
            raise RuntimeError(f"생성된 Word XML 파싱에 실패했습니다: {exc}") from exc
        except OSError as exc:
            detail = exc.strerror or str(exc)
            raise RuntimeError(f"생성된 Word 파일 검증 중 파일 접근에 실패했습니다: {detail}") from exc
