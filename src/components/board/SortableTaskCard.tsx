import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ColorKey, Task } from "@/lib/types";
import { TaskCard } from "@/components/TaskCard";

export function SortableTaskCard({
  task,
  color,
  onToggle,
  onOpen,
}: {
  task: Task;
  color: ColorKey;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task", listId: task.listId },
  });

  return (
    <TaskCard
      ref={setNodeRef}
      task={task}
      color={color}
      onToggle={onToggle}
      onOpen={onOpen}
      dragging={isDragging}
      handleProps={{ ...attributes, ...listeners }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    />
  );
}
