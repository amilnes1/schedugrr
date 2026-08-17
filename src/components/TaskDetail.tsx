import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Clock3, Trash2, X } from "lucide-react";
import { addDays, nextSaturday } from "date-fns";
import { useBoard, selectSortedLists } from "@/lib/store";
import { COLOR_KEYS, type Priority } from "@/lib/types";
import { colorVars } from "@/lib/colors";
import { toKey, relativeLabel, format } from "@/lib/date";
import { cn } from "@/lib/cn";
import { Checkbox } from "./Checkbox";
import { toggleTaskWithRemark } from "@/lib/remarks";

const PRIORITIES: { key: Priority; label: string }[] = [
  { key: "none", label: "None" },
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
];

export function TaskDetail({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {taskId && <TaskDetailPanel key={taskId} taskId={taskId} onClose={onClose} />}
    </AnimatePresence>
  );
}

function TaskDetailPanel({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const task = useBoard((s) => s.tasks[taskId]);
  const lists = useBoard((s) => s.lists);
  const { updateTask, removeTask, moveTaskToList, moveTaskToDay, unscheduleTask } =
    useBoard();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!task) return null;
  const sortedLists = selectSortedLists({ lists });
  const color = lists[task.listId]?.color ?? "ink";
  const c = colorVars[color];

  const setDate = (key: string | null) => {
    if (key) moveTaskToDay(task.id, key);
    else unscheduleTask(task.id);
  };

  const quickDates: { label: string; key: string }[] = [
    { label: "Today", key: toKey(new Date()) },
    { label: "Tomorrow", key: toKey(addDays(new Date(), 1)) },
    { label: "Weekend", key: toKey(nextSaturday(new Date())) },
  ];

  return (
    <>
      <motion.div
        className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-label="Task details"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-line bg-paper shadow-[var(--shadow-lg)]"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <span
            className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider"
            style={{ color: c.solid }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: c.solid }} />
            {lists[task.listId]?.name ?? "Task"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ring-focus grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-paper-sunken hover:text-ink"
            aria-label="Close"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* Title + complete */}
          <div className="flex items-start gap-3">
            <div className="pt-1">
              <Checkbox checked={task.completed} onChange={(anchor) => toggleTaskWithRemark(task.id, anchor)} color={c.solid} />
            </div>
            <textarea
              value={task.title}
              onChange={(e) => updateTask(task.id, { title: e.target.value })}
              rows={1}
              placeholder="Task title"
              className={cn(
                "todo-title todo-title-detail w-full resize-none bg-transparent leading-tight text-ink outline-none placeholder:text-ink-faint/60",
                task.completed && "text-ink-faint line-through decoration-ink-faint/50",
              )}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
            />
          </div>

          {/* Schedule */}
          <Field label="Schedule">
            <div className="flex flex-wrap gap-1.5">
              {quickDates.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => setDate(q.key)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12.5px] transition-colors",
                    task.date === q.key
                      ? "border-transparent bg-accent text-paper-raised"
                      : "border-line bg-paper-raised text-ink-soft hover:border-ink-faint",
                  )}
                >
                  {q.label}
                </button>
              ))}
              {task.date && (
                <button
                  type="button"
                  onClick={() => setDate(null)}
                  className="rounded-full border border-line bg-paper-raised px-3 py-1.5 text-[12.5px] text-ink-faint transition-colors hover:border-ink-faint hover:text-ink"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_140px] gap-2">
              <div className="flex items-center gap-2.5 rounded-[10px] border border-line bg-paper-raised px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const input = dateInputRef.current;
                    if (!input) return;
                    if (typeof input.showPicker === "function") input.showPicker();
                    else input.focus();
                  }}
                  className="ring-focus shrink-0 rounded-md text-ink-faint transition-colors hover:text-ink"
                  aria-label="Open date picker"
                >
                  <CalendarDays className="h-[18px] w-[18px]" strokeWidth={2} />
                </button>
                <input
                  ref={dateInputRef}
                  type="date"
                  value={task.date ?? ""}
                  onChange={(e) => setDate(e.target.value || null)}
                  aria-label="Task date"
                  className="native-picker-hidden min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none"
                />
                {task.date && (
                  <span className="hidden shrink-0 font-mono text-[11px] text-ink-faint xl:inline">
                    {relativeLabel(task.date)}
                  </span>
                )}
              </div>
              <div
                className={cn(
                  "flex items-center gap-2 rounded-[10px] border border-line bg-paper-raised px-3 py-2.5",
                  !task.date && "opacity-45",
                )}
              >
                <button
                  type="button"
                  disabled={!task.date}
                  onClick={() => {
                    const input = timeInputRef.current;
                    if (!input) return;
                    if (typeof input.showPicker === "function") input.showPicker();
                    else input.focus();
                  }}
                  className="ring-focus shrink-0 rounded-md text-ink-faint transition-colors hover:text-ink disabled:cursor-not-allowed"
                  aria-label="Open time picker"
                >
                  <Clock3 className="h-[17px] w-[17px]" strokeWidth={2} />
                </button>
                <input
                  ref={timeInputRef}
                  type="time"
                  value={task.time ?? ""}
                  disabled={!task.date}
                  onInput={(e) => updateTask(task.id, { time: e.currentTarget.value || null })}
                  aria-label="Task time"
                  className="native-picker-hidden min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </Field>

          {/* List */}
          <Field label="List">
            <div className="flex flex-wrap gap-1.5">
              {sortedLists.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => moveTaskToList(task.id, l.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors",
                    task.listId === l.id
                      ? "border-ink/25 bg-paper-sunken text-ink"
                      : "border-line bg-paper-raised text-ink-soft hover:border-ink-faint",
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: colorVars[l.color].solid }} />
                  {l.name}
                </button>
              ))}
            </div>
          </Field>

          {/* Priority */}
          <Field label="Priority">
            <div className="inline-flex rounded-[10px] border border-line bg-paper-raised p-1">
              {PRIORITIES.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => updateTask(task.id, { priority: p.key })}
                  className={cn(
                    "rounded-[7px] px-3 py-1.5 text-[12.5px] transition-colors",
                    task.priority === p.key
                      ? "bg-ink text-paper-raised"
                      : "text-ink-soft hover:text-ink",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Field>

          {/* Notes */}
          <Field label="Notes">
            <textarea
              value={task.notes}
              onChange={(e) => updateTask(task.id, { notes: e.target.value })}
              rows={5}
              placeholder="Add details, links, or context…"
              className="w-full resize-y rounded-[10px] border border-line bg-paper-raised px-3 py-2.5 text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-ink-faint/60 focus:border-ink-faint"
            />
          </Field>

          {/* Color quick set */}
          <Field label="Card color">
            <div className="flex gap-1.5">
              {COLOR_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => useBoard.getState().setListColor(task.listId, key)}
                  className={cn(
                    "h-6 w-6 rounded-full ring-offset-2 ring-offset-paper transition-transform hover:scale-110",
                    color === key && "ring-2 ring-ink/40",
                  )}
                  style={{ background: colorVars[key].solid }}
                  title={`Recolor "${lists[task.listId]?.name}"`}
                />
              ))}
            </div>
          </Field>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-line px-5 py-3.5">
          <span className="font-mono text-[11px] text-ink-faint">
            Created {format(new Date(task.createdAt), "d MMM")}
          </span>
          <button
            type="button"
            onClick={() => {
              removeTask(task.id);
              onClose();
            }}
            className="ring-focus flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] text-accent-ink transition-colors hover:bg-accent-wash"
          >
            <Trash2 className="h-4 w-4" strokeWidth={2} />
            Delete task
          </button>
        </div>
      </motion.div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
          {label}
        </span>
        <span className="rule-dotted h-[7px] flex-1 text-line-strong" />
      </div>
      {children}
    </div>
  );
}
