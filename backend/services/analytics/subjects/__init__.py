from .fund_master import DEFINITION as FUND_MASTER
from .lp_commitment import DEFINITION as LP_COMMITMENT
from .lp_contribution import DEFINITION as LP_CONTRIBUTION
from .investment import DEFINITION as INVESTMENT
from .transaction import DEFINITION as TRANSACTION
from .valuation import DEFINITION as VALUATION
from .management_fee import DEFINITION as MANAGEMENT_FEE
from .bank_transaction import DEFINITION as BANK_TRANSACTION
from .journal_entry import DEFINITION as JOURNAL_ENTRY
from .provisional_fs import DEFINITION as PROVISIONAL_FS
from .capital_call import DEFINITION as CAPITAL_CALL
from .distribution import DEFINITION as DISTRIBUTION
from .exit_trade import DEFINITION as EXIT_TRADE
from .internal_review import DEFINITION as INTERNAL_REVIEW
from .regular_report import DEFINITION as REGULAR_REPORT
from .biz_report_request import DEFINITION as BIZ_REPORT_REQUEST
from .vics_report import DEFINITION as VICS_REPORT
from .task import DEFINITION as TASK
from .workflow_instance import DEFINITION as WORKFLOW_INSTANCE
from .workflow_step import DEFINITION as WORKFLOW_STEP
from .compliance_obligation import DEFINITION as COMPLIANCE_OBLIGATION
from .document_status import DEFINITION as DOCUMENT_STATUS
from .worklog import DEFINITION as WORKLOG

SUBJECT_DEFINITIONS = [
    FUND_MASTER,
    LP_COMMITMENT,
    LP_CONTRIBUTION,
    INVESTMENT,
    TRANSACTION,
    VALUATION,
    MANAGEMENT_FEE,
    BANK_TRANSACTION,
    JOURNAL_ENTRY,
    PROVISIONAL_FS,
    CAPITAL_CALL,
    DISTRIBUTION,
    EXIT_TRADE,
    INTERNAL_REVIEW,
    REGULAR_REPORT,
    BIZ_REPORT_REQUEST,
    VICS_REPORT,
    TASK,
    WORKFLOW_INSTANCE,
    WORKFLOW_STEP,
    COMPLIANCE_OBLIGATION,
    DOCUMENT_STATUS,
    WORKLOG,
]

SUBJECT_MAP = {subject.key: subject for subject in SUBJECT_DEFINITIONS}

