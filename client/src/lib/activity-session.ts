import { apiRequest } from "./queryClient";

/**
 * Notify backend that user has joined a session
 * This allows the desktop app and browser extension to detect active sessions
 */
export async function notifySessionJoined(sessionId: string): Promise<void> {
  try {
    await apiRequest("POST", "/api/activity/session", {
      sessionId,
      status: "joined",
    });
    console.log(`[ActivitySession] Notified backend: joined session ${sessionId}`);
  } catch (error) {
    console.error("[ActivitySession] Failed to notify session joined:", error);
    // Don't throw - this is non-critical
  }
}

/**
 * Notify backend that user has left a session
 */
export async function notifySessionLeft(): Promise<void> {
  try {
    await apiRequest("POST", "/api/activity/session", {
      sessionId: null,
      status: "left",
    });
    console.log("[ActivitySession] Notified backend: left session");
  } catch (error) {
    console.error("[ActivitySession] Failed to notify session left:", error);
    // Don't throw - this is non-critical
  }
}
