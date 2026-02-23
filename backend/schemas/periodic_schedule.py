from pydantic import BaseModel, Field


class PeriodicStepConfig(BaseModel):
    name: str
    offset_days: int
    is_notice: bool = False
    is_report: bool = False


class PeriodicScheduleBase(BaseModel):
    name: str
    category: str
    recurrence: str
    base_month: int = Field(ge=1, le=12)
    base_day: int = Field(ge=1, le=31)
    workflow_template_id: int | None = Field(default=None, ge=1)
    fund_type_filter: str | None = None
    is_active: bool = True
    steps: list[PeriodicStepConfig] = Field(default_factory=list)
    description: str | None = None


class PeriodicScheduleCreate(PeriodicScheduleBase):
    pass


class PeriodicScheduleUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    recurrence: str | None = None
    base_month: int | None = Field(default=None, ge=1, le=12)
    base_day: int | None = Field(default=None, ge=1, le=31)
    workflow_template_id: int | None = Field(default=None, ge=1)
    fund_type_filter: str | None = None
    is_active: bool | None = None
    steps: list[PeriodicStepConfig] | None = None
    description: str | None = None


class PeriodicScheduleResponse(PeriodicScheduleBase):
    id: int

    model_config = {"from_attributes": True}


class PeriodicScheduleGenerateResult(BaseModel):
    year: int
    dry_run: bool
    created_instances: int
    skipped_instances: int
    created_tasks: int
    linked_reports: int
    details: list[str] = Field(default_factory=list)
