import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { BoardView } from "./BoardView";
import { useBoard, selectTasksForDay, selectTasksForList, selectUnscheduled } from "@/lib/store";
import { parseDocument } from "@/lib/io";
import { todayKey } from "@/lib/date";
import type { List, Task } from "@/lib/types";

const list: List = { id: "work", name: "Client work", color: "ink", order: 0, taskOrder: "manual" };
const task: Task = {
  id: "brief", title: "Keep this task", notes: "Keep these notes", listId: list.id,
  date: todayKey(), time: "10:00", completed: true, priority: "high",
  order: 0, dayOrder: 0, createdAt: 1, updatedAt: 2,
};

const unfinished: Task = { ...task, id: "unfinished", title: "Keep working", completed: false, time: "11:00", order: 1, dayOrder: 1 };

afterEach(cleanup);
beforeEach(() => useBoard.getState().replaceDocument({ lists: { [list.id]: { ...list } }, tasks: { [task.id]: { ...task }, [unfinished.id]: { ...unfinished } } }));

describe("list item archive", () => {
  it("keeps the list, hides completed items only, shows new tasks, and restores archived items", () => {
    render(<BoardView onOpenTask={() => {}} />);
    const column = screen.getByRole("heading", { name: list.name }).closest("section")!;
    fireEvent.click(within(column).getByRole("button", { name: "List options" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive completed items" }));

    expect(screen.getByRole("heading", { name: list.name })).toBeTruthy();
    expect(screen.queryByText(task.title)).toBeNull();
    expect(within(column).getByText(unfinished.title)).toBeTruthy();
    expect(useBoard.getState().tasks[unfinished.id]).toEqual(unfinished);
    expect(useBoard.getState().lists[list.id]).toEqual(list);
    expect(useBoard.getState().tasks[task.id]).toEqual({ ...task, archived: true });

    const composer = within(column).getByPlaceholderText("Add a task…");
    fireEvent.change(composer, { target: { value: "New visible task" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(within(column).getByText("New visible task")).toBeTruthy();

    fireEvent.click(within(column).getByRole("button", { name: "List options" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore archived items (1)" }));
    expect(within(column).getByText(task.title)).toBeTruthy();
    expect(within(column).getByText("New visible task")).toBeTruthy();
    expect(useBoard.getState().tasks[task.id]).toEqual({ ...task, archived: false });
  });

  it("leaves every item alone when none are completed", () => {
    useBoard.getState().updateTask(task.id, { completed: false });
    const before = useBoard.getState().tasks;
    useBoard.getState().archiveListTasks(list.id);
    expect(useBoard.getState().tasks).toEqual(before);
  });

  it("keeps archive state after persistence reload and JSON import", async () => {
    useBoard.getState().archiveListTasks(list.id);
    const storage = useBoard.persist.getOptions().storage!;
    const persisted = await storage.getItem("schedugrr.v1");
    const document = parseDocument(JSON.stringify({ lists: useBoard.getState().lists, tasks: useBoard.getState().tasks }));
    expect(document.tasks[task.id]).toEqual({ ...task, archived: true });
    expect(document.lists[list.id]).toEqual(list);

    useBoard.setState({ lists: {}, tasks: {} });
    await storage.setItem("schedugrr.v1", persisted!);
    await act(async () => { await useBoard.persist.rehydrate(); });
    expect(useBoard.getState().tasks[task.id]).toEqual({ ...task, archived: true });
    expect(useBoard.getState().lists[list.id]).toEqual(list);
  });

  it("hides archived items from all active views and leaves other lists untouched", () => {
    const otherList = { ...list, id: "other", name: "Other" };
    const otherTask = { ...task, id: "other-task", listId: otherList.id };
    const unscheduled = { ...task, id: "unscheduled", date: null, time: null };
    const pending = { ...unfinished, id: "pending", date: null, time: null };
    useBoard.getState().replaceDocument({ lists: { work: list, other: otherList }, tasks: { brief: task, [otherTask.id]: otherTask, unscheduled, [unfinished.id]: unfinished, pending } });
    useBoard.getState().archiveListTasks(list.id);
    const state = useBoard.getState();
    expect(selectTasksForList(state, list.id)).toEqual([unfinished, pending]);
    expect(selectTasksForDay(state, task.date!)).toEqual([otherTask, unfinished]);
    expect(selectUnscheduled(state)).toEqual([pending]);
    expect(state.tasks[otherTask.id]).toEqual(otherTask);
  });
});
