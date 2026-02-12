import { type FormEvent, useEffect, useState } from "react";
import { completeTask, createTask, getTaskBoard, moveTask } from "../api";
import type { Task, TaskBoard } from "../types";

const emptyBoard: TaskBoard = { Q1: [], Q2: [], Q3: [], Q4: [] };

function TaskCard({ task, onChanged }: { task: Task; onChanged: () => Promise<void> }) {
  const nextQuadrants: Array<Task["quadrant"]> = ["Q1", "Q2", "Q3", "Q4"].filter(
    (q) => q !== task.quadrant,
  ) as Array<Task["quadrant"]>;

  async function onMove(quadrant: Task["quadrant"]) {
    try {
      await moveTask(task.id, quadrant);
      await onChanged();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "이동 실패");
    }
  }

  async function onComplete() {
    const actual = window.prompt("실제 소요시간(예: 45m, 2h)", task.estimated_time ?? "30m");
    if (!actual) {
      return;
    }
    try {
      await completeTask(task.id, actual);
      await onChanged();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "완료 처리 실패");
    }
  }

  return (
    <article className="task-card">
      <h4>{task.title}</h4>
      <p>{task.estimated_time ?? "-"}</p>
      <p>{task.deadline ? task.deadline.slice(0, 10) : "마감일 없음"}</p>
      <div className="task-actions">
        {nextQuadrants.map((q) => (
          <button key={q} onClick={() => onMove(q)}>
            {q}
          </button>
        ))}
        <button onClick={onComplete}>완료</button>
      </div>
    </article>
  );
}

function Quadrant({
  title,
  tasks,
  tone,
  onChanged,
}: {
  title: string;
  tasks: Task[];
  tone: string;
  onChanged: () => Promise<void>;
}) {
  return (
    <section className={`quadrant ${tone}`}>
      <header>
        <h3>{title}</h3>
        <span>{tasks.length}개</span>
      </header>
      <div className="task-list">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onChanged={onChanged} />
        ))}
      </div>
    </section>
  );
}

export function TaskBoardPage() {
  const [board, setBoard] = useState<TaskBoard>(emptyBoard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function loadBoard() {
    setLoading(true);
    getTaskBoard()
      .then(setBoard)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadBoard();
  }, []);

  async function onCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "").trim();
    const quadrant = String(formData.get("quadrant") ?? "Q2") as Task["quadrant"];
    const estimatedTime = String(formData.get("estimated_time") ?? "").trim();
    const deadline = String(formData.get("deadline") ?? "").trim();
    const memo = String(formData.get("memo") ?? "").trim();

    if (!title) {
      setError("제목은 필수입니다.");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      await createTask({
        title,
        quadrant,
        estimated_time: estimatedTime || undefined,
        deadline: deadline || undefined,
        memo: memo || undefined,
      });
      (event.currentTarget as HTMLFormElement).reset();
      await loadBoard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 중 오류");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <div className="panel">불러오는 중...</div>;
  }

  if (error) {
    return <div className="panel">오류: {error}</div>;
  }

  return (
    <>
      <form className="panel create-form" onSubmit={onCreateTask}>
        <h2>작업 추가</h2>
        <div className="create-grid">
          <input name="title" placeholder="작업 제목" required />
          <select name="quadrant" defaultValue="Q2">
            <option value="Q1">Q1</option>
            <option value="Q2">Q2</option>
            <option value="Q3">Q3</option>
            <option value="Q4">Q4</option>
          </select>
          <input name="estimated_time" placeholder="예상시간 (예: 1h)" />
          <input name="deadline" type="datetime-local" />
          <input name="memo" placeholder="메모" />
          <button type="submit" disabled={creating}>
            {creating ? "저장 중..." : "추가"}
          </button>
        </div>
      </form>
      <div className="board-grid">
        <Quadrant title="Q1 긴급+중요" tasks={board.Q1} tone="tone-q1" onChanged={loadBoard} />
        <Quadrant title="Q2 중요" tasks={board.Q2} tone="tone-q2" onChanged={loadBoard} />
        <Quadrant title="Q3 긴급" tasks={board.Q3} tone="tone-q3" onChanged={loadBoard} />
        <Quadrant title="Q4 기타" tasks={board.Q4} tone="tone-q4" onChanged={loadBoard} />
      </div>
    </>
  );
}
