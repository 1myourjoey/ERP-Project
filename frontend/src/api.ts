import type { TaskBoard } from "./types";

export async function getTaskBoard(): Promise<TaskBoard> {
  const response = await fetch("/api/tasks/board?status=pending");
  if (!response.ok) {
    throw new Error("작업보드를 불러오지 못했습니다.");
  }
  return response.json();
}

