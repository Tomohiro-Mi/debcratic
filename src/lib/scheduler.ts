const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function nextVoteDue(postedAt: Date, from: Date = new Date()): Date {
  const elapsed = from.getTime() - postedAt.getTime();
  if (elapsed < DAY_MS) return new Date(from.getTime() + HOUR_MS);
  if (elapsed < 7 * DAY_MS) return new Date(from.getTime() + 12 * HOUR_MS);
  return new Date(from.getTime() + 7 * DAY_MS);
}

export function runoffVoteDue(from: Date = new Date()): Date {
  return new Date(from.getTime() + HOUR_MS);
}
