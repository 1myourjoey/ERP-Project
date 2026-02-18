from typing import Optional

from pydantic import BaseModel


class SearchResultResponse(BaseModel):
    type: str
    id: int
    title: str
    subtitle: Optional[str] = None
    url: str
