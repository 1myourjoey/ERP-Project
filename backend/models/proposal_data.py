from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from database import Base


class GPEntityHistory(Base):
    __tablename__ = "gp_entity_histories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    gp_entity_id = Column(Integer, ForeignKey("gp_entities.id"), nullable=False, index=True)
    valid_from = Column(Date, nullable=False)
    valid_to = Column(Date, nullable=True)
    snapshot_json = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class FundHistory(Base):
    __tablename__ = "fund_histories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False, index=True)
    valid_from = Column(Date, nullable=False)
    valid_to = Column(Date, nullable=True)
    snapshot_json = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class PortfolioCompanyHistory(Base):
    __tablename__ = "portfolio_company_histories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("portfolio_companies.id"), nullable=False, index=True)
    valid_from = Column(Date, nullable=False)
    valid_to = Column(Date, nullable=True)
    snapshot_json = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class GPFinancial(Base):
    __tablename__ = "gp_financials"

    id = Column(Integer, primary_key=True, autoincrement=True)
    gp_entity_id = Column(Integer, ForeignKey("gp_entities.id"), nullable=False, index=True)
    fiscal_year_end = Column(Date, nullable=False, index=True)
    total_assets = Column(Float, nullable=True)
    current_assets = Column(Float, nullable=True)
    total_liabilities = Column(Float, nullable=True)
    current_liabilities = Column(Float, nullable=True)
    total_equity = Column(Float, nullable=True)
    paid_in_capital = Column(Float, nullable=True)
    revenue = Column(Float, nullable=True)
    operating_income = Column(Float, nullable=True)
    net_income = Column(Float, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class GPShareholder(Base):
    __tablename__ = "gp_shareholders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    gp_entity_id = Column(Integer, ForeignKey("gp_entities.id"), nullable=False, index=True)
    snapshot_date = Column(Date, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    shares = Column(Integer, nullable=True)
    acquisition_amount = Column(Float, nullable=True)
    ownership_pct = Column(Float, nullable=True)
    is_largest = Column(Boolean, nullable=False, default=False)
    relationship = Column(String(100), nullable=True)
    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class FundManager(Base):
    __tablename__ = "fund_managers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    gp_entity_id = Column(Integer, ForeignKey("gp_entities.id"), nullable=True, index=True)
    name = Column(String(50), nullable=False)
    birth_date = Column(Date, nullable=True)
    nationality = Column(String(30), nullable=True, default="대한민국")
    phone = Column(String(20), nullable=True)
    fax = Column(String(20), nullable=True)
    email = Column(String(100), nullable=True)
    department = Column(String(50), nullable=True)
    position = Column(String(50), nullable=True)
    join_date = Column(Date, nullable=True)
    resign_date = Column(Date, nullable=True)
    is_core = Column(Boolean, nullable=False, default=False)
    is_representative = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class FundManagerProfileHistory(Base):
    __tablename__ = "fund_manager_profile_histories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_manager_id = Column(Integer, ForeignKey("fund_managers.id"), nullable=False, index=True)
    valid_from = Column(Date, nullable=False)
    valid_to = Column(Date, nullable=True)
    snapshot_json = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class ManagerCareer(Base):
    __tablename__ = "manager_careers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_manager_id = Column(Integer, ForeignKey("fund_managers.id"), nullable=False, index=True)
    company_name = Column(String(100), nullable=False)
    company_type = Column(String(50), nullable=True)
    department = Column(String(50), nullable=True)
    position = Column(String(50), nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    main_task = Column(String(200), nullable=True)
    is_investment_exp = Column(Boolean, nullable=False, default=False)
    employment_type = Column(String(20), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ManagerEducation(Base):
    __tablename__ = "manager_educations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_manager_id = Column(Integer, ForeignKey("fund_managers.id"), nullable=False, index=True)
    school_name = Column(String(100), nullable=False)
    major = Column(String(100), nullable=True)
    degree = Column(String(20), nullable=True)
    admission_date = Column(Date, nullable=True)
    graduation_date = Column(Date, nullable=True)
    country = Column(String(30), nullable=True, default="한국")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ManagerInvestment(Base):
    __tablename__ = "manager_investments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_manager_id = Column(Integer, ForeignKey("fund_managers.id"), nullable=False, index=True)
    investment_id = Column(Integer, ForeignKey("investments.id"), nullable=True, index=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=True, index=True)
    source_company_name = Column(String(100), nullable=True)
    fund_name = Column(String(200), nullable=True)
    company_name = Column(String(200), nullable=True)
    investment_date = Column(Date, nullable=True)
    instrument = Column(String(50), nullable=True)
    amount = Column(Float, nullable=True)
    exit_date = Column(Date, nullable=True)
    exit_amount = Column(Float, nullable=True)
    role = Column(String(30), nullable=True)
    discovery_contrib = Column(Float, nullable=True)
    review_contrib = Column(Float, nullable=True)
    contrib_rate = Column(Float, nullable=True)
    is_current_company = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class FundManagerHistory(Base):
    __tablename__ = "fund_manager_histories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False, index=True)
    fund_manager_id = Column(Integer, ForeignKey("fund_managers.id"), nullable=False, index=True)
    change_date = Column(Date, nullable=False)
    change_type = Column(String(20), nullable=False)
    role_before = Column(String(30), nullable=True)
    role_after = Column(String(30), nullable=True)
    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class FundSubscription(Base):
    __tablename__ = "fund_subscriptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False, index=True)
    subscription_type = Column(String(30), nullable=False, index=True)
    subscription_date = Column(Date, nullable=False, index=True)
    result = Column(String(20), nullable=True)
    target_irr = Column(Float, nullable=True)
    target_commitment = Column(Float, nullable=True)
    actual_commitment = Column(Float, nullable=True)
    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ManagerAward(Base):
    __tablename__ = "manager_awards"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_manager_id = Column(Integer, ForeignKey("fund_managers.id"), nullable=False, index=True)
    award_date = Column(Date, nullable=True)
    award_name = Column(String(200), nullable=False)
    organization = Column(String(100), nullable=True)
    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProposalVersion(Base):
    __tablename__ = "proposal_versions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    template_type = Column(String(30), nullable=False, index=True)
    gp_entity_id = Column(Integer, ForeignKey("gp_entities.id"), nullable=True, index=True)
    fund_ids_json = Column(Text, nullable=False, default="[]")
    as_of_date = Column(Date, nullable=False, index=True)
    status = Column(String(20), nullable=False, default="draft")
    render_snapshot_json = Column(Text, nullable=True)
    generated_filename = Column(String(255), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProposalApplication(Base):
    __tablename__ = "proposal_applications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    template_type = Column(String(30), nullable=False, index=True)
    institution_type = Column(String(30), nullable=True)
    gp_entity_id = Column(Integer, ForeignKey("gp_entities.id"), nullable=True, index=True)
    as_of_date = Column(Date, nullable=False, index=True)
    status = Column(String(20), nullable=False, default="draft")
    submitted_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProposalApplicationFund(Base):
    __tablename__ = "proposal_application_funds"
    __table_args__ = (
        UniqueConstraint("application_id", "fund_id", name="uq_proposal_application_funds"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    application_id = Column(Integer, ForeignKey("proposal_applications.id"), nullable=False, index=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False, index=True)
    display_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class ProposalFieldOverride(Base):
    __tablename__ = "proposal_field_overrides"
    __table_args__ = (
        UniqueConstraint("application_id", "sheet_code", "field_key", name="uq_proposal_field_overrides"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    application_id = Column(Integer, ForeignKey("proposal_applications.id"), nullable=False, index=True)
    sheet_code = Column(String(80), nullable=False, index=True)
    field_key = Column(String(120), nullable=False)
    value_json = Column(Text, nullable=False)
    source_note = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProposalRowOverride(Base):
    __tablename__ = "proposal_row_overrides"
    __table_args__ = (
        UniqueConstraint("application_id", "sheet_code", "row_key", name="uq_proposal_row_overrides"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    application_id = Column(Integer, ForeignKey("proposal_applications.id"), nullable=False, index=True)
    sheet_code = Column(String(80), nullable=False, index=True)
    row_key = Column(String(120), nullable=False)
    row_mode = Column(String(20), nullable=False, default="override")
    row_payload_json = Column(Text, nullable=False)
    source_note = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProposalSnapshot(Base):
    __tablename__ = "proposal_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    application_id = Column(Integer, ForeignKey("proposal_applications.id"), nullable=False, index=True)
    snapshot_type = Column(String(30), nullable=False, default="resolved")
    payload_json = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
