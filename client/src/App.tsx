import { TooltipProvider } from "@/components/ui/tooltip";
import Status from "@/pages/status";

function App() {
  return (
      <TooltipProvider>
      <Status />
      </TooltipProvider>
  );
}

export default App;
