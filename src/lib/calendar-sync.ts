export interface NativeCalendar {
  id: string;
  title: string;
  source: string;
  color: string;
  writable: boolean;
}

export interface CalendarSettings {
  enabled: boolean;
  calendarId: string | null;
  includeUntimed: boolean;
  durationMinutes: number;
}

export interface CalendarSyncResult {
  at: string;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  errors: string[];
}

export interface CalendarStatus {
  available: boolean;
  platform: string;
  authorization: "notDetermined" | "restricted" | "denied" | "writeOnly" | "fullAccess" | "unavailable" | "unknown";
  settings: CalendarSettings;
  lastSync: CalendarSyncResult | null;
}

const apiBase = import.meta.env.DEV ? "http://127.0.0.1:8787" : "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `ScheduGrr calendar API returned ${response.status}`);
  return data;
}

export const calendarApi = {
  status: () => request<CalendarStatus>("/api/calendar/status"),
  requestAccess: () => request<{ granted: boolean; authorization: string }>("/api/calendar/access", { method: "POST" }),
  calendars: async () => (await request<{ calendars: NativeCalendar[] }>("/api/calendar/calendars")).calendars,
  updateSettings: (patch: Partial<CalendarSettings>) => request<CalendarStatus>("/api/calendar/settings", {
    method: "PUT",
    body: JSON.stringify(patch),
  }),
  sync: () => request<{ sync: CalendarSyncResult; status: CalendarStatus }>("/api/calendar/sync", { method: "POST" }),
};
