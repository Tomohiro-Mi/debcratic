import { eq } from "drizzle-orm";
import { systemSettings } from "@/db/schema";
import { getDb } from "@/db";
import { DEFAULTS } from "@/lib/constants";

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
}

export function envSettings(): Partial<EffectiveSettings> {
  const s: Partial<EffectiveSettings> = {};
  if (process.env.OPENROUTER_MODEL) s.llmModel = process.env.OPENROUTER_MODEL;
  return s;
}

export async function getEffectiveSettings(): Promise<EffectiveSettings> {
  const apiKey = process.env.OPENROUTER_API_KEY || undefined;
  const row = (
    await getDb().select().from(systemSettings).where(eq(systemSettings.id, 1)).limit(1)
  )[0];
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
    apiKey,
  };
}
