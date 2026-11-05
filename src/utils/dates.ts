/**
 * Calendar-date helpers for lifecycle dates.
 *
 * Lifecycle dates are calendar days ("2026-11-10"), not instants. `new Date()`
 * parses a bare ISO date as midnight UTC, so comparing it with the current
 * instant made a framework reach end of life at a different moment for every
 * viewer: on the afternoon of the day BEFORE the published date in the
 * Americas, and partway through the day itself in Asia. Everything here works
 * in the viewer's local calendar instead, so a date means the same day for
 * everyone and "end of life on 10 November" holds for the whole of 10 November.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local midnight of a "YYYY-MM-DD" string, or null when it is not a real date. */
export function parseIsoDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  // Reject roll-overs such as 2026-02-31, which Date silently turns into March.
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** Local midnight of the day containing `now`. */
export function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Same day `months` months later, clamped to the end of a shorter month.
 * `setMonth` alone turns 31 August + 6 months into 3 March.
 */
export function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

/** True once the whole of the given calendar day is in the past. */
export function isDatePast(value: string | undefined | null, now: Date = new Date()): boolean {
  const date = parseIsoDate(value);
  return date !== null && date < startOfDay(now);
}

/** "YYYY-MM-DD" for the viewer's local calendar day (toISOString would give the UTC day). */
export function formatLocalIsoDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
