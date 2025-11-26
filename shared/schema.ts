import { sql, relations } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  integer,
  uuid,
  text,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for express-session
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  username: varchar("username").unique(),
  preference: varchar("preference").notNull().default('any'), // 'desk', 'active', 'any'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Focus sessions table - tracks all completed work sessions
export const focusSessions = pgTable("focus_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user1Id: varchar("user1_id").notNull().references(() => users.id),
  user2Id: varchar("user2_id").notNull().references(() => users.id),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  durationSeconds: integer("duration_seconds"),
});

// Friends table - stores bidirectional friendships
export const friends = pgTable("friends", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  friendId: varchar("friend_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Scheduled sessions table - for calendar booking
export const scheduledSessions = pgTable("scheduled_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  hostId: varchar("host_id").notNull().references(() => users.id),
  sessionType: varchar("session_type").notNull(), // 'solo', 'group'
  bookingPreference: varchar("booking_preference").notNull(), // 'desk', 'active', 'any'
  durationMinutes: integer("duration_minutes").notNull(), // 20, 40, or 60
  title: varchar("title"),
  description: text("description"),
  capacity: integer("capacity").notNull().default(2), // 2 for solo, up to 5 for group
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  status: varchar("status").notNull().default('scheduled'), // 'scheduled', 'active', 'completed', 'cancelled'
  focusSessionId: uuid("focus_session_id").references(() => focusSessions.id), // links to completed session
  createdAt: timestamp("created_at").defaultNow(),
});

// Scheduled session participants - tracks who joins scheduled sessions
export const scheduledSessionParticipants = pgTable("scheduled_session_participants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: uuid("session_id").notNull().references(() => scheduledSessions.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  role: varchar("role").notNull().default('participant'), // 'host', 'participant'
  status: varchar("status").notNull().default('joined'), // 'joined', 'left'
  joinedAt: timestamp("joined_at").defaultNow(),
  leftAt: timestamp("left_at"),
}, (table) => [
  // Unique constraint to prevent duplicate participants
  unique().on(table.sessionId, table.userId),
]);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  sessionsAsUser1: many(focusSessions, { relationName: "user1Sessions" }),
  sessionsAsUser2: many(focusSessions, { relationName: "user2Sessions" }),
  friends: many(friends, { relationName: "userFriends" }),
  friendOf: many(friends, { relationName: "friendOfUser" }),
  hostedSessions: many(scheduledSessions, { relationName: "hostedSessions" }),
  scheduledParticipations: many(scheduledSessionParticipants, { relationName: "userParticipations" }),
}));

export const focusSessionsRelations = relations(focusSessions, ({ one }) => ({
  user1: one(users, {
    fields: [focusSessions.user1Id],
    references: [users.id],
    relationName: "user1Sessions",
  }),
  user2: one(users, {
    fields: [focusSessions.user2Id],
    references: [users.id],
    relationName: "user2Sessions",
  }),
}));

export const friendsRelations = relations(friends, ({ one }) => ({
  user: one(users, {
    fields: [friends.userId],
    references: [users.id],
    relationName: "userFriends",
  }),
  friend: one(users, {
    fields: [friends.friendId],
    references: [users.id],
    relationName: "friendOfUser",
  }),
}));

export const scheduledSessionsRelations = relations(scheduledSessions, ({ one, many }) => ({
  host: one(users, {
    fields: [scheduledSessions.hostId],
    references: [users.id],
    relationName: "hostedSessions",
  }),
  participants: many(scheduledSessionParticipants, { relationName: "sessionParticipants" }),
  focusSession: one(focusSessions, {
    fields: [scheduledSessions.focusSessionId],
    references: [focusSessions.id],
  }),
}));

export const scheduledSessionParticipantsRelations = relations(scheduledSessionParticipants, ({ one }) => ({
  session: one(scheduledSessions, {
    fields: [scheduledSessionParticipants.sessionId],
    references: [scheduledSessions.id],
    relationName: "sessionParticipants",
  }),
  user: one(users, {
    fields: [scheduledSessionParticipants.userId],
    references: [users.id],
    relationName: "userParticipations",
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFocusSessionSchema = createInsertSchema(focusSessions).omit({
  id: true,
  startedAt: true,
});

export const insertFriendSchema = createInsertSchema(friends).omit({
  id: true,
  createdAt: true,
});

export const insertScheduledSessionSchema = createInsertSchema(scheduledSessions).omit({
  id: true,
  createdAt: true,
});

export const insertScheduledSessionParticipantSchema = createInsertSchema(scheduledSessionParticipants).omit({
  id: true,
  joinedAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type FocusSession = typeof focusSessions.$inferSelect;
export type InsertFocusSession = z.infer<typeof insertFocusSessionSchema>;

export type Friend = typeof friends.$inferSelect;
export type InsertFriend = z.infer<typeof insertFriendSchema>;

export type ScheduledSession = typeof scheduledSessions.$inferSelect;
export type InsertScheduledSession = z.infer<typeof insertScheduledSessionSchema>;

export type ScheduledSessionParticipant = typeof scheduledSessionParticipants.$inferSelect;
export type InsertScheduledSessionParticipant = z.infer<typeof insertScheduledSessionParticipantSchema>;
