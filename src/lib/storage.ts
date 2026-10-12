import { createJSONStorage, type StateStorage } from "zustand/middleware";

type SyncStateStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

/**
 * localStorage when it is actually usable, falling back to an in-memory store
 * (private browsing, SSR, and test environments) so persistence never throws.
 */
function safeStorage(): SyncStateStorage {
  try {
    const ls = globalThis.localStorage;
    if (ls && typeof ls.setItem === "function") {
      const probe = "__schedugrr_probe__";
      ls.setItem(probe, "1");
      ls.removeItem(probe);
      return ls;
    }
  } catch {
    /* fall through to memory */
  }
  const mem = new Map<string, string>();
  return {
    getItem: (key) => mem.get(key) ?? null,
    setItem: (key, value) => void mem.set(key, value),
    removeItem: (key) => void mem.delete(key),
  };
}

let preferencesTimer: ReturnType<typeof setTimeout> | undefined;
function saveNativePreferences(storage: SyncStateStorage) {
  if (typeof window === "undefined" || !new URLSearchParams(window.location.search).has("desktop")) return;
  clearTimeout(preferencesTimer);
  preferencesTimer = setTimeout(() => {
    const value = storage.getItem("schedugrr.ui.v1");
    if (value !== null) void fetch("/api/preferences", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ "schedugrr.ui.v1": value }), keepalive: true,
    }).catch(() => {});
  }, 80);
}

function withLegacyMigration(storage: SyncStateStorage): StateStorage {
  const legacyKeys: Record<string, string[]> = {
    "schedugrr.v1": ["openagenda.v1", "openboard.v1"],
    "schedugrr.ui.v1": ["openagenda.ui.v1", "openboard.ui.v1"],
  };
  return {
    getItem: (key) => {
      const current = storage.getItem(key);
      if (current !== null) return current;
      const candidates = legacyKeys[key] ?? [];
      for (const legacyKey of candidates) {
        const legacy = storage.getItem(legacyKey);
        if (legacy !== null) {
          storage.setItem(key, legacy);
          return legacy;
        }
      }
      return null;
    },
    setItem: (key, value) => {
      storage.setItem(key, value);
      if (key === "schedugrr.ui.v1") saveNativePreferences(storage);
    },
    removeItem: (key) => storage.removeItem(key),
  };
}

/** A JSON storage engine safe to use in every environment. */
export const persistStorage = createJSONStorage(() => withLegacyMigration(safeStorage()));
