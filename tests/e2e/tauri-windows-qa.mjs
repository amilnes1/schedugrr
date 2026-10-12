// Drive the packaged Windows app's actual WebView2 instance, not a browser copy.
// https://playwright.dev/docs/webview2
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { unusedPort } from "../../scripts/test-tauri-api.mjs";

if (process.platform !== "win32") throw new Error("Native Windows UI QA requires Windows and WebView2.");
const profile = await mkdtemp(join(realpathSync.native(tmpdir()), "schedugrr-windows-qa-"));
await writeFile(join(profile, "window-state.json"), JSON.stringify({ width: 1000, height: 720 }));
const artifacts = resolve("release/windows-qa");
await mkdir(artifacts, { recursive: true });
const port = await unusedPort();
const executable = resolve(process.env.SCHEDUGRR_QA_EXECUTABLE ?? "src-tauri/target/release/schedugrr.exe");
let child, browser, page;
let output = "";
const pageErrors = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, method = "GET", body) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method, headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5_000),
  });
  assert.ok(response.ok, `${method} ${path}: ${response.status}`);
  return response.json();
}

async function waitFor(check, label) {
  let last;
  for (let attempt = 0; attempt < 200; attempt++) {
    if (child && child.exitCode !== null) throw new Error(`App exited (${child.exitCode}) while ${label}: ${output}`);
    try { const value = await check(); if (value) return value; } catch (error) { last = error; }
    await delay(100);
  }
  throw new Error(`Timed out while ${label}`, { cause: last });
}

async function launch() {
  const debugPort = await unusedPort();
  child = spawn(executable, [], {
    env: {
      ...process.env,
      SCHEDUGRR_PORT: String(port),
      SCHEDUGRR_USER_DATA_DIR: profile,
      WEBVIEW2_USER_DATA_FOLDER: join(profile, "WebKit"),
      // Loopback-only debugging is enabled in this isolated test process only.
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort} --remote-debugging-address=127.0.0.1`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  child.on("error", (error) => { output += String(error); });
  await waitFor(async () => (await request("/api/health")).ok, "waiting for the app API");
  const debugUrl = `http://127.0.0.1:${debugPort}`;
  await waitFor(async () => (await fetch(`${debugUrl}/json/version`, { signal: AbortSignal.timeout(2_000) })).ok, "waiting for WebView2 debugging");
  browser = await chromium.connectOverCDP(debugUrl);
  page = await waitFor(() => browser.contexts().flatMap((context) => context.pages()).find((candidate) => candidate.url().startsWith(`http://127.0.0.1:${port}/`)), "finding the native app page");
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.getByText("ScheduGrr", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => Boolean(window.__TAURI_INTERNALS__)), true, "Must test the native Tauri webview");
  console.log("Attached to the packaged app's native WebView2 page.");
}

async function stop() {
  if (browser) await browser.close().catch(() => {});
  browser = null; page = null;
  if (child && child.exitCode === null) {
    // Stop only the test process tree, including helpers that hold profile files.
    try { execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "pipe" }); }
    catch (error) { if (child.exitCode === null) console.warn(`Test process cleanup: ${error.message}`); }
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(3_000)]);
  }
  child = null;
}

try {
  await launch();
  assert.equal((await request("/api/calendar/status")).available, false);
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.getByRole("button", { name: "Rename Work list" }).click();
  const name = page.getByRole("textbox", { name: "List name for Work" });
  await name.fill("Workroom"); await name.press("Enter");
  await page.getByRole("heading", { name: "Workroom", exact: true }).waitFor();
  const { task } = await request("/api/tasks", "POST", { title: "Windows QA task", listName: "Workroom", date: "2026-10-12", time: "09:30", priority: "high" });
  await page.getByText("Windows QA task", { exact: true }).first().click();
  await page.getByLabel("Task time", { exact: true }).fill("14:15");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await waitFor(async () => (await request("/api/tasks")).tasks.some((item) => item.id === task.id && item.time === "14:15"), "persisting the UI time edit");
  await request(`/api/tasks/${task.id}`, "PATCH", { completed: true });
  await page.getByRole("status", { name: /Completed: Windows QA task/ }).waitFor();
  // The saved window state launches the actual native window at this size.
  assert.ok(await page.evaluate(() => innerWidth <= 1000 && innerHeight <= 720));
  assert.ok(await page.evaluate(() => document.body.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight));
  await page.screenshot({ path: join(artifacts, "windows-native.png") });
  await stop();
  await launch();
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.getByRole("heading", { name: "Workroom", exact: true }).waitFor();
  await page.getByText("Windows QA task", { exact: true }).first().waitFor();
  assert.equal((await request("/api/tasks")).tasks.find((item) => item.id === task.id).time, "14:15");
  assert.deepEqual(pageErrors, []);
  console.log("Native Windows WebView2 QA passed: UI edits, API notifications, task time/completion, minimum layout, and relaunch.");
} catch (error) {
  console.error(error);
  if (page) {
    await page.screenshot({ path: join(artifacts, "failure.png") }).catch(() => {});
    await writeFile(join(artifacts, "failure.html"), await page.content().catch(() => "")).catch(() => {});
  }
  throw error;
} finally {
  await stop();
  await writeFile(join(artifacts, "app.log"), output);
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }).catch((error) => console.warn(`Temporary profile cleanup: ${error.message}`));
}
