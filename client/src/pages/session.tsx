import { useEffect, useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Monitor, 
  MonitorOff,
  PhoneOff,
  Loader2,
  UserPlus,
  Users
} from "lucide-react";
import { sessionClient, type SessionEvent, type ParticipantInfo } from "@/lib/session-client";
import { meshWebRTCManager } from "@/lib/webrtc-mesh";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { VideoGrid, type VideoParticipant } from "@/components/VideoGrid";

export default function Session() {
  const params = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [participants, setParticipants] = useState<VideoParticipant[]>([]);

  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const [sessionDuration, setSessionDuration] = useState(0);
  const sessionStartRef = useRef<Date>(new Date());

  // Timer effect
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((new Date().getTime() - sessionStartRef.current.getTime()) / 1000);
      setSessionDuration(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Initialize WebRTC and session
  useEffect(() => {
    if (!user || !params.sessionId) return;

    let unsubscribe: (() => void) | null = null;

    const waitForConnection = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (sessionClient.isConnected() && sessionClient.getUserId()) {
          resolve();
          return;
        }

        const checkInterval = setInterval(() => {
          if (sessionClient.isConnected() && sessionClient.getUserId()) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);

        // Reject on timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          if (!sessionClient.isConnected() || !sessionClient.getUserId()) {
            reject(new Error('Failed to establish WebSocket connection'));
          } else {
            resolve();
          }
        }, 10000);
      });
    };

    const initSession = async () => {
      try {
        // Ensure session client is connected first
        if (!sessionClient.isConnected()) {
          sessionClient.connect(user.id);
        }

        // Wait for actual connection and userId to be available
        await waitForConnection();

        // Get local media
        const stream = await meshWebRTCManager.getUserMedia();
        setLocalStream(stream);

        // Set up WebRTC callbacks
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
          onSignal: (signal) => {
            // Send signal via session client
            const userId = sessionClient.getUserId();
            if (!userId) {
              console.error('[Session] Cannot send signal - user ID not available');
              return;
            }
            sessionClient.sendSignal(
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
              // Remove participant stream
              setParticipants(prev => prev.map(p => 
                p.userId === peerId ? { ...p, stream: null } : p
              ));
            }
          },
        });

        meshWebRTCManager.setSessionId(params.sessionId!);
        meshWebRTCManager.setMyUserId(user.id);

        // Set up session event listener AFTER initialization
        unsubscribe = sessionClient.onEvent(async (event: SessionEvent) => {
          if (event.type === 'signal' && event.signal) {
            await handleSignal(event.signal);
          } else if (event.type === 'participant-joined' && event.participant) {
            // Ignore self
            if (event.participant.userId !== user.id) {
              await handleParticipantJoined(event.participant);
            }
          } else if (event.type === 'participant-left' && event.participant) {
            // Ignore self
            if (event.participant.userId !== user.id) {
              handleParticipantLeft(event.participant);
            }
          } else if (event.type === 'room-joined' && event.participants) {
            await handleRoomJoined(event.participants);
          } else if (event.type === 'partner-disconnected') {
            handlePartnerDisconnect();
          } else if (event.type === 'matched' && event.partner) {
            await handleMatched(event.partner);
          }
        });

        console.log('[Session] Initialization complete');
      } catch (error) {
        console.error('[Session] Error initializing:', error);
        toast({
          title: "Connection Error",
          description: "Failed to access camera/microphone. Please check permissions.",
          variant: "destructive",
        });
      }
    };

    initSession();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      meshWebRTCManager.close();
    };
  }, [user, params.sessionId]);

  const handleSignal = async (signal: { type: string; sessionId: string; senderId: string; targetId?: string; data: any }) => {
    try {
      const peerId = signal.senderId;
      
      if (signal.type === 'offer') {
        const answer = await meshWebRTCManager.handleOffer(peerId, signal.data);
        const userId = sessionClient.getUserId();
        if (userId) {
          sessionClient.sendSignal(params.sessionId!, 'answer', answer, userId, peerId);
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
    if (!participantId) {
      console.error('[Session] Matched partner has no userId:', partner);
      return;
    }

    console.log('[Session] Matched with partner:', partner);

    // Check if we already have a connection to this participant
    const existingConnection = meshWebRTCManager.getPeerConnection(participantId);
    if (existingConnection) {
      console.log('[Session] Already have connection to', participantId);
      return;
    }

    setParticipants([{
      userId: participantId,
      username: partner.username,
      profileImageUrl: partner.profileImageUrl,
      stream: null,
      audioEnabled: true,
      videoEnabled: true,
    }]);

    // Role-based signaling: lower userId initiates offer to avoid glare
    const userId = sessionClient.getUserId();
    if (!userId) {
      console.error('[Session] Cannot initiate offer - userId not available');
      return;
    }

    const shouldInitiate = userId < participantId;
    if (shouldInitiate) {
      try {
        const offer = await meshWebRTCManager.createOffer(participantId);
        sessionClient.sendSignal(params.sessionId!, 'offer', offer, userId, participantId);
      } catch (error) {
        console.error('[Session] Error creating offer:', error);
      }
    } else {
      console.log('[Session] Waiting for offer from', participantId);
    }
  };

  const handleParticipantJoined = async (participant: ParticipantInfo) => {
    if (!participant.userId) {
      console.error('[Session] Participant joined without userId:', participant);
      return;
    }

    console.log('[Session] Participant joined:', participant);

    // Check if we already have a connection to this participant
    const existingConnection = meshWebRTCManager.getPeerConnection(participant.userId);
    if (existingConnection) {
      console.log('[Session] Already have connection to', participant.userId);
      return;
    }

    setParticipants(prev => [...prev, {
      userId: participant.userId,
      username: participant.username,
      profileImageUrl: participant.profileImageUrl,
      stream: null,
      audioEnabled: true,
      videoEnabled: true,
    }]);

    // Role-based signaling: lower userId initiates offer
    const userId = sessionClient.getUserId();
    if (!userId) {
      console.error('[Session] Cannot initiate offer - userId not available');
      return;
    }

    const shouldInitiate = userId < participant.userId;
    if (shouldInitiate) {
      try {
        const offer = await meshWebRTCManager.createOffer(participant.userId);
        sessionClient.sendSignal(params.sessionId!, 'offer', offer, userId, participant.userId);
      } catch (error) {
        console.error('[Session] Error creating offer for new participant:', error);
      }
    } else {
      console.log('[Session] Waiting for offer from', participant.userId);
    }
  };

  const handleParticipantLeft = (participant: ParticipantInfo) => {
    console.log('[Session] Participant left:', participant);
    setParticipants(prev => prev.filter(p => p.userId !== participant.userId));
    meshWebRTCManager.removePeer(participant.userId);
    
    toast({
      title: "Participant left",
      description: `${participant.username || "A participant"} has left the session.`,
    });
  };

  const handleRoomJoined = async (participants: ParticipantInfo[]) => {
    console.log('[Session] Joined room with participants:', participants);
    
    const userId = sessionClient.getUserId();
    if (!userId) {
      console.error('[Session] Cannot join room - userId not available');
      return;
    }
    
    // Add all existing participants (excluding self)
    const otherParticipants = participants.filter(p => p.userId && p.userId !== userId);
    setParticipants(otherParticipants.map(p => ({
      userId: p.userId,
      username: p.username,
      profileImageUrl: p.profileImageUrl,
      stream: null,
      audioEnabled: true,
      videoEnabled: true,
    })));

    // Create offers only to participants with higher userIds (role-based to avoid glare)
    for (const participant of otherParticipants) {
      if (!participant.userId) continue;

      const shouldInitiate = userId < participant.userId;
      if (shouldInitiate) {
        try {
          const offer = await meshWebRTCManager.createOffer(participant.userId);
          sessionClient.sendSignal(params.sessionId!, 'offer', offer, userId, participant.userId);
        } catch (error) {
          console.error('[Session] Error creating offer for participant:', error);
        }
      } else {
        console.log('[Session] Waiting for offer from', participant.userId);
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
      meshWebRTCManager.stopScreenShare();
      setScreenSharing(false);
    } else {
      try {
        await meshWebRTCManager.getDisplayMedia();
        setScreenSharing(true);
      } catch (error) {
        console.error('[Session] Error sharing screen:', error);
        toast({
          title: "Screen Share Error",
          description: "Failed to share screen. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  const handleEndSession = () => {
    meshWebRTCManager.close();
    sessionClient.disconnect();
    setLocation("/");
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getConnectionBadge = () => {
    switch (connectionState) {
      case 'connecting':
        return (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Connecting
          </Badge>
        );
      case 'connected':
        return (
          <Badge variant="outline" className="gap-1">
            <span className="h-2 w-2 rounded-full bg-status-online" />
            Connected
          </Badge>
        );
      case 'disconnected':
        return (
          <Badge variant="destructive" className="gap-1">
            <span className="h-2 w-2 rounded-full bg-status-offline" />
            Disconnected
          </Badge>
        );
    }
  };

  if (!user) return null;

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
              <Button onClick={handleEndSession}>Return Home</Button>
            </div>
          </div>
        )}

        <VideoGrid
          participants={participants}
          localStream={localStream}
          localUser={user}
          localAudioEnabled={audioEnabled}
          localVideoEnabled={videoEnabled}
        />
      </main>

      {/* Bottom Controls */}
      <footer className="h-20 border-t flex items-center justify-center gap-4">
        <Button
          variant={audioEnabled ? "outline" : "destructive"}
          size="icon"
          className="h-12 w-12 rounded-full"
          onClick={handleToggleAudio}
          data-testid="button-toggle-audio"
        >
          {audioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>

        <Button
          variant={videoEnabled ? "outline" : "destructive"}
          size="icon"
          className="h-12 w-12 rounded-full"
          onClick={handleToggleVideo}
          data-testid="button-toggle-video"
        >
          {videoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </Button>

        <Button
          variant={screenSharing ? "default" : "outline"}
          className="px-6 py-3 rounded-lg"
          onClick={handleToggleScreenShare}
          data-testid="button-toggle-screen"
        >
          {screenSharing ? (
            <>
              <MonitorOff className="mr-2 h-5 w-5" />
              Stop Sharing
            </>
          ) : (
            <>
              <Monitor className="mr-2 h-5 w-5" />
              Share Screen
            </>
          )}
        </Button>
      </footer>
    </div>
  );
}
