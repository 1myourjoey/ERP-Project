import { useEffect, useState } from "react";
import { getTaskBoard } from "../api";
import type { Task, TaskBoard } from "../types";

const emptyBoard: TaskBoard = { Q1: [], Q2: [], Q3: [], Q4: [] };

function TaskCard({ task }: { task: Task }) {
  return (
    <article className="task-card">
      <h4>{task.title}</h4>
      <p>{task.estimated_time ?? "-"}</p>
      <p>{task.deadline ? task.deadline.slice(0, 10) : "마감일 없음"}</p>
    </article>
  );
}

function Quadrant({
  title,
  tasks,
  tone,
}: {
  title: string;
  tasks: Task[];
  tone: string;
}) {
  return (
    <section className={`quadrant ${tone}`}>
      <header>
        <h3>{title}</h3>
        <span>{tasks.length}개</span>
      </header>
      <div className="task-list">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </section>
  );
}

export function TaskBoardPage() {
  const [board, setBoard] = useState<TaskBoard>(emptyBoard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTaskBoard()
      .then(setBoard)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="panel">불러오는 중...</div>;
  }

  if (error) {
    return <div className="panel">오류: {error}</div>;
  }

  return (
    <div className="board-grid">
      <Quadrant title="Q1 긴급+중요" tasks={board.Q1} tone="tone-q1" />
      <Quadrant title="Q2 중요" tasks={board.Q2} tone="tone-q2" />
      <Quadrant title="Q3 긴급" tasks={board.Q3} tone="tone-q3" />
      <Quadrant title="Q4 기타" tasks={board.Q4} tone="tone-q4" />
    </div>
  );
}

