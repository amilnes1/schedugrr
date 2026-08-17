import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { App } from "./App";
import { useBoard } from "./lib/store";
import { useUI } from "./lib/ui";

afterEach(cleanup);

beforeEach(() => {
  useUI.setState({
    taskFont: "sans",
    taskTextSize: "standard",
    taskTextWeight: "medium",
    selectionTone: "accent",
  });
});

/**
 * Smoke tests that mount the entire component tree. These catch runtime render
 * failures (bad hooks, undefined refs, malformed JSX) that a type/build check
 * can't — the app is only "working" if it actually mounts and reacts to input.
 */
describe("App", () => {
  it("mounts and shows the wordmark and both views", () => {
    render(<App />);
    expect(screen.getByText("OpenAgenda")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Calendar/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Board/ })).toBeTruthy();
  });

  it("switches to the Board view and renders seeded lists", () => {
    act(() => {
      useBoard.getState().resetToSeed();
      useUI.getState().setView("board");
    });
    render(<App />);
    // Seed contains a "Work" list.
    expect(screen.getByRole("heading", { name: "Work" })).toBeTruthy();
  });

  it("shows today's calendar schedule beside the board", () => {
    act(() => {
      useBoard.getState().resetToSeed();
      useUI.getState().setView("board");
    });
    render(<App />);

    const schedule = screen.getByRole("complementary", { name: "Today schedule" });
    expect(within(schedule).getByText("Day schedule")).toBeTruthy();
    expect(within(schedule).getByText("Sketch the week ahead")).toBeTruthy();
    expect(within(schedule).getByText("9:00 AM")).toBeTruthy();
  });

  it("renames a list by clicking its title", () => {
    act(() => {
      useBoard.getState().resetToSeed();
      useUI.getState().setView("board");
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Rename Work list" }));
    const input = screen.getByRole("textbox", { name: "List name for Work" });
    fireEvent.change(input, { target: { value: "Client work" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("heading", { name: "Client work" })).toBeTruthy();
  });

  it("adds a task through the Board composer", () => {
    act(() => {
      useBoard.getState().resetToSeed();
      useUI.getState().setView("board");
    });
    render(<App />);

    const input = screen.getAllByPlaceholderText("Add a task…")[0];
    fireEvent.change(input, { target: { value: "Buy stamps" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("Buy stamps")).toBeTruthy();
  });

  it("opens the task detail drawer when a task is clicked", () => {
    act(() => {
      useBoard.getState().resetToSeed();
      useUI.getState().setView("board");
    });
    render(<App />);

    fireEvent.click(screen.getAllByText("Review pull requests")[0]);
    const dialog = screen.getByRole("dialog", { name: /Task details/ });
    expect(within(dialog).getByText("Schedule")).toBeTruthy();
    expect(within(dialog).getByText("Priority")).toBeTruthy();
  });

  it("assigns an optional time to a scheduled task", () => {
    act(() => {
      useBoard.getState().resetToSeed();
      useUI.getState().setView("board");
    });
    render(<App />);

    fireEvent.click(screen.getAllByText("Review pull requests")[0]);
    const timeInput = screen.getByLabelText("Task time");
    fireEvent.input(timeInput, { target: { value: "16:15" } });
    const task = Object.values(useBoard.getState().tasks).find((candidate) => candidate.title === "Review pull requests");
    expect(task?.time).toBe("16:15");
  });

  it("shows one custom picker icon and one friendly day label", () => {
    act(() => {
      useBoard.getState().resetToSeed();
      useUI.getState().setView("board");
    });
    render(<App />);

    fireEvent.click(screen.getAllByText("Review pull requests")[0]);
    const dialog = screen.getByRole("dialog", { name: /Task details/ });
    expect(within(dialog).getAllByRole("button", { name: "Open date picker" })).toHaveLength(1);
    expect(within(dialog).getByLabelText("Task date").className).toContain("native-picker-hidden");
    expect(dialog.textContent).not.toContain("·");
  });

  it("persists lightweight appearance choices", () => {
    act(() => useUI.getState().setView("board"));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("button", { name: /Appearance/ }));
    const settings = screen.getByRole("region", { name: "Appearance settings" });
    fireEvent.click(within(settings).getByRole("button", { name: "Serif" }));
    fireEvent.click(within(settings).getByRole("button", { name: "L" }));
    fireEvent.click(within(settings).getByRole("button", { name: "Strong" }));
    fireEvent.click(within(settings).getByRole("button", { name: "Sage text selection" }));

    expect(useUI.getState().taskFont).toBe("serif");
    expect(useUI.getState().taskTextSize).toBe("large");
    expect(useUI.getState().taskTextWeight).toBe("strong");
    expect(document.documentElement.dataset.selectionTone).toBe("sage");
  });

  it("labels the local tool surface as LLM friendly", () => {
    render(<App />);
    expect(screen.getByLabelText("LLM friendly. LLMs can easily view and update tasks")).toBeTruthy();
    expect(screen.getByRole("tooltip").textContent).toContain("LLMs can easily view and update tasks");
  });

  it("explains where native calendar sync is available", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      available: false,
      platform: "web",
      authorization: "unavailable",
      settings: { enabled: false, calendarId: null, includeUntimed: true, durationMinutes: 30 },
      lastSync: null,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("button", { name: /Calendar sync/ }));
    const settings = await screen.findByRole("region", { name: "Calendar sync settings" });
    expect(within(settings).getByText(/macOS desktop app/)).toBeTruthy();
    fetchMock.mockRestore();
  });
});
