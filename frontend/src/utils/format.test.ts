import { describe, expect, it } from "vitest";

import { formatBytes, formatDuration, formatMonth, formatPercent, relativeTime, signed, titleCase } from "./format";

describe("format utils", () => {
  it("formats bytes with sensible units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
    expect(formatBytes(null)).toBe("—");
  });

  it("formats durations", () => {
    expect(formatDuration(0.25)).toBe("250 ms");
    expect(formatDuration(2.718)).toBe("2.72 s");
    expect(formatDuration(75)).toBe("1m 15s");
  });

  it("formats months and percentages", () => {
    expect(formatMonth("2026-03")).toBe("Mar 26");
    expect(formatPercent(0.943)).toBe("94.3%");
    expect(signed(2.5)).toBe("+2.5");
    expect(signed(-1)).toBe("-1.0");
    expect(titleCase("EXPOSED_REBAR")).toBe("Exposed Rebar");
  });

  it("describes relative time", () => {
    const now = new Date("2026-09-29T12:00:00Z");
    expect(relativeTime("2026-09-29T11:59:50Z", now)).toBe("just now");
    expect(relativeTime("2026-09-29T09:00:00Z", now)).toBe("3 hours ago");
    expect(relativeTime("2026-09-22T12:00:00Z", now)).toBe("1 week ago");
    expect(relativeTime(null, now)).toBe("never");
  });
});
