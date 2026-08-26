import { STANCE_FOR_MIN, STANCE_AGAINST_MAX } from "@/lib/constants";

export type Stance = "for" | "neutral" | "against";

export function stanceOf(score: number): Stance {
  if (score >= STANCE_FOR_MIN) return "for";
  if (score <= STANCE_AGAINST_MAX) return "against";
  return "neutral";
}

export interface OpinionStats {
  point: number;
  count: number;
  avg: number;
  agreePct: number;
  neutralPct: number;
  againstPct: number;
  polarization: number;
}

export function computeOpinionStats(latestScores: Record<string, number>): OpinionStats {
  const scores = Object.values(latestScores);
  const count = scores.length;
  if (count === 0) {
    return {
      point: 0,
      count: 0,
      avg: 0,
      agreePct: 0,
      neutralPct: 0,
      againstPct: 0,
      polarization: 0,
    };
  }
  const point = scores.reduce((a, b) => a + b, 0);
  const avg = point / count;
  let forCount = 0;
  let neutralCount = 0;
  let againstCount = 0;
  for (const s of scores) {
    const st = stanceOf(s);
    if (st === "for") forCount++;
    else if (st === "against") againstCount++;
    else neutralCount++;
  }
  const variance = scores.reduce((acc, s) => acc + (s - avg) ** 2, 0) / count;
  return {
    point,
    count,
    avg,
    agreePct: Math.round((forCount / count) * 100),
    neutralPct: Math.round((neutralCount / count) * 100),
    againstPct: Math.round((againstCount / count) * 100),
    polarization: Math.round(Math.sqrt(variance) * 10) / 10,
  };
}
