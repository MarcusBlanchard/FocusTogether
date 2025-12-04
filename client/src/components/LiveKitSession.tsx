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
  const gridCols = participantCount <= 1 ? 1 : participantCount <= 4 ? 2 : 3;

  return (
    <div className="flex-1 p-4 overflow-auto">
      {screenShareTracks.length > 0 && (
        <div className="mb-4">
          {screenShareTracks.map((trackRef) => (
            <div key={trackRef.publication?.trackSid || trackRef.participant?.identity} className="relative bg-muted rounded-lg overflow-hidden aspect-video max-h-[60vh]">
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
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
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
            <div key={identity} className="relative bg-muted rounded-lg overflow-hidden aspect-video">
              {isCameraOn && cameraTrack ? (
                <VideoTrack
                  trackRef={cameraTrack}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted">
                  <Avatar className="h-20 w-20">
                    <AvatarFallback className="text-2xl">
                      {displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}
              
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                <span className="bg-background/80 px-2 py-1 rounded text-sm font-medium">
                  {isLocal ? "You" : displayName}
                </span>
                <div className="flex gap-1">
                  {isMuted && (
                    <span className="bg-destructive/80 p-1 rounded">
                      <MicOff className="h-3 w-3 text-white" />
                    </span>
                  )}
                  {!isCameraOn && (
                    <span className="bg-destructive/80 p-1 rounded">
                      <VideoOff className="h-3 w-3 text-white" />
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
  const { toast } = useToast();

  const isCameraEnabled = localParticipant?.isCameraEnabled ?? false;
  const isMicEnabled = localParticipant?.isMicrophoneEnabled ?? false;

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
    <footer className="h-20 border-t flex items-center justify-center gap-4">
      <Button
        variant={isMicEnabled ? "outline" : "destructive"}
        size="icon"
        className="h-12 w-12 rounded-full"
        onClick={handleToggleMic}
        data-testid="button-toggle-audio"
      >
        {isMicEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </Button>

      <Button
        variant={isCameraEnabled ? "outline" : "destructive"}
        size="icon"
        className="h-12 w-12 rounded-full"
        onClick={handleToggleCamera}
        data-testid="button-toggle-video"
      >
        {isCameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
      </Button>

      <div className="flex items-center gap-2">
        <Button
          variant={isScreenSharing ? "destructive" : "default"}
          className="px-6 py-3 rounded-lg"
          onClick={handleToggleScreenShare}
          data-testid="button-screen-share"
        >
          {isScreenSharing ? <MonitorOff className="mr-2 h-5 w-5" /> : <Monitor className="mr-2 h-5 w-5" />}
          {isScreenSharing ? "Stop Sharing" : "Share Screen"}
        </Button>
        
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-background">
          <Label htmlFor="blur-screen" className="text-sm cursor-pointer flex items-center gap-2">
            {screenBlurred ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            Blur
          </Label>
          <Switch
            id="blur-screen"
            checked={screenBlurred}
            onCheckedChange={onToggleBlur}
            data-testid="switch-blur-screen"
          />
        </div>
      </div>

      <Button
        variant="destructive"
        className="px-6 py-3 rounded-lg"
        onClick={onLeave}
        data-testid="button-end-session"
      >
        <PhoneOff className="mr-2 h-5 w-5" />
        End Session
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
