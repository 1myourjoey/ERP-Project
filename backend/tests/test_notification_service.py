import asyncio

from models.notification import Notification
from models.user import User
from services.notification_service import create_notifications_for_active_users


def test_create_notifications_for_active_users_batches_and_dedupes(db_session):
    db_session.add_all(
        [
            User(username="active_one", name="Active One", role="admin", is_active=True),
            User(username="active_two", name="Active Two", role="manager", is_active=True),
            User(username="inactive_user", name="Inactive User", role="viewer", is_active=False),
        ]
    )
    db_session.commit()

    created = asyncio.run(
        create_notifications_for_active_users(
            db_session,
            category="system",
            severity="warning",
            title="배치 알림 테스트",
            message="첫 알림",
            target_type="batch_test",
            target_id=1,
            action_url="/dashboard",
        )
    )
    assert created == 2
    assert db_session.query(Notification).count() == 2

    created_again = asyncio.run(
        create_notifications_for_active_users(
            db_session,
            category="system",
            severity="warning",
            title="배치 알림 테스트",
            message="첫 알림",
            target_type="batch_test",
            target_id=1,
            action_url="/dashboard",
        )
    )
    assert created_again == 0
    assert db_session.query(Notification).count() == 2
