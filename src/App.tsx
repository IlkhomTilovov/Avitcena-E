import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import Leads from "./pages/Leads";
import AllOrders from "./pages/AllOrders";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import Tasks from "./pages/Tasks";
import Sellers from "./pages/Sellers";
import EmployeeDetail from "./pages/EmployeeDetail";
import Statistics from "./pages/Statistics";
import Privacy from "./pages/Privacy";
import NotFound from "./pages/NotFound";
import { OrderStatusNotificationProvider } from "./components/OrderStatusNotificationProvider";
import { AuthProvider } from "./hooks/useAuth";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <OrderStatusNotificationProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/leads" element={<Leads />} />
              <Route path="/all-orders" element={<AllOrders />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/sellers" element={<Sellers />} />
              <Route path="/sellers/:id" element={<EmployeeDetail />} />
              <Route path="/statistics" element={<Statistics />} />
              {/* Ommaviy sahifa: Meta ilovasini nashr qilish uchun kerak, login talab qilmaydi */}
              <Route path="/privacy" element={<Privacy />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </OrderStatusNotificationProvider>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
