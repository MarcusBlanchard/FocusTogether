import { useState, useEffect } from "react";
import { useIdleMonitoring } from "@/hooks/useIdleWarning";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Clock, AlertCircle, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Status() {
  const { idleSeconds, phase, isTauriAvailable, noteTakingMode } = useIdleMonitoring();
  const [lastActiveTime] = useState(() => new Date());

  // Update last active time when transitioning to active
  useEffect(() => {
    if (phase === 'active') {
      lastActiveTime.setTime(Date.now());
    }
  }, [phase]);

  if (!isTauriAvailable) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Flowlocked Enforcer</CardTitle>
            <CardDescription>Monitoring activity in background</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <AlertCircle className="h-5 w-5" />
              <span>Tauri environment not detected</span>
            </div>
            <p className="text-sm text-center text-muted-foreground">
              This app requires Tauri to monitor system activity.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Flowlocked Enforcer</CardTitle>
          <CardDescription>Monitoring activity in background</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Badge */}
          <div className="flex justify-center">
            <Badge 
              variant={
                phase === 'idle' ? "destructive" : 
                phase === 'warning' ? "default" : 
                "default"
              } 
              className={`text-lg px-4 py-2 flex items-center gap-2 transition-all ${
                phase === 'warning' ? 'bg-yellow-500 text-yellow-950 hover:bg-yellow-500 animate-pulse' : ''
              }`}
            >
              {phase === 'idle' ? (
                <>
                  <AlertCircle className="h-4 w-4" />
                  Idle
                </>
              ) : phase === 'warning' ? (
                <>
                  <AlertTriangle className="h-4 w-4" />
                  Warning
                </>
              ) : (
                <>
                  <Activity className="h-4 w-4" />
                  Active
                </>
              )}
            </Badge>
          </div>

          {noteTakingMode && (
            <p className="text-center text-sm text-muted-foreground">
              Note-taking mode: idle warning is paused by the session.
            </p>
          )}

          {/* Idle Seconds Counter */}
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="text-sm">Idle Time</span>
            </div>
            <div className="text-3xl font-bold">
              {idleSeconds}s
            </div>
          </div>

          {/* Last Activity Timestamp */}
          {phase === 'active' && (
            <div className="text-center text-sm text-muted-foreground">
              Last activity: {formatDistanceToNow(lastActiveTime, { addSuffix: true })}
            </div>
          )}

          {/* Phase-specific messages */}
          {phase === 'warning' && (
            <div className="text-center text-sm text-yellow-600 dark:text-yellow-500">
              Private warning: You'll be marked as distracted at 60s
            </div>
          )}
          {phase === 'idle' && (
            <div className="text-center text-sm text-destructive">
              PUBLIC IDLE: You are marked as distracted
            </div>
          )}

          {/* Debug Info */}
          <div className="pt-4 border-t text-xs text-muted-foreground space-y-1">
            <div>Warning threshold: 30s</div>
            <div>Idle threshold: 60s</div>
            <div>Poll interval: 1s</div>
            <div>Phase: {phase}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
