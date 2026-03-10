"""Application settings loaded from environment variables."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Centralized environment settings."""

    _backend_dir = Path(__file__).resolve().parent

    @property
    def DATABASE_URL(self) -> str:
        return os.getenv("DATABASE_URL", f"sqlite:///{self._backend_dir / 'erp.db'}")

    @property
    def CORS_ORIGINS(self) -> list[str]:
        return [
            origin.strip()
            for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
            if origin.strip()
        ]

    @property
    def AUTH_DISABLED(self) -> bool:
        return os.getenv("VON_AUTH_DISABLED", "").strip().lower() in {
            "1",
            "true",
            "yes",
            "y",
            "on",
        }

    @property
    def AUTO_CREATE_TABLES(self) -> bool:
        return os.getenv("AUTO_CREATE_TABLES", "true").strip().lower() == "true"

    @property
    def AUTO_RUN_MIGRATIONS(self) -> bool:
        return os.getenv("AUTO_RUN_MIGRATIONS", "true").strip().lower() == "true"

    @property
    def LLM_MONTHLY_LIMIT(self) -> int:
        return int(os.getenv("LLM_MONTHLY_LIMIT", "500000"))

    @property
    def EXTRA_HOLIDAYS(self) -> list[str]:
        return [
            token.strip()
            for token in os.getenv("ERP_EXTRA_HOLIDAYS", "").split(",")
            if token.strip()
        ]

    @property
    def ERP_BACKBONE_WRITE_THROUGH(self) -> bool:
        return os.getenv("ERP_BACKBONE_WRITE_THROUGH", "true").strip().lower() == "true"

    @property
    def ERP_BACKBONE_READS(self) -> bool:
        return os.getenv("ERP_BACKBONE_READS", "false").strip().lower() == "true"

    @property
    def ERP_BACKBONE_OUTBOX_ENABLED(self) -> bool:
        return os.getenv("ERP_BACKBONE_OUTBOX_ENABLED", "true").strip().lower() == "true"


settings = Settings()
