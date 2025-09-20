import { type User, type InsertUser, type Merchant, type InsertMerchant, type Service, type InsertService, type Employee, type InsertEmployee, type Client, type InsertClient, type Appointment, type InsertAppointment, type AvailabilityData, type AppointmentStatusData, promotions, type EmployeeDayOff, type InsertEmployeeDayOff, type Promotion, type InsertPromotion, type SystemSetting, users, merchants, 
  services, 
  employees, 
  clients, 
  appointments, 
  employeeDaysOff, 
  systemSettings } from "../shared/schema";

import { db } from "./db-config";
import { eq, count, gte, and, sql, lte, desc, asc, inArray, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import type { IStorage } from "./storage";
import { format, subDays } from 'date-fns';


export class SQLiteStorage implements IStorage {
  private initialized = false;

  // Using db instance from ./db for all operations
  private db = db;


  constructor() {
    // Don't call initialize in constructor
  }

  async initialize(): Promise<void> {
    if (!this.initialized) {
      // For SQLite, the database is created on connection, so no complex initialization is needed.
      this.initialized = true;
      console.log("Database initialized successfully.");
    }
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    if (!this.initialized) await this.initialize();
    const user = (await this.db.select().from(users).where(eq(users.id, id)).execute())[0];
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (!this.initialized) await this.initialize();
    const user = (await this.db.select().from(users).where(eq(users.email, email)).execute())[0];
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    if (!this.initialized) await this.initialize();
    const hashedPassword = await bcrypt.hash(insertUser.password, 10);
    const id = randomUUID();
    const user: User = {
      ...insertUser,
      id,
      password: hashedPassword,
      role: insertUser.role || "merchant",
      createdAt: new Date(),
      updatedAt: new Date()// Ensure updatedAt is set
    };

    await this.db.insert(users).values(user).execute();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    if (!this.initialized) await this.initialize();
    await this.db.update(users).set({ ...updates, updatedAt: new Date() }).where(eq(users.id, id)).execute();
    return this.getUser(id);
  }

  async updateUserPassword(id: string, newPassword: string): Promise<boolean> {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await this.db.update(users).set({ password: hashedPassword, updatedAt: new Date() }).where(eq(users.id, id)).execute();
      return true;
    } catch (error) {
      console.error("Error updating user password:", error);
      return false;
    }
  }

  // Merchant methods
  async getMerchant(id: string): Promise<Merchant | undefined> {
    if (!this.initialized) await this.initialize();
    const merchant = (await this.db.select().from(merchants).where(eq(merchants.id, id)).execute())[0];
    return merchant || undefined;
  }

  async getMerchantByEmail(email: string): Promise<Merchant | undefined> {
    if (!this.initialized) await this.initialize();
    const merchant = (await this.db.select().from(merchants).where(eq(merchants.email, email)).execute())[0];
    return merchant || undefined;
  }

  async getAllMerchants(): Promise<Merchant[]> {
    if (!this.initialized) await this.initialize();
    const allMerchants = await this.db.select().from(merchants).execute();
    return allMerchants.sort((a, b) =>
      new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
    );
  }

  async createMerchant(insertMerchant: InsertMerchant): Promise<Merchant> {
    if (!this.initialized) await this.initialize();
    const hashedPassword = await bcrypt.hash(insertMerchant.password, 10);
    const id = randomUUID();
    const now = new Date();
    const merchant: Merchant = {
      ...insertMerchant,
      id,
      password: hashedPassword,
      status: insertMerchant.status || "pending",
      planStatus: insertMerchant.planStatus || "free", // Default plan status
      planValidity: insertMerchant.planValidity || null, // Default plan validity
      createdAt: now,
      updatedAt: now,
      workDays: insertMerchant.workDays || "[0,1,2,3,4,5,6]", // Default to all days
      startTime: insertMerchant.startTime || "09:00", // Default start time
      endTime: insertMerchant.endTime || "18:00" // Default end time
    };

    await this.db.insert(merchants).values(merchant).execute();
    return merchant;
  }

  async updateMerchant(id: string, updates: Partial<InsertMerchant>): Promise<Merchant | undefined> {
    if (!this.initialized) await this.initialize();
    const existingMerchant = await this.getMerchant(id);
    if (!existingMerchant) return undefined;

    // Hash password if it's being updated
    const processedUpdates = { ...updates };
    if (processedUpdates.password) {
      processedUpdates.password = await bcrypt.hash(processedUpdates.password, 10);
    }

    const updatedMerchant: Merchant = {
      ...existingMerchant,
      ...processedUpdates,
      planStatus: processedUpdates.planStatus || existingMerchant.planStatus,
      planValidity: processedUpdates.planValidity || existingMerchant.planValidity,
      updatedAt: new Date(),
    };

    await this.db.update(merchants).set(updatedMerchant).where(eq(merchants.id, id)).execute();

    // If working hours are being updated, sync employee hours
    if (updates.startTime || updates.endTime || updates.workDays) {
      await this.syncEmployeeHoursWithMerchant(id, updatedMerchant);
    }

    return updatedMerchant;
  }

  async updateMerchantPassword(id: string, newPassword: string): Promise<boolean> {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await this.db.update(merchants).set({ password: hashedPassword, updatedAt: new Date() }).where(eq(merchants.id, id)).execute();
      return true;
    } catch (error) {
      console.error("Error updating merchant password:", error);
      return false;
    }
  }

  private async syncEmployeeHoursWithMerchant(merchantId: string, merchant: Merchant): Promise<void> {
    try {
      const employees = await this.getEmployeesByMerchant(merchantId);

      for (const employee of employees) {
        const updates: Partial<InsertEmployee> = {};

        if (merchant.startTime && merchant.startTime !== employee.startTime) {
          updates.startTime = merchant.startTime;
        }

        if (merchant.endTime && merchant.endTime !== employee.endTime) {
          updates.endTime = merchant.endTime;
        }

        if (merchant.workDays && merchant.workDays !== employee.workDays) {
          updates.workDays = merchant.workDays;
        }

        if (Object.keys(updates).length > 0) {
          await this.updateEmployee(employee.id, updates);
          console.log(`Synced employee ${employee.name} hours with merchant hours:`, updates);
        }
      }
    } catch (error) {
      console.error("Error syncing employee hours with merchant:", error);
    }
  }

  async deleteMerchant(id: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();
    const result = await this.db.delete(merchants).where(eq(merchants.id, id)).execute();
    return result.changes > 0;
  }

  async getMerchantsByStatus(status: string): Promise<Merchant[]> {
    if (!this.initialized) await this.initialize();
    return this.db.select().from(merchants).where(eq(merchants.status, status)).execute();
  }

  async getMerchantsStats(): Promise<{
    total: number;
    active: number;
    pending: number;
    inactive: number;
    thisMonth: number;
  }> {
    if (!this.initialized) await this.initialize();
    const allMerchants = await this.db.select().from(merchants).execute();
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return {
      total: allMerchants.length,
      active: allMerchants.filter(m => m.status === "active").length,
      pending: allMerchants.filter(m => m.status === "pending").length,
      inactive: allMerchants.filter(m => m.status === "inactive").length,
      thisMonth: allMerchants.filter(m => new Date(m.createdAt!).getTime() >= thisMonth.getTime()).length,
    };
  }

  // Service methods
  async getService(id: string): Promise<Service | undefined> {
    if (!this.initialized) await this.initialize();
    const service = (await this.db.select().from(services).where(eq(services.id, id)).execute())[0];
    return service || undefined;
  }

  async getServicesByMerchant(merchantId: string): Promise<Service[]> {
    if (!this.initialized) await this.initialize();
    return this.db.select().from(services).where(eq(services.merchantId, merchantId)).execute();
  }

  async getActiveServicesByMerchant(merchantId: string): Promise<Service[]> {
    if (!this.initialized) await this.initialize();
    return this.db.select().from(services)
      .where(and(
        eq(services.merchantId, merchantId),
        eq(services.isActive, true)
      ))
      .execute();
  }

  async createService(insertService: InsertService): Promise<Service> {
    if (!this.initialized) await this.initialize();
    const id = randomUUID();
    const now = new Date();
    const service: Service = {
      ...insertService,
      id,
      description: insertService.description || null,
      isActive: insertService.isActive ?? true,
      createdAt: now,
      updatedAt: now,
      duration: insertService.duration || 60, // Default duration to 60 minutes
      price: insertService.price || 0, // Default price to 0
    };

    await this.db.insert(services).values(service).execute();
    return service;
  }

  async updateService(id: string, updates: Partial<InsertService>): Promise<Service | undefined> {
    if (!this.initialized) await this.initialize();
    const existingService = await this.getService(id);
    if (!existingService) return undefined;

    const updatedService: Service = {
      ...existingService,
      ...updates,
      updatedAt: new Date(),
    };

    await this.db.update(services).set(updatedService).where(eq(services.id, id)).execute();
    return updatedService;
  }

  async deleteService(id: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();
    const result = await this.db.delete(services).where(eq(services.id, id)).execute();
    return result.changes > 0;
  }

  async updateServiceMerchant(serviceId: string, newMerchantId: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();
    const result = await this.db.update(services)
      .set({
        merchantId: newMerchantId,
        updatedAt: new Date()
      })
      .where(eq(services.id, serviceId))
      .execute();
    return result.changes > 0;
  }

  // Employee methods
  async getEmployee(id: string): Promise<Employee | undefined> {
    if (!this.initialized) await this.initialize();
    const employee = (await this.db.select().from(employees).where(eq(employees.id, id)).execute())[0];
    return employee || undefined;
  }

  async getEmployeeByEmail(email: string): Promise<Employee | undefined> {
    if (!this.initialized) await this.initialize();
    const employee = (await this.db.select().from(employees).where(eq(employees.email, email)).execute())[0];
    return employee || undefined;
  }

  async getEmployeesByMerchant(merchantId: string): Promise<Employee[]> {
    if (!this.initialized) await this.initialize();
    return this.db.select().from(employees).where(eq(employees.merchantId, merchantId)).execute();
  }

  async createEmployee(insertEmployee: InsertEmployee): Promise<Employee> {
    if (!this.initialized) await this.initialize();
    const id = randomUUID();
    const now = new Date();
    const employee: Employee = {
      ...insertEmployee,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(employees).values(employee).execute();
    return employee;
  }

  async updateEmployee(id: string, updates: Partial<InsertEmployee>): Promise<Employee | undefined> {
    if (!this.initialized) await this.initialize();
    await this.db.update(employees).set({ ...updates, updatedAt: new Date() }).where(eq(employees.id, id)).execute();
    return this.getEmployee(id);
  }

  async deleteEmployee(id: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();
    const result = await this.db.delete(employees).where(eq(employees.id, id)).execute();
    return result.changes > 0;
  }

  // Client methods
  async getClient(id: string): Promise<Client | undefined> {
    if (!this.initialized) await this.initialize();
    const client = (await this.db.select().from(clients).where(eq(clients.id, id)).execute())[0];
    return client || undefined;
  }

  async getClientsByMerchant(merchantId: string): Promise<Client[]> {
    if (!this.initialized) await this.initialize();
    return this.db.select().from(clients).where(eq(clients.merchantId, merchantId)).execute();
  }

  async createClient(insertClient: InsertClient): Promise<Client> {
    if (!this.initialized) await this.initialize();
    const id = randomUUID();
    const now = new Date();
    const client: Client = {
      ...insertClient,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(clients).values(client).execute();
    return client;
  }

  async updateClient(id: string, updates: Partial<InsertClient>): Promise<Client | undefined> {
    if (!this.initialized) await this.initialize();
    await this.db.update(clients).set({ ...updates, updatedAt: new Date() }).where(eq(clients.id, id)).execute();
    return this.getClient(id);
  }

  async deleteClient(id: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();
    const result = await this.db.delete(clients).where(eq(clients.id, id)).execute();
    return result.changes > 0;
  }

  // Appointment methods
  async getAppointment(id: string): Promise<Appointment | undefined> {
    if (!this.initialized) await this.initialize();
    const appointment = (await this.db.select().from(appointments).where(eq(appointments.id, id)).execute())[0];
    return appointment || undefined;
  }

  async getAppointmentsByMerchant(merchantId: string, startDate: Date, endDate: Date): Promise<Appointment[]> {
    if (!this.initialized) await this.initialize();
    return this.db.select().from(appointments)
      .where(and(
        eq(appointments.merchantId, merchantId),
        gte(appointments.startTime, startDate),
        lte(appointments.startTime, endDate)
      ))
      .execute();
  }

  async createAppointment(insertAppointment: InsertAppointment): Promise<Appointment> {
    if (!this.initialized) await this.initialize();
    const id = randomUUID();
    const now = new Date();
    const appointment: Appointment = {
      ...insertAppointment,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(appointments).values(appointment).execute();
    return appointment;
  }

  async updateAppointment(id: string, updates: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    if (!this.initialized) await this.initialize();
    await this.db.update(appointments).set({ ...updates, updatedAt: new Date() }).where(eq(appointments.id, id)).execute();
    return this.getAppointment(id);
  }

  async deleteAppointment(id: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();
    const result = await this.db.delete(appointments).where(eq(appointments.id, id)).execute();
    return result.changes > 0;
  }

  async getEmployeeAvailability(employeeId: string, date: Date): Promise<AvailabilityData> {
    // This method needs to be adapted for SQLite. 
    // The logic for calculating availability will be the same, but the query might need adjustments.
    return { availableSlots: [], bookedSlots: [] };
  }

  async getAppointmentStatusCounts(merchantId: string): Promise<AppointmentStatusData> {
    // This method needs to be adapted for SQLite.
    return { confirmed: 0, pending: 0, completed: 0, cancelled: 0, noShow: 0, late: 0 };
  }

  async processExpiredAccess(): Promise<number> {
    // Para SQLite, este método pode ser uma operação nula ou implementar lógica básica, se necessário.
    // Por enquanto, retorna 0, pois a lógica de expiração de acesso geralmente não é tratada no SQLite local.
    return 0;
  }

  // EmployeeDayOff methods
  async getEmployeeDayOff(id: string): Promise<EmployeeDayOff | undefined> {
    if (!this.initialized) await this.initialize();
    const dayOff = (await this.db.select().from(employeeDaysOff).where(eq(employeeDaysOff.id, id)).execute())[0];
    return dayOff || undefined;
  }

  async getEmployeeDaysOffByEmployee(employeeId: string): Promise<EmployeeDayOff[]> {
    if (!this.initialized) await this.initialize();
    return this.db.select().from(employeeDaysOff).where(eq(employeeDaysOff.employeeId, employeeId)).execute();
  }

  async createEmployeeDayOff(insertDayOff: InsertEmployeeDayOff): Promise<EmployeeDayOff> {
    if (!this.initialized) await this.initialize();
    const id = randomUUID();
    const now = new Date();
    const dayOff: EmployeeDayOff = {
      ...insertDayOff,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(employeeDaysOff).values(dayOff).execute();
    return dayOff;
  }

  async deleteEmployeeDayOff(id: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();
    const result = await this.db.delete(employeeDaysOff).where(eq(employeeDaysOff.id, id)).execute();
    return result.changes > 0;
  }

  // Promotion methods
  async getPromotion(id: string): Promise<Promotion | undefined> {
    if (!this.initialized) await this.initialize();
    const promotion = (await this.db.select().from(promotions).where(eq(promotions.id, id)).execute())[0];
    return promotion || undefined;
  }

  async getPromotionsByMerchant(merchantId: string): Promise<Promotion[]> {
    if (!this.initialized) await this.initialize();
    return this.db.select().from(promotions).where(eq(promotions.merchantId, merchantId)).execute();
  }

  async createPromotion(insertPromotion: InsertPromotion): Promise<Promotion> {
    if (!this.initialized) await this.initialize();
    const id = randomUUID();
    const now = new Date();
    const promotion: Promotion = {
      ...insertPromotion,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(promotions).values(promotion).execute();
    return promotion;
  }

  async updatePromotion(id: string, updates: Partial<InsertPromotion>): Promise<Promotion | undefined> {
    if (!this.initialized) await this.initialize();
    await this.db.update(promotions).set({ ...updates, updatedAt: new Date() }).where(eq(promotions.id, id)).execute();
    return this.getPromotion(id);
  }

  async deletePromotion(id: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();
    const result = await this.db.delete(promotions).where(eq(promotions.id, id)).execute();
    return result.changes > 0;
  }

  // SystemSetting methods
  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    if (!this.initialized) await this.initialize();
    const setting = (await this.db.select().from(systemSettings).where(eq(systemSettings.key, key)).execute())[0];
    return setting || undefined;
  }

  async createSystemSetting(setting: SystemSetting): Promise<SystemSetting> {
    if (!this.initialized) await this.initialize();
    await this.db.insert(systemSettings).values(setting).execute();
    return setting;
  }

  async updateSystemSetting(key: string, value: string): Promise<SystemSetting | undefined> {
    if (!this.initialized) await this.initialize();
    await this.db.update(systemSettings).set({ value }).where(eq(systemSettings.key, key)).execute();
    return this.getSystemSetting(key);
  }
}

