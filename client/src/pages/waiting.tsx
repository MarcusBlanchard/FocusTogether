import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, User, UsersRound } from "lucide-react";
import { sessionClient, type SessionEvent } from "@/lib/session-client";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

type WaitingStatus = 'connecting' | 'searching' | 'found' | 'connecting-call';
type SessionType = "solo" | "group";

export default function Waiting() {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const [status, setStatus] = useState<WaitingStatus>('connecting');
  const [partnerInfo, setPartnerInfo] = useState<{ userId: string; username: string | null } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionType, setSessionType] = useState<SessionType>("solo");
  const [participantCount, setParticipantCount] = useState<number>(0);

  // Parse session type from URL
  useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1] || '');
    const typeParam = params.get('type');
    if (typeParam === 'group' || typeParam === 'solo') {
      setSessionType(typeParam);
    }
  }, [location]);

  const joinQueueMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/sessions/join-queue", { sessionType });
    },
  });

  const leaveQueueMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/sessions/leave-queue");
    },
  });

  useEffect(() => {
    if (!user || isLoading) return;

    // Connect to WebSocket
    sessionClient.connect(user.id);

    // Set up event listener
    const unsubscribe = sessionClient.onEvent((event: SessionEvent) => {
      console.log('[Waiting] Event received:', event);
      
      // Solo matching (1-on-1)
      if (event.type === 'matched' && event.sessionId && event.partner) {
        setStatus('found');
        // Map id to userId for consistency
        const partnerId = event.partner.userId || event.partner.id || 'unknown';
        setPartnerInfo({
          userId: partnerId,
          username: event.partner.username,
        });
        setSessionId(event.sessionId);
        setParticipantCount(2); // Solo is always 2 participants
        
        // Brief delay to show "Partner found!" then redirect
        setTimeout(() => {
          setStatus('connecting-call');
          setTimeout(() => {
            setLocation(`/session/${event.sessionId}`);
          }, 1000);
        }, 1500);
      }
      
      // Group matching (room-joined)
      if (event.type === 'room-joined' && event.sessionId) {
        setStatus('found');
        setSessionId(event.sessionId);
        // Participants + user = total count
        setParticipantCount((event.participants?.length || 0) + 1);
        
        // Brief delay to show "Room joined!" then redirect
        setTimeout(() => {
          setStatus('connecting-call');
          setTimeout(() => {
            setLocation(`/session/${event.sessionId}`);
          }, 1000);
        }, 1500);
      }
    });

    // Join queue after a brief delay to ensure connection
    const joinTimer = setTimeout(() => {
      setStatus('searching');
      // The actual queue joining happens via REST API
      joinQueueMutation.mutate();
    }, 500);

    return () => {
      unsubscribe();
      clearTimeout(joinTimer);
    };
  }, [user, isLoading, sessionType]);

  const handleCancel = () => {
    leaveQueueMutation.mutate();
    sessionClient.disconnect();
    setLocation("/");
  };

  const getStatusText = () => {
    switch (status) {
      case 'connecting':
        return 'Connecting...';
      case 'searching':
        if (sessionType === 'group') {
          return 'Searching for group members...';
        }
        return 'Searching for a partner...';
      case 'found':
        if (sessionType === 'group') {
          return `Room ready! ${participantCount} participants`;
        }
        return `Partner found! ${partnerInfo?.username || 'User'}`;
      case 'connecting-call':
        return 'Starting session...';
      default:
        return 'Waiting...';
    }
  };

  const getSessionTypeDisplay = () => {
    if (sessionType === 'group') {
      return (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-4">
          <UsersRound className="h-4 w-4" />
          <span>Group Session (2-5 participants)</span>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-4">
        <User className="h-4 w-4" />
        <span>Solo Session (1-on-1)</span>
      </div>
    );
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'connecting':
        return <Badge variant="secondary">Connecting</Badge>;
      case 'searching':
        return (
          <Badge variant="outline" className="gap-1">
            <span className="h-2 w-2 rounded-full bg-status-away animate-pulse" />
            Searching
          </Badge>
        );
      case 'found':
      case 'connecting-call':
        return (
          <Badge variant="outline" className="gap-1">
            <span className="h-2 w-2 rounded-full bg-status-online" />
            Matched
          </Badge>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">FocusSession</h1>
          <div className="flex items-center gap-4">
            {getStatusBadge()}
          </div>
        </div>
      </header>

      <main className="min-h-[calc(100vh-73px)] flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mb-6">
            {status === 'found' || status === 'connecting-call' ? (
              <div className="h-16 w-16 mx-auto rounded-full bg-status-online/20 flex items-center justify-center">
                <span className="h-8 w-8 rounded-full bg-status-online" />
              </div>
            ) : (
              <div className="relative h-16 w-16 mx-auto">
                <span className="absolute inset-0 rounded-full bg-muted animate-ping opacity-50" />
                <span className="absolute inset-2 rounded-full bg-muted animate-ping opacity-50 animation-delay-200" />
                <span className="absolute inset-4 rounded-full bg-muted" />
              </div>
            )}
          </div>

          {getSessionTypeDisplay()}

          <h2 className="text-xl font-medium mb-2" data-testid="text-waiting-status">
            {getStatusText()}
          </h2>
          
          <p className="text-sm text-muted-foreground mb-8">
            {status === 'searching' && sessionType === 'solo' && "You'll be matched with another user shortly."}
            {status === 'searching' && sessionType === 'group' && "You'll be matched with a group of 2-5 participants."}
            {status === 'found' && "Getting ready to connect..."}
            {status === 'connecting-call' && "Setting up your video call..."}
          </p>

          {(status === 'connecting' || status === 'searching') && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleCancel}
              className="text-muted-foreground"
              data-testid="button-cancel-waiting"
            >
              <X className="mr-1 h-4 w-4" />
              Cancel
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
