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


def upgrade() -> None:
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
    op.create_index("ix_erp_subjects_subject_type", "erp_subjects", ["subject_type"])
    op.create_index("ix_erp_subjects_native_id", "erp_subjects", ["native_id"])
    op.create_index("ix_erp_subjects_state_code", "erp_subjects", ["state_code"])
    op.create_index("ix_erp_subjects_lifecycle_stage", "erp_subjects", ["lifecycle_stage"])
    op.create_index("ix_erp_subjects_fund_id", "erp_subjects", ["fund_id"])
    op.create_index("ix_erp_subjects_gp_entity_id", "erp_subjects", ["gp_entity_id"])
    op.create_index("ix_erp_subjects_company_id", "erp_subjects", ["company_id"])
    op.create_index("ix_erp_subjects_investment_id", "erp_subjects", ["investment_id"])
    op.create_index("ix_erp_subjects_lp_id", "erp_subjects", ["lp_id"])
    op.create_index("ix_erp_subjects_task_id", "erp_subjects", ["task_id"])
    op.create_index("ix_erp_subjects_workflow_instance_id", "erp_subjects", ["workflow_instance_id"])
    op.create_index("ix_erp_subjects_obligation_id", "erp_subjects", ["obligation_id"])

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
    op.create_index("ix_erp_relations_parent_subject_id", "erp_relations", ["parent_subject_id"])
    op.create_index("ix_erp_relations_child_subject_id", "erp_relations", ["child_subject_id"])
    op.create_index("ix_erp_relations_relation_type", "erp_relations", ["relation_type"])

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
    op.create_index("ix_erp_events_subject_id", "erp_events", ["subject_id"])
    op.create_index("ix_erp_events_event_type", "erp_events", ["event_type"])
    op.create_index("ix_erp_events_actor_user_id", "erp_events", ["actor_user_id"])
    op.create_index("ix_erp_events_correlation_key", "erp_events", ["correlation_key"])
    op.create_index("ix_erp_events_origin_model", "erp_events", ["origin_model"])
    op.create_index("ix_erp_events_origin_id", "erp_events", ["origin_id"])
    op.create_index("ix_erp_events_fund_id", "erp_events", ["fund_id"])
    op.create_index("ix_erp_events_investment_id", "erp_events", ["investment_id"])
    op.create_index("ix_erp_events_occurred_at", "erp_events", ["occurred_at"])

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
    op.create_index("ix_erp_document_records_document_role", "erp_document_records", ["document_role"])
    op.create_index("ix_erp_document_records_origin_model", "erp_document_records", ["origin_model"])
    op.create_index("ix_erp_document_records_origin_id", "erp_document_records", ["origin_id"])
    op.create_index("ix_erp_document_records_origin_key", "erp_document_records", ["origin_key"])
    op.create_index("ix_erp_document_records_status_code", "erp_document_records", ["status_code"])
    op.create_index("ix_erp_document_records_lifecycle_stage", "erp_document_records", ["lifecycle_stage"])
    op.create_index("ix_erp_document_records_template_id", "erp_document_records", ["template_id"])
    op.create_index("ix_erp_document_records_attachment_id", "erp_document_records", ["attachment_id"])
    op.create_index("ix_erp_document_records_due_date", "erp_document_records", ["due_date"])

    op.create_table(
        "erp_document_links",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("document_record_id", sa.Integer(), sa.ForeignKey("erp_document_records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.Integer(), sa.ForeignKey("erp_subjects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("link_type", sa.String(length=40), nullable=False, server_default="related"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("document_record_id", "subject_id", "link_type", name="uq_erp_document_link"),
    )
    op.create_index("ix_erp_document_links_document_record_id", "erp_document_links", ["document_record_id"])
    op.create_index("ix_erp_document_links_subject_id", "erp_document_links", ["subject_id"])
    op.create_index("ix_erp_document_links_link_type", "erp_document_links", ["link_type"])

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
    op.create_index("ix_erp_automation_outbox_event_id", "erp_automation_outbox", ["event_id"])
    op.create_index("ix_erp_automation_outbox_subject_id", "erp_automation_outbox", ["subject_id"])
    op.create_index("ix_erp_automation_outbox_channel", "erp_automation_outbox", ["channel"])
    op.create_index("ix_erp_automation_outbox_status", "erp_automation_outbox", ["status"])
    op.create_index("ix_erp_automation_outbox_available_at", "erp_automation_outbox", ["available_at"])


def downgrade() -> None:
    op.drop_index("ix_erp_automation_outbox_available_at", table_name="erp_automation_outbox")
    op.drop_index("ix_erp_automation_outbox_status", table_name="erp_automation_outbox")
    op.drop_index("ix_erp_automation_outbox_channel", table_name="erp_automation_outbox")
    op.drop_index("ix_erp_automation_outbox_subject_id", table_name="erp_automation_outbox")
    op.drop_index("ix_erp_automation_outbox_event_id", table_name="erp_automation_outbox")
    op.drop_table("erp_automation_outbox")

    op.drop_index("ix_erp_document_links_link_type", table_name="erp_document_links")
    op.drop_index("ix_erp_document_links_subject_id", table_name="erp_document_links")
    op.drop_index("ix_erp_document_links_document_record_id", table_name="erp_document_links")
    op.drop_table("erp_document_links")

    op.drop_index("ix_erp_document_records_due_date", table_name="erp_document_records")
    op.drop_index("ix_erp_document_records_attachment_id", table_name="erp_document_records")
    op.drop_index("ix_erp_document_records_template_id", table_name="erp_document_records")
    op.drop_index("ix_erp_document_records_lifecycle_stage", table_name="erp_document_records")
    op.drop_index("ix_erp_document_records_status_code", table_name="erp_document_records")
    op.drop_index("ix_erp_document_records_origin_key", table_name="erp_document_records")
    op.drop_index("ix_erp_document_records_origin_id", table_name="erp_document_records")
    op.drop_index("ix_erp_document_records_origin_model", table_name="erp_document_records")
    op.drop_index("ix_erp_document_records_document_role", table_name="erp_document_records")
    op.drop_table("erp_document_records")

    op.drop_index("ix_erp_events_occurred_at", table_name="erp_events")
    op.drop_index("ix_erp_events_investment_id", table_name="erp_events")
    op.drop_index("ix_erp_events_fund_id", table_name="erp_events")
    op.drop_index("ix_erp_events_origin_id", table_name="erp_events")
    op.drop_index("ix_erp_events_origin_model", table_name="erp_events")
    op.drop_index("ix_erp_events_correlation_key", table_name="erp_events")
    op.drop_index("ix_erp_events_actor_user_id", table_name="erp_events")
    op.drop_index("ix_erp_events_event_type", table_name="erp_events")
    op.drop_index("ix_erp_events_subject_id", table_name="erp_events")
    op.drop_table("erp_events")

    op.drop_index("ix_erp_relations_relation_type", table_name="erp_relations")
    op.drop_index("ix_erp_relations_child_subject_id", table_name="erp_relations")
    op.drop_index("ix_erp_relations_parent_subject_id", table_name="erp_relations")
    op.drop_table("erp_relations")

    op.drop_index("ix_erp_subjects_obligation_id", table_name="erp_subjects")
    op.drop_index("ix_erp_subjects_workflow_instance_id", table_name="erp_subjects")
    op.drop_index("ix_erp_subjects_task_id", table_name="erp_subjects")
    op.drop_index("ix_erp_subjects_lp_id", table_name="erp_subjects")
    op.drop_index("ix_erp_subjects_investment_id", table_name="erp_subjects")
    op.drop_index("ix_erp_subjects_company_id", table_name="erp_subjects")
    op.drop_index("ix_erp_subjects_gp_entity_id", table_name="erp_subjects")
    op.drop_index("ix_erp_subjects_fund_id", table_name="erp_subjects")
    op.drop_index("ix_erp_subjects_lifecycle_stage", table_name="erp_subjects")
    op.drop_index("ix_erp_subjects_state_code", table_name="erp_subjects")
    op.drop_index("ix_erp_subjects_native_id", table_name="erp_subjects")
    op.drop_index("ix_erp_subjects_subject_type", table_name="erp_subjects")
    op.drop_table("erp_subjects")
