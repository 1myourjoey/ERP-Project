from sqlalchemy import Column, DateTime, Float, Integer, String, func

from database import Base


class LLMUsage(Base):
    """LLM token usage audit log."""

    __tablename__ = "llm_usages"

    id = Column(Integer, primary_key=True, autoincrement=True)

    service = Column(String, nullable=False, index=True)
    model = Column(String, nullable=False)

    prompt_tokens = Column(Integer, nullable=False, default=0)
    completion_tokens = Column(Integer, nullable=False, default=0)
    total_tokens = Column(Integer, nullable=False, default=0, index=True)
    estimated_cost_usd = Column(Float, nullable=False, default=0.0)

    request_summary = Column(String, nullable=True)
    user_id = Column(Integer, nullable=True)

    created_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)
