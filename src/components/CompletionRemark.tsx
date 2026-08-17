import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRemarks } from "@/lib/remarks";

const CHIT_WIDTH = 330;

function position(anchor: { x: number; y: number } | null) {
  if (typeof window === "undefined") return { left: 16, bottom: 24 };
  const width = Math.min(CHIT_WIDTH, window.innerWidth - 32);
  if (!anchor) return { left: (window.innerWidth - width) / 2, bottom: 24 };
  const left = Math.max(16, Math.min(anchor.x - width / 2, window.innerWidth - width - 16));
  return anchor.y < 180
    ? { left, top: anchor.y + 28 }
    : { left, bottom: Math.max(16, window.innerHeight - anchor.y + 12) };
}

/** A tactile, accessible paper remark that belongs to the task just completed. */
export function CompletionRemark() {
  const notice = useRemarks((state) => state.notice);
  const dismiss = useRemarks((state) => state.dismiss);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(dismiss, 3_600);
    return () => window.clearTimeout(timeout);
  }, [dismiss, notice]);

  const placement = position(notice?.anchor ?? null);

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]" aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="wait">
        {notice && (
          <motion.div
            key={notice.id}
            role="status"
            aria-label={`${notice.text}${notice.taskTitle ? ` Completed: ${notice.taskTitle}.` : ""}`}
            className="completion-chit pointer-events-auto fixed w-[min(330px,calc(100vw-32px))] px-5 pb-4 pt-3.5 text-left shadow-[var(--shadow-lg)]"
            style={{ ...placement, rotate: `${notice.rotation}deg` }}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96, rotate: notice.rotation - 1.5 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: notice.rotation }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.98, rotate: notice.rotation + 1 }}
            transition={reduceMotion ? { duration: 0.12 } : { type: "spring", stiffness: 420, damping: 31 }}
          >
            <button
              type="button"
              onClick={dismiss}
              className="ring-focus absolute right-2.5 top-2 grid h-5 w-5 place-items-center rounded-full font-mono text-[13px] text-ink-faint transition-colors hover:bg-paper-sunken hover:text-ink"
              aria-label="Dismiss remark"
            >
              ×
            </button>
            <span className="mb-1.5 flex items-center gap-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
              <span className="inline-block h-1.5 w-1.5 rotate-45 bg-accent" aria-hidden />
              {notice.mode === "snark" ? "ScheduGrr remarks" : "ScheduGrr cheers"}
            </span>
            <span className="block font-display text-[16px] font-medium leading-snug text-ink">
              {notice.text}
            </span>
            {notice.taskTitle && (
              <span className="mt-2 block truncate font-mono text-[9.5px] text-ink-faint">
                ✓ {notice.taskTitle}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
