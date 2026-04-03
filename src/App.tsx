import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Dashboard from "./pages/Index";
import Settings from "./pages/Settings";
import AutoTradingPage from "./pages/AutoTradingPage";
import TradeHistory from "./pages/TradeHistory";
import TradingViewPage from "./pages/TradingView";
import CryptoNews from "./pages/CryptoNews";
import OKXTrading from "./pages/OKXTrading";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/auto-trading" element={<ProtectedRoute><AutoTradingPage /></ProtectedRoute>} />
      <Route path="/short-term" element={<Navigate to="/auto-trading" replace />} />
      <Route path="/long-term" element={<Navigate to="/auto-trading" replace />} />
      <Route path="/trade-history" element={<ProtectedRoute><TradeHistory /></ProtectedRoute>} />
      <Route path="/trading-view" element={<ProtectedRoute><TradingViewPage /></ProtectedRoute>} />
      <Route path="/news" element={<ProtectedRoute><CryptoNews /></ProtectedRoute>} />
      <Route path="/okx-trading" element={<ProtectedRoute><OKXTrading /></ProtectedRoute>} />
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
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
