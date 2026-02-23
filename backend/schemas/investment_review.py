from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class ReviewCommentCreate(BaseModel):
    author: str
    content: str
    comment_type: Optional[str] = "opinion"


class ReviewCommentResponse(BaseModel):
    id: int
    review_id: int
    author: str
    content: str
    comment_type: str
    created_at: datetime

    model_config = {"from_attributes": True}


class InvestmentReviewCreate(BaseModel):
    company_name: str
    sector: Optional[str] = None
    stage: Optional[str] = None
    deal_source: Optional[str] = None
    reviewer: Optional[str] = None
    status: Optional[str] = "소싱"
    target_amount: Optional[float] = None
    pre_valuation: Optional[float] = None
    post_valuation: Optional[float] = None
    instrument: Optional[str] = None
    fund_id: Optional[int] = None
    review_start_date: Optional[date] = None
    dd_start_date: Optional[date] = None
    committee_date: Optional[date] = None
    decision_date: Optional[date] = None
    execution_date: Optional[date] = None
    review_opinion: Optional[str] = None
    committee_opinion: Optional[str] = None
    decision_result: Optional[str] = None
    rejection_reason: Optional[str] = None
    investment_id: Optional[int] = None


class InvestmentReviewUpdate(BaseModel):
    company_name: Optional[str] = None
    sector: Optional[str] = None
    stage: Optional[str] = None
    deal_source: Optional[str] = None
    reviewer: Optional[str] = None
    status: Optional[str] = None
    target_amount: Optional[float] = None
    pre_valuation: Optional[float] = None
    post_valuation: Optional[float] = None
    instrument: Optional[str] = None
    fund_id: Optional[int] = None
    review_start_date: Optional[date] = None
    dd_start_date: Optional[date] = None
    committee_date: Optional[date] = None
    decision_date: Optional[date] = None
    execution_date: Optional[date] = None
    review_opinion: Optional[str] = None
    committee_opinion: Optional[str] = None
    decision_result: Optional[str] = None
    rejection_reason: Optional[str] = None
    investment_id: Optional[int] = None


class InvestmentReviewStatusUpdate(BaseModel):
    status: str


class InvestmentReviewResponse(BaseModel):
    id: int
    company_name: str
    sector: Optional[str] = None
    stage: Optional[str] = None
    deal_source: Optional[str] = None
    reviewer: Optional[str] = None
    status: str
    target_amount: Optional[float] = None
    pre_valuation: Optional[float] = None
    post_valuation: Optional[float] = None
    instrument: Optional[str] = None
    fund_id: Optional[int] = None
    review_start_date: Optional[date] = None
    dd_start_date: Optional[date] = None
    committee_date: Optional[date] = None
    decision_date: Optional[date] = None
    execution_date: Optional[date] = None
    review_opinion: Optional[str] = None
    committee_opinion: Optional[str] = None
    decision_result: Optional[str] = None
    rejection_reason: Optional[str] = None
    investment_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InvestmentReviewDetail(InvestmentReviewResponse):
    comments: list[ReviewCommentResponse] = []


class InvestmentReviewListItem(InvestmentReviewResponse):
    recent_activity_at: Optional[datetime] = None
    comment_count: int = 0


class InvestmentReviewConvertResponse(BaseModel):
    review_id: int
    investment_id: int
    company_id: int
    status: str


class WeeklyActivityItem(BaseModel):
    review_id: int
    company_name: str
    status: str
    updated_at: datetime
    comment_count: int = 0


class InvestmentReviewWeeklySummary(BaseModel):
    status_counts: dict[str, int]
    new_count: int
    status_changed_count: int
    comments_added_count: int
    recent_activities: list[WeeklyActivityItem]
