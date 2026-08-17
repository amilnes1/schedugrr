import type { List, Priority, Task } from "./types";
import { toKey } from "./date";
import { addDays } from "date-fns";

/**
 * First-run content. Kept deliberately human — a small slice of a real week —
 * so the empty state teaches the two core moves: keep lists, and drag onto days.
 */

let seq = 0;
const id = (p: string) => `${p}${(++seq).toString(36)}`;

interface SeedTask {
  title: string;
  list: string;
  offset?: number | null; // days from today; undefined = unscheduled
  time?: string;
  notes?: string;
  priority?: Priority;
  done?: boolean;
}

export function seedDocument(): { lists: Record<string, List>; tasks: Record<string, Task> } {
  seq = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const listDefs: Array<{ key: string; name: string; color: List["color"] }> = [
    { key: "focus", name: "This Week", color: "accent" },
    { key: "work", name: "Work", color: "sky" },
    { key: "home", name: "Home & Errands", color: "sage" },
    { key: "someday", name: "Someday / Maybe", color: "plum" },
  ];

  const lists: Record<string, List> = {};
  const listId: Record<string, string> = {};
  listDefs.forEach((l, i) => {
    const lid = id("l_");
    listId[l.key] = lid;
    lists[lid] = { id: lid, name: l.name, color: l.color, order: i, taskOrder: "priority" };
  });

  const taskDefs: SeedTask[] = [
    { title: "Sketch the week ahead", list: "focus", offset: 0, time: "09:00", priority: "high", notes: "Block two deep-work mornings." },
    { title: "Reply to Priya about the venue", list: "focus", offset: 0, time: "13:30", priority: "medium" },
    { title: "Finish the Q3 planning doc", list: "work", offset: 1, time: "10:00", priority: "high", notes: "Share with the team before standup." },
    { title: "Review pull requests", list: "work", offset: 0, time: "15:00" },
    { title: "1:1 with Sam", list: "work", offset: 2, time: "10:00", priority: "medium" },
    { title: "Draft the launch announcement", list: "work", offset: 4 },
    { title: "Book dentist appointment", list: "home", offset: 2, time: "14:30", priority: "medium" },
    { title: "Water the plants", list: "home", offset: -1, done: true },
    { title: "Grocery run — pasta, greens, coffee", list: "home", offset: 3 },
    { title: "Fix the squeaky door", list: "home" },
    { title: "Renew library books", list: "home", offset: 5 },
    { title: "Plan a long weekend trip", list: "someday", notes: "Coast or mountains?" },
    { title: "Read 'The Timeless Way of Building'", list: "someday" },
    { title: "Learn to make sourdough", list: "someday" },
    { title: "Weekly review", list: "focus", offset: 6, priority: "low" },
  ];

  const tasks: Record<string, Task> = {};
  const perListOrder: Record<string, number> = {};
  const perDayOrder: Record<string, number> = {};

  for (const t of taskDefs) {
    const tid = id("t_");
    const lid = listId[t.list];
    const date = t.offset == null ? null : toKey(addDays(today, t.offset));
    const order = (perListOrder[lid] = (perListOrder[lid] ?? -1) + 1);
    let dayOrder = 0;
    if (date) {
      dayOrder = perDayOrder[date] = (perDayOrder[date] ?? -1) + 1;
    }
    tasks[tid] = {
      id: tid,
      title: t.title,
      notes: t.notes ?? "",
      listId: lid,
      date,
      time: date ? (t.time ?? null) : null,
      completed: t.done ?? false,
      priority: t.priority ?? "none",
      order,
      dayOrder,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  return { lists, tasks };
}
