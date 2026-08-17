import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  CalendarClock,
  Download,
  ChevronDown,
  LayoutGrid,
  Moon,
  MoreHorizontal,
  MessageSquareText,
  Palette,
  RotateCcw,
  Sun,
  Upload,
} from "lucide-react";
import { useBoard } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { exportDocument, parseDocument } from "@/lib/io";
import { cn } from "@/lib/cn";
import { useApiConnection } from "@/lib/api-sync";
import { Popover, MenuItem } from "./ui/Popover";
import { CalendarSyncPanel } from "./CalendarSyncPanel";
import { previewRemark } from "@/lib/remarks";

export function TopBar() {
  const view = useUI((s) => s.view);
  const setView = useUI((s) => s.setView);
  const theme = useUI((s) => s.theme);
  const toggleTheme = useUI((s) => s.toggleTheme);
  const fileRef = useRef<HTMLInputElement>(null);
  const [openPanel, setOpenPanel] = useState<"appearance" | "remarks" | "calendar" | null>(null);
  const apiStatus = useApiConnection((s) => s.status);

  const onImport = async (file: File) => {
    try {
      const doc = parseDocument(await file.text());
      useBoard.getState().replaceDocument(doc);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not import that file.");
    }
  };

  return (
    <header className="app-topbar flex items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-6 sm:py-4 lg:px-10">
      {/* Wordmark */}
      <div className="flex shrink-0 items-baseline gap-2.5">
        <div className="flex items-center gap-2">
          <BoardGlyph />
          <span className="hidden font-display text-[20px] font-semibold tracking-tight text-ink sm:inline">
            ScheduGrr
          </span>
        </div>
        <span className="hidden font-mono text-[11px] text-ink-faint xl:inline">plan by hand</span>
      </div>

      {/* View switch */}
      <div className="flex items-center gap-1 rounded-full border border-line bg-paper-raised p-1 shadow-[var(--shadow-sm)]">
        <ViewTab active={view === "calendar"} onClick={() => setView("calendar")} icon={<CalendarDays className="h-4 w-4" />} label="Calendar" />
        <ViewTab active={view === "board"} onClick={() => setView("board")} icon={<LayoutGrid className="h-4 w-4" />} label="Board" />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        <div className="group/llm relative mr-1 hidden lg:block">
          <span
            className={cn(
              "ring-focus flex items-center gap-1.5 rounded-full px-1.5 py-1 font-mono text-[10.5px]",
              apiStatus === "connected" ? "text-sage" : "text-ink-faint",
            )}
            tabIndex={0}
            aria-label="LLM friendly. LLMs can easily view and update tasks"
            aria-live="polite"
          >
            <QuestionCircleIcon />
            LLM friendly
          </span>
          <span
            role="tooltip"
            className="pointer-events-none absolute right-0 top-[calc(100%+8px)] z-50 w-[230px] translate-y-1 rounded-[10px] border border-line bg-paper-raised px-3 py-2 text-[11.5px] leading-relaxed text-ink-soft opacity-0 shadow-[var(--shadow-md)] transition-all group-hover/llm:translate-y-0 group-hover/llm:opacity-100 group-focus-within/llm:translate-y-0 group-focus-within/llm:opacity-100"
          >
            LLMs can easily view and update tasks
          </span>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className="ring-focus hidden h-9 w-9 place-items-center rounded-full border border-line bg-paper-raised text-ink-soft transition-colors hover:border-ink-faint hover:text-ink sm:grid"
          aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
        >
          {theme === "light" ? <Moon className="h-[17px] w-[17px]" /> : <Sun className="h-[17px] w-[17px]" />}
        </button>

        <Popover
          trigger={({ open, toggle }) => (
            <button
              type="button"
              onClick={toggle}
              className="ring-focus grid h-9 w-9 place-items-center rounded-full border border-line bg-paper-raised text-ink-soft transition-colors hover:border-ink-faint hover:text-ink"
              aria-label="More options"
              aria-expanded={open}
            >
              <MoreHorizontal className="h-[18px] w-[18px]" />
            </button>
          )}
          className={openPanel ? "max-h-[calc(100vh-78px)] w-[312px] overflow-y-auto" : undefined}
        >
          {(close) => (
            <div>
              <MenuItem
                icon={<Palette className="h-4 w-4" />}
                onClick={() => setOpenPanel((panel) => panel === "appearance" ? null : "appearance")}
              >
                <span className="flex-1">Appearance</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-ink-faint transition-transform",
                    openPanel === "appearance" && "rotate-180",
                  )}
                />
              </MenuItem>
              {openPanel === "appearance" && <AppearancePanel />}
              <MenuItem
                icon={<MessageSquareText className="h-4 w-4" />}
                onClick={() => setOpenPanel((panel) => panel === "remarks" ? null : "remarks")}
              >
                <span className="flex-1">Remarks</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-ink-faint transition-transform",
                    openPanel === "remarks" && "rotate-180",
                  )}
                />
              </MenuItem>
              {openPanel === "remarks" && <RemarksPanel />}
              <MenuItem
                icon={<CalendarClock className="h-4 w-4" />}
                onClick={() => setOpenPanel((panel) => panel === "calendar" ? null : "calendar")}
              >
                <span className="flex-1">Calendar sync</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-ink-faint transition-transform",
                    openPanel === "calendar" && "rotate-180",
                  )}
                />
              </MenuItem>
              {openPanel === "calendar" && <CalendarSyncPanel />}
              <div className="my-1 h-px bg-line" />
              <MenuItem
                icon={<Download className="h-4 w-4" />}
                onClick={() => {
                  const { lists, tasks } = useBoard.getState();
                  exportDocument(lists, tasks);
                  close();
                }}
              >
                Export as JSON
              </MenuItem>
              <MenuItem
                icon={<Upload className="h-4 w-4" />}
                onClick={() => {
                  fileRef.current?.click();
                  close();
                }}
              >
                Import JSON…
              </MenuItem>
              <div className="my-1 h-px bg-line" />
              <MenuItem
                icon={<RotateCcw className="h-4 w-4" />}
                onClick={() => {
                  if (confirm("Replace everything with the sample board?")) {
                    useBoard.getState().resetToSeed();
                  }
                  close();
                }}
              >
                Reset to sample
              </MenuItem>
            </div>
          )}
        </Popover>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImport(file);
            e.target.value = "";
          }}
        />
      </div>
    </header>
  );
}

function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "ring-focus relative flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12.5px] font-medium transition-colors sm:px-3.5 sm:text-[13px]",
        active ? "text-paper-raised" : "text-ink-soft hover:text-ink",
      )}
    >
      {active && (
        <motion.span
          layoutId="viewPill"
          className="absolute inset-0 rounded-full bg-ink"
          style={{ zIndex: 0 }}
          transition={{ type: "spring", stiffness: 480, damping: 38 }}
          aria-hidden
        />
      )}
      <span className="relative z-[1] flex items-center gap-1.5">
        {icon}
        {label}
      </span>
    </button>
  );
}

function BoardGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" className="shrink-0" aria-hidden>
      <rect width="32" height="32" rx="7" fill="var(--ink)" />
      <rect x="6" y="7" width="20" height="3.2" rx="1.6" fill="var(--paper-raised)" />
      <rect x="6" y="14.4" width="20" height="3.2" rx="1.6" fill="var(--accent)" />
      <rect x="6" y="21.8" width="13" height="3.2" rx="1.6" fill="var(--paper-raised)" />
    </svg>
  );
}

function QuestionCircleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden className="shrink-0">
      <circle cx="9" cy="9" r="7.15" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M6.9 6.75a2.2 2.2 0 0 1 4.23.85c0 1.55-1.42 1.85-1.93 2.75"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
      />
      <circle cx="9" cy="13.05" r=".9" fill="currentColor" />
    </svg>
  );
}

function AppearancePanel() {
  const taskFont = useUI((s) => s.taskFont);
  const taskTextSize = useUI((s) => s.taskTextSize);
  const taskTextWeight = useUI((s) => s.taskTextWeight);
  const selectionTone = useUI((s) => s.selectionTone);
  const setTaskFont = useUI((s) => s.setTaskFont);
  const setTaskTextSize = useUI((s) => s.setTaskTextSize);
  const setTaskTextWeight = useUI((s) => s.setTaskTextWeight);
  const setSelectionTone = useUI((s) => s.setSelectionTone);

  return (
    <section
      aria-label="Appearance settings"
      className="mx-1 mb-1 mt-1.5 space-y-3 rounded-[10px] border border-line bg-paper-sunken/45 p-3"
    >
      <SegmentedSetting
        label="Task font"
        value={taskFont}
        options={[
          { value: "sans", label: "Sans" },
          { value: "serif", label: "Serif" },
        ]}
        onChange={setTaskFont}
      />
      <SegmentedSetting
        label="Text size"
        value={taskTextSize}
        options={[
          { value: "compact", label: "S" },
          { value: "standard", label: "M" },
          { value: "large", label: "L" },
        ]}
        onChange={setTaskTextSize}
      />
      <SegmentedSetting
        label="Weight"
        value={taskTextWeight}
        options={[
          { value: "regular", label: "Regular" },
          { value: "medium", label: "Medium" },
          { value: "strong", label: "Strong" },
        ]}
        onChange={setTaskTextWeight}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
          Selection
        </span>
        <div className="flex items-center gap-1.5" role="group" aria-label="Text selection color">
          {(
            [
              ["accent", "Vermilion", "var(--accent)"],
              ["sage", "Sage", "var(--sage)"],
              ["sky", "Sky", "var(--sky)"],
              ["plum", "Plum", "var(--plum)"],
            ] as const
          ).map(([tone, label, color]) => (
            <button
              key={tone}
              type="button"
              onClick={() => setSelectionTone(tone)}
              className={cn(
                "ring-focus grid h-6 w-6 place-items-center rounded-full border transition-transform hover:scale-110",
                selectionTone === tone ? "border-ink" : "border-transparent",
              )}
              aria-label={`${label} text selection`}
              aria-pressed={selectionTone === tone}
            >
              <span className="h-3.5 w-3.5 rounded-full" style={{ background: color }} />
            </button>
          ))}
        </div>
      </div>
      <p className="todo-title rounded-md bg-paper-raised px-2.5 py-2 text-ink shadow-[var(--shadow-sm)]">
        A thoughtfully weighted task
      </p>
    </section>
  );
}

const remarkDescriptions = {
  snark: "ScheduGrr will judge you (affectionately).",
  cheer: "ScheduGrr believes in you (sincerely).",
  hush: "ScheduGrr says nothing. It's fine. This is fine.",
} as const;

function RemarksPanel() {
  const remarkMode = useUI((state) => state.remarkMode);
  const setRemarkMode = useUI((state) => state.setRemarkMode);

  return (
    <section
      aria-label="Remarks settings"
      className="mx-1 mb-1 mt-1.5 rounded-[10px] border border-line bg-paper-sunken/45 p-3"
    >
      <SegmentedSetting
        label="Voice"
        value={remarkMode}
        options={[
          { value: "snark", label: "Snark" },
          { value: "cheer", label: "Cheer" },
          { value: "hush", label: "Hush" },
        ]}
        onChange={setRemarkMode}
      />
      <p className="mt-2.5 min-h-8 text-[11.5px] leading-relaxed text-ink-soft">
        {remarkDescriptions[remarkMode]}
      </p>
      <button
        type="button"
        disabled={remarkMode === "hush"}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          previewRemark({ x: Math.max(170, bounds.left - 360), y: bounds.top });
        }}
        className="ring-focus mt-2 w-full rounded-[8px] border border-line bg-paper-raised px-3 py-1.5 text-[11.5px] font-medium text-ink-soft shadow-[var(--shadow-sm)] transition-colors hover:border-ink-faint hover:text-ink disabled:cursor-default disabled:opacity-45"
      >
        {remarkMode === "hush" ? "Quiet means quiet" : "Say something"}
      </button>
    </section>
  );
}

function SegmentedSetting<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
        {label}
      </span>
      <div className="flex min-w-0 items-center rounded-[7px] border border-line bg-paper-raised p-0.5" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "ring-focus rounded-[5px] px-2 py-1 text-[10.5px] transition-colors",
              option.value === value
                ? "bg-ink font-medium text-paper-raised"
                : "text-ink-faint hover:text-ink",
            )}
            aria-pressed={option.value === value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
