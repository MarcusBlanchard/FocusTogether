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
}

export function VideoGrid({ 
  participants, 
  localStream, 
  localUser, 
  localAudioEnabled, 
  localVideoEnabled 
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
    <div className={`grid ${getGridClass()} gap-2 h-full w-full p-4`}>
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
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const userInitials = user.username?.[0]?.toUpperCase() || "?";

  return (
    <div 
      className="relative bg-muted rounded-lg overflow-hidden aspect-video"
      data-testid={`video-tile-${userId}`}
    >
      {videoEnabled && stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
          data-testid={`video-stream-${userId}`}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-muted">
          <Avatar className="h-20 w-20">
            <AvatarImage src={user.profileImageUrl || undefined} />
            <AvatarFallback className="text-2xl">{userInitials}</AvatarFallback>
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
