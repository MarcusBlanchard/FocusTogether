import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
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
import { Users, History, Search, LogOut, Settings, Loader2, Calendar, User, UsersRound, Briefcase, Activity, Sparkles, Clock } from "lucide-react";
import { format, addDays, startOfDay, endOfDay } from "date-fns";
import { NotificationBell } from "@/components/notification-bell";
import { useSessionClient } from "@/contexts/session-client-context";
import { queryClient } from "@/lib/queryClient";

interface UserProfile {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  username: string | null;
  preference: string;
  bookingCount: number;
}

interface ScheduledSession {
  id: string;
  title: string | null;
  startAt: string;
  endAt: string;
  sessionType: string;
  bookingPreference: string;
  durationMinutes: number;
  status: string;
}

export default function Home() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { onEvent } = useSessionClient();

  // Listen for session-related events to update the UI immediately
  useEffect(() => {
    const unsubscribe = onEvent((event) => {
      const eventType = event.type;
      if (
        eventType === 'session-expired' ||
        eventType === 'session-updated' ||
        eventType === 'partner-cancelled' ||
        eventType === 'auto-rematched' ||
        eventType === 'match-found'
      ) {
        console.log(`[Home] ${eventType} event received, refreshing session list`);
        queryClient.invalidateQueries({ queryKey: ['/api/scheduled-sessions/my-sessions'] });
        queryClient.invalidateQueries({ queryKey: ['/api', 'notifications'] });
        queryClient.invalidateQueries({ queryKey: ['/api', 'notifications', 'unread-count'] });
      }
    });
    return unsubscribe;
  }, [onEvent]);

  // Fetch user profile to get preference
  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['/api/user/profile'],
    enabled: !!user,
  });

  // Fetch upcoming sessions for mini calendar
  const today = new Date();
  const threeDaysLater = addDays(today, 3);
  
  const { data: upcomingSessions = [] } = useQuery<ScheduledSession[]>({
    queryKey: ['/api/scheduled-sessions/my-sessions'],
    enabled: !!user,
  });

  const isSessionActive = (session: ScheduledSession) => {
    const now = new Date();
    const start = new Date(session.startAt);
    const end = new Date(session.endAt);
    return now >= start && now <= end;
  };

  const nextThreeDaysSessions = upcomingSessions.filter((session: ScheduledSession) => {
    // Exclude cancelled and expired sessions
    if (session.status === 'cancelled' || session.status === 'expired') return false;
    const sessionStart = new Date(session.startAt);
    const sessionEnd = new Date(session.endAt);
    const now = new Date();
    // Include if session is active OR starts in the next 3 days
    return (now <= sessionEnd && sessionStart <= threeDaysLater);
  }).sort((a, b) => {
    // Active sessions first, then by start time
    const aActive = isSessionActive(a);
    const bActive = isSessionActive(b);
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
  }).slice(0, 3);

  const getPreferenceIcon = (pref: string) => {
    switch (pref) {
      case 'desk': return <Briefcase className="h-3.5 w-3.5" />;
      case 'active': return <Activity className="h-3.5 w-3.5" />;
      case 'any': return <Sparkles className="h-3.5 w-3.5" />;
      default: return null;
    }
  };

  const getPreferenceLabel = (pref: string) => {
    switch (pref) {
      case 'desk': return 'Desk Work';
      case 'active': return 'Active';
      case 'any': return 'Any Style';
      default: return pref;
    }
  };

  const getPreferenceColor = (pref: string) => {
    switch (pref) {
      case 'desk': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800';
      case 'active': return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800';
      case 'any': return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800';
      default: return '';
    }
  };

  if (authLoading) {
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
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">FocusSession</h1>
          
          <div className="flex items-center gap-3">
            {profile?.preference && (
              <Badge 
                variant="outline" 
                className={`gap-1.5 ${getPreferenceColor(profile.preference)}`}
                data-testid="badge-preference"
              >
                {getPreferenceIcon(profile.preference)}
                <span className="hidden sm:inline">{getPreferenceLabel(profile.preference)}</span>
              </Badge>
            )}
            
            <Badge variant="outline" className="gap-1">
              <span className="h-2 w-2 rounded-full bg-status-online" />
              <span className="hidden sm:inline">Ready</span>
            </Badge>
            
            <NotificationBell />
            
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
        <div className="text-center mb-8">
          <h2 className="text-3xl font-semibold mb-4">Ready to focus?</h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Choose your session type and start a focused work session.
          </p>
        </div>

        {nextThreeDaysSessions.length > 0 && (
          <Card className="mb-8 max-w-2xl mx-auto">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Upcoming Sessions</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setLocation("/calendar")} data-testid="button-view-all">
                  View All
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {nextThreeDaysSessions.map((session) => {
                const active = isSessionActive(session);
                return (
                  <div
                    key={session.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border bg-card hover-elevate cursor-pointer ${active ? 'border-green-500 dark:border-green-600' : ''}`}
                    onClick={() => setLocation(`/session/${session.id}`)}
                    data-testid={`session-preview-${session.id}`}
                  >
                    <div className="flex-shrink-0">
                      <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${active ? 'bg-green-500/10' : 'bg-muted'}`}>
                        <Calendar className={`h-6 w-6 ${active ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {session.title || `${session.sessionType === 'solo' ? 'Solo' : 'Group'} Session`}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{format(new Date(session.startAt), 'MMM d, h:mm a')}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {session.durationMinutes}m
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {active && (
                        <Badge className="bg-green-500 hover:bg-green-600 text-white" data-testid="badge-active">
                          Active
                        </Badge>
                      )}
                      <Badge variant="outline">
                        {session.sessionType === 'solo' ? <User className="h-3 w-3 mr-1" /> : <UsersRound className="h-3 w-3 mr-1" />}
                        {session.sessionType}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <div className="mb-12">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 text-center">Book a Session</h3>
          <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
            <Card 
              className="cursor-pointer hover-elevate active-elevate-2"
              onClick={() => setLocation("/calendar?type=solo")}
              data-testid="card-session-solo"
            >
              <CardHeader className="pb-2">
                <User className="h-8 w-8 text-primary" />
              </CardHeader>
              <CardContent>
                <CardTitle className="text-lg mb-2">Solo (1-on-1)</CardTitle>
                <CardDescription>
                  Book a one-on-one focused work session with another person
                </CardDescription>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover-elevate active-elevate-2"
              onClick={() => setLocation("/calendar?type=group")}
              data-testid="card-session-group"
            >
              <CardHeader className="pb-2">
                <UsersRound className="h-8 w-8 text-primary" />
              </CardHeader>
              <CardContent>
                <CardTitle className="text-lg mb-2">Group (2-5)</CardTitle>
                <CardDescription>
                  Book a small group session with 2-5 focused workers
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card 
            className="cursor-pointer hover-elevate active-elevate-2" 
            onClick={() => setLocation("/calendar")}
            data-testid="card-calendar"
          >
            <CardHeader className="pb-2">
              <Calendar className="h-6 w-6 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-lg">Calendar</CardTitle>
              <CardDescription>View your scheduled sessions</CardDescription>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover-elevate active-elevate-2" 
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
            className="cursor-pointer hover-elevate active-elevate-2" 
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
            className="cursor-pointer hover-elevate active-elevate-2" 
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
