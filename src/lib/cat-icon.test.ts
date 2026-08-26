import { describe, expect, it } from "vitest";
import {
  catIconProxyUrl,
  isCatIconImage,
  isPrivateCatIconPath,
  privateCatIconPathFromUrl,
} from "@/lib/cat-icon";

const pathname = "cats/tama/123e4567-e89b-12d3-a456-426614174000.png";

describe("cat icon proxy paths", () => {
  it("creates and validates a proxy URL for a generated blob pathname", () => {
    const url = catIconProxyUrl(pathname);
    expect(url).toBe(`/api/cat-icons/${pathname}`);
    expect(isCatIconImage(url)).toBe(true);
    expect(privateCatIconPathFromUrl(url)).toBe(pathname);
    expect(isPrivateCatIconPath(pathname)).toBe(true);
  });

  it("rejects arbitrary proxy paths", () => {
    expect(isCatIconImage("/api/cat-icons/other/secret.txt")).toBe(false);
    expect(privateCatIconPathFromUrl("/api/cat-icons/other/secret.txt")).toBeNull();
  });
});
