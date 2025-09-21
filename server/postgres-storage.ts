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


export class PostgreSQLStorage implements IStorage {
  private initialized = false;

  // Using db instance from ./db for all operations
  private db = db;


  constructor() {
    // Don't call initialize in constructor
  }

  async initialize(): Promise<void> {
    if (!this.initialized) {

      // Check if database exists and has tables
      const tables = await this.db.select({ tableName: sql<string>`tablename` })
        .from(sql`pg_catalog.pg_tables`)
        .where(sql`schemaname != 'pg_catalog' AND schemaname != 'information_schema'`)
        .execute();

      if (tables.length === 0) {
        console.log("Creating database tables...");
        // The tables are already created by the schema definitions,
        // drizzle-kit will handle migrations.
      }

      // Ensure all required columns exist
      // This is typically handled by migrations. If not using migrations, manual checks would be needed.

      // Update existing employees to work all days including Sunday
      // This comment suggests a past manual update or a future task.
      // No specific code change needed here based on the comment alone.


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
    return result.rowCount > 0;
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

  async getMerchantsAccessStatus(): Promise<{
    activeAccess: number;
    expiredAccess: number;
    paymentPending: number;
    trialUsers: number;
    vipUsers: number;
  }> {
    if (!this.initialized) await this.initialize();
    const allMerchants = await this.db.select().from(merchants).execute();
    const now = new Date();

    return {
      activeAccess: allMerchants.filter(m =>
        m.status === "active" &&
        (!m.accessEndDate || new Date(m.accessEndDate) > now)
      ).length,
      expiredAccess: allMerchants.filter(m =>
        m.accessEndDate && new Date(m.accessEndDate) <= now
      ).length,
      paymentPending: allMerchants.filter(m => m.status === "payment_pending").length,
      trialUsers: allMerchants.filter(m => m.paymentStatus === "trial").length,
      vipUsers: allMerchants.filter(m => m.paymentStatus === "paid" && m.planStatus === "vip").length,
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

    console.log(`\n=== PostgreSQLStorage.getServicesByMerchant DEBUG ===`);
    console.log(`🔍 Input merchantId: "${merchantId}" (type: ${typeof merchantId})`);

    const merchant = await this.getMerchant(merchantId);
    console.log(`🏪 Merchant info: ${merchant ? `"${merchant.name}" (${merchant.email})` : 'NOT FOUND'}`);

    const allServices = await this.db.select().from(services).execute();
    console.log(`\n📊 DATABASE STATE - Total services: ${allServices.length}`);
    allServices.forEach((service, index) => {
      const belongsToRequested = service.merchantId === merchantId;
      const merchantInfo = belongsToRequested ? "✅ MINE" : "❌ OTHER";
      console.log(`  [${index}] "${service.name}" (ID: ${service.id.substring(0, 8)}...) -> merchantId: "${service.merchantId.substring(0, 8)}..." ${merchantInfo}`);
    });

    console.log(`\n🔎 Executing query: SELECT * FROM services WHERE merchantId = "${merchantId}"`);
    const result = await this.db.select().from(services).where(eq(services.merchantId, merchantId)).execute();

    console.log(`\n📋 QUERY RESULT - Returned ${result.length} services:`);
    result.forEach((service, index) => {
      console.log(`  [${index}] "${service.name}" (ID: ${service.id.substring(0, 8)}...) merchantId: "${service.merchantId.substring(0, 8)}..."`);
    });

    const invalidServices = result.filter(service => service.merchantId !== merchantId);
    const validServices = result.filter(service => service.merchantId === merchantId);

    console.log(`\n🛡️  SECURITY CHECK:`);
    console.log(`✅ Valid services (belong to ${merchantId.substring(0, 8)}...): ${validServices.length}`);
    console.log(`❌ Invalid services (belong to other merchants): ${invalidServices.length}`);

    if (invalidServices.length > 0) {
      console.error(`\n🚨🚨🚨 CRITICAL SECURITY BREACH DETECTED! 🚨🚨🚨`);
      console.error(`❌ Found ${invalidServices.length} services that don't belong to merchant ${merchantId}:`);
      invalidServices.forEach(service => {
        console.error(`  - LEAKED: "${service.name}" (ID: ${service.id}) belongs to merchant: "${service.merchantId}"`);
      });
      console.error(`🚨 RETURNING ONLY VALID SERVICES AS EMERGENCY SECURITY MEASURE 🚨`);
      console.log(`=== END PostgreSQLStorage DEBUG (SECURITY BREACH PREVENTED) ===\n`);
      return validServices;
    }

    console.log(`\n✅ SECURITY VERIFICATION PASSED`);
    console.log(`🎯 All ${result.length} services verified to belong to merchant ${merchantId.substring(0, 8)}...`);
    console.log(`=== END PostgreSQLStorage DEBUG (SUCCESS) ===\n`);
    return result;
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
    return result.rowCount > 0;
  }

  async updateServiceMerchant(serviceId: string, newMerchantId: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();

    console.log(`🔧 Updating service ${serviceId.substring(0, 8)}... to merchant ${newMerchantId.substring(0, 8)}...`);

    const result = await this.db.update(services)
      .set({
        merchantId: newMerchantId,
        updatedAt: new Date()
      })
      .where(eq(services.id, serviceId))
      .execute();

    console.log(`✅ Update result: ${result.rowCount} rows affected`);
    return result.rowCount > 0;
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

    console.log(`\n=== PostgreSQLStorage.getEmployeesByMerchant DEBUG ===`);
    console.log(`🔍 Input merchantId: "${merchantId}" (type: ${typeof merchantId})`);

    const merchant = await this.getMerchant(merchantId);
    console.log(`🏪 Merchant info: ${merchant ? `"${merchant.name}" (${merchant.email})` : 'NOT FOUND'}`);

    const allEmployees = await this.db.select().from(employees).execute();
    console.log(`\n📊 DATABASE STATE - Total employees: ${allEmployees.length}`);
    allEmployees.forEach((employee, index) => {
      const belongsToRequested = employee.merchantId === merchantId;
      const status = belongsToRequested ? "✅ MINE" : "❌ OTHER";
      console.log(`  [${index}] "${employee.name}" (ID: ${employee.id.substring(0, 8)}...) -> merchantId: "${employee.merchantId.substring(0, 8)}..." ${status}`);
    });

    console.log(`\n🔎 Executing query: SELECT * FROM employees WHERE merchantId = "${merchantId}"`);
    const result = await this.db.select().from(employees).where(eq(employees.merchantId, merchantId)).execute();

    console.log(`\n📋 QUERY RESULT - Returned ${result.length} employees:`);
    result.forEach((employee, index) => {
      console.log(`  [${index}] "${employee.name}" (ID: ${employee.id.substring(0, 8)}...) merchantId: "${employee.merchantId.substring(0, 8)}..."`);
    });

    const invalidEmployees = result.filter(employee => employee.merchantId !== merchantId);
    const validEmployees = result.filter(employee => employee.merchantId === merchantId);

    console.log(`\n🛡️  SECURITY CHECK:`);
    console.log(`✅ Valid employees (belong to ${merchantId.substring(0, 8)}...): ${validEmployees.length}`);
    console.log(`❌ Invalid employees (belong to other merchants): ${invalidEmployees.length}`);

    if (invalidEmployees.length > 0) {
      console.error(`\n🚨🚨🚨 CRITICAL SECURITY BREACH DETECTED! 🚨🚨🚨`);
      console.error(`❌ Found ${invalidEmployees.length} employees that don't belong to merchant ${merchantId}:`);
      invalidEmployees.forEach(employee => {
        console.error(`  - LEAKED: "${employee.name}" (ID: ${employee.id}) belongs to merchant: "${employee.merchantId}"`);
      });
      console.error(`🚨 RETURNING ONLY VALID EMPLOYEES AS EMERGENCY SECURITY MEASURE 🚨`);
      console.log(`=== END PostgreSQLStorage DEBUG (SECURITY BREACH PREVENTED) ===\n`);
      return validEmployees;
    }

    console.log(`\n✅ SECURITY VERIFICATION PASSED`);
    console.log(`🎯 All ${result.length} employees verified to belong to merchant ${merchantId.substring(0, 8)}...`);
    console.log(`=== END PostgreSQLStorage DEBUG (SUCCESS) ===\n`);
    return result;
  }

  async getActiveEmployeesByMerchant(merchantId: string): Promise<Employee[]> {
    if (!this.initialized) await this.initialize();
    return this.db.select().from(employees)
      .where(and(
        eq(employees.merchantId, merchantId),
        eq(employees.isActive, true)
      ))
      .execute();
  }

  async createEmployee(insertEmployee: InsertEmployee): Promise<Employee> {
    if (!this.initialized) await this.initialize();
    const hashedPassword = await bcrypt.hash(insertEmployee.password, 10);
    const id = randomUUID();
    const now = new Date();
    const employee: Employee = {
      ...insertEmployee,
      id,
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
      isActive: insertEmployee.isActive ?? true,
      workDays: insertEmployee.workDays || "[0,1,2,3,4,5,6]", // Default to all days
      startTime: insertEmployee.startTime || "09:00", // Default start time
      endTime: insertEmployee.endTime || "18:00", // Default end time
      breakStartTime: insertEmployee.breakStartTime || "12:00",
      breakEndTime: insertEmployee.breakEndTime || "13:00",
    };

    await this.db.insert(employees).values(employee).execute();
    return employee;
  }

  async updateEmployee(id: string, updates: Partial<InsertEmployee>): Promise<Employee | undefined> {
    if (!this.initialized) await this.initialize();
    const existingEmployee = await this.getEmployee(id);
    if (!existingEmployee) return undefined;

    const processedUpdates = { ...updates };
    if (processedUpdates.password) {
      processedUpdates.password = await bcrypt.hash(processedUpdates.password, 10);
    }

    const updatedEmployee: Employee = {
      ...existingEmployee,
      ...processedUpdates,
      updatedAt: new Date(),
    };

    await this.db.update(employees).set(updatedEmployee).where(eq(employees.id, id)).execute();
    return updatedEmployee;
  }

  async updateEmployeePassword(id: string, newPassword: string): Promise<boolean> {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await this.db.update(employees).set({ password: hashedPassword, updatedAt: new Date() }).where(eq(employees.id, id)).execute();
      return true;
    } catch (error) {
      console.error("Error updating employee password:", error);
      return false;
    }
  }

  async deleteEmployee(id: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();
    const result = await this.db.delete(employees).where(eq(employees.id, id)).execute();
    return result.rowCount > 0;
  }

  // Client methods
  async getClient(id: string): Promise<Client | undefined> {
    if (!this.initialized) await this.initialize();
    const client = (await this.db.select().from(clients).where(eq(clients.id, id)).execute())[0];
    return client || undefined;
  }

  async getClientByEmail(email: string): Promise<Client | undefined> {
    if (!this.initialized) await this.initialize();
    const client = (await this.db.select().from(clients).where(eq(clients.email, email)).execute())[0];
    return client || undefined;
  }

  async getClientsByMerchant(merchantId: string): Promise<Client[]> {
    if (!this.initialized) await this.initialize();
    return this.db.select().from(clients).where(eq(clients.merchantId, merchantId)).execute();
  }

  async createClient(insertClient: InsertClient): Promise<Client> {
    if (!this.initialized) await this.initialize();
    const hashedPassword = await bcrypt.hash(insertClient.password, 10);
    const id = randomUUID();
    const now = new Date();
    const client: Client = {
      ...insertClient,
      id,
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(clients).values(client).execute();
    return client;
  }

  async updateClient(id: string, updates: Partial<InsertClient>): Promise<Client | undefined> {
    if (!this.initialized) await this.initialize();
    const existingClient = await this.getClient(id);
    if (!existingClient) return undefined;

    const processedUpdates = { ...updates };
    if (processedUpdates.password) {
      processedUpdates.password = await bcrypt.hash(processedUpdates.password, 10);
    }

    const updatedClient: Client = {
      ...existingClient,
      ...processedUpdates,
      updatedAt: new Date(),
    };

    await this.db.update(clients).set(updatedClient).where(eq(clients.id, id)).execute();
    return updatedClient;
  }

  async updateClientPassword(id: string, newPassword: string): Promise<boolean> {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await this.db.update(clients).set({ password: hashedPassword, updatedAt: new Date() }).where(eq(clients.id, id)).execute();
      return true;
    } catch (error) {
      console.error("Error updating client password:", error);
      return false;
    }
  }

  async deleteClient(id: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();
    const result = await this.db.delete(clients).where(eq(clients.id, id)).execute();
    return result.rowCount > 0;
  }

  // Appointment methods
  async getAppointment(id: string): Promise<Appointment | undefined> {
    if (!this.initialized) await this.initialize();
    const appointment = (await this.db.select().from(appointments).where(eq(appointments.id, id)).execute())[0];
    return appointment || undefined;
  }

  async getAppointmentsByMerchant(merchantId: string): Promise<Appointment[]> {
    if (!this.initialized) await this.initialize();
    return this.db.select().from(appointments).where(eq(appointments.merchantId, merchantId)).execute();
  }

  async getAppointmentsByEmployee(employeeId: string): Promise<Appointment[]> {
    if (!this.initialized) await this.initialize();
    return this.db.select().from(appointments).where(eq(appointments.employeeId, employeeId)).execute();
  }

  async getAppointmentsByClient(clientId: string): Promise<Appointment[]> {
    if (!this.initialized) await this.initialize();
    return this.db.select().from(appointments).where(eq(appointments.clientId, clientId)).execute();
  }

  async getAppointmentsByDateRange(merchantId: string, startDate: Date, endDate: Date): Promise<Appointment[]> {
    if (!this.initialized) await this.initialize();
    return this.db.select().from(appointments)
      .where(and(
        eq(appointments.merchantId, merchantId),
        gte(appointments.date, startDate.toISOString()),
        lte(appointments.date, endDate.toISOString())
      ))
      .execute();
  }

  async getUpcomingAppointments(merchantId: string): Promise<Appointment[]> {
    if (!this.initialized) await this.initialize();
    const now = new Date();
    return this.db.select().from(appointments)
      .where(and(
        eq(appointments.merchantId, merchantId),
        gte(appointments.date, now.toISOString())
      ))
      .orderBy(asc(appointments.date))
      .execute();
  }

  async getPendingPaymentAppointments(merchantId: string): Promise<Appointment[]> {
    if (!this.initialized) await this.initialize();
    return this.db.select().from(appointments)
      .where(and(
        eq(appointments.merchantId, merchantId),
        eq(appointments.status, "pending_payment")
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
      status: insertAppointment.status || "pending",
      paymentStatus: insertAppointment.paymentStatus || "pending",
      notes: insertAppointment.notes || null,
      cancellationReason: insertAppointment.cancellationReason || null,
      rescheduleCount: insertAppointment.rescheduleCount || 0,
      noShow: insertAppointment.noShow ?? false,
      late: insertAppointment.late ?? false,
    };

    await this.db.insert(appointments).values(appointment).execute();
    return appointment;
  }

  async updateAppointment(id: string, updates: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    if (!this.initialized) await this.initialize();
    const existingAppointment = await this.getAppointment(id);
    if (!existingAppointment) return undefined;

    const updatedAppointment: Appointment = {
      ...existingAppointment,
      ...updates,
      updatedAt: new Date(),
    };

    await this.db.update(appointments).set(updatedAppointment).where(eq(appointments.id, id)).execute();
    return updatedAppointment;
  }

  async deleteAppointment(id: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();
    const result = await this.db.delete(appointments).where(eq(appointments.id, id)).execute();
    return result.rowCount > 0;
  }

  async getEmployeeAvailability(employeeId: string, date: string): Promise<AvailabilityData[]> {
    if (!this.initialized) await this.initialize();
    // Implement logic to get employee availability based on their work schedule and existing appointments
    // This is a complex query that would involve joining employees, appointments, and potentially employee_days_off
    // For simplicity, returning a placeholder for now.
    console.warn("getEmployeeAvailability not fully implemented in PostgreSQLStorage");
    return [];
  }

  async getMerchantSchedule(merchantId: string, date: string): Promise<Appointment[]> {
    if (!this.initialized) await this.initialize();
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.db.select().from(appointments)
      .where(and(
        eq(appointments.merchantId, merchantId),
        gte(appointments.date, startOfDay.toISOString()),
        lte(appointments.date, endOfDay.toISOString())
      ))
      .orderBy(asc(appointments.date))
      .execute();
  }

  async getEmployeeSchedule(employeeId: string, date: string): Promise<Appointment[]> {
    if (!this.initialized) await this.initialize();
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.db.select().from(appointments)
      .where(and(
        eq(appointments.employeeId, employeeId),
        gte(appointments.date, startOfDay.toISOString()),
        lte(appointments.date, endOfDay.toISOString())
      ))
      .orderBy(asc(appointments.date))
      .execute();
  }

  async getAppointmentStatusCounts(merchantId: string): Promise<AppointmentStatusData> {
    if (!this.initialized) await this.initialize();
    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');

    const total = await this.db.select({ count: count() }).from(appointments).where(eq(appointments.merchantId, merchantId)).execute();
    const confirmed = await this.db.select({ count: count() }).from(appointments).where(and(eq(appointments.merchantId, merchantId), eq(appointments.status, 'confirmed'))).execute();
    const pending = await this.db.select({ count: count() }).from(appointments).where(and(eq(appointments.merchantId, merchantId), eq(appointments.status, 'pending'))).execute();
    const cancelled = await this.db.select({ count: count() }).from(appointments).where(and(eq(appointments.merchantId, merchantId), eq(appointments.status, 'cancelled'))).execute();
    const completed = await this.db.select({ count: count() }).from(appointments).where(and(eq(appointments.merchantId, merchantId), eq(appointments.status, 'completed'))).execute();
    const noShow = await this.db.select({ count: count() }).from(appointments).where(and(eq(appointments.merchantId, merchantId), eq(appointments.noShow, true))).execute();
    const late = await this.db.select({ count: count() }).from(appointments).where(and(eq(appointments.merchantId, merchantId), eq(appointments.late, true))).execute();
    const todayAppointments = await this.db.select({ count: count() }).from(appointments).where(and(eq(appointments.merchantId, merchantId), sql`DATE(${appointments.date}) = ${today}`)).execute();

    return {
      total: total[0].count,
      confirmed: confirmed[0].count,
      pending: pending[0].count,
      cancelled: cancelled[0].count,
      completed: completed[0].count,
      noShow: noShow[0].count,
      late: late[0].count,
      today: todayAppointments[0].count,
    };
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

  async createEmployeeDayOff(insertEmployeeDayOff: InsertEmployeeDayOff): Promise<EmployeeDayOff> {
    if (!this.initialized) await this.initialize();
    const id = randomUUID();
    const now = new Date();
    const dayOff: EmployeeDayOff = {
      ...insertEmployeeDayOff,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(employeeDaysOff).values(dayOff).execute();
    return dayOff;
  }

  async updateEmployeeDayOff(id: string, updates: Partial<InsertEmployeeDayOff>): Promise<EmployeeDayOff | undefined> {
    if (!this.initialized) await this.initialize();
    const existingDayOff = await this.getEmployeeDayOff(id);
    if (!existingDayOff) return undefined;

    const updatedDayOff: EmployeeDayOff = {
      ...existingDayOff,
      ...updates,
      updatedAt: new Date(),
    };

    await this.db.update(employeeDaysOff).set(updatedDayOff).where(eq(employeeDaysOff.id, id)).execute();
    return updatedDayOff;
  }

  async deleteEmployeeDayOff(id: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();
    const result = await this.db.delete(employeeDaysOff).where(eq(employeeDaysOff.id, id)).execute();
    return result.rowCount > 0;
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
      isActive: insertPromotion.isActive ?? true,
      usageLimit: insertPromotion.usageLimit ?? null,
      usedCount: insertPromotion.usedCount ?? 0,
    };

    await this.db.insert(promotions).values(promotion).execute();
    return promotion;
  }

  async updatePromotion(id: string, updates: Partial<InsertPromotion>): Promise<Promotion | undefined> {
    if (!this.initialized) await this.initialize();
    const existingPromotion = await this.getPromotion(id);
    if (!existingPromotion) return undefined;

    const updatedPromotion: Promotion = {
      ...existingPromotion,
      ...updates,
      updatedAt: new Date(),
    };

    await this.db.update(promotions).set(updatedPromotion).where(eq(promotions.id, id)).execute();
    return updatedPromotion;
  }

  async deletePromotion(id: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();
    const result = await this.db.delete(promotions).where(eq(promotions.id, id)).execute();
    return result.rowCount > 0;
  }

  // System Settings methods
  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    if (!this.initialized) await this.initialize();
    const setting = (await this.db.select().from(systemSettings).where(eq(systemSettings.key, key)).execute())[0];
    return setting || undefined;
  }

  async updateSystemSetting(key: string, value: string): Promise<SystemSetting | undefined> {
    if (!this.initialized) await this.initialize();
    const existingSetting = await this.getSystemSetting(key);
    if (!existingSetting) return undefined;

    const updatedSetting: SystemSetting = {
      ...existingSetting,
      value,
      updatedAt: new Date(),
    };

    await this.db.update(systemSettings).set(updatedSetting).where(eq(systemSettings.key, key)).execute();
    return updatedSetting;
  }

  async getAllSystemSettings(): Promise<SystemSetting[]> {
    if (!this.initialized) await this.initialize();
    return this.db.select().from(systemSettings).execute();
  }

  async processExpiredAccess(): Promise<number> {
    if (!this.initialized) await this.initialize();
    const now = new Date();
    const expiredMerchants = await this.db.select().from(merchants)
      .where(and(
        eq(merchants.status, "active"),
        lte(merchants.accessEndDate, now.toISOString())
      ))
      .execute();

    for (const merchant of expiredMerchants) {
      await this.db.update(merchants)
        .set({ status: "payment_pending", updatedAt: new Date() })
        .where(eq(merchants.id, merchant.id))
        .execute();
      console.log(`Merchant ${merchant.id} (${merchant.email}) access expired and status updated to payment_pending.`);
    }
    return expiredMerchants.length;
  }

  async getMerchantPolicies(merchantId: string): Promise<any> {
    if (!this.initialized) await this.initialize();
    const merchant = await this.getMerchant(merchantId);
    if (!merchant) return undefined;

    return {
      noShowFeeEnabled: merchant.noShowFeeEnabled,
      noShowFeeAmount: merchant.noShowFeeAmount,
      lateFeeEnabled: merchant.lateFeeEnabled,
      lateFeeAmount: merchant.lateFeeAmount,
      lateToleranceMinutes: merchant.lateToleranceMinutes,
      cancellationPolicyHours: merchant.cancellationPolicyHours,
      cancellationFeeEnabled: merchant.cancellationFeeEnabled,
      cancellationFeeAmount: merchant.cancellationFeeAmount,
    };
  }

  async updateMerchantPolicies(merchantId: string, updates: any): Promise<any> {
    if (!this.initialized) await this.initialize();
    const existingMerchant = await this.getMerchant(merchantId);
    if (!existingMerchant) return undefined;

    const updatedMerchant = {
      ...existingMerchant,
      ...updates,
      updatedAt: new Date(),
    };

    await this.db.update(merchants).set(updatedMerchant).where(eq(merchants.id, merchantId)).execute();
    return this.getMerchantPolicies(merchantId);
  }

  async getMerchantWorkSchedule(merchantId: string): Promise<any> {
    if (!this.initialized) await this.initialize();
    const merchant = await this.getMerchant(merchantId);
    if (!merchant) return undefined;

    return {
      workDays: JSON.parse(merchant.workDays as string),
      startTime: merchant.startTime,
      endTime: merchant.endTime,
      breakStartTime: merchant.breakStartTime,
      breakEndTime: merchant.breakEndTime,
    };
  }

  async updateMerchantWorkSchedule(merchantId: string, updates: any): Promise<any> {
    if (!this.initialized) await this.initialize();
    const existingMerchant = await this.getMerchant(merchantId);
    if (!existingMerchant) return undefined;

    const updatedMerchant = {
      ...existingMerchant,
      workDays: JSON.stringify(updates.workDays),
      startTime: updates.startTime,
      endTime: updates.endTime,
      breakStartTime: updates.breakStartTime,
      breakEndTime: updates.breakEndTime,
      updatedAt: new Date(),
    };

    await this.db.update(merchants).set(updatedMerchant).where(eq(merchants.id, merchantId)).execute();
    return this.getMerchantWorkSchedule(merchantId);
  }

  async getEmployeeWorkSchedule(employeeId: string): Promise<any> {
    if (!this.initialized) await this.initialize();
    const employee = await this.getEmployee(employeeId);
    if (!employee) return undefined;

    return {
      workDays: JSON.parse(employee.workDays as string),
      startTime: employee.startTime,
      endTime: employee.endTime,
      breakStartTime: employee.breakStartTime,
      breakEndTime: employee.breakEndTime,
    };
  }

  async updateEmployeeWorkSchedule(employeeId: string, updates: any): Promise<any> {
    if (!this.initialized) await this.initialize();
    const existingEmployee = await this.getEmployee(employeeId);
    if (!existingEmployee) return undefined;

    const updatedEmployee = {
      ...existingEmployee,
      workDays: JSON.stringify(updates.workDays),
      startTime: updates.startTime,
      endTime: updates.endTime,
      breakStartTime: updates.breakStartTime,
      breakEndTime: updates.breakEndTime,
      updatedAt: new Date(),
    };

    await this.db.update(employees).set(updatedEmployee).where(eq(employees.id, employeeId)).execute();
    return this.getEmployeeWorkSchedule(employeeId);
  }

  async getDashboardStats(merchantId: string): Promise<any> {
    if (!this.initialized) await this.initialize();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const totalAppointments = await this.db.select({ count: count() }).from(appointments).where(eq(appointments.merchantId, merchantId)).execute();
    const completedAppointments = await this.db.select({ count: count() }).from(appointments).where(and(eq(appointments.merchantId, merchantId), eq(appointments.status, 'completed'))).execute();
    const cancelledAppointments = await this.db.select({ count: count() }).from(appointments).where(and(eq(appointments.merchantId, merchantId), eq(appointments.status, 'cancelled'))).execute();
    const pendingAppointments = await this.db.select({ count: count() }).from(appointments).where(and(eq(appointments.merchantId, merchantId), eq(appointments.status, 'pending'))).execute();

    const totalClients = await this.db.select({ count: count() }).from(clients).where(eq(clients.merchantId, merchantId)).execute();
    const totalEmployees = await this.db.select({ count: count() }).from(employees).where(eq(employees.merchantId, merchantId)).execute();
    const totalServices = await this.db.select({ count: count() }).from(services).where(eq(services.merchantId, merchantId)).execute();

    const monthlyAppointments = await this.db.select({ count: count() }).from(appointments)
      .where(and(
        eq(appointments.merchantId, merchantId),
        gte(appointments.date, startOfMonth.toISOString()),
        lte(appointments.date, endOfMonth.toISOString())
      ))
      .execute();

    const monthlyRevenueResult = await this.db.select({ total: sql<number>`sum(CASE WHEN ${appointments.status} = 'completed' THEN ${appointments.price} ELSE 0 END)` })
      .from(appointments)
      .where(and(
        eq(appointments.merchantId, merchantId),
        gte(appointments.date, startOfMonth.toISOString()),
        lte(appointments.date, endOfMonth.toISOString())
      ))
      .execute();

    const monthlyRevenue = monthlyRevenueResult[0].total || 0;

    // Top 5 services by appointments
    const topServices = await this.db.select({
      serviceId: appointments.serviceId,
      count: sql<number>`count(*)`,
    })
      .from(appointments)
      .where(eq(appointments.merchantId, merchantId))
      .groupBy(appointments.serviceId)
      .orderBy(desc(sql`count`))
      .limit(5)
      .execute();

    const topServicesWithNames = await Promise.all(topServices.map(async (ts) => {
      const service = await this.getService(ts.serviceId);
      return { name: service?.name || 'Unknown', count: ts.count };
    }));

    // Top 5 employees by appointments
    const topEmployees = await this.db.select({
      employeeId: appointments.employeeId,
      count: sql<number>`count(*)`,
    })
      .from(appointments)
      .where(eq(appointments.merchantId, merchantId))
      .groupBy(appointments.employeeId)
      .orderBy(desc(sql`count`))
      .limit(5)
      .execute();

    const topEmployeesWithNames = await Promise.all(topEmployees.map(async (te) => {
      const employee = await this.getEmployee(te.employeeId);
      return { name: employee?.name || 'Unknown', count: te.count };
    }));

    // Recent appointments (last 5)
    const recentAppointments = await this.db.select()
      .from(appointments)
      .where(eq(appointments.merchantId, merchantId))
      .orderBy(desc(appointments.createdAt))
      .limit(5)
      .execute();

    const recentAppointmentsWithDetails = await Promise.all(recentAppointments.map(async (app) => {
      const client = await this.getClient(app.clientId);
      const employee = await this.getEmployee(app.employeeId);
      const service = await this.getService(app.serviceId);
      return {
        ...app,
        clientName: client?.name || 'N/A',
        employeeName: employee?.name || 'N/A',
        serviceName: service?.name || 'N/A',
      };
    }));

    return {
      totalAppointments: totalAppointments[0].count,
      completedAppointments: completedAppointments[0].count,
      cancelledAppointments: cancelledAppointments[0].count,
      pendingAppointments: pendingAppointments[0].count,
      totalClients: totalClients[0].count,
      totalEmployees: totalEmployees[0].count,
      totalServices: totalServices[0].count,
      monthlyAppointments: monthlyAppointments[0].count,
      monthlyRevenue: monthlyRevenue,
      topServices: topServicesWithNames,
      topEmployees: topEmployeesWithNames,
      recentAppointments: recentAppointmentsWithDetails,
    };
  }

  async getReports(merchantId: string, startDate: Date, endDate: Date): Promise<any> {
    if (!this.initialized) await this.initialize();

    const appointmentsInPeriod = await this.db.select()
      .from(appointments)
      .where(and(
        eq(appointments.merchantId, merchantId),
        gte(appointments.date, startDate.toISOString()),
        lte(appointments.date, endDate.toISOString())
      ))
      .execute();

    const totalRevenue = appointmentsInPeriod.reduce((sum, app) => sum + (app.status === 'completed' ? app.price : 0), 0);
    const totalAppointments = appointmentsInPeriod.length;
    const completedAppointments = appointmentsInPeriod.filter(app => app.status === 'completed').length;
    const cancelledAppointments = appointmentsInPeriod.filter(app => app.status === 'cancelled').length;
    const noShowAppointments = appointmentsInPeriod.filter(app => app.noShow).length;

    const serviceRevenue: { [key: string]: number } = {};
    const serviceCounts: { [key: string]: number } = {};
    for (const app of appointmentsInPeriod) {
      if (app.status === 'completed') {
        serviceRevenue[app.serviceId] = (serviceRevenue[app.serviceId] || 0) + app.price;
      }
      serviceCounts[app.serviceId] = (serviceCounts[app.serviceId] || 0) + 1;
    }

    const serviceReports = await Promise.all(Object.keys(serviceRevenue).map(async (serviceId) => {
      const service = await this.getService(serviceId);
      return {
        name: service?.name || 'Unknown',
        revenue: serviceRevenue[serviceId],
        count: serviceCounts[serviceId] || 0,
      };
    }));

    const employeeAppointments: { [key: string]: number } = {};
    const employeeRevenue: { [key: string]: number } = {};
    for (const app of appointmentsInPeriod) {
      employeeAppointments[app.employeeId] = (employeeAppointments[app.employeeId] || 0) + 1;
      if (app.status === 'completed') {
        employeeRevenue[app.employeeId] = (employeeRevenue[app.employeeId] || 0) + app.price;
      }
    }

    const employeeReports = await Promise.all(Object.keys(employeeAppointments).map(async (employeeId) => {
      const employee = await this.getEmployee(employeeId);
      return {
        name: employee?.name || 'Unknown',
        appointments: employeeAppointments[employeeId],
        revenue: employeeRevenue[employeeId] || 0,
      };
    }));

    return {
      totalRevenue,
      totalAppointments,
      completedAppointments,
      cancelledAppointments,
      noShowAppointments,
      serviceReports,
      employeeReports,
    };
  }

  async getChartData(merchantId: string, period: 'week' | 'month' | 'year'): Promise<any> {
    if (!this.initialized) await this.initialize();
    const now = new Date();
    let startDate: Date;
    let labels: string[] = [];

    if (period === 'week') {
      startDate = subDays(now, 6);
      for (let i = 0; i < 7; i++) {
        labels.push(format(subDays(now, 6 - i), 'EEE'));
      }
    } else if (period === 'month') {
      startDate = subDays(now, 29);
      for (let i = 0; i < 30; i++) {
        labels.push(format(subDays(now, 29 - i), 'dd/MM'));
      }
    } else {
      // year
      startDate = new Date(now.getFullYear(), 0, 1);
      for (let i = 0; i < 12; i++) {
        labels.push(format(new Date(now.getFullYear(), i, 1), 'MMM'));
      }
    }

    const appointmentsData = await this.db.select()
      .from(appointments)
      .where(and(
        eq(appointments.merchantId, merchantId),
        gte(appointments.date, startDate.toISOString())
      ))
      .execute();

    const revenueData: number[] = new Array(labels.length).fill(0);
    const appointmentCounts: number[] = new Array(labels.length).fill(0);

    appointmentsData.forEach(app => {
      const appDate = new Date(app.date);
      let index = -1;

      if (period === 'week') {
        index = Math.floor((appDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      } else if (period === 'month') {
        index = Math.floor((appDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      } else {
        // year
        index = appDate.getMonth();
      }

      if (index >= 0 && index < labels.length) {
        appointmentCounts[index]++;
        if (app.status === 'completed') {
          revenueData[index] += app.price;
        }
      }
    });

    return {
      labels,
      revenueData: revenueData.map(r => r / 100), // Convert cents to real
      appointmentCounts,
    };
  }

  async getPenaltiesByMerchant(merchantId: string): Promise<any[]> {
    if (!this.initialized) await this.initialize();
    // Assuming there's a 'penalties' table or similar in your schema
    // For now, returning an empty array or a mock if no such table exists
    console.warn("getPenaltiesByMerchant not fully implemented. Returning mock data.");
    return [];
  }

  async getMerchantDashboardStats(merchantId: string): Promise<any> {
    if (!this.initialized) await this.initialize();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const today = now.toISOString().split('T')[0];

    const merchantAppointments = await this.db.select().from(appointments).where(eq(appointments.merchantId, merchantId)).execute();
    const merchantServices = await this.db.select().from(services).where(eq(services.merchantId, merchantId)).execute();
    const merchantEmployees = await this.db.select().from(employees).where(eq(employees.merchantId, merchantId)).execute();
    const merchantClients = await this.db.select().from(clients).where(eq(clients.merchantId, merchantId)).execute();

    const todaysAppointments = merchantAppointments.filter(a => a.appointmentDate === today);
    const thisMonthAppointments = merchantAppointments.filter(a => new Date(a.createdAt!) >= startOfMonth);
    const completedAppointments = merchantAppointments.filter(a => a.status === 'completed');

    return {
      totalAppointments: merchantAppointments.length,
      completedAppointments: completedAppointments.length,
      pendingAppointments: merchantAppointments.filter(a => a.status === 'pending').length,
      todaysAppointments: todaysAppointments.length,
      thisMonthAppointments: thisMonthAppointments.length,
      totalRevenue: completedAppointments.reduce((sum, a) => sum + (a.price || 0), 0),
      totalServices: merchantServices.length,
      activeServices: merchantServices.filter(s => s.isActive).length,
      totalEmployees: merchantEmployees.length,
      activeEmployees: merchantEmployees.filter(e => e.isActive).length,
      totalClients: merchantClients.length,
    };
  }

  async grantMerchantAccess(merchantId: string, durationDays: number, monthlyFee?: number): Promise<Merchant | null> {
    try {
      console.log(`\n=== GRANTING MERCHANT ACCESS ===`);
      console.log(`Merchant ID: ${merchantId}, Duration: ${durationDays} days, Fee: ${monthlyFee}`);

      const now = new Date();
      const accessEndDate = new Date(now);
      accessEndDate.setDate(now.getDate() + durationDays);

      const nextPaymentDue = new Date(accessEndDate);
      nextPaymentDue.setDate(nextPaymentDue.getDate() + durationDays);

      console.log(`Access dates:`, {
        startDate: now.toISOString(),
        endDate: accessEndDate.toISOString(),
        nextPaymentDue: nextPaymentDue.toISOString()
      });

      const updates: any = {
        status: "active",
        accessStartDate: now,
        accessEndDate: accessEndDate,
        accessDurationDays: durationDays,
        lastPaymentDate: now,
        nextPaymentDue: nextPaymentDue,
        paymentStatus: "paid",
        updatedAt: now,
      };

      if (monthlyFee !== undefined) {
        updates.monthlyFee = monthlyFee;
      }

      const updatedMerchant = await this.db
        .update(merchants)
        .set(updates)
        .where(eq(merchants.id, merchantId))
        .returning()
        .then(rows => rows[0]);

      if (!updatedMerchant) {
        console.error(`Failed to grant access to merchant ${merchantId}`);
        return null;
      }

      console.log(`Access granted successfully:`, {
        id: updatedMerchant.id,
        name: updatedMerchant.name,
        status: updatedMerchant.status,
        accessEndDate: updatedMerchant.accessEndDate,
        paymentStatus: updatedMerchant.paymentStatus
      });
      console.log(`=== END GRANT ACCESS ===\n`);

      return updatedMerchant;
    } catch (error) {
      console.error("Error granting merchant access:", error);
      throw error;
    }
  }

  async suspendMerchantAccess(merchantId: string): Promise<Merchant | undefined> {
    if (!this.initialized) await this.initialize();
    const updates = {
      status: "payment_pending" as const,
      updatedAt: new Date(),
    };

    await this.db.update(merchants).set(updates).where(eq(merchants.id, merchantId)).execute();
    return this.getMerchant(merchantId);
  }

  async renewMerchantAccess(merchantId: string): Promise<Merchant | null> {
    try {
      console.log(`\n=== RENEWING MERCHANT ACCESS IN STORAGE ===`);
      console.log(`Merchant ID: ${merchantId}`);

      const merchant = await this.db
        .select()
        .from(merchants)
        .where(eq(merchants.id, merchantId))
        .then(rows => rows[0]);

      if (!merchant) {
        console.error(`Merchant ${merchantId} not found in database`);
        return null;
      }

      console.log(`Current merchant state:`, {
        name: merchant.name,
        status: merchant.status,
        accessEndDate: merchant.accessEndDate,
        paymentStatus: merchant.paymentStatus,
        accessDurationDays: merchant.accessDurationDays
      });

      const now = new Date();
      const currentEndDate = merchant.accessEndDate ? new Date(merchant.accessEndDate) : now;

      // Always extend from the current end date if valid, otherwise from now
      const baseDate = currentEndDate > now ? currentEndDate : now;
      const durationDays = merchant.accessDurationDays || 30;

      const newEndDate = new Date(baseDate);
      newEndDate.setDate(newEndDate.getDate() + durationDays);

      const newPaymentDue = new Date(newEndDate);
      newPaymentDue.setDate(newPaymentDue.getDate() + durationDays);

      console.log(`Renewal calculation:`, {
        currentEndDate: currentEndDate.toISOString(),
        baseDate: baseDate.toISOString(),
        durationDays,
        newEndDate: newEndDate.toISOString(),
        newPaymentDue: newPaymentDue.toISOString()
      });

      const updatedMerchant = await this.db
        .update(merchants)
        .set({
          status: "active",
          accessStartDate: merchant.accessStartDate || now, // Keep existing start date or set to now
          accessEndDate: newEndDate,
          lastPaymentDate: now,
          nextPaymentDue: newPaymentDue,
          paymentStatus: "paid",
          updatedAt: now,
        })
        .where(eq(merchants.id, merchantId))
        .returning()
        .then(rows => rows[0]);

      if (!updatedMerchant) {
        console.error(`Failed to update merchant ${merchantId}`);
        return null;
      }

      console.log(`Merchant renewal completed:`, {
        id: updatedMerchant.id,
        name: updatedMerchant.name,
        status: updatedMerchant.status,
        accessEndDate: updatedMerchant.accessEndDate,
        paymentStatus: updatedMerchant.paymentStatus
      });
      console.log(`=== END MERCHANT RENEWAL ===\n`);

      return updatedMerchant;
    } catch (error) {
      console.error("Error renewing merchant access:", error);
      throw error;
    }
  }

  async updateMerchantAccessSettings(merchantId: string, settings: any): Promise<Merchant | null> {
    try {
      console.log(`\n=== UPDATING MERCHANT ACCESS SETTINGS ===`);
      console.log(`Merchant ID: ${merchantId}`);
      console.log(`Settings:`, settings);

      const now = new Date();
      const updates = {
        ...settings,
        updatedAt: now,
      };

      const updatedMerchant = await this.db
        .update(merchants)
        .set(updates)
        .where(eq(merchants.id, merchantId))
        .returning()
        .then(rows => rows[0]);

      if (!updatedMerchant) {
        console.error(`Failed to update access settings for merchant ${merchantId}`);
        return null;
      }

      console.log(`Access settings updated:`, {
        id: updatedMerchant.id,
        name: updatedMerchant.name,
        accessEndDate: updatedMerchant.accessEndDate,
        paymentStatus: updatedMerchant.paymentStatus,
        monthlyFee: updatedMerchant.monthlyFee
      });
      console.log(`=== END UPDATE ACCESS SETTINGS ===\n`);

      return updatedMerchant;
    } catch (error) {
      console.error("Error updating merchant access settings:", error);
      throw error;
    }
  }

  async getMerchantsWithExpiredAccess(): Promise<Merchant[]> {
    if (!this.initialized) await this.initialize();
    const now = new Date();
    return this.db.select().from(merchants)
      .where(and(
        eq(merchants.status, "active"),
        lte(merchants.accessEndDate, now.toISOString())
      ))
      .execute();
  }
}