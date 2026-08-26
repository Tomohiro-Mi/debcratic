import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { __debcraticDb?: Db };

export function resolveDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const explicitUrl = env.DATABASE_URL?.trim();
  if (explicitUrl) return explicitUrl;

  // Vercel's Neon integration prefixes generated variables with the project
  // resource name (for example, `debu_POSTGRES_PRISMA_URL`).
  const generatedUrl = Object.entries(env)
    .filter(([key, value]) => key.endsWith("_POSTGRES_PRISMA_URL") && value?.trim())
    .sort(([a], [b]) => a.localeCompare(b))[0]?.[1]
    ?.trim();

  return generatedUrl || undefined;
}

export function getDb(): Db {
  if (!globalForDb.__debcraticDb) {
    const url = resolveDatabaseUrl();
    if (!url) {
      throw new Error("DATABASE_URL is not set");
    }
    const sql = postgres(url, { prepare: false });
    globalForDb.__debcraticDb = drizzle(sql, { schema });
  }
  return globalForDb.__debcraticDb;
}

export { schema };
