import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);

export function loadNativeCalendarBridge({ packaged, resourcesPath, projectRoot }) {
  if (process.platform !== "darwin") return null;
  const directory = packaged
    ? join(resourcesPath, "native")
    : join(projectRoot, "build", "native");
  const addonPath = ["schedugrr_calendar_bridge.node", "openagenda_calendar_bridge.node"]
    .map((name) => join(directory, name))
    .find((candidate) => {
      try {
        require.resolve(candidate);
        return true;
      } catch {
        return false;
      }
    }) ?? join(directory, "schedugrr_calendar_bridge.node");

  try {
    const native = require(addonPath);
    const parse = async (operation) => JSON.parse(await operation);
    return {
      authorizationStatus: () => native.authorizationStatus(),
      requestFullAccess: () => parse(native.requestFullAccess()),
      listCalendars: () => parse(native.listCalendars()),
      syncTasks: (input) => parse(native.syncTasks(JSON.stringify(input))),
    };
  } catch (error) {
    console.warn("ScheduGrr could not load its EventKit bridge", error);
    return null;
  }
}
