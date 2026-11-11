import { useState, useEffect, type ComponentProps } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  LogOut,
  LayoutDashboard,
  ShoppingCart,
  User,
  Shield,
  Users,
  Package,
  CheckSquare,
  UserCog,
  BarChart3,
  ChevronRight,
  ChevronsLeft,
} from "lucide-react";
import { toast } from "sonner";
import { useUserRoles } from "@/hooks/useUserRoles";
import TaskNotifications from "./TaskNotifications";
import DashboardHeader from "./dashboard/DashboardHeader";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarInset,
  useSidebar,
} from "@/components/ui/sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
}

const CollapseToggle = () => {
  const { state, toggleSidebar } = useSidebar();

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-sidebar-border text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
    >
      <ChevronsLeft className={cn("h-4 w-4 transition-transform", state === "collapsed" && "rotate-180")} />
    </button>
  );
};

const SidebarCollapsedTooltipContent = ({ className, children, ...props }: ComponentProps<typeof TooltipContent>) => {
  const { state, isMobile } = useSidebar();

  return (
    <TooltipContent
      side="right"
      align="center"
      hidden={state !== "collapsed" || isMobile}
      className={cn("rounded-2xl border-none shadow-lg", className)}
      {...props}
    >
      {children}
    </TooltipContent>
  );
};

const DashboardLayout = ({ children, headerExtra }: DashboardLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [overdueTasksCount, setOverdueTasksCount] = useState(0);
  const [leadsCount, setLeadsCount] = useState(0);
  const { user, loading, signOut } = useAuth();
  const { isAdmin, isRop, isAdminOrRop, loading: rolesLoading } = useUserRoles();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;

    checkOverdueTasks();
    checkLeadsCount();
    const interval = setInterval(() => {
      checkOverdueTasks();
      checkLeadsCount();
    }, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const checkOverdueTasks = async () => {
    try {
      if (!user) return;
      const tasks = await api.tasks.list();
      const now = new Date();
      const overdue = tasks.filter(
        (t: any) => t.seller_id === user.id && t.status === "pending" && new Date(t.due_date) < now,
      );
      setOverdueTasksCount(overdue.length);
    } catch (error) {
      console.error("Error checking overdue tasks:", error);
    }
  };

  // /api/leads already scopes to "own leads" for a seller or "whole team" for
  // admin/rop server-side, so the raw count here is exactly what that user
  // should see next to "Lidlar" — no extra client-side filtering needed.
  const checkLeadsCount = async () => {
    try {
      if (!user) return;
      const leads = await api.leads.list();
      setLeadsCount(leads.length);
    } catch (error) {
      console.error("Error checking leads count:", error);
    }
  };

  const handleSignOut = () => {
    signOut();
    toast.success("Tizimdan chiqdingiz");
    navigate("/auth");
  };

  if (loading || rolesLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Yuklanmoqda...</div>
      </div>
    );
  }

  const navGroups: {
    label: string;
    items: { path: string; icon: typeof LayoutDashboard; label: string; badge?: number; badgeVariant?: "destructive" | "secondary" }[];
  }[] = [
    {
      label: "Asosiy",
      items: [{ path: "/", icon: LayoutDashboard, label: "Dashboard" }],
    },
    {
      label: "Savdo",
      items: [
        { path: "/leads", icon: Users, label: "Lidlar", badge: leadsCount > 0 ? leadsCount : undefined, badgeVariant: "secondary" },
        { path: "/all-orders", icon: ShoppingCart, label: "Barcha zakazlar" },
      ],
    },
    {
      label: "Ish jarayoni",
      items: [
        { path: "/tasks", icon: CheckSquare, label: "Tasklar", badge: overdueTasksCount > 0 ? overdueTasksCount : undefined, badgeVariant: "destructive" },
        { path: "/statistics", icon: BarChart3, label: "Statistika" },
      ],
    },
    ...(isAdminOrRop
      ? [
          {
            label: "Jamoa",
            items: [{ path: "/sellers", icon: UserCog, label: "Hodimlar" }],
          },
        ]
      : []),
    {
      label: "Tizim",
      items: [
        { path: "/profile", icon: User, label: "Profil" },
        ...(isAdminOrRop ? [{ path: "/admin", icon: Shield, label: "Boshqaruv" }] : []),
      ],
    },
  ];

  const roleLabel = isAdmin ? "Administrator" : isRop ? "ROP" : "Sotuvchi";
  const displayName = user.full_name || user.email || "Foydalanuvchi";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="floating">
        <SidebarHeader className="gap-0 border-b px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <Link to="/" className="flex items-center gap-2 overflow-hidden">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Package className="h-5 w-5" />
              </div>
              <div className="overflow-hidden group-data-[collapsible=icon]:hidden">
                <p className="truncate text-base font-bold leading-tight">
                  ROP <span className="text-primary">Seller</span>
                </p>
                <p className="truncate text-xs text-sidebar-foreground/60">Mebel biznesi uchun ERP</p>
              </div>
            </Link>
            <div className="group-data-[collapsible=icon]:hidden">
              <CollapseToggle />
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {navGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wider group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:whitespace-nowrap group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:text-center group-data-[collapsible=icon]:text-[8px] group-data-[collapsible=icon]:tracking-normal group-data-[collapsible=icon]:opacity-100">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={{
                            children: item.label,
                            className: cn(
                              "rounded-2xl border-none px-4 py-2 font-medium shadow-lg",
                              isActive && "bg-primary text-primary-foreground",
                            ),
                          }}
                          className={cn(
                            "h-10 border-l-2 border-transparent pl-2.5",
                            "group-data-[collapsible=icon]:!size-11 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-2xl group-data-[collapsible=icon]:border-l-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:shadow-none",
                            isActive &&
                              "border-primary bg-primary/10 font-semibold text-primary hover:bg-primary/10 hover:text-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary",
                            isActive &&
                              "group-data-[collapsible=icon]:bg-primary group-data-[collapsible=icon]:text-primary-foreground group-data-[collapsible=icon]:hover:bg-primary group-data-[collapsible=icon]:hover:text-primary-foreground",
                          )}
                        >
                          <Link to={item.path}>
                            <Icon className="h-4 w-4" />
                            <span className="flex-1 truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
                            {item.badge !== undefined && (
                              <Badge
                                variant={item.badgeVariant ?? "destructive"}
                                className="h-5 min-w-[20px] shrink-0 rounded-full px-1.5 text-xs font-bold group-data-[collapsible=icon]:hidden"
                              >
                                {item.badge}
                              </Badge>
                            )}
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/30 group-data-[collapsible=icon]:hidden" />
                          </Link>
                        </SidebarMenuButton>
                        {item.badge !== undefined && (
                          <Badge
                            variant={item.badgeVariant ?? "destructive"}
                            className="pointer-events-none absolute -right-1 -top-1 hidden h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none group-data-[collapsible=icon]:flex"
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="gap-3 border-t p-3 group-data-[collapsible=icon]:items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/profile"
                className="flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-sidebar-accent"
              >
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {initials}
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-green-500" />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden group-data-[collapsible=icon]:hidden">
                  <p className="truncate text-sm font-semibold">{displayName}</p>
                  <p className="truncate text-xs text-sidebar-foreground/60">{roleLabel}</p>
                </div>
              </Link>
            </TooltipTrigger>
            <SidebarCollapsedTooltipContent className="px-4 py-2">
              <p className="font-semibold leading-tight">{displayName}</p>
              <p className="text-xs text-muted-foreground">{roleLabel}</p>
            </SidebarCollapsedTooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center justify-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/15 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:h-11 group-data-[collapsible=icon]:w-11 group-data-[collapsible=icon]:rounded-2xl group-data-[collapsible=icon]:px-0"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden">Chiqish</span>
              </button>
            </TooltipTrigger>
            <SidebarCollapsedTooltipContent className="px-4 py-2 font-medium text-destructive">
              Chiqish
            </SidebarCollapsedTooltipContent>
          </Tooltip>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <DashboardHeader
          overdueTasksCount={overdueTasksCount}
          displayName={displayName}
          roleLabel={roleLabel}
          initials={initials}
          onSignOut={handleSignOut}
          extra={headerExtra}
        />
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </SidebarInset>

      <TaskNotifications />
    </SidebarProvider>
  );
};

export default DashboardLayout;
