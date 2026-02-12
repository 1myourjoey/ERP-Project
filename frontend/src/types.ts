export type TaskStatus = "pending" | "in_progress" | "completed";
export type Quadrant = "Q1" | "Q2" | "Q3" | "Q4";

export interface Task {
  id: number;
  title: string;
  deadline?: string | null;
  estimated_time?: string | null;
  quadrant: Quadrant;
  memo?: string | null;
  status: TaskStatus;
  created_at?: string | null;
  completed_at?: string | null;
  actual_time?: string | null;
}

export interface TaskBoard {
  Q1: Task[];
  Q2: Task[];
  Q3: Task[];
  Q4: Task[];
}

