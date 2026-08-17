import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const output = join(projectRoot, "build", "native", "schedugrr_calendar_bridge.node");
mkdirSync(dirname(output), { recursive: true });

if (process.platform !== "darwin") {
  console.log("Skipping EventKit bridge: calendar sync is currently available on macOS only.");
  process.exit(0);
}

const source = join(projectRoot, "native", "macos", "calendar_bridge.mm");
const prefix = process.config.variables.node_prefix;
const includeCandidates = [
  process.env.NODE_INCLUDE_DIR,
  prefix ? join(String(prefix), "include", "node") : null,
  "/opt/homebrew/include/node",
  "/usr/local/include/node",
  "/usr/include/node",
].filter(Boolean);
const include = includeCandidates.find((candidate) => existsSync(join(candidate, "node_api.h")));

if (!include) {
  throw new Error("Could not find node_api.h. Set NODE_INCLUDE_DIR to the directory containing it.");
}

const args = [
  "clang++",
  "-std=c++17",
  "-fobjc-arc",
  "-dynamiclib",
  "-undefined",
  "dynamic_lookup",
  "-mmacosx-version-min=12.0",
  "-arch",
  "arm64",
  "-arch",
  "x86_64",
  "-DNAPI_VERSION=8",
  `-I${include}`,
  "-framework",
  "Foundation",
  "-framework",
  "EventKit",
  source,
  "-o",
  output,
];

const result = spawnSync("xcrun", args, { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`EventKit bridge build failed with status ${result.status}`);

console.log(`Built macOS EventKit bridge: ${output}`);
