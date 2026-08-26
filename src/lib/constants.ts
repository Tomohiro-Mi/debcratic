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

export const PROMPT_VERSION = "vote-v2-balanced";

export const COMMENT_SUFFIXES = ["ニャ", "ピィ", "のね", "普通"] as const;
export type CommentSuffix = (typeof COMMENT_SUFFIXES)[number];
export const SILENT_CAT_COMMENT = "……。";

export const DEFAULTS = {
  llmModel: "openai/gpt-4o-mini",
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

export const MIN_VOTE_INTERVAL_MINUTES = 1;
export const MAX_VOTE_INTERVAL_MINUTES = 365 * 24 * 60;

export const OPINION_DAILY_LIMIT = 10;
export const OPINION_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

export const MAX_PROPOSAL_PARAMETERS = 20;

export const TURN_LOCK_SECONDS = 40;
export const MAX_CATCHUP_TURNS = 24;
export const RUNOFF_AUTO_START_HOURS = 24;
