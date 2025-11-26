import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Calendar as CalendarIcon, Clock, Users, Loader2, Plus } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, addHours } from "date-fns";

type ScheduledSession = {
  id: string;
  hostId: string;
  sessionType: string;
  title: string | null;
  description: string | null;
  capacity: number;
  startAt: string;
  endAt: string;
  status: string;
  participantCount?: number;
};

export default function CalendarPage() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Form state
  const [sessionType, setSessionType] = useState<string>("solo");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState<number>(2);
  const [startTime, setStartTime] = useState("12:00");
  const [duration, setDuration] = useState(60);
  const [filterType, setFilterType] = useState<'all' | 'solo' | 'group'>('all');

  // Update filter and form defaults when URL changes
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const urlSessionType = searchParams.get('type') as 'solo' | 'group' | null;
    
    console.log('[Calendar] URL params:', window.location.search, 'type:', urlSessionType);
    
    if (urlSessionType) {
      setFilterType(urlSessionType);
      setSessionType(urlSessionType);
      setCapacity(urlSessionType === 'group' ? 5 : 2);
    } else {
      setFilterType('all');
    }
  }, [location]);

  // Get sessions for the selected month
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);

  const { data: sessions, isLoading } = useQuery<ScheduledSession[]>({
    queryKey: ['/api/scheduled-sessions', monthStart.toISOString(), monthEnd.toISOString()],
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

  // Get user's scheduled sessions
  const { data: mySessions } = useQuery<ScheduledSession[]>({
    queryKey: ['/api/scheduled-sessions/my-sessions'],
  });

  const createSessionMutation = useMutation({
    mutationFn: async (data: {
      sessionType: string;
      title: string;
      description: string;
      capacity: number;
      startAt: string;
      endAt: string;
    }) => {
      return apiRequest("POST", "/api/scheduled-sessions", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/scheduled-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduled-sessions/my-sessions'] });
      setIsDialogOpen(false);
      toast({
        title: "Session scheduled",
        description: "Your work session has been scheduled successfully.",
      });
      // Reset form
      setTitle("");
      setDescription("");
      setStartTime("12:00");
      setDuration(60);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to schedule session",
        variant: "destructive",
      });
    },
  });

  const joinSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      return apiRequest("POST", `/api/scheduled-sessions/${sessionId}/join`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/scheduled-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/scheduled-sessions/my-sessions'] });
      toast({
        title: "Joined session",
        description: "You've successfully joined the work session.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to join session",
        variant: "destructive",
      });
    },
  });

  const handleCreateSession = () => {
    if (!selectedDate) {
      toast({
        title: "Error",
        description: "Please select a date",
        variant: "destructive",
      });
      return;
    }

    const [hours, minutes] = startTime.split(':').map(Number);
    const startAt = new Date(selectedDate);
    startAt.setHours(hours, minutes, 0, 0);

    const endAt = addHours(startAt, duration / 60);

    createSessionMutation.mutate({
      sessionType,
      title,
      description,
      capacity,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
    });
  };

  // Filter sessions for selected date and type
  const selectedDaySessions = sessions?.filter((session) => {
    const sessionDate = new Date(session.startAt);
    const selected = startOfDay(selectedDate);
    const selectedEnd = endOfDay(selectedDate);
    const dateMatch = sessionDate >= selected && sessionDate <= selectedEnd;
    const typeMatch = filterType === 'all' || session.sessionType === filterType;
    return dateMatch && typeMatch;
  }) || [];

  const maxCapacity = sessionType === 'solo' ? 2 : 5;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
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

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Calendar Section */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Select a Date</CardTitle>
                <CardDescription>
                  Choose a date to view or schedule sessions
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  className="rounded-md border"
                  data-testid="calendar-picker"
                />
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>My Upcoming Sessions</CardTitle>
                <CardDescription>
                  Sessions you've scheduled or joined
                </CardDescription>
              </CardHeader>
              <CardContent>
                {mySessions && mySessions.length > 0 ? (
                  <div className="space-y-3">
                    {mySessions.slice(0, 5).map((session) => (
                      <div key={session.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div>
                          <p className="font-medium">{session.title || "Work Session"}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(session.startAt), "MMM dd, h:mm a")}
                          </p>
                        </div>
                        <Badge variant="outline">
                          {session.participantCount}/{session.capacity}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No upcoming sessions
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sessions for Selected Date */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                {format(selectedDate, "MMMM dd, yyyy")}
              </h2>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-schedule-session">
                    <Plus className="mr-2 h-4 w-4" />
                    Schedule Session
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Schedule a Work Session</DialogTitle>
                    <DialogDescription>
                      Create a scheduled session for {format(selectedDate, "MMM dd, yyyy")}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="session-type">Session Type</Label>
                      <Select value={sessionType} onValueChange={(value) => {
                        setSessionType(value);
                        const newMax = value === 'solo' ? 2 : value === 'group' ? 5 : 10;
                        setCapacity(newMax);
                      }}>
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
                      <Label htmlFor="title">Title</Label>
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="start-time">Start Time</Label>
                        <Input
                          id="start-time"
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          data-testid="input-start-time"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="duration">Duration (min)</Label>
                        <Select value={duration.toString()} onValueChange={(value) => setDuration(Number(value))}>
                          <SelectTrigger data-testid="select-duration">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="30">30 min</SelectItem>
                            <SelectItem value="60">1 hour</SelectItem>
                            <SelectItem value="90">1.5 hours</SelectItem>
                            <SelectItem value="120">2 hours</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="capacity">Capacity: {capacity} people</Label>
                      <Input
                        id="capacity"
                        type="number"
                        min={2}
                        max={maxCapacity}
                        value={capacity}
                        onChange={(e) => setCapacity(Number(e.target.value))}
                        data-testid="input-capacity"
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
                      Schedule Session
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Session Type Filter Tabs */}
            <Tabs value={filterType} onValueChange={(value) => setFilterType(value as 'all' | 'solo' | 'group')} className="mb-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all" data-testid="tab-all">All Sessions</TabsTrigger>
                <TabsTrigger value="solo" data-testid="tab-solo">Solo (1-on-1)</TabsTrigger>
                <TabsTrigger value="group" data-testid="tab-group">Group</TabsTrigger>
              </TabsList>
            </Tabs>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : selectedDaySessions.length > 0 ? (
              <div className="space-y-4">
                {selectedDaySessions.map((session) => (
                  <Card key={session.id} data-testid={`session-${session.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {session.title || "Work Session"}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-1">
                            <Clock className="h-4 w-4" />
                            {format(new Date(session.startAt), "h:mm a")} -{" "}
                            {format(new Date(session.endAt), "h:mm a")}
                          </CardDescription>
                        </div>
                        <Badge>
                          {session.sessionType === 'solo' ? '1-on-1' :
                           session.sessionType === 'group' ? 'Group' : 'Free Room'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {session.description && (
                        <p className="text-sm text-muted-foreground mb-3">
                          {session.description}
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {session.participantCount || 0}/{session.capacity} joined
                          </span>
                        </div>
                        {session.hostId === user?.id ? (
                          <Badge variant="secondary">Host</Badge>
                        ) : (
                          <Button 
                            size="sm" 
                            onClick={() => joinSessionMutation.mutate(session.id)}
                            disabled={joinSessionMutation.isPending}
                            data-testid={`button-join-${session.id}`}
                          >
                            {joinSessionMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            Join Session
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center text-muted-foreground">
                    <CalendarIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No sessions scheduled for this date</p>
                    <p className="text-sm mt-1">Click "Schedule Session" to create one</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
