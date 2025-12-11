import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Participant {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  username?: string | null;
}

interface StackedAvatarsProps {
  participants: Participant[];
  size?: "sm" | "md" | "lg";
  maxDisplay?: number;
  excludeUserId?: string;
}

export function StackedAvatars({ 
  participants, 
  size = "md", 
  maxDisplay = 5,
  excludeUserId 
}: StackedAvatarsProps) {
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8", 
    lg: "h-10 w-10"
  };

  const textSizeClasses = {
    sm: "text-[8px]",
    md: "text-[10px]",
    lg: "text-xs"
  };

  const overlapClasses = {
    sm: "-ml-2",
    md: "-ml-3",
    lg: "-ml-4"
  };

  const filteredParticipants = excludeUserId 
    ? participants.filter(p => p.id !== excludeUserId)
    : participants;

  const displayParticipants = filteredParticipants.slice(0, maxDisplay);
  const remaining = filteredParticipants.length - maxDisplay;

  const getInitials = (participant: Participant) => {
    if (participant.firstName && participant.lastName) {
      return `${participant.firstName[0]}${participant.lastName[0]}`.toUpperCase();
    }
    if (participant.username) {
      return participant.username.slice(0, 2).toUpperCase();
    }
    return "??";
  };

  if (displayParticipants.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center">
      {displayParticipants.map((participant, index) => (
        <Avatar 
          key={participant.id} 
          className={`${sizeClasses[size]} border-2 border-background ${index > 0 ? overlapClasses[size] : ''}`}
          style={{ zIndex: displayParticipants.length - index }}
        >
          <AvatarImage src={participant.profileImageUrl || undefined} />
          <AvatarFallback className={textSizeClasses[size]}>
            {getInitials(participant)}
          </AvatarFallback>
        </Avatar>
      ))}
      {remaining > 0 && (
        <div 
          className={`${sizeClasses[size]} ${overlapClasses[size]} rounded-full border-2 border-background bg-muted flex items-center justify-center ${textSizeClasses[size]} font-medium text-muted-foreground`}
          style={{ zIndex: 0 }}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}
