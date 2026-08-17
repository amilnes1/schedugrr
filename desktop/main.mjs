import { app, BrowserWindow, Menu, dialog, session, shell } from "electron";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BoardStore } from "../server/board-store.mjs";
import { createOpenAgendaServer } from "../server/app.mjs";
import { CalendarSyncManager } from "./calendar-sync.mjs";
import { loadNativeCalendarBridge } from "./native-calendar.mjs";

const HOST = "127.0.0.1";
const requestedPort = Number.parseInt(process.env.OPENAGENDA_PORT ?? "8787", 10);
const PORT = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535 ? requestedPort : 8787;
const APP_ORIGIN = `http://${HOST}:${PORT}`;
const DEFAULT_BOUNDS = { width: 1440, height: 900 };
const projectRoot = fileURLToPath(new URL("..", import.meta.url));

let mainWindow = null;
let localServer = null;
let calendarSync = null;
let quitting = false;

app.setName("OpenAgenda");
if (process.env.OPENAGENDA_USER_DATA_DIR) {
  app.setPath("userData", resolve(process.env.OPENAGENDA_USER_DATA_DIR));
}
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

function statePath() {
  return join(app.getPath("userData"), "window-state.json");
}

function readWindowState() {
  try {
    const saved = JSON.parse(readFileSync(statePath(), "utf8"));
    if (Number.isFinite(saved.width) && Number.isFinite(saved.height)) return saved;
  } catch {
    // First launch or an invalid state file: use the calm, roomy default.
  }
  return DEFAULT_BOUNDS;
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized()) return;
  try {
    writeFileSync(statePath(), `${JSON.stringify(mainWindow.getBounds(), null, 2)}\n`, "utf8");
  } catch (error) {
    console.warn("Could not save OpenAgenda window state", error);
  }
}

function installApplicationMenu() {
  const template = [
    ...(process.platform === "darwin"
      ? [{
          label: app.name,
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        }]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, ...(process.platform === "darwin" ? [{ type: "separator" }, { role: "front" }] : [{ role: "close" }])] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function migrateLegacyUserData() {
  const currentDirectory = app.getPath("userData");
  const legacyDirectory = join(app.getPath("appData"), "OpenBoard");
  mkdirSync(currentDirectory, { recursive: true });
  const migrations = [
    [join(legacyDirectory, "openboard.json"), join(currentDirectory, "openagenda.json")],
    [join(currentDirectory, "openboard.json"), join(currentDirectory, "openagenda.json")],
    [join(legacyDirectory, "window-state.json"), join(currentDirectory, "window-state.json")],
  ];
  for (const [source, destination] of migrations) {
    if (source !== destination && existsSync(source) && !existsSync(destination)) {
      copyFileSync(source, destination);
      console.log(`Migrated OpenBoard data to ${destination}`);
    }
  }
}

async function startLocalServer() {
  const userData = app.getPath("userData");
  const dataFile = join(userData, "openagenda.json");
  const store = new BoardStore(dataFile);
  await store.ready;
  const bridge = loadNativeCalendarBridge({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    projectRoot,
  });
  calendarSync = new CalendarSyncManager({
    bridge,
    store,
    settingsPath: join(userData, "calendar-settings.json"),
    mappingsPath: join(userData, "calendar-mappings.json"),
  });
  await calendarSync.ready;
  localServer = createOpenAgendaServer(store, { calendar: calendarSync });
  await new Promise((resolve, reject) => {
    localServer.once("error", reject);
    localServer.listen(PORT, HOST, () => {
      localServer.off("error", reject);
      resolve();
    });
  });
  console.log(`OpenAgenda desktop API ready at ${APP_ORIGIN}`);
  console.log(`Board data: ${dataFile}`);
}

function createWindow() {
  const bounds = readWindowState();
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 980,
    minHeight: 660,
    show: false,
    backgroundColor: "#f7f3ea",
    title: "OpenAgenda",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 18, y: 19 } : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  const desktopFlavor = process.platform === "darwin" ? "mac" : process.platform;
  const appUrl = `${APP_ORIGIN}/?desktop=${desktopFlavor}`;
  mainWindow.loadURL(appUrl);
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("close", saveWindowState);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== APP_ORIGIN) event.preventDefault();
  });
}

app.whenReady().then(async () => {
  migrateLegacyUserData();
  app.setAboutPanelOptions({
    applicationName: "OpenAgenda",
    applicationVersion: app.getVersion(),
    copyright: "Copyright © 2026 Alec Milnes",
    credits: "Created and maintained by Alec Milnes. Open source under the MIT License.",
  });
  installApplicationMenu();
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  try {
    await startLocalServer();
    createWindow();
  } catch (error) {
    const detail = error?.code === "EADDRINUSE"
      ? `Another process is already using ${APP_ORIGIN}. Quit it, then reopen OpenAgenda.`
      : error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("OpenAgenda could not start", detail);
    app.quit();
  }
});

app.on("activate", () => {
  if (!mainWindow && localServer?.listening) createWindow();
});

app.on("before-quit", () => {
  quitting = true;
  saveWindowState();
  calendarSync?.close();
  localServer?.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !quitting) app.quit();
});
