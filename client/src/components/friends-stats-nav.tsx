import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FriendsStatsNav({ className }: { className?: string }) {
  const [loc, setLocation] = useLocation();

  return (
    <div
      className={cn(
        "flex gap-1 p-1 rounded-lg bg-muted/50 border border-border/60",
        className,
      )}
      role="tablist"
      aria-label="Friends and stats"
    >
      <Button
        type="button"
        variant={loc === "/friends" ? "secondary" : "ghost"}
        size="sm"
        className="flex-1"
        onClick={() => setLocation("/friends")}
        data-testid="tab-friends"
      >
        Friends
      </Button>
      <Button
        type="button"
        variant={loc === "/your-stats" ? "secondary" : "ghost"}
        size="sm"
        className="flex-1"
        onClick={() => setLocation("/your-stats")}
        data-testid="tab-your-stats"
      >
        Your stats
      </Button>
    </div>
  );
}
