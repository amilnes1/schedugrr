import { spawnSync } from "node:child_process";
import { join } from "node:path";

export default async function afterPack(context) {
  if (context.electronPlatformName !== "darwin" || process.env.OPENAGENDA_ADHOC_SIGN !== "1") return;
  // Universal packaging first creates architecture-specific temporary apps.
  // Signing those changes CodeResources and prevents @electron/universal from
  // comparing and merging the two bundles. Sign only the combined output.
  if (context.appOutDir.endsWith("-temp")) return;

  const appPath = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const entitlements = join(context.packager.projectDir, "build", "entitlements.mac.plist");
  const result = spawnSync(
    "codesign",
    ["--deep", "--force", "--sign", "-", "--options", "runtime", "--entitlements", entitlements, appPath],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Ad-hoc signing failed with status ${result.status}`);
}
