from services.analytics.subjects import SUBJECT_DEFINITIONS


def test_analytics_subjects_load_rows_on_empty_db(db_session):
    for subject in SUBJECT_DEFINITIONS:
        rows = subject.load_rows(db_session)
        assert isinstance(rows, list), subject.key
