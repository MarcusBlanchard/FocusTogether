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
import { ArrowLeft, UserPlus, Play, Trash2, Loader2 } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { FriendsStatsNav } from "@/components/friends-stats-nav";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { User } from "@shared/schema";

interface FriendWithStatus extends User {
  isOnline?: boolean;
  isIdle?: boolean;
}

export default function Friends() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "Please log in to view your friends.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  const { data: friends, isLoading } = useQuery<FriendWithStatus[]>({
    queryKey: ["/api/friends"],
    enabled: isAuthenticated,
  });

  const removeFriendMutation = useMutation({
    mutationFn: async (friendId: string) => {
      return apiRequest("DELETE", `/api/friends/${friendId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      toast({
        title: "Friend removed",
        description: "Friend has been removed from your list.",
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
        description: "Failed to remove friend.",
        variant: "destructive",
      });
    },
  });

  const inviteFriendMutation = useMutation({
    mutationFn: async (friendId: string) => {
      return apiRequest("POST", "/api/sessions/invite", { friendId });
    },
    onSuccess: (data: any) => {
      if (data.status === 'sent') {
        toast({
          title: "Invite sent",
          description: "Waiting for your friend to accept...",
        });
        setLocation("/waiting");
      } else if (data.status === 'offline') {
        toast({
          title: "Friend offline",
          description: "Your friend is not currently online.",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send invite.",
        variant: "destructive",
      });
    },
  });

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
          <h1 className="text-2xl font-semibold flex-1">Friends</h1>
          <NotificationBell />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/profile")}
            className="rounded-full"
            data-testid="button-profile"
          >
            <Avatar className="h-9 w-9">
              <AvatarImage src={user?.profileImageUrl || undefined} />
              <AvatarFallback>
                {user?.firstName && user?.lastName
                  ? `${user.firstName[0]}${user.lastName[0]}`
                  : user?.username?.[0]?.toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <FriendsStatsNav className="mb-6" />
        <div className="flex items-center justify-between mb-6">
          <p className="text-muted-foreground">
            {friends?.length || 0} friend{friends?.length !== 1 ? 's' : ''}
          </p>
          <Button variant="outline" onClick={() => setLocation("/search")} data-testid="button-add-friends">
            <UserPlus className="mr-2 h-4 w-4" />
            Add Friends
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="flex items-center gap-4 p-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-9 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : friends && friends.length > 0 ? (
          <div className="space-y-4">
            {friends.map((friend) => {
              const initials = friend.firstName && friend.lastName
                ? `${friend.firstName[0]}${friend.lastName[0]}`.toUpperCase()
                : friend.username?.[0]?.toUpperCase() || friend.email?.[0]?.toUpperCase() || "?";
              
              const displayName = friend.username || friend.firstName || friend.email?.split("@")[0] || "User";

              return (
                <Card key={friend.id} data-testid={`card-friend-${friend.id}`}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={friend.profileImageUrl || undefined} />
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{displayName}</span>
                        {friend.isOnline && (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <span className={`h-1.5 w-1.5 rounded-full ${friend.isIdle ? 'bg-status-online' : 'bg-status-away'}`} />
                            {friend.isIdle ? 'Available' : 'Busy'}
                          </Badge>
                        )}
                      </div>
                      {friend.email && (
                        <span className="text-sm text-muted-foreground">{friend.email}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {friend.isOnline && friend.isIdle && (
                        <Button
                          size="sm"
                          onClick={() => inviteFriendMutation.mutate(friend.id)}
                          disabled={inviteFriendMutation.isPending}
                          data-testid={`button-invite-${friend.id}`}
                        >
                          {inviteFriendMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Play className="mr-1 h-4 w-4" />
                              Invite
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFriendMutation.mutate(friend.id)}
                        disabled={removeFriendMutation.isPending}
                        data-testid={`button-remove-${friend.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <UserPlus className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No friends yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Add friends to invite them to focus sessions directly.
              </p>
              <Button onClick={() => setLocation("/search")}>
                <UserPlus className="mr-2 h-4 w-4" />
                Find Friends
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
