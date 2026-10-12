import { useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, format } from "date-fns";
import { useBoard, selectTasksForDay } from "@/lib/store";
import { displayTime, fromKey, relativeLabel, toKey, todayKey } from "@/lib/date";
import { colorVars } from "@/lib/colors";
import { cn } from "@/lib/cn";
import { Checkbox } from "@/components/Checkbox";
import { PriorityMark } from "@/components/PriorityMark";
import { toggleTaskWithRemark } from "@/lib/remarks";

const SCHEDULE_DROP_PREFIX = "schedule:";

export function scheduleDropId(date: string) {
  return `${SCHEDULE_DROP_PREFIX}${date}`;
}

export function scheduleDateFromDropId(id: string) {
  return id.startsWith(SCHEDULE_DROP_PREFIX) ? id.slice(SCHEDULE_DROP_PREFIX.length) : null;
}

export function DayScheduleRail({
  onOpenTask,
  draggingTaskId,
}: {
  onOpenTask: (id: string) => void;
  draggingTaskId: string | null;
}) {
  const lists = useBoard((state) => state.lists);
  const tasks = useBoard((state) => state.tasks);
  const [date, setDate] = useState(todayKey);

  const scheduled = useMemo(() => selectTasksForDay({ tasks }, date), [date, tasks]);
  const parsedDate = fromKey(date);
  const relative = relativeLabel(date);
  const dropHelpId = `schedule-drop-help-${date}`;
  const { setNodeRef, isOver } = useDroppable({
    id: scheduleDropId(date),
    data: { type: "schedule", date },
  });

  const moveDay = (amount: number) => setDate(toKey(addDays(parsedDate, amount)));

  return (
    <aside
      ref={setNodeRef}
      aria-label={`${relative} schedule`}
      aria-describedby={dropHelpId}
      className={cn(
        "flex w-[244px] shrink-0 flex-col overflow-hidden rounded-[18px] border bg-paper-raised/75 shadow-[var(--shadow-sm)] transition-[border-color,background-color,box-shadow] duration-150",
        isOver
          ? "border-accent/70 bg-accent-wash/35 shadow-[var(--shadow-md)]"
          : "border-line/80",
      )}
    >
      <div className="border-b border-line px-3.5 pb-3 pt-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.13em] text-ink-faint">
              Day schedule
            </p>
            <h2 className="mt-0.5 truncate font-display text-[19px] font-medium text-ink">
              {relative}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => moveDay(-1)}
              className="ring-focus grid h-7 w-7 place-items-center rounded-full border border-line bg-paper text-ink-faint transition-colors hover:border-ink-faint hover:text-ink"
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => moveDay(1)}
              className="ring-focus grid h-7 w-7 place-items-center rounded-full border border-line bg-paper text-ink-faint transition-colors hover:border-ink-faint hover:text-ink"
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="font-mono text-[10.5px] uppercase tracking-wide text-ink-faint">
            {format(parsedDate, "EEE, d MMM")}
          </span>
          {date !== todayKey() && (
            <button
              type="button"
              onClick={() => setDate(todayKey())}
              className="ring-focus rounded-full px-2 py-0.5 text-[10.5px] font-medium text-accent-ink hover:bg-accent-wash"
            >
              Today
            </button>
          )}
        </div>
      </div>

      <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2.5">
        {scheduled.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
            <span className="mb-3 block h-px w-10 bg-line-strong" aria-hidden />
            <p className="font-display text-[14px] text-ink-soft">A clear day.</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">
              Drag a board card here to schedule it for {relative.toLowerCase()}.
            </p>
          </div>
        ) : (
          scheduled.map((task) => {
            const color = colorVars[lists[task.listId]?.color ?? "ink"];
            return (
              <article
                key={task.id}
                className="group relative rounded-[11px] border border-line/70 bg-paper px-2.5 py-2.5"
              >
                <span
                  className="absolute inset-y-2 left-0 w-[3px] rounded-full opacity-70"
                  style={{ background: color.solid }}
                  aria-hidden
                />
                <div className="flex items-start gap-2 pl-1">
                  <span className="w-[47px] shrink-0 pt-0.5 text-right font-mono text-[9px] uppercase tabular-nums text-ink-faint">
                    {task.time ? displayTime(task.time) : "Anytime"}
                  </span>
                  <div className="pt-px">
                    <Checkbox
                      checked={task.completed}
                      onChange={(anchor) => toggleTaskWithRemark(task.id, anchor)}
                      color={color.solid}
                      className="h-[17px] w-[17px] rounded-[5px]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    className="ring-focus min-w-0 flex-1 rounded-md text-left"
                  >
                    <span
                      className={cn(
                        "todo-title todo-title-rail block leading-snug text-ink",
                        task.completed && "text-ink-faint line-through decoration-ink-faint/50",
                      )}
                    >
                      {task.title || "Untitled task"}
                    </span>
                    {(task.priority !== "none" || lists[task.listId]) && (
                      <span className="mt-1.5 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-wide text-ink-faint">
                        <PriorityMark priority={task.priority} />
                        <span className="truncate">{lists[task.listId]?.name}</span>
                      </span>
                    )}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      <div
        className={cn(
          "border-t border-line px-3.5 py-2.5 font-mono text-[10px] transition-colors",
          draggingTaskId && isOver
            ? "bg-accent-wash/70 font-medium text-accent-ink"
            : "text-ink-faint",
        )}
      >
        <span id={dropHelpId}>
          {draggingTaskId
            ? isOver
              ? `Release to schedule for ${relative}`
              : `Drop here to schedule for ${relative}`
            : `${scheduled.length} ${scheduled.length === 1 ? "task" : "tasks"} scheduled`}
        </span>
      </div>
    </aside>
  );
}
