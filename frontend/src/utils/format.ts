const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" });
const numberFmt = new Intl.NumberFormat("en-US");
const compactFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFmt.format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFmt.format(date);
}

/** "2026-03" -> "Mar 26" */
export function formatMonth(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return monthFmt.format(new Date(Date.UTC(year, month - 1, 15)));
}

export function relativeTime(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  const abs = Math.abs(seconds);
  const suffix = seconds >= 0 ? "ago" : "from now";
  if (abs < 45) return "just now";
  const units: [number, string][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [604800, "week"],
    [2629800, "month"],
    [31557600, "year"],
  ];
  let unit = "minute";
  let size = 60;
  for (const [s, name] of units) {
    if (abs >= s) {
      unit = name;
      size = s;
    }
  }
  const amount = Math.round(abs / size);
  return `${amount} ${unit}${amount === 1 ? "" : "s"} ${suffix}`;
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return digits ? value.toFixed(digits) : numberFmt.format(Math.round(value));
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return compactFmt.format(value);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

export function formatScore(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : Math.round(value).toString();
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function signed(value: number | null | undefined, digits = 1, unit = ""): string {
  if (value === null || value === undefined) return "—";
  const fixed = value.toFixed(digits);
  return `${value > 0 ? "+" : ""}${fixed}${unit}`;
}
