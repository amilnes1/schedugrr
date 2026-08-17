import { create } from "zustand";
import { format, isBefore, parseISO, startOfDay } from "date-fns";
import { useBoard } from "./store";
import { useUI, type RemarkMode } from "./ui";

export type RemarkTier = "cold" | "warm" | "hot" | "special";

interface MessageDefinition {
  id: string;
  mode: Exclude<RemarkMode, "hush">;
  tier: RemarkTier;
  text: string;
  special?: "first" | "list" | "board" | "overdue";
}

export interface RemarkAnchor {
  x: number;
  y: number;
}

export interface RemarkNotice {
  id: number;
  messageId: string;
  mode: Exclude<RemarkMode, "hush">;
  text: string;
  taskTitle: string | null;
  anchor: RemarkAnchor | null;
  rotation: number;
}

interface RemarkState {
  notice: RemarkNotice | null;
  show: (taskTitle?: string | null, anchor?: RemarkAnchor | null, context?: CompletionContext) => void;
  dismiss: () => void;
}

interface CompletionContext {
  listCleared?: boolean;
  boardCleared?: boolean;
  overdue?: boolean;
}

const entries = (
  mode: MessageDefinition["mode"],
  tier: RemarkTier,
  lines: string[],
  special?: MessageDefinition["special"],
): MessageDefinition[] => lines.map((text, index) => ({
  id: `${mode}-${tier}-${special ?? "standard"}-${index + 1}`,
  mode,
  tier,
  text,
  special,
}));

/**
 * Opus wrote the first voice pass; this edited and expanded library keeps the
 * joke aimed at the paperwork, the backlog, and ScheduGrr itself—not the user.
 */
export const REMARK_MESSAGES: readonly MessageDefinition[] = [
  ...entries("snark", "cold", [
    "Oh, so now you do it.",
    "The checkbox was beginning to worry.",
    "Fine. The tiny square has been appeased.",
    "Done? Suspicious, but accepted.",
    "Well, well, well. Progress.",
    "Task complete. Miracles remain technically possible.",
    "The schedule growls approvingly.",
    "Checked. I'll notify the paperwork.",
    "A task has escaped the board.",
    "Look at that. The plan survived contact with reality.",
    "Finally. I was running out of dramatic sighs.",
    "Done. Try not to make a whole personality out of it.",
    "Fine, that was actually tidy.",
    "A checkbox fulfilled its destiny.",
    "Progress? In this economy?",
    "Complete. The committee withdraws its objections.",
    "Noted. Begrudgingly.",
    "Nice work. Don't get used to me saying that.",
  ]),
  ...entries("snark", "warm", [
    "Two in a row? This is getting suspicious.",
    "Okay, a pattern. Weird.",
    "Momentum. How inconvenient for my skepticism.",
    "You're on a roll and the backlog hates to see it.",
    "This is getting dangerously organized.",
    "Three? The checkboxes are gossiping.",
    "I'm running out of objections. Keep going.",
    "Fine, this is mildly impressive. There, I said it.",
    "Careful. The board may develop expectations.",
    "Look at this productivity streak. Absolutely indecent.",
    "The list is losing ground.",
    "Another one? Bold.",
  ]),
  ...entries("snark", "hot", [
    "Okay, who gave you momentum?",
    "Stop it. You're making the other tasks nervous.",
    "This is a productive rampage.",
    "I retract several carefully prepared doubts.",
    "The board is fleeing.",
    "I can't keep pretending this isn't impressive.",
    "Fine. Fine. You're crushing it. Annoying.",
    "ScheduGrr has upgraded from growl to startled applause.",
    "The backlog requests a timeout.",
    "This many checks? The squares are unionizing.",
  ]),
  ...entries("snark", "special", [
    "Morning. Let's ruin some to-dos.",
    "First win logged. The day has been warned.",
  ], "first"),
  ...entries("snark", "special", [
    "An empty list. Beautiful. Suspicious, but beautiful.",
    "You cleared a whole list. The paperwork is in mourning.",
  ], "list"),
  ...entries("snark", "special", [
    "The board is empty. What do we complain about now?",
    "Everything is done. ScheduGrr has no notes. Temporarily.",
  ], "board"),
  ...entries("snark", "special", [
    "Only a little late. We'll bury the evidence.",
    "The overdue badge has left the chat.",
  ], "overdue"),

  ...entries("cheer", "cold", [
    "Nice. That's a real win.",
    "Done—and you should feel good about it.",
    "One thing handled. That's how it starts.",
    "Look at that. Progress.",
    "You showed up. That's the whole game.",
    "Checked off and well earned.",
    "That's a solid start. Keep it gentle.",
    "You did it. Simple as that.",
    "Good work. Truly.",
    "One down—you've got this.",
    "That counts. All of it counts.",
    "Clean and done. Nice pace.",
    "Small step, real momentum.",
    "Well handled. Onward when you're ready.",
  ]),
  ...entries("cheer", "warm", [
    "Two in a row—you're finding your rhythm.",
    "That's momentum, and it looks good on you.",
    "You're building something here. Keep going.",
    "Steady and strong. Love to see it.",
    "Look at you go. This is your pace now.",
    "Each one makes the next easier. Feel it?",
    "You're in a good groove.",
    "This is the good kind of unstoppable.",
    "Rhythm found. Ride it as long as it's fun.",
    "You're doing great—genuinely.",
  ]),
  ...entries("cheer", "hot", [
    "You are on fire today. Incredible.",
    "This is a fantastic run. Be proud.",
    "Look how much you've cleared. Amazing.",
    "You're crushing it—and it shows.",
    "Seriously impressive. Take a breath and keep flying.",
    "You're outdoing yourself right now.",
    "What a streak. You earned every check.",
    "Unstoppable—and you did that.",
  ]),
  ...entries("cheer", "special", [
    "First win of the day. Great way to start.",
    "And we're off. Good morning to you.",
  ], "first"),
  ...entries("cheer", "special", [
    "Whole list, cleared. That's a real accomplishment.",
    "Empty list, full heart. Beautiful work.",
  ], "list"),
  ...entries("cheer", "special", [
    "Board clear. Take a moment—you did that.",
    "Everything handled. That deserves a proper pause.",
  ], "board"),
  ...entries("cheer", "special", [
    "Late is fine—finishing is what matters. Well done.",
    "You circled back and got it done. That takes grit.",
  ], "overdue"),
];

let sequence = 0;
let completionTimes: number[] = [];
let lastDay = "";
const bags = new Map<string, string[]>();

function shuffled(ids: string[]) {
  const result = [...ids];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function take(messages: MessageDefinition[]): MessageDefinition {
  const key = messages.map((message) => message.id).join("|");
  let bag = bags.get(key) ?? [];
  if (bag.length === 0) bag = shuffled(messages.map((message) => message.id));
  const id = bag.shift() ?? messages[0].id;
  bags.set(key, bag);
  return messages.find((message) => message.id === id) ?? messages[0];
}

function nextMessage(mode: Exclude<RemarkMode, "hush">, context: CompletionContext = {}) {
  const current = Date.now();
  completionTimes = completionTimes.filter((time) => current - time < 45_000);
  completionTimes.push(current);
  const today = format(current, "yyyy-MM-dd");
  const first = lastDay !== today;
  lastDay = today;

  const special = context.boardCleared
    ? "board"
    : context.listCleared
      ? "list"
      : context.overdue
        ? "overdue"
        : first
          ? "first"
          : null;
  const tier: RemarkTier = completionTimes.length >= 5 ? "hot" : completionTimes.length >= 2 ? "warm" : "cold";
  const pool = REMARK_MESSAGES.filter((message) =>
    message.mode === mode && (special ? message.special === special : message.tier === tier),
  );
  return take(pool.length > 0 ? pool : REMARK_MESSAGES.filter((message) => message.mode === mode && message.tier === tier));
}

export const useRemarks = create<RemarkState>((set) => ({
  notice: null,
  show: (taskTitle = null, anchor = null, context = {}) => {
    const mode = useUI.getState().remarkMode;
    if (mode === "hush") {
      set({ notice: null });
      return;
    }
    const message = nextMessage(mode, context);
    sequence += 1;
    set({
      notice: {
        id: sequence,
        messageId: message.id,
        mode,
        text: message.text,
        taskTitle,
        anchor,
        rotation: sequence % 2 === 0 ? 1.2 : -1.1,
      },
    });
  },
  dismiss: () => set({ notice: null }),
}));

/** Toggle a task and show feedback only when it moves into the completed state. */
export function toggleTaskWithRemark(taskId: string, anchor: RemarkAnchor | null = null) {
  const before = useBoard.getState();
  const task = before.tasks[taskId];
  if (!task) return;
  before.toggleTask(taskId);
  if (task.completed) return;

  const after = useBoard.getState();
  const siblings = Object.values(after.tasks).filter((candidate) => candidate.listId === task.listId);
  const remaining = Object.values(after.tasks).filter((candidate) => !candidate.completed);
  const overdue = Boolean(task.date && isBefore(parseISO(task.date), startOfDay(new Date())));
  useRemarks.getState().show(task.title || "Untitled task", anchor, {
    listCleared: siblings.length > 0 && siblings.every((candidate) => candidate.completed),
    boardCleared: remaining.length === 0,
    overdue,
  });
}

export function previewRemark(anchor: RemarkAnchor | null = null) {
  useRemarks.getState().show("A sample task", anchor);
}

/** Test helper for deterministic tier boundaries without exposing engine state. */
export function resetRemarkEngine() {
  completionTimes = [];
  lastDay = "";
  bags.clear();
  sequence = 0;
  useRemarks.setState({ notice: null });
}
