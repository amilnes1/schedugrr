import { forwardRef } from "react";
import { CalendarDays, Clock3, StickyNote } from "lucide-react";
import type { Task, ColorKey } from "@/lib/types";
import { colorVars } from "@/lib/colors";
import { displayTime, relativeLabel } from "@/lib/date";
import { cn } from "@/lib/cn";
import { Checkbox } from "./Checkbox";
import { PriorityMark } from "./PriorityMark";

interface TaskCardProps {
  task: Task;
  color: ColorKey;
  onToggle: (anchor: { x: number; y: number }) => void;
  onOpen: () => void;
  /** Show the scheduled-date badge (used on the Board, hidden on the Calendar). */
  showDate?: boolean;
  dragging?: boolean;
  overlay?: boolean;
  handleProps?: React.HTMLAttributes<HTMLElement>;
  style?: React.CSSProperties;
}

/**
 * The canonical task card, shared by the Board and the drag overlay.
 * Presentational only — all state changes flow through the passed callbacks.
 */
export const TaskCard = forwardRef<HTMLDivElement, TaskCardProps>(function TaskCard(
  { task, color, onToggle, onOpen, showDate = true, dragging, overlay, handleProps, style },
  ref,
) {
  const c = colorVars[color];
  return (
    <div
      ref={ref}
      style={style}
      className={cn(
        "group relative rounded-[12px] border bg-paper-raised px-3 py-2.5 text-left transition-shadow",
        "border-line card-shadow",
        dragging && "opacity-40",
        overlay && "cursor-grabbing shadow-[var(--shadow-drag)] rotate-[1.5deg]",
        !overlay && "hover:shadow-[var(--shadow-md)]",
      )}
    >
      {/* Left color spine */}
      <span
        className="absolute inset-y-2 left-0 w-[3px] rounded-full opacity-70"
        style={{ background: c.solid }}
        aria-hidden
      />
      <div className="flex items-start gap-2.5 pl-1.5">
        <div className="pt-[1px]">
          <Checkbox checked={task.completed} onChange={onToggle} color={c.solid} />
        </div>

        <button
          type="button"
          onClick={onOpen}
          {...handleProps}
          className="ring-focus min-w-0 flex-1 cursor-grab rounded-md text-left active:cursor-grabbing"
        >
          <p
            className={cn(
              "todo-title leading-snug text-ink transition-colors",
              task.completed && "text-ink-faint line-through decoration-ink-faint/60",
            )}
          >
            {task.title || "Untitled task"}
          </p>

          {(task.priority !== "none" || task.notes || (showDate && task.date)) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-ink-faint">
              <PriorityMark priority={task.priority} />
              {task.notes && (
                <span className="inline-flex items-center gap-1 text-[11px]">
                  <StickyNote className="h-3 w-3" strokeWidth={2} />
                </span>
              )}
              {showDate && task.date && (
                <span className="inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-wide">
                  <CalendarDays className="h-3 w-3" strokeWidth={2} />
                  {relativeLabel(task.date)}
                </span>
              )}
              {showDate && task.date && task.time && (
                <span className="inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-wide">
                  <Clock3 className="h-3 w-3" strokeWidth={2} />
                  {displayTime(task.time)}
                </span>
              )}
            </div>
          )}
        </button>
      </div>
    </div>
  );
});
