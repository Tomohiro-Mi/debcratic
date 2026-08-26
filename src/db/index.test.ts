import { describe, expect, it } from "vitest";
import { resolveDatabaseUrl } from "./index";

describe("resolveDatabaseUrl", () => {
  it("prefers the explicit DATABASE_URL", () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: "postgres://explicit.example/db",
        debu_POSTGRES_PRISMA_URL: "postgres://generated.example/db",
      }),
    ).toBe("postgres://explicit.example/db");
  });

  it("uses a prefixed Neon pooled URL when DATABASE_URL is absent", () => {
    expect(
      resolveDatabaseUrl({
        debu_POSTGRES_PRISMA_URL: " postgres://generated.example/db ",
      }),
    ).toBe("postgres://generated.example/db");
  });

  it("returns undefined when no supported URL is configured", () => {
    expect(resolveDatabaseUrl({})).toBeUndefined();
  });
});
