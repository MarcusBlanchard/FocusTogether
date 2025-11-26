import {
  users,
  focusSessions,
  friends,
  scheduledSessions,
  scheduledSessionParticipants,
  type User,
  type UpsertUser,
  type FocusSession,
  type InsertFocusSession,
  type Friend,
  type InsertFriend,
  type ScheduledSession,
  type InsertScheduledSession,
  type ScheduledSessionParticipant,
  type InsertScheduledSessionParticipant,
} from "@shared/schema";
import { db } from "./db";
import { eq, or, and, ilike, ne, desc, gte, lte, sql } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getUserByUsername(username: string): Promise<User | undefined>;
  searchUsersByUsername(query: string, excludeUserId: string): Promise<User[]>;
  updateUsername(userId: string, username: string): Promise<User | undefined>;

  // Focus session operations
  createFocusSession(session: InsertFocusSession): Promise<FocusSession>;
  endFocusSession(sessionId: string): Promise<FocusSession | undefined>;
  getUserSessions(userId: string): Promise<FocusSession[]>;
  getSessionWithUsers(sessionId: string): Promise<{ session: FocusSession; user1: User; user2: User } | undefined>;

  // Friend operations
  addFriend(userId: string, friendId: string): Promise<Friend>;
  removeFriend(userId: string, friendId: string): Promise<void>;
  getFriends(userId: string): Promise<User[]>;
  areFriends(userId: string, friendId: string): Promise<boolean>;

  // Scheduled session operations
  createScheduledSession(session: InsertScheduledSession): Promise<ScheduledSession>;
  getScheduledSession(sessionId: string): Promise<ScheduledSession | undefined>;
  updateScheduledSessionStatus(sessionId: string, status: string): Promise<ScheduledSession | undefined>;
  updateSessionStatus(sessionId: string, status: string): Promise<ScheduledSession | undefined>;
  linkFocusSessionToScheduled(scheduledSessionId: string, focusSessionId: string): Promise<void>;
  getUpcomingSessions(startDate: Date, endDate: Date): Promise<ScheduledSession[]>;
  getUserScheduledSessions(userId: string): Promise<ScheduledSession[]>;
  getOccupancyCount(startAt: Date, endAt: Date): Promise<number>;
  findMatchingBooking(startAt: Date, durationMinutes: number, bookingPreference: string, excludeUserId: string): Promise<ScheduledSession | undefined>;

  // Scheduled session participant operations
  addParticipant(participant: InsertScheduledSessionParticipant): Promise<ScheduledSessionParticipant>;
  removeParticipant(sessionId: string, userId: string): Promise<void>;
  getSessionParticipants(sessionId: string): Promise<User[]>;
  getParticipantCount(sessionId: string): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  // User operations (mandatory for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async searchUsersByUsername(query: string, excludeUserId: string): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(
        and(
          ilike(users.username, `%${query}%`),
          ne(users.id, excludeUserId)
        )
      )
      .limit(20);
  }

  async updateUsername(userId: string, username: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ username, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // Focus session operations
  async createFocusSession(sessionData: InsertFocusSession): Promise<FocusSession> {
    const [session] = await db
      .insert(focusSessions)
      .values(sessionData)
      .returning();
    return session;
  }

  async endFocusSession(sessionId: string): Promise<FocusSession | undefined> {
    const now = new Date();
    const [session] = await db.select().from(focusSessions).where(eq(focusSessions.id, sessionId));
    
    if (!session) return undefined;
    
    const durationSeconds = Math.floor((now.getTime() - session.startedAt.getTime()) / 1000);
    
    const [updated] = await db
      .update(focusSessions)
      .set({ 
        endedAt: now,
        durationSeconds 
      })
      .where(eq(focusSessions.id, sessionId))
      .returning();
    
    return updated;
  }

  async getUserSessions(userId: string): Promise<FocusSession[]> {
    return await db
      .select()
      .from(focusSessions)
      .where(
        or(
          eq(focusSessions.user1Id, userId),
          eq(focusSessions.user2Id, userId)
        )
      )
      .orderBy(desc(focusSessions.startedAt));
  }

  async getSessionWithUsers(sessionId: string): Promise<{ session: FocusSession; user1: User; user2: User } | undefined> {
    const result = await db.query.focusSessions.findFirst({
      where: eq(focusSessions.id, sessionId),
      with: {
        user1: true,
        user2: true,
      },
    });
    
    if (!result) return undefined;
    
    return {
      session: result,
      user1: result.user1,
      user2: result.user2,
    };
  }

  // Friend operations
  async addFriend(userId: string, friendId: string): Promise<Friend> {
    // Add bidirectional friendship
    await db.insert(friends).values({ userId: friendId, friendId: userId }).onConflictDoNothing();
    const [friend] = await db
      .insert(friends)
      .values({ userId, friendId })
      .onConflictDoNothing()
      .returning();
    return friend;
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    // Remove both directions
    await db.delete(friends).where(
      or(
        and(eq(friends.userId, userId), eq(friends.friendId, friendId)),
        and(eq(friends.userId, friendId), eq(friends.friendId, userId))
      )
    );
  }

  async getFriends(userId: string): Promise<User[]> {
    const friendRecords = await db
      .select()
      .from(friends)
      .where(eq(friends.userId, userId));
    
    if (friendRecords.length === 0) return [];
    
    const friendIds = friendRecords.map(f => f.friendId);
    const friendUsers = await db
      .select()
      .from(users)
      .where(
        or(...friendIds.map(id => eq(users.id, id)))
      );
    
    return friendUsers;
  }

  async areFriends(userId: string, friendId: string): Promise<boolean> {
    const [record] = await db
      .select()
      .from(friends)
      .where(
        and(eq(friends.userId, userId), eq(friends.friendId, friendId))
      );
    return !!record;
  }

  // Scheduled session operations
  async createScheduledSession(sessionData: InsertScheduledSession): Promise<ScheduledSession> {
    const [session] = await db
      .insert(scheduledSessions)
      .values(sessionData)
      .returning();
    return session;
  }

  async getScheduledSession(sessionId: string): Promise<ScheduledSession | undefined> {
    const [session] = await db
      .select()
      .from(scheduledSessions)
      .where(eq(scheduledSessions.id, sessionId));
    return session;
  }

  async updateScheduledSessionStatus(sessionId: string, status: string): Promise<ScheduledSession | undefined> {
    const [session] = await db
      .update(scheduledSessions)
      .set({ status })
      .where(eq(scheduledSessions.id, sessionId))
      .returning();
    return session;
  }

  async updateSessionStatus(sessionId: string, status: string): Promise<ScheduledSession | undefined> {
    return this.updateScheduledSessionStatus(sessionId, status);
  }

  async linkFocusSessionToScheduled(scheduledSessionId: string, focusSessionId: string): Promise<void> {
    await db
      .update(scheduledSessions)
      .set({ focusSessionId })
      .where(eq(scheduledSessions.id, scheduledSessionId));
  }

  async findMatchingBooking(
    startAt: Date,
    durationMinutes: number,
    bookingPreference: string,
    excludeUserId: string
  ): Promise<ScheduledSession | undefined> {
    // Calculate end time
    const endAt = new Date(startAt.getTime() + durationMinutes * 60000);

    // Build preference matching condition
    // desk ↔ desk or any
    // active ↔ active or any
    // any ↔ desk or active or any
    let preferenceCondition;
    if (bookingPreference === 'desk') {
      preferenceCondition = or(
        eq(scheduledSessions.bookingPreference, 'desk'),
        eq(scheduledSessions.bookingPreference, 'any')
      );
    } else if (bookingPreference === 'active') {
      preferenceCondition = or(
        eq(scheduledSessions.bookingPreference, 'active'),
        eq(scheduledSessions.bookingPreference, 'any')
      );
    } else {
      // 'any' matches with all
      preferenceCondition = or(
        eq(scheduledSessions.bookingPreference, 'desk'),
        eq(scheduledSessions.bookingPreference, 'active'),
        eq(scheduledSessions.bookingPreference, 'any')
      );
    }

    // Find sessions with matching:
    // - Same start time
    // - Same duration
    // - Compatible preference
    // - Not cancelled
    // - Not full (has space)
    // - Not created by this user
    const [matchingSession] = await db
      .select()
      .from(scheduledSessions)
      .where(
        and(
          eq(scheduledSessions.startAt, startAt),
          eq(scheduledSessions.durationMinutes, durationMinutes),
          preferenceCondition!,
          ne(scheduledSessions.status, 'cancelled'),
          ne(scheduledSessions.hostId, excludeUserId)
        )
      )
      .limit(1);

    if (!matchingSession) return undefined;

    // Check if session has space
    const participantCount = await this.getParticipantCount(matchingSession.id);
    if (participantCount >= matchingSession.capacity) {
      return undefined;
    }

    return matchingSession;
  }

  async getUpcomingSessions(startDate: Date, endDate: Date): Promise<ScheduledSession[]> {
    return await db
      .select()
      .from(scheduledSessions)
      .where(
        and(
          gte(scheduledSessions.startAt, startDate),
          lte(scheduledSessions.startAt, endDate),
          ne(scheduledSessions.status, 'cancelled')
        )
      )
      .orderBy(scheduledSessions.startAt);
  }

  async getUserScheduledSessions(userId: string): Promise<ScheduledSession[]> {
    // Get sessions where user is either host or participant
    const participations = await db
      .select()
      .from(scheduledSessionParticipants)
      .where(eq(scheduledSessionParticipants.userId, userId));
    
    const sessionIds = participations.map(p => p.sessionId);
    
    if (sessionIds.length === 0) {
      return await db
        .select()
        .from(scheduledSessions)
        .where(eq(scheduledSessions.hostId, userId))
        .orderBy(desc(scheduledSessions.startAt));
    }
    
    // Build OR condition properly - handle single ID case
    const sessionIdConditions = sessionIds.length === 1
      ? eq(scheduledSessions.id, sessionIds[0])
      : or(...sessionIds.map(id => eq(scheduledSessions.id, id)));
    
    return await db
      .select()
      .from(scheduledSessions)
      .where(
        or(
          eq(scheduledSessions.hostId, userId),
          sessionIdConditions!
        )
      )
      .orderBy(desc(scheduledSessions.startAt));
  }

  async getOccupancyCount(startAt: Date, endAt: Date): Promise<number> {
    // Count participants in sessions that overlap with the time range (both scheduled and active)
    const sessions = await db
      .select()
      .from(scheduledSessions)
      .where(
        and(
          lte(scheduledSessions.startAt, endAt),
          gte(scheduledSessions.endAt, startAt),
          or(
            eq(scheduledSessions.status, 'scheduled'),
            eq(scheduledSessions.status, 'active')
          )
        )
      );
    
    if (sessions.length === 0) return 0;
    
    const sessionIds = sessions.map(s => s.id);
    
    // Handle single ID case for or()
    const sessionIdConditions = sessionIds.length === 1
      ? eq(scheduledSessionParticipants.sessionId, sessionIds[0])
      : or(...sessionIds.map(id => eq(scheduledSessionParticipants.sessionId, id)));
    
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(scheduledSessionParticipants)
      .where(
        and(
          sessionIdConditions!,
          eq(scheduledSessionParticipants.status, 'joined')
        )
      );
    
    return Number(result[0]?.count || 0);
  }

  // Scheduled session participant operations
  async addParticipant(participantData: InsertScheduledSessionParticipant): Promise<ScheduledSessionParticipant> {
    const [participant] = await db
      .insert(scheduledSessionParticipants)
      .values(participantData)
      .returning();
    return participant;
  }

  async removeParticipant(sessionId: string, userId: string): Promise<void> {
    await db
      .update(scheduledSessionParticipants)
      .set({ status: 'left', leftAt: new Date() })
      .where(
        and(
          eq(scheduledSessionParticipants.sessionId, sessionId),
          eq(scheduledSessionParticipants.userId, userId)
        )
      );
  }

  async getSessionParticipants(sessionId: string): Promise<User[]> {
    const participants = await db
      .select()
      .from(scheduledSessionParticipants)
      .where(
        and(
          eq(scheduledSessionParticipants.sessionId, sessionId),
          eq(scheduledSessionParticipants.status, 'joined')
        )
      );
    
    if (participants.length === 0) return [];
    
    const userIds = participants.map(p => p.userId);
    return await db
      .select()
      .from(users)
      .where(or(...userIds.map(id => eq(users.id, id))));
  }

  async getParticipantCount(sessionId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(scheduledSessionParticipants)
      .where(
        and(
          eq(scheduledSessionParticipants.sessionId, sessionId),
          eq(scheduledSessionParticipants.status, 'joined')
        )
      );
    
    return Number(result[0]?.count || 0);
  }
}

export const storage = new DatabaseStorage();
