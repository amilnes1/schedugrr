// Runs against the packaged WebView2 application through tauri-driver on Windows.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { unusedPort } from "../../scripts/test-tauri-api.mjs";
if (process.platform !== "win32") throw new Error("Native Windows UI QA requires Windows and tauri-driver.");
const profile = await mkdtemp(join(tmpdir(), "schedugrr-windows-qa-"));
const port = await unusedPort(); const driverPort = await unusedPort();
const executable = resolve(process.env.SCHEDUGRR_QA_EXECUTABLE ?? "src-tauri/target/release/schedugrr.exe");
const driver = spawn("tauri-driver", ["--port", String(driverPort)], { env: { ...process.env, SCHEDUGRR_PORT: String(port), SCHEDUGRR_USER_DATA_DIR: profile }, stdio: "inherit" });
let session;
const base = `http://127.0.0.1:${driverPort}`;
async function wd(path, body, method = "POST") {
  const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json(); if (!response.ok || result.value?.error) throw new Error(JSON.stringify(result)); return result.value;
}
async function waitFor(fn) { let last; for (let i=0; i<100; i++) { try { const v=await fn(); if(v) return v; } catch(e){last=e} await new Promise(r=>setTimeout(r,100)); } throw last ?? new Error("Timed out"); }
const endpoint = (path) => `/session/${session}${path}`;
async function element(xpath) { return (await waitFor(()=>wd(endpoint("/element"), { using: "xpath", value: xpath })))["element-6066-11e4-a52e-4f735466cecf"]; }
async function click(xpath) { const id=await element(xpath); await wd(endpoint(`/element/${id}/click`), {}); }
async function input(xpath,value) { const id=await element(xpath); await wd(endpoint(`/element/${id}/clear`), {}); await wd(endpoint(`/element/${id}/value`), {text:value}); }
async function script(script,args=[]) {return wd(endpoint("/execute/sync"),{script,args});}
async function request(path, method="GET", body) {const r=await fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.ok(r.ok);return r.json()}
async function launch() {
  // The app uses this explicit WebView2 profile (see create_window in main.rs).
  // EdgeDriver otherwise looks for DevToolsActivePort in a different temp folder.
  const created = await wd("/session", {
    capabilities: {
      alwaysMatch: {
        "tauri:options": {
          application: executable,
          webviewOptions: { userDataFolder: join(profile, "WebKit") },
        },
      },
    },
  });
  session = created.sessionId;
  await waitFor(async () => { try { return (await request("/api/health")).ok; } catch { return false; } });
  await element("//*[normalize-space(text())='ScheduGrr']");
}
try {
  await waitFor(async()=>{try{return (await fetch(base+"/status")).ok}catch{return false}});
  await launch();
  assert.equal((await request("/api/calendar/status")).available,false);
  await click("//button[normalize-space(.)='Board']");
  await click("//button[@aria-label='Rename Work list']");
  await input("//input[@aria-label='List name for Work']","Workroom");
  await wd(endpoint(`/element/${await element("//input[@aria-label='List name for Work']")}/value`),{text:"\uE007"});
  await element("//h2[normalize-space(.)='Workroom']");
  const {task}=await request("/api/tasks","POST",{title:"Windows QA task",listName:"Workroom",date:"2026-10-12",time:"09:30",priority:"high"});
  await click("//*[normalize-space(text())='Windows QA task']");
  await input("//input[@aria-label='Task time']","14:15");
  await click("//button[@aria-label='Close']");
  await waitFor(async()=>(await request("/api/tasks")).tasks.some(t=>t.id===task.id&&t.time==="14:15"));
  await request(`/api/tasks/${task.id}`,"PATCH",{completed:true});
  await element("//*[@role='status' and contains(@aria-label,'Completed: Windows QA task')]");
  await wd(endpoint("/window/rect"),{width:1000,height:720});
  assert.ok(await script("return document.body.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight"));
  const screenshot=await wd(endpoint("/screenshot"),undefined,"GET");await writeFile(join(profile,"windows-native.png"),Buffer.from(screenshot,"base64"));
  await wd(endpoint(""),undefined,"DELETE");session=null;
  await launch();await click("//button[normalize-space(.)='Board']");await element("//h2[normalize-space(.)='Workroom']");await element("//*[normalize-space(text())='Windows QA task']");
  assert.equal((await request("/api/tasks")).tasks.find(t=>t.id===task.id).time,"14:15");
  console.log("Native Windows WebView2 QA passed: UI edits, API notifications, task time/completion, minimum layout, and relaunch.");
} finally {
  if(session) await wd(endpoint(""),undefined,"DELETE").catch(()=>{});
  driver.kill();await rm(profile,{recursive:true,force:true});
}
