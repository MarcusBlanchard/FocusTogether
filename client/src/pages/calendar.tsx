import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Calendar as CalendarIcon, Clock, Users, Monitor, Activity, Shuffle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format, startOfWeek, addDays, addWeeks, startOfDay, isSameDay, addMinutes, parseISO } from "date-fns";

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
const TIME_SLOT_HEIGHT = 80; // pixels per hour

export default function CalendarPage() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(
    startOfWeek(new Date(), { weekStartsOn: 1 }) // Monday
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ day: Date; hour: number; minute: number } | null>(null);

  // Form state
  const [sessionType, setSessionType] = useState<string>("solo");
  const [bookingPreference, setBookingPreference] = useState<string>("desk");
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  
  // Filter state - no "All" option, defaults to Solo
  const [filterSessionType, setFilterSessionType] = useState<'solo' | 'group'>('solo');
  const [filterPreference, setFilterPreference] = useState<BookingPreference>('desk');
  const [filterDuration, setFilterDuration] = useState<SessionDuration>(60);

  // Update filter and form defaults when URL changes
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const urlSessionType = searchParams.get('type') as 'solo' | 'group' | null;
    
    if (urlSessionType) {
      setFilterSessionType(urlSessionType);
      setSessionType(urlSessionType);
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
        toast({
          title: "Matched!",
          description: response.message || "You've been matched with an existing session.",
        });
        // Navigate to the matched session
        setLocation(`/session/${response.session.id}`);
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

    // Validate booking is in the future
    if (startAt <= new Date()) {
      toast({
        title: "Error",
        description: "Cannot schedule sessions in the past",
        variant: "destructive",
      });
      return;
    }

    createSessionMutation.mutate({
      sessionType,
      bookingPreference,
      durationMinutes,
      title: title || undefined,
      description: description || undefined,
      startAt: startAt.toISOString(),
    });
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));

  // Helper to check if preferences are compatible for matching
  const arePreferencesCompatible = (sessionPref: string, filterPref: BookingPreference): boolean => {
    // "Any" matches with everything
    if (filterPref === 'any' || sessionPref === 'any') return true;
    // Exact match
    if (sessionPref === filterPref) return true;
    return false;
  };

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
      
      // Check if session overlaps with this hour slot
      const overlaps = sessionStart < slotEnd && sessionEnd > slotStart;
      
      // Filter by session type (Solo/Group)
      const typeMatch = session.sessionType === filterSessionType;
      
      // Filter by compatible booking preference (Desk ↔ Any, Active ↔ Any)
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

  const preferenceColors = {
    desk: "bg-blue-500/20 dark:bg-blue-500/30 border-blue-500 dark:border-blue-400 text-blue-900 dark:text-blue-100",
    active: "bg-green-500/20 dark:bg-green-500/30 border-green-500 dark:border-green-400 text-green-900 dark:text-green-100",
    any: "bg-purple-500/20 dark:bg-purple-500/30 border-purple-500 dark:border-purple-400 text-purple-900 dark:text-purple-100",
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

      <main className="max-w-full mx-auto px-4 py-6">
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
            {/* Session Type Filter (Solo/Group) */}
            <div className="flex items-center gap-1 bg-muted rounded-md p-1">
              <Button
                variant={filterSessionType === 'solo' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => {
                  setFilterSessionType('solo');
                  setSessionType('solo');
                }}
                data-testid="filter-solo"
                className="h-7 px-3"
              >
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Solo
              </Button>
              <Button
                variant={filterSessionType === 'group' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => {
                  setFilterSessionType('group');
                  setSessionType('group');
                }}
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
                onClick={() => {
                  setFilterPreference('desk');
                  setBookingPreference('desk');
                }}
                data-testid="filter-desk"
                className="h-7 px-3"
              >
                <Monitor className="h-3.5 w-3.5 mr-1.5" />
                Desk
              </Button>
              <Button
                variant={filterPreference === 'active' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => {
                  setFilterPreference('active');
                  setBookingPreference('active');
                }}
                data-testid="filter-active"
                className="h-7 px-3"
              >
                <Activity className="h-3.5 w-3.5 mr-1.5" />
                Active
              </Button>
              <Button
                variant={filterPreference === 'any' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => {
                  setFilterPreference('any');
                  setBookingPreference('any');
                }}
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
                  onClick={() => {
                    setFilterDuration(duration);
                    setDurationMinutes(duration);
                  }}
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
              <div className="min-w-[800px]">
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
                              const isPast = new Date(day).setHours(hour, minute, 0, 0) < new Date().getTime();
                              const hasExistingSession = slotSessions.some((session) => {
                                const sessionStart = parseISO(session.startAt);
                                return sessionStart.getHours() === hour && sessionStart.getMinutes() === minute;
                              });
                              
                              return (
                                <div
                                  key={minute}
                                  className={`absolute w-full cursor-pointer transition-colors hover:bg-primary/10 ${
                                    minuteIndex > 0 ? "border-t border-border/30" : ""
                                  } ${isPast ? "bg-muted/30 hover:bg-muted/40" : ""} ${hasExistingSession ? "pointer-events-none" : ""}`}
                                  style={{ 
                                    top: `${minuteIndex * 20}px`, 
                                    height: "20px",
                                    zIndex: 1
                                  }}
                                  onClick={() => !isPast && !hasExistingSession && handleSlotClick(day, hour, minute)}
                                  data-testid={`slot-${format(day, "yyyy-MM-dd")}-${hour}-${minute}`}
                                />
                              );
                            })}
                            
                            {/* Render sessions on top of sub-slots */}
                            {/* Render sessions in this slot */}
                            {slotSessions.map((session) => {
                              const { top, height } = getSessionPosition(session, day, hour);
                              const isHost = session.hostId === user?.id;
                              const isParticipant = session.participants?.some(p => p.id === user?.id) || isHost;
                              
                              // For other people's bookings, show only profile pictures
                              if (!isParticipant) {
                                return (
                                  <div
                                    key={session.id}
                                    className="absolute left-1 right-1 overflow-hidden cursor-pointer flex items-center justify-center"
                                    style={{ top: `${top}px`, height: `${height}px`, zIndex: 10 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setLocation(`/session/${session.id}`);
                                    }}
                                    data-testid={`session-${session.id}`}
                                  >
                                    {/* Show only participant avatars for other people's sessions */}
                                    {session.participants && session.participants.length > 0 ? (
                                      <TooltipProvider>
                                        <div className="flex items-center justify-center flex-wrap gap-0.5">
                                          {session.participants.slice(0, session.durationMinutes >= 60 ? 5 : session.durationMinutes >= 40 ? 4 : 2).map((participant, idx) => {
                                            const displayName = participant.firstName && participant.lastName
                                              ? `${participant.firstName} ${participant.lastName}`
                                              : participant.username || "Anonymous";
                                            const initials = participant.firstName && participant.lastName
                                              ? `${participant.firstName[0]}${participant.lastName[0]}`.toUpperCase()
                                              : participant.username?.[0]?.toUpperCase() || "?";
                                            const avatarSize = session.durationMinutes >= 60 ? "h-7 w-7" : session.durationMinutes >= 40 ? "h-6 w-6" : "h-5 w-5";
                                            
                                            return (
                                              <Tooltip key={participant.id}>
                                                <TooltipTrigger asChild>
                                                  <div className={idx > 0 ? "-ml-2" : ""}>
                                                    <Avatar className={`${avatarSize} border-2 border-background`}>
                                                      <AvatarImage src={participant.profileImageUrl || undefined} />
                                                      <AvatarFallback className="text-[9px] font-medium">{initials}</AvatarFallback>
                                                    </Avatar>
                                                  </div>
                                                </TooltipTrigger>
                                                <TooltipContent side="top">
                                                  <p className="text-xs">{displayName}</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            );
                                          })}
                                          {session.participants.length > (session.durationMinutes >= 60 ? 5 : session.durationMinutes >= 40 ? 4 : 2) && (
                                            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 -ml-1">
                                              +{session.participants.length - (session.durationMinutes >= 60 ? 5 : session.durationMinutes >= 40 ? 4 : 2)}
                                            </Badge>
                                          )}
                                        </div>
                                      </TooltipProvider>
                                    ) : null}
                                  </div>
                                );
                              }
                              
                              // For user's own sessions, show full details
                              return (
                                <div
                                  key={session.id}
                                  className={`absolute left-1 right-1 rounded border-l-4 p-1 text-xs overflow-hidden cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] active:scale-100 ${
                                    preferenceColors[session.bookingPreference as keyof typeof preferenceColors]
                                  }`}
                                  style={{ top: `${top}px`, height: `${height}px`, zIndex: 10 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLocation(`/session/${session.id}`);
                                  }}
                                  data-testid={`session-${session.id}`}
                                >
                                  <div className="font-medium truncate">
                                    {session.title || `${session.sessionType} Session`}
                                  </div>
                                  <div className="text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {session.durationMinutes}m
                                  </div>
                                  
                                  {/* Participant avatars or count */}
                                  {session.participants && session.participants.length > 0 ? (
                                    <TooltipProvider>
                                      <div className="flex items-center gap-1 mt-0.5">
                                        {/* Show different number of avatars based on session height */}
                                        {session.participants.slice(0, session.durationMinutes >= 60 ? 4 : session.durationMinutes >= 40 ? 3 : 1).map((participant, idx) => {
                                          const displayName = participant.firstName && participant.lastName
                                            ? `${participant.firstName} ${participant.lastName}`
                                            : participant.username || "Anonymous";
                                          const initials = participant.firstName && participant.lastName
                                            ? `${participant.firstName[0]}${participant.lastName[0]}`.toUpperCase()
                                            : participant.username?.[0]?.toUpperCase() || "?";
                                          const avatarSize = session.durationMinutes >= 40 ? "h-5 w-5" : "h-4 w-4";
                                          
                                          return (
                                            <Tooltip key={participant.id}>
                                              <TooltipTrigger asChild>
                                                <div className={idx > 0 ? "-ml-1.5" : ""}>
                                                  <Avatar className={`${avatarSize} border border-background`}>
                                                    <AvatarImage src={participant.profileImageUrl || undefined} />
                                                    <AvatarFallback className="text-[8px]">{initials}</AvatarFallback>
                                                  </Avatar>
                                                </div>
                                              </TooltipTrigger>
                                              <TooltipContent side="top">
                                                <p className="text-xs">{displayName}</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          );
                                        })}
                                        {/* Show overflow count */}
                                        {session.participants.length > (session.durationMinutes >= 60 ? 4 : session.durationMinutes >= 40 ? 3 : 1) && (
                                          <Badge variant="secondary" className="text-[10px] h-4 px-1 -ml-1">
                                            +{session.participants.length - (session.durationMinutes >= 60 ? 4 : session.durationMinutes >= 40 ? 3 : 1)}
                                          </Badge>
                                        )}
                                      </div>
                                    </TooltipProvider>
                                  ) : (
                                    <div className="text-muted-foreground flex items-center gap-1">
                                      <Users className="h-3 w-3" />
                                      {session.participantCount || 0}/{session.capacity}
                                    </div>
                                  )}
                                  
                                  {isHost && (
                                    <Badge variant="secondary" className="text-xs mt-1">Host</Badge>
                                  )}
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

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          <span className="font-medium text-muted-foreground">Work Preferences:</span>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-l-4 bg-blue-500/20 dark:bg-blue-500/30 border-blue-500"></div>
            <span>Desk</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-l-4 bg-green-500/20 dark:bg-green-500/30 border-green-500"></div>
            <span>Active</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-l-4 bg-purple-500/20 dark:bg-purple-500/30 border-purple-500"></div>
            <span>Any</span>
          </div>
        </div>

        {/* Schedule Session Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Schedule a Work Session</DialogTitle>
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
              <div className="grid gap-2">
                <Label htmlFor="session-type">Session Type</Label>
                <Select value={sessionType} onValueChange={setSessionType}>
                  <SelectTrigger data-testid="select-session-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solo">Solo (1-on-1)</SelectItem>
                    <SelectItem value="group">Group (up to 5)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="booking-preference">Booking Preference</Label>
                <Select value={bookingPreference} onValueChange={setBookingPreference}>
                  <SelectTrigger data-testid="select-booking-preference">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desk">Desk Work (matches with Desk or Any)</SelectItem>
                    <SelectItem value="active">Active (matches with Active or Any)</SelectItem>
                    <SelectItem value="any">Any (matches with all)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="duration">Session Length</Label>
                <Select value={durationMinutes.toString()} onValueChange={(value) => setDurationMinutes(Number(value))}>
                  <SelectTrigger data-testid="select-duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20 minutes</SelectItem>
                    <SelectItem value="40">40 minutes</SelectItem>
                    <SelectItem value="60">60 minutes</SelectItem>
                    <SelectItem value="120">120 minutes (2 hours)</SelectItem>
                  </SelectContent>
                </Select>
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
      </main>
    </div>
  );
}
