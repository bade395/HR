import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const localCredentials = mysqlTable("local_credentials", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 80 }).notNull().unique(),
  passwordHash: text("passwordHash").notNull(),
  displayName: varchar("displayName", { length: 160 }).notNull(),
  role: mysqlEnum("role", ["admin", "manager", "viewer"]).default("admin").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  ownerCredentialId: int("ownerCredentialId").notNull(),
  name: varchar("name", { length: 220 }).notNull(),
  crNumber: varchar("crNumber", { length: 80 }).notNull(),
  logoUrl: text("logoUrl"),
  letterheadUrl: text("letterheadUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const localCredentialsRelations = relations(localCredentials, ({ many }) => ({
  companies: many(companies),
}));

export const companiesRelations = relations(companies, ({ one }) => ({
  owner: one(localCredentials, { fields: [companies.ownerCredentialId], references: [localCredentials.id] }),
}));

export type LocalCredential = typeof localCredentials.$inferSelect;
export type InsertLocalCredential = typeof localCredentials.$inferInsert;
export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;