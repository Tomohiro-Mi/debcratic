import { describe, expect, it } from "vitest";
import {
  simulateSocialTurn,
  type SimCat,
  type SimFaction,
  type SocialEvent,
} from "@/lib/rules/faction";

const catsSeed: SimCat[] = [
  { id: "mike", name: "ミケ", power: 8, topicParams: { convenience: 9, safety: 7 }, factionKey: null, role: null, joinedTurn: null },
  { id: "chatora", name: "茶トラ", power: 6, topicParams: { convenience: 8, safety: 6 }, factionKey: null, role: null, joinedTurn: null },
  { id: "hachiware", name: "ハチワレ", power: 4, topicParams: { convenience: 8, safety: 7 }, factionKey: null, role: null, joinedTurn: null },
  { id: "sabatora", name: "サバトラ", power: 5, topicParams: { convenience: 3, safety: 4 }, factionKey: null, role: null, joinedTurn: null },
  { id: "kuroneko", name: "黒猫", power: 3, topicParams: { convenience: 2, safety: 3 }, factionKey: null, role: null, joinedTurn: null },
  { id: "shironeko", name: "白猫", power: 4, topicParams: { convenience: 5, safety: 2 }, factionKey: null, role: null, joinedTurn: null },
];

const winnerSequence = [
  "mike", "mike", "chatora", "chatora", "hachiware",
  "kuroneko", "kuroneko", "mike", "mike", "shironeko",
  "sabatora", "hachiware", "hachiware", "kuroneko", "mike",
  "chatora", "sabatora", "shironeko", "kuroneko", "hachiware",
];

interface SimulationState {
  cats: SimCat[];
  factions: SimFaction[];
}

interface SimulationRow {
  turn: number;
  powers: Record<string, number>;
  factions: string[];
  eventTypes: string[];
}

function opinionForTurn(turn: number, cats: SimCat[]) {
  const winner = winnerSequence[turn - 1];
  const winnerIndex = cats.findIndex((c) => c.id === winner);
  const loser = cats[(winnerIndex + 1) % cats.length].id === winner
    ? cats[(winnerIndex + 2) % cats.length].id
    : cats[(winnerIndex + 1) % cats.length].id;
  const rising = turn % 4 !== 0;
  const scores = Object.fromEntries(
    cats.map((c) => [c.id, c.id === winner ? (rising ? 10 : -10) : c.id === loser ? (rising ? -10 : 10) : 0]),
  );
  return {
    opinionId: `simulation-opinion-${turn}`,
    prevPoint: 0,
    newPoint: rising ? 10 : -10,
    scores,
  };
}

function applyTurn(state: SimulationState, turn: number): { state: SimulationState; events: SocialEvent[] } {
  const output = simulateSocialTurn({
    turnNumber: turn,
    seed: `simulation-20-turn-${turn}`,
    cats: state.cats,
    factions: state.factions,
    opinionResults: [opinionForTurn(turn, state.cats)],
    stanceChangeCounts: {},
    settings: { exilePenaltyProb: 0.7, changeWindow: 5, changeThreshold: 2 },
  });

  const cats = state.cats.map((cat) => ({ ...cat, power: output.powers[cat.id] }));
  for (const operation of output.membershipOps) {
    const cat = cats.find((candidate) => candidate.id === operation.catId);
    if (!cat) continue;
    if (operation.op === "leave") {
      cat.factionKey = null;
      cat.role = null;
      cat.joinedTurn = null;
    } else {
      cat.factionKey = operation.factionKey;
      cat.role = operation.role;
      cat.joinedTurn = turn;
    }
  }

  const dissolved = new Set(output.dissolvedFactionKeys);
  const factions = state.factions
    .filter((faction) => !dissolved.has(faction.key))
    .concat(output.newFactions.map((faction) => ({ ...faction, foundedTurn: turn })));
  return { state: { cats, factions }, events: output.events };
}

function simulateTwentyTurns(): SimulationRow[] {
  let state: SimulationState = { cats: catsSeed.map((cat) => ({ ...cat, topicParams: { ...cat.topicParams } })), factions: [] };
  const rows: SimulationRow[] = [];
  for (let turn = 1; turn <= 20; turn++) {
    const result = applyTurn(state, turn);
    state = result.state;
    rows.push({
      turn,
      powers: Object.fromEntries(state.cats.map((cat) => [cat.id, cat.power])),
      factions: state.factions.map((faction) => faction.name),
      eventTypes: [...new Set(result.events.map((event) => event.type))],
    });
  }
  return rows;
}

describe("20-turn social simulation", () => {
  it("keeps the rule engine stable and reports what happens", () => {
    const rows = simulateTwentyTurns();
    const totalPower = Object.values(rows[0].powers).reduce((sum, power) => sum + power, 0);

    expect(rows).toHaveLength(20);
    expect(simulateTwentyTurns()).toEqual(rows);
    for (const row of rows) {
      expect(Object.values(row.powers).reduce((sum, power) => sum + power, 0)).toBe(totalPower);
      expect(Object.values(row.powers).every((power) => power >= 1 && power <= 10)).toBe(true);
    }

    console.log(
      [
        "20ターン・シミュレーション（DB変更なし）",
        ...rows.map((row) => {
          const powers = Object.entries(row.powers).map(([id, power]) => `${id}:${power}`).join(" ");
          const factions = row.factions.length > 0 ? row.factions.join(",") : "無所属のみ";
          const events = row.eventTypes.length > 0 ? row.eventTypes.join(",") : "イベントなし";
          return `T${String(row.turn).padStart(2, "0")} | ${powers} | 派閥: ${factions} | ${events}`;
        }),
      ].join("\n"),
    );
  });
});
