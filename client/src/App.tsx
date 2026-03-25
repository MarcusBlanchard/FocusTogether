import { Router, Route, Switch } from "wouter";
import { TooltipProvider } from "@/components/ui/tooltip";
import Status from "@/pages/status";
import Home from "@/pages/home";
import Friends from "@/pages/friends";
import YourStats from "@/pages/your-stats";
import Profile from "@/pages/profile";
import Search from "@/pages/search";
import Waiting from "@/pages/waiting";
import History from "@/pages/history";
import Calendar from "@/pages/calendar";
import FreeRooms from "@/pages/free-rooms";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";

function isTauriShell(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as unknown as { __TAURI__?: unknown }).__TAURI__);
}

function WebRoutes() {
  return (
    <Router>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/home" component={Home} />
        <Route path="/friends" component={Friends} />
        <Route path="/your-stats" component={YourStats} />
        <Route path="/profile" component={Profile} />
        <Route path="/search" component={Search} />
        <Route path="/waiting" component={Waiting} />
        <Route path="/history" component={History} />
        <Route path="/calendar" component={Calendar} />
        <Route path="/free-rooms" component={FreeRooms} />
        <Route path="/landing" component={Landing} />
        <Route component={NotFound} />
      </Switch>
    </Router>
  );
}

function App() {
  if (isTauriShell()) {
    return (
      <TooltipProvider>
        <Status />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <WebRoutes />
    </TooltipProvider>
  );
}

export default App;
