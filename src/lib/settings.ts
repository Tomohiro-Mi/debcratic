import { inArray } from "drizzle-orm";
import { systemSettings } from "@/db/schema";
import { getDb } from "@/db";
import { DEFAULTS } from "@/lib/constants";
import { decryptSecret, maskSecret } from "@/lib/crypto";

// Settings rows 2-6 use the existing runoff_turn_limit column. This keeps the
// interval rollout compatible with databases that already have the table.
export const VOTE_INTERVAL_SETTINGS_ID = 2;
export const VOTE_INTERVAL_WEEK_SETTINGS_ID = 3;
export const VOTE_INTERVAL_MONTH_SETTINGS_ID = 4;
export const VOTE_INTERVAL_AFTER_MONTH_SETTINGS_ID = 5;
export const RUNOFF_INTERVAL_SETTINGS_ID = 6;

const INTERVAL_SETTING_IDS = [
  VOTE_INTERVAL_SETTINGS_ID,
  VOTE_INTERVAL_WEEK_SETTINGS_ID,
  VOTE_INTERVAL_MONTH_SETTINGS_ID,
  VOTE_INTERVAL_AFTER_MONTH_SETTINGS_ID,
  RUNOFF_INTERVAL_SETTINGS_ID,
] as const;

export interface EffectiveSettings {
  llmModel: string;
  temperature: number;
  exilePenaltyProb: number;
  changeWindow: number;
  changeThreshold: number;
  runoffTurnLimit: number;
  voteIntervalMinutes: number;
  voteIntervals: {
    within24h: number;
    withinWeek: number;
    withinMonth: number;
    afterMonth: number;
  };
  runoffVoteIntervalMinutes: number;
  hasApiKey: boolean;
  apiKey?: string;
  apiKeySource: "db" | "env" | null;
  apiKeyHint: string | null;
}

export function envSettings(): Partial<EffectiveSettings> {
  const s: Partial<EffectiveSettings> = {};
  if (process.env.OPENROUTER_MODEL) s.llmModel = process.env.OPENROUTER_MODEL;
  return s;
}

export async function getEffectiveSettings(): Promise<EffectiveSettings> {
  const rows = await getDb()
    .select()
    .from(systemSettings)
    .where(inArray(systemSettings.id, [1, ...INTERVAL_SETTING_IDS]));
  const row = rows.find((candidate) => candidate.id === 1);
  const intervalById = new Map(
    rows
      .filter((candidate) => candidate.id !== 1)
      .map((candidate) => [candidate.id, candidate.runoffTurnLimit]),
  );
  const legacyInterval = intervalById.get(VOTE_INTERVAL_SETTINGS_ID);
  const voteIntervals = {
    within24h: intervalById.get(VOTE_INTERVAL_SETTINGS_ID) ?? DEFAULTS.voteIntervals.within24h,
    withinWeek:
      intervalById.get(VOTE_INTERVAL_WEEK_SETTINGS_ID) ??
      legacyInterval ??
      DEFAULTS.voteIntervals.withinWeek,
    withinMonth:
      intervalById.get(VOTE_INTERVAL_MONTH_SETTINGS_ID) ??
      legacyInterval ??
      DEFAULTS.voteIntervals.withinMonth,
    afterMonth:
      intervalById.get(VOTE_INTERVAL_AFTER_MONTH_SETTINGS_ID) ??
      legacyInterval ??
      DEFAULTS.voteIntervals.afterMonth,
  };
  const runoffVoteIntervalMinutes =
    intervalById.get(RUNOFF_INTERVAL_SETTINGS_ID) ??
    legacyInterval ??
    DEFAULTS.voteIntervalMinutes;

  const dbKey = row?.llmApiKeyEnc ? decryptSecret(row.llmApiKeyEnc) : null;
  const envKey = process.env.OPENROUTER_API_KEY || null;
  const apiKey = dbKey ?? envKey;

  return {
    llmModel: row?.llmModel ?? envSettings().llmModel ?? DEFAULTS.llmModel,
    temperature: row?.temperature ?? DEFAULTS.temperature,
    exilePenaltyProb: row?.exilePenaltyProb ?? DEFAULTS.exilePenaltyProb,
    changeWindow: row?.changeWindow ?? DEFAULTS.changeWindow,
    changeThreshold: row?.changeThreshold ?? DEFAULTS.changeThreshold,
    runoffTurnLimit: row?.runoffTurnLimit ?? DEFAULTS.runoffTurnLimit,
    voteIntervalMinutes: voteIntervals.within24h,
    voteIntervals,
    runoffVoteIntervalMinutes,
    hasApiKey: Boolean(apiKey),
    apiKey: apiKey ?? undefined,
    apiKeySource: dbKey ? "db" : envKey ? "env" : null,
    apiKeyHint: dbKey ? maskSecret(dbKey) : null,
  };
}
