import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const projectRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const universalExecutable = join(projectRoot, "release", "mac-universal", "OpenAgenda.app", "Contents", "MacOS", "OpenAgenda");
const armExecutable = join(projectRoot, "release", "mac-arm64", "OpenAgenda.app", "Contents", "MacOS", "OpenAgenda");
const windowsExecutable = join(projectRoot, "release", "win-unpacked", "OpenAgenda.exe");
const linuxExecutable = join(projectRoot, "release", "linux-unpacked", "openagenda");
const platformExecutable = process.platform === "win32"
  ? windowsExecutable
  : process.platform === "linux" ? linuxExecutable : existsSync(universalExecutable) ? universalExecutable : armExecutable;
const executablePath = process.env.OPENAGENDA_QA_EXECUTABLE
  ? resolve(process.env.OPENAGENDA_QA_EXECUTABLE)
  : platformExecutable;
const artifactDirectory = join(tmpdir(), "openagenda-desktop-qa");
const profileDirectory = await mkdtemp(join(tmpdir(), "openagenda-qa-profile-"));

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
  const desktop = await electron.launch({
    executablePath,
    env: {
      ...process.env,
      OPENAGENDA_PORT: String(port),
      OPENAGENDA_USER_DATA_DIR: profileDirectory,
    },
  });
  const page = await desktop.firstWindow();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.waitForLoadState("domcontentloaded");
  await page.getByText("OpenAgenda", { exact: true }).waitFor();
  return { desktop, page };
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

  assert.match(await page.title(), /^OpenAgenda\b/);
  assert.equal((await request("/api/health")).app, "openagenda");
  const calendarStatus = await request("/api/calendar/status");
  assert.equal(calendarStatus.available, process.platform === "darwin", "Native calendar availability should match the host platform");

  await page.screenshot({ path: join(artifactDirectory, "01-calendar.png"), fullPage: true });

  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.getByText("Day schedule", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "Work", exact: true }).waitFor();

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
  await page.screenshot({ path: join(artifactDirectory, "02-calendar-sync.png"), fullPage: true });
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
  await page.screenshot({ path: join(artifactDirectory, "03-task-time-editor.png"), fullPage: true });
  await detail.getByRole("button", { name: "Close" }).click();

  await waitFor(async () => {
    const context = await request("/api/context");
    return context.lists.some((candidate) => candidate.name === "Grant QA" && candidate.tasks.some((task) => task.title === "QA timed task" && task.time === "14:15"));
  }, "The edited task time did not persist through the local API");

  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(980, 660));
  await page.waitForTimeout(250);
  const viewport = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    bodyWidth: document.body.scrollWidth,
    bodyHeight: document.body.scrollHeight,
  }));
  assert.ok(viewport.innerWidth >= 980 && viewport.innerHeight >= 660);
  assert.ok(viewport.bodyWidth <= viewport.innerWidth && viewport.bodyHeight <= viewport.innerHeight);
  await page.screenshot({ path: join(artifactDirectory, "04-minimum-window.png"), fullPage: true });

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

  const persisted = await request("/api/context");
  assert.ok(persisted.lists.some((candidate) => candidate.name === "Workroom"));
  assert.ok(persisted.lists.some((candidate) => candidate.tasks.some((task) => task.title === "QA timed task" && task.time === "14:15")));
  await second.page.screenshot({ path: join(artifactDirectory, "05-persisted-relaunch.png"), fullPage: true });

  assert.deepEqual(pageErrors, []);
  console.log(`Desktop QA passed. Screenshots: ${artifactDirectory}`);
} finally {
  await first?.desktop.close().catch(() => {});
  await second?.desktop.close().catch(() => {});
  await rm(profileDirectory, { recursive: true, force: true });
}
