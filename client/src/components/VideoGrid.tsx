import { useRef, useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VideoOff, MicOff, Monitor, Maximize2 } from "lucide-react";
import { ParticipantInfo } from "@/lib/session-client";

export interface VideoParticipant extends ParticipantInfo {
  stream: MediaStream | null;
  screenStream?: MediaStream | null;
  screenBlurred?: boolean;
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

type MaximizedView = 'none' | 'local-screen' | 'local-video' | `remote-screen-${string}` | `remote-video-${string}`;

export function VideoGrid({ 
  participants, 
  localStream, 
  localUser, 
  localAudioEnabled, 
  localVideoEnabled,
  screenStream,
  screenBlurred 
}: VideoGridProps) {
  const [maximizedView, setMaximizedView] = useState<MaximizedView>('none');
  const totalParticipants = participants.length + 1;

  // Check if any remote participant is sharing their screen
  const remoteScreenSharers = participants.filter(p => p.screenStream);
  
  // Auto-maximize remote screen share if one exists and nothing is maximized
  useEffect(() => {
    if (remoteScreenSharers.length > 0 && maximizedView === 'none') {
      setMaximizedView(`remote-screen-${remoteScreenSharers[0].userId}`);
    } else if (remoteScreenSharers.length === 0 && maximizedView.startsWith('remote-screen-')) {
      setMaximizedView('none');
    }
  }, [remoteScreenSharers.length]);

  // If local screen share starts and no remote shares, maximize local
  useEffect(() => {
    if (screenStream && remoteScreenSharers.length === 0 && maximizedView === 'none') {
      setMaximizedView('local-screen');
    } else if (!screenStream && maximizedView === 'local-screen') {
      setMaximizedView('none');
    }
  }, [screenStream, remoteScreenSharers.length]);

  const getGridClass = () => {
    if (totalParticipants === 1) return "grid-cols-1";
    if (totalParticipants === 2) return "grid-cols-2";
    if (totalParticipants <= 4) return "grid-cols-2";
    if (totalParticipants <= 6) return "grid-cols-3";
    return "grid-cols-4";
  };

  const hasMaximizedView = maximizedView !== 'none';

  // Get the maximized content
  const renderMaximizedContent = () => {
    if (maximizedView === 'local-screen' && screenStream) {
      return <ScreenShareTile stream={screenStream} blurred={screenBlurred} isLocal={true} />;
    }

    if (maximizedView === 'local-video') {
      return (
        <div className="w-full h-full">
          <VideoTile
            stream={localStream}
            user={localUser}
            isLocal={true}
            audioEnabled={localAudioEnabled}
            videoEnabled={localVideoEnabled}
            isMaximized={true}
          />
        </div>
      );
    }
    
    if (maximizedView.startsWith('remote-screen-')) {
      const participantId = maximizedView.replace('remote-screen-', '');
      const participant = participants.find(p => p.userId === participantId);
      if (participant?.screenStream) {
        return <ScreenShareTile stream={participant.screenStream} blurred={participant.screenBlurred} isLocal={false} />;
      }
    }

    if (maximizedView.startsWith('remote-video-')) {
      const participantId = maximizedView.replace('remote-video-', '');
      const participant = participants.find(p => p.userId === participantId);
      if (participant) {
        return (
          <div className="w-full h-full">
            <VideoTile
              stream={participant.stream}
              user={participant}
              isLocal={false}
              audioEnabled={participant.audioEnabled}
              videoEnabled={participant.videoEnabled}
              isMaximized={true}
            />
          </div>
        );
      }
    }

    return null;
  };

  // Build the list of thumbnail tiles
  const renderThumbnails = () => {
    const thumbnails: JSX.Element[] = [];

    // Local video tile - when screen sharing, clicking switches views
    // When not screen sharing, clicking returns to grid
    const localVideoMaximized = maximizedView === 'local-video';
    if (!localVideoMaximized) {
      thumbnails.push(
        <div 
          key="local-video" 
          className="cursor-pointer hover:ring-2 hover:ring-primary rounded-lg transition-all"
          onClick={() => {
            // If there's a screen share active, switch to local video maximized
            // Otherwise, return to grid view
            if (screenStream || remoteScreenSharers.length > 0) {
              setMaximizedView('local-video');
            } else {
              setMaximizedView('none');
            }
          }}
        >
          <VideoTile
            stream={localStream}
            user={localUser}
            isLocal={true}
            audioEnabled={localAudioEnabled}
            videoEnabled={localVideoEnabled}
          />
        </div>
      );
    }

    // Local screen share tile (if sharing) - always show when not maximized
    if (screenStream && maximizedView !== 'local-screen') {
      thumbnails.push(
        <div 
          key="local-screen" 
          className="cursor-pointer hover:ring-2 hover:ring-primary rounded-lg transition-all relative"
          onClick={() => setMaximizedView('local-screen')}
        >
          <ScreenShareThumbnail stream={screenStream} label="Your Screen" blurred={screenBlurred} />
        </div>
      );
    }

    // Remote participant tiles
    participants.forEach((participant) => {
      // Remote video tile
      const isVideoMaximized = maximizedView === `remote-video-${participant.userId}`;
      if (!isVideoMaximized) {
        thumbnails.push(
          <div 
            key={`video-${participant.userId}`}
            className="cursor-pointer hover:ring-2 hover:ring-primary rounded-lg transition-all"
            onClick={() => setMaximizedView(`remote-video-${participant.userId}`)}
          >
            <VideoTile
              stream={participant.stream}
              user={participant}
              isLocal={false}
              audioEnabled={participant.audioEnabled}
              videoEnabled={participant.videoEnabled}
            />
          </div>
        );
      }

      // Remote screen share tile (if sharing)
      const isScreenMaximized = maximizedView === `remote-screen-${participant.userId}`;
      if (participant.screenStream && !isScreenMaximized) {
        thumbnails.push(
          <div 
            key={`screen-${participant.userId}`}
            className="cursor-pointer hover:ring-2 hover:ring-primary rounded-lg transition-all"
            onClick={() => setMaximizedView(`remote-screen-${participant.userId}`)}
          >
            <ScreenShareThumbnail 
              stream={participant.screenStream} 
              label={`${participant.username || 'Participant'}'s Screen`}
              blurred={participant.screenBlurred}
            />
          </div>
        );
      }
    });

    return thumbnails;
  };

  return (
    <div className="h-full w-full relative">
      {hasMaximizedView ? (
        <>
          {/* Maximized view takes up most of the screen - click to return to grid when no screen shares */}
          <div 
            className="absolute inset-0 bg-black cursor-pointer"
            onClick={() => {
              // Only return to grid if there's no active screen sharing
              // Otherwise, clicking should do nothing (use thumbnails to switch views)
              if (!screenStream && remoteScreenSharers.length === 0) {
                setMaximizedView('none');
              }
            }}
          >
            {renderMaximizedContent()}
          </div>

          {/* Thumbnails in bottom right corner */}
          <div className="absolute bottom-4 right-4 flex gap-2 z-10">
            {renderThumbnails().map((thumb, i) => (
              <div key={i} className="w-32 h-24">
                {thumb}
              </div>
            ))}
          </div>
        </>
      ) : (
        /* Normal grid layout when nothing is maximized */
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
      )}
    </div>
  );
}

interface ScreenShareTileProps {
  stream: MediaStream;
  blurred?: boolean;
  isLocal?: boolean;
}

function ScreenShareTile({ stream, blurred, isLocal }: ScreenShareTileProps) {
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
        muted={isLocal}
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
      <div className="absolute top-2 left-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1">
        <Monitor className="h-3 w-3" />
        {isLocal ? "Your Screen" : "Screen Share"}
      </div>
    </div>
  );
}

interface ScreenShareThumbnailProps {
  stream: MediaStream;
  label: string;
  blurred?: boolean;
}

function ScreenShareThumbnail({ stream, label, blurred }: ScreenShareThumbnailProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="w-full h-full rounded-lg overflow-hidden relative" style={{ backgroundColor: '#1a1a2e' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={blurred ? { filter: 'blur(8px)' } : undefined}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <Maximize2 className="h-6 w-6 text-white/70" />
      </div>
      <div className="absolute bottom-1 left-1 bg-background/80 backdrop-blur-sm px-1.5 py-0.5 rounded text-xs font-medium flex items-center gap-1">
        <Monitor className="h-2.5 w-2.5" />
        <span className="truncate max-w-[60px]">{label}</span>
      </div>
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
  isMaximized?: boolean;
}

function VideoTile({ stream, user, isLocal, audioEnabled = true, videoEnabled = true, isMaximized }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const userId = user.userId || user.id || '';

  // Handle video stream
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Handle audio separately for remote participants
  // This ensures audio plays even when video is disabled
  useEffect(() => {
    if (!isLocal && audioRef.current && stream) {
      audioRef.current.srcObject = stream;
      // Try to play audio - browsers may require user interaction
      audioRef.current.play().catch(err => {
        console.log('[VideoTile] Audio autoplay blocked, waiting for user interaction:', err);
      });
    }
  }, [stream, isLocal]);

  const userInitials = user.username?.[0]?.toUpperCase() || "?";
  const hasVideoStream = stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled;

  const avatarSize = isMaximized ? "h-32 w-32" : "h-24 w-24";
  const initialsSize = isMaximized ? "text-5xl" : "text-3xl";

  return (
    <div 
      className={`relative rounded-lg overflow-hidden ${isMaximized ? 'h-full w-full' : 'aspect-video'}`}
      style={{ backgroundColor: '#1a1a2e' }}
      data-testid={`video-tile-${userId}`}
    >
      {/* Always render audio element for remote participants */}
      {!isLocal && stream && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          data-testid={`audio-stream-${userId}`}
        />
      )}
      
      {videoEnabled && hasVideoStream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={true}
          className="w-full h-full object-cover"
          data-testid={`video-stream-${userId}`}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1a1a2e' }}>
          <Avatar className={`${avatarSize} border-2 border-white/20`}>
            <AvatarImage src={user.profileImageUrl || undefined} />
            <AvatarFallback className={`${initialsSize} bg-gray-700 text-white`}>{userInitials}</AvatarFallback>
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
