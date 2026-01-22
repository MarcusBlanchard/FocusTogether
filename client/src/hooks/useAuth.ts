import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
    // Gracefully handle network errors when backend is unavailable
    throwOnError: false,
  });

  // If there's a network error (backend unavailable), treat as unauthenticated
  const isAuthenticated = !error && !!user;

  return {
    user,
    isLoading,
    isAuthenticated,
  };
}
