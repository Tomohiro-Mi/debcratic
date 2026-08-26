import { describe, expect, it } from "vitest";
import { SeededRandom, hashSeed } from "@/lib/rng";

describe("SeededRandom", () => {
  it("produces identical sequences for identical seeds", () => {
    const a = new SeededRandom("turn-42");
    const b = new SeededRandom("turn-42");
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("respects int bounds", () => {
    const r = new SeededRandom(12345);
    for (let i = 0; i < 200; i++) {
      const n = r.int(1, 10);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(10);
    }
  });

  it("chance(0) is never true and chance(1) is always true", () => {
    const r = new SeededRandom("x");
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
  });

  it("shuffle keeps all elements", () => {
    const r = new SeededRandom("sh");
    const arr = [1, 2, 3, 4, 5];
    const out = r.shuffle(arr);
    expect([...out].sort()).toEqual(arr);
  });

  it("hashSeed is stable", () => {
    expect(hashSeed("abc")).toBe(hashSeed("abc"));
    expect(hashSeed("abc")).not.toBe(hashSeed("abd"));
  });
});
