import type { List, Task } from "./types";

interface DocumentFile {
  app: "openagenda" | "openboard";
  version: 1;
  exportedAt: string;
  lists: Record<string, List>;
  tasks: Record<string, Task>;
}

/** Serialize the board to a downloadable JSON file. */
export function exportDocument(lists: Record<string, List>, tasks: Record<string, Task>) {
  const doc: DocumentFile = {
    app: "openagenda",
    version: 1,
    exportedAt: new Date().toISOString(),
    lists,
    tasks,
  };
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `openagenda-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse and lightly validate an imported document. Throws on malformed input. */
export function parseDocument(text: string): { lists: Record<string, List>; tasks: Record<string, Task> } {
  const data = JSON.parse(text) as Partial<DocumentFile>;
  if (!data || typeof data !== "object" || !data.lists || !data.tasks) {
    throw new Error("Not a valid OpenAgenda file.");
  }
  const tasks = Object.fromEntries(
    Object.entries(data.tasks).map(([id, task]) => [id, { ...task, time: task.time ?? null }]),
  );
  const lists = Object.fromEntries(
    Object.entries(data.lists).map(([id, list]) => [
      id,
      { ...list, taskOrder: list.taskOrder ?? "priority" },
    ]),
  );
  return { lists, tasks };
}
