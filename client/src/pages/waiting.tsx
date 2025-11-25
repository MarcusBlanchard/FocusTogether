import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, X } from "lucide-react";
import { sessionClient, type SessionEvent } from "@/lib/session-client";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

type WaitingStatus = 'connecting' | 'searching' | 'found' | 'connecting-call';

export default function Waiting() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<WaitingStatus>('connecting');
  const [partnerInfo, setPartnerInfo] = useState<{ id: string; username: string | null } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const joinQueueMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/sessions/join-queue");
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
      
      if (event.type === 'matched' && event.sessionId && event.partner) {
        setStatus('found');
        setPartnerInfo(event.partner);
        setSessionId(event.sessionId);
        
        // Brief delay to show "Partner found!" then redirect
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
  }, [user, isLoading]);

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
        return 'Waiting for partner...';
      case 'found':
        return `Partner found! ${partnerInfo?.username || 'User'}`;
      case 'connecting-call':
        return 'Starting session...';
      default:
        return 'Waiting...';
    }
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
        <div className="text-center">
          <div className="mb-8">
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

          <h2 className="text-xl font-medium mb-2" data-testid="text-waiting-status">
            {getStatusText()}
          </h2>
          
          <p className="text-sm text-muted-foreground mb-8">
            {status === 'searching' && "You'll be matched with another user shortly."}
            {status === 'found' && "Getting ready to connect you both..."}
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
