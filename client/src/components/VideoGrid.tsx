import { useRef, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VideoOff, MicOff } from "lucide-react";
import { ParticipantInfo } from "@/lib/session-client";

export interface VideoParticipant extends ParticipantInfo {
  stream: MediaStream | null;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
}

interface VideoGridProps {
  participants: VideoParticipant[];
  localStream: MediaStream | null;
  localUser: {
    id: string;
    username: string | null;
    profileImageUrl: string | null;
  };
  localAudioEnabled: boolean;
  localVideoEnabled: boolean;
  screenStream?: MediaStream | null;
  screenBlurred?: boolean;
}

export function VideoGrid({ 
  participants, 
  localStream, 
  localUser, 
  localAudioEnabled, 
  localVideoEnabled,
  screenStream,
  screenBlurred 
}: VideoGridProps) {
  const totalParticipants = participants.length + 1; // +1 for local user

  const getGridClass = () => {
    if (totalParticipants === 1) return "grid-cols-1";
    if (totalParticipants === 2) return "grid-cols-2";
    if (totalParticipants <= 4) return "grid-cols-2";
    if (totalParticipants <= 6) return "grid-cols-3";
    return "grid-cols-4";
  };

  return (
    <div className="h-full w-full relative">
      {/* Screen Share Display (when active) */}
      {screenStream && (
        <div className="absolute inset-0 bg-background">
          <ScreenShareTile stream={screenStream} blurred={screenBlurred} />
        </div>
      )}

      {/* Video Grid - positioned at bottom right when screen sharing */}
      <div 
        className={
          screenStream
            ? "absolute bottom-4 right-4 grid grid-cols-2 gap-2 max-w-md"
            : `grid ${getGridClass()} gap-2 h-full w-full p-4`
        }
      >
        {/* Local video */}
        <VideoTile
          stream={localStream}
          user={localUser}
          isLocal={true}
          audioEnabled={localAudioEnabled}
          videoEnabled={localVideoEnabled}
        />

        {/* Remote videos */}
        {participants.map((participant) => (
          <VideoTile
            key={participant.userId}
            stream={participant.stream}
            user={participant}
            isLocal={false}
            audioEnabled={participant.audioEnabled}
            videoEnabled={participant.videoEnabled}
          />
        ))}
      </div>
    </div>
  );
}

interface ScreenShareTileProps {
  stream: MediaStream;
  blurred?: boolean;
}

function ScreenShareTile({ stream, blurred }: ScreenShareTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="w-full h-full flex items-center justify-center bg-black relative">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-contain"
        style={blurred ? { filter: 'blur(20px)' } : undefined}
        data-testid="screen-share-video"
      />
      {blurred && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/30">
          <div className="bg-background/90 backdrop-blur-sm px-6 py-3 rounded-lg text-base font-medium shadow-lg">
            Screen is blurred
          </div>
        </div>
      )}
    </div>
  );
}

interface VideoTileProps {
  stream: MediaStream | null;
  user: {
    userId?: string;
    id?: string;
    username: string | null;
    profileImageUrl: string | null;
  };
  isLocal: boolean;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
}

function VideoTile({ stream, user, isLocal, audioEnabled = true, videoEnabled = true }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const userId = user.userId || user.id || '';

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const userInitials = user.username?.[0]?.toUpperCase() || "?";
  const hasVideoStream = stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled;

  return (
    <div 
      className="relative rounded-lg overflow-hidden aspect-video"
      style={{ backgroundColor: '#1a1a2e' }}
      data-testid={`video-tile-${userId}`}
    >
      {videoEnabled && hasVideoStream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
          data-testid={`video-stream-${userId}`}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a2e' }}>
          <Avatar className="h-24 w-24 border-2 border-white/20">
            <AvatarImage src={user.profileImageUrl || undefined} />
            <AvatarFallback className="text-3xl bg-gray-700 text-white">{userInitials}</AvatarFallback>
          </Avatar>
        </div>
      )}

      {/* User name badge */}
      <div className="absolute bottom-2 left-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded-md text-sm font-medium flex items-center gap-2">
        <span data-testid={`text-participant-name-${userId}`}>
          {user.username || (isLocal ? "You" : "Participant")}
        </span>
        {!audioEnabled && (
          <MicOff className="h-3 w-3 text-destructive" data-testid={`icon-muted-${userId}`} />
        )}
      </div>

      {!videoEnabled && (
        <div className="absolute top-2 right-2">
          <VideoOff className="h-5 w-5 text-muted-foreground" data-testid={`icon-video-off-${userId}`} />
        </div>
      )}

      {isLocal && (
        <div className="absolute top-2 left-2 bg-primary text-primary-foreground px-2 py-0.5 rounded-md text-xs font-medium">
          You
        </div>
      )}
    </div>
  );
}
