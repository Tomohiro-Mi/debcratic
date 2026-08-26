import { SeededRandom } from "@/lib/rng";
import { SCORE_MAX, SCORE_MIN } from "@/lib/constants";

export interface ParamEstimate {
  mean: number;
  map: number;
}

export interface OpinionParameterEstimate {
  mean: number;
  variance: number;
  confidence: number;
}

export type OpinionParameterState = Record<string, OpinionParameterEstimate>;

export interface CatVoteContext {
  id: string;
  name: string;
  power: number;
  topicParams: Record<string, number>;
  factionName: string | null;
  leaderName: string | null;
  leaderScore?: number | null;
  history: { turn: number; score: number; reason: string }[];
}

export interface BayesianVoteInput {
  opinionId: string;
  opinionContent: string;
  parameterNames: string[];
  opinionParameters: OpinionParameterState;
  cats: CatVoteContext[];
  seed: string;
}

export interface BayesianVoteOutput {
  score: number;
  confidence: number;
  factors: { label: string; delta: number }[];
}

export interface PosteriorVoteSample {
  values: Record<string, number>;
  score: number;
  weight?: number;
}

const PARAM_MIN = 1;
const PARAM_MAX = 10;
const DEFAULT_MEAN = 5.5;
const DEFAULT_VARIANCE = 6;
const HIGH_RISK_PATTERN =
  /(地獄|あの世|冥界|死者の国|戦場|殺人|殺す|自殺|毒|爆破|爆弾|無差別|奴隷|拷問|違法)/u;
const STRONG_FOR_PATTERN = /(絶対|必ず|最高|画期的|大賛成|推進|全面的|無条件)/u;
const STRONG_AGAINST_PATTERN = /(絶対に反対|断固反対|最悪|危険|中止|禁止|廃止|許せない)/u;
const RISK_PARAMETER_PATTERN = /(安全|現実|実現|合法|倫理|健康|費用|コスト|安心|リスク|危険|公共)/u;
const POSITIVE_PATTERN = /(賛成|最高|便利|安全|節約|改善|快適|推進|良い|よい|好き|楽しい|おすすめ)/u;
const NEGATIVE_PATTERN = /(反対|危険|最悪|中止|禁止|心配|悪い|嫌|困る|高い|難しい)/u;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeVariance(value: number | undefined): number {
  return clamp(Number.isFinite(value) ? value! : DEFAULT_VARIANCE, 0.5, 25);
}

function normalizedSignal(value: number): number {
  return (clamp(value, PARAM_MIN, PARAM_MAX) - DEFAULT_MEAN) / 4.5;
}

function scoreToSupport(score: number): number {
  return clamp(score, SCORE_MIN, SCORE_MAX) / SCORE_MAX;
}

function normalWeight(value: number, estimate: OpinionParameterEstimate): number {
  const variance = safeVariance(estimate.variance);
  return Math.exp(-((value - estimate.mean) ** 2) / (2 * variance));
}

function estimateFromWeights(weights: number[]): OpinionParameterEstimate {
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return { mean: DEFAULT_MEAN, variance: DEFAULT_VARIANCE, confidence: 0.25 };
  }

  const mean = weights.reduce((sum, value, index) => sum + value * (index + 1), 0) / total;
  const variance = weights.reduce(
    (sum, value, index) => sum + value * ((index + 1 - mean) ** 2),
    0,
  ) / total;
  return {
    mean: Math.round(mean * 10) / 10,
    variance: Math.round(clamp(variance, 0.5, 25) * 10) / 10,
    confidence: Math.round(clamp(1 - Math.sqrt(variance) / 4, 0.15, 0.98) * 100) / 100,
  };
}

export function createNeutralOpinionParameters(
  parameterNames: string[],
): OpinionParameterState {
  return Object.fromEntries(
    parameterNames.map((name) => [
      name,
      { mean: DEFAULT_MEAN, variance: DEFAULT_VARIANCE, confidence: 0.25 },
    ]),
  );
}

export function createRuleBasedOpinionParameters(
  parameterNames: string[],
  content: string,
  seed: string,
): OpinionParameterState {
  const rng = new SeededRandom(`opinion-params:${seed}`);
  const strongFor = STRONG_FOR_PATTERN.test(content);
  const strongAgainst = STRONG_AGAINST_PATTERN.test(content);
  const highRisk = HIGH_RISK_PATTERN.test(content);
  const genericSignal = strongAgainst || NEGATIVE_PATTERN.test(content)
    ? -1
    : strongFor || POSITIVE_PATTERN.test(content)
      ? 1
      : 0;

  return Object.fromEntries(
    parameterNames.map((name) => {
      const riskAxis = RISK_PARAMETER_PATTERN.test(name);
      let mean = rng.float(4.5, 6.5);
      if (highRisk && riskAxis) mean = 1;
      else if (genericSignal !== 0) {
        mean = clamp(DEFAULT_MEAN + genericSignal * (strongFor || strongAgainst ? 2 : 1), 1, 10);
      }
      return [
        name,
        {
          mean: Math.round(mean * 10) / 10,
          variance: highRisk && riskAxis ? 1.5 : 5.5,
          confidence: highRisk && riskAxis ? 0.82 : 0.35,
        },
      ];
    }),
  );
}

function catDisposition(catId: string) {
  const rng = new SeededRandom(`cat-disposition:${catId}`);
  return {
    assertiveness: rng.float(0.55, 0.95),
    riskTolerance: rng.float(0.15, 0.9),
    stanceBias: rng.float(-0.65, 0.65),
  };
}

function riskReaction(content: string, cat: CatVoteContext, riskTolerance: number): number {
  if (!HIGH_RISK_PATTERN.test(content)) return 0;
  const riskParams = Object.entries(cat.topicParams).filter(([name]) => RISK_PARAMETER_PATTERN.test(name));
  const safetyAffinity = riskParams.length > 0
    ? riskParams.reduce((sum, [, value]) => sum + normalizedSignal(value), 0) / riskParams.length
    : 0.5;
  return -4.5 - safetyAffinity * 3 + riskTolerance * 4;
}

function parameterAgreement(
  names: string[],
  state: OpinionParameterState,
  cat: CatVoteContext,
): number {
  let total = 0;
  let totalWeight = 0;
  for (const name of names) {
    const estimate = state[name] ?? {
      mean: DEFAULT_MEAN,
      variance: DEFAULT_VARIANCE,
      confidence: 0.25,
    };
    const catValue = cat.topicParams[name] ?? DEFAULT_MEAN;
    const opinionSignal = normalizedSignal(estimate.mean);
    const catSignal = normalizedSignal(catValue);
    const uncertaintyWeight = 1 / (1 + safeVariance(estimate.variance) / 8);
    const weight = Math.max(0.25, estimate.confidence) * uncertaintyWeight;
    total += catSignal * opinionSignal * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? total / totalWeight : 0;
}

export function calculateBayesianVotes(
  input: BayesianVoteInput,
): Record<string, BayesianVoteOutput> {
  const votes: Record<string, BayesianVoteOutput> = {};

  for (const cat of input.cats) {
    const rng = new SeededRandom(`${input.seed}:${cat.id}`);
    const disposition = catDisposition(cat.id);
    const previousScore = cat.history.at(-1)?.score ?? 0;
    const agreement = parameterAgreement(input.parameterNames, input.opinionParameters, cat);
    const risk = riskReaction(input.opinionContent, cat, disposition.riskTolerance);
    const leaderPull = cat.leaderName && cat.leaderScore !== null && cat.leaderScore !== undefined
      ? cat.leaderScore * 0.2
      : 0;
    const inertia = previousScore * 0.18;
    const directTextSignal = STRONG_AGAINST_PATTERN.test(input.opinionContent)
      ? -2.5
      : STRONG_FOR_PATTERN.test(input.opinionContent)
        ? 2.5
        : 0;
    const noiseScale = 0.8 + (1 - disposition.assertiveness) * 1.5;
    const raw =
      agreement * (7 + disposition.assertiveness * 5) +
      disposition.stanceBias * 1.6 +
      leaderPull +
      inertia +
      directTextSignal +
      risk +
      rng.float(-noiseScale, noiseScale);
    const normalized = 10 * Math.tanh(raw / 7.5);
    const score = clamp(Math.round(normalized), SCORE_MIN, SCORE_MAX);
    const uncertainty = input.parameterNames.reduce(
      (sum, name) => sum + safeVariance(input.opinionParameters[name]?.variance),
      0,
    ) / Math.max(1, input.parameterNames.length);
    const confidence = Math.round(
      clamp(0.45 + Math.abs(normalized) / 25 + (1 - uncertainty / 25) * 0.25, 0.35, 0.98) * 100,
    ) / 100;
    const agreementDelta = Math.round(agreement * 3);
    const factors = [
      { label: "価値観との一致", delta: agreementDelta },
      ...(risk !== 0 ? [{ label: "危険性への反応", delta: clamp(Math.round(risk / 2), -3, 3) }] : []),
      ...(leaderPull !== 0 ? [{ label: "派閥からの影響", delta: clamp(Math.round(leaderPull / 2), -3, 3) }] : []),
      ...(inertia !== 0 ? [{ label: "過去の立場", delta: clamp(Math.round(inertia / 2), -3, 3) }] : []),
    ].filter((factor) => factor.delta !== 0 || factor.label === "価値観との一致");

    votes[cat.id] = { score, confidence, factors };
  }

  return votes;
}

export function updateOpinionPosterior(
  prior: OpinionParameterState,
  samples: PosteriorVoteSample[],
): OpinionParameterState {
  if (samples.length === 0) return prior;

  const parameterNames = new Set(Object.keys(prior));
  for (const sample of samples) {
    for (const name of Object.keys(sample.values)) parameterNames.add(name);
  }

  return Object.fromEntries(
    [...parameterNames].map((name) => {
      const base = prior[name] ?? {
        mean: DEFAULT_MEAN,
        variance: DEFAULT_VARIANCE,
        confidence: 0.25,
      };
      const weights = Array.from({ length: 10 }, (_, index) => normalWeight(index + 1, base));

      for (const sample of samples) {
        const catValue = sample.values[name];
        if (!Number.isFinite(catValue)) continue;
        const observedSupport = scoreToSupport(sample.score);
        const weight = clamp(sample.weight ?? 1, 0.25, 2);
        for (let index = 0; index < 10; index++) {
          const expectedSupport = normalizedSignal(catValue) * normalizedSignal(index + 1);
          const likelihood = Math.exp(-((expectedSupport - observedSupport) ** 2) / (2 * 0.7 ** 2));
          weights[index] *= (1 - weight * 0.35) + weight * 0.35 * likelihood;
        }
      }

      return [name, estimateFromWeights(weights)];
    }),
  );
}

/** Legacy display helper retained for already-recorded opinions. */
export interface CatVoteSample {
  values: Record<string, number>;
  score: number;
}

export function estimateOpinionParams(
  samples: CatVoteSample[],
): Record<string, ParamEstimate> {
  if (samples.length === 0) return {};
  const allParams = new Set<string>();
  for (const sample of samples) {
    for (const name of Object.keys(sample.values)) allParams.add(name);
  }

  const result: Record<string, ParamEstimate> = {};
  for (const param of allParams) {
    const posterior = new Array(10).fill(1 / 10) as number[];
    for (const sample of samples) {
      const catValue = sample.values[param];
      if (catValue === undefined) continue;
      const agreement = (sample.score + 11) / 21;
      for (let index = 0; index < 10; index++) {
        const predicted = 1 - Math.abs(catValue - (index + 1)) / 9;
        const likelihood = Math.exp(-((predicted - agreement) ** 2) / (2 * 0.2 ** 2));
        posterior[index] *= likelihood + 1e-12;
      }
    }
    const total = posterior.reduce((sum, value) => sum + value, 0);
    if (total <= 0) {
      result[param] = { mean: DEFAULT_MEAN, map: 5 };
      continue;
    }
    const mean = posterior.reduce((sum, value, index) => sum + (value / total) * (index + 1), 0);
    result[param] = {
      mean: Math.round(mean * 10) / 10,
      map: posterior.indexOf(Math.max(...posterior)) + 1,
    };
  }
  return result;
}

export function toParamEstimates(
  state: OpinionParameterState,
): Record<string, ParamEstimate> {
  return Object.fromEntries(
    Object.entries(state).map(([name, estimate]) => {
      const weights = Array.from({ length: 10 }, (_, index) => normalWeight(index + 1, estimate));
      const map = weights.indexOf(Math.max(...weights)) + 1;
      return [name, { mean: Math.round(estimate.mean * 10) / 10, map }];
    }),
  );
}
