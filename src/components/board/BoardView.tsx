import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useBoard, selectSortedLists, selectTasksForList } from "@/lib/store";
import type { StoreSnapshot } from "@/lib/store";
import { TaskCard } from "@/components/TaskCard";
import { ListColumn } from "./ListColumn";
import { DayScheduleRail, scheduleDateFromDropId } from "./DayScheduleRail";

type Target =
  | { type: "list"; listId: string; index: number }
  | { type: "schedule"; date: string };

const boardCollisionDetection: CollisionDetection = (args) => {
  const scheduleContainers = args.droppableContainers.filter(({ id }) =>
    scheduleDateFromDropId(String(id)),
  );
  const scheduleArgs = { ...args, droppableContainers: scheduleContainers };
  const scheduleCollision = pointerWithin(scheduleArgs)[0] ?? rectIntersection(scheduleArgs)[0];
  return scheduleCollision ? [scheduleCollision] : closestCorners(args);
};

/** Resolve which list + index a drag is currently over. */
function resolveTarget(state: StoreSnapshot, overId: string): Target | null {
  const scheduleDate = scheduleDateFromDropId(overId);
  if (scheduleDate) return { type: "schedule", date: scheduleDate };

  if (overId.startsWith("list:")) {
    const listId = overId.slice(5);
    if (!state.lists[listId]) return null;
    return { type: "list", listId, index: selectTasksForList(state, listId).length };
  }
  const task = state.tasks[overId];
  if (!task) return null;
  const ids = selectTasksForList(state, task.listId).map((t) => t.id);
  return { type: "list", listId: task.listId, index: Math.max(0, ids.indexOf(overId)) };
}

export function commitBoardDrop(state: StoreSnapshot, taskId: string, overId: string) {
  const target = resolveTarget(state, overId);
  if (!target) return;
  if (target.type === "schedule") {
    state.moveTaskToDay(taskId, target.date);
    return;
  }
  state.moveTaskToList(taskId, target.listId, target.index);
}

export function BoardView({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const lists = useBoard((s) => s.lists);
  const tasks = useBoard((s) => s.tasks);
  const reorderLists = useBoard((s) => s.reorderLists);
  const addList = useBoard((s) => s.addList);

  const sortedLists = useMemo(() => selectSortedLists({ lists }), [lists]);
  const tasksByList = useMemo(() => {
    const map: Record<string, ReturnType<typeof selectTasksForList>> = {};
    for (const l of sortedLists) map[l.id] = selectTasksForList({ tasks, lists }, l.id);
    return map;
  }, [lists, sortedLists, tasks]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTask = activeId ? tasks[activeId] : null;
  const activeColor = activeTask ? lists[activeTask.listId]?.color ?? "ink" : "ink";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const state = useBoard.getState();
    commitBoardDrop(state, String(active.id), String(over.id));
  };

  const moveList = (index: number, dir: -1 | 1) => {
    const ids = sortedLists.map((l) => l.id);
    const next = index + dir;
    if (next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next], ids[index]];
    reorderLists(ids);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={boardCollisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex h-full min-w-0 gap-5 px-6 pb-8 pt-2 lg:px-10">
        <DayScheduleRail onOpenTask={onOpenTask} draggingTaskId={activeId} />

        <div className="no-scrollbar flex min-w-0 flex-1 items-start gap-5 overflow-x-auto">
          {sortedLists.map((list, i) => (
            <ListColumn
              key={list.id}
              list={list}
              tasks={tasksByList[list.id] ?? []}
              canMoveLeft={i > 0}
              canMoveRight={i < sortedLists.length - 1}
              onMove={(dir) => moveList(i, dir)}
              onOpenTask={onOpenTask}
            />
          ))}

          <AddListColumn onAdd={(name) => addList(name)} />
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {activeTask ? (
          <TaskCard
            task={activeTask}
            color={activeColor}
            onToggle={() => {}}
            onOpen={() => {}}
            overlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function AddListColumn({ onAdd }: { onAdd: (name: string) => void }) {
  const [active, setActive] = useState(false);
  const [name, setName] = useState("");

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="ring-focus mt-[2px] flex w-[220px] shrink-0 items-center gap-2 rounded-[16px] border border-dashed border-line-strong px-4 py-3 text-[13.5px] text-ink-faint transition-colors hover:border-ink-faint hover:text-ink"
      >
        <Plus className="h-4 w-4" strokeWidth={2.4} />
        New list
      </button>
    );
  }

  const commit = () => {
    if (name.trim()) onAdd(name.trim());
    setName("");
    setActive(false);
  };

  return (
    <div className="w-[300px] shrink-0">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setName("");
            setActive(false);
          }
        }}
        placeholder="List name…"
        className="w-full rounded-[14px] border border-line bg-paper-raised px-3.5 py-3 font-display text-[16px] text-ink shadow-[var(--shadow-sm)] outline-none placeholder:text-ink-faint/70"
      />
    </div>
  );
}
