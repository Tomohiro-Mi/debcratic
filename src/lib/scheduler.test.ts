import { describe, expect, it } from "vitest";
import { intervalForPostedAt, nextVoteDue, runoffVoteDue } from "@/lib/scheduler";

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

  it("switches intervals at 24h, 1 week, and 1 month after posting", () => {
    const posted = new Date("2026-01-01T00:00:00Z");
    const schedule = {
      within24h: 10,
      withinWeek: 20,
      withinMonth: 30,
      afterMonth: 40,
    };

    expect(intervalForPostedAt(posted, new Date("2026-01-01T23:59:59Z"), schedule)).toBe(10);
    expect(intervalForPostedAt(posted, new Date("2026-01-02T00:00:00Z"), schedule)).toBe(10);
    expect(intervalForPostedAt(posted, new Date("2026-01-02T00:00:01Z"), schedule)).toBe(20);
    expect(intervalForPostedAt(posted, new Date("2026-01-08T00:00:00Z"), schedule)).toBe(20);
    expect(intervalForPostedAt(posted, new Date("2026-01-08T00:00:01Z"), schedule)).toBe(30);
    expect(intervalForPostedAt(posted, new Date("2026-01-31T00:00:00Z"), schedule)).toBe(30);
    expect(intervalForPostedAt(posted, new Date("2026-02-01T00:00:00Z"), schedule)).toBe(40);
  });

  it("uses the interval for the opinion age when scheduling the next vote", () => {
    const posted = new Date("2026-01-01T00:00:00Z");
    const from = new Date("2026-01-10T12:00:00Z");
    const due = nextVoteDue(posted, from, {
      within24h: 10,
      withinWeek: 20,
      withinMonth: 30,
      afterMonth: 40,
    });
    expect(due.getTime() - from.getTime()).toBe(30 * 60_000);
  });
});

describe("runoffVoteDue", () => {
  it("uses the same configured interval", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    expect(runoffVoteDue(now).getTime() - now.getTime()).toBe(H);
    expect(runoffVoteDue(now, 20).getTime() - now.getTime()).toBe(20 * 60_000);
  });
});
