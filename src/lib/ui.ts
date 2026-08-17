import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "./storage";

export type ViewMode = "board" | "calendar";
export type Theme = "light" | "dark";
export type TaskFont = "sans" | "serif";
export type TaskTextSize = "compact" | "standard" | "large";
export type TaskTextWeight = "regular" | "medium" | "strong";
export type SelectionTone = "accent" | "sage" | "sky" | "plum";
export type RemarkMode = "snark" | "cheer" | "hush";

interface UIState {
  view: ViewMode;
  theme: Theme;
  taskFont: TaskFont;
  taskTextSize: TaskTextSize;
  taskTextWeight: TaskTextWeight;
  selectionTone: SelectionTone;
  remarkMode: RemarkMode;
  setView: (v: ViewMode) => void;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  setTaskFont: (font: TaskFont) => void;
  setTaskTextSize: (size: TaskTextSize) => void;
  setTaskTextWeight: (weight: TaskTextWeight) => void;
  setSelectionTone: (tone: SelectionTone) => void;
  setRemarkMode: (mode: RemarkMode) => void;
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      view: "calendar",
      theme:
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light",
      taskFont: "sans",
      taskTextSize: "standard",
      taskTextWeight: "medium",
      selectionTone: "accent",
      remarkMode: "snark",
      setView: (view) => set({ view }),
      toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
      setTheme: (theme) => set({ theme }),
      setTaskFont: (taskFont) => set({ taskFont }),
      setTaskTextSize: (taskTextSize) => set({ taskTextSize }),
      setTaskTextWeight: (taskTextWeight) => set({ taskTextWeight }),
      setSelectionTone: (selectionTone) => set({ selectionTone }),
      setRemarkMode: (remarkMode) => set({ remarkMode }),
    }),
    { name: "schedugrr.ui.v1", storage: persistStorage },
  ),
);

/** Applies the current theme to <html data-theme>. Call once at mount. */
export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#17140f" : "#f7f3ea");
}

/** Applies the persisted task typography and selection preferences. */
export function applyAppearance({
  taskFont = "sans",
  taskTextSize = "standard",
  taskTextWeight = "medium",
  selectionTone = "accent",
}: Pick<UIState, "taskFont" | "taskTextSize" | "taskTextWeight" | "selectionTone">) {
  const root = document.documentElement;
  root.dataset.taskFont = taskFont;
  root.dataset.taskTextSize = taskTextSize;
  root.dataset.taskTextWeight = taskTextWeight;
  root.dataset.selectionTone = selectionTone;
}
