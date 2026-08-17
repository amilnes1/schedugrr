/**
 * ScheduGrr core domain types.
 *
 * The data model is intentionally small and normalized so that it can be
 * manipulated equally well by a human dragging cards around or by a future
 * LLM-facing editing layer calling the store's named actions.
 */

/** A color identity, shared by lists and reused as calendar accents. */
export type ColorKey = "accent" | "sage" | "gold" | "sky" | "plum" | "ink";

export const COLOR_KEYS: ColorKey[] = [
  "accent",
  "sage",
  "gold",
  "sky",
  "plum",
  "ink",
];

export type Priority = "none" | "low" | "medium" | "high";
export type TaskOrderMode = "priority" | "manual";

/** A to-do list — a column on the Board. */
export interface List {
  id: string;
  name: string;
  color: ColorKey;
  /** Sort position among lists (ascending). */
  order: number;
  /** Priority by default; switches to manual when a person drags tasks. */
  taskOrder: TaskOrderMode;
}

/**
 * A single task. A task always belongs to exactly one list. It may optionally
 * be scheduled onto a calendar `date`. Scheduling never changes which list a
 * task belongs to — the two axes are independent, which is what makes moving
 * tasks between dates feel effortless.
 */
export interface Task {
  id: string;
  title: string;
  notes: string;
  listId: string;
  /** ISO date `yyyy-MM-dd`, or null when the task is unscheduled. */
  date: string | null;
  /** Optional local wall-clock time `HH:mm`; requires a scheduled date. */
  time: string | null;
  completed: boolean;
  priority: Priority;
  /** Sort position within its list (ascending). */
  order: number;
  /** Sort position within its calendar day (ascending). */
  dayOrder: number;
  createdAt: number;
  updatedAt: number;
}

/** The full persisted document. */
export interface BoardState {
  lists: Record<string, List>;
  tasks: Record<string, Task>;
}
