import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

/** A tactile, hand-inked checkbox with a spring-drawn tick. */
export function Checkbox({
  checked,
  onChange,
  color = "var(--accent)",
  className,
}: {
  checked: boolean;
  onChange: () => void;
  color?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        "ring-focus grid h-[19px] w-[19px] shrink-0 place-items-center rounded-[6px] border transition-colors",
        checked ? "border-transparent" : "border-line-strong hover:border-ink-faint",
        className,
      )}
      style={{ background: checked ? color : "transparent" }}
    >
      <motion.svg
        viewBox="0 0 24 24"
        className="h-[13px] w-[13px]"
        fill="none"
        stroke="var(--paper-raised)"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ opacity: checked ? 1 : 0, scale: checked ? 1 : 0.5 }}
        transition={{ type: "spring", stiffness: 500, damping: 24 }}
      >
        <motion.path d="M4 12.5 L10 18 L20 6" />
      </motion.svg>
    </button>
  );
}
