"""
Initialize a master account for local development.

Run:
    python seed_master.py
"""

import os

from sqlalchemy import or_

from database import SessionLocal
from dependencies.auth import hash_password
from models.user import User


def main() -> None:
    username = (os.environ.get("VON_MASTER_USERNAME") or "admin").strip().lower() or "admin"
    password = (os.environ.get("VON_MASTER_PASSWORD") or "VonAdmin2026!").strip() or "VonAdmin2026!"
    email = (os.environ.get("VON_MASTER_EMAIL") or "").strip().lower() or None
    name = (os.environ.get("VON_MASTER_NAME") or "Master Admin").strip() or "Master Admin"

    db = SessionLocal()
    try:
        existing_master = db.query(User).filter(User.role == "master").first()
        if existing_master:
            print(f"master account already exists (id={existing_master.id}, username={existing_master.username})")
            return

        predicates = [User.username == username]
        if email:
            predicates.append(User.email == email)
        conflict = db.query(User).filter(or_(*predicates)).first()
        if conflict:
            print(
                "cannot create master account due to username/email conflict: "
                f"id={conflict.id}, username={conflict.username}, email={conflict.email}"
            )
            return

        row = User(
            username=username,
            email=email,
            name=name,
            password_hash=hash_password(password),
            role="master",
            department="관리자",
            is_active=True,
        )
        row.allowed_routes = None
        db.add(row)
        db.commit()
        db.refresh(row)
        print(f"master account created: username={row.username}, id={row.id}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
