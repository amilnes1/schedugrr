import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(npm, ["run", "api"], { stdio: "inherit", env: process.env }),
  spawn(npm, ["run", "dev:web", "--", "--host", "127.0.0.1"], {
    stdio: "inherit",
    env: process.env,
  }),
];

let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (!stopping && code !== 0) {
      console.error(`ScheduGrr dev process exited (${signal ?? code}).`);
      stop(code ?? 1);
    }
  });
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
