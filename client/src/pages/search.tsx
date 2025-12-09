import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Search as SearchIcon, UserPlus, Check, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { User } from "@shared/schema";

function useDebounceValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function SearchPage() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebounceValue(searchQuery, 300);
  const [addedFriends, setAddedFriends] = useState<Set<string>>(new Set());

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "Please log in to search users.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  const { data: searchResults, isLoading: isSearching } = useQuery<User[]>({
    queryKey: ["/api/users/search", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return [];
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(debouncedQuery)}`);
      if (!response.ok) throw new Error("Search failed");
      return response.json();
    },
    enabled: isAuthenticated && debouncedQuery.length >= 2,
  });

  const addFriendMutation = useMutation({
    mutationFn: async (friendId: string) => {
      return apiRequest("POST", "/api/friends", { friendId });
    },
    onSuccess: (_, friendId) => {
      setAddedFriends((prev) => new Set(Array.from(prev).concat(friendId)));
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
        description: "Failed to add friend. They may already be your friend.",
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
          <h1 className="text-2xl font-semibold flex-1">Find Users</h1>
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
        <div className="relative mb-6">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>

        {searchQuery.length > 0 && searchQuery.length < 2 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Type at least 2 characters to search
          </p>
        )}

        {isSearching && debouncedQuery.length >= 2 && (
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
        )}

        {!isSearching && searchResults && searchResults.length > 0 && (
          <div className="space-y-4">
            {searchResults.map((result) => {
              const initials = result.firstName && result.lastName
                ? `${result.firstName[0]}${result.lastName[0]}`.toUpperCase()
                : result.username?.[0]?.toUpperCase() || result.email?.[0]?.toUpperCase() || "?";
              
              const displayName = result.username || result.firstName || result.email?.split("@")[0] || "User";
              const isAdded = addedFriends.has(result.id);

              return (
                <Card key={result.id} data-testid={`card-user-${result.id}`}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={result.profileImageUrl || undefined} />
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1">
                      <span className="font-medium">{displayName}</span>
                      {result.email && (
                        <p className="text-sm text-muted-foreground">{result.email}</p>
                      )}
                    </div>

                    {isAdded ? (
                      <Badge variant="secondary" className="gap-1">
                        <Check className="h-3 w-3" />
                        Added
                      </Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addFriendMutation.mutate(result.id)}
                        disabled={addFriendMutation.isPending}
                        data-testid={`button-add-${result.id}`}
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
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {!isSearching && debouncedQuery.length >= 2 && searchResults && searchResults.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <SearchIcon className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No users found</h3>
              <p className="text-muted-foreground text-center">
                Try searching for a different username.
              </p>
            </CardContent>
          </Card>
        )}

        {!searchQuery && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <SearchIcon className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Search for users</h3>
              <p className="text-muted-foreground text-center">
                Enter a username to find and add new friends.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
