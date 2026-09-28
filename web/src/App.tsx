import { ConversationProvider } from "@elevenlabs/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSystemTheme } from "@/hooks/useSystemTheme";
import { GoogleSignInProvider } from "@/state/GoogleSignInProvider";
import { ThreadProvider } from "@/state/ThreadProvider";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";

const queryClient = new QueryClient();

const App = () => {
  useSystemTheme();

  return (
    <QueryClientProvider client={queryClient}>
      <ConversationProvider>
        <ThreadProvider>
          <GoogleSignInProvider>
          <TooltipProvider>
            <Toaster />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
          </GoogleSignInProvider>
        </ThreadProvider>
      </ConversationProvider>
    </QueryClientProvider>
  );
};

export default App;
