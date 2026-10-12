import { confirmAction } from "@/lib/dialog";
import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, ListOrdered, MoreHorizontal, Trash2 } from "lucide-react";
import { useBoard } from "@/lib/store";
import { COLOR_KEYS, type List, type Task } from "@/lib/types";
import { colorVars, COLOR_LABELS } from "@/lib/colors";
import { cn } from "@/lib/cn";
import { TaskComposer } from "@/components/TaskComposer";
import { Popover, MenuItem } from "@/components/ui/Popover";
import { SortableTaskCard } from "./SortableTaskCard";
import { toggleTaskWithRemark } from "@/lib/remarks";

export function ListColumn({
  list,
  tasks,
  canMoveLeft,
  canMoveRight,
  onMove,
  onOpenTask,
}: {
  list: List;
  tasks: Task[];
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMove: (dir: -1 | 1) => void;
  onOpenTask: (id: string) => void;
}) {
  const { addTask, renameList, setListColor, setListTaskOrder, archiveListTasks, restoreListTasks, removeList, tasks: allTasks } = useBoard();
  const { setNodeRef, isOver } = useDroppable({ id: `list:${list.id}`, data: { type: "list", listId: list.id } });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(list.name);

  const archivedCount = Object.values(allTasks).filter((task) => task.listId === list.id && task.archived).length;
  const totalCount = tasks.length + archivedCount;
  const remaining = tasks.filter((t) => !t.completed).length;
  const c = colorVars[list.color];

  return (
    <section className="flex w-[300px] shrink-0 flex-col">
      <header className="mb-2.5 flex items-center gap-2 px-1">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.solid }} />
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={`List name for ${list.name}`}
            onBlur={() => {
              renameList(list.id, name);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setName(list.name);
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 rounded-md bg-paper-sunken px-1.5 py-0.5 font-display text-[16px] font-medium text-ink outline-none"
          />
        ) : (
          <h2
            aria-label={list.name}
            className="min-w-0 flex-1 truncate font-display text-[16px] font-medium text-ink"
          >
            <button
              type="button"
              onClick={() => {
                setName(list.name);
                setEditing(true);
              }}
              className="ring-focus max-w-full cursor-text truncate rounded-md text-left decoration-line-strong underline-offset-4 transition-colors hover:text-accent-ink hover:underline"
              title="Click to rename"
              aria-label={`Rename ${list.name} list`}
            >
              {list.name}
            </button>
          </h2>
        )}
        <span className="font-mono text-[11px] tabular-nums text-ink-faint">{remaining}</span>
        <Popover
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              className="ring-focus grid h-7 w-7 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-paper-sunken hover:text-ink"
              aria-label="List options"
            >
              <MoreHorizontal className="h-[18px] w-[18px]" />
            </button>
          )}
        >
          {(close) => (
            <div>
              <div className="px-2 pb-1.5 pt-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
                Color
              </div>
              <div className="flex flex-wrap gap-1.5 px-2 pb-2">
                {COLOR_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    title={COLOR_LABELS[key]}
                    onClick={() => setListColor(list.id, key)}
                    className={cn(
                      "h-5 w-5 rounded-full ring-offset-2 ring-offset-paper-raised transition-transform hover:scale-110",
                      list.color === key && "ring-2 ring-ink/40",
                    )}
                    style={{ background: colorVars[key].solid }}
                  />
                ))}
              </div>
              <div className="my-1 h-px bg-line" />
              <MenuItem
                icon={<ListOrdered className="h-4 w-4" />}
                onClick={() => {
                  setListTaskOrder(list.id, "priority");
                  close();
                }}
              >
                <span className="flex-1">Sort by priority</span>
                <span className="font-mono text-[9px] uppercase text-ink-faint">
                  {list.taskOrder === "priority" ? "Default" : "Restore"}
                </span>
              </MenuItem>
              <div className="my-1 h-px bg-line" />
              <MenuItem
                icon={<ChevronLeft className="h-4 w-4" />}
                onClick={() => {
                  onMove(-1);
                  close();
                }}
              >
                <span className={cn(!canMoveLeft && "opacity-40")}>Move left</span>
              </MenuItem>
              <MenuItem
                icon={<ChevronRight className="h-4 w-4" />}
                onClick={() => {
                  onMove(1);
                  close();
                }}
              >
                <span className={cn(!canMoveRight && "opacity-40")}>Move right</span>
              </MenuItem>
              <div className="my-1 h-px bg-line" />
              <MenuItem
                icon={<Archive className="h-4 w-4" />}
                onClick={() => {
                  archiveListTasks(list.id);
                  close();
                }}
              >
                Archive completed items
              </MenuItem>
              {archivedCount > 0 && (
                <MenuItem
                  icon={<ArchiveRestore className="h-4 w-4" />}
                  onClick={() => {
                    restoreListTasks(list.id);
                    close();
                  }}
                >
                  Restore archived items ({archivedCount})
                </MenuItem>
              )}
              <MenuItem
                danger
                icon={<Trash2 className="h-4 w-4" />}
                onClick={async () => {
                  if (
                    totalCount === 0 ||
                    await confirmAction(`Delete "${list.name}" and its ${totalCount} task(s)?`)
                  ) {
                    removeList(list.id);
                  }
                  close();
                }}
              >
                Delete list
              </MenuItem>
            </div>
          )}
        </Popover>
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[60px] flex-1 flex-col gap-2 rounded-[16px] border p-2 transition-colors",
          isOver ? "border-accent/40 bg-accent-wash/40" : "border-line/70 bg-paper-sunken/40",
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              color={list.color}
              onToggle={(anchor) => toggleTaskWithRemark(task.id, anchor)}
              onOpen={() => onOpenTask(task.id)}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <p className="px-2 py-3 text-center text-[12.5px] text-ink-faint/70">
            {archivedCount > 0 ? "Archived items are hidden. Add a task below." : "Drop a task here, or add one below."}
          </p>
        )}

        <TaskComposer onAdd={(title) => addTask({ title, listId: list.id })} />
      </div>
    </section>
  );
}
