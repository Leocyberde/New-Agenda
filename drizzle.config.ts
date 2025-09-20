import { defineConfig } from "drizzle-kit";

const isProduction = process.env.NODE_ENV === "production";

export default defineConfig({
  out: "./drizzle",
  schema: "./shared/schema.ts",
  dialect: isProduction ? "postgresql" : "sqlite",
  dbCredentials: {
    url: isProduction ? process.env.DATABASE_URL : "file:./sqlite.db",
  },
});

