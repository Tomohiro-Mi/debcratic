import type { Cat, Faction } from "@/db/schema";

export const PROPOSAL_STATE_EVENT_TYPES = [
  "SimulationInitialized",
  "SimulationStateUpdated",
] as const;

export type ProposalSimulationCat = {
  power: number;
  factionKey: string | null;
  role: "leader" | "follower" | null;
  joinedTurn: number | null;
};

export type ProposalSimulationFaction = {
  key: string;
  name: string;
  leaderId: string;
  foundedTurn: number;
};

export type ProposalSimulationState = {
  cats: Record<string, ProposalSimulationCat>;
  factions: ProposalSimulationFaction[];
};

export function createInitialProposalSimulationState(
  cats: Pick<Cat, "id" | "power" | "factionId" | "leaderId">[],
  factions: Pick<Faction, "id" | "name" | "leaderId" | "foundedTurn">[],
): ProposalSimulationState {
  const factionById = new Map(factions.map((faction) => [faction.id, faction]));

  return {
    cats: Object.fromEntries(
      cats.map((cat) => {
        const faction = cat.factionId ? factionById.get(cat.factionId) : undefined;
        return [
          cat.id,
          {
            power: cat.power,
            factionKey: faction?.id ?? null,
            role: faction ? (faction.leaderId === cat.id ? "leader" : "follower") : null,
            joinedTurn: faction?.foundedTurn ?? null,
          },
        ];
      }),
    ),
    factions: factions.map((faction) => ({
      key: faction.id,
      name: faction.name,
      leaderId: faction.leaderId,
      foundedTurn: faction.foundedTurn,
    })),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseRole(value: unknown): ProposalSimulationCat["role"] | undefined {
  return value === "leader" || value === "follower" || value === null ? value : undefined;
}

export function parseProposalSimulationState(
  value: unknown,
): ProposalSimulationState | null {
  const record = asRecord(value);
  const rawCats = asRecord(record?.cats);
  const rawFactions = Array.isArray(record?.factions) ? record.factions : null;
  if (!rawCats || !rawFactions) return null;

  const cats: Record<string, ProposalSimulationCat> = {};
  for (const [id, rawCat] of Object.entries(rawCats)) {
    const cat = asRecord(rawCat);
    const role = parseRole(cat?.role);
    if (
      typeof cat?.power !== "number" ||
      !Number.isFinite(cat.power) ||
      (typeof cat.factionKey !== "string" && cat.factionKey !== null) ||
      role === undefined ||
      (typeof cat.joinedTurn !== "number" && cat.joinedTurn !== null)
    ) {
      return null;
    }
    cats[id] = {
      power: Math.max(1, Math.min(10, Math.round(cat.power))),
      factionKey: cat.factionKey,
      role,
      joinedTurn: cat.joinedTurn,
    };
  }

  const factions: ProposalSimulationFaction[] = [];
  for (const rawFaction of rawFactions) {
    const faction = asRecord(rawFaction);
    if (
      typeof faction?.key !== "string" ||
      typeof faction.name !== "string" ||
      typeof faction.leaderId !== "string" ||
      typeof faction.foundedTurn !== "number" ||
      !Number.isFinite(faction.foundedTurn)
    ) {
      return null;
    }
    factions.push({
      key: faction.key,
      name: faction.name,
      leaderId: faction.leaderId,
      foundedTurn: Math.round(faction.foundedTurn),
    });
  }

  return { cats, factions };
}

export function serializeProposalSimulationState(
  state: ProposalSimulationState,
): Record<string, unknown> {
  return {
    cats: state.cats,
    factions: state.factions,
  };
}
