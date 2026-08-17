import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ApiError } from "../server/board-store.mjs";

const DEFAULT_SETTINGS = {
  enabled: false,
  calendarId: null,
  includeUntimed: true,
  durationMinutes: 30,
};

async function readJSON(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return structuredClone(fallback);
    throw error;
  }
}

async function writeJSON(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

export class CalendarSyncManager {
  constructor({ bridge, store, settingsPath, mappingsPath, debounceMs = 350 }) {
    this.bridge = bridge;
    this.store = store;
    this.settingsPath = settingsPath;
    this.mappingsPath = mappingsPath;
    this.debounceMs = debounceMs;
    this.settings = structuredClone(DEFAULT_SETTINGS);
    this.mappings = {};
    this.lastSync = null;
    this.timer = null;
    this.syncQueue = Promise.resolve();
    this.ready = this.load();
    this.unsubscribe = store.subscribe(() => this.schedule());
  }

  async load() {
    const [settings, mappings] = await Promise.all([
      readJSON(this.settingsPath, DEFAULT_SETTINGS),
      readJSON(this.mappingsPath, {}),
    ]);
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.mappings = mappings && typeof mappings === "object" ? mappings : {};
  }

  close() {
    this.unsubscribe?.();
    if (this.timer) clearTimeout(this.timer);
  }

  schedule() {
    if (!this.bridge || !this.settings.enabled) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.syncNow().catch((error) => {
        console.warn("OpenAgenda calendar sync failed", error);
      });
    }, this.debounceMs);
  }

  async authorizationStatus() {
    return this.bridge?.authorizationStatus() ?? "unavailable";
  }

  async getStatus() {
    await this.ready;
    return {
      available: Boolean(this.bridge),
      platform: process.platform,
      authorization: await this.authorizationStatus(),
      settings: structuredClone(this.settings),
      lastSync: this.lastSync ? structuredClone(this.lastSync) : null,
    };
  }

  async requestAccess() {
    await this.ready;
    if (!this.bridge) throw new ApiError(501, "Native calendar sync is available in the macOS desktop app.");
    const result = await this.bridge.requestFullAccess();
    return { ...result, status: await this.getStatus() };
  }

  async listCalendars() {
    await this.ready;
    if (!this.bridge) return [];
    if ((await this.authorizationStatus()) !== "fullAccess") return [];
    return this.bridge.listCalendars();
  }

  async updateSettings(input = {}) {
    await this.ready;
    const next = { ...this.settings };
    if (input.enabled !== undefined) next.enabled = Boolean(input.enabled);
    if (input.calendarId !== undefined) {
      next.calendarId = input.calendarId === null ? null : String(input.calendarId).trim() || null;
    }
    if (input.includeUntimed !== undefined) next.includeUntimed = Boolean(input.includeUntimed);
    if (input.durationMinutes !== undefined) {
      const duration = Number(input.durationMinutes);
      if (!Number.isInteger(duration) || duration < 5 || duration > 720) {
        throw new ApiError(400, "durationMinutes must be an integer from 5 to 720");
      }
      next.durationMinutes = duration;
    }
    if (next.enabled && !next.calendarId) throw new ApiError(400, "Choose a calendar before enabling sync.");
    if (next.enabled && (await this.authorizationStatus()) !== "fullAccess") {
      throw new ApiError(403, "Calendar access is required before enabling sync.");
    }

    this.settings = next;
    await writeJSON(this.settingsPath, this.settings);
    if (this.settings.enabled) await this.syncNow();
    return this.getStatus();
  }

  async syncNow() {
    await this.ready;
    if (!this.bridge) throw new ApiError(501, "Native calendar sync is available in the macOS desktop app.");
    if (!this.settings.enabled || !this.settings.calendarId) {
      throw new ApiError(409, "Calendar sync is not enabled.");
    }

    const operation = this.syncQueue.then(async () => {
      const board = await this.store.read();
      const tasks = Object.values(board.tasks).map((task) => ({
        ...task,
        listName: board.lists[task.listId]?.name ?? "",
      }));
      const result = await this.bridge.syncTasks({
        calendarId: this.settings.calendarId,
        includeUntimed: this.settings.includeUntimed,
        durationMinutes: this.settings.durationMinutes,
        mappings: this.mappings,
        tasks,
      });
      this.mappings = result.mappings ?? {};
      await writeJSON(this.mappingsPath, this.mappings);
      this.lastSync = {
        at: new Date().toISOString(),
        created: result.created ?? 0,
        updated: result.updated ?? 0,
        deleted: result.deleted ?? 0,
        skipped: result.skipped ?? 0,
        errors: result.errors ?? [],
      };
      return structuredClone(this.lastSync);
    });
    this.syncQueue = operation.catch(() => undefined);
    return operation;
  }
}
