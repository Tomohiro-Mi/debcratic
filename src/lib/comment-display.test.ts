import { describe, expect, it } from "vitest";
import { displayCatComment } from "@/lib/comment-display";

describe("displayCatComment", () => {
  it("uses the fixed wording for silent cats without changing the saved reason", () => {
    expect(displayCatComment("本来の投票理由", true)).toBe("……。");
  });

  it("uses a cat-specific wording when one is configured", () => {
    expect(displayCatComment("本来の投票理由", true, "しーん……")).toBe("しーん……");
  });

  it("falls back to the default wording when the custom wording is blank", () => {
    expect(displayCatComment("本来の投票理由", true, "  ")).toBe("……。");
  });

  it("keeps the saved reason visible for ordinary cats", () => {
    expect(displayCatComment("本来の投票理由", false)).toBe("本来の投票理由");
  });
});
