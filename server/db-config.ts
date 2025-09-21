import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import postgres from "postgres";
import Database from "better-sqlite3";

const isProduction = process.env.NODE_ENV === "production";

let db;

if (isProduction) {
  const client = postgres(process.env.DATABASE_URL!, {
    ssl: {
      rejectUnauthorized: false,
    },
  });
  db = drizzlePostgres(client);
} else {
  const sqlite = new Database("sqlite.db");
  db = drizzleSqlite(sqlite);
}

export { db };

