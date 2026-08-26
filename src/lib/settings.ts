import { inArray } from "drizzle-orm";
import { systemSettings } from "@/db/schema";
import { getDb } from "@/db";
import { DEFAULTS } from "@/lib/constants";
import { decryptSecret, maskSecret } from "@/lib/crypto";

// Row 1 keeps the normal settings. Row 2 is reserved for the interval value
// in the existing runoff_turn_limit column so deployments with older database
// schemas do not need a blocking DDL migration.
export const VOTE_INTERVAL_SETTINGS_ID = 2;

export interface EffectiveSettings {
  llmModel: string;
  temperature: number;
  exilePenaltyProb: number;
  changeWindow: number;
  changeThreshold: number;
  runoffTurnLimit: number;
  voteIntervalMinutes: number;
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
    .where(inArray(systemSettings.id, [1, VOTE_INTERVAL_SETTINGS_ID]));
  const row = rows.find((candidate) => candidate.id === 1);
  const intervalRow = rows.find((candidate) => candidate.id === VOTE_INTERVAL_SETTINGS_ID);

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
    voteIntervalMinutes: intervalRow?.runoffTurnLimit ?? DEFAULTS.voteIntervalMinutes,
    hasApiKey: Boolean(apiKey),
    apiKey: apiKey ?? undefined,
    apiKeySource: dbKey ? "db" : envKey ? "env" : null,
    apiKeyHint: dbKey ? maskSecret(dbKey) : null,
  };
}
