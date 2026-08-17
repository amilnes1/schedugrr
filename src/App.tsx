import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useUI, applyAppearance, applyTheme } from "@/lib/ui";
import { TopBar } from "@/components/TopBar";
import { BoardView } from "@/components/board/BoardView";
import { CalendarView } from "@/components/calendar/CalendarView";
import { TaskDetail } from "@/components/TaskDetail";
import { CompletionRemark } from "@/components/CompletionRemark";
import { useScheduGrrApiSync } from "@/lib/api-sync";

export function App() {
  useScheduGrrApiSync();
  const view = useUI((s) => s.view);
  const theme = useUI((s) => s.theme);
  const taskFont = useUI((s) => s.taskFont);
  const taskTextSize = useUI((s) => s.taskTextSize);
  const taskTextWeight = useUI((s) => s.taskTextWeight);
  const selectionTone = useUI((s) => s.selectionTone);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    applyAppearance({ taskFont, taskTextSize, taskTextWeight, selectionTone });
  }, [selectionTone, taskFont, taskTextSize, taskTextWeight]);

  useEffect(() => {
    const desktop = new URLSearchParams(window.location.search).get("desktop");
    if (desktop) document.documentElement.dataset.desktop = desktop;
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />

      <main className="relative min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            className="h-full"
          >
            {view === "calendar" ? (
              <CalendarView onOpenTask={setSelectedTaskId} />
            ) : (
              <BoardView onOpenTask={setSelectedTaskId} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <TaskDetail taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      <CompletionRemark />
    </div>
  );
}
