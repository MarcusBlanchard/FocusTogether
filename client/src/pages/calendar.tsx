import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Calendar as CalendarIcon, Clock, Users, Monitor, Activity, Shuffle, X, Play } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format, startOfWeek, addDays, addWeeks, isSameDay, parseISO, differenceInMinutes, isAfter, isBefore, addMinutes } from "date-fns";

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

const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 8 AM to 9 PM
const TIME_SLOT_HEIGHT = 200; // pixels per hour
const SUB_SLOT_HEIGHT = TIME_SLOT_HEIGHT / 4; // 50px per 15-minute segment

const preferenceLabels: Record<string, string> = {
  desk: "Desk",
  active: "Active",
  any: "Any"
};

const sessionTypeLabels: Record<string, string> = {
  solo: "Solo (1-on-1)",
  group: "Group (up to 5)"
};

export default function CalendarPage() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ day: Date; hour: number; minute: number } | null>(null);
  const [selectedSession, setSelectedSession] = useState<ScheduledSession | null>(null);
  const [isMatchDialogOpen, setIsMatchDialogOpen] = useState(false);
  const [matchedPartner, setMatchedPartner] = useState<any>(null);

  // Form state - only title and description are editable
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  
  // Filter state - these become the booking values
  const [filterSessionType, setFilterSessionType] = useState<'solo' | 'group'>('solo');
  const [filterPreference, setFilterPreference] = useState<BookingPreference>('desk');
  const [filterDuration, setFilterDuration] = useState<SessionDuration>(60);

  // Update filter from URL
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const urlSessionType = searchParams.get('type') as 'solo' | 'group' | null;
    if (urlSessionType) {
      setFilterSessionType(urlSessionType);
    }
  }, [location]);

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

  // Get user's scheduled sessions for upcoming sidebar and overlap checking
  const { data: mySessions } = useQuery<ScheduledSession[]>({
    queryKey: ['/api/scheduled-sessions/my-sessions'],
  });

  // Filter upcoming sessions (future sessions only)
  const upcomingSessions = mySessions?.filter(session => {
    const sessionStart = parseISO(session.startAt);
    return isAfter(sessionStart, new Date()) && session.status !== 'cancelled';
  }).sort((a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime()) || [];

  const cancelSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      return apiRequest("POST", `/api/scheduled-sessions/${sessionId}/leave`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/scheduled-sessions'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/scheduled-sessions'] });
      setIsDialogOpen(false);
      
      if (response.matched) {
        // Show match confirmation dialog
        const partner = response.session.participants?.find((p: any) => p.id !== user?.id);
        setMatchedPartner(partner);
        setIsMatchDialogOpen(true);
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
      setSelectedSession(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to schedule session",
        variant: "destructive",
      });
    },
  });

  // Check if a time slot overlaps with user's active future bookings
  const hasOverlappingBooking = (startTime: Date, durationMins: number): boolean => {
    if (!mySessions) return false;
    
    const now = new Date();
    const newEnd = addMinutes(startTime, durationMins);
    
    return mySessions.some(session => {
      // Skip cancelled sessions
      if (session.status === 'cancelled') return false;
      
      const sessionStart = parseISO(session.startAt);
      const sessionEnd = parseISO(session.endAt);
      
      // Skip sessions that have already ended
      if (sessionEnd <= now) return false;
      
      // Check overlap: new session starts before existing ends AND new session ends after existing starts
      return startTime < sessionEnd && newEnd > sessionStart;
    });
  };

  const handleSlotClick = (day: Date, hour: number, minute: number = 0, existingSession?: ScheduledSession) => {
    const slotTime = new Date(day);
    slotTime.setHours(hour, minute, 0, 0);
    
    // Check for overlapping bookings
    if (hasOverlappingBooking(slotTime, filterDuration)) {
      toast({
        title: "Time slot unavailable",
        description: "You already have a booking that overlaps with this time.",
        variant: "destructive",
      });
      return;
    }
    
    setSelectedSlot({ day, hour, minute });
    setSelectedSession(existingSession || null);
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

    if (startAt <= new Date()) {
      toast({
        title: "Error",
        description: "Cannot schedule sessions in the past",
        variant: "destructive",
      });
      return;
    }

    // Check overlapping one more time before submitting
    if (hasOverlappingBooking(startAt, filterDuration)) {
      toast({
        title: "Time slot unavailable",
        description: "You already have a booking that overlaps with this time.",
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

  // Helper to get sessions for a specific time slot
  const getSessionsForSlot = (day: Date, hour: number) => {
    if (!sessions) return [];
    
    const slotStart = new Date(day);
    slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(slotStart);
    slotEnd.setHours(hour + 1, 0, 0, 0);

    return sessions.filter((session) => {
      const sessionStart = parseISO(session.startAt);
      const sessionEnd = parseISO(session.endAt);
      
      const overlaps = sessionStart < slotEnd && sessionEnd > slotStart;
      const typeMatch = session.sessionType === filterSessionType;
      const preferenceMatch = session.bookingPreference === filterPreference;
      const durationMatch = session.durationMinutes === filterDuration;
      
      // Hide matched sessions (2+ participants for solo means matched and should disappear)
      const participantCount = session.participantCount || session.participants?.length || 0;
      const isMatched = filterSessionType === 'solo' ? participantCount >= 2 : participantCount >= session.capacity;
      
      return overlaps && typeMatch && preferenceMatch && durationMatch && !isMatched;
    });
  };

  // Helper to calculate session position in the time grid
  const getSessionPosition = (session: ScheduledSession, day: Date, hour: number) => {
    const sessionStart = parseISO(session.startAt);
    const slotStart = new Date(day);
    slotStart.setHours(hour, 0, 0, 0);
    
    const offsetMinutes = (sessionStart.getTime() - slotStart.getTime()) / (1000 * 60);
    const topOffset = (offsetMinutes / 60) * TIME_SLOT_HEIGHT;
    const heightPx = (session.durationMinutes / 60) * TIME_SLOT_HEIGHT;
    
    return { top: topOffset, height: heightPx };
  };

  // Check if join button should be enabled (10 minutes before session)
  const canJoinSession = (session: ScheduledSession): boolean => {
    const sessionStart = parseISO(session.startAt);
    const now = new Date();
    const minutesUntilStart = differenceInMinutes(sessionStart, now);
    return minutesUntilStart <= 10 && minutesUntilStart >= -session.durationMinutes;
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
          <h1 className="text-2xl font-semibold">Calendar & Schedule</h1>
        </div>
      </header>

      <main className="flex gap-6 p-4">
        {/* Upcoming Sidebar - 1/4 width */}
        <div className="w-80 flex-shrink-0">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                Upcoming Sessions
              </CardTitle>
              <CardDescription>Your scheduled work sessions</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="px-4 pb-4 space-y-3">
                  {upcomingSessions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No upcoming sessions
                    </p>
                  ) : (
                    upcomingSessions.map((session) => {
                      const sessionStart = parseISO(session.startAt);
                      const canJoin = canJoinSession(session);
                      const partner = session.participants?.find(p => p.id !== user?.id);
                      
                      return (
                        <div
                          key={session.id}
                          className="p-3 rounded-lg border bg-card"
                          data-testid={`upcoming-session-${session.id}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <p className="font-medium text-sm">
                                {session.title || `${session.sessionType === 'solo' ? 'Solo' : 'Group'} Session`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(sessionStart, "EEE, MMM d")} at {format(sessionStart, "h:mm a")}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {session.durationMinutes} min • {preferenceLabels[session.bookingPreference]}
                              </p>
                            </div>
                            {partner && (
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={partner.profileImageUrl || undefined} />
                                <AvatarFallback className="text-xs">
                                  {partner.firstName?.[0] || partner.username?.[0] || '?'}
                                </AvatarFallback>
                              </Avatar>
                            )}
                          </div>
                          
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => cancelSessionMutation.mutate(session.id)}
                              disabled={cancelSessionMutation.isPending}
                              data-testid={`button-cancel-${session.id}`}
                            >
                              <X className="h-3.5 w-3.5 mr-1" />
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1"
                              disabled={!canJoin}
                              onClick={() => setLocation(`/session/${session.id}`)}
                              data-testid={`button-join-${session.id}`}
                            >
                              <Play className="h-3.5 w-3.5 mr-1" />
                              Join
                            </Button>
                          </div>
                          {!canJoin && (
                            <p className="text-xs text-muted-foreground mt-2 text-center">
                              Join available 10 min before start
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Calendar Area - remaining width */}
        <div className="flex-1 min-w-0">
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
              <Button
                variant="outline"
                onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                data-testid="button-today"
              >
                Today
              </Button>
            </div>

            {/* Filters Row */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Session Type Filter */}
              <div className="flex items-center gap-1 bg-muted rounded-md p-1">
                <Button
                  variant={filterSessionType === 'solo' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFilterSessionType('solo')}
                  data-testid="filter-solo"
                  className="h-7 px-3"
                >
                  <Users className="h-3.5 w-3.5 mr-1.5" />
                  Solo
                </Button>
                <Button
                  variant={filterSessionType === 'group' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFilterSessionType('group')}
                  data-testid="filter-group"
                  className="h-7 px-3"
                >
                  <Users className="h-3.5 w-3.5 mr-1.5" />
                  Group
                </Button>
              </div>

              {/* Booking Preference Filter */}
              <div className="flex items-center gap-1 bg-muted rounded-md p-1">
                <Button
                  variant={filterPreference === 'desk' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFilterPreference('desk')}
                  data-testid="filter-desk"
                  className="h-7 px-3"
                >
                  <Monitor className="h-3.5 w-3.5 mr-1.5" />
                  Desk
                </Button>
                <Button
                  variant={filterPreference === 'active' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFilterPreference('active')}
                  data-testid="filter-active"
                  className="h-7 px-3"
                >
                  <Activity className="h-3.5 w-3.5 mr-1.5" />
                  Active
                </Button>
                <Button
                  variant={filterPreference === 'any' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFilterPreference('any')}
                  data-testid="filter-any"
                  className="h-7 px-3"
                >
                  <Shuffle className="h-3.5 w-3.5 mr-1.5" />
                  Any
                </Button>
              </div>

              {/* Duration Filter */}
              <div className="flex items-center gap-1 bg-muted rounded-md p-1">
                {([20, 40, 60, 120] as SessionDuration[]).map((duration) => (
                  <Button
                    key={duration}
                    variant={filterDuration === duration ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setFilterDuration(duration)}
                    data-testid={`filter-${duration}min`}
                    className="h-7 px-2.5"
                  >
                    {duration}m
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="border rounded-lg overflow-hidden bg-card">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[700px]">
                  {/* Day headers */}
                  <div className="grid grid-cols-8 border-b bg-muted/50">
                    <div className="p-2 text-xs font-medium text-muted-foreground">Time</div>
                    {weekDays.map((day, index) => (
                      <div
                        key={index}
                        className={`p-2 text-center border-l ${
                          isSameDay(day, new Date()) ? "bg-primary/5" : ""
                        }`}
                      >
                        <div className="text-xs font-medium text-muted-foreground">
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

                  {/* Time slots */}
                  <div>
                    {HOURS.map((hour) => (
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
                                const slotTime = new Date(day);
                                slotTime.setHours(hour, minute, 0, 0);
                                const isPast = slotTime < new Date();
                                const hasExistingSession = slotSessions.some((session) => {
                                  const sessionStart = parseISO(session.startAt);
                                  return sessionStart.getHours() === hour && sessionStart.getMinutes() === minute;
                                });
                                const hasOverlap = !isPast && hasOverlappingBooking(slotTime, filterDuration);
                                
                                return (
                                  <div
                                    key={minute}
                                    className={`absolute w-full cursor-pointer transition-colors ${
                                      minuteIndex > 0 ? "border-t border-border/30" : ""
                                    } ${isPast ? "bg-muted/30" : ""} ${hasOverlap ? "bg-muted/20" : "hover:bg-primary/10"} ${hasExistingSession ? "pointer-events-none" : ""}`}
                                    style={{ 
                                      top: `${minuteIndex * SUB_SLOT_HEIGHT}px`, 
                                      height: `${SUB_SLOT_HEIGHT}px`,
                                      zIndex: 1
                                    }}
                                    onClick={() => !isPast && !hasExistingSession && handleSlotClick(day, hour, minute)}
                                    data-testid={`slot-${format(day, "yyyy-MM-dd")}-${hour}-${minute}`}
                                  />
                                );
                              })}
                              
                              {/* Render unmatched sessions - only show profile pictures */}
                              {slotSessions.map((session) => {
                                const { top, height } = getSessionPosition(session, day, hour);
                                const host = session.participants?.find(p => p.id === session.hostId);
                                const displayName = host && (host.firstName && host.lastName
                                  ? `${host.firstName} ${host.lastName}`
                                  : host.username || "Anonymous") || "Anonymous";
                                const initials = host && (host.firstName && host.lastName
                                  ? `${host.firstName[0]}${host.lastName[0]}`.toUpperCase()
                                  : host.username?.[0]?.toUpperCase() || "?") || "?";
                                
                                const avatarSize = 40;
                                const avatarTop = top + (SUB_SLOT_HEIGHT - avatarSize) / 2;
                                
                                return (
                                  <div
                                    key={session.id}
                                    className="absolute cursor-pointer rounded-lg transition-colors hover:bg-primary/10"
                                    style={{ 
                                      top: `${top}px`, 
                                      height: `${height}px`,
                                      left: 0,
                                      right: 0,
                                      zIndex: 5
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // Open booking dialog to join this session
                                      const sessionStart = parseISO(session.startAt);
                                      handleSlotClick(
                                        new Date(sessionStart),
                                        sessionStart.getHours(),
                                        sessionStart.getMinutes(),
                                        session
                                      );
                                    }}
                                    data-testid={`session-slot-${session.id}`}
                                  >
                                    {/* Centered profile picture */}
                                    <div
                                      className="absolute"
                                      style={{ top: `${avatarTop - top}px`, left: "50%", transform: "translateX(-50%)" }}
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
                                            <p className="text-xs text-muted-foreground">Click to book & match</p>
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
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Schedule Session Dialog - Shows filter values as labels */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {selectedSession ? "Join This Session" : "Book a Work Session"}
            </DialogTitle>
            <DialogDescription>
              {selectedSlot && (
                <>
                  {format(selectedSlot.day, "EEE, MMM dd, yyyy")} at{" "}
                  {format(new Date().setHours(selectedSlot.hour, selectedSlot.minute, 0, 0), "h:mm a")}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Non-editable labels showing current filter values */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Session Type</Label>
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{sessionTypeLabels[filterSessionType]}</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Preference</Label>
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted">
                  {filterPreference === 'desk' && <Monitor className="h-4 w-4 text-muted-foreground" />}
                  {filterPreference === 'active' && <Activity className="h-4 w-4 text-muted-foreground" />}
                  {filterPreference === 'any' && <Shuffle className="h-4 w-4 text-muted-foreground" />}
                  <span className="text-sm font-medium">{preferenceLabels[filterPreference]}</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Duration</Label>
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{filterDuration} min</span>
                </div>
              </div>
            </div>

            {selectedSession && (
              <div className="p-3 rounded-md bg-muted/50 border">
                <p className="text-sm">
                  <span className="text-muted-foreground">Joining session with:</span>{" "}
                  <span className="font-medium">
                    {selectedSession.participants?.find(p => p.id === selectedSession.hostId)?.firstName || "Someone"}
                  </span>
                </p>
              </div>
            )}

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
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
                setSelectedSession(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              onClick={handleCreateSession}
              disabled={createSessionMutation.isPending}
              data-testid="button-create-session"
            >
              {createSessionMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {selectedSession ? "Book & Match" : "Book Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Match Confirmation Dialog */}
      <Dialog open={isMatchDialogOpen} onOpenChange={setIsMatchDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-center">You've Been Matched!</DialogTitle>
            <DialogDescription className="text-center">
              Your work session partner is ready
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center py-6">
            {matchedPartner && (
              <>
                <Avatar className="h-24 w-24 border-4 border-primary/20">
                  <AvatarImage src={matchedPartner.profileImageUrl || undefined} />
                  <AvatarFallback className="text-2xl">
                    {matchedPartner.firstName?.[0] || matchedPartner.username?.[0] || '?'}
                  </AvatarFallback>
                </Avatar>
                <p className="mt-4 text-lg font-semibold">
                  {matchedPartner.firstName && matchedPartner.lastName
                    ? `${matchedPartner.firstName} ${matchedPartner.lastName}`
                    : matchedPartner.username || "Your Partner"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Will be your accountability partner
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              className="w-full"
              onClick={() => {
                setIsMatchDialogOpen(false);
                setMatchedPartner(null);
              }}
            >
              Got it!
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
