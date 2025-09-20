import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import postgres from "postgres";
import Database from "better-sqlite3";

// Use PostgreSQL se DATABASE_URL estiver disponível, caso contrário use SQLite
const usePostgres = !!process.env.DATABASE_URL;

let db;

if (usePostgres) {
  console.log("🔄 Conectando ao PostgreSQL...");
  
  // Configuração SSL adaptativa: Replit vs Render
  const isReplit = !!process.env.REPL_ID || !!process.env.REPLIT_DB_URL;
  const sslConfig = isReplit 
    ? false // Replit não precisa SSL
    : { rejectUnauthorized: false }; // Render precisa SSL
  
  console.log(`🌐 Ambiente detectado: ${isReplit ? 'Replit' : 'Render/Produção'}`);
  
  const client = postgres(process.env.DATABASE_URL!, {
    ssl: sslConfig,
  });
  db = drizzlePostgres(client);
  console.log("✅ PostgreSQL conectado!");
} else {
  console.log("🔄 Usando SQLite local...");
  const sqlite = new Database("sqlite.db");
  db = drizzleSqlite(sqlite);
  console.log("✅ SQLite conectado!");
}

export { db };

