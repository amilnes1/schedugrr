import { beforeEach, describe, expect, it } from "vitest";
import { commitBoardDrop } from "./BoardView";
import { scheduleDropId } from "./DayScheduleRail";
import { useBoard } from "@/lib/store";
import type { List, Task } from "@/lib/types";

const list: List = {
  id: "inbox",
  name: "Inbox",
  color: "accent",
  order: 0,
  taskOrder: "priority",
};

const task: Task = {
  id: "write-brief",
  title: "Write the brief",
  notes: "",
  listId: list.id,
  date: null,
  time: null,
  completed: false,
  priority: "high",
  order: 0,
  dayOrder: 0,
  createdAt: 0,
  updatedAt: 0,
};

beforeEach(() => {
  useBoard.getState().replaceDocument({
    lists: { [list.id]: list },
    tasks: { [task.id]: task },
  });
});

describe("board schedule drops", () => {
  it("schedules a board task on the day represented by the rail", () => {
    commitBoardDrop(useBoard.getState(), task.id, scheduleDropId("2026-09-10"));

    expect(useBoard.getState().tasks[task.id].date).toBe("2026-09-10");
    expect(useBoard.getState().tasks[task.id].listId).toBe(list.id);
  });
});
