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
      const probe = "__openagenda_probe__";
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

function withLegacyMigration(storage: SyncStateStorage): StateStorage {
  const legacyKeys: Record<string, string> = {
    "openagenda.v1": "openboard.v1",
    "openagenda.ui.v1": "openboard.ui.v1",
  };
  return {
    getItem: (key) => {
      const current = storage.getItem(key);
      if (current !== null) return current;
      const legacyKey = legacyKeys[key];
      if (!legacyKey) return null;
      const legacy = storage.getItem(legacyKey);
      if (legacy !== null) storage.setItem(key, legacy);
      return legacy;
    },
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
  };
}

/** A JSON storage engine safe to use in every environment. */
export const persistStorage = createJSONStorage(() => withLegacyMigration(safeStorage()));
