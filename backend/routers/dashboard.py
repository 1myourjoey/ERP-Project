import re
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import date, timedelta, datetime

from database import get_db
from models.task import Task
from models.workflow_instance import WorkflowInstance
from schemas.task import TaskResponse

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

WEEKDAYS_KR = ["월", "화", "수", "목", "금", "토", "일"]


def _parse_memo_dates(memo: str | None, year: int) -> list[date]:
    if not memo:
        return []
    dates = []
    for m in re.finditer(r"(\d{1,2})/(\d{1,2})", memo):
        try:
            month, day = int(m.group(1)), int(m.group(2))
            dates.append(date(year, month, day))
        except ValueError:
            pass
    return dates


@router.get("/today")
def get_today_dashboard(db: Session = Depends(get_db)):
    today = date.today()
    tomorrow = today + timedelta(days=1)
    # 이번 주 일요일까지
    days_until_sunday = 6 - today.weekday()
    week_end = today + timedelta(days=days_until_sunday)
    # 다음 달 말
    if today.month == 12:
        upcoming_end = date(today.year + 1, 2, 28)
    else:
        upcoming_month = today.month + 2
        upcoming_year = today.year
        if upcoming_month > 12:
            upcoming_month -= 12
            upcoming_year += 1
        upcoming_end = date(upcoming_year, upcoming_month, 28)

    pending_tasks = (
        db.query(Task)
        .filter(Task.status.in_(["pending", "in_progress"]))
        .order_by(Task.deadline.asc().nullslast())
        .all()
    )

    today_tasks = []
    tomorrow_tasks = []
    week_tasks = []
    upcoming_tasks = []

    for t in pending_tasks:
        task_resp = TaskResponse.model_validate(t)
        dl = t.deadline.date() if isinstance(t.deadline, datetime) else t.deadline

        if dl == today:
            today_tasks.append(task_resp)
        elif dl == tomorrow:
            tomorrow_tasks.append(task_resp)
        elif dl and today < dl <= week_end:
            week_tasks.append(task_resp)
        elif dl and week_end < dl <= upcoming_end:
            upcoming_tasks.append(task_resp)

        # 메모에 이번 주 날짜가 있는 경우도 이번 주에 포함
        if t.memo:
            memo_dates = _parse_memo_dates(t.memo, today.year)
            for md in memo_dates:
                if today <= md <= week_end and task_resp not in week_tasks and dl != today and dl != tomorrow:
                    week_tasks.append(task_resp)
                    break

    # 활성 워크플로우
    active_instances = (
        db.query(WorkflowInstance)
        .filter(WorkflowInstance.status == "active")
        .all()
    )
    active_workflows = []
    for inst in active_instances:
        total = len(inst.step_instances)
        done = sum(1 for s in inst.step_instances if s.status in ("completed", "skipped"))
        next_step = None
        for s in inst.step_instances:
            if s.status == "pending":
                next_step = s.step.name if s.step else None
                break
        active_workflows.append({
            "id": inst.id,
            "name": inst.name,
            "progress": f"{done}/{total}",
            "next_step": next_step,
        })

    return {
        "date": today.isoformat(),
        "day_of_week": WEEKDAYS_KR[today.weekday()],
        "today": {
            "tasks": today_tasks,
            "total_estimated_time": _sum_time(today_tasks),
        },
        "tomorrow": {
            "tasks": tomorrow_tasks,
            "total_estimated_time": _sum_time(tomorrow_tasks),
        },
        "this_week": week_tasks,
        "upcoming": upcoming_tasks,
        "active_workflows": active_workflows,
    }


def _sum_time(tasks: list[TaskResponse]) -> str:
    total_minutes = 0
    for t in tasks:
        total_minutes += _parse_time_to_minutes(t.estimated_time)
    if total_minutes == 0:
        return "0m"
    hours = total_minutes // 60
    mins = total_minutes % 60
    if hours and mins:
        return f"{hours}h {mins}m"
    elif hours:
        return f"{hours}h"
    return f"{mins}m"


def _parse_time_to_minutes(s: str | None) -> int:
    if not s:
        return 0
    total = 0
    # "2h", "30m", "1h30m", "2h 30m", "1~2h" (하한값 사용)
    s = s.split("~")[0] if "~" in s else s
    h_match = re.search(r"(\d+)h", s)
    m_match = re.search(r"(\d+)m", s)
    d_match = re.search(r"(\d+)일", s)
    if h_match:
        total += int(h_match.group(1)) * 60
    if m_match:
        total += int(m_match.group(1))
    if d_match:
        total += int(d_match.group(1)) * 480  # 8시간/일
    return total


