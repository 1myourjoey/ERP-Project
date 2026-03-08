from __future__ import annotations

from sqlalchemy.orm import Session

from models.fund import Fund
from schemas.analytics import (
    AnalyticsCatalogResponse,
    AnalyticsExecutiveFilterOptions,
    AnalyticsExecutivePack,
    AnalyticsFieldMeta,
    AnalyticsOptionItem,
    AnalyticsStarterView,
    AnalyticsSubjectMeta,
)
from services.analytics.executive_packs import build_executive_packs
from services.analytics.subjects import SUBJECT_DEFINITIONS, SUBJECT_MAP


def get_subject_definition(subject_key: str):
    return SUBJECT_MAP.get(subject_key)


def build_catalog_response(db: Session) -> AnalyticsCatalogResponse:
    subjects = []
    starter_views = []
    for subject in SUBJECT_DEFINITIONS:
        subjects.append(
            AnalyticsSubjectMeta(
                key=subject.key,
                label=subject.label,
                description=subject.description,
                grain_label=subject.grain_label,
                fields=[
                    AnalyticsFieldMeta(
                        key=field.key,
                        label=field.label,
                        kind=field.kind,
                        data_type=field.data_type,
                        group=field.group,
                        description=field.description or None,
                        operators=field.operators,
                        allowed_aggregates=field.allowed_aggregates,
                        default_aggregate=field.default_aggregate,
                        is_linked_measure=field.is_linked_measure,
                    )
                    for field in subject.all_fields
                ],
                default_table_fields=subject.default_table_fields,
                default_values=subject.default_values,
            )
        )
        starter_views.extend(AnalyticsStarterView(**view) for view in subject.starter_views)

    funds = db.query(Fund).order_by(Fund.name.asc(), Fund.id.asc()).all()
    executive_filter_options = AnalyticsExecutiveFilterOptions(
        funds=[AnalyticsOptionItem(value=fund.name, label=fund.name) for fund in funds]
    )
    executive_packs = [AnalyticsExecutivePack(**pack) for pack in build_executive_packs()]
    return AnalyticsCatalogResponse(
        subjects=subjects,
        starter_views=starter_views,
        executive_packs=executive_packs,
        executive_filter_options=executive_filter_options,
    )

