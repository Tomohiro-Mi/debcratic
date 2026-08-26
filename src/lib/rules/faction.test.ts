import { describe, expect, it } from "vitest";
import {
  simulateSocialTurn,
  maxFollowers,
  type SocialStateInput,
} from "@/lib/rules/faction";

const settings = {
  exilePenaltyProb: 0.7,
  assimilationProb: 0.5,
  assimilationMinTurns: 5,
  changeWindow: 5,
  changeThreshold: 2,
};

function cat(
  id: string,
  power: number,
  params: Record<string, number>,
  overrides: Partial<SocialStateInput["cats"][number]> = {},
): SocialStateInput["cats"][number] {
  return {
    id,
    name: id,
    power,
    params,
    factionKey: null,
    role: null,
    joinedTurn: null,
    ...overrides,
  };
}

function baseInput(over: Partial<SocialStateInput> = {}): SocialStateInput {
  return {
    turnNumber: 1,
    seed: "test-seed",
    cats: [],
    factions: [],
    opinionResults: [],
    stanceChangeCounts: {},
    settings,
    ...over,
  };
}

describe("maxFollowers", () => {
  it("follows the spec table", () => {
    expect(maxFollowers(8)).toBe(1);
    expect(maxFollowers(9)).toBe(2);
    expect(maxFollowers(10)).toBe(3);
    expect(maxFollowers(7)).toBe(0);
  });
});

describe("power conservation", () => {
  it("keeps total power constant even when deltas overflow bounds", () => {
    const catsIn = [cat("a", 10, { x: 5 }), cat("b", 1, { x: 5 }), cat("c", 5, { x: 5 })];
    const out = simulateSocialTurn(
      baseInput({
        cats: catsIn,
        opinionResults: [
          {
            opinionId: "o1",
            prevPoint: 0,
            newPoint: 10,
            scores: { a: 10, b: 9, c: -10 },
          },
        ],
      }),
    );
    const total = Object.values(out.powers).reduce((x, y) => x + y, 0);
    expect(total).toBe(16);
    for (const v of Object.values(out.powers)) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(10);
    }
  });

  it("is deterministic given the same seed", () => {
    const catsIn = [cat("a", 8, { x: 5 }), cat("b", 4, { x: 6 }), cat("c", 4, { x: 4 })];
    const input = baseInput({
      cats: catsIn,
      opinionResults: [
        { opinionId: "o1", prevPoint: 0, newPoint: 5, scores: { a: 8, b: 8, c: -3 } },
      ],
      factions: [],
    });
    const r1 = simulateSocialTurn(input);
    const r2 = simulateSocialTurn(input);
    expect(r1.powers).toEqual(r2.powers);
  });
});

describe("faction lifecycle", () => {
  it("forms a new faction when an unaffiliated cat reaches power >= 8 and recruits the most similar follower", () => {
    const catsIn = [
      cat("leader", 8, { eco: 9, safety: 3 }),
      cat("similar", 4, { eco: 8, safety: 4 }),
      cat("different", 4, { eco: 2, safety: 9 }),
    ];
    const out = simulateSocialTurn(baseInput({ cats: catsIn }));

    expect(out.newFactions.length).toBe(1);
    expect(out.newFactions[0].name).toBe("leader派");
    const joinOps = out.membershipOps.filter((m) => m.op === "join");
    const followerJoin = joinOps.find((m) => m.role === "follower");
    expect(followerJoin?.catId).toBe("similar");
    expect(out.events.some((e) => e.type === "FactionCreated")).toBe(true);
    expect(out.events.some((e) => e.type === "FactionJoined")).toBe(true);
  });

  it("dissolves a faction whose leader falls below power 8", () => {
    const catsIn = [
      cat("boss", 7, { x: 5 }, { factionKey: "f1", role: "leader", joinedTurn: 1 }),
      cat("sidekick", 4, { x: 5 }, { factionKey: "f1", role: "follower", joinedTurn: 1 }),
    ];
    const out = simulateSocialTurn(
      baseInput({
        cats: catsIn,
        factions: [{ key: "f1", name: "boss派", leaderId: "boss", foundedTurn: 1 }],
      }),
    );
    expect(out.dissolvedFactionKeys).toContain("f1");
    const leaves = out.membershipOps.filter((m) => m.op === "leave");
    expect(leaves.map((l) => l.catId).sort()).toEqual(["boss", "sidekick"]);
    expect(out.events.some((e) => e.type === "FactionDissolved")).toBe(true);
  });

  it("grants independence to followers reaching power 5", () => {
    const catsIn = [
      cat("boss", 9, { x: 5 }, { factionKey: "f1", role: "leader", joinedTurn: 1 }),
      cat("star", 5, { x: 5 }, { factionKey: "f1", role: "follower", joinedTurn: 1 }),
    ];
    const out = simulateSocialTurn(
      baseInput({
        cats: catsIn,
        factions: [{ key: "f1", name: "boss派", leaderId: "boss", foundedTurn: 1 }],
      }),
    );
    expect(out.events.some((e) => e.type === "CatBecameIndependent")).toBe(true);
    const leave = out.membershipOps.find((m) => m.catId === "star" && m.op === "leave");
    expect(leave).toBeDefined();
  });

  it("excommunicates followers below power 3 and shifts values away from leader", () => {
    const catsIn = [
      cat("boss", 9, { x: 8, y: 3 }, { factionKey: "f1", role: "leader", joinedTurn: 1 }),
      cat("weak", 2, { x: 6, y: 3 }, { factionKey: "f1", role: "follower", joinedTurn: 1 }),
    ];
    const out = simulateSocialTurn(
      baseInput({
        cats: catsIn,
        factions: [{ key: "f1", name: "boss派", leaderId: "boss", foundedTurn: 1 }],
      }),
    );
    expect(out.events.some((e) => e.type === "CatExcommunicated")).toBe(true);
    const shiftX = out.paramShifts.find((s) => s.catId === "weak" && s.param === "x");
    expect(shiftX).toEqual({ catId: "weak", param: "x", from: 6, to: 5, reason: "repulsion" });
  });

  it("assimilates followers after enough turns together", () => {
    const catsIn = [
      cat("boss", 9, { x: 9 }, { factionKey: "f1", role: "leader", joinedTurn: 1 }),
      cat("pupil", 4, { x: 5 }, { factionKey: "f1", role: "follower", joinedTurn: 1 }),
    ];
    let assimilated = false;
    for (let i = 0; i < 50 && !assimilated; i++) {
      const out = simulateSocialTurn(
        baseInput({
          turnNumber: 10,
          seed: `seed-${i}`,
          cats: catsIn.map((c) => ({ ...c })),
          factions: [{ key: "f1", name: "boss派", leaderId: "boss", foundedTurn: 1 }],
        }),
      );
      assimilated = out.paramShifts.some(
        (s) => s.reason === "assimilation" && s.to > s.from,
      );
    }
    expect(assimilated).toBe(true);
  });

  it("never recruits a freshly excommunicated cat into another faction in the same turn", () => {
    const catsIn = [
      cat("boss1", 9, { x: 8 }, { factionKey: "f1", role: "leader", joinedTurn: 1 }),
      cat("boss2", 10, { x: 8 }, { factionKey: "f2", role: "leader", joinedTurn: 1 }),
      cat("weak", 2, { x: 6 }, { factionKey: "f1", role: "follower", joinedTurn: 1 }),
    ];
    const out = simulateSocialTurn(
      baseInput({
        cats: catsIn,
        factions: [
          { key: "f1", name: "boss1派", leaderId: "boss1", foundedTurn: 1 },
          { key: "f2", name: "boss2派", leaderId: "boss2", foundedTurn: 1 },
        ],
      }),
    );
    const joins = out.membershipOps.filter(
      (m) => m.catId === "weak" && m.op === "join",
    );
    expect(joins.length).toBe(0);
  });
});
