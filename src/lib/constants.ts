export const POWER_MIN = 1;
export const POWER_MAX = 10;
export const LEADER_POWER_THRESHOLD = 8;
export const FOLLOWER_MAX_POWER = 5;
export const INDEPENDENT_POWER = 5;
export const EXCOMMUNICATE_BELOW = 3;

export const STANCE_FOR_MIN = 2;
export const STANCE_AGAINST_MAX = -2;

export const SCORE_MIN = -10;
export const SCORE_MAX = 10;

export const VOTE_ENGINE_VERSION = "bayes-v1";
export const OPINION_SEMANTIC_PROMPT_VERSION = "opinion-params-v1";
export const COMMENT_PROMPT_VERSION = "vote-comment-v3-decisive";
/** @deprecated Use the dedicated semantic/comment versions above. */
export const PROMPT_VERSION = VOTE_ENGINE_VERSION;

export const COMMENT_SUFFIXES = ["ニャ", "ピィ", "のね", "普通"] as const;
export type CommentSuffix = (typeof COMMENT_SUFFIXES)[number];
export const SILENT_CAT_COMMENT = "……。";

export const DEFAULTS = {
  llmModel: "openai/gpt-4o-mini",
  opinionModel: "google/gemini-2.5-flash",
  commentModel: "openai/gpt-4o-mini",
  temperature: 0.7,
  exilePenaltyProb: 0.7,
  changeWindow: 5,
  changeThreshold: 2,
  runoffTurnLimit: 5,
  voteIntervalMinutes: 60,
  voteIntervals: {
    within24h: 60,
    withinWeek: 12 * 60,
    withinMonth: 24 * 60,
    afterMonth: 7 * 24 * 60,
  },
} as const;

/**
 * The synchronous chat-completions flow cannot call OpenRouter Batch-only
 * model variants. Keep this check in one place so settings, validation, and
 * connection tests apply the same rule.
 */
export function isBatchOnlyModel(model: string | null | undefined): boolean {
  return Boolean(model?.trim().toLowerCase().endsWith(":batch"));
}

export function resolveSynchronousModel(
  model: string | null | undefined,
  fallback: string,
): string {
  const candidate = model?.trim();
  return candidate && !isBatchOnlyModel(candidate) ? candidate : fallback;
}

export function synchronousModelError(model: string): string | null {
  if (!isBatchOnlyModel(model)) return null;
  return `モデル「${model}」はOpenRouterのBatch API専用です。通常の投票処理では使えないため、末尾が :batch ではないモデルを選択してください。`;
}

export const MIN_VOTE_INTERVAL_MINUTES = 1;
export const MAX_VOTE_INTERVAL_MINUTES = 365 * 24 * 60;

export const OPINION_DAILY_LIMIT = 10;
export const OPINION_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

export const MAX_PROPOSAL_PARAMETERS = 20;

export const TURN_LOCK_SECONDS = 40;
export const MAX_CATCHUP_TURNS = 24;
export const RUNOFF_AUTO_START_HOURS = 24;
