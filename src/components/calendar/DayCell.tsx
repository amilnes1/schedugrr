import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { format, isSameMonth } from "date-fns";
import { useBoard } from "@/lib/store";
import type { List, Task } from "@/lib/types";
import { toKey, isTodayKey } from "@/lib/date";
import { cn } from "@/lib/cn";
import { DraggableChip } from "./Chip";

export function DayCell({
  date,
  monthAnchor,
  tasks,
  listsById,
  defaultListId,
  onOpenTask,
}: {
  date: Date;
  monthAnchor: Date;
  tasks: Task[];
  listsById: Record<string, List>;
  defaultListId: string | null;
  onOpenTask: (id: string) => void;
}) {
  const key = toKey(date);
  const { setNodeRef, isOver } = useDroppable({ id: `day:${key}`, data: { type: "day", date: key } });
  const { addTask, toggleTask } = useBoard();
  const [composing, setComposing] = useState(false);
  const [value, setValue] = useState("");

  const inMonth = isSameMonth(date, monthAnchor);
  const today = isTodayKey(key);
  const dayNum = format(date, "d");
  const isFirst = dayNum === "1";

  const commit = () => {
    if (value.trim() && defaultListId) addTask({ title: value.trim(), listId: defaultListId, date: key });
    setValue("");
    setComposing(false);
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/cell relative flex min-h-[118px] flex-col gap-1 border-b border-r border-line p-1.5 transition-colors lg:min-h-0",
        !inMonth && "bg-paper-sunken/40",
        isOver && "z-10 bg-accent-wash/60 shadow-[inset_0_0_0_2px_var(--accent)]",
      )}
    >
      <div className="flex items-center justify-between px-0.5">
        <span
          className={cn(
            "grid h-[22px] min-w-[22px] place-items-center rounded-full px-1 font-mono text-[12px] tabular-nums transition-colors",
            today && "bg-accent font-semibold text-paper-raised",
            !today && inMonth && "text-ink-soft",
            !today && !inMonth && "text-ink-faint/60",
          )}
        >
          {isFirst && !today ? format(date, "MMM d") : dayNum}
        </span>
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="ring-focus grid h-5 w-5 place-items-center rounded-md text-ink-faint opacity-100 transition-opacity hover:bg-paper-sunken hover:text-ink focus-visible:opacity-100 lg:opacity-0 lg:group-hover/cell:opacity-100"
          aria-label={`Add task on ${format(date, "MMMM d")}`}
          title="Add task"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
        </button>
      </div>

      <div className="no-scrollbar flex max-h-[220px] flex-col gap-1 overflow-y-auto">
        {tasks.map((task) => (
          <DraggableChip
            key={task.id}
            task={task}
            color={listsById[task.listId]?.color ?? "ink"}
            onToggle={() => toggleTask(task.id)}
            onOpen={() => onOpenTask(task.id)}
          />
        ))}

        {composing && (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setValue("");
                setComposing(false);
              }
            }}
            placeholder="New task…"
            className="rounded-[8px] border border-accent/50 bg-paper-raised px-2 py-1 text-[12px] text-ink outline-none placeholder:text-ink-faint/70"
          />
        )}
      </div>
    </div>
  );
}
