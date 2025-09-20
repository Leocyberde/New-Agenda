import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL não definida. Configure no Render/Replit.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false,
});

// Define users table schema directly in the migration script
const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("admin"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

const merchants = pgTable("merchants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerName: text("owner_name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  status: text("status").notNull().default("pending"),
  logoUrl: text("logo_url"),
  isOpen: boolean("is_open").notNull().default(true),
  workDays: text("work_days").notNull().default("[1,2,3,4,5,6]"),
  startTime: text("start_time").notNull().default("09:00"),
  endTime: text("end_time").notNull().default("18:00"),
  breakStartTime: text("break_start_time").default("12:00"),
  breakEndTime: text("break_end_time").default("13:00"),
  accessStartDate: timestamp("access_start_date"),
  accessEndDate: timestamp("access_end_date"),
  accessDurationDays: integer("access_duration_days").default(30),
  lastPaymentDate: timestamp("last_payment_date"),
  nextPaymentDue: timestamp("next_payment_due"),
  monthlyFee: integer("monthly_fee").default(5000),
  paymentStatus: text("payment_status").notNull().default("pending"),
  planStatus: text("plan_status").notNull().default("free"),
  planValidity: timestamp("plan_validity"),
  noShowFeeEnabled: boolean("no_show_fee_enabled").notNull().default(false),
  noShowFeeAmount: integer("no_show_fee_amount").default(0),
  lateFeeEnabled: boolean("late_fee_enabled").notNull().default(false),
  lateFeeAmount: integer("late_fee_amount").default(0),
  lateToleranceMinutes: integer("late_tolerance_minutes").default(15),
  cancellationPolicyHours: integer("cancellation_policy_hours").default(24),
  cancellationFeeEnabled: boolean("cancellation_fee_enabled").notNull().default(false),
  cancellationFeeAmount: integer("cancellation_fee_amount").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

const db = drizzle(pool, {
  schema: { users, merchants }
});

// Função segura para criar tabelas
async function createTablesIfNotExists() {
  try {
    // Criar tabela users se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Criar tabela merchants se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        phone TEXT NOT NULL,
        address TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        logo_url TEXT,
        is_open BOOLEAN NOT NULL DEFAULT true,
        work_days TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',
        start_time TEXT NOT NULL DEFAULT '09:00',
        end_time TEXT NOT NULL DEFAULT '18:00',
        break_start_time TEXT DEFAULT '12:00',
        break_end_time TEXT DEFAULT '13:00',
        access_start_date TIMESTAMP,
        access_end_date TIMESTAMP,
        access_duration_days INTEGER DEFAULT 30,
        last_payment_date TIMESTAMP,
        next_payment_due TIMESTAMP,
        monthly_fee INTEGER DEFAULT 5000,
        payment_status TEXT NOT NULL DEFAULT 'pending',
        no_show_fee_enabled BOOLEAN NOT NULL DEFAULT false,
        no_show_fee_amount INTEGER DEFAULT 0,
        late_fee_enabled BOOLEAN NOT NULL DEFAULT false,
        late_fee_amount INTEGER DEFAULT 0,
        late_tolerance_minutes INTEGER DEFAULT 15,
        cancellation_policy_hours INTEGER DEFAULT 24,
        cancellation_fee_enabled BOOLEAN NOT NULL DEFAULT false,
        cancellation_fee_amount INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Adicionar colunas plan_status e plan_validity se não existirem
    try {
      await pool.query(`
        ALTER TABLE merchants 
        ADD COLUMN IF NOT EXISTS plan_status TEXT DEFAULT 'free',
        ADD COLUMN IF NOT EXISTS plan_validity TIMESTAMP;
      `);
    } catch (error) {
      // Se falhar (PostgreSQL mais antigo), tentar individualmente
      try {
        await pool.query(`ALTER TABLE merchants ADD COLUMN plan_status TEXT DEFAULT 'free';`);
      } catch (e) {
        console.log("Coluna plan_status já existe ou não pôde ser criada");
      }
      try {
        await pool.query(`ALTER TABLE merchants ADD COLUMN plan_validity TIMESTAMP;`);
      } catch (e) {
        console.log("Coluna plan_validity já existe ou não pôde ser criada");
      }
    }
    
    // Criar demais tabelas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS services (
        id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        price INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT services_merchant_id_fk FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
      );
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        phone TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'employee',
        specialties TEXT,
        work_days TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',
        start_time TEXT NOT NULL DEFAULT '09:00',
        end_time TEXT NOT NULL DEFAULT '18:00',
        break_start_time TEXT DEFAULT '12:00',
        break_end_time TEXT DEFAULT '13:00',
        payment_type TEXT NOT NULL DEFAULT 'monthly',
        payment_value INTEGER NOT NULL DEFAULT 0,
        extended_end_time TEXT,
        overtime_hours INTEGER DEFAULT 0,
        last_overtime_date TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT employees_merchant_id_fk FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
      );
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        phone TEXT NOT NULL,
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT clients_merchant_id_fk FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
      );
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        service_id TEXT NOT NULL,
        client_id TEXT,
        employee_id TEXT,
        client_name TEXT NOT NULL,
        client_phone TEXT NOT NULL,
        client_email TEXT,
        appointment_date TEXT NOT NULL,
        appointment_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        notes TEXT,
        reschedule_reason TEXT,
        cancel_reason TEXT,
        cancel_policy TEXT NOT NULL DEFAULT '24h',
        reminder_sent BOOLEAN NOT NULL DEFAULT false,
        arrival_time TEXT,
        completed_at TIMESTAMP,
        payment_status TEXT DEFAULT 'pending',
        paid_at TIMESTAMP,
        actual_start_time TEXT,
        actual_end_time TEXT,
        new_date TEXT,
        new_time TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT appointments_merchant_id_fk FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
        CONSTRAINT appointments_service_id_fk FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
        CONSTRAINT appointments_client_id_fk FOREIGN KEY (client_id) REFERENCES clients(id),
        CONSTRAINT appointments_employee_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id)
      );
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS penalties (
        id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        client_id TEXT,
        appointment_id TEXT,
        client_name TEXT NOT NULL,
        client_phone TEXT NOT NULL,
        client_email TEXT,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        paid_at TIMESTAMP,
        paid_by TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT penalties_merchant_id_fk FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
        CONSTRAINT penalties_client_id_fk FOREIGN KEY (client_id) REFERENCES clients(id),
        CONSTRAINT penalties_appointment_id_fk FOREIGN KEY (appointment_id) REFERENCES appointments(id)
      );
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS promotions (
        id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        service_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        discount_type TEXT NOT NULL DEFAULT 'percentage',
        discount_value INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT promotions_merchant_id_fk FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
        CONSTRAINT promotions_service_id_fk FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
      );
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_days_off (
        id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        date TEXT NOT NULL,
        reason TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT employee_days_off_merchant_id_fk FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE,
        CONSTRAINT employee_days_off_employee_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
      );
    `);
    
    // Criar tabela system_settings se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL DEFAULT 'string',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Inserir configurações padrão se não existirem
    await pool.query(`
      INSERT INTO system_settings (id, key, value, description, type) 
      VALUES ('vip-plan-price', 'vip_plan_price', '5000', 'Valor mensal do plano VIP em centavos', 'number')
      ON CONFLICT (key) DO NOTHING;
    `);
    
    await pool.query(`
      INSERT INTO system_settings (id, key, value, description, type)
      VALUES ('trial-plan-duration', 'trial_plan_duration', '10', 'Duração do período de teste em dias', 'number')
      ON CONFLICT (key) DO NOTHING;
    `);
    
    await pool.query(`
      INSERT INTO system_settings (id, key, value, description, type)
      VALUES ('vip-plan-duration', 'vip_plan_duration', '30', 'Duração do plano VIP em dias', 'number')
      ON CONFLICT (key) DO NOTHING;
    `);
    
    console.log("✅ Todas as tabelas verificadas/criadas com sucesso!");
    
  } catch (error) {
    console.error("❌ Erro ao criar tabelas:", error);
    throw error;
  }
}

async function runMigrations() {
  try {
    console.log("=== INICIANDO MIGRAÇÕES (RENDER/REPLIT) - MÉTODO SEGURO ===");
    console.log("DATABASE_URL:", process.env.DATABASE_URL ? "DEFINIDA" : "NÃO DEFINIDA");
    console.log("NODE_ENV:", process.env.NODE_ENV);
    
    // Verificar conexão com banco
    try {
      const testQuery = await pool.query('SELECT NOW()');
      console.log("✅ Conexão com banco OK:", testQuery.rows[0]);
    } catch (error) {
      console.error("❌ Erro de conexão com banco:", error);
      throw error;
    }
    
    // Usar método seguro para criar tabelas se não existirem
    console.log("🔄 Criando tabelas de forma segura (IF NOT EXISTS)...");
    await createTablesIfNotExists();
    console.log("✅ Schema sincronizado com sucesso!");
    
    // Atualizar validação do plano para merchants existentes sem plan_validity
    try {
      await pool.query(`
        UPDATE merchants 
        SET plan_validity = NOW() + INTERVAL '10 days' 
        WHERE plan_validity IS NULL AND plan_status = 'free';
      `);
      console.log("✅ Plan validity atualizado para merchants existentes");
    } catch (error) {
      console.log("⚠️ Aviso: Não foi possível atualizar plan_validity:", error.message);
    }
    
    // Verificar se tabela users existe
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    console.log("Tabela users existe:", tableExists.rows[0].exists);
    
    // Verificar credenciais do administrador
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Em produção, exigir credenciais seguras
    if (isProduction && (!adminEmail || !adminPassword)) {
      console.error("❌ ERRO DE SEGURANÇA: Em produção, ADMIN_EMAIL e ADMIN_PASSWORD devem ser definidos.");
      console.error("Configure essas variáveis de ambiente antes do deploy.");
      process.exit(1);
    }
    
    // Para desenvolvimento, usar valores padrão seguros
    const finalAdminEmail = adminEmail || "admin@desenvolvimento.local";
    const finalAdminPassword = adminPassword || `dev${randomUUID().slice(0, 8)}`;
    
    if (!isProduction && (!adminEmail || !adminPassword)) {
      console.log("⚠️  Ambiente de desenvolvimento: usando credenciais temporárias");
      console.log("   Email:", finalAdminEmail);
      console.log("   Senha:", finalAdminPassword);
      console.log("   Configure ADMIN_EMAIL e ADMIN_PASSWORD para credenciais fixas.");
    }
    
    console.log("🔍 Verificando se usuário admin existe...");
    if (!isProduction) {
      console.log("Admin email (para login):", finalAdminEmail);
    }
    
    // Usar UPSERT para criação segura do admin (concurrency-safe)
    try {
      const hashedPassword = await bcrypt.hash(finalAdminPassword, 10);
      
      const adminUser = {
        id: randomUUID(),
        email: finalAdminEmail,
        password: hashedPassword,
        role: "admin",
        createdAt: new Date(),
      };
      
      // UPSERT: insere se não existe, ou atualiza se existe
      await pool.query(`
        INSERT INTO users (id, email, password, role, created_at) 
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (email) 
        DO UPDATE SET 
          password = EXCLUDED.password,
          role = EXCLUDED.role
        WHERE users.email = $2;
      `, [adminUser.id, adminUser.email, adminUser.password, adminUser.role, adminUser.createdAt]);
      
      console.log("✅ Usuário admin configurado com sucesso!");
      
    } catch (error) {
      console.error("❌ Erro ao configurar usuário admin:", error.message);
      throw error;
    }
    
    // Listar todos os usuários para debug
    const allUsers = await db.select({ email: users.email, role: users.role }).from(users).execute();
    console.log("📊 Total de usuários no banco:", allUsers.length);
    allUsers.forEach((user, index) => {
      console.log(`Usuario ${index + 1}: ${user.email} (${user.role})`);
    });
    
    // Listar todas as tabelas para debug
    const allTables = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public';
    `);
    console.log("📋 Tabelas existentes:", allTables.rows.map(row => row.tablename));
    
    await pool.end();
    console.log("=== INICIALIZAÇÃO COMPLETA ===");
    if (isProduction) {
      console.log("🔑 Admin configurado com credenciais seguras de produção");
    } else {
      console.log("🔑 Admin configurado para desenvolvimento");
      console.log("📝 Email admin:", finalAdminEmail);
      if (finalAdminPassword.startsWith('dev')) {
        console.log("📝 Senha temporária:", finalAdminPassword);
      }
    }
    process.exit(0);
  } catch (error) {
    console.error("❌ ERRO AO EXECUTAR MIGRAÇÕES:", error);
    console.error("Stack trace:", error.stack);
    await pool.end();
    process.exit(1);
  }
}

runMigrations();

