import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isToday as dfIsToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";

/** Canonical calendar key: `yyyy-MM-dd` in local time. */
export type DateKey = string;

/** Weeks start on Monday throughout OpenAgenda. */
const WEEK_OPTS = { weekStartsOn: 1 } as const;

export function toKey(date: Date): DateKey {
  return format(date, "yyyy-MM-dd");
}

export function fromKey(key: DateKey): Date {
  return parseISO(key);
}

export function todayKey(): DateKey {
  return toKey(new Date());
}

export function isTodayKey(key: DateKey): boolean {
  return dfIsToday(fromKey(key));
}

/** The Monday-aligned grid of days that renders a month (always full weeks). */
export function monthGrid(monthAnchor: Date): Date[] {
  const start = startOfWeek(startOfMonth(monthAnchor), WEEK_OPTS);
  const end = endOfWeek(endOfMonth(monthAnchor), WEEK_OPTS);
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    days.push(d);
  }
  return days;
}

export function shiftMonth(anchor: Date, delta: number): Date {
  return addMonths(anchor, delta);
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Friendly relative label for a date key, e.g. "Today", "Tomorrow", "Fri 22". */
export function relativeLabel(key: DateKey): string {
  const date = fromKey(key);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return format(date, "EEEE");
  return format(date, "EEE d MMM");
}

/** Convert stored 24-hour `HH:mm` into a compact local display time. */
export function displayTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return format(new Date(2000, 0, 1, hours, minutes), "h:mm a");
}

export { format, addDays };
