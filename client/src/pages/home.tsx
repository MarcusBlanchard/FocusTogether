import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Play, Users, History, Search, LogOut, Settings, Loader2, Calendar } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { sessionClient } from "@/lib/session-client";

export default function Home() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [isStarting, setIsStarting] = useState(false);

  const joinQueueMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/sessions/join-queue");
    },
    onSuccess: () => {
      setLocation("/waiting");
    },
  });

  const handleStartSession = async () => {
    if (!user) return;
    
    setIsStarting(true);
    
    // Connect to WebSocket first
    sessionClient.connect(user.id);
    
    // Navigate to waiting page (queue join happens there)
    setLocation("/waiting");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const initials = user?.firstName && user?.lastName 
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : user?.email?.[0]?.toUpperCase() || "?";

  const displayName = user?.username || user?.firstName || user?.email?.split("@")[0] || "User";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">FocusSession</h1>
          
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="gap-1">
              <span className="h-2 w-2 rounded-full bg-status-online" />
              Ready
            </Badge>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full" data-testid="button-user-menu">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user?.profileImageUrl || undefined} alt={displayName} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center gap-2 p-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.profileImageUrl || undefined} alt={displayName} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium" data-testid="text-username">{displayName}</span>
                    <span className="text-xs text-muted-foreground">{user?.email}</span>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLocation("/profile")} data-testid="menu-item-profile">
                  <Settings className="mr-2 h-4 w-4" />
                  Profile Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href="/api/logout" className="flex items-center" data-testid="menu-item-logout">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-semibold mb-4">Ready to focus?</h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Start a session to be matched with another focused worker. You'll work together via video call.
          </p>
          
          <Button 
            size="lg" 
            className="px-12 py-6 text-lg rounded-full"
            onClick={handleStartSession}
            disabled={isStarting}
            data-testid="button-start-session"
          >
            {isStarting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Play className="mr-2 h-5 w-5" />
                Start Session
              </>
            )}
          </Button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card 
            className="cursor-pointer hover-elevate" 
            onClick={() => setLocation("/calendar")}
            data-testid="card-calendar"
          >
            <CardHeader className="pb-2">
              <Calendar className="h-6 w-6 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-lg">Calendar</CardTitle>
              <CardDescription>Schedule work sessions</CardDescription>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover-elevate" 
            onClick={() => setLocation("/friends")}
            data-testid="card-friends"
          >
            <CardHeader className="pb-2">
              <Users className="h-6 w-6 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-lg">Friends</CardTitle>
              <CardDescription>Invite friends to work together</CardDescription>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover-elevate" 
            onClick={() => setLocation("/history")}
            data-testid="card-history"
          >
            <CardHeader className="pb-2">
              <History className="h-6 w-6 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-lg">History</CardTitle>
              <CardDescription>View your past sessions</CardDescription>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover-elevate" 
            onClick={() => setLocation("/search")}
            data-testid="card-search"
          >
            <CardHeader className="pb-2">
              <Search className="h-6 w-6 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-lg">Find Users</CardTitle>
              <CardDescription>Search and add new friends</CardDescription>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
