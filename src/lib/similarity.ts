export function normalizedDistance(
  a: Record<string, number>,
  b: Record<string, number>,
): number {
  const keys = Object.keys(a).filter((k) => k in b);
  if (keys.length === 0) return 1;
  let sum = 0;
  for (const k of keys) {
    const d = ((a[k] - b[k]) / 9) ** 2;
    sum += d;
  }
  return Math.sqrt(sum / keys.length);
}

export function similarity(a: Record<string, number>, b: Record<string, number>): number {
  return 1 - normalizedDistance(a, b);
}
