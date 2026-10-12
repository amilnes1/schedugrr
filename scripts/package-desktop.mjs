import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, rm, symlink, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";
const args = process.argv.slice(2);
const windows = args.includes("--win");
const universal = args.includes("--universal");
if (windows && process.platform !== "win32") throw new Error("Build Windows installers on Windows with the MSVC tools and WebView2 SDK.");
const tauri = resolve("node_modules/@tauri-apps/cli/tauri.js");
const buildArgs = windows ? ["--target", "x86_64-pc-windows-msvc", "--bundles", "nsis"] : process.platform === "darwin" ? ["--bundles", "app", ...(universal ? ["--target", "universal-apple-darwin"] : [])] : [];
const result = spawnSync(process.execPath, [tauri, "build", ...buildArgs], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (process.platform === "darwin") {
  const root = resolve("src-tauri/target", ...(universal ? ["universal-apple-darwin"] : []), "release/bundle");
  const app = join(root, "macos/ScheduGrr.app");
  if (!process.env.APPLE_SIGNING_IDENTITY) {
    const sign = spawnSync("codesign", ["--force", "--deep", "--sign", "-", "--options", "runtime", "--entitlements", resolve("src-tauri/Entitlements.plist"), app], { stdio: "inherit" });
    if (sign.error) throw sign.error;
    if (sign.status !== 0) throw new Error("Local ad-hoc signing failed");
  }
  const verify = spawnSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
  if (verify.status !== 0) throw new Error("Application signature verification failed");
  const version = JSON.parse(readFileSync("package.json", "utf8")).version;
  const staging = await mkdtemp(join(tmpdir(), "schedugrr-dmg-"));
  try {
    await cp(app, join(staging, "ScheduGrr.app"), { recursive: true });
    await symlink("/Applications", join(staging, "Applications"));
    const out = join(root, "dmg", `ScheduGrr_${version}_${universal ? "universal" : process.arch}.dmg`);
    await mkdir(join(root, "dmg"), { recursive: true });
    // A standard compressed disk image needs no Finder automation permission.
    const dmg = spawnSync("hdiutil", ["create", "-volname", "ScheduGrr", "-srcfolder", staging, "-ov", "-format", "UDZO", out], { stdio: "inherit" });
    if (dmg.error) throw dmg.error;
    if (dmg.status !== 0) throw new Error(`Disk image creation failed: ${dmg.status}`);
    if ((await stat(out)).size >= 50_000_000) throw new Error("Disk image exceeds the 50 MB size budget");
    console.log(`Disk image: ${out}`);
  } finally { await rm(staging, { recursive: true, force: true }); }
}
