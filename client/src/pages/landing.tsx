import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, Calendar, Clock, Shield } from "lucide-react";

export default function Landing() {
  const loginUrl = "/api/login";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Flowlocked</h1>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/download">Download</Link>
            </Button>
            <Button asChild data-testid="button-login">
              <a href="/api/login">Sign In</a>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-semibold mb-6">
            Stay focused with an accountability partner
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            Schedule a focused work session and get automatically matched with a partner who booked the same time and preferences.
          </p>
          <Button size="lg" className="px-12 py-6 text-lg rounded-full" asChild data-testid="button-get-started">
            <a href="/api/login">Book a Session</a>
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <Video className="h-8 w-8 mb-2 text-muted-foreground" />
              <CardTitle>Video & Screen Sharing</CardTitle>
              <CardDescription>
                See your partner and share your screen to stay accountable during work sessions.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Calendar className="h-8 w-8 mb-2 text-muted-foreground" />
              <CardTitle>Smart Auto-Matching</CardTitle>
              <CardDescription>
                Book a time slot that works for you, and we'll match you with partners who chose the same time and preferences.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Clock className="h-8 w-8 mb-2 text-muted-foreground" />
              <CardTitle>Focus Sessions</CardTitle>
              <CardDescription>
                Work alongside someone who is also trying to get things done. Social motivation works.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Shield className="h-8 w-8 mb-2 text-muted-foreground" />
              <CardTitle>Friend System</CardTitle>
              <CardDescription>
                Add friends after sessions and invite them directly for future work sessions.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </main>

      <footer className="border-t mt-16">
        <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 text-sm text-muted-foreground">
          <Link href="/download" className="hover:text-foreground underline-offset-4 hover:underline">
            Download for Mac
          </Link>
          <span className="hidden sm:inline" aria-hidden>
            ·
          </span>
          <Link href="/legal/terms" className="hover:text-foreground underline-offset-4 hover:underline">
            Terms of Service
          </Link>
          <span className="hidden sm:inline" aria-hidden>
            ·
          </span>
          <Link href="/legal/privacy" className="hover:text-foreground underline-offset-4 hover:underline">
            Privacy Policy
          </Link>
        </div>
      </footer>
    </div>
  );
}
