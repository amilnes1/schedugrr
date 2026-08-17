import { useDroppable } from "@dnd-kit/core";
import { useShallow } from "zustand/react/shallow";
import { Inbox } from "lucide-react";
import { useBoard, selectUnscheduled } from "@/lib/store";
import type { List } from "@/lib/types";
import { cn } from "@/lib/cn";
import { DraggableChip } from "./Chip";

export function UnscheduledTray({
  listsById,
  onOpenTask,
}: {
  listsById: Record<string, List>;
  onOpenTask: (id: string) => void;
}) {
  const tasks = useBoard(useShallow(selectUnscheduled));
  const toggleTask = useBoard((s) => s.toggleTask);
  const { setNodeRef, isOver } = useDroppable({ id: "unscheduled", data: { type: "unscheduled" } });

  return (
    <aside className="flex w-full shrink-0 flex-col lg:w-[248px]">
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <Inbox className="h-4 w-4 text-ink-faint" strokeWidth={2} />
        <h2 className="font-display text-[15px] font-medium text-ink">Unscheduled</h2>
        <span className="font-mono text-[11px] tabular-nums text-ink-faint">{tasks.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "no-scrollbar flex max-h-[260px] min-h-[120px] flex-col gap-1.5 overflow-y-auto rounded-[16px] border p-2 transition-colors lg:max-h-none lg:min-h-0 lg:flex-1",
          isOver ? "border-accent/50 bg-accent-wash/50" : "border-line/70 bg-paper-sunken/40",
        )}
      >
        {tasks.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-8 text-center">
            <p className="text-[12.5px] text-ink-faint">Nothing waiting.</p>
            <p className="text-[11.5px] text-ink-faint/70">
              Drag a task here to pull it off the calendar.
            </p>
          </div>
        ) : (
          tasks.map((task) => (
            <DraggableChip
              key={task.id}
              task={task}
              color={listsById[task.listId]?.color ?? "ink"}
              onToggle={() => toggleTask(task.id)}
              onOpen={() => onOpenTask(task.id)}
            />
          ))
        )}
      </div>

      <p className="mt-2.5 px-1 text-[11.5px] leading-relaxed text-ink-faint/80">
        Drag any task onto a day to schedule it — or between days to reschedule.
      </p>
    </aside>
  );
}
