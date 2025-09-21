import { type User, type InsertUser, type Merchant, type InsertMerchant, type Service, type InsertService, type Employee, type InsertEmployee, type Client, type InsertClient, type Appointment, type InsertAppointment, type AvailabilityData, type AppointmentStatusData, type EmployeeDayOff, type InsertEmployeeDayOff, type Promotion, type InsertPromotion, type SystemSetting } from "../shared/schema";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  updateUserPassword(id: string, newPassword: string): Promise<boolean>;

  // Merchant methods
  getMerchant(id: string): Promise<Merchant | undefined>;
  getMerchantByEmail(email: string): Promise<Merchant | undefined>;
  getAllMerchants(): Promise<Merchant[]>;
  createMerchant(merchant: InsertMerchant): Promise<Merchant>;
  updateMerchant(id: string, updates: Partial<InsertMerchant>): Promise<Merchant | undefined>;
  updateMerchantPassword(id: string, newPassword: string): Promise<boolean>;
  deleteMerchant(id: string): Promise<boolean>;
  getMerchantsByStatus(status: string): Promise<Merchant[]>;
  getMerchantsStats(): Promise<{
    total: number;
    active: number;
    pending: number;
    inactive: number;
    thisMonth: number;
  }>;

  // Service methods
  getService(id: string): Promise<Service | undefined>;
  getServicesByMerchant(merchantId: string): Promise<Service[]>;
  getActiveServicesByMerchant(merchantId: string): Promise<Service[]>;
  createService(service: InsertService): Promise<Service>;
  updateService(id: string, updates: Partial<InsertService>): Promise<Service | undefined>;
  deleteService(id: string): Promise<boolean>;
  updateServiceMerchant(serviceId: string, newMerchantId: string): Promise<boolean>;

  // Employee methods
  getEmployee(id: string): Promise<Employee | undefined>;
  getEmployeeByEmail(email: string): Promise<Employee | undefined>;
  getEmployeesByMerchant(merchantId: string): Promise<Employee[]>;
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  updateEmployee(id: string, updates: Partial<InsertEmployee>): Promise<Employee | undefined>;
  updateEmployeePassword(id: string, newPassword: string): Promise<boolean>;
  deleteEmployee(id: string): Promise<boolean>;

  // Client methods
  getClient(id: string): Promise<Client | undefined>;
  getClientsByMerchant(merchantId: string): Promise<Client[]>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: string, updates: Partial<InsertClient>): Promise<Client | undefined>;
  deleteClient(id: string): Promise<boolean>;

  // Appointment methods
  getAppointment(id: string): Promise<Appointment | undefined>;
  getAppointmentsByMerchant(merchantId: string, startDate: Date, endDate: Date): Promise<Appointment[]>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: string, updates: Partial<InsertAppointment>): Promise<Appointment | undefined>;
  deleteAppointment(id: string): Promise<boolean>;

  // EmployeeDayOff methods
  getEmployeeDayOff(id: string): Promise<EmployeeDayOff | undefined>;
  getEmployeeDaysOffByEmployee(employeeId: string): Promise<EmployeeDayOff[]>;
  createEmployeeDayOff(insertDayOff: InsertEmployeeDayOff): Promise<EmployeeDayOff>;
  deleteEmployeeDayOff(id: string): Promise<boolean>;

  // Promotion methods
  getPromotion(id: string): Promise<Promotion | undefined>;
  getPromotionsByMerchant(merchantId: string): Promise<Promotion[]>;
  createPromotion(insertPromotion: InsertPromotion): Promise<Promotion>;
  updatePromotion(id: string, updates: Partial<InsertPromotion>): Promise<Promotion | undefined>;
  deletePromotion(id: string): Promise<boolean>;

  // SystemSetting methods
  getSystemSetting(key: string): Promise<SystemSetting | undefined>;
  createSystemSetting(setting: SystemSetting): Promise<SystemSetting>;
  updateSystemSetting(key: string, value: string): Promise<SystemSetting | undefined>;
  getAllSystemSettings(): Promise<SystemSetting[]>;

  initialize(): Promise<void>;
  getEmployeeAvailability(employeeId: string, date: Date): Promise<AvailabilityData>;
  getAppointmentStatusCounts(merchantId: string): Promise<AppointmentStatusData>;
  processExpiredAccess(): Promise<number>;
}

const isProduction = process.env.NODE_ENV === "production";

let storage: IStorage;

if (isProduction) {
  const { PostgreSQLStorage } = await import("./postgres-storage");
  storage = new PostgreSQLStorage();
} else {
  const { SQLiteStorage } = await import("./sqlite-storage");
  storage = new SQLiteStorage();
}

export { storage };