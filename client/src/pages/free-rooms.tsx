import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Users, ArrowLeft, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { notifySessionJoined } from "@/lib/activity-session";

interface FreeRoom {
  sessionId: string;
  title: string;
  participantCount: number;
  maxCapacity: number;
  hostId: string;
}

export default function FreeRooms() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [roomTitle, setRoomTitle] = useState("");
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<{ rooms: FreeRoom[] }>({
    queryKey: ['/api/free-rooms'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const createRoomMutation = useMutation({
    mutationFn: async (title: string) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0d09f34b-23d1-43a5-b99f-c422e61992fc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'free-rooms.tsx:46',message:'createRoomMutation.mutationFn called',data:{title},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return apiRequest("POST", "/api/free-rooms", { title });
    },
    onSuccess: (data: any) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0d09f34b-23d1-43a5-b99f-c422e61992fc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'free-rooms.tsx:49',message:'createRoomMutation.onSuccess called',data:{hasSessionId:!!(data?.sessionId || data?.data?.sessionId),sessionId:data?.sessionId || data?.data?.sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      console.log('[FreeRooms] Create room response:', data);
      queryClient.invalidateQueries({ queryKey: ['/api/free-rooms'] });
      setCreateDialogOpen(false);
      setRoomTitle("");
      
      // Extract sessionId from response
      const sessionId = data?.sessionId || data?.data?.sessionId;
      
      if (!sessionId) {
        console.error('[FreeRooms] No sessionId in response:', data);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to get session ID from server.",
        });
        return;
      }
      
      // Navigate to session page
      toast({
        title: "Room Created",
        description: "Your free room has been created. Connecting...",
      });
      
      setTimeout(() => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/0d09f34b-23d1-43a5-b99f-c422e61992fc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'free-rooms.tsx:74',message:'About to call notifySessionJoined in createRoom',data:{sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        console.log('[FreeRooms] Navigating to session:', sessionId);
        // Notify backend that user joined session
        notifySessionJoined(sessionId);
        setLocation(`/session/${sessionId}`);
      }, 500);
    },
    onError: (error: any) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0d09f34b-23d1-43a5-b99f-c422e61992fc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'free-rooms.tsx:84',message:'createRoomMutation.onError called',data:{error:error?.message || String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create room. Please try again.",
      });
    },
  });

  const joinRoomMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0d09f34b-23d1-43a5-b99f-c422e61992fc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'free-rooms.tsx:93',message:'joinRoomMutation.mutationFn called',data:{sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return apiRequest("POST", `/api/free-rooms/${sessionId}/join`, {});
    },
    onSuccess: (data: any, sessionId: string) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0d09f34b-23d1-43a5-b99f-c422e61992fc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'free-rooms.tsx:97',message:'joinRoomMutation.onSuccess called',data:{sessionId,success:data?.success},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      if (data.success) {
        toast({
          title: "Joining Room",
          description: "Connecting to room...",
        });
        
        setTimeout(() => {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/0d09f34b-23d1-43a5-b99f-c422e61992fc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'free-rooms.tsx:98',message:'About to call notifySessionJoined in joinRoom',data:{sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          // Notify backend that user joined session
          notifySessionJoined(sessionId);
          setLocation(`/session/${sessionId}`);
        }, 500);
      } else {
        toast({
          variant: "destructive",
          title: "Failed to Join",
          description: "Room is full or no longer available.",
        });
      }
    },
    onError: (error: any) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0d09f34b-23d1-43a5-b99f-c422e61992fc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'free-rooms.tsx:120',message:'joinRoomMutation.onError called',data:{error:error?.message || String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to join room. Please try again.",
      });
    },
  });

  const handleCreateRoom = () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/0d09f34b-23d1-43a5-b99f-c422e61992fc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'free-rooms.tsx:129',message:'handleCreateRoom called',data:{roomTitle},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (!roomTitle.trim()) {
      toast({
        variant: "destructive",
        title: "Title Required",
        description: "Please enter a room title.",
      });
      return;
    }
    
    createRoomMutation.mutate(roomTitle);
  };

  const handleJoinRoom = (sessionId: string) => {
    joinRoomMutation.mutate(sessionId);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const rooms = data?.rooms || [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setLocation("/")}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-semibold">Free Rooms</h1>
          </div>
          
          <div className="flex items-center gap-2">
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={isLoading}
              data-testid="button-refresh"
            >
              <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-room">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Room
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create a Free Room</DialogTitle>
                  <DialogDescription>
                    Create an open room where up to 10 people can join and work together.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="room-title">Room Title</Label>
                    <Input
                      id="room-title"
                      placeholder="Enter room title"
                      value={roomTitle}
                      onChange={(e) => setRoomTitle(e.target.value)}
                      data-testid="input-room-title"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="ghost"
                    onClick={() => setCreateDialogOpen(false)}
                    data-testid="button-cancel-create"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateRoom}
                    disabled={createRoomMutation.isPending}
                    data-testid="button-confirm-create"
                  >
                    {createRoomMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Room"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No Active Rooms</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Be the first to create a free room for focused work!
            </p>
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-room">
              <Plus className="mr-2 h-4 w-4" />
              Create First Room
            </Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room) => (
              <Card 
                key={room.sessionId} 
                className="hover-elevate"
                data-testid={`card-room-${room.sessionId}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">{room.title}</CardTitle>
                    <Badge 
                      variant={room.participantCount >= room.maxCapacity * 0.8 ? "destructive" : "secondary"}
                      data-testid={`badge-capacity-${room.sessionId}`}
                    >
                      {room.participantCount}/{room.maxCapacity}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                    <Users className="h-4 w-4" />
                    <span>
                      {room.participantCount} {room.participantCount === 1 ? 'participant' : 'participants'}
                    </span>
                  </div>
                  
                  <Button 
                    className="w-full"
                    onClick={() => handleJoinRoom(room.sessionId)}
                    disabled={
                      joinRoomMutation.isPending || 
                      room.participantCount >= room.maxCapacity ||
                      room.hostId === user?.id
                    }
                    data-testid={`button-join-${room.sessionId}`}
                  >
                    {joinRoomMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Joining...
                      </>
                    ) : room.participantCount >= room.maxCapacity ? (
                      "Room Full"
                    ) : room.hostId === user?.id ? (
                      "Your Room"
                    ) : (
                      "Join Room"
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
