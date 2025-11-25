import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, UserPlus, Clock, Calendar, Check, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { format, formatDistanceToNow } from "date-fns";

interface SessionHistory {
  id: string;
  user1Id: string;
  user2Id: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  partner: {
    id: string;
    username: string | null;
    profileImageUrl: string | null;
  } | null;
  isFriend: boolean;
}

export default function History() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "Please log in to view your history.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  const { data: sessions, isLoading } = useQuery<SessionHistory[]>({
    queryKey: ["/api/sessions/history"],
    enabled: isAuthenticated,
  });

  const addFriendMutation = useMutation({
    mutationFn: async (friendId: string) => {
      return apiRequest("POST", "/api/friends", { friendId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      toast({
        title: "Friend added",
        description: "User has been added to your friends.",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "Please log in again.",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to add friend.",
        variant: "destructive",
      });
    },
  });

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "In progress";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-semibold">Session History</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-muted-foreground mb-6">
          {sessions?.length || 0} session{sessions?.length !== 1 ? 's' : ''}
        </p>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="flex items-center gap-4 p-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-9 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : sessions && sessions.length > 0 ? (
          <div className="space-y-4">
            {sessions.map((session) => {
              const partner = session.partner;
              const initials = partner?.username?.[0]?.toUpperCase() || "?";
              const displayName = partner?.username || "Unknown User";

              return (
                <Card key={session.id} data-testid={`card-session-${session.id}`}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={partner?.profileImageUrl || undefined} />
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{displayName}</span>
                        {session.isFriend && (
                          <Badge variant="secondary" className="text-xs">
                            Friend
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDistanceToNow(new Date(session.startedAt), { addSuffix: true })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(session.durationSeconds)}
                        </span>
                      </div>
                    </div>

                    {partner && !session.isFriend && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addFriendMutation.mutate(partner.id)}
                        disabled={addFriendMutation.isPending}
                        data-testid={`button-add-friend-${session.id}`}
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
                    {session.isFriend && (
                      <Badge variant="outline" className="gap-1">
                        <Check className="h-3 w-3" />
                        Friends
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Clock className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No sessions yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Start your first focus session to see your history here.
              </p>
              <Button onClick={() => setLocation("/")}>
                Start a Session
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
