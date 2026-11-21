import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

// Created on first use, so `next build` works without DATABASE_URL,
// and reused across hot reloads in dev.
const g = globalThis as unknown as { db?: DB };

function getDb(): DB {
  if (g.db) return g.db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  g.db = drizzle(postgres(url, { max: 10 }), { schema });
  return g.db;
}

export const db = new Proxy({} as DB, {
  get: (_t, prop) => Reflect.get(getDb(), prop),
});
export { schema };
