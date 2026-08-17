import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";

/** Inline "add a task" input. Enter commits and keeps focus for rapid entry. */
export function TaskComposer({
  onAdd,
  placeholder = "Add a task…",
  className,
}: {
  onAdd: (title: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

  const commit = () => {
    const title = value.trim();
    if (!title) return;
    onAdd(title);
    setValue("");
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[11px] border border-dashed px-2.5 py-2 transition-colors",
        focused ? "border-accent/60 bg-paper-raised" : "border-line-strong/70 hover:border-ink-faint/60",
        className,
      )}
    >
      <Plus
        className={cn("h-4 w-4 shrink-0 transition-colors", focused ? "text-accent" : "text-ink-faint")}
        strokeWidth={2.4}
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setValue("");
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder={placeholder}
        className="w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-faint/80"
      />
    </div>
  );
}
