from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from database import Base


class WorkLog(Base):
    __tablename__ = "worklogs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False)
    category = Column(String, nullable=False)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=True)
    status = Column(String, default="완료")  # 완료, 진행중
    estimated_time = Column(String, nullable=True)
    actual_time = Column(String, nullable=True)
    time_diff = Column(String, nullable=True)
    created_at = Column(DateTime, default=func.now())
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)

    details = relationship("WorkLogDetail", back_populates="worklog", cascade="all, delete-orphan")
    lessons = relationship("WorkLogLesson", back_populates="worklog", cascade="all, delete-orphan")
    follow_ups = relationship("WorkLogFollowUp", back_populates="worklog", cascade="all, delete-orphan")


class WorkLogDetail(Base):
    __tablename__ = "worklog_details"

    id = Column(Integer, primary_key=True, autoincrement=True)
    worklog_id = Column(Integer, ForeignKey("worklogs.id"))
    content = Column(Text, nullable=False)
    order = Column(Integer, default=0)
    worklog = relationship("WorkLog", back_populates="details")


class WorkLogLesson(Base):
    __tablename__ = "worklog_lessons"

    id = Column(Integer, primary_key=True, autoincrement=True)
    worklog_id = Column(Integer, ForeignKey("worklogs.id"))
    content = Column(Text, nullable=False)
    order = Column(Integer, default=0)
    worklog = relationship("WorkLog", back_populates="lessons")


class WorkLogFollowUp(Base):
    __tablename__ = "worklog_follow_ups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    worklog_id = Column(Integer, ForeignKey("worklogs.id"))
    content = Column(Text, nullable=False)
    target_date = Column(Date, nullable=True)
    order = Column(Integer, default=0)
    worklog = relationship("WorkLog", back_populates="follow_ups")
