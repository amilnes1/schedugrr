import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const testFiles = ["server", "desktop"]
  .flatMap((directory) => readdirSync(directory)
    .filter((name) => name.endsWith(".test.mjs"))
    .map((name) => join(directory, name)))
  .sort();

if (testFiles.length === 0) throw new Error("No API or desktop tests were found.");

const result = spawnSync(process.execPath, ["--test", ...testFiles], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
