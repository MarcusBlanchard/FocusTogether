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
  onLeave: () => void;
  localUser: {
    id: string;
    username?: string | null;
    firstName?: string | null;
    profileImageUrl?: string | null;
  };
}

function VideoGrid() {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  
  const cameraTracks = useTracks([Track.Source.Camera]);
  const screenShareTracks = useTracks([Track.Source.ScreenShare]);

  const allParticipants = [localParticipant, ...remoteParticipants].filter(Boolean);
  const participantCount = allParticipants.length;
  
  const hasScreenShare = screenShareTracks.length > 0;

  return (
    <div className="flex-1 flex flex-col p-2 gap-2 min-h-0">
      {hasScreenShare && (
        <div className="flex-1 min-h-0">
          {screenShareTracks.map((trackRef) => (
            <div key={trackRef.publication?.trackSid || trackRef.participant?.identity} className="relative bg-muted rounded-lg overflow-hidden h-full">
              <VideoTrack trackRef={trackRef} className="w-full h-full object-contain" />
              <div className="absolute bottom-2 left-2">
                <span className="bg-background/80 px-2 py-1 rounded text-sm font-medium">
                  {trackRef.participant?.name || trackRef.participant?.identity || "Screen Share"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <div 
        className={`${hasScreenShare ? 'h-24 flex gap-2 flex-shrink-0' : 'flex-1 grid gap-2 min-h-0'}`}
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
            <div key={identity} className={`relative bg-muted rounded-lg overflow-hidden ${hasScreenShare ? 'w-32 h-24' : ''}`}>
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
}: { 
  onLeave: () => void;
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
      <VideoGrid />
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
  onLeave,
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
      onConnected={handleConnected}
      onError={handleError}
      data-lk-theme="default"
      className="h-full"
    >
      {isConnecting ? (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Connecting to video session...</span>
        </div>
      ) : (
        <RoomContent onLeave={onLeave} />
      )}
    </LiveKitRoom>
  );
}
