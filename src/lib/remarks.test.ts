import { beforeEach, describe, expect, it } from "vitest";
import { REMARK_MESSAGES, resetRemarkEngine, toggleTaskWithRemark, useRemarks } from "./remarks";
import { useBoard } from "./store";
import { useUI } from "./ui";

beforeEach(() => {
  resetRemarkEngine();
  useBoard.getState().resetToSeed();
  useUI.setState({ remarkMode: "snark" });
});

describe("completion remarks", () => {
  it("uses the passive-aggressive and mildly insulting snark voice by default", () => {
    useRemarks.getState().show("File the report");
    const notice = useRemarks.getState().notice;
    expect(notice?.mode).toBe("snark");
    expect(notice?.taskTitle).toBe("File the report");
    expect(REMARK_MESSAGES.some((message) => message.text === "Oh, good. We were all starting to wonder.")).toBe(true);
    expect(REMARK_MESSAGES.some((message) => message.text === "Well done. The bar was low, but you cleared it.")).toBe(true);
    expect(REMARK_MESSAGES.some((message) => message.text === "The checkbox was beginning to worry.")).toBe(false);
    expect(REMARK_MESSAGES.some((message) => message.text === "The list is losing ground.")).toBe(false);
    expect(REMARK_MESSAGES.some((message) => message.text === "The overdue badge has left the chat.")).toBe(false);
  });

  it("moves into the warm message pool during a quick streak", () => {
    useRemarks.getState().show("First");
    useRemarks.getState().show("Second");
    expect(useRemarks.getState().notice?.messageId).toContain("snark-warm");
  });

  it("switches to genuine encouragement", () => {
    useUI.setState({ remarkMode: "cheer" });
    useRemarks.getState().show("Send the note");
    expect(useRemarks.getState().notice?.mode).toBe("cheer");
  });

  it("stays silent in Hush mode", () => {
    useUI.setState({ remarkMode: "hush" });
    useRemarks.getState().show("Quiet task");
    expect(useRemarks.getState().notice).toBeNull();
  });

  it("shows a remark only when a task becomes complete", () => {
    const task = Object.values(useBoard.getState().tasks).find((candidate) => !candidate.completed);
    expect(task).toBeTruthy();
    toggleTaskWithRemark(task!.id, { x: 20, y: 40 });
    const completedNotice = useRemarks.getState().notice;
    expect(completedNotice?.anchor).toEqual({ x: 20, y: 40 });

    toggleTaskWithRemark(task!.id);
    expect(useRemarks.getState().notice).toEqual(completedNotice);
  });

  it("keeps message ids unique and copy brief", () => {
    expect(new Set(REMARK_MESSAGES.map((message) => message.id)).size).toBe(REMARK_MESSAGES.length);
    expect(Math.max(...REMARK_MESSAGES.map((message) => message.text.length))).toBeLessThanOrEqual(90);
  });
});
