import { describe, expect, it } from "vitest";
import {
  calculateBayesianVotes,
  createRuleBasedOpinionParameters,
  estimateOpinionParams,
  updateOpinionPosterior,
} from "@/lib/bayes";

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

describe("Bayesian vote engine", () => {
  const cats = [
    {
      id: "safe-cat",
      name: "安全派",
      power: 8,
      topicParams: { 安全性: 9 },
      factionName: null,
      leaderName: null,
      leaderScore: null,
      history: [],
    },
    {
      id: "risk-cat",
      name: "冒険派",
      power: 3,
      topicParams: { 安全性: 1 },
      factionName: null,
      leaderName: null,
      leaderScore: null,
      history: [],
    },
  ];

  it("is reproducible and separates cats with opposing values", () => {
    const args = {
      opinionId: "opinion-bayes",
      opinionContent: "安全性を下げてでも刺激を優先する",
      parameterNames: ["安全性"],
      opinionParameters: {
        安全性: { mean: 1, variance: 1, confidence: 0.9 },
      },
      cats,
      seed: "turn-bayes",
    };
    const first = calculateBayesianVotes(args);
    const second = calculateBayesianVotes(args);

    expect(first).toEqual(second);
    expect(first["safe-cat"].score).toBeLessThan(first["risk-cat"].score);
  });

  it("updates the posterior without replacing the prior object", () => {
    const prior = {
      安全性: { mean: 5.5, variance: 6, confidence: 0.25 },
    };
    const posterior = updateOpinionPosterior(prior, [
      { values: { 安全性: 9 }, score: 9 },
      { values: { 安全性: 8 }, score: 8 },
    ]);

    expect(posterior.安全性.mean).toBeGreaterThan(prior.安全性.mean);
    expect(prior.安全性).toEqual({ mean: 5.5, variance: 6, confidence: 0.25 });
  });

  it("has a rule fallback for dangerous text", () => {
    const fallback = createRuleBasedOpinionParameters(
      ["安全性", "楽しさ"],
      "地獄に行く",
      "fallback-test",
    );

    expect(fallback.安全性.mean).toBe(1);
    expect(fallback.安全性.confidence).toBeGreaterThan(0.7);
  });
});
