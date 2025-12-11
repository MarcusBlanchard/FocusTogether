import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Calendar as CalendarIcon, Clock, Users, Monitor, Activity, Shuffle, X } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { StackedAvatars } from "@/components/stacked-avatars";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useSessionClient } from "@/contexts/session-client-context";
import { format, startOfWeek, addDays, addWeeks, isSameDay, parseISO, differenceInMinutes, startOfDay } from "date-fns";

type BookingPreference = 'desk' | 'active' | 'any';
type SessionDuration = 20 | 40 | 60 | 120;

type ScheduledSession = {
  id: string;
  hostId: string;
  sessionType: string;
  bookingPreference: string;
  durationMinutes: number;
  title: string | null;
  description: string | null;
  capacity: number;
  startAt: string;
  endAt: string;
  status: string;
  participantCount?: number;
  participants?: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    profileImageUrl: string | null;
  }>;
};

type MatchedUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  profileImageUrl: string | null;
};

const EARLIEST_HOUR = 6;  // 6 AM
const LATEST_HOUR = 23;   // 11 PM
const ALL_HOURS = Array.from({ length: LATEST_HOUR - EARLIEST_HOUR + 1 }, (_, i) => i + EARLIEST_HOUR); // 6 AM to 11 PM

// Calculate the first available hour based on current time
// If minutes >= 50, show next hour since current hour has no available slots
const getStartingHour = () => {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  // If past :50, next hour; otherwise current hour
  let startHour = currentMinute >= 50 ? currentHour + 1 : currentHour;
  
  // Clamp to our calendar range (6 AM - 11 PM)
  if (startHour < EARLIEST_HOUR) startHour = EARLIEST_HOUR;
  if (startHour > LATEST_HOUR) startHour = LATEST_HOUR;
  
  return startHour;
};
const TIME_SLOT_HEIGHT = 200; // pixels per hour - tall enough for profile pictures in 15-min segments
const SUB_SLOT_HEIGHT = TIME_SLOT_HEIGHT / 4; // 50px per 15-minute segment

const preferenceLabels: Record<string, string> = {
  desk: "Desk Work",
  active: "Active",
  any: "Any",
};

const sessionTypeLabels: Record<string, string> = {
  solo: "Solo (1-on-1)",
  group: "Group (up to 5)",
};

export default function CalendarPage() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { onEvent } = useSessionClient();
  const calendarScrollRef = useRef<HTMLDivElement>(null);
  
  // Start from today (not beginning of week) - no older days visible
  // Use startOfDay to ensure we fetch all sessions for today, including ones that already started
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(
    startOfDay(new Date())
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ day: Date; hour: number; minute: number } | null>(null);
  const [matchConfirmation, setMatchConfirmation] = useState<{ session: ScheduledSession; matchedUser: MatchedUser | null } | null>(null);
  
  // Track if we've already scrolled to avoid re-scrolling on every load
  const hasScrolledRef = useRef(false);

  // Form state - only title and description are editable
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  
  // Filter state - these determine the booking parameters (non-editable in dialog)
  // Initialize from localStorage if available
  const [filterSessionType, setFilterSessionType] = useState<'solo' | 'group'>(() => {
    const saved = localStorage.getItem('calendar-filter-sessionType');
    return (saved === 'solo' || saved === 'group') ? saved : 'solo';
  });
  const [filterPreference, setFilterPreference] = useState<BookingPreference>(() => {
    const saved = localStorage.getItem('calendar-filter-preference');
    return (saved === 'desk' || saved === 'active' || saved === 'any') ? saved : 'desk';
  });
  const [filterDuration, setFilterDuration] = useState<SessionDuration>(() => {
    const saved = localStorage.getItem('calendar-filter-duration');
    const parsed = saved ? parseInt(saved, 10) : 60;
    return (parsed === 20 || parsed === 40 || parsed === 60 || parsed === 120) ? parsed : 60;
  });

  // Save filters to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('calendar-filter-sessionType', filterSessionType);
  }, [filterSessionType]);
  
  useEffect(() => {
    localStorage.setItem('calendar-filter-preference', filterPreference);
  }, [filterPreference]);
  
  useEffect(() => {
    localStorage.setItem('calendar-filter-duration', filterDuration.toString());
  }, [filterDuration]);

  // Update filter defaults when URL changes (URL takes priority over localStorage)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const urlSessionType = searchParams.get('type') as 'solo' | 'group' | null;
    
    if (urlSessionType) {
      setFilterSessionType(urlSessionType);
    }
  }, [location]);

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
        console.log(`[Calendar] ${eventType} event received, refreshing session list`);
        queryClient.invalidateQueries({ queryKey: ['/api/scheduled-sessions'] });
        queryClient.invalidateQueries({ queryKey: ['/api/scheduled-sessions/my-sessions'] });
        queryClient.invalidateQueries({ queryKey: ['/api', 'notifications'] });
        queryClient.invalidateQueries({ queryKey: ['/api', 'notifications', 'unread-count'] });
      }
    });
    return unsubscribe;
  }, [onEvent]);

  // Get sessions for the current week
  const weekEnd = addDays(currentWeekStart, 7);

  const { data: sessions, isLoading } = useQuery<ScheduledSession[]>({
    queryKey: ['/api/scheduled-sessions', currentWeekStart.toISOString(), weekEnd.toISOString()],
    queryFn: async ({ queryKey }) => {
      const [, start, end] = queryKey as [string, string, string];
      const params = new URLSearchParams({ startDate: start, endDate: end });
      const response = await fetch(`/api/scheduled-sessions?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch sessions');
      return response.json();
    },
  });

  // Scroll to the starting hour after loading completes
  useEffect(() => {
    if (!isLoading && calendarScrollRef.current && !hasScrolledRef.current) {
      const startingHour = getStartingHour();
      const hourIndex = startingHour - EARLIEST_HOUR;
      const scrollPosition = hourIndex * TIME_SLOT_HEIGHT;
      calendarScrollRef.current.scrollTop = scrollPosition;
      hasScrolledRef.current = true;
    }
  }, [isLoading]);

  // Get user's upcoming sessions
  const { data: mySessions } = useQuery<ScheduledSession[]>({
    queryKey: ['/api/scheduled-sessions/my-sessions'],
  });

  // Include both upcoming sessions AND active sessions (currently in progress)
  const now = new Date();
  const upcomingSessions = mySessions
    ?.filter(s => {
      if (s.status === 'cancelled' || s.status === 'expired') return false;
      const startAt = new Date(s.startAt);
      const endAt = new Date(s.endAt);
      // Include if: starts in future OR currently active (now is between start and end)
      return startAt > now || (startAt <= now && endAt > now);
    })
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()) || [];

  const createSessionMutation = useMutation({
    mutationFn: async (data: {
      sessionType: string;
      bookingPreference: string;
      durationMinutes: number;
      title?: string;
      description?: string;
      startAt: string;
    }) => {
      return apiRequest("POST", "/api/scheduled-sessions", data);
    },
    onSuccess: (response: any) => {
      // Invalidate both the calendar sessions and user's sessions to update UI immediately
      queryClient.invalidateQueries({ queryKey: ['/api/scheduled-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduled-sessions/my-sessions'] });
      setIsDialogOpen(false);
      
      if (response.matched && response.matchedUser) {
        // Show match confirmation popup
        setMatchConfirmation({
          session: response.session,
          matchedUser: response.matchedUser,
        });
      } else {
        toast({
          title: "Booking created",
          description: response.message || "Your session has been scheduled. Waiting for others to join.",
        });
      }
      
      // Reset form
      setTitle("");
      setDescription("");
      setSelectedSlot(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to schedule session",
        variant: "destructive",
      });
    },
  });

  const cancelSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      return apiRequest("DELETE", `/api/scheduled-sessions/${sessionId}`);
    },
    onSuccess: async () => {
      // Invalidate and await refetch to ensure UI updates immediately
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/scheduled-sessions'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/scheduled-sessions/my-sessions'] }),
      ]);
      toast({
        title: "Session cancelled",
        description: "Your booking has been cancelled.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel session",
        variant: "destructive",
      });
    },
  });

  const handleSlotClick = (day: Date, hour: number, minute: number = 0) => {
    setSelectedSlot({ day, hour, minute });
    setIsDialogOpen(true);
  };

  const handleCreateSession = () => {
    if (!selectedSlot) {
      toast({
        title: "Error",
        description: "Please select a time slot",
        variant: "destructive",
      });
      return;
    }

    const startAt = new Date(selectedSlot.day);
    startAt.setHours(selectedSlot.hour, selectedSlot.minute, 0, 0);

    // Validate booking is within grace period (allow up to 5 min after start)
    const gracePeriodMs = 5 * 60 * 1000; // 5 minutes
    if (startAt.getTime() + gracePeriodMs < Date.now()) {
      toast({
        title: "Error",
        description: "Cannot schedule sessions more than 5 minutes in the past",
        variant: "destructive",
      });
      return;
    }

    createSessionMutation.mutate({
      sessionType: filterSessionType,
      bookingPreference: filterPreference,
      durationMinutes: filterDuration,
      title: title || undefined,
      description: description || undefined,
      startAt: startAt.toISOString(),
    });
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));

  // Helper to check if preferences match - STRICT matching only
  const arePreferencesCompatible = (sessionPref: string, filterPref: BookingPreference): boolean => {
    return sessionPref === filterPref;
  };

  // Helper to get sessions for a specific time slot
  const getSessionsForSlot = (day: Date, hour: number) => {
    if (!sessions) return [];
    
    const slotStart = new Date(day);
    slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(slotStart);
    slotEnd.setHours(hour + 1, 0, 0, 0);
    const now = new Date();

    return sessions.filter((session) => {
      const sessionStart = parseISO(session.startAt);
      const sessionEnd = parseISO(session.endAt);
      
      // Filter out sessions that have already ended
      if (sessionEnd <= now) return false;
      
      // Check if session overlaps with this hour slot
      const overlaps = sessionStart < slotEnd && sessionEnd > slotStart;
      
      // Filter by session type (Solo/Group)
      const typeMatch = session.sessionType === filterSessionType;
      
      // Filter by compatible booking preference
      const preferenceMatch = arePreferencesCompatible(session.bookingPreference, filterPreference);
      
      // Filter by duration
      const durationMatch = session.durationMinutes === filterDuration;
      
      return overlaps && typeMatch && preferenceMatch && durationMatch;
    });
  };

  // Helper to calculate session position in the time grid
  const getSessionPosition = (session: ScheduledSession, day: Date, hour: number) => {
    const sessionStart = parseISO(session.startAt);
    const slotStart = new Date(day);
    slotStart.setHours(hour, 0, 0, 0);
    
    // Calculate offset from hour start (in minutes)
    const offsetMinutes = (sessionStart.getTime() - slotStart.getTime()) / (1000 * 60);
    const topOffset = (offsetMinutes / 60) * TIME_SLOT_HEIGHT;
    
    // Calculate height based on duration
    const heightPx = (session.durationMinutes / 60) * TIME_SLOT_HEIGHT;
    
    return { top: topOffset, height: heightPx };
  };

  // Check if user can join a session (10 minutes before start)
  const canJoinSession = (session: ScheduledSession) => {
    const startTime = new Date(session.startAt);
    const now = new Date();
    const minutesUntilStart = differenceInMinutes(startTime, now);
    return minutesUntilStart <= 10 && minutesUntilStart >= -session.durationMinutes;
  };

  // Check if user has ANY overlapping session at a given time slot (unfiltered by type/preference/duration)
  // This prevents double-booking regardless of the current filter view
  const userHasOverlappingSessionAtSlot = (day: Date, hour: number, minute: number): boolean => {
    if (!mySessions) return false;
    
    const slotTime = new Date(day);
    slotTime.setHours(hour, minute, 0, 0);
    const slotEndTime = new Date(slotTime);
    slotEndTime.setMinutes(slotEndTime.getMinutes() + 15);
    const now = new Date();
    
    return mySessions.some((session) => {
      // Skip cancelled sessions
      if (session.status === 'cancelled') return false;
      
      const sessionStart = parseISO(session.startAt);
      const sessionEnd = parseISO(session.endAt);
      
      // Skip sessions that have already ended
      if (sessionEnd <= now) return false;
      
      // Check if this session overlaps with the 15-min slot
      return sessionStart < slotEndTime && sessionEnd > slotTime;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-full mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/home")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-semibold flex-1">Calendar & Schedule</h1>
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

      <main className="max-w-full mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Upcoming Sessions Sidebar - Sticky */}
          <div className="w-80 flex-shrink-0">
            <Card className="sticky top-6 z-10">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  Upcoming Sessions
                </CardTitle>
                <CardDescription>Your scheduled sessions</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[calc(100vh-300px)]">
                  {upcomingSessions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No upcoming sessions
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {upcomingSessions.map((session) => {
                        const canJoin = canJoinSession(session);
                        const startTime = new Date(session.startAt);
                        const endTime = new Date(session.endAt);
                        const currentTime = new Date();
                        const isActive = startTime <= currentTime && endTime > currentTime;
                        
                        return (
                          <Card key={session.id} className={`p-3 ${isActive ? 'border-green-500 border-2' : ''}`}>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-1">
                                <div className="flex items-center gap-1">
                                  <Badge variant="outline" className="text-xs">
                                    {session.sessionType === 'solo' ? 'Solo' : 'Group'}
                                  </Badge>
                                  {isActive && (
                                    <Badge className="text-xs bg-green-500 text-white">
                                      Active
                                    </Badge>
                                  )}
                                </div>
                                <Badge variant="secondary" className="text-xs">
                                  {session.durationMinutes}m
                                </Badge>
                              </div>
                              <div className="text-sm font-medium">
                                {format(startTime, "EEE, MMM d")}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {format(startTime, "h:mm a")}
                              </div>
                              {session.participants && session.participants.length > 1 && (
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-muted-foreground">With:</span>
                                  <StackedAvatars 
                                    participants={session.participants}
                                    size="sm"
                                    excludeUserId={user?.id}
                                  />
                                </div>
                              )}
                              <div className="flex gap-2 mt-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1"
                                  onClick={() => cancelSessionMutation.mutate(session.id)}
                                  disabled={cancelSessionMutation.isPending}
                                  data-testid={`button-cancel-${session.id}`}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  className="flex-1"
                                  disabled={!canJoin}
                                  onClick={() => setLocation(`/session/${session.id}`)}
                                  data-testid={`button-join-${session.id}`}
                                >
                                  {canJoin ? "Join" : "Not yet"}
                                </Button>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Calendar */}
          <div className="flex-1">
            {/* Week navigation and filters */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, -1))}
                  data-testid="button-prev-week"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <div className="min-w-[200px] text-center">
                  <h2 className="text-lg font-semibold">
                    {format(currentWeekStart, "MMM d")} - {format(addDays(currentWeekStart, 6), "MMM d, yyyy")}
                  </h2>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}
                  data-testid="button-next-week"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>

              {/* Filters Row */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Session Type Filter */}
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  <Button
                    size="sm"
                    variant={filterSessionType === 'solo' ? 'default' : 'ghost'}
                    onClick={() => setFilterSessionType('solo')}
                    className="h-8 px-3"
                    data-testid="filter-solo"
                  >
                    Solo
                  </Button>
                  <Button
                    size="sm"
                    variant={filterSessionType === 'group' ? 'default' : 'ghost'}
                    onClick={() => setFilterSessionType('group')}
                    className="h-8 px-3"
                    data-testid="filter-group"
                  >
                    Group
                  </Button>
                </div>

                {/* Preference Filter with Icons */}
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant={filterPreference === 'desk' ? 'default' : 'ghost'}
                          onClick={() => setFilterPreference('desk')}
                          className="h-8 w-8 p-0"
                          data-testid="filter-desk"
                        >
                          <Monitor className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Desk Work</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant={filterPreference === 'active' ? 'default' : 'ghost'}
                          onClick={() => setFilterPreference('active')}
                          className="h-8 w-8 p-0"
                          data-testid="filter-active"
                        >
                          <Activity className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Active</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant={filterPreference === 'any' ? 'default' : 'ghost'}
                          onClick={() => setFilterPreference('any')}
                          className="h-8 w-8 p-0"
                          data-testid="filter-any"
                        >
                          <Shuffle className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Any</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Duration Filter */}
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  {[20, 40, 60, 120].map((duration) => (
                    <Button
                      key={duration}
                      size="sm"
                      variant={filterDuration === duration ? 'default' : 'ghost'}
                      onClick={() => setFilterDuration(duration as SessionDuration)}
                      className="h-8 px-2"
                      data-testid={`filter-duration-${duration}`}
                    >
                      {duration}m
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Calendar Grid */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden bg-card flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
                {/* Sticky Day headers */}
                <div className="grid grid-cols-8 border-b bg-muted/50 flex-shrink-0 z-20">
                  <div className="p-2 text-xs text-muted-foreground font-medium">Time</div>
                  {weekDays.map((day) => (
                    <div
                      key={day.toISOString()}
                      className={`p-2 text-center border-l ${
                        isSameDay(day, new Date()) ? "bg-primary/10" : ""
                      }`}
                    >
                      <div className="text-xs text-muted-foreground font-medium">
                        {format(day, "EEE")}
                      </div>
                      <div className={`text-lg font-semibold ${
                        isSameDay(day, new Date()) ? "text-primary" : ""
                      }`}>
                        {format(day, "d")}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Scrollable Time slots */}
                <div ref={calendarScrollRef} className="overflow-y-auto flex-1">
                  {ALL_HOURS.map((hour) => (
                      <div key={hour} className="grid grid-cols-8 border-b">
                        {/* Time label */}
                        <div className="p-2 text-xs text-muted-foreground">
                          {format(new Date().setHours(hour, 0, 0, 0), "h:mm a")}
                        </div>
                        
                        {/* Day slots */}
                        {weekDays.map((day, dayIndex) => {
                          const slotSessions = getSessionsForSlot(day, hour);
                          
                          return (
                            <div
                              key={dayIndex}
                              className={`relative border-l ${isSameDay(day, new Date()) ? "bg-primary/5" : ""}`}
                              style={{ height: `${TIME_SLOT_HEIGHT}px` }}
                            >
                              {/* 15-minute sub-slots */}
                              {[0, 15, 30, 45].map((minute, minuteIndex) => {
                                // Allow 5-minute grace period for late bookings
                                const slotTime = new Date(day);
                                slotTime.setHours(hour, minute, 0, 0);
                                const gracePeriodMs = 5 * 60 * 1000; // 5 minutes
                                const isPast = slotTime.getTime() + gracePeriodMs < Date.now();
                                
                                // Check if the CURRENT USER has ANY session that overlaps with this 15-min slot
                                // Uses unfiltered mySessions to prevent double-booking regardless of current filter view
                                const userHasOverlapping = userHasOverlappingSessionAtSlot(day, hour, minute);
                                
                                return (
                                  <div
                                    key={minute}
                                    className={`absolute w-full cursor-pointer transition-colors hover:bg-primary/10 ${
                                      minuteIndex > 0 ? "border-t border-border/30" : ""
                                    } ${isPast ? "bg-muted/70 hover:bg-muted/80 cursor-not-allowed" : ""} ${userHasOverlapping ? "pointer-events-none bg-muted/60" : ""}`}
                                    style={{ 
                                      top: `${minuteIndex * SUB_SLOT_HEIGHT}px`, 
                                      height: `${SUB_SLOT_HEIGHT}px`,
                                      zIndex: 1
                                    }}
                                    onClick={() => !isPast && !userHasOverlapping && handleSlotClick(day, hour, minute)}
                                    data-testid={`slot-${format(day, "yyyy-MM-dd")}-${hour}-${minute}`}
                                  />
                                );
                              })}
                              
                              {/* Render sessions - show only profile pictures */}
                              {slotSessions.map((session) => {
                                const { top, height } = getSessionPosition(session, day, hour);
                                const host = session.participants?.find(p => p.id === session.hostId);
                                const displayName = host && (host.firstName && host.lastName
                                  ? `${host.firstName} ${host.lastName}`
                                  : host.username || "Anonymous") || "Anonymous";
                                const initials = host && (host.firstName && host.lastName
                                  ? `${host.firstName[0]}${host.lastName[0]}`.toUpperCase()
                                  : host.username?.[0]?.toUpperCase() || "?") || "?";
                                
                                // Check if this is the current user's session
                                const isUserSession = session.hostId === user?.id || 
                                  session.participants?.some(p => p.id === user?.id);
                                
                                // Center avatar within the first 15-minute segment
                                const avatarSize = 40;
                                
                                // For other users' sessions, use pointer-events-none so clicks pass through
                                // For user's own sessions, keep interactive to show session info
                                return (
                                  <div
                                    key={session.id}
                                    className={`absolute left-0 right-0 transition-colors ${
                                      isUserSession 
                                        ? "cursor-pointer hover:bg-primary/5" 
                                        : "pointer-events-none"
                                    }`}
                                    style={{ 
                                      top: `${top}px`, 
                                      height: `${height}px`,
                                      zIndex: isUserSession ? 5 : 2
                                    }}
                                    onClick={(e) => {
                                      if (!isUserSession) return;
                                      e.stopPropagation();
                                      // Open booking dialog for the session's start time
                                      const sessionStart = parseISO(session.startAt);
                                      handleSlotClick(day, sessionStart.getHours(), sessionStart.getMinutes());
                                    }}
                                    data-testid={`session-${session.id}`}
                                  >
                                    {/* Profile picture centered at top of session */}
                                    <div
                                      className="absolute pointer-events-none"
                                      style={{ 
                                        top: `${(SUB_SLOT_HEIGHT - avatarSize) / 2}px`, 
                                        left: "50%", 
                                        transform: "translateX(-50%)",
                                        zIndex: 10 
                                      }}
                                    >
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
                                              <AvatarImage src={host?.profileImageUrl || undefined} />
                                              <AvatarFallback className="text-sm font-medium">{initials}</AvatarFallback>
                                            </Avatar>
                                          </TooltipTrigger>
                                          <TooltipContent side="top">
                                            <p className="text-xs">{displayName}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Schedule Session Dialog - Non-editable labels for type/preference/duration */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Book a Work Session</DialogTitle>
              <DialogDescription>
                {selectedSlot && (
                  <>
                    Booking for {format(selectedSlot.day, "EEE, MMM dd, yyyy")} at{" "}
                    {format(new Date().setHours(selectedSlot.hour, selectedSlot.minute, 0, 0), "h:mm a")}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {/* Non-editable session parameters - shown as labels */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Session Type</Label>
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                    <Users className="h-4 w-4" />
                    <span className="text-sm font-medium">{sessionTypeLabels[filterSessionType]}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Preference</Label>
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                    {filterPreference === 'desk' && <Monitor className="h-4 w-4" />}
                    {filterPreference === 'active' && <Activity className="h-4 w-4" />}
                    {filterPreference === 'any' && <Shuffle className="h-4 w-4" />}
                    <span className="text-sm font-medium">{preferenceLabels[filterPreference]}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Duration</Label>
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm font-medium">{filterDuration} min</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="title">Title (optional)</Label>
                <Input
                  id="title"
                  placeholder="e.g., Morning Focus Session"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  data-testid="input-title"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="What will you work on?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  data-testid="input-description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                onClick={handleCreateSession}
                disabled={createSessionMutation.isPending}
                data-testid="button-create-session"
              >
                {createSessionMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Book Session
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Match Confirmation Dialog */}
        <AlertDialog open={!!matchConfirmation} onOpenChange={(open) => !open && setMatchConfirmation(null)}>
          <AlertDialogContent className="sm:max-w-[400px]">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-center">You've been matched!</AlertDialogTitle>
              <AlertDialogDescription className="text-center">
                <div className="py-6 flex flex-col items-center gap-4">
                  {matchConfirmation?.session?.sessionType === 'group' && matchConfirmation?.session?.participants && matchConfirmation.session.participants.length > 0 ? (
                    <>
                      <div className="flex justify-center">
                        <StackedAvatars 
                          participants={matchConfirmation.session.participants}
                          size="lg"
                          excludeUserId={user?.id}
                        />
                      </div>
                      <div className="text-lg font-semibold text-foreground">
                        {matchConfirmation.session.participants.filter(p => p.id !== user?.id).length} group member{matchConfirmation.session.participants.filter(p => p.id !== user?.id).length !== 1 ? 's' : ''}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Your group session at{" "}
                        {format(parseISO(matchConfirmation.session.startAt), "h:mm a 'on' EEE, MMM d")}
                      </div>
                    </>
                  ) : matchConfirmation?.matchedUser && (
                    <>
                      <Avatar className="h-20 w-20 border-4 border-primary">
                        <AvatarImage src={matchConfirmation.matchedUser.profileImageUrl || undefined} />
                        <AvatarFallback className="text-xl">
                          {matchConfirmation.matchedUser.firstName?.[0]}
                          {matchConfirmation.matchedUser.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-lg font-semibold text-foreground">
                        {matchConfirmation.matchedUser.firstName} {matchConfirmation.matchedUser.lastName}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Your session partner for{" "}
                        {matchConfirmation.session && format(parseISO(matchConfirmation.session.startAt), "h:mm a 'on' EEE, MMM d")}
                      </div>
                    </>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="sm:justify-center">
              <AlertDialogAction
                onClick={() => {
                  if (matchConfirmation?.session) {
                    setLocation(`/session/${matchConfirmation.session.id}`);
                  }
                  setMatchConfirmation(null);
                }}
                data-testid="button-view-session"
              >
                View Session
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
