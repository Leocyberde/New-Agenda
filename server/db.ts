import { db } from "./db-config";

// Função de compatibilidade
export async function initializeDatabase() {
  return db;
}

