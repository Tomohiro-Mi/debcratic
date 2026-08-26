import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { __debcraticDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__debcraticDb) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set");
    }
    const sql = postgres(url, { prepare: false });
    globalForDb.__debcraticDb = drizzle(sql, { schema });
  }
  return globalForDb.__debcraticDb;
}

export { schema };
