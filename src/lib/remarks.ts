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
 * Opus wrote the first voice pass. This edited and expanded library lets Snark
 * direct some conspicuously polite disappointment at the user while keeping
 * the joke light enough that finishing a task still feels like a small win.
 * Voice guardrail: every Snark line needs a direct jab or a clearly backhanded
 * compliment; neutral jokes about checkboxes and paperwork belong elsewhere.
 */
export const REMARK_MESSAGES: readonly MessageDefinition[] = [
  ...entries("snark", "cold", [
    "Oh, so now you do it.",
    "Well done. The bar was low, but you cleared it.",
    "Task complete. Your competence has made a brief guest appearance.",
    "Done? I suppose even chaos produces a result occasionally.",
    "Well, well, well. Even you can surprise a checkbox.",
    "Task complete. Miracles remain technically possible.",
    "Look at you, outperforming a reminder notification.",
    "Nice. The minimum standard remains technically undefeated.",
    "You did it. I assume by accident, but let's not spoil the moment.",
    "The plan survived contact with reality. Your methods remain under review.",
    "Finally. I was running out of dramatic sighs.",
    "Done. Try not to make a whole personality out of it.",
    "This almost compensates for the time you spent avoiding it.",
    "Congratulations on briefly becoming the person your planner expects.",
    "I see competence has logged in for the day.",
    "Complete. The committee lowered its concerns from 'serious' to 'ongoing.'",
    "Noted. Begrudgingly. Your record remains otherwise intact.",
    "Nice work. Don't get used to me saying that.",
    "Oh, good. We were all starting to wonder.",
    "How thoughtful of you to finally get around to it.",
    "Finished already? And by 'already,' I mean eventually.",
    "See? That wasn't so hard. Interesting.",
    "Thanks for circling back to the task you assigned yourself.",
    "The task appreciates being remembered.",
    "At your earliest convenience has finally arrived.",
    "Lovely. I'll cancel the search party.",
    "No rush, of course. It only had a due date.",
    "Glad we could fit this into your busy schedule of not doing this.",
    "Completion noted. Timing left diplomatically unmentioned.",
    "Amazing what happens when a task receives attention.",
    "Your commitment to doing this eventually has paid off.",
    "That went well, once it started.",
  ]),
  ...entries("snark", "warm", [
    "Two in a row. That's practically a personality change.",
    "Okay, a pattern. Perhaps the first task wasn't a clerical error.",
    "Momentum. A brave new look for someone with your track record.",
    "You're on a roll. Try not to trip over your usual standards.",
    "A streak. Your usual standards must be devastated.",
    "Three in a row. I see mediocrity is taking a personal day.",
    "I'm running out of objections. You must be exhausted from proving me wrong.",
    "Fine, this is mildly impressive. A generous assessment, but still.",
    "Careful. The board's expectations may soon exceed your own.",
    "Look at this streak. Almost uncharacteristically functional.",
    "The list is losing ground to your occasional competence.",
    "Another one? Your excuses must be exhausted.",
    "Another one. I'm glad our little conversation sank in.",
    "Two tasks remembered in one day. Remarkable.",
    "Please, pace yourself. We wouldn't want consistency to become expected.",
    "Look at you, following through repeatedly. What a pleasant surprise.",
    "Another task done without a reminder. Growth.",
    "The rest of the list is feeling optimistic. It clearly hasn't met you.",
    "This streak almost makes the earlier delay look strategic.",
    "Nice to see the plan getting some of the attention it asked for.",
    "Keep this up and I'll have to revise my notes.",
  ]),
  ...entries("snark", "hot", [
    "Okay, who gave you momentum, and have they accepted responsibility?",
    "Stop it. You're making your usual level of effort look embarrassing.",
    "This is almost enough productivity to offset your reputation.",
    "I retract some doubts. The rest have excellent documentation.",
    "The board is fleeing. Apparently you can be taught.",
    "I can't keep pretending this isn't impressive. You've ruined a good theory.",
    "Fine. You're crushing it. Even your bad habits look embarrassed.",
    "ScheduGrr revised your performance review from 'hmm' to 'fine.'",
    "The backlog requests a timeout. You finally found its weak point: effort.",
    "This many checks? Your low expectations have filed a complaint.",
    "Well, this level of follow-through would have been useful sooner.",
    "Look at all this urgency, arriving fashionably late.",
    "Now you're overachieving. The timing is fascinating.",
    "Apparently the secret was deciding to begin. Who knew.",
    "I'd apologize for doubting you, but let's not get ahead of ourselves.",
    "Impressive. Almost as if these tasks were always completable.",
    "At this rate, the backlog may forgive you.",
  ]),
  ...entries("snark", "special", [
    "First task done. A bold start for someone with your track record.",
    "First win logged. Your baseline has been temporarily upgraded.",
    "Starting strong. Or starting, at least.",
    "Good morning to the task you finally acknowledged.",
  ], "first"),
  ...entries("snark", "special", [
    "An empty list. Even a chaos goblin gets lucky.",
    "You cleared a whole list. Your avoidance strategy has officially collapsed.",
    "An empty list. So all that avoiding it was apparently unnecessary.",
    "You cleared the list. I assume your apology to it is forthcoming.",
  ], "list"),
  ...entries("snark", "special", [
    "The board is empty. Your bad habits have taken the afternoon off.",
    "Everything is done. Please preserve this rare evidence of competence.",
    "Everything is done. Enjoy this extremely temporary moral high ground.",
    "The board is empty. I'll archive my concerns alphabetically.",
  ], "board"),
  ...entries("snark", "special", [
    "Only a little late. We'll bury the evidence.",
    "Overdue task complete. Time management remains at large.",
    "Look at that—the due date didn't prevent completion after all.",
    "Late, but finished. I'll word the report generously.",
    "Done at last. The calendar accepts your apology.",
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
        rotation: sequence % 2 === 0 ? 0.35 : -0.35,
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
