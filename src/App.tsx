import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Navbar } from "@/components/Navbar";
import { AuthProvider } from "@/contexts/AuthContext";
import { UserOnlyGuard, AdminOnlyGuard } from "@/components/AdminRouteGuard";
import Index from "./pages/Index";
import RaiseClaim from "./pages/RaiseClaim";
import ClaimStatus from "./pages/ClaimStatus";
import ClaimDetail from "./pages/ClaimDetail";
import MyClaims from "./pages/MyClaims";
import MyPolicies from "./pages/MyPolicies";
import AdminDashboard from "./pages/AdminDashboard";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import PublicClaimTracker from "./pages/PublicClaimTracker";
import Profile from "./pages/Profile";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Navbar />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/admin/login" element={<Auth />} />

              {/* Public — no auth required */}
              <Route path="/track" element={<PublicClaimTracker />} />
              <Route path="/track/:claimNumber" element={<PublicClaimTracker />} />

              {/* User-only pages — admins are redirected to /admin */}
              <Route path="/my-policies" element={<UserOnlyGuard><MyPolicies /></UserOnlyGuard>} />
              <Route path="/raise-claim" element={<UserOnlyGuard><RaiseClaim /></UserOnlyGuard>} />
              <Route path="/my-claims" element={<UserOnlyGuard><MyClaims /></UserOnlyGuard>} />
              <Route path="/claim-status" element={<UserOnlyGuard><ClaimStatus /></UserOnlyGuard>} />
              <Route path="/claim/:claimId" element={<UserOnlyGuard><ClaimDetail /></UserOnlyGuard>} />
              <Route path="/profile" element={<UserOnlyGuard><Profile /></UserOnlyGuard>} />

              {/* Admin-only pages */}
              <Route path="/admin" element={<AdminOnlyGuard><AdminDashboard /></AdminOnlyGuard>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
