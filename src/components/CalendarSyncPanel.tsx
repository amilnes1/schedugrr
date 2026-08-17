import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarCheck, Check, ChevronDown, RefreshCw, ShieldCheck } from "lucide-react";
import { calendarApi, type CalendarSettings, type CalendarStatus, type NativeCalendar } from "@/lib/calendar-sync";
import { cn } from "@/lib/cn";

const fallbackStatus: CalendarStatus = {
  available: false,
  platform: "web",
  authorization: "unavailable",
  settings: { enabled: false, calendarId: null, includeUntimed: true, durationMinutes: 30 },
  lastSync: null,
};

export function CalendarSyncPanel() {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [calendars, setCalendars] = useState<NativeCalendar[]>([]);
  const [busy, setBusy] = useState(false);
  const [calendarPickerOpen, setCalendarPickerOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const next = await calendarApi.status();
      setStatus(next);
      if (next.authorization === "fullAccess") setCalendars(await calendarApi.calendars());
    } catch {
      setStatus(fallbackStatus);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const perform = async (operation: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await operation();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Calendar operation failed.");
    } finally {
      setBusy(false);
    }
  };

  const update = (patch: Partial<CalendarSettings>) => perform(async () => {
    const next = await calendarApi.updateSettings(patch);
    setStatus(next);
    setMessage(next.settings.enabled ? "Calendar is up to date." : "Calendar sync is paused.");
  });

  if (!status) {
    return (
      <PanelShell>
        <p className="text-[12px] text-ink-faint">Checking this Mac…</p>
      </PanelShell>
    );
  }

  if (!status.available) {
    return (
      <PanelShell>
        <div className="flex gap-2.5">
          <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
          <p className="text-[11.5px] leading-relaxed text-ink-soft">
            Native calendar sync is available in the macOS desktop app. JSON export remains available everywhere.
          </p>
        </div>
      </PanelShell>
    );
  }

  if (status.authorization !== "fullAccess") {
    return (
      <PanelShell>
        <div className="flex gap-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sage" />
          <div>
            <p className="text-[12px] font-medium text-ink">Put your tasks on Calendar</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-soft">
              Choose where scheduled tasks should appear. OpenAgenda updates only the Calendar events it creates.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => perform(async () => {
            const result = await calendarApi.requestAccess();
            if (!result.granted) throw new Error("Calendar access was not granted. You can enable it later in System Settings.");
            await refresh();
            setMessage("Calendar access is ready.");
          })}
          className="ring-focus mt-3 w-full rounded-[8px] bg-accent px-3 py-2 text-[11.5px] font-semibold text-white shadow-[var(--shadow-sm)] transition-all hover:-translate-y-px hover:shadow-[var(--shadow-md)] disabled:opacity-50"
        >
          {busy ? "Waiting for permission…" : "Connect Calendar"}
        </button>
        <StatusMessage message={message} />
      </PanelShell>
    );
  }

  const selectedCalendarId = status.settings.calendarId ?? calendars[0]?.id ?? "";
  const selectedCalendar = calendars.find((calendar) => calendar.id === selectedCalendarId) ?? calendars[0];

  return (
    <PanelShell>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <span className="setting-label">Calendar</span>
        <button
          type="button"
          aria-label="Calendar for task sync"
          aria-haspopup="listbox"
          aria-expanded={calendarPickerOpen}
          disabled={busy || calendars.length === 0}
          onClick={() => setCalendarPickerOpen((open) => !open)}
          className="ring-focus mt-1.5 flex w-full items-center gap-2 rounded-[8px] border border-line bg-paper-raised px-2.5 py-2 text-left text-[11.5px] text-ink shadow-[var(--shadow-sm)]"
        >
          {selectedCalendar ? (
            <>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: selectedCalendar.color }} />
              <span className="min-w-0 flex-1 truncate">{selectedCalendar.title}</span>
              <span className="truncate font-mono text-[9.5px] text-ink-faint">{selectedCalendar.source}</span>
            </>
          ) : <span className="flex-1 text-ink-faint">No writable calendars</span>}
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform", calendarPickerOpen && "rotate-180")} />
        </button>
        {calendarPickerOpen && (
          <div role="listbox" aria-label="Writable calendars" className="mt-1 overflow-hidden rounded-[8px] border border-line bg-paper-raised p-1 shadow-[var(--shadow-md)]">
            {calendars.map((calendar) => (
              <button
                key={calendar.id}
                type="button"
                role="option"
                aria-selected={calendar.id === selectedCalendarId}
                onClick={() => {
                  setCalendarPickerOpen(false);
                  void update({ calendarId: calendar.id });
                }}
                className="ring-focus flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[11px] text-ink-soft hover:bg-paper-sunken hover:text-ink"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: calendar.color }} />
                <span className="min-w-0 flex-1 truncate">{calendar.title}</span>
                <span className="truncate font-mono text-[9px] text-ink-faint">{calendar.source}</span>
                {calendar.id === selectedCalendarId && <Check className="h-3.5 w-3.5 shrink-0 text-sage" />}
              </button>
            ))}
          </div>
        )}
      </motion.div>

      <SettingSwitch
        label="Keep Calendar in step"
        description="Scheduled tasks update automatically."
        checked={status.settings.enabled}
        disabled={busy || !selectedCalendarId}
        onChange={(enabled) => void update({ enabled, calendarId: selectedCalendarId || null })}
      />
      <SettingSwitch
        label="Tasks with only a date"
        description="Shown across the top as all-day."
        checked={status.settings.includeUntimed}
        disabled={busy}
        onChange={(includeUntimed) => void update({ includeUntimed })}
      />

      <div>
        <label className="block">
          <span className="setting-label">When there’s no end time</span>
          <select
            aria-label="Default timed task duration"
            value={status.settings.durationMinutes}
            disabled={busy}
            onChange={(event) => void update({ durationMinutes: Number(event.target.value) })}
            className="ring-focus mt-1.5 w-full rounded-[8px] border border-line bg-paper-raised px-2.5 py-2 text-[11.5px] text-ink"
          >
            {[15, 30, 45, 60, 90, 120].map((minutes) => (
              <option key={minutes} value={minutes}>{minutes < 60 ? `${minutes} min` : `${minutes / 60} hr${minutes > 60 ? "s" : ""}`}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2 border-t border-line pt-2.5 text-[10.5px] text-ink-faint">
        {status.settings.enabled && <Check className="h-3.5 w-3.5 text-sage" />}
        <span className="min-w-0 flex-1 truncate">
          {message ?? (status.settings.enabled
            ? status.lastSync ? `Synced ${status.lastSync.created + status.lastSync.updated} tasks · ${new Date(status.lastSync.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Ready to sync"
            : "Sync is paused")}
        </span>
        <button
          type="button"
          disabled={busy || !status.settings.enabled}
          onClick={() => perform(async () => {
            const result = await calendarApi.sync();
            setStatus(result.status);
            const count = result.sync.created + result.sync.updated + result.sync.deleted;
            setMessage(count === 0 ? "Already up to date." : `Synced ${count} calendar change${count === 1 ? "" : "s"}.`);
          })}
          className="ring-focus flex shrink-0 items-center gap-1 rounded-[6px] px-1.5 py-1 text-[10.5px] font-medium text-ink-soft transition-colors hover:bg-paper-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
          Sync now
        </button>
      </div>
    </PanelShell>
  );
}

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-label="Calendar sync settings"
      className="mx-1 mb-1 mt-1.5 space-y-3 rounded-[10px] border border-line bg-paper-sunken/45 p-3"
    >
      {children}
    </section>
  );
}

function SettingSwitch({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[11.5px] font-medium text-ink">{label}</p>
        <p className="mt-0.5 text-[10px] leading-snug text-ink-faint">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "ring-focus relative h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-45",
          checked ? "border-ink bg-ink" : "border-line-strong bg-paper-raised",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] h-3.5 w-3.5 rounded-full transition-transform",
            checked ? "translate-x-[17px] bg-paper-raised" : "translate-x-[2px] bg-ink-faint",
          )}
        />
      </button>
    </div>
  );
}

function StatusMessage({ message }: { message: string | null }) {
  return message ? <p aria-live="polite" className="text-[10.5px] leading-relaxed text-ink-soft">{message}</p> : null;
}
