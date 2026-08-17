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
  env.OPENAGENDA_ADHOC_SIGN = "1";
  console.log("Creating an ad-hoc signed local build. Set CSC_NAME or CSC_LINK for a public release.");
}

const executable = join(process.cwd(), "node_modules", ".bin", "electron-builder");
const result = spawnSync(executable, args, { env, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
