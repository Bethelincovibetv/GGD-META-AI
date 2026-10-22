import { pgTable, serial, text, timestamp, varchar, jsonb, boolean } from 'drizzle-orm/pg-core';

// Firebase Authenticated Users Table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Baileys WhatsApp Session Storage Table (Cloud SQL & Postgres)
export const baileysSessions = pgTable('baileys_sessions', {
  sessionId: varchar('session_id', { length: 128 }).notNull(),
  keyId: varchar('key_id', { length: 255 }).notNull(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Admin Privileges Table
export const admins = pgTable('admins', {
  id: serial('id').primaryKey(),
  jid: text('jid').notNull().unique(),
  name: text('name').notNull().default('Admin'),
  role: text('role').notNull().default('admin'),
  addedBy: text('added_by').default('system'),
  canBroadcast: boolean('can_broadcast').default(true),
  canTagall: boolean('can_tagall').default(true),
  canManageAdmins: boolean('can_manage_admins').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Bot Settings Table (GGD META AI settings)
export const botSettings = pgTable('bot_settings', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
