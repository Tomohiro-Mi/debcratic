import { eq } from "drizzle-orm";
import { systemSettings } from "@/db/schema";
import { getDb } from "@/db";
import { DEFAULTS } from "@/lib/constants";
import { decryptSecret, maskSecret } from "@/lib/crypto";

export interface EffectiveSettings {
  llmModel: string;
  temperature: number;
  exilePenaltyProb: number;
  assimilationProb: number;
  assimilationMinTurns: number;
  changeWindow: number;
  changeThreshold: number;
  runoffTurnLimit: number;
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
  const row = (
    await getDb().select().from(systemSettings).where(eq(systemSettings.id, 1)).limit(1)
  )[0];

  const dbKey = row?.llmApiKeyEnc ? decryptSecret(row.llmApiKeyEnc) : null;
  const envKey = process.env.OPENROUTER_API_KEY || null;
  const apiKey = dbKey ?? envKey;

  return {
    llmModel: row?.llmModel ?? envSettings().llmModel ?? DEFAULTS.llmModel,
    temperature: row?.temperature ?? DEFAULTS.temperature,
    exilePenaltyProb: row?.exilePenaltyProb ?? DEFAULTS.exilePenaltyProb,
    assimilationProb: row?.assimilationProb ?? DEFAULTS.assimilationProb,
    assimilationMinTurns: row?.assimilationMinTurns ?? DEFAULTS.assimilationMinTurns,
    changeWindow: row?.changeWindow ?? DEFAULTS.changeWindow,
    changeThreshold: row?.changeThreshold ?? DEFAULTS.changeThreshold,
    runoffTurnLimit: row?.runoffTurnLimit ?? DEFAULTS.runoffTurnLimit,
    hasApiKey: Boolean(apiKey),
    apiKey: apiKey ?? undefined,
    apiKeySource: dbKey ? "db" : envKey ? "env" : null,
    apiKeyHint: dbKey ? maskSecret(dbKey) : null,
  };
}
