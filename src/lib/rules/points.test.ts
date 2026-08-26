import { describe, expect, it } from "vitest";
import { computeOpinionStats, stanceOf } from "@/lib/rules/points";

describe("stanceOf", () => {
  it("classifies stances per spec", () => {
    expect(stanceOf(-10)).toBe("against");
    expect(stanceOf(-2)).toBe("against");
    expect(stanceOf(-1)).toBe("neutral");
    expect(stanceOf(0)).toBe("neutral");
    expect(stanceOf(1)).toBe("neutral");
    expect(stanceOf(2)).toBe("for");
    expect(stanceOf(10)).toBe("for");
  });
});

describe("computeOpinionStats", () => {
  it("computes spec example", () => {
    const s = computeOpinionStats({ a: 8, b: 3, c: -4, d: 6, e: -2 });
    expect(s.point).toBe(11);
    expect(s.avg).toBeCloseTo(2.2);
    expect(s.agreePct).toBe(60);
    expect(s.neutralPct).toBe(0);
    expect(s.againstPct).toBe(40);
    expect(s.polarization).toBeGreaterThan(4);
  });

  it("distinguishes consensus from polarization", () => {
    const consensus = computeOpinionStats({ a: 3, b: 3, c: 3 });
    const polarized = computeOpinionStats({ a: 10, b: -10, c: -10, d: 10 });
    expect(polarized.polarization).toBeGreaterThan(consensus.polarization);
  });

  it("handles empty votes", () => {
    const s = computeOpinionStats({});
    expect(s.point).toBe(0);
    expect(s.count).toBe(0);
  });
});
