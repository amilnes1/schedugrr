import type { Priority } from "@/lib/types";
import { cn } from "@/lib/cn";

const CONFIG: Record<Exclude<Priority, "none">, { color: string; label: string }> = {
  high: { color: "var(--accent)", label: "High priority" },
  medium: { color: "var(--gold)", label: "Medium priority" },
  low: { color: "var(--sky)", label: "Low priority" },
};

/** A small three-bar signal that fills according to priority. */
export function PriorityMark({ priority, className }: { priority: Priority; className?: string }) {
  if (priority === "none") return null;
  const { color, label } = CONFIG[priority];
  const filled = priority === "high" ? 3 : priority === "medium" ? 2 : 1;
  return (
    <span
      className={cn("inline-flex items-end gap-[2px]", className)}
      title={label}
      aria-label={label}
      role="img"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full transition-colors"
          style={{
            height: `${5 + i * 3}px`,
            background: i < filled ? color : "var(--line-strong)",
          }}
        />
      ))}
    </span>
  );
}
