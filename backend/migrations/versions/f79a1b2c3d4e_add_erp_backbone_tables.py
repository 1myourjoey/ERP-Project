"""add erp backbone tables

Revision ID: f79a1b2c3d4e
Revises: f78e5f6a7b8c
Create Date: 2026-03-10 12:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "f79a1b2c3d4e"
down_revision = "f78e5f6a7b8c"
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _index_exists(table_name: str, index_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    inspector = sa.inspect(op.get_bind())
    return index_name in {row["name"] for row in inspector.get_indexes(table_name)}


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str]) -> None:
    if not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns)


def _drop_index_if_exists(index_name: str, table_name: str) -> None:
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)


def _drop_table_if_exists(table_name: str) -> None:
    if _table_exists(table_name):
        op.drop_table(table_name)


def upgrade() -> None:
    if not _table_exists("erp_subjects"):
        op.create_table(
            "erp_subjects",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("subject_type", sa.String(length=64), nullable=False),
            sa.Column("native_id", sa.Integer(), nullable=False),
            sa.Column("display_name", sa.String(length=255), nullable=True),
            sa.Column("state_code", sa.String(length=64), nullable=True),
            sa.Column("lifecycle_stage", sa.String(length=32), nullable=False, server_default="active"),
            sa.Column("fund_id", sa.Integer(), nullable=True),
            sa.Column("gp_entity_id", sa.Integer(), nullable=True),
            sa.Column("company_id", sa.Integer(), nullable=True),
            sa.Column("investment_id", sa.Integer(), nullable=True),
            sa.Column("lp_id", sa.Integer(), nullable=True),
            sa.Column("task_id", sa.Integer(), nullable=True),
            sa.Column("workflow_instance_id", sa.Integer(), nullable=True),
            sa.Column("obligation_id", sa.Integer(), nullable=True),
            sa.Column("metadata_json", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("subject_type", "native_id", name="uq_erp_subject_type_native"),
        )
    _create_index_if_missing("ix_erp_subjects_subject_type", "erp_subjects", ["subject_type"])
    _create_index_if_missing("ix_erp_subjects_native_id", "erp_subjects", ["native_id"])
    _create_index_if_missing("ix_erp_subjects_state_code", "erp_subjects", ["state_code"])
    _create_index_if_missing("ix_erp_subjects_lifecycle_stage", "erp_subjects", ["lifecycle_stage"])
    _create_index_if_missing("ix_erp_subjects_fund_id", "erp_subjects", ["fund_id"])
    _create_index_if_missing("ix_erp_subjects_gp_entity_id", "erp_subjects", ["gp_entity_id"])
    _create_index_if_missing("ix_erp_subjects_company_id", "erp_subjects", ["company_id"])
    _create_index_if_missing("ix_erp_subjects_investment_id", "erp_subjects", ["investment_id"])
    _create_index_if_missing("ix_erp_subjects_lp_id", "erp_subjects", ["lp_id"])
    _create_index_if_missing("ix_erp_subjects_task_id", "erp_subjects", ["task_id"])
    _create_index_if_missing("ix_erp_subjects_workflow_instance_id", "erp_subjects", ["workflow_instance_id"])
    _create_index_if_missing("ix_erp_subjects_obligation_id", "erp_subjects", ["obligation_id"])

    if not _table_exists("erp_relations"):
        op.create_table(
            "erp_relations",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("parent_subject_id", sa.Integer(), sa.ForeignKey("erp_subjects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("child_subject_id", sa.Integer(), sa.ForeignKey("erp_subjects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("relation_type", sa.String(length=80), nullable=False),
            sa.Column("metadata_json", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("parent_subject_id", "child_subject_id", "relation_type", name="uq_erp_relation_edge"),
        )
    _create_index_if_missing("ix_erp_relations_parent_subject_id", "erp_relations", ["parent_subject_id"])
    _create_index_if_missing("ix_erp_relations_child_subject_id", "erp_relations", ["child_subject_id"])
    _create_index_if_missing("ix_erp_relations_relation_type", "erp_relations", ["relation_type"])

    if not _table_exists("erp_events"):
        op.create_table(
            "erp_events",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("subject_id", sa.Integer(), sa.ForeignKey("erp_subjects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("event_type", sa.String(length=80), nullable=False),
            sa.Column("actor_user_id", sa.Integer(), nullable=True),
            sa.Column("correlation_key", sa.String(length=120), nullable=True),
            sa.Column("origin_model", sa.String(length=80), nullable=True),
            sa.Column("origin_id", sa.Integer(), nullable=True),
            sa.Column("fund_id", sa.Integer(), nullable=True),
            sa.Column("investment_id", sa.Integer(), nullable=True),
            sa.Column("occurred_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("before_json", sa.Text(), nullable=True),
            sa.Column("after_json", sa.Text(), nullable=True),
            sa.Column("payload_json", sa.Text(), nullable=True),
        )
    _create_index_if_missing("ix_erp_events_subject_id", "erp_events", ["subject_id"])
    _create_index_if_missing("ix_erp_events_event_type", "erp_events", ["event_type"])
    _create_index_if_missing("ix_erp_events_actor_user_id", "erp_events", ["actor_user_id"])
    _create_index_if_missing("ix_erp_events_correlation_key", "erp_events", ["correlation_key"])
    _create_index_if_missing("ix_erp_events_origin_model", "erp_events", ["origin_model"])
    _create_index_if_missing("ix_erp_events_origin_id", "erp_events", ["origin_id"])
    _create_index_if_missing("ix_erp_events_fund_id", "erp_events", ["fund_id"])
    _create_index_if_missing("ix_erp_events_investment_id", "erp_events", ["investment_id"])
    _create_index_if_missing("ix_erp_events_occurred_at", "erp_events", ["occurred_at"])

    if not _table_exists("erp_document_records"):
        op.create_table(
            "erp_document_records",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("document_role", sa.String(length=32), nullable=False, server_default="artifact"),
            sa.Column("origin_model", sa.String(length=80), nullable=False),
            sa.Column("origin_id", sa.Integer(), nullable=False),
            sa.Column("origin_key", sa.String(length=80), nullable=False, server_default=""),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("document_type", sa.String(length=80), nullable=True),
            sa.Column("status_code", sa.String(length=40), nullable=False, server_default="pending"),
            sa.Column("lifecycle_stage", sa.String(length=32), nullable=False, server_default="open"),
            sa.Column("template_id", sa.Integer(), nullable=True),
            sa.Column("attachment_id", sa.Integer(), nullable=True),
            sa.Column("due_date", sa.Date(), nullable=True),
            sa.Column("requested_at", sa.DateTime(), nullable=True),
            sa.Column("received_at", sa.DateTime(), nullable=True),
            sa.Column("verified_at", sa.DateTime(), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("metadata_json", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("origin_model", "origin_id", "origin_key", name="uq_erp_document_origin"),
        )
    _create_index_if_missing("ix_erp_document_records_document_role", "erp_document_records", ["document_role"])
    _create_index_if_missing("ix_erp_document_records_origin_model", "erp_document_records", ["origin_model"])
    _create_index_if_missing("ix_erp_document_records_origin_id", "erp_document_records", ["origin_id"])
    _create_index_if_missing("ix_erp_document_records_origin_key", "erp_document_records", ["origin_key"])
    _create_index_if_missing("ix_erp_document_records_status_code", "erp_document_records", ["status_code"])
    _create_index_if_missing("ix_erp_document_records_lifecycle_stage", "erp_document_records", ["lifecycle_stage"])
    _create_index_if_missing("ix_erp_document_records_template_id", "erp_document_records", ["template_id"])
    _create_index_if_missing("ix_erp_document_records_attachment_id", "erp_document_records", ["attachment_id"])
    _create_index_if_missing("ix_erp_document_records_due_date", "erp_document_records", ["due_date"])

    if not _table_exists("erp_document_links"):
        op.create_table(
            "erp_document_links",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("document_record_id", sa.Integer(), sa.ForeignKey("erp_document_records.id", ondelete="CASCADE"), nullable=False),
            sa.Column("subject_id", sa.Integer(), sa.ForeignKey("erp_subjects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("link_type", sa.String(length=40), nullable=False, server_default="related"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("document_record_id", "subject_id", "link_type", name="uq_erp_document_link"),
        )
    _create_index_if_missing("ix_erp_document_links_document_record_id", "erp_document_links", ["document_record_id"])
    _create_index_if_missing("ix_erp_document_links_subject_id", "erp_document_links", ["subject_id"])
    _create_index_if_missing("ix_erp_document_links_link_type", "erp_document_links", ["link_type"])

    if not _table_exists("erp_automation_outbox"):
        op.create_table(
            "erp_automation_outbox",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("event_id", sa.Integer(), sa.ForeignKey("erp_events.id", ondelete="CASCADE"), nullable=False),
            sa.Column("subject_id", sa.Integer(), sa.ForeignKey("erp_subjects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("channel", sa.String(length=40), nullable=False, server_default="internal_rpa"),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
            sa.Column("available_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("payload_json", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
    _create_index_if_missing("ix_erp_automation_outbox_event_id", "erp_automation_outbox", ["event_id"])
    _create_index_if_missing("ix_erp_automation_outbox_subject_id", "erp_automation_outbox", ["subject_id"])
    _create_index_if_missing("ix_erp_automation_outbox_channel", "erp_automation_outbox", ["channel"])
    _create_index_if_missing("ix_erp_automation_outbox_status", "erp_automation_outbox", ["status"])
    _create_index_if_missing("ix_erp_automation_outbox_available_at", "erp_automation_outbox", ["available_at"])


def downgrade() -> None:
    _drop_index_if_exists("ix_erp_automation_outbox_available_at", "erp_automation_outbox")
    _drop_index_if_exists("ix_erp_automation_outbox_status", "erp_automation_outbox")
    _drop_index_if_exists("ix_erp_automation_outbox_channel", "erp_automation_outbox")
    _drop_index_if_exists("ix_erp_automation_outbox_subject_id", "erp_automation_outbox")
    _drop_index_if_exists("ix_erp_automation_outbox_event_id", "erp_automation_outbox")
    _drop_table_if_exists("erp_automation_outbox")

    _drop_index_if_exists("ix_erp_document_links_link_type", "erp_document_links")
    _drop_index_if_exists("ix_erp_document_links_subject_id", "erp_document_links")
    _drop_index_if_exists("ix_erp_document_links_document_record_id", "erp_document_links")
    _drop_table_if_exists("erp_document_links")

    _drop_index_if_exists("ix_erp_document_records_due_date", "erp_document_records")
    _drop_index_if_exists("ix_erp_document_records_attachment_id", "erp_document_records")
    _drop_index_if_exists("ix_erp_document_records_template_id", "erp_document_records")
    _drop_index_if_exists("ix_erp_document_records_lifecycle_stage", "erp_document_records")
    _drop_index_if_exists("ix_erp_document_records_status_code", "erp_document_records")
    _drop_index_if_exists("ix_erp_document_records_origin_key", "erp_document_records")
    _drop_index_if_exists("ix_erp_document_records_origin_id", "erp_document_records")
    _drop_index_if_exists("ix_erp_document_records_origin_model", "erp_document_records")
    _drop_index_if_exists("ix_erp_document_records_document_role", "erp_document_records")
    _drop_table_if_exists("erp_document_records")

    _drop_index_if_exists("ix_erp_events_occurred_at", "erp_events")
    _drop_index_if_exists("ix_erp_events_investment_id", "erp_events")
    _drop_index_if_exists("ix_erp_events_fund_id", "erp_events")
    _drop_index_if_exists("ix_erp_events_origin_id", "erp_events")
    _drop_index_if_exists("ix_erp_events_origin_model", "erp_events")
    _drop_index_if_exists("ix_erp_events_correlation_key", "erp_events")
    _drop_index_if_exists("ix_erp_events_actor_user_id", "erp_events")
    _drop_index_if_exists("ix_erp_events_event_type", "erp_events")
    _drop_index_if_exists("ix_erp_events_subject_id", "erp_events")
    _drop_table_if_exists("erp_events")

    _drop_index_if_exists("ix_erp_relations_relation_type", "erp_relations")
    _drop_index_if_exists("ix_erp_relations_child_subject_id", "erp_relations")
    _drop_index_if_exists("ix_erp_relations_parent_subject_id", "erp_relations")
    _drop_table_if_exists("erp_relations")

    _drop_index_if_exists("ix_erp_subjects_obligation_id", "erp_subjects")
    _drop_index_if_exists("ix_erp_subjects_workflow_instance_id", "erp_subjects")
    _drop_index_if_exists("ix_erp_subjects_task_id", "erp_subjects")
    _drop_index_if_exists("ix_erp_subjects_lp_id", "erp_subjects")
    _drop_index_if_exists("ix_erp_subjects_investment_id", "erp_subjects")
    _drop_index_if_exists("ix_erp_subjects_company_id", "erp_subjects")
    _drop_index_if_exists("ix_erp_subjects_gp_entity_id", "erp_subjects")
    _drop_index_if_exists("ix_erp_subjects_fund_id", "erp_subjects")
    _drop_index_if_exists("ix_erp_subjects_lifecycle_stage", "erp_subjects")
    _drop_index_if_exists("ix_erp_subjects_state_code", "erp_subjects")
    _drop_index_if_exists("ix_erp_subjects_native_id", "erp_subjects")
    _drop_index_if_exists("ix_erp_subjects_subject_type", "erp_subjects")
    _drop_table_if_exists("erp_subjects")
