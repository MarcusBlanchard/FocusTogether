import { useEffect, useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Check
} from "lucide-react";
import { sessionClient, type SessionEvent } from "@/lib/session-client";
import { webrtcManager } from "@/lib/webrtc";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PartnerInfo {
  id: string;
  username: string | null;
  profileImageUrl: string | null;
}

export default function Session() {
  const params = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [partner, setPartner] = useState<PartnerInfo | null>(null);
  const [isFriend, setIsFriend] = useState(false);
  const [friendAdded, setFriendAdded] = useState(false);

  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  const [sessionDuration, setSessionDuration] = useState(0);
  const sessionStartRef = useRef<Date>(new Date());

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  const addFriendMutation = useMutation({
    mutationFn: async (friendId: string) => {
      return apiRequest("POST", "/api/friends", { friendId });
    },
    onSuccess: () => {
      setFriendAdded(true);
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      toast({
        title: "Friend added",
        description: `${partner?.username || "User"} has been added to your friends.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add friend. Please try again.",
        variant: "destructive",
      });
    },
  });

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

    const initSession = async () => {
      try {
        // Get local media
        const localStream = await webrtcManager.getUserMedia();
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }

        // Set up WebRTC callbacks
        webrtcManager.setCallbacks({
          onRemoteStream: (stream) => {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = stream;
            }
            setConnectionState('connected');
          },
          onConnectionStateChange: (state) => {
            if (state === 'connected') {
              setConnectionState('connected');
            } else if (state === 'disconnected' || state === 'failed') {
              setConnectionState('disconnected');
            }
          },
          onIceCandidate: (candidate) => {
            sessionClient.sendSignal(params.sessionId!, 'ice-candidate', candidate);
          },
        });

        // Initialize peer connection
        await webrtcManager.initializePeerConnection();
        webrtcManager.addLocalStream();

        // Create and send offer (first user to connect creates offer)
        const offer = await webrtcManager.createOffer();
        sessionClient.sendSignal(params.sessionId!, 'offer', offer);

        setConnectionState('connected');
      } catch (error) {
        console.error('[Session] Error initializing:', error);
        toast({
          title: "Connection Error",
          description: "Failed to access camera/microphone. Please check permissions.",
          variant: "destructive",
        });
      }
    };

    // Set up session event listener
    const unsubscribe = sessionClient.onEvent((event: SessionEvent) => {
      if (event.type === 'signal' && event.signal) {
        handleSignal(event.signal);
      } else if (event.type === 'partner-disconnected') {
        handlePartnerDisconnect();
      } else if (event.type === 'matched' && event.partner) {
        setPartner(event.partner);
        checkFriendship(event.partner.id);
      }
    });

    // Ensure connected to WebSocket
    if (!sessionClient.isConnected()) {
      sessionClient.connect(user.id);
    }

    initSession();

    return () => {
      unsubscribe();
      webrtcManager.close();
    };
  }, [user, params.sessionId]);

  const handleSignal = async (signal: { type: string; sessionId: string; data: any }) => {
    try {
      if (signal.type === 'offer') {
        const answer = await webrtcManager.handleOffer(signal.data);
        sessionClient.sendSignal(params.sessionId!, 'answer', answer);
      } else if (signal.type === 'answer') {
        await webrtcManager.handleAnswer(signal.data);
      } else if (signal.type === 'ice-candidate') {
        await webrtcManager.handleIceCandidate(signal.data);
      }
    } catch (error) {
      console.error('[Session] Error handling signal:', error);
    }
  };

  const handlePartnerDisconnect = () => {
    setConnectionState('disconnected');
    toast({
      title: "Partner disconnected",
      description: "Your session partner has left the call.",
    });
  };

  const checkFriendship = async (partnerId: string) => {
    try {
      const response = await fetch(`/api/friends/${partnerId}/check`);
      const data = await response.json();
      setIsFriend(data.isFriend);
    } catch (error) {
      console.error('Error checking friendship:', error);
    }
  };

  const handleToggleAudio = () => {
    const newState = !audioEnabled;
    setAudioEnabled(newState);
    webrtcManager.toggleAudio(newState);
  };

  const handleToggleVideo = () => {
    const newState = !videoEnabled;
    setVideoEnabled(newState);
    webrtcManager.toggleVideo(newState);
  };

  const handleToggleScreenShare = async () => {
    if (screenSharing) {
      webrtcManager.stopScreenShare();
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = null;
      }
      setScreenSharing(false);
    } else {
      try {
        const screenStream = await webrtcManager.getDisplayMedia();
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = screenStream;
        }
        setScreenSharing(true);

        // Handle when user stops sharing via browser UI
        screenStream.getVideoTracks()[0].onended = () => {
          setScreenSharing(false);
          if (screenVideoRef.current) {
            screenVideoRef.current.srcObject = null;
          }
        };
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
    webrtcManager.close();
    sessionClient.disconnect();
    setLocation("/");
  };

  const handleAddFriend = () => {
    if (partner) {
      addFriendMutation.mutate(partner.id);
    }
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

  const partnerInitials = partner?.username?.[0]?.toUpperCase() || "?";

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
          {partner && (
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={partner.profileImageUrl || undefined} />
                <AvatarFallback>{partnerInitials}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium" data-testid="text-partner-name">
                {partner.username || "Partner"}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {partner && !isFriend && !friendAdded && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleAddFriend}
              disabled={addFriendMutation.isPending}
              data-testid="button-add-friend"
            >
              {addFriendMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <UserPlus className="mr-1 h-4 w-4" />
                  Add Friend
                </>
              )}
            </Button>
          )}
          {friendAdded && (
            <Badge variant="secondary" className="gap-1">
              <Check className="h-3 w-3" />
              Friend Added
            </Badge>
          )}
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
        {/* Remote Video (or Screen Share) */}
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          {screenSharing ? (
            <video 
              ref={screenVideoRef}
              autoPlay 
              playsInline
              className="max-w-full max-h-full object-contain"
              data-testid="video-screen-share"
            />
          ) : (
            <video 
              ref={remoteVideoRef}
              autoPlay 
              playsInline
              className="w-full h-full object-cover"
              data-testid="video-remote"
            />
          )}
          
          {connectionState === 'connecting' && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <div className="text-center">
                <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Connecting to partner...</p>
              </div>
            </div>
          )}

          {connectionState === 'disconnected' && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <div className="text-center">
                <p className="text-lg font-medium mb-2">Partner has disconnected</p>
                <Button onClick={handleEndSession}>Return Home</Button>
              </div>
            </div>
          )}
        </div>

        {/* Local Video (Picture-in-Picture) */}
        <div className="absolute bottom-4 right-4 w-48 h-36 rounded-lg shadow-xl overflow-hidden bg-muted">
          <video 
            ref={localVideoRef}
            autoPlay 
            playsInline
            muted
            className="w-full h-full object-cover"
            data-testid="video-local"
          />
          {!videoEnabled && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <VideoOff className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Side videos when screen sharing */}
        {screenSharing && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
            <div className="w-40 aspect-video rounded-lg shadow-lg overflow-hidden bg-muted">
              <video 
                ref={remoteVideoRef}
                autoPlay 
                playsInline
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}
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
