from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class UserCreate(BaseModel):
    email: str
    name: str
    role: str = "viewer"
    department: Optional[str] = None
    is_active: bool = True


class UserUpdate(BaseModel):
    email: Optional[str] = None
    name: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    role: str
    department: Optional[str] = None
    is_active: bool
    last_login_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}
