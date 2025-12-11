import { useEffect, useState, useCallback } from "react";
import {
  LiveKitRoom,
  VideoTrack,
  AudioTrack,
  useLocalParticipant,
  useRemoteParticipants,
  useTracks,
  useRoomContext,
  RoomAudioRenderer,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track, RoomEvent, RemoteParticipant } from "livekit-client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Monitor,
  MonitorOff,
  PhoneOff,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LiveKitSessionProps {
  token: string;
  serverUrl: string;
  sessionId: string;
  totalParticipants: number;
  onLeave: () => void;
  onActiveCountChange?: (count: number) => void;
  localUser: {
    id: string;
    username?: string | null;
    firstName?: string | null;
    profileImageUrl?: string | null;
  };
}

interface FocusedTrack {
  type: 'camera' | 'screen';
  identity: string;
}

function VideoGrid({ onActiveCountChange }: { onActiveCountChange?: (count: number) => void }) {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const [focusedTrack, setFocusedTrack] = useState<FocusedTrack | null>(null);
  
  const cameraTracks = useTracks([Track.Source.Camera]);
  const screenShareTracks = useTracks([Track.Source.ScreenShare]);

  const allParticipants = [localParticipant, ...remoteParticipants].filter(Boolean);
  const participantCount = allParticipants.length;
  
  // Report active participant count changes
  useEffect(() => {
    onActiveCountChange?.(participantCount);
  }, [participantCount, onActiveCountChange]);
  
  const hasScreenShare = screenShareTracks.length > 0;
  
  // Handle clicking on a video to focus it
  const handleFocusClick = (type: 'camera' | 'screen', identity: string) => {
    // Guard against empty identity
    if (!identity) return;
    
    if (focusedTrack?.type === type && focusedTrack?.identity === identity) {
      // Clicking focused track again unfocuses
      setFocusedTrack(null);
    } else {
      setFocusedTrack({ type, identity });
    }
  };

  // Find the focused track reference
  const focusedCameraTrack = focusedTrack?.type === 'camera' 
    ? cameraTracks.find(t => t.participant?.identity === focusedTrack.identity)
    : null;
  const focusedScreenTrack = focusedTrack?.type === 'screen'
    ? screenShareTracks.find(t => t.participant?.identity === focusedTrack.identity)
    : null;
  const focusedParticipant = focusedTrack
    ? allParticipants.find(p => p?.identity === focusedTrack.identity)
    : null;

  // If something is focused, render focus view
  if (focusedTrack && (focusedCameraTrack || focusedScreenTrack)) {
    const displayName = focusedParticipant?.name || focusedTrack.identity?.slice(0, 8) || "Participant";
    const isLocal = focusedParticipant === localParticipant;
    
    return (
      <div className="flex-1 flex flex-col p-2 gap-2 min-h-0">
        {/* Focused main view */}
        <div 
          className="flex-1 min-h-0 relative bg-muted rounded-lg overflow-hidden cursor-pointer"
          onClick={() => setFocusedTrack(null)}
          data-testid="focused-video"
        >
          {focusedTrack.type === 'screen' && focusedScreenTrack ? (
            <VideoTrack trackRef={focusedScreenTrack} className="w-full h-full object-contain" />
          ) : focusedCameraTrack ? (
            <VideoTrack 
              trackRef={focusedCameraTrack} 
              className="w-full h-full object-contain"
              style={{ transform: 'scaleX(-1)' }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Avatar className="h-24 w-24">
                <AvatarFallback className="text-4xl">
                  {displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
          )}
          <div className="absolute bottom-2 left-2 flex items-center gap-2">
            <span className="bg-background/80 px-2 py-1 rounded text-sm font-medium">
              {isLocal ? "You" : displayName}
              {focusedTrack.type === 'screen' && " (Screen)"}
            </span>
            <span className="bg-primary/80 text-primary-foreground px-2 py-1 rounded text-xs">
              Click to unfocus
            </span>
          </div>
        </div>
        
        {/* Thumbnails row */}
        <div className="h-20 flex gap-2 flex-shrink-0 overflow-x-auto pb-1">
          {/* Screen share thumbnails */}
          {screenShareTracks.map((trackRef) => {
            const identity = trackRef.participant?.identity || '';
            const isFocused = focusedTrack.type === 'screen' && focusedTrack.identity === identity;
            if (isFocused) return null;
            
            return (
              <div 
                key={`screen-${identity}`}
                className="relative bg-muted rounded-lg overflow-hidden w-28 h-20 flex-shrink-0 cursor-pointer ring-2 ring-transparent hover:ring-primary"
                onClick={() => handleFocusClick('screen', identity)}
                data-testid={`thumbnail-screen-${identity}`}
              >
                <VideoTrack trackRef={trackRef} className="w-full h-full object-cover" />
                <div className="absolute bottom-1 left-1">
                  <span className="bg-background/80 px-1 py-0.5 rounded text-xs">
                    {trackRef.participant?.name?.slice(0, 6) || 'Screen'}
                  </span>
                </div>
              </div>
            );
          })}
          
          {/* Camera thumbnails */}
          {allParticipants.map((participant) => {
            if (!participant) return null;
            const identity = participant.identity;
            const isFocused = focusedTrack.type === 'camera' && focusedTrack.identity === identity;
            if (isFocused) return null;
            
            const isLocal = participant === localParticipant;
            const displayName = participant.name || identity?.slice(0, 8) || "Participant";
            const cameraTrack = cameraTracks.find(t => t.participant?.identity === identity);
            const isCameraOn = cameraTrack?.publication?.track && !cameraTrack.publication.isMuted;
            const isMuted = !participant.isMicrophoneEnabled;

            return (
              <div 
                key={`camera-${identity}`}
                className="relative bg-muted rounded-lg overflow-hidden w-28 h-20 flex-shrink-0 cursor-pointer ring-2 ring-transparent hover:ring-primary"
                onClick={() => handleFocusClick('camera', identity)}
                data-testid={`thumbnail-camera-${identity}`}
              >
                {isCameraOn && cameraTrack ? (
                  <VideoTrack
                    trackRef={cameraTrack}
                    className="w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-sm">
                        {displayName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}
                <div className="absolute bottom-0.5 left-0.5 right-0.5 flex items-center justify-between">
                  <span className="bg-background/80 px-1 py-0.5 rounded text-xs truncate max-w-[60%]">
                    {isLocal ? "You" : displayName.slice(0, 6)}
                  </span>
                  <div className="flex gap-0.5">
                    {isMuted && <MicOff className="h-2.5 w-2.5 text-destructive" />}
                    {!isCameraOn && <VideoOff className="h-2.5 w-2.5 text-destructive" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Default grid view (no focus)
  return (
    <div className="flex-1 flex flex-col p-2 gap-2 min-h-0">
      {hasScreenShare && (
        <div className="flex-1 min-h-0">
          {screenShareTracks.map((trackRef) => (
            <div 
              key={trackRef.publication?.trackSid || trackRef.participant?.identity} 
              className="relative bg-muted rounded-lg overflow-hidden h-full cursor-pointer"
              onClick={() => trackRef.participant?.identity && handleFocusClick('screen', trackRef.participant.identity)}
              data-testid={`video-screen-${trackRef.participant?.identity}`}
            >
              <VideoTrack trackRef={trackRef} className="w-full h-full object-contain" />
              <div className="absolute bottom-2 left-2 flex items-center gap-2">
                <span className="bg-background/80 px-2 py-1 rounded text-sm font-medium">
                  {trackRef.participant?.name || trackRef.participant?.identity || "Screen Share"}
                </span>
                <span className="bg-muted-foreground/50 text-xs px-1.5 py-0.5 rounded">
                  Tap to focus
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <div 
        className={`${hasScreenShare ? 'h-24 flex gap-2 flex-shrink-0 overflow-x-auto' : 'flex-1 grid gap-2 min-h-0'}`}
        style={!hasScreenShare ? { 
          gridTemplateColumns: participantCount <= 1 ? '1fr' : participantCount <= 2 ? 'repeat(2, 1fr)' : 'repeat(2, 1fr)',
          gridTemplateRows: participantCount <= 2 ? '1fr' : 'repeat(2, 1fr)'
        } : undefined}
      >
        {allParticipants.map((participant) => {
          if (!participant) return null;
          
          const isLocal = participant === localParticipant;
          const identity = participant.identity;
          const displayName = participant.name || identity?.slice(0, 8) || "Participant";
          
          const cameraTrack = cameraTracks.find(t => t.participant?.identity === identity);
          const isCameraOn = cameraTrack?.publication?.track && !cameraTrack.publication.isMuted;
          const isMuted = !participant.isMicrophoneEnabled;

          return (
            <div 
              key={identity} 
              className={`relative bg-muted rounded-lg overflow-hidden cursor-pointer ${hasScreenShare ? 'w-32 h-24 flex-shrink-0' : ''}`}
              onClick={() => identity && handleFocusClick('camera', identity)}
              data-testid={`video-camera-${identity}`}
            >
              {isCameraOn && cameraTrack ? (
                <VideoTrack
                  trackRef={cameraTrack}
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted">
                  <Avatar className={hasScreenShare ? "h-10 w-10" : "h-16 w-16"}>
                    <AvatarFallback className={hasScreenShare ? "text-lg" : "text-xl"}>
                      {displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}
              
              <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
                <span className="bg-background/80 px-1.5 py-0.5 rounded text-xs font-medium truncate max-w-[70%]">
                  {isLocal ? "You" : displayName}
                </span>
                <div className="flex gap-0.5">
                  {isMuted && (
                    <span className="bg-destructive/80 p-0.5 rounded">
                      <MicOff className="h-2.5 w-2.5 text-white" />
                    </span>
                  )}
                  {!isCameraOn && (
                    <span className="bg-destructive/80 p-0.5 rounded">
                      <VideoOff className="h-2.5 w-2.5 text-white" />
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SessionControls({ 
  onLeave,
  screenBlurred,
  onToggleBlur,
}: { 
  onLeave: () => void;
  screenBlurred: boolean;
  onToggleBlur: () => void;
}) {
  const { localParticipant } = useLocalParticipant();
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [supportsScreenShare, setSupportsScreenShare] = useState(false);
  const { toast } = useToast();

  const isCameraEnabled = localParticipant?.isCameraEnabled ?? false;
  const isMicEnabled = localParticipant?.isMicrophoneEnabled ?? false;

  // Check if screen sharing is supported (not available on most mobile browsers)
  useEffect(() => {
    const checkScreenShareSupport = () => {
      const hasGetDisplayMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
      // Also check if it's likely a mobile device where screen share usually fails
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setSupportsScreenShare(hasGetDisplayMedia && !isMobile);
    };
    checkScreenShareSupport();
  }, []);

  const handleToggleCamera = async () => {
    try {
      await localParticipant?.setCameraEnabled(!isCameraEnabled);
    } catch (error) {
      console.error('[LiveKit] Error toggling camera:', error);
      toast({
        title: "Camera Error",
        description: "Failed to toggle camera",
        variant: "destructive",
      });
    }
  };

  const handleToggleMic = async () => {
    try {
      await localParticipant?.setMicrophoneEnabled(!isMicEnabled);
    } catch (error) {
      console.error('[LiveKit] Error toggling microphone:', error);
      toast({
        title: "Microphone Error",
        description: "Failed to toggle microphone",
        variant: "destructive",
      });
    }
  };

  const handleToggleScreenShare = async () => {
    try {
      if (isScreenSharing) {
        await localParticipant?.setScreenShareEnabled(false);
        setIsScreenSharing(false);
      } else {
        await localParticipant?.setScreenShareEnabled(true);
        setIsScreenSharing(true);
      }
    } catch (error) {
      console.error('[LiveKit] Error toggling screen share:', error);
      setIsScreenSharing(false);
      toast({
        title: "Screen Share Error",
        description: "Failed to toggle screen sharing",
        variant: "destructive",
      });
    }
  };

  return (
    <footer className="flex-shrink-0 py-3 px-2 border-t flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
      <Button
        variant={isMicEnabled ? "outline" : "destructive"}
        size="icon"
        className="h-10 w-10 sm:h-12 sm:w-12 rounded-full"
        onClick={handleToggleMic}
        data-testid="button-toggle-audio"
      >
        {isMicEnabled ? <Mic className="h-4 w-4 sm:h-5 sm:w-5" /> : <MicOff className="h-4 w-4 sm:h-5 sm:w-5" />}
      </Button>

      <Button
        variant={isCameraEnabled ? "outline" : "destructive"}
        size="icon"
        className="h-10 w-10 sm:h-12 sm:w-12 rounded-full"
        onClick={handleToggleCamera}
        data-testid="button-toggle-video"
      >
        {isCameraEnabled ? <Video className="h-4 w-4 sm:h-5 sm:w-5" /> : <VideoOff className="h-4 w-4 sm:h-5 sm:w-5" />}
      </Button>

      <div className="flex items-center gap-2">
        {supportsScreenShare ? (
          <>
            <Button
              variant={isScreenSharing ? "destructive" : "default"}
              size="sm"
              onClick={handleToggleScreenShare}
              data-testid="button-screen-share"
            >
              {isScreenSharing ? <MonitorOff className="mr-1.5 h-4 w-4" /> : <Monitor className="mr-1.5 h-4 w-4" />}
              <span className="hidden sm:inline">{isScreenSharing ? "Stop" : "Share"}</span>
            </Button>
            
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md border bg-background">
              <Label htmlFor="blur-screen" className="text-xs cursor-pointer flex items-center gap-1">
                {screenBlurred ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                Blur
              </Label>
              <Switch
                id="blur-screen"
                checked={screenBlurred}
                onCheckedChange={onToggleBlur}
                className="scale-75"
                data-testid="switch-blur-screen"
              />
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-muted text-muted-foreground">
            <Monitor className="h-4 w-4 opacity-50" />
            <span className="text-xs">Screen sharing not supported on this device</span>
          </div>
        )}
      </div>

      <Button
        variant="destructive"
        size="sm"
        onClick={onLeave}
        data-testid="button-end-session"
      >
        <PhoneOff className="mr-1.5 h-4 w-4" />
        <span className="hidden sm:inline">End</span>
      </Button>
    </footer>
  );
}

function RoomContent({ 
  onLeave,
  onActiveCountChange,
}: { 
  onLeave: () => void;
  onActiveCountChange?: (count: number) => void;
}) {
  const room = useRoomContext();
  const [screenBlurred, setScreenBlurred] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const handleDisconnect = () => {
      toast({
        title: "Disconnected",
        description: "You have been disconnected from the session",
        variant: "destructive",
      });
    };

    const handleParticipantConnected = (participant: RemoteParticipant) => {
      toast({
        title: "Participant Joined",
        description: `${participant.name || participant.identity} joined the session`,
      });
    };

    const handleParticipantDisconnected = (participant: RemoteParticipant) => {
      toast({
        title: "Participant Left",
        description: `${participant.name || participant.identity} left the session`,
      });
    };

    room.on(RoomEvent.Disconnected, handleDisconnect);
    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);

    return () => {
      room.off(RoomEvent.Disconnected, handleDisconnect);
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
    };
  }, [room, toast]);

  return (
    <div className="flex flex-col h-full">
      <RoomAudioRenderer />
      <VideoGrid onActiveCountChange={onActiveCountChange} />
      <SessionControls 
        onLeave={onLeave}
        screenBlurred={screenBlurred}
        onToggleBlur={() => setScreenBlurred(!screenBlurred)}
      />
    </div>
  );
}

export function LiveKitSession({ 
  token, 
  serverUrl, 
  sessionId,
  totalParticipants,
  onLeave,
  onActiveCountChange,
  localUser,
}: LiveKitSessionProps) {
  const [isConnecting, setIsConnecting] = useState(true);
  const { toast } = useToast();

  const handleConnected = useCallback(() => {
    setIsConnecting(false);
    console.log('[LiveKit] Connected to room');
  }, []);

  const handleError = useCallback((error: Error) => {
    console.error('[LiveKit] Room error:', error);
    toast({
      title: "Connection Error",
      description: error.message || "Failed to connect to video session",
      variant: "destructive",
    });
  }, [toast]);

  if (!token || !serverUrl) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading video session...</span>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={true}
      video={true}
      audio={true}
      options={{
        adaptiveStream: false,
      }}
      onConnected={handleConnected}
      onError={handleError}
      data-lk-theme="default"
      className="h-full"
    >
      {isConnecting ? (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <div className="flex items-center">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Connecting to video session...</span>
          </div>
          <Button
            variant="destructive"
            onClick={onLeave}
            data-testid="button-cancel-connecting"
          >
            <PhoneOff className="mr-2 h-4 w-4" />
            Cancel
          </Button>
        </div>
      ) : (
        <RoomContent onLeave={onLeave} onActiveCountChange={onActiveCountChange} />
      )}
    </LiveKitRoom>
  );
}
