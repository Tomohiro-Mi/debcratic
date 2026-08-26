const SIGMA = 0.2;

export interface CatVoteSample {
  values: Record<string, number>;
  score: number;
}

export interface ParamEstimate {
  mean: number;
  map: number;
}

export function estimateOpinionParams(
  samples: CatVoteSample[],
): Record<string, ParamEstimate> {
  if (samples.length === 0) return {};

  const allParams = new Set<string>();
  for (const s of samples) {
    for (const k of Object.keys(s.values)) allParams.add(k);
  }

  const result: Record<string, ParamEstimate> = {};

  for (const param of allParams) {
    const posterior = new Array(10).fill(1 / 10);
    for (const s of samples) {
      const cv = s.values[param];
      if (cv === undefined) continue;
      const agreement = (s.score + 11) / 21;
      for (let i = 0; i < 10; i++) {
        const theta = i + 1;
        const predicted = 1 - Math.abs(cv - theta) / 9;
        const likelihood = Math.exp(
          -((predicted - agreement) ** 2) / (2 * SIGMA * SIGMA),
        );
        posterior[i] *= likelihood + 1e-12;
      }
    }
    const total = posterior.reduce((a, b) => a + b, 0);
    if (total <= 0) {
      result[param] = { mean: 5.5, map: 5 };
      continue;
    }
    let mean = 0;
    let mapIdx = 0;
    for (let i = 0; i < 10; i++) {
      const p = posterior[i] / total;
      mean += p * (i + 1);
      if (posterior[i] > posterior[mapIdx]) mapIdx = i;
    }
    result[param] = {
      mean: Math.round(mean * 10) / 10,
      map: mapIdx + 1,
    };
  }

  return result;
}
