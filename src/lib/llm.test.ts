import { describe, expect, it } from "vitest";
import {
  alignReasonTone,
  applyCommentSuffix,
  generateVoteComments,
  inferOpinionParameters,
  mockVotes,
  type LLMVoteInput,
} from "@/lib/llm";

const input: LLMVoteInput = {
  opinionId: "opinion-test",
  proposalTitle: "卒業旅行の行き先",
  proposalDescription: "みんなが安全に楽しめる行き先を決めます。",
  parameterNames: ["安全性", "現実性"],
  opinionContent: "行き先は地獄にする",
  cats: [
    {
      id: "cat-a",
      name: "アオ",
      power: 5,
      commentSuffix: "ニャ",
      topicParams: { 安全性: 9, 現実性: 9 },
      factionName: null,
      leaderName: null,
      history: [],
    },
    {
      id: "cat-b",
      name: "ミドリ",
      power: 5,
      commentSuffix: "ピィ",
      topicParams: { 安全性: 1, 現実性: 1 },
      factionName: null,
      leaderName: null,
      history: [],
    },
    {
      id: "cat-c",
      name: "シロ",
      power: 5,
      commentSuffix: "のね",
      topicParams: { 安全性: 5, 現実性: 5 },
      factionName: null,
      leaderName: null,
      history: [],
    },
    {
      id: "cat-d",
      name: "クロ",
      power: 5,
      commentSuffix: "普通",
      topicParams: { 安全性: 8, 現実性: 2 },
      factionName: null,
      leaderName: null,
      history: [],
    },
  ],
  seed: "test-seed",
};

describe("LLM vote calibration", () => {
  it("applies each cat's selected comment suffix", () => {
    const votes = mockVotes(input);

    expect(votes["cat-a"].reason.endsWith("ニャ。")).toBe(true);
    expect(votes["cat-b"].reason.endsWith("ピィ。")).toBe(true);
    expect(votes["cat-c"].reason.endsWith("のね。")).toBe(true);
    expect(votes["cat-d"].reason.endsWith("普通。")).toBe(false);
  });

  it("does not make every cat agree with an implausible opinion", () => {
    const votes = mockVotes(input);
    const scores = Object.values(votes).map((vote) => vote.score);

    expect(scores.some((score) => score < 0)).toBe(true);
    expect(new Set(scores.map((score) => (score >= 2 ? "for" : score <= -2 ? "against" : "neutral"))).size)
      .toBeGreaterThan(1);
  });

  it("uses decisive scores and comments for a clearly dangerous opinion", () => {
    const votes = mockVotes(input);
    const scores = Object.values(votes).map((vote) => vote.score);

    expect(scores.some((score) => score <= -8)).toBe(true);
    expect(scores.some((score) => score >= 8)).toBe(true);
    expect(Object.values(votes).some((vote) => vote.reason.includes("断固"))).toBe(true);
  });

  it("does not leave an explicitly strong opinion at a neutral score", () => {
    const votes = mockVotes({
      ...input,
      opinionContent: "絶対に反対。危険なので中止すべき。",
    });

    expect(Object.values(votes).every((vote) => vote.score <= -2 || vote.score >= 2)).toBe(true);
  });

  it("does not duplicate a suffix already supplied by the model", () => {
    expect(applyCommentSuffix("了解ニャ。", "ニャ")).toBe("了解ニャ。");
  });

  it("makes the displayed reason match an extreme score", () => {
    expect(alignReasonTone("ちょっと良いと思います。", 9)).toContain("断固賛成");
    expect(alignReasonTone("少し心配です。", -9)).toContain("断固反対");
  });

  it("creates semantic parameters without a network call in fallback mode", async () => {
    const result = await inferOpinionParameters(
      {
        opinionId: input.opinionId,
        proposalTitle: input.proposalTitle,
        proposalDescription: input.proposalDescription,
        parameterNames: input.parameterNames,
        opinionContent: input.opinionContent,
      },
      {},
    );

    expect(result.mock).toBe(true);
    expect(result.parameters.安全性.mean).toBe(1);
    expect(result.parameters.現実性.mean).toBe(1);
  });

  it("generates comments from fixed scores without changing them", async () => {
    const result = await generateVoteComments(
      {
        opinionId: input.opinionId,
        proposalTitle: input.proposalTitle,
        proposalDescription: input.proposalDescription,
        opinionContent: input.opinionContent,
        seed: input.seed,
        cats: input.cats.map((cat, index) => ({
          id: cat.id,
          name: cat.name,
          commentSuffix: cat.commentSuffix,
          factionName: cat.factionName,
          score: index % 2 === 0 ? 9 : -9,
          confidence: 0.9,
          factors: [],
        })),
      },
      {},
    );

    expect(result.comments["cat-a"]).toContain("断固賛成");
    expect(result.comments["cat-b"]).toContain("断固反対");
  });
});
