export function todayISO(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function monthKey(date: Date | string = new Date()): string {
  return typeof date === "string"
    ? date.slice(0, 7)
    : todayISO(date).slice(0, 7);
}

/** Read calendar dates locally, avoiding the UTC-midnight shift of new Date('YYYY-MM-DD'). */
export function parseCalendarDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day || 1, 12);
}

export function monthLabel(date: Date | string = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(typeof date === "string" ? parseCalendarDate(date) : date);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parseCalendarDate(value));
}
