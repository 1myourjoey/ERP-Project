from sqlalchemy import Column, Integer, String, Text, Date, Time, ForeignKey

from database import Base


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)
    date = Column(Date, nullable=False)
    time = Column(Time, nullable=True)
    duration = Column(Integer, nullable=True)
    description = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="pending")
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
