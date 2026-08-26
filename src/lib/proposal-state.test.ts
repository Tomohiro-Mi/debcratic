import { describe, expect, it } from "vitest";
import {
  createInitialProposalSimulationState,
  parseProposalSimulationState,
  serializeProposalSimulationState,
} from "./proposal-state";

const cats = [
  { id: "mike", power: 8, factionId: null, leaderId: null },
  { id: "chatora", power: 4, factionId: null, leaderId: null },
];

describe("proposal simulation state", () => {
  it("snapshots each cat's configured power independently", () => {
    const first = createInitialProposalSimulationState(cats, []);
    const second = createInitialProposalSimulationState(cats, []);

    first.cats.mike.power = 10;

    expect(second.cats.mike.power).toBe(8);
    expect(second.cats.chatora.power).toBe(4);
  });

  it("round-trips the state payload used by simulation events", () => {
    const state = createInitialProposalSimulationState(cats, []);

    expect(parseProposalSimulationState(serializeProposalSimulationState(state))).toEqual(state);
  });
});
