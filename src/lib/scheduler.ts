import {
  DEFAULTS,
  MAX_VOTE_INTERVAL_MINUTES,
  MIN_VOTE_INTERVAL_MINUTES,
} from "@/lib/constants";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface VoteIntervalSchedule {
  within24h: number;
  withinWeek: number;
  withinMonth: number;
  afterMonth: number;
}

function intervalMs(minutes: number): number {
  const safeMinutes = Number.isFinite(minutes)
    ? Math.max(MIN_VOTE_INTERVAL_MINUTES, Math.min(MAX_VOTE_INTERVAL_MINUTES, minutes))
    : DEFAULTS.voteIntervalMinutes;
  return Math.round(safeMinutes) * 60 * 1000;
}

function normalizeSchedule(
  schedule: VoteIntervalSchedule | number = DEFAULTS.voteIntervals,
): VoteIntervalSchedule {
  if (typeof schedule === "number") {
    return {
      within24h: schedule,
      withinWeek: schedule,
      withinMonth: schedule,
      afterMonth: schedule,
    };
  }
  return schedule;
}

export function intervalForPostedAt(
  postedAt: Date,
  at: Date = new Date(),
  schedule: VoteIntervalSchedule | number = DEFAULTS.voteIntervals,
): number {
  const ageMs = Math.max(0, at.getTime() - postedAt.getTime());
  const intervals = normalizeSchedule(schedule);
  if (ageMs <= DAY_MS) return intervalMs(intervals.within24h) / 60_000;
  if (ageMs <= 7 * DAY_MS) return intervalMs(intervals.withinWeek) / 60_000;
  if (ageMs <= 30 * DAY_MS) return intervalMs(intervals.withinMonth) / 60_000;
  return intervalMs(intervals.afterMonth) / 60_000;
}

export function nextVoteDue(
  postedAt: Date,
  from: Date = new Date(),
  schedule: VoteIntervalSchedule | number = DEFAULTS.voteIntervals,
): Date {
  return new Date(from.getTime() + intervalForPostedAt(postedAt, from, schedule) * 60_000);
}

export function runoffVoteDue(
  from: Date = new Date(),
  voteIntervalMinutes: number = DEFAULTS.voteIntervalMinutes,
): Date {
  return new Date(from.getTime() + intervalMs(voteIntervalMinutes));
}
