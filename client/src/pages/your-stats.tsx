import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Loader2, BarChart3 } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { useToast } from "@/hooks/use-toast";
import { FriendsStatsNav } from "@/components/friends-stats-nav";
import { format, parseISO } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface DailySeriesResponse {
  longSessionsOnly: boolean;
  series: Array<{ date: string; distractions: number }>;
}

interface FocusTotalsResponse {
  idleWarningCount: number;
  distractionCount: number;
}

export default function YourStats() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [longSessionsOnly, setLongSessionsOnly] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "Please log in to view your stats.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  const { data: totals, isLoading: totalsLoading } = useQuery<FocusTotalsResponse>({
    queryKey: ["/api/focus-stats", user?.id],
    enabled: isAuthenticated && !!user?.id,
    queryFn: async () =>
      apiRequest(
        "GET",
        `/api/focus-stats?userId=${encodeURIComponent(user!.id)}`,
      ),
  });

  const { data: daily, isLoading: dailyLoading } = useQuery<DailySeriesResponse>({
    queryKey: ["/api/focus-stats/daily", longSessionsOnly],
    enabled: isAuthenticated,
    queryFn: async () => {
      return apiRequest(
        "GET",
        `/api/focus-stats/daily?longSessionsOnly=${longSessionsOnly ? "true" : "false"}`,
      );
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const chartData =
    daily?.series?.map((row) => ({
      ...row,
      label: format(parseISO(`${row.date}T12:00:00.000Z`), "MMM d"),
    })) ?? [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-semibold flex-1">Your stats</h1>
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

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <FriendsStatsNav />

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Partner-visible idle</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {totalsLoading ? "—" : totals?.idleWarningCount ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Counts only when others were notified (not the private warning before broadcast).
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Distraction alerts</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {totalsLoading ? "—" : totals?.distractionCount ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Times you went distracted while others in the session were notified.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle>Distractions per day</CardTitle>
                  <CardDescription>
                    Toggle filters which days appear on the chart (UTC dates).
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border px-3 py-2 bg-muted/30">
                <Switch
                  id="long-sessions-only"
                  checked={longSessionsOnly}
                  onCheckedChange={setLongSessionsOnly}
                  data-testid="switch-long-sessions-only"
                />
                <Label htmlFor="long-sessions-only" className="text-sm cursor-pointer">
                  Only days with a ≥30 min scheduled session
                </Label>
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-[320px] w-full">
            {dailyLoading ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center px-4">
                {longSessionsOnly
                  ? "No days yet with a 30+ minute session you joined, or no distraction events on those days."
                  : "No distraction events recorded yet."}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} width={36} tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: 8 }} labelFormatter={(label) => String(label)} />
                  <Bar dataKey="distractions" name="Distractions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
