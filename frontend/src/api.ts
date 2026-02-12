import type { TaskBoard } from "./types";

export async function getTaskBoard(): Promise<TaskBoard> {
  const response = await fetch("/api/tasks/board?status=pending");
  if (!response.ok) {
    throw new Error("작업보드를 불러오지 못했습니다.");
  }
  return response.json();
}

export async function createTask(payload: {
  title: string;
  quadrant: "Q1" | "Q2" | "Q3" | "Q4";
  estimated_time?: string;
  deadline?: string;
  memo?: string;
}): Promise<void> {
  const response = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("작업 생성 실패");
  }
}

export async function moveTask(taskId: number, quadrant: "Q1" | "Q2" | "Q3" | "Q4"): Promise<void> {
  const response = await fetch(`/api/tasks/${taskId}/move`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quadrant }),
  });
  if (!response.ok) {
    throw new Error("사분면 이동 실패");
  }
}

export async function completeTask(taskId: number, actualTime: string): Promise<void> {
  const response = await fetch(`/api/tasks/${taskId}/complete`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actual_time: actualTime }),
  });
  if (!response.ok) {
    throw new Error("작업 완료 처리 실패");
  }
}
