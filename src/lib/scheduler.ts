import { DEFAULTS } from "@/lib/constants";

const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 7 * 24 * 60;

function intervalMs(minutes: number): number {
  const safeMinutes = Number.isFinite(minutes)
    ? Math.max(MIN_INTERVAL_MINUTES, Math.min(MAX_INTERVAL_MINUTES, minutes))
    : DEFAULTS.voteIntervalMinutes;
  return Math.round(safeMinutes) * 60 * 1000;
}

export function nextVoteDue(
  postedAt: Date,
  from: Date = new Date(),
  voteIntervalMinutes: number = DEFAULTS.voteIntervalMinutes,
): Date {
  // The admin setting intentionally replaces the former 1h/12h/1w cadence.
  // Keep postedAt in the signature for callers that already pass proposal age.
  void postedAt;
  return new Date(from.getTime() + intervalMs(voteIntervalMinutes));
}

export function runoffVoteDue(
  from: Date = new Date(),
  voteIntervalMinutes: number = DEFAULTS.voteIntervalMinutes,
): Date {
  return new Date(from.getTime() + intervalMs(voteIntervalMinutes));
}
