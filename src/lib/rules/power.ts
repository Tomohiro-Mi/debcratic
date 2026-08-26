import { POWER_MIN, POWER_MAX } from "@/lib/constants";
import type { SeededRandom } from "@/lib/rng";

export interface PowerAdjustResult {
  powers: Record<string, number>;
  changes: { catId: string; before: number; after: number; reason: string }[];
}

export function settlePowers(
  cats: { id: string; power: number }[],
  desiredDeltas: Record<string, number>,
  totalBefore: number,
  rng: SeededRandom,
  reasonFor: (catId: string, delta: number) => string,
): PowerAdjustResult {
  const powers: Record<string, number> = {};
  for (const c of cats) {
    const d = desiredDeltas[c.id] ?? 0;
    powers[c.id] = Math.max(POWER_MIN, Math.min(POWER_MAX, c.power + d));
  }

  let diff = totalBefore - Object.values(powers).reduce((a, b) => a + b, 0);
  let guard = 0;
  while (diff !== 0 && guard < 10000) {
    guard++;
    for (const id of rng.shuffle(Object.keys(powers))) {
      if (diff > 0 && powers[id] < POWER_MAX) {
        powers[id]++;
        diff--;
      } else if (diff < 0 && powers[id] > POWER_MIN) {
        powers[id]--;
        diff++;
      }
      if (diff === 0) break;
    }
  }

  const changes: PowerAdjustResult["changes"] = [];
  for (const c of cats) {
    const before = c.power;
    const after = powers[c.id];
    if (before !== after) {
      const delta = after - before;
      changes.push({ catId: c.id, before, after, reason: reasonFor(c.id, delta) });
    }
  }
  return { powers, changes };
}
