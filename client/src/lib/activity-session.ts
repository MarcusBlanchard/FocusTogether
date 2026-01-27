import { apiRequest } from "./config";

/**
 * Notify backend that user has joined a session
 * This allows the desktop app to detect active sessions
 */
export async function notifySessionJoined(sessionId: string): Promise<void> {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/0d09f34b-23d1-43a5-b99f-c422e61992fc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'activity-session.ts:7',message:'notifySessionJoined called',data:{sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  try {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0d09f34b-23d1-43a5-b99f-c422e61992fc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'activity-session.ts:10',message:'About to call apiRequest',data:{sessionId,status:'joined'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    await apiRequest("POST", "/api/activity/session", {
      sessionId,
      status: "joined",
    });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0d09f34b-23d1-43a5-b99f-c422e61992fc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'activity-session.ts:16',message:'apiRequest succeeded',data:{sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    console.log(`[ActivitySession] Notified backend: joined session ${sessionId}`);
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0d09f34b-23d1-43a5-b99f-c422e61992fc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'activity-session.ts:19',message:'apiRequest failed',data:{error:String(error),sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
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
