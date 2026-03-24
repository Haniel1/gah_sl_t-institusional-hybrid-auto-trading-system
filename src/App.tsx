import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Index";
import Settings from "./pages/Settings";
import AutoTradingPage from "./pages/AutoTradingPage";
import TradeHistory from "./pages/TradeHistory";
import TradingViewPage from "./pages/TradingView";
import CryptoNews from "./pages/CryptoNews";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/auto-trading" element={<AutoTradingPage />} />
      <Route path="/short-term" element={<Navigate to="/auto-trading" replace />} />
      <Route path="/long-term" element={<Navigate to="/auto-trading" replace />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/trade-history" element={<TradeHistory />} />
      <Route path="/trading-view" element={<TradingViewPage />} />
      <Route path="/news" element={<CryptoNews />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
