import { describe, expect, it } from "vitest";
import { safeRelativePath } from "@/lib/security";
import {
  changePasswordSchema,
  parseDateTimeLocal,
  updateAccountNameSchema,
} from "@/lib/validation";

describe("safeRelativePath", () => {
  it("keeps same-origin paths and query strings", () => {
    expect(safeRelativePath("/proposals/new?from=home")).toBe(
      "/proposals/new?from=home",
    );
  });

  it("rejects absolute and protocol-relative destinations", () => {
    expect(safeRelativePath("https://example.com")).toBe("/");
    expect(safeRelativePath("//example.com")).toBe("/");
    expect(safeRelativePath("/\\\\example.com")).toBe("/");
  });
});

describe("parseDateTimeLocal", () => {
  it("converts a browser local time using its UTC offset", () => {
    expect(parseDateTimeLocal("2026-08-26T11:50", "-540").toISOString()).toBe(
      "2026-08-26T02:50:00.000Z",
    );
  });

  it("rejects impossible calendar values", () => {
    expect(parseDateTimeLocal("2026-02-30T11:50", "-540").getTime()).toBeNaN();
  });
});

describe("account validation", () => {
  it("accepts a valid name change", () => {
    expect(
      updateAccountNameSchema.parse({ name: "新しい名前", currentPassword: "current-pass" }),
    ).toEqual({ name: "新しい名前", currentPassword: "current-pass" });
  });

  it("requires matching, sufficiently long new passwords", () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "current-pass",
        newPassword: "new-password",
        confirmPassword: "different-password",
      }).success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "current-pass",
        newPassword: "short",
        confirmPassword: "short",
      }).success,
    ).toBe(false);
  });
});
