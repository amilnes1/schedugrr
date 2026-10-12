import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { webkit, chromium } from "playwright";
import { startBackend, stopBackend } from "../../scripts/test-tauri-api.mjs";

const projectRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const artifactDirectory = join(tmpdir(), "schedugrr-tauri-qa");
const profileDirectory = await mkdtemp(join(tmpdir(), "schedugrr-qa-profile-"));

await mkdir(artifactDirectory, { recursive: true });

async function reservePort() {
  const server = createServer();
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  const port = address.port;
  await new Promise((accept, reject) => server.close((error) => error ? reject(error) : accept()));
  return port;
}

const port = await reservePort();
const baseUrl = `http://127.0.0.1:${port}`;
const pageErrors = [];

async function launch() {
  const backend = await startBackend(profileDirectory, port);
  const engine = process.platform === "darwin" ? webkit : chromium;
  const context = await engine.launchPersistentContext(join(profileDirectory, "webview-qa"), {
    headless: true, viewport: { width: 1440, height: 900 },
  });
  const page = context.pages()[0] ?? await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseUrl}/?desktop=${process.platform === "darwin" ? "mac" : process.platform}`);
  await page.getByText("ScheduGrr", { exact: true }).waitFor();
  return { desktop: { close: async () => { await context.close(); await stopBackend(backend.child); } }, page };
}

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json();
  assert.ok(response.ok, `${init?.method ?? "GET"} ${path} failed: ${JSON.stringify(data)}`);
  return data;
}

async function waitFor(predicate, message, timeoutMs = 8_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await new Promise((accept) => setTimeout(accept, 150));
  }
  assert.fail(message);
}

let first;
let second;
try {
  first = await launch();
  const { desktop, page } = first;

  assert.match(await page.title(), /^ScheduGrr\b/);
  assert.equal((await request("/api/health")).app, "schedugrr");
  const calendarStatus = await request("/api/calendar/status");
  assert.equal(calendarStatus.available, process.platform === "darwin", "Native calendar availability should match the host platform");

  await page.screenshot({ path: join(artifactDirectory, "01-calendar.png"), fullPage: true });

  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.getByText("Day schedule", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "Work", exact: true }).waitFor();
  await page.screenshot({ path: join(artifactDirectory, "01-board.png"), fullPage: true });

  const scheduleRail = page.getByRole("complementary", { name: "Today schedule" });
  const scheduleSource = page.getByRole("button", { name: "Fix the squeaky door", exact: true });
  const sourceBox = await scheduleSource.boundingBox();
  const scheduleBox = await scheduleRail.boundingBox();
  assert.ok(sourceBox && scheduleBox, "The task and day schedule must both be visible for drag-and-drop");

  const sourcePoint = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  };
  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  await page.mouse.down();
  await page.mouse.move(sourcePoint.x - 16, sourcePoint.y, { steps: 3 });
  await page.waitForTimeout(150);
  await page.mouse.move(scheduleBox.x + scheduleBox.width / 2, scheduleBox.y + scheduleBox.height / 2, { steps: 12 });
  await page.waitForTimeout(250);
  await scheduleRail.getByText("Release to schedule for Today", { exact: true }).waitFor({ timeout: 3_000 });
  await page.screenshot({ path: join(artifactDirectory, "01b-board-schedule-drop-target.png"), fullPage: true });
  await page.mouse.up();

  await scheduleRail.getByText("Fix the squeaky door", { exact: true }).waitFor();
  assert.equal(await scheduleRail.getByText("Fix the squeaky door", { exact: true }).count(), 1);
  await waitFor(async () => {
    const contextAfterScheduleDrop = await request("/api/context");
    return contextAfterScheduleDrop.lists
      .flatMap((candidate) => candidate.tasks)
      .some((task) => task.title === "Fix the squeaky door" && task.date);
  }, "Dropping a board card on the rail should persist its date");
  await page.screenshot({ path: join(artifactDirectory, "01c-board-task-scheduled.png"), fullPage: true });

  await page.getByRole("button", { name: "Rename Work list" }).click();
  const listName = page.getByRole("textbox", { name: "List name for Work" });
  await listName.fill("Workroom");
  await listName.press("Enter");
  await page.getByRole("heading", { name: "Workroom", exact: true }).waitFor();

  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: /Appearance/ }).click();
  const appearance = page.getByRole("region", { name: "Appearance settings" });
  await appearance.getByRole("group", { name: "Text size" }).getByRole("button", { name: "L", exact: true }).click();
  await appearance.getByRole("group", { name: "Weight" }).getByRole("button", { name: "Strong", exact: true }).click();
  await appearance.getByRole("button", { name: "Sky text selection" }).click();
  assert.equal(await appearance.getByRole("button", { name: "Sky text selection" }).getAttribute("aria-pressed"), "true");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: /Remarks/ }).click();
  const remarks = page.getByRole("region", { name: "Remarks settings" });
  assert.equal(await remarks.getByRole("button", { name: "Snark", exact: true }).getAttribute("aria-pressed"), "true");
  await page.screenshot({ path: join(artifactDirectory, "02-remarks-settings.png"), fullPage: true });
  await remarks.getByRole("button", { name: "Say something" }).click();
  await page.getByRole("status", { name: /Completed: A sample task/ }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(artifactDirectory, "03-remarks-snark.png"), fullPage: true });
  await remarks.getByRole("button", { name: "Cheer", exact: true }).click();
  await remarks.getByRole("button", { name: "Say something" }).click();
  await page.getByText("ScheduGrr cheers", { exact: true }).waitFor();
  await remarks.getByRole("button", { name: "Hush", exact: true }).click();
  assert.equal(await remarks.getByRole("button", { name: "Quiet means quiet" }).isDisabled(), true);
  await remarks.getByRole("button", { name: "Cheer", exact: true }).click();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: /Calendar sync/ }).click();
  const calendarPanel = page.getByRole("region", { name: "Calendar sync settings" });
  await calendarPanel.waitFor();
  if (!calendarStatus.available) {
    await calendarPanel.getByText("Native calendar sync is available in the macOS desktop app.", { exact: false }).waitFor();
  } else if (calendarStatus.authorization === "fullAccess") {
    await calendarPanel.getByRole("button", { name: "Calendar for task sync" }).waitFor();
  } else {
    await calendarPanel.getByRole("button", { name: "Connect Calendar" }).waitFor();
  }
  await page.screenshot({ path: join(artifactDirectory, "04-calendar-sync.png"), fullPage: true });
  await page.keyboard.press("Escape");

  const { list } = await request("/api/lists", {
    method: "POST",
    body: JSON.stringify({ name: "Grant QA", color: "plum" }),
  });
  await request("/api/tasks", {
    method: "POST",
    body: JSON.stringify({
      title: "QA timed task",
      listId: list.id,
      date: "2026-08-20",
      time: "09:30",
      priority: "high",
    }),
  });

  await page.getByRole("heading", { name: "Grant QA", exact: true }).waitFor({ timeout: 8_000 });
  const qaTask = page.getByText("QA timed task", { exact: true }).first();
  await qaTask.waitFor();
  await qaTask.click();
  const detail = page.getByRole("dialog", { name: "Task details" });
  await detail.waitFor();
  assert.equal(await detail.getByRole("button", { name: "Open date picker" }).locator("svg").count(), 1);
  assert.equal(await detail.getByRole("button", { name: "Open time picker" }).locator("svg").count(), 1);
  assert.equal(await detail.getByLabel("Task date").inputValue(), "2026-08-20");
  await detail.getByLabel("Task time").fill("14:15");
  await page.screenshot({ path: join(artifactDirectory, "05-task-time-editor.png"), fullPage: true });
  await detail.getByRole("button", { name: "Close" }).click();

  const qaCard = qaTask.locator("xpath=../..");
  await qaCard.getByRole("checkbox").click();
  await page.getByText("ScheduGrr cheers", { exact: true }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(artifactDirectory, "06-completion-cheer.png"), fullPage: true });

  const { task: llmTask } = await request("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title: "QA LLM completion", listId: list.id }),
  });
  await page.getByText("QA LLM completion", { exact: true }).waitFor({ timeout: 8_000 });
  await request(`/api/tasks/${llmTask.id}`, {
    method: "PATCH",
    body: JSON.stringify({ completed: true }),
  });
  await page.getByRole("status", { name: /Completed: QA LLM completion/ }).waitFor({ timeout: 8_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(artifactDirectory, "07-llm-completion.png"), fullPage: true });

  await waitFor(async () => {
    const context = await request("/api/context");
    return context.lists.some((candidate) => candidate.name === "Grant QA" && candidate.tasks.some((task) => task.title === "QA timed task" && task.time === "14:15"));
  }, "The edited task time did not persist through the local API");

  await page.setViewportSize({ width: 980, height: 660 });
  await page.waitForTimeout(250);
  const viewport = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    bodyWidth: document.body.scrollWidth,
    bodyHeight: document.body.scrollHeight,
  }));
  assert.ok(viewport.innerWidth >= 980 && viewport.innerHeight >= 660);
  assert.ok(viewport.bodyWidth <= viewport.innerWidth && viewport.bodyHeight <= viewport.innerHeight);
  await page.screenshot({ path: join(artifactDirectory, "08-minimum-window.png"), fullPage: true });

  await desktop.close();
  first = null;

  second = await launch();
  await second.page.getByRole("button", { name: "Board", exact: true }).click();
  await second.page.getByRole("heading", { name: "Workroom", exact: true }).waitFor();
  await second.page.getByRole("heading", { name: "Grant QA", exact: true }).waitFor();
  await second.page.getByText("QA timed task", { exact: true }).first().waitFor();

  await second.page.getByRole("button", { name: "More options" }).click();
  await second.page.getByRole("button", { name: /Appearance/ }).click();
  const persistedAppearance = second.page.getByRole("region", { name: "Appearance settings" });
  assert.equal(await persistedAppearance.getByRole("group", { name: "Text size" }).getByRole("button", { name: "L", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal(await persistedAppearance.getByRole("group", { name: "Weight" }).getByRole("button", { name: "Strong", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal(await persistedAppearance.getByRole("button", { name: "Sky text selection" }).getAttribute("aria-pressed"), "true");
  await second.page.keyboard.press("Escape");

  await second.page.getByRole("button", { name: "More options" }).click();
  await second.page.getByRole("button", { name: /Remarks/ }).click();
  const persistedRemarks = second.page.getByRole("region", { name: "Remarks settings" });
  assert.equal(await persistedRemarks.getByRole("button", { name: "Cheer", exact: true }).getAttribute("aria-pressed"), "true");
  await second.page.keyboard.press("Escape");

  const persisted = await request("/api/context");
  assert.ok(persisted.lists.some((candidate) => candidate.name === "Workroom"));
  assert.ok(persisted.lists.some((candidate) => candidate.tasks.some((task) => task.title === "QA timed task" && task.time === "14:15")));
  await second.page.screenshot({ path: join(artifactDirectory, "09-persisted-relaunch.png"), fullPage: true });

  const archiveColumn = second.page.getByRole("heading", { name: "Grant QA", exact: true }).locator("xpath=ancestor::section[1]");
  await archiveColumn.getByRole("button", { name: "List options" }).click();
  await second.page.getByRole("button", { name: "Archive completed items", exact: true }).click();
  await waitFor(async () => {
    const board = await request("/api/board");
    return Object.values(board.tasks).some((task) => task.title === "QA timed task" && task.archived);
  }, "Archived tasks must persist through the Rust backend");
  assert.equal(await archiveColumn.getByText("QA timed task", { exact: true }).count(), 0);
  await second.desktop.close(); second = await launch();
  const restoredColumn = second.page.getByRole("heading", { name: "Grant QA", exact: true }).locator("xpath=ancestor::section[1]");
  await restoredColumn.waitFor();
  assert.equal(await restoredColumn.getByText("QA timed task", { exact: true }).count(), 0);
  await restoredColumn.getByRole("button", { name: "List options" }).click();
  await second.page.getByRole("button", { name: /Restore archived items/ }).click();
  await restoredColumn.getByText("QA timed task", { exact: true }).waitFor();

  assert.deepEqual(pageErrors, []);
  console.log(`Tauri backend + webview-engine QA passed. Screenshots: ${artifactDirectory}`);
} finally {
  await first?.desktop.close().catch(() => {});
  await second?.desktop.close().catch(() => {});
  await rm(profileDirectory, { recursive: true, force: true });
}
