import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Save, Briefcase, Activity, Sparkles, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";

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

export default function Profile() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [preference, setPreference] = useState<string>("any");

  // Fetch full profile data
  const { data: profile, isLoading: profileLoading } = useQuery<UserProfile>({
    queryKey: ['/api/user/profile'],
    enabled: isAuthenticated,
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "Please log in to view your profile.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  // Set initial values from profile
  useEffect(() => {
    if (profile) {
      if (profile.username) {
        setUsername(profile.username);
      }
      setPreference(profile.preference || 'any');
    }
  }, [profile]);

  const updateUsernameMutation = useMutation({
    mutationFn: async (newUsername: string) => {
      return apiRequest("PATCH", "/api/user/username", { username: newUsername });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      toast({
        title: "Username updated",
        description: "Your username has been successfully updated.",
      });
    },
    onError: (error: any) => {
      if (isUnauthorizedError(error)) {
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
        description: error.message || "Failed to update username.",
        variant: "destructive",
      });
    },
  });

  const updatePreferenceMutation = useMutation({
    mutationFn: async (newPreference: string) => {
      return apiRequest("PATCH", "/api/user/preferences", { preference: newPreference });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      toast({
        title: "Preference updated",
        description: "Your work preference has been successfully updated.",
      });
    },
    onError: (error: any) => {
      if (isUnauthorizedError(error)) {
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
        description: error.message || "Failed to update preference.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    // Validate username (always validate if different from profile, including null to empty transitions)
    const currentUsername = profile?.username || "";
    if (username !== currentUsername) {
      if (!username || username.trim().length < 3) {
        toast({
          title: "Invalid username",
          description: "Username must be at least 3 characters.",
          variant: "destructive",
        });
        return;
      }
    }

    const promises = [];

    // Update username if changed
    if (username !== currentUsername) {
      promises.push(updateUsernameMutation.mutateAsync(username));
    }

    // Update preference if changed
    if (preference !== profile?.preference) {
      promises.push(updatePreferenceMutation.mutateAsync(preference));
    }

    if (promises.length === 0) {
      toast({
        title: "No changes",
        description: "No changes were made to your profile.",
      });
      return;
    }

    Promise.all(promises).catch(() => {
      // Errors are handled in the mutation onError callbacks
    });
  };

  const getPreferenceIcon = (pref: string) => {
    switch (pref) {
      case 'desk': return <Briefcase className="h-4 w-4" />;
      case 'active': return <Activity className="h-4 w-4" />;
      case 'any': return <Sparkles className="h-4 w-4" />;
      default: return null;
    }
  };

  const getPreferenceLabel = (pref: string) => {
    switch (pref) {
      case 'desk': return 'Desk Work';
      case 'active': return 'Active Work';
      case 'any': return 'Any Style';
      default: return pref;
    }
  };

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const initials = user?.firstName && user?.lastName 
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : user?.email?.[0]?.toUpperCase() || "?";

  const displayName = user?.firstName && user?.lastName 
    ? `${user.firstName} ${user.lastName}`
    : user?.email?.split("@")[0] || "User";

  const hasChanges = username !== profile?.username || preference !== profile?.preference;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-semibold">Profile Settings</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <Card>
          <CardHeader className="text-center">
            <Avatar className="h-24 w-24 mx-auto mb-4">
              <AvatarImage src={user?.profileImageUrl || undefined} />
              <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
            </Avatar>
            <CardTitle className="text-2xl">{displayName}</CardTitle>
            <CardDescription className="text-base">{user?.email}</CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session Statistics</CardTitle>
            <CardDescription>Your focus session activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
              <Calendar className="h-8 w-8 text-muted-foreground" />
              <div>
                <div className="text-2xl font-semibold">{profile?.bookingCount || 0}</div>
                <div className="text-sm text-muted-foreground">Sessions Booked</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account Settings</CardTitle>
            <CardDescription>Update your profile information and preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter a username"
                data-testid="input-username"
              />
              <p className="text-xs text-muted-foreground">
                Your username will be visible to other users during sessions.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="preference">Work Preference</Label>
              <Select value={preference} onValueChange={setPreference}>
                <SelectTrigger id="preference" data-testid="select-preference">
                  <SelectValue>
                    <div className="flex items-center gap-2">
                      {getPreferenceIcon(preference)}
                      <span>{getPreferenceLabel(preference)}</span>
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desk" data-testid="option-desk">
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      <div>
                        <div className="font-medium">Desk Work</div>
                        <div className="text-xs text-muted-foreground">Focused desk-based tasks</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="active" data-testid="option-active">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      <div>
                        <div className="font-medium">Active Work</div>
                        <div className="text-xs text-muted-foreground">Movement & hands-on work</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="any" data-testid="option-any">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      <div>
                        <div className="font-medium">Any Style</div>
                        <div className="text-xs text-muted-foreground">Match with any preference</div>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Your preference helps match you with compatible session partners.
              </p>
            </div>

            <Button 
              className="w-full" 
              onClick={handleSave}
              disabled={updateUsernameMutation.isPending || updatePreferenceMutation.isPending || !hasChanges}
              data-testid="button-save"
            >
              {(updateUsernameMutation.isPending || updatePreferenceMutation.isPending) ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Changes
            </Button>

            <div className="pt-4 border-t">
              <Button variant="outline" className="w-full" asChild>
                <a href="/api/logout" data-testid="button-logout">Sign Out</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
