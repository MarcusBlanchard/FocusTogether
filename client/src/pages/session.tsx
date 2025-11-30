import { useEffect, useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Monitor,
  MonitorOff,
  PhoneOff,
  Loader2,
  Users,
  Clock,
  UserCheck,
  Eye,
  EyeOff
} from "lucide-react";
import { type SessionEvent, type ParticipantInfo } from "@/lib/session-client";
import { useSessionClient } from "@/contexts/session-client-context";
import { meshWebRTCManager } from "@/lib/webrtc-mesh";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { VideoGrid, type VideoParticipant } from "@/components/VideoGrid";
import { format, formatDistanceToNow, isPast, isBefore, addMinutes } from "date-fns";

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

export default function Session() {
  const params = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isConnected, onEvent, sendSignal, joinScheduledSession, getUserId, waitForConnection } = useSessionClient();

  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('pre-session');
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [participants, setParticipants] = useState<VideoParticipant[]>([]);

  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenBlurred, setScreenBlurred] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [mediaCapabilities, setMediaCapabilities] = useState<{ hasVideo: boolean; hasAudio: boolean; videoError?: string; audioError?: string }>({ hasVideo: true, hasAudio: true });

  const [sessionDuration, setSessionDuration] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const sessionStartRef = useRef<Date | null>(null);
  const initializingRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Wake Lock to prevent screen sleep on mobile/tablet (keeps audio working)
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && sessionStatus === 'active') {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log('[Session] Wake Lock activated - screen will stay on');
          
          wakeLockRef.current.addEventListener('release', () => {
            console.log('[Session] Wake Lock released');
          });
        } catch (err) {
          console.log('[Session] Wake Lock request failed:', err);
        }
      }
    };

    if (sessionStatus === 'active') {
      requestWakeLock();
    }

    // Re-acquire wake lock if page becomes visible again
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

  // Fetch scheduled session details
  const { data: sessionData, isLoading: sessionLoading } = useQuery<ScheduledSessionData>({
    queryKey: ['/api/scheduled-sessions', params.sessionId],
    enabled: !!params.sessionId,
    refetchInterval: sessionStatus === 'pre-session' ? 5000 : false, // Poll while waiting
  });

  // Log session completion
  const completeSessionMutation = useMutation({
    mutationFn: async (data: { sessionId: string; duration: number }) => {
      return apiRequest("POST", "/api/sessions/complete", data);
    },
  });

  // Countdown timer for pre-session
  useEffect(() => {
    if (!sessionData?.startAt) return;

    const interval = setInterval(() => {
      const startTime = new Date(sessionData.startAt);
      const now = new Date();
      const diff = Math.floor((startTime.getTime() - now.getTime()) / 1000);

      if (diff <= 0) {
        setCountdown(0);
        // Auto-enter session when time is reached
        if (sessionStatus === 'pre-session' && !initializingRef.current) {
          setSessionStatus('active');
          initSession();
        }
      } else {
        setCountdown(diff);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionData, sessionStatus]);

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
    if (!sessionData) return;

    const startTime = new Date(sessionData.startAt);
    const endTime = new Date(sessionData.endAt);
    const now = new Date();

    if (isPast(endTime)) {
      setSessionStatus('ended');
    } else if (isBefore(now, startTime)) {
      setSessionStatus('pre-session');
    } else if (!initializingRef.current) {
      // Session time has arrived, auto-enter
      setSessionStatus('active');
      sessionStartRef.current = startTime;
      initSession();
    }
  }, [sessionData]);

  const initSession = async () => {
    if (!user || !params.sessionId || initializingRef.current) return;
    
    initializingRef.current = true;
    let unsubscribe: (() => void) | null = null;

    try {
      await waitForConnection();

      // Get local media (camera + mic) - this now gracefully handles failures
      const stream = await meshWebRTCManager.getUserMedia();
      setLocalStream(stream);
      
      // Get media capabilities and update state
      const capabilities = meshWebRTCManager.getMediaCapabilities();
      setMediaCapabilities(capabilities);
      
      // Update UI state based on what's actually available
      if (!capabilities.hasVideo) {
        setVideoEnabled(false);
      }
      if (!capabilities.hasAudio) {
        setAudioEnabled(false);
      }
      
      // Show toast if media is limited
      if (!capabilities.hasVideo || !capabilities.hasAudio) {
        toast({
          title: "Limited Media Access",
          description: capabilities.hasVideo ? 
            "Microphone unavailable - video only mode" : 
            capabilities.hasAudio ? 
              "Camera unavailable - audio only mode" : 
              "Camera and microphone unavailable - you can still view others",
          variant: "default",
        });
      }

      meshWebRTCManager.setCallbacks({
        onPeerStream: (info) => {
          console.log('[Session] Remote stream from:', info.peerId);
          setParticipants(prev => {
            const existing = prev.find(p => p.userId === info.peerId);
            if (existing) {
              return prev.map(p => p.userId === info.peerId ? { ...p, stream: info.stream } : p);
            }
            return prev;
          });
          setConnectionState('connected');
        },
        onPeerScreenStream: (peerId, stream) => {
          console.log('[Session] Remote screen stream from:', peerId, stream ? 'started' : 'stopped');
          setParticipants(prev => prev.map(p => 
            p.userId === peerId ? { ...p, screenStream: stream || undefined } : p
          ));
        },
        onPeerScreenBlur: (peerId, blurred) => {
          console.log('[Session] Remote screen blur from:', peerId, blurred);
          setParticipants(prev => prev.map(p => 
            p.userId === peerId ? { ...p, screenBlurred: blurred } : p
          ));
        },
        onSignal: (signal) => {
          const userId = getUserId();
          if (!userId) {
            console.error('[Session] Cannot send signal - user ID not available');
            return;
          }
          sendSignal(
            params.sessionId!,
            signal.type,
            signal.data,
            userId,
            signal.targetId
          );
        },
        onConnectionStateChange: (peerId, state) => {
          console.log('[Session] Connection state for', peerId, ':', state);
          if (state === 'connected') {
            setConnectionState('connected');
          } else if (state === 'failed' || state === 'disconnected') {
            setParticipants(prev => prev.map(p => 
              p.userId === peerId ? { ...p, stream: null, screenStream: undefined } : p
            ));
          }
        },
      });

      meshWebRTCManager.setSessionId(params.sessionId!);
      meshWebRTCManager.setMyUserId(user.id);

      // Join the scheduled session to register in the server's room
      // This enables WebRTC signaling between participants
      joinScheduledSession(params.sessionId!);
      console.log('[Session] Requested to join scheduled session:', params.sessionId);

      unsubscribe = onEvent(async (event: SessionEvent) => {
        if (event.type === 'signal' && event.signal) {
          await handleSignal(event.signal);
        } else if (event.type === 'participant-joined' && event.participant) {
          if (event.participant.userId !== user.id) {
            await handleParticipantJoined(event.participant);
            toast({
              title: "Partner Joined",
              description: `${event.participant.username || 'Someone'} joined the session`,
            });
          }
        } else if (event.type === 'participant-left' && event.participant) {
          if (event.participant.userId !== user.id) {
            handleParticipantLeft(event.participant);
            toast({
              title: "Partner Left",
              description: `${event.participant.username || 'Your partner'} left the session`,
              variant: "destructive",
            });
          }
        } else if (event.type === 'room-joined' && event.participants) {
          await handleRoomJoined(event.participants);
        } else if (event.type === 'partner-disconnected') {
          handlePartnerDisconnect();
          toast({
            title: "Partner Disconnected",
            description: "Your partner has disconnected from the session",
            variant: "destructive",
          });
        } else if (event.type === 'matched' && event.partner) {
          await handleMatched(event.partner);
          toast({
            title: "Match Found!",
            description: `You've been matched with ${event.partner.username || 'a partner'}`,
          });
        }
      });

      sessionStartRef.current = new Date();
      console.log('[Session] Initialization complete');
    } catch (error) {
      console.error('[Session] Error initializing:', error);
      // Only show error toast for actual connection failures, not media issues
      // (media issues are handled gracefully with fallbacks)
      toast({
        title: "Connection Error",
        description: error instanceof Error ? error.message : "Failed to connect to session. Please try again.",
        variant: "destructive",
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  };

  const handleSignal = async (signal: { type: string; sessionId: string; senderId: string; targetId?: string; data: any }) => {
    try {
      const peerId = signal.senderId;
      
      if (signal.type === 'offer') {
        const answer = await meshWebRTCManager.handleOffer(peerId, signal.data);
        const userId = getUserId();
        if (userId) {
          sendSignal(params.sessionId!, 'answer', answer, userId, peerId);
        }
      } else if (signal.type === 'answer') {
        await meshWebRTCManager.handleAnswer(peerId, signal.data);
      } else if (signal.type === 'ice-candidate') {
        await meshWebRTCManager.handleIceCandidate(peerId, signal.data);
      }
    } catch (error) {
      console.error('[Session] Error handling signal:', error);
    }
  };

  const handleMatched = async (partner: { id?: string; userId?: string; username: string | null; profileImageUrl: string | null }) => {
    const participantId = partner.userId || partner.id;
    if (!participantId) return;

    const existingConnection = meshWebRTCManager.getPeerConnection(participantId);
    if (existingConnection) return;

    setParticipants([{
      userId: participantId,
      username: partner.username,
      profileImageUrl: partner.profileImageUrl,
      stream: null,
      audioEnabled: true,
      videoEnabled: true,
    }]);

    const userId = getUserId();
    if (!userId) return;

    const shouldInitiate = userId < participantId;
    if (shouldInitiate) {
      try {
        const offer = await meshWebRTCManager.createOffer(participantId);
        sendSignal(params.sessionId!, 'offer', offer, userId, participantId);
      } catch (error) {
        console.error('[Session] Error creating offer:', error);
      }
    }
  };

  const handleParticipantJoined = async (participant: ParticipantInfo) => {
    if (!participant.userId) return;

    const existingConnection = meshWebRTCManager.getPeerConnection(participant.userId);
    if (existingConnection) return;

    setParticipants(prev => [...prev, {
      userId: participant.userId,
      username: participant.username,
      profileImageUrl: participant.profileImageUrl,
      stream: null,
      audioEnabled: true,
      videoEnabled: true,
    }]);

    toast({
      title: "Participant joined",
      description: `${participant.username || "A participant"} joined the session.`,
    });

    const userId = getUserId();
    if (!userId) return;

    const shouldInitiate = userId < participant.userId;
    if (shouldInitiate) {
      try {
        const offer = await meshWebRTCManager.createOffer(participant.userId);
        sendSignal(params.sessionId!, 'offer', offer, userId, participant.userId);
      } catch (error) {
        console.error('[Session] Error creating offer for new participant:', error);
      }
    }
  };

  const handleParticipantLeft = (participant: ParticipantInfo) => {
    console.log('[Session] Participant left:', participant);
    setParticipants(prev => prev.filter(p => p.userId !== participant.userId));
    meshWebRTCManager.removePeer(participant.userId);
    // Note: Toast is shown by the event handler to avoid duplicates
  };

  const handleRoomJoined = async (participants: ParticipantInfo[]) => {
    const userId = getUserId();
    if (!userId) return;
    
    const otherParticipants = participants.filter(p => p.userId && p.userId !== userId);
    setParticipants(otherParticipants.map(p => ({
      userId: p.userId,
      username: p.username,
      profileImageUrl: p.profileImageUrl,
      stream: null,
      audioEnabled: true,
      videoEnabled: true,
    })));

    for (const participant of otherParticipants) {
      if (!participant.userId) continue;

      const shouldInitiate = userId < participant.userId;
      if (shouldInitiate) {
        try {
          const offer = await meshWebRTCManager.createOffer(participant.userId);
          sendSignal(params.sessionId!, 'offer', offer, userId, participant.userId);
        } catch (error) {
          console.error('[Session] Error creating offer for participant:', error);
        }
      }
    }
  };

  const handlePartnerDisconnect = () => {
    setConnectionState('disconnected');
    toast({
      title: "Session ended",
      description: "The session has ended.",
    });
  };

  const handleToggleAudio = () => {
    const newState = !audioEnabled;
    setAudioEnabled(newState);
    meshWebRTCManager.toggleAudio(newState);
  };

  const handleToggleVideo = () => {
    const newState = !videoEnabled;
    setVideoEnabled(newState);
    meshWebRTCManager.toggleVideo(newState);
  };

  const handleToggleScreenShare = async () => {
    if (screenSharing) {
      // Stop screen sharing
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
      }
      setScreenStream(null);
      setScreenSharing(false);
      setScreenBlurred(false);
      
      toast({
        title: "Screen sharing stopped",
        description: "You stopped sharing your screen.",
      });
    } else {
      // Start screen sharing
      try {
        const displayStream = await meshWebRTCManager.getDisplayMedia();
        setScreenStream(displayStream);
        setScreenSharing(true);

        // Handle when user stops sharing via browser UI
        displayStream.getVideoTracks()[0].addEventListener('ended', () => {
          setScreenSharing(false);
          setScreenStream(null);
          setScreenBlurred(false);
          
          toast({
            title: "Screen sharing stopped",
            description: "You stopped sharing your screen.",
          });
        });
      } catch (error) {
        console.error('[Session] Error sharing screen:', error);
        toast({
          title: "Screen share not available",
          description: "Could not start screen sharing. You can try again later.",
          variant: "destructive",
        });
      }
    }
  };

  const handleToggleScreenBlur = () => {
    const newState = !screenBlurred;
    setScreenBlurred(newState);
    
    // Broadcast blur state to all peers via WebRTC data channel
    meshWebRTCManager.setScreenBlurred(newState);
  };

  const handleEndSession = () => {
    // Log session completion
    if (sessionStartRef.current && sessionStatus === 'active') {
      const duration = Math.floor((new Date().getTime() - sessionStartRef.current.getTime()) / 1000);
      completeSessionMutation.mutate({
        sessionId: params.sessionId!,
        duration,
      });
    }

    meshWebRTCManager.close();
    // Note: Don't disconnect sessionClient here - the provider manages connection lifecycle
    
    if (sessionStartRef.current) {
      setSessionStatus('post-session');
    } else {
      setLocation("/");
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatCountdown = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${mins}m ${secs}s`;
    } else if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const getConnectionBadge = () => {
    switch (connectionState) {
      case 'connecting':
        return (
          <Badge variant="secondary" className="gap-1" data-testid="badge-connecting">
            <Loader2 className="h-3 w-3 animate-spin" />
            Connecting
          </Badge>
        );
      case 'connected':
        return (
          <Badge variant="outline" className="gap-1" data-testid="badge-connected">
            <span className="h-2 w-2 rounded-full bg-status-online" />
            Connected
          </Badge>
        );
      case 'disconnected':
        return (
          <Badge variant="destructive" className="gap-1" data-testid="badge-disconnected">
            <span className="h-2 w-2 rounded-full bg-status-offline" />
            Disconnected
          </Badge>
        );
    }
  };

  if (!user) return null;

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Session Not Found</CardTitle>
            <CardDescription>This session doesn't exist or has been deleted.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/calendar")} className="w-full">
              Back to Calendar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Pre-session countdown screen
  if (sessionStatus === 'pre-session') {
    const startTime = new Date(sessionData.startAt);
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl mb-2">{sessionData.title || "Work Session"}</CardTitle>
            <CardDescription className="text-lg">
              {sessionData.sessionType === 'solo' ? '1-on-1 Session' : 'Group Session'} • {sessionData.participantCount}/{sessionData.capacity} joined
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Enhanced Countdown Timer */}
            <div className="text-center p-6 rounded-lg bg-primary/5 border-2 border-primary/20">
              <Clock className="h-12 w-12 mx-auto mb-3 text-primary" />
              <p className="text-sm font-medium text-muted-foreground mb-2">Session starts in</p>
              <p className="text-6xl font-bold mb-3 tracking-tight" data-testid="text-countdown">
                {formatCountdown(countdown)}
              </p>
              <p className="text-sm text-muted-foreground">
                {format(startTime, "EEEE, MMMM d 'at' h:mm a")}
              </p>
            </div>

            {/* Participants with Avatars */}
            <div className="border-t pt-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Participants ({sessionData.participantCount}/{sessionData.capacity})
              </h3>
              {sessionData.participants && sessionData.participants.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {sessionData.participants.map((p: any) => {
                    const displayName = p.firstName && p.lastName 
                      ? `${p.firstName} ${p.lastName}`
                      : p.username || "Anonymous";
                    const initials = p.firstName && p.lastName
                      ? `${p.firstName[0]}${p.lastName[0]}`.toUpperCase()
                      : p.username?.[0]?.toUpperCase() || "?";
                    return (
                      <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={p.profileImageUrl || undefined} />
                          <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{displayName}</span>
                            {p.role === 'host' && <Badge variant="secondary" className="text-xs">Host</Badge>}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <span className="h-1.5 w-1.5 rounded-full bg-status-online" />
                            <span>Ready</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 border rounded-lg bg-muted/30">
                  <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground">
                    Waiting for participants to join...
                  </p>
                </div>
              )}
            </div>

            {sessionData.description && (
              <div className="border-t pt-6">
                <h3 className="font-semibold mb-2">Description</h3>
                <p className="text-sm text-muted-foreground">{sessionData.description}</p>
              </div>
            )}

            <Button 
              onClick={() => setLocation("/calendar")} 
              variant="outline" 
              className="w-full"
              data-testid="button-back-to-calendar"
            >
              Back to Calendar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Session ended screen
  if (sessionStatus === 'ended') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Session Has Ended</CardTitle>
            <CardDescription>
              This session ended at {format(new Date(sessionData.endAt), "h:mm a")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/calendar")} className="w-full">
              Back to Calendar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Post-session summary
  if (sessionStatus === 'post-session') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl mb-2">Session Complete!</CardTitle>
            <CardDescription>Great work staying focused</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center border rounded-lg p-6 bg-muted/30">
              <p className="text-sm text-muted-foreground mb-2">Session Duration</p>
              <p className="text-4xl font-bold" data-testid="text-final-duration">
                {formatDuration(sessionDuration)}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm font-medium">Session Type</span>
                <Badge variant="outline">
                  {sessionData.sessionType === 'solo' ? '1-on-1' : 'Group'}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm font-medium">Participants</span>
                <span className="text-sm">{participants.length + 1}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Button onClick={() => setLocation("/calendar")} className="w-full">
                Back to Calendar
              </Button>
              <Button onClick={() => setLocation("/history")} variant="outline" className="w-full">
                View History
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Active session screen
  return (
    <div className="h-screen w-screen bg-background flex flex-col">
      {/* Top Bar */}
      <header className="h-16 border-b flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <span className="font-mono text-lg font-medium" data-testid="text-session-timer">
            {formatDuration(sessionDuration)}
          </span>
          {getConnectionBadge()}
        </div>

        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium" data-testid="text-participant-count">
            {participants.length + 1} {participants.length === 0 ? "participant" : "participants"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="destructive" 
            size="sm"
            onClick={handleEndSession}
            data-testid="button-end-session"
          >
            <PhoneOff className="mr-1 h-4 w-4" />
            End Session
          </Button>
        </div>
      </header>

      {/* Main Video Area */}
      <main className="flex-1 relative overflow-hidden">
        {connectionState === 'connecting' && participants.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="text-center">
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Connecting to participants...</p>
            </div>
          </div>
        )}

        {connectionState === 'disconnected' && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="text-center">
              <p className="text-lg font-medium mb-2">Session has ended</p>
              <Button onClick={handleEndSession}>View Summary</Button>
            </div>
          </div>
        )}

        <VideoGrid
          participants={participants}
          localStream={localStream}
          localUser={user}
          localAudioEnabled={audioEnabled}
          localVideoEnabled={videoEnabled}
          screenStream={screenStream}
          screenBlurred={screenBlurred}
        />
      </main>

      {/* Bottom Controls */}
      <footer className="h-20 border-t flex items-center justify-center gap-4">
        <div className="relative">
          <Button
            variant={!mediaCapabilities.hasAudio ? "secondary" : audioEnabled ? "outline" : "destructive"}
            size="icon"
            className="h-12 w-12 rounded-full"
            onClick={handleToggleAudio}
            disabled={!mediaCapabilities.hasAudio}
            title={mediaCapabilities.audioError || (audioEnabled ? "Mute" : "Unmute")}
            data-testid="button-toggle-audio"
          >
            {audioEnabled && mediaCapabilities.hasAudio ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </Button>
          {!mediaCapabilities.hasAudio && (
            <span className="absolute -top-1 -right-1 h-3 w-3 bg-destructive rounded-full" title="Microphone unavailable" />
          )}
        </div>

        <div className="relative">
          <Button
            variant={!mediaCapabilities.hasVideo ? "secondary" : videoEnabled ? "outline" : "destructive"}
            size="icon"
            className="h-12 w-12 rounded-full"
            onClick={handleToggleVideo}
            disabled={!mediaCapabilities.hasVideo}
            title={mediaCapabilities.videoError || (videoEnabled ? "Turn off camera" : "Turn on camera")}
            data-testid="button-toggle-video"
          >
            {videoEnabled && mediaCapabilities.hasVideo ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </Button>
          {!mediaCapabilities.hasVideo && (
            <span className="absolute -top-1 -right-1 h-3 w-3 bg-destructive rounded-full" title="Camera unavailable" />
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={screenSharing ? "destructive" : "default"}
            className="px-6 py-3 rounded-lg"
            onClick={handleToggleScreenShare}
            data-testid="button-screen-share"
          >
            {screenSharing ? <MonitorOff className="mr-2 h-5 w-5" /> : <Monitor className="mr-2 h-5 w-5" />}
            {screenSharing ? "Stop Sharing" : "Share Screen"}
          </Button>
          
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-background">
            <Label htmlFor="blur-screen" className="text-sm cursor-pointer flex items-center gap-2">
              {screenBlurred ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              Blur
            </Label>
            <Switch
              id="blur-screen"
              checked={screenBlurred}
              onCheckedChange={handleToggleScreenBlur}
              data-testid="switch-blur-screen"
            />
          </div>
        </div>
      </footer>
    </div>
  );
}
