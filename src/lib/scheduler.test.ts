import { describe, expect, it } from "vitest";
import { nextVoteDue, runoffVoteDue } from "@/lib/scheduler";

const H = 3600_000;

describe("nextVoteDue", () => {
  it("votes hourly within the first 24h", () => {
    const posted = new Date("2026-01-01T00:00:00Z");
    const from = new Date(posted.getTime() + 5 * H);
    const due = nextVoteDue(posted, from);
    expect(due.getTime() - from.getTime()).toBe(H);
  });

  it("switches to twice daily between day 1 and day 7", () => {
    const posted = new Date("2026-01-01T00:00:00Z");
    const from = new Date(posted.getTime() + 24 * H);
    const due = nextVoteDue(posted, from);
    expect(due.getTime() - from.getTime()).toBe(12 * H);

    const from6 = new Date(posted.getTime() + 6.9 * 24 * H);
    expect(nextVoteDue(posted, from6).getTime() - from6.getTime()).toBe(12 * H);
  });

  it("falls back to weekly after day 7", () => {
    const posted = new Date("2026-01-01T00:00:00Z");
    const from = new Date(posted.getTime() + 7 * 24 * H + 1000);
    expect(nextVoteDue(posted, from).getTime() - from.getTime()).toBe(7 * 24 * H);
  });

  it("starts fresh schedules for late opinions", () => {
    const latePosted = new Date("2026-03-01T00:00:00Z");
    const now = new Date(latePosted.getTime() + 30_000);
    expect(nextVoteDue(latePosted, now).getTime() - now.getTime()).toBe(H);
  });
});

describe("runoffVoteDue", () => {
  it("is hourly", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    expect(runoffVoteDue(now).getTime() - now.getTime()).toBe(H);
  });
});
