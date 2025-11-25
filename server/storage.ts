import {
  users,
  focusSessions,
  friends,
  type User,
  type UpsertUser,
  type FocusSession,
  type InsertFocusSession,
  type Friend,
  type InsertFriend,
} from "@shared/schema";
import { db } from "./db";
import { eq, or, and, ilike, ne, desc } from "drizzle-orm";

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
}

export const storage = new DatabaseStorage();
