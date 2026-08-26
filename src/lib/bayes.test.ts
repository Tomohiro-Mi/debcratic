import { describe, expect, it } from "vitest";
import { estimateOpinionParams } from "@/lib/bayes";

describe("estimateOpinionParams", () => {
  it("estimates high values when agreeing cats have high values", () => {
    const est = estimateOpinionParams([
      { values: { 利便性: 9 }, score: 9 },
      { values: { 利便性: 8 }, score: 8 },
      { values: { 利便性: 9 }, score: 10 },
    ]);
    expect(est["利便性"].mean).toBeGreaterThan(7.5);
    expect(est["利便性"].map).toBeGreaterThanOrEqual(8);
  });

  it("balances opposing directions into a central estimate", () => {
    const est = estimateOpinionParams([
      { values: { コスト: 4 }, score: 9 },
      { values: { コスト: 8 }, score: 9 },
      { values: { コスト: 10 }, score: -9 },
    ]);
    expect(est["コスト"].mean).toBeGreaterThan(3);
    expect(est["コスト"].mean).toBeLessThan(9);
  });

  it("returns empty for no samples", () => {
    expect(estimateOpinionParams([])).toEqual({});
  });
});
