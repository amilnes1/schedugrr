import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { useBoard, selectSortedLists, selectTasksForDay } from "@/lib/store";
import { monthGrid, shiftMonth, toKey, WEEKDAY_LABELS } from "@/lib/date";
import { Chip } from "./Chip";
import { DayCell } from "./DayCell";
import { UnscheduledTray } from "./UnscheduledTray";

export function CalendarView({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const lists = useBoard((s) => s.lists);
  const tasks = useBoard((s) => s.tasks);

  const [anchor, setAnchor] = useState(() => new Date());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [direction, setDirection] = useState(0);

  const days = useMemo(() => monthGrid(anchor), [anchor]);
  const sortedLists = useMemo(() => selectSortedLists({ lists }), [lists]);
  const defaultListId = sortedLists[0]?.id ?? null;
  const tasksByDay = useMemo(() => {
    const map: Record<string, ReturnType<typeof selectTasksForDay>> = {};
    for (const d of days) {
      const key = toKey(d);
      map[key] = selectTasksForDay({ tasks }, key);
    }
    return map;
  }, [days, tasks]);

  const activeTask = activeId ? tasks[activeId] : null;
  const activeColor = activeTask ? lists[activeTask.listId]?.color ?? "ink" : "ink";

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const overId = String(over.id);
    const state = useBoard.getState();
    if (overId.startsWith("day:")) {
      state.moveTaskToDay(String(active.id), overId.slice(4));
    } else if (overId === "unscheduled") {
      state.unscheduleTask(String(active.id));
    }
  };

  const go = (delta: number) => {
    setDirection(delta);
    setAnchor((a) => shiftMonth(a, delta));
  };
  const goToday = () => {
    setDirection(0);
    setAnchor(new Date());
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex h-full flex-col gap-4 overflow-y-auto px-4 pb-6 sm:px-6 lg:flex-row lg:gap-6 lg:overflow-hidden lg:px-10 lg:pb-8">
        <div className="flex min-h-[800px] w-full min-w-0 flex-1 flex-col lg:min-h-0">
          {/* Month header */}
          <div className="mb-4 flex items-end justify-between">
            <div className="flex items-baseline gap-3">
              <h1 className="font-display text-[30px] font-semibold leading-none text-ink">
                {format(anchor, "MMMM")}
              </h1>
              <span className="font-mono text-[15px] text-ink-faint">{format(anchor, "yyyy")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={goToday}
                className="ring-focus rounded-full border border-line bg-paper-raised px-3.5 py-1.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-ink-faint hover:text-ink"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => go(-1)}
                className="ring-focus grid h-8 w-8 place-items-center rounded-full border border-line bg-paper-raised text-ink-soft transition-colors hover:border-ink-faint hover:text-ink"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-[18px] w-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                className="ring-focus grid h-8 w-8 place-items-center rounded-full border border-line bg-paper-raised text-ink-soft transition-colors hover:border-ink-faint hover:text-ink"
                aria-label="Next month"
              >
                <ChevronRight className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>

          <div className="no-scrollbar min-h-0 flex-1 overflow-x-auto">
            <div className="flex h-full min-w-[700px] flex-col lg:min-w-0">
              {/* Weekday labels */}
              <div className="grid grid-cols-7 overflow-hidden rounded-t-[14px] border-l border-t border-line bg-paper-raised/60">
                {WEEKDAY_LABELS.map((d) => (
                  <div
                    key={d}
                    className="border-b border-r border-line px-2 py-2 font-mono text-[10.5px] font-medium uppercase tracking-wider text-ink-faint"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Day grid */}
              <div className="relative flex-1 overflow-hidden rounded-b-[14px] border-l border-line">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={toKey(anchor).slice(0, 7)}
                    initial={{ opacity: 0, x: direction * 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: direction * -24 }}
                    transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                    className="grid h-full grid-cols-7 [grid-auto-rows:1fr]"
                  >
                    {days.map((date) => {
                      const key = toKey(date);
                      return (
                        <DayCell
                          key={key}
                          date={date}
                          monthAnchor={anchor}
                          tasks={tasksByDay[key] ?? []}
                          listsById={lists}
                          defaultListId={defaultListId}
                          onOpenTask={onOpenTask}
                        />
                      );
                    })}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        <UnscheduledTray listsById={lists} onOpenTask={onOpenTask} />
      </div>

      <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {activeTask ? (
          <div className="w-[210px]">
            <Chip task={activeTask} color={activeColor} onToggle={() => {}} onOpen={() => {}} overlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
