import { useEffect, useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { 
  Loader2,
  Users,
  Clock,
  UserCheck,
  ArrowLeft
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LiveKitSession } from "@/components/LiveKitSession";
import { format, formatDistanceToNow, isPast, isBefore } from "date-fns";

type SessionStatus = 'pre-session' | 'active' | 'ended' | 'post-session';

interface ScheduledSessionData {
  id: string;
  title: string | null;
  description: string | null;
  sessionType: string;
  capacity: number;
  startAt: string;
  endAt: string;
  participantCount: number;
  participants?: Array<{
    id: string;
    userId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    role: string;
  }>;
}

interface LiveKitTokenResponse {
  token: string;
  serverUrl: string;
}

export default function Session() {
  const params = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('pre-session');
  const [sessionDuration, setSessionDuration] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const sessionStartRef = useRef<Date | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Fetch scheduled session details
  const { data: sessionData, isLoading: sessionLoading } = useQuery<ScheduledSessionData>({
    queryKey: ['/api/scheduled-sessions', params.sessionId],
    enabled: !!params.sessionId,
    refetchInterval: sessionStatus === 'pre-session' ? 5000 : false,
  });

  // Fetch LiveKit token when session becomes active
  const fetchLiveKitToken = async () => {
    if (!params.sessionId) return;
    
    try {
      console.log('[Session] Fetching LiveKit token...');
      const response = await apiRequest(
        'POST',
        '/api/livekit/token',
        { sessionId: params.sessionId }
      ) as LiveKitTokenResponse;
      
      console.log('[Session] Got LiveKit token');
      setLivekitToken(response.token);
      setLivekitUrl(response.serverUrl);
    } catch (error) {
      console.error('[Session] Error fetching LiveKit token:', error);
      toast({
        title: "Connection Error",
        description: "Failed to connect to video session. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Log session completion
  const completeSessionMutation = useMutation({
    mutationFn: async (data: { sessionId: string; duration: number }) => {
      return apiRequest("POST", "/api/sessions/complete", data);
    },
  });

  // Wake Lock to prevent screen sleep
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && sessionStatus === 'active') {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log('[Session] Wake Lock activated');
        } catch (err) {
          console.log('[Session] Wake Lock request failed:', err);
        }
      }
    };

    if (sessionStatus === 'active') {
      requestWakeLock();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && sessionStatus === 'active') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };
  }, [sessionStatus]);

  // Countdown timer for pre-session
  useEffect(() => {
    if (!sessionData?.startAt || !user) return;

    const interval = setInterval(() => {
      const startTime = new Date(sessionData.startAt);
      const now = new Date();
      const diff = Math.floor((startTime.getTime() - now.getTime()) / 1000);

      if (diff <= 0) {
        setCountdown(0);
        if (sessionStatus === 'pre-session') {
          console.log('[Session] Countdown reached zero, entering session');
          setSessionStatus('active');
          sessionStartRef.current = startTime;
          fetchLiveKitToken();
        }
      } else {
        setCountdown(diff);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionData, sessionStatus, user]);

  // Session duration timer
  useEffect(() => {
    if (sessionStatus !== 'active' || !sessionStartRef.current) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((new Date().getTime() - sessionStartRef.current!.getTime()) / 1000);
      setSessionDuration(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionStatus]);

  // Determine initial session status
  useEffect(() => {
    if (!sessionData || !user) return;

    const startTime = new Date(sessionData.startAt);
    const endTime = new Date(sessionData.endAt);
    const now = new Date();

    if (isPast(endTime)) {
      setSessionStatus('ended');
    } else if (isBefore(now, startTime)) {
      setSessionStatus('pre-session');
    } else {
      console.log('[Session] Session time has arrived, setting status to active');
      setSessionStatus('active');
      sessionStartRef.current = startTime;
      if (!livekitToken) {
        fetchLiveKitToken();
      }
    }
  }, [sessionData, user]);

  const handleEndSession = () => {
    if (sessionDuration > 0 && params.sessionId) {
      completeSessionMutation.mutate({
        sessionId: params.sessionId,
        duration: sessionDuration,
      });
    }
    setSessionStatus('post-session');
  };

  const handleLeaveSession = () => {
    handleEndSession();
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="session-loading">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="session-loading">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading session...</span>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4" data-testid="session-not-found">
        <h1 className="text-2xl font-bold">Session Not Found</h1>
        <p className="text-muted-foreground">This session doesn't exist or has been removed.</p>
        <Button onClick={() => setLocation('/home')} data-testid="button-go-home">
          Go to Home
        </Button>
      </div>
    );
  }

  // Post-session summary
  if (sessionStatus === 'post-session') {
    return (
      <div className="flex items-center justify-center min-h-screen p-4" data-testid="session-summary">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Session Complete</CardTitle>
            <CardDescription>Great work! You stayed focused.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <div className="text-4xl font-bold text-primary mb-2">
                {formatTime(sessionDuration)}
              </div>
              <p className="text-muted-foreground">Total Session Time</p>
            </div>
            
            <div className="flex justify-center gap-2">
              <Button onClick={() => setLocation('/home')} data-testid="button-go-home">
                Go to Home
              </Button>
              <Button variant="outline" onClick={() => setLocation('/calendar')} data-testid="button-book-another">
                Book Another
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Session ended
  if (sessionStatus === 'ended') {
    return (
      <div className="flex items-center justify-center min-h-screen p-4" data-testid="session-ended">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Session Ended</CardTitle>
            <CardDescription>This session has already ended.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => setLocation('/home')} data-testid="button-go-home">
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Pre-session waiting room
  if (sessionStatus === 'pre-session') {
    return (
      <div className="flex items-center justify-center min-h-screen p-4" data-testid="session-pre">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{sessionData.title || 'Focus Session'}</CardTitle>
            <CardDescription>
              {sessionData.description || 'Get ready to focus with your partner(s)'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <div className="text-6xl font-bold text-primary mb-2">
                {formatTime(countdown)}
              </div>
              <p className="text-muted-foreground">until session starts</p>
            </div>

            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>Starts {format(new Date(sessionData.startAt), 'h:mm a')}</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>{sessionData.participantCount} / {sessionData.capacity}</span>
              </div>
            </div>

            {sessionData.participants && sessionData.participants.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-medium text-center">Participants</h3>
                <div className="flex flex-wrap justify-center gap-2">
                  {sessionData.participants.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 bg-muted rounded-full px-3 py-1">
                      <Avatar className="h-6 w-6">
                        {p.profileImageUrl && <AvatarImage src={p.profileImageUrl} />}
                        <AvatarFallback className="text-xs">
                          {(p.username || p.firstName || 'U').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">
                        {p.username || p.firstName || 'Anonymous'}
                        {p.userId === user.id && ' (You)'}
                      </span>
                      {p.role === 'host' && (
                        <Badge variant="secondary" className="text-xs">Host</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setLocation('/home')} data-testid="button-leave-waiting">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Leave
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Active session with LiveKit
  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden" data-testid="session-active">
      <header className="flex-shrink-0 h-10 sm:h-12 border-b flex items-center justify-between px-2 sm:px-4">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <h1 className="font-semibold text-sm sm:text-base truncate">{sessionData.title || 'Focus Session'}</h1>
          <Badge variant="outline" className="flex items-center gap-1 flex-shrink-0">
            <Clock className="h-3 w-3" />
            <span className="text-xs sm:text-sm">{formatTime(sessionDuration)}</span>
          </Badge>
        </div>
        <Badge variant="secondary" className="flex items-center gap-1 flex-shrink-0">
          <Users className="h-3 w-3" />
          <span className="text-xs sm:text-sm">{sessionData.participantCount}</span>
        </Badge>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden">
        {livekitToken && livekitUrl ? (
          <LiveKitSession
            token={livekitToken}
            serverUrl={livekitUrl}
            sessionId={params.sessionId!}
            onLeave={handleLeaveSession}
            localUser={{
              id: user.id,
              username: user.username,
              firstName: user.firstName,
              profileImageUrl: user.profileImageUrl,
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Connecting to video...</span>
          </div>
        )}
      </main>
    </div>
  );
}
