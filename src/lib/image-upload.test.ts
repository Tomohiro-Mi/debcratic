import { describe, expect, it } from "vitest";
import { validateCatIconFile } from "@/lib/image-upload";

function file(bytes: number[], type: string) {
  return new File([new Uint8Array(bytes)], "cat-image", { type });
}

describe("validateCatIconFile", () => {
  it("accepts matching JPEG, PNG, and WebP signatures", async () => {
    await expect(validateCatIconFile(file([0xff, 0xd8, 0xff], "image/jpeg"))).resolves.toMatchObject({ extension: "jpg" });
    await expect(validateCatIconFile(file([137, 80, 78, 71, 13, 10, 26, 10], "image/png"))).resolves.toMatchObject({ extension: "png" });
    await expect(validateCatIconFile(file([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80], "image/webp"))).resolves.toMatchObject({ extension: "webp" });
  });

  it("rejects a mismatched or unsupported file", async () => {
    await expect(validateCatIconFile(file([0, 1, 2], "image/png"))).rejects.toThrow("内容");
    await expect(validateCatIconFile(file([0, 1, 2], "image/gif"))).rejects.toThrow("対応形式");
  });

  it("allows an empty file field and rejects files over 2MB", async () => {
    await expect(validateCatIconFile(null)).resolves.toBeNull();
    const large = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large", { type: "image/png" });
    await expect(validateCatIconFile(large)).rejects.toThrow("2MB以下");
  });
});
