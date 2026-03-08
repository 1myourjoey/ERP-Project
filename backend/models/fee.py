from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text

from database import Base


class ManagementFee(Base):
    __tablename__ = "management_fees"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    quarter = Column(Integer, nullable=False)
    fee_basis = Column(String, nullable=False, default="commitment")
    fee_rate = Column(Numeric, nullable=False, default=0)
    basis_amount = Column(Numeric, nullable=False, default=0)
    fee_amount = Column(Numeric, nullable=False, default=0)
    proration_method = Column(String, nullable=False, default="equal_quarter")
    period_days = Column(Integer, nullable=True)
    year_days = Column(Integer, nullable=True)
    applied_phase = Column(String, nullable=False, default="investment")
    calculation_detail = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="계산완료")
    invoice_date = Column(Date, nullable=True)
    payment_date = Column(Date, nullable=True)
    memo = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class FeeConfig(Base):
    __tablename__ = "fee_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False, unique=True, index=True)
    mgmt_fee_rate = Column(Numeric, nullable=False, default=0.02)
    mgmt_fee_basis = Column(String, nullable=False, default="commitment")
    mgmt_fee_period = Column(String, nullable=False, default="operating")
    mgmt_fee_proration_method = Column(String, nullable=False, default="equal_quarter")
    liquidation_fee_rate = Column(Numeric, nullable=True)
    liquidation_fee_basis = Column(String, nullable=True)
    hurdle_rate = Column(Numeric, nullable=False, default=0.08)
    carry_rate = Column(Numeric, nullable=False, default=0.20)
    catch_up_rate = Column(Numeric, nullable=True)
    clawback = Column(Boolean, nullable=False, default=True)


class PerformanceFeeSimulation(Base):
    __tablename__ = "performance_fee_simulations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False, index=True)
    simulation_date = Column(Date, nullable=False)
    scenario = Column(String, nullable=False, default="base")
    total_paid_in = Column(Numeric, nullable=True)
    total_distributed = Column(Numeric, nullable=True)
    hurdle_amount = Column(Numeric, nullable=True)
    excess_profit = Column(Numeric, nullable=True)
    carry_amount = Column(Numeric, nullable=True)
    lp_net_return = Column(Numeric, nullable=True)
    status = Column(String, nullable=False, default="시뮬레이션")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
