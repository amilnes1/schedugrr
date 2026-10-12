import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { BoardStore } from "../server/board-store.mjs";
import { createScheduGrrServer } from "../server/app.mjs";

export const executable = resolve(process.env.SCHEDUGRR_QA_EXECUTABLE ?? `src-tauri/target/release/schedugrr${process.platform === "win32" ? ".exe" : ""}`);
export async function unusedPort() {
  const server = createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const { port } = server.address(); await new Promise((accept) => server.close(accept)); return port;
}
export async function startBackend(profile, requestedPort) {
  const port = requestedPort ?? await unusedPort();
  const child = spawn(executable, ["--headless-api"], { env: { ...process.env, SCHEDUGRR_USER_DATA_DIR: profile, SCHEDUGRR_PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; child.stdout.on("data", (v) => output += v); child.stderr.on("data", (v) => output += v);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return { child, base, port }; } catch {}
    if (child.exitCode !== null) throw new Error(`Backend exited: ${output}`);
    await new Promise((r) => setTimeout(r, 50));
  }
  child.kill(); throw new Error(`Backend did not start: ${output}`);
}
export async function stopBackend(child) { if (child.exitCode === null) { child.kill(); await once(child, "exit"); } }

async function test() {
  const profile = await mkdtemp(join(tmpdir(), "schedugrr-tauri-api-"));
  let native;
  const referenceStore = new BoardStore(join(profile, "reference.json"));
  const reference = createScheduGrrServer(referenceStore);
  reference.listen(0, "127.0.0.1"); await once(reference, "listening");
  const referenceBase = `http://127.0.0.1:${reference.address().port}`;
  const nativeIds = new Map();
  function normalize(value) {
    if (typeof value === "string") return nativeIds.get(value) ?? value;
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !["createdAt", "updatedAt"].includes(key)).map(([key, v]) => [nativeIds.get(key) ?? key, normalize(v)]));
    return value;
  }
  let checks = 0;
  async function compare(path, method = "GET", body) {
    const init = { method, headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:5173" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
    const [a, b] = await Promise.all([fetch(native.base + path, init), fetch(referenceBase + [...nativeIds].reduce((p, [actual, expected]) => p.replaceAll(actual, expected), path), { ...init, ...(body === undefined ? {} : { body: JSON.stringify(normalize(body)) }) })]);
    const [actual, expected] = await Promise.all([a.json(), b.json()]);
    assert.equal(a.status, b.status, `${method} ${path}: ${JSON.stringify(actual)}`);
    if (method === "POST" && a.status === 201) for (const key of ["list", "task"]) if (actual[key]) nativeIds.set(actual[key].id, expected[key].id);
    assert.deepEqual(normalize(actual), normalize(expected), `${method} ${path}`); checks++; return actual;
  }
  try {
    native = await startBackend(profile);
    await compare("/api/board");
    const fixture = { lists: { work: { id: "work", name: "Work", color: "sky", order: 0, taskOrder: "priority" }, home: { id: "home", name: "Home", color: "sage", order: 1, taskOrder: "priority" } }, tasks: {} };
    await compare("/api/board", "PUT", fixture);
    const created=[];
    for (const [title, priority] of [["Low", "low"], ["High", "high"], ["Medium", "medium"]]) {
      const result=await compare("/api/tasks", "POST", { title, priority, listName: "Work", date: "2026-10-12", time: "09:30" }); created.push(result.task);
    }
    for (const query of ["", "?q=HIGH&status=open", "?listName=work", "?date=2026-10-12", "?date=unscheduled", "?status=completed", "?listId=missing"]) await compare("/api/tasks"+query);
    await compare("/api/context");
    await compare(`/api/tasks/${created[0].id}/move`, "POST", { listId: "work", index: 0 });
    await compare("/api/context");
    await compare("/api/lists/work", "PATCH", { taskOrder: "priority", name: "Office", color: "plum" });
    await compare(`/api/tasks/${created[1].id}`, "PATCH", { title: "High updated", notes: "Notes", priority: "medium", completed: true, listName: "Home", date: null });
    await compare("/api/context");
    for (const input of [{ time: "10:15" }, { date: "bad" }, { time: "25:30" }, { title: "  " }, { priority: "urgent" }, { listId: "missing" }]) await compare(`/api/tasks/${created[1].id}`, "PATCH", input);
    await compare("/api/board");
    const archived = await (await fetch(native.base + "/api/board")).json();
    archived.tasks[created[0].id].archived = true; archived.tasks[created[0].id].completed = true;
    await compare("/api/board", "PUT", archived);
    const retained = await compare(`/api/tasks/${created[0].id}`, "PATCH", { notes: "Archive state retained" });
    assert.equal(retained.task.archived, true);
    await compare("/api/context");
    await compare(`/api/tasks/${created[2].id}`, "DELETE");
    await compare("/api/lists/home", "DELETE"); await compare("/api/context");
    await compare("/openapi.json"); await compare("/api/missing");
    for (const origin of ["https://example.com", "null"]) {
      const r=await fetch(native.base+"/api/tasks", {method:"POST", headers:{Origin:origin,"Content-Type":"application/json"},body:'{"title":"Denied"}'}); assert.equal(r.status,403);checks++;
    }
    assert.equal((await fetch(native.base+"/api/tasks",{method:"POST",body:"bad"})).status,400);checks++;
    const controller=new AbortController();const stream=await fetch(native.base+"/api/events",{signal:controller.signal});assert.match(stream.headers.get("content-type"),/text\/event-stream/);const reader=stream.body.getReader();assert.match(new TextDecoder().decode((await reader.read()).value),/data:/);controller.abort();checks++;
    const status=await (await fetch(native.base+"/api/calendar/status")).json();assert.equal(status.available,process.platform==="darwin");checks++;
    const snapshot=await (await fetch(native.base+"/api/board")).json();await stopBackend(native.child);native=await startBackend(profile);assert.deepEqual(await (await fetch(native.base+"/api/board")).json(),snapshot);checks++;
    assert.ok(Buffer.byteLength(await readFile(executable))<50_000_000,"Release executable exceeds 50 MB");checks++;
    console.log(`Tauri API parity passed: ${checks} checks, atomic persistence, invalid-input rollback, SSE, platform calendar status, and relaunch.`);

  } finally {
    if (native) await stopBackend(native.child);
    await new Promise((r)=>reference.close(()=>r()));

    await rm(profile,{recursive:true,force:true});
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await test();
