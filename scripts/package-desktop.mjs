import { spawnSync } from "node:child_process";
import { join } from "node:path";

const args = process.argv.slice(2);
const env = { ...process.env };
const targetsWindows = args.some((argument) => ["--win", "--windows", "-w"].includes(argument));

// An ad-hoc signature is enough for local QA on Apple Silicon. Public releases
// opt into Developer ID signing explicitly through CSC_NAME or CSC_LINK. This
// avoids silently selecting stale identities from a developer's keychain.
if (process.platform === "darwin" && !targetsWindows && !env.CSC_LINK && !env.CSC_NAME) {
  env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
  env.SCHEDUGRR_ADHOC_SIGN = "1";
  console.log("Creating an ad-hoc signed local build. Set CSC_NAME or CSC_LINK for a public release.");
}

// Invoke the JavaScript entry point through Node instead of the platform-specific
// `.bin` shim. Windows installs a `electron-builder.cmd` shim, which cannot be
// executed as a Unix-style binary by `spawnSync`.
const executable = join(process.cwd(), "node_modules", "electron-builder", "cli.js");
const result = spawnSync(process.execPath, [executable, ...args], { env, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
