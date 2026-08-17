import { forwardRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { ColorKey, Task } from "@/lib/types";
import { colorVars } from "@/lib/colors";
import { displayTime } from "@/lib/date";
import { cn } from "@/lib/cn";
import { Checkbox } from "@/components/Checkbox";

interface ChipProps {
  task: Task;
  color: ColorKey;
  onToggle: (anchor: { x: number; y: number }) => void;
  onOpen: () => void;
  dragging?: boolean;
  overlay?: boolean;
  handleProps?: React.HTMLAttributes<HTMLElement>;
  style?: React.CSSProperties;
}

/** A compact scheduled-task chip shown inside a calendar day. */
export const Chip = forwardRef<HTMLDivElement, ChipProps>(function Chip(
  { task, color, onToggle, onOpen, dragging, overlay, handleProps, style },
  ref,
) {
  const c = colorVars[color];
  return (
    <div
      ref={ref}
      style={{ ...style, background: overlay ? "var(--paper-raised)" : c.wash }}
      className={cn(
        "group flex items-center gap-1.5 rounded-[8px] border px-1.5 py-0.5 text-left",
        "border-black/[0.04]",
        dragging && "opacity-30",
        overlay && "cursor-grabbing rotate-[2deg] shadow-[var(--shadow-drag)]",
      )}
    >
      <span
        className="h-4 w-[3px] shrink-0 rounded-full"
        style={{ background: c.solid }}
        aria-hidden
      />
      <Checkbox checked={task.completed} onChange={onToggle} color={c.solid} />
      <button
        type="button"
        onClick={onOpen}
        {...handleProps}
        className="ring-focus todo-title todo-title-chip min-w-0 flex-1 cursor-grab truncate leading-tight text-ink active:cursor-grabbing"
      >
        {task.time && (
          <span className="mr-1 font-mono text-[9.5px] font-medium uppercase tracking-tight text-ink-faint">
            {displayTime(task.time)}
          </span>
        )}
        <span className={cn(task.completed && "text-ink-faint line-through decoration-ink-faint/50")}>
          {task.title || "Untitled"}
        </span>
      </button>
    </div>
  );
});

/** Draggable wrapper used inside day cells and the unscheduled tray. */
export function DraggableChip(props: {
  task: Task;
  color: ColorKey;
  onToggle: (anchor: { x: number; y: number }) => void;
  onOpen: () => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: props.task.id,
    data: { type: "task" },
  });
  return (
    <Chip
      ref={setNodeRef}
      {...props}
      dragging={isDragging}
      handleProps={{ ...attributes, ...listeners }}
    />
  );
}
