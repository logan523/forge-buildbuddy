/**
 * Agentic Task Explorer — curated tasks that prove the stack
 * (docs/FORGE-AGENTIC-EXPANSION.md Layer E).
 */

export type TaskId =
  | "T01"
  | "T02"
  | "T03"
  | "T04"
  | "T05"
  | "T06"
  | "T07"
  | "T08"
  | "T09"
  | "T10";

export interface TaskDef {
  id: TaskId;
  title: string;
  /** What the builder/agent is asked to do. */
  prompt: string;
  /** Skills expected to load (ids). */
  skillIds: string[];
  /** Whether this task is runnable pure (no board). */
  offline: boolean;
}

export interface TaskCheckResult {
  id: string;
  pass: boolean;
  detail: string;
}

export interface TaskRunReport {
  taskId: TaskId;
  title: string;
  pass: boolean;
  checks: TaskCheckResult[];
}
