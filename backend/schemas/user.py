from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    name: str
    password: str
    role: str = "viewer"
    department: Optional[str] = None
    is_active: bool = True
    allowed_routes: Optional[list[str]] = None
    google_id: Optional[str] = None


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None
    allowed_routes: Optional[list[str]] = None
    google_id: Optional[str] = None


class UserApproveRequest(BaseModel):
    role: Optional[str] = None
    allowed_routes: Optional[list[str]] = None


class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    name: str
    role: str
    department: Optional[str] = None
    is_active: bool
    is_pending_approval: bool = False
    avatar_url: Optional[str] = None
    google_id: Optional[str] = None
    allowed_routes: Optional[list[str]] = None
    last_login_at: Optional[datetime] = None
    password_reset_requested_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    login_id: str
    password: str


class GoogleLoginRequest(BaseModel):
    credential: str


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=4, max_length=20)
    name: str
    email: Optional[str] = None
    password: str
    department: Optional[str] = None


class RegisterResponseUser(BaseModel):
    id: int
    username: str
    name: str
    is_active: bool


class RegisterResponse(BaseModel):
    message: str
    user: RegisterResponseUser


class AvailabilityResponse(BaseModel):
    available: bool
    message: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    login_id: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class AdminResetPasswordRequest(BaseModel):
    new_password: str


class ResetPasswordTokenResponse(BaseModel):
    reset_token: str
    reset_url: str
    expires_in_minutes: int


class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    avatar_url: Optional[str] = None


class RegisterWithInviteRequest(BaseModel):
    token: str
    username: str = Field(..., min_length=4, max_length=20)
    password: str
    name: Optional[str] = None


class InvitationCreateRequest(BaseModel):
    email: Optional[str] = None
    name: Optional[str] = None
    role: str = "viewer"
    department: Optional[str] = None
    allowed_routes: Optional[list[str]] = None
    expires_in_days: int = 7


class InvitationResponse(BaseModel):
    id: int
    token: str
    email: Optional[str] = None
    name: Optional[str] = None
    role: str
    department: Optional[str] = None
    allowed_routes: Optional[list[str]] = None
    created_by: int
    used_by: Optional[int] = None
    used_at: Optional[datetime] = None
    expires_at: datetime
    created_at: datetime
    status: str
    invite_url: str


class InvitationVerifyResponse(BaseModel):
    valid: bool
    message: Optional[str] = None
    invitation: Optional[InvitationResponse] = None
