from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint

from database import Base


class DocumentNumberSeq(Base):
    """Sequence table for per-fund/per-type/per-year document numbering."""

    __tablename__ = "document_number_seqs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey("funds.id"), nullable=False)
    document_type = Column(String, nullable=False)
    year = Column(Integer, nullable=False)
    last_number = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("fund_id", "document_type", "year", name="uq_doc_num_seq"),
    )

