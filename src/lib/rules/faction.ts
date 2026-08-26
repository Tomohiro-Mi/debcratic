import { POWER_MIN, POWER_MAX } from "@/lib/constants";
import { similarity } from "@/lib/similarity";
import { SeededRandom } from "@/lib/rng";

export interface SimCat {
  id: string;
  name: string;
  power: number;
  topicParams: Record<string, number>;
  factionKey: string | null;
  role: "leader" | "follower" | null;
  joinedTurn: number | null;
}

export interface SimFaction {
  key: string;
  name: string;
  leaderId: string;
  foundedTurn: number;
}

export interface OpinionTurnResult {
  opinionId: string;
  prevPoint: number;
  newPoint: number;
  scores: Record<string, number>;
}

export interface TurnSettings {
  exilePenaltyProb: number;
  changeWindow: number;
  changeThreshold: number;
}

export interface SocialStateInput {
  turnNumber: number;
  seed: string;
  cats: SimCat[];
  factions: SimFaction[];
  opinionResults: OpinionTurnResult[];
  stanceChangeCounts: Record<string, number>;
  settings: TurnSettings;
}

export interface MembershipOp {
  catId: string;
  factionKey: string;
  role: "leader" | "follower";
  op: "join" | "leave";
}

export interface SocialEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface SocialTurnOutput {
  powers: Record<string, number>;
  powerChanges: { catId: string; before: number; after: number; reason: string }[];
  newFactions: { key: string; name: string; leaderId: string }[];
  dissolvedFactionKeys: string[];
  membershipOps: MembershipOp[];
  events: SocialEvent[];
}

export function maxFollowers(power: number): number {
  if (power >= 10) return 3;
  if (power === 9) return 2;
  if (power === 8) return 1;
  return 0;
}

function clampPower(v: number): number {
  return Math.max(POWER_MIN, Math.min(POWER_MAX, v));
}

function toRoman(n: number): string {
  const table: [number, string][] = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let out = "";
  let v = n;
  for (const [num, sym] of table) {
    while (v >= num) {
      out += sym;
      v -= num;
    }
  }
  return out;
}

export function simulateSocialTurn(input: SocialStateInput): SocialTurnOutput {
  const rng = new SeededRandom(input.seed);
  const turn = input.turnNumber;
  const events: SocialEvent[] = [];
  const membershipOps: MembershipOp[] = [];

  const cats: SimCat[] = input.cats.map((c) => ({
    ...c,
    topicParams: { ...c.topicParams },
  }));
  const catById = new Map(cats.map((c) => [c.id, c]));
  let factions: SimFaction[] = input.factions.map((f) => ({ ...f }));
  const dissolvedKeys = new Set<string>();
  const newFactions: SocialTurnOutput["newFactions"] = [];
  const freedThisTurn = new Set<string>();

  const leaveFaction = (cat: SimCat, reason: string) => {
    if (!cat.factionKey || !cat.role) return;
    const f = factions.find((x) => x.key === cat.factionKey);
    membershipOps.push({
      catId: cat.id,
      factionKey: cat.factionKey,
      role: cat.role,
      op: "leave",
    });
    events.push({
      type: "FactionLeft",
      payload: {
        cat_id: cat.id,
        cat_name: cat.name,
        faction: f?.name ?? cat.factionKey,
        reason,
      },
    });
    cat.factionKey = null;
    cat.role = null;
    cat.joinedTurn = null;
    freedThisTurn.add(cat.id);
  };

  const desiredDeltas: Record<string, number> = {};
  for (const r of input.opinionResults) {
    if (r.newPoint === r.prevPoint) continue;
    const entries = Object.entries(r.scores);
    if (entries.length === 0) continue;
    const sorted = [...entries].sort((a, b) => b[1] - a[1]);
    const topScore = sorted[0][1];
    const bottomScore = sorted[sorted.length - 1][1];
    const tops = sorted.filter(([, s]) => s === topScore).map(([id]) => id);
    const bottoms = sorted.filter(([, s]) => s === bottomScore).map(([id]) => id);
    const top = tops.length === 1 ? tops[0] : rng.pick(tops);
    const bottom = bottoms.length === 1 ? bottoms[0] : rng.pick(bottoms);
    if (top === bottom) continue;
    const rising = r.newPoint > r.prevPoint;
    desiredDeltas[rising ? top : bottom] =
      (desiredDeltas[rising ? top : bottom] ?? 0) + 1;
    desiredDeltas[rising ? bottom : top] =
      (desiredDeltas[rising ? bottom : top] ?? 0) - 1;
    events.push({
      type: "OpinionPowerRule",
      payload: {
        opinion_id: r.opinionId,
        prev_point: r.prevPoint,
        new_point: r.newPoint,
        winner_id: rising ? top : bottom,
        loser_id: rising ? bottom : top,
      },
    });
  }

  for (const [catId, count] of Object.entries(input.stanceChangeCounts)) {
    if (
      count >= input.settings.changeThreshold &&
      rng.chance(input.settings.exilePenaltyProb)
    ) {
      desiredDeltas[catId] = (desiredDeltas[catId] ?? 0) - 1;
      events.push({
        type: "StanceChangePenalty",
        payload: { cat_id: catId, changes: count },
      });
    }
  }

  const totalBefore = cats.reduce((a, c) => a + c.power, 0);
  for (const c of cats) {
    c.power = clampPower(c.power + (desiredDeltas[c.id] ?? 0));
  }
  let diff = totalBefore - cats.reduce((a, c) => a + c.power, 0);
  let guard = 0;
  while (diff !== 0 && guard < 10000) {
    guard++;
    let moved = false;
    for (const id of rng.shuffle(cats.map((c) => c.id))) {
      const c = catById.get(id)!;
      if (diff > 0 && c.power < POWER_MAX) {
        c.power++;
        diff--;
        moved = true;
      } else if (diff < 0 && c.power > POWER_MIN) {
        c.power--;
        diff++;
        moved = true;
      }
      if (diff === 0) break;
    }
    if (!moved) break;
  }

  const powerChanges: SocialTurnOutput["powerChanges"] = [];
  for (const c of cats) {
    const before = input.cats.find((x) => x.id === c.id)!.power;
    if (before !== c.power) {
      powerChanges.push({
        catId: c.id,
        before,
        after: c.power,
        reason:
          desiredDeltas[c.id] !== undefined
            ? "rule_based_delta"
            : "total_power_normalization",
      });
      events.push({
        type: c.power > before ? "PowerIncreased" : "PowerDecreased",
        payload: { cat_id: c.id, cat_name: c.name, before, after: c.power },
      });
    }
  }

  for (const f of [...factions]) {
    const leader = catById.get(f.leaderId);
    if (!leader || leader.power < 8 || leader.factionKey !== f.key) {
      for (const c of cats) {
        if (c.factionKey === f.key) leaveFaction(c, "faction_dissolved");
      }
      dissolvedKeys.add(f.key);
      factions = factions.filter((x) => x.key !== f.key);
      events.push({
        type: "FactionDissolved",
        payload: { faction: f.name, faction_key: f.key, turn },
      });
    }
  }

  for (const c of cats) {
    if (c.role === "follower" && c.power >= 5) {
      leaveFaction(c, "independent");
      events.push({
        type: "CatBecameIndependent",
        payload: { cat_id: c.id, cat_name: c.name, power: c.power, turn },
      });
    }
  }

  for (const c of cats) {
    if (c.role === "follower" && c.power < 3) {
      const f = factions.find((x) => x.key === c.factionKey);
      leaveFaction(c, "excommunicated");
      events.push({
        type: "CatExcommunicated",
        payload: { cat_id: c.id, cat_name: c.name, faction: f?.name, turn },
      });
    }
  }

  const isUnaffiliated = (c: SimCat) => c.factionKey === null;
  const recruitPool = () =>
    cats.filter((c) => isUnaffiliated(c) && c.power <= 5 && !freedThisTurn.has(c.id));

  for (const c of cats) {
    if (isUnaffiliated(c) && c.power >= 8) {
      let name = `${c.name}派`;
      let n = 2;
      while (
        factions.some((f) => f.name === name) ||
        newFactions.some((f) => f.name === name)
      ) {
        name = `${c.name}派${toRoman(n)}`;
        n++;
      }
      const key = `new:${c.id}:${turn}`;
      factions.push({ key, name, leaderId: c.id, foundedTurn: turn });
      newFactions.push({ key, name, leaderId: c.id });
      c.factionKey = key;
      c.role = "leader";
      c.joinedTurn = turn;
      membershipOps.push({ catId: c.id, factionKey: key, role: "leader", op: "join" });
      events.push({
        type: "FactionCreated",
        payload: {
          faction: name,
          faction_key: key,
          leader_id: c.id,
          leader_name: c.name,
          turn,
        },
      });
    }
  }

  for (const f of factions) {
    const leader = catById.get(f.leaderId);
    if (!leader) continue;
    const countFollowers = () =>
      cats.filter((c) => c.factionKey === f.key && c.role === "follower").length;
    const cap = maxFollowers(leader.power);
    while (countFollowers() < cap) {
      const pool = recruitPool();
      if (pool.length === 0) break;
      let best: SimCat | undefined;
      let bestSim = -Infinity;
      for (const cand of pool) {
        const s = similarity(leader.topicParams, cand.topicParams) + rng.float(-0.01, 0.01);
        if (s > bestSim) {
          bestSim = s;
          best = cand;
        }
      }
      if (!best) break;
      best.factionKey = f.key;
      best.role = "follower";
      best.joinedTurn = turn;
      membershipOps.push({
        catId: best.id,
        factionKey: f.key,
        role: "follower",
        op: "join",
      });
      events.push({
        type: "FactionJoined",
        payload: {
          cat_id: best.id,
          cat_name: best.name,
          faction: f.name,
          faction_key: f.key,
          turn,
        },
      });
    }
  }

  const powers: Record<string, number> = {};
  for (const c of cats) {
    powers[c.id] = c.power;
  }

  return {
    powers,
    powerChanges,
    newFactions,
    dissolvedFactionKeys: [...dissolvedKeys],
    membershipOps,
    events,
  };
}
