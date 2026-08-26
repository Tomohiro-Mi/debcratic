import { describe, expect, it } from "vitest";
import { nextVoteDue, runoffVoteDue } from "@/lib/scheduler";

const H = 3600_000;

describe("nextVoteDue", () => {
  it("uses the configured interval", () => {
    const posted = new Date("2026-01-01T00:00:00Z");
    const from = new Date(posted.getTime() + 5 * H);
    expect(nextVoteDue(posted, from, 15).getTime() - from.getTime()).toBe(15 * 60_000);
    expect(nextVoteDue(posted, from).getTime() - from.getTime()).toBe(H);
  });

  it("keeps the configured interval for older proposals", () => {
    const posted = new Date("2026-01-01T00:00:00Z");
    const from = new Date(posted.getTime() + 24 * H);
    const from6 = new Date(posted.getTime() + 6.9 * 24 * H);
    expect(nextVoteDue(posted, from, 90).getTime() - from.getTime()).toBe(90 * 60_000);
    expect(nextVoteDue(posted, from6, 90).getTime() - from6.getTime()).toBe(90 * 60_000);
  });

  it("starts fresh schedules for late opinions", () => {
    const latePosted = new Date("2026-03-01T00:00:00Z");
    const now = new Date(latePosted.getTime() + 30_000);
    expect(nextVoteDue(latePosted, now).getTime() - now.getTime()).toBe(H);
  });
});

describe("runoffVoteDue", () => {
  it("uses the same configured interval", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    expect(runoffVoteDue(now).getTime() - now.getTime()).toBe(H);
    expect(runoffVoteDue(now, 20).getTime() - now.getTime()).toBe(20 * 60_000);
  });
});
