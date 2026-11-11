import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardStatCard from "@/components/dashboard/DashboardStatCard";
import DashboardPeriodControl, { DashboardPeriod, PERIOD_LABELS } from "@/components/dashboard/DashboardPeriodControl";
import DonutCard, { DonutSlice } from "@/components/dashboard/DonutCard";
import SellerPerformanceTable, { SellerPerformanceRow } from "@/components/dashboard/SellerPerformanceTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Users,
  PieChart as PieChartIcon,
  Globe2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  ComposedChart,
  Bar,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  format,
  subDays,
  subWeeks,
  subMonths,
  subYears,
  startOfDay,
  endOfDay,
  isWithinInterval,
  parseISO,
  differenceInCalendarDays,
} from "date-fns";
import { useUserRoles } from "@/hooks/useUserRoles";
import type { DateRange } from "react-day-picker";

const getPeriodRange = (period: DashboardPeriod, customRange?: DateRange) => {
  const now = new Date();
  switch (period) {
    case "today":
      return { start: startOfDay(now), end: now };
    case "month":
      return { start: subMonths(now, 1), end: now };
    case "year":
      return { start: subYears(now, 1), end: now };
    case "custom":
      if (customRange?.from && customRange?.to) {
        return { start: startOfDay(customRange.from), end: endOfDay(customRange.to) };
      }
      return { start: subWeeks(now, 1), end: now };
    default:
      return { start: subWeeks(now, 1), end: now };
  }
};

const getPreviousRange = (start: Date, end: Date) => {
  const days = differenceInCalendarDays(end, start) + 1;
  const prevEnd = subDays(start, 1);
  const prevStart = subDays(prevEnd, days - 1);
  return { start: prevStart, end: prevEnd };
};

const inRange = (dateStr: string, start: Date, end: Date) => {
  try {
    return isWithinInterval(parseISO(dateStr), { start, end: endOfDay(end) });
  } catch {
    return false;
  }
};

// Returns null (not a sentinel 100%) when there's no previous-period baseline
// to compare against — a "growth rate from zero" isn't a real percentage.
const pctChange = (current: number, previous: number): number | null => {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
};

const LEAD_SOURCE_COLORS: Record<string, string> = {
  Instagram: "#ec4899",
  Facebook: "#2563eb",
  Sayt: "#3b82f6",
  Telegram: "#0ea5e9",
  Forma: "#8b5cf6",
  Boshqa: "#94a3b8",
};

const RevenueTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const revenue = payload.find((p: any) => p.dataKey === "revenue")?.value ?? 0;
  const orders = payload.find((p: any) => p.dataKey === "orders")?.value ?? 0;
  return (
    <div className="rounded-lg border bg-card p-3 text-xs shadow-md">
      <p className="mb-1.5 text-sm font-semibold">{label}</p>
      <p className="flex items-center justify-between gap-4 text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" /> Daromad
        </span>
        <span className="font-medium text-foreground">{Number(revenue).toLocaleString()} so'm</span>
      </p>
      <p className="flex items-center justify-between gap-4 text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Zakazlar
        </span>
        <span className="font-medium text-foreground">{orders} ta</span>
      </p>
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, isRop, isAdminOrRop } = useUserRoles();
  const [period, setPeriod] = useState<DashboardPeriod>("week");
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);

  useEffect(() => {
    if (user) fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdminOrRop]);

  const fetchDashboardData = async () => {
    try {
      if (!user) return;
      setLoading(true);

      const [allOrders, allLeads, allStages] = await Promise.all([api.orders.list(), api.leads.list(), api.stages.list()]);
      setOrders(allOrders);
      setLeads(allLeads);
      setStages(allStages);

      if (isAdminOrRop) {
        const [allProfiles, allTasks] = await Promise.all([api.profiles.list(), api.tasks.list()]);
        setProfiles(allProfiles);
        setTasks(allTasks);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const { start: periodStart, end: periodEnd } = useMemo(() => getPeriodRange(period, customRange), [period, customRange]);
  const { start: prevStart, end: prevEnd } = useMemo(() => getPreviousRange(periodStart, periodEnd), [periodStart, periodEnd]);

  const ownOrders = useMemo(
    () => (isAdminOrRop ? orders : orders.filter((o) => o.seller_id === user?.id)),
    [orders, isAdminOrRop, user?.id],
  );
  const ownLeads = useMemo(
    () => (isAdminOrRop ? leads : leads.filter((l) => l.seller_id === user?.id)),
    [leads, isAdminOrRop, user?.id],
  );

  const currentOrders = useMemo(
    () => ownOrders.filter((o) => o.order_date >= format(periodStart, "yyyy-MM-dd") && o.order_date <= format(periodEnd, "yyyy-MM-dd")),
    [ownOrders, periodStart, periodEnd],
  );
  const previousOrders = useMemo(
    () => ownOrders.filter((o) => o.order_date >= format(prevStart, "yyyy-MM-dd") && o.order_date <= format(prevEnd, "yyyy-MM-dd")),
    [ownOrders, prevStart, prevEnd],
  );
  const currentLeads = useMemo(() => ownLeads.filter((l) => inRange(l.created_at, periodStart, periodEnd)), [ownLeads, periodStart, periodEnd]);

  const totalOrders = currentOrders.length;
  const prevTotalOrders = previousOrders.length;
  const totalRevenue = currentOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const prevTotalRevenue = previousOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const averageOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const prevAverageOrder = prevTotalOrders > 0 ? prevTotalRevenue / prevTotalOrders : 0;

  const ordersTrend = pctChange(totalOrders, prevTotalOrders);
  const revenueTrend = pctChange(totalRevenue, prevTotalRevenue);
  const averageOrderTrend = pctChange(averageOrder, prevAverageOrder);
  const pendingOrders = currentOrders.filter((o) => o.status === "pending").length;
  const employees = useMemo(() => profiles.filter((p) => p.role === "seller"), [profiles]);

  // "Sifatsiz" is a lead stage admins mark bad/spam leads with; everything
  // else counts as a quality lead — there's no separate "sifatli" stage.
  const sifatsizStageId = useMemo(() => stages.find((s) => s.name === "Sifatsiz")?.id, [stages]);

  const last7 = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i);
      const dateStr = format(date, "yyyy-MM-dd");
      const dayOrders = ownOrders.filter((o) => o.order_date === dateStr);
      return {
        name: format(date, "dd MMM"),
        revenue: dayOrders.reduce((sum, o) => sum + Number(o.total_amount), 0),
        orders: dayOrders.length,
      };
    });
  }, [ownOrders]);

  // The lead-quality chart gets its own 30-day window (unlike last7 above,
  // which the revenue chart and stat-card sparklines still use at 7 days).
  const LEAD_QUALITY_DAYS = 30;
  const leadQualityTrend = useMemo(() => {
    return Array.from({ length: LEAD_QUALITY_DAYS }, (_, i) => {
      const date = subDays(new Date(), LEAD_QUALITY_DAYS - 1 - i);
      const dateStr = format(date, "yyyy-MM-dd");
      const dayLeads = ownLeads.filter((l) => l.created_at && format(parseISO(l.created_at), "yyyy-MM-dd") === dateStr);
      const sifatsizLeads = dayLeads.filter((l) => l.stage === sifatsizStageId).length;
      return {
        name: format(date, "dd MMM"),
        sifatliLeads: dayLeads.length - sifatsizLeads,
        sifatsizLeads,
      };
    });
  }, [ownLeads, sifatsizStageId]);

  const dateRangeLabel =
    format(periodStart, "yyyy-MM-dd") === format(periodEnd, "yyyy-MM-dd")
      ? format(periodStart, "dd MMM yyyy")
      : `${format(periodStart, "dd MMM yyyy")} - ${format(periodEnd, "dd MMM yyyy")}`;

  const sellerRows: SellerPerformanceRow[] = useMemo(() => {
    if (!isAdminOrRop) return [];
    return employees.map((employee) => {
      const employeeOrders = currentOrders.filter((o) => o.seller_id === employee.id);
      const employeeLeads = currentLeads.filter((l) => l.seller_id === employee.id);
      const sellerTotalOrders = employeeOrders.length;
      const totalSales = employeeOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
      return {
        sellerId: employee.id,
        sellerName: employee.full_name,
        totalOrders: sellerTotalOrders,
        totalSales,
        averageCheck: sellerTotalOrders > 0 ? totalSales / sellerTotalOrders : 0,
        totalLeads: employeeLeads.length,
        conversionRate: employeeLeads.length > 0 ? (sellerTotalOrders / employeeLeads.length) * 100 : 0,
        isActive: sellerTotalOrders > 0 || employeeLeads.length > 0,
      };
    });
  }, [isAdminOrRop, employees, currentOrders, currentLeads]);

  const orderStatusSlices: DonutSlice[] = useMemo(
    () => [
      { label: "Jarayonda", value: currentOrders.filter((o) => o.status === "pending").length, color: "#3b82f6" },
      { label: "Tugallandi", value: currentOrders.filter((o) => o.status === "delivered").length, color: "#22c55e" },
      { label: "Bekor qilindi", value: currentOrders.filter((o) => o.status === "cancelled").length, color: "#ef4444" },
    ],
    [currentOrders],
  );

  const leadSourceSlices: DonutSlice[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of currentLeads) {
      const key = ["Sayt", "Instagram", "Facebook", "Telegram", "Forma"].includes(lead.source) ? lead.source : "Boshqa";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return ["Instagram", "Facebook", "Sayt", "Telegram", "Forma", "Boshqa"]
      .filter((label) => label !== "Boshqa" || (counts.get("Boshqa") ?? 0) > 0)
      .map((label) => ({ label, value: counts.get(label) ?? 0, color: LEAD_SOURCE_COLORS[label] }));
  }, [currentLeads]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="text-center text-muted-foreground">Yuklanmoqda...</div>
      </DashboardLayout>
    );
  }

  const headerExtra = (
    <DashboardPeriodControl
      period={period}
      onPeriodChange={setPeriod}
      dateRangeLabel={dateRangeLabel}
      customRange={customRange}
      onCustomRangeChange={setCustomRange}
    />
  );

  return (
    <DashboardLayout headerExtra={headerExtra}>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground mt-2">Savdo jarayoni, jamoa faoliyati va asosiy ko'rsatkichlar</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <DashboardStatCard
            id="orders"
            title="Jami zakazlar"
            value={String(totalOrders)}
            description={`${isAdminOrRop ? "Jamoa bo'yicha" : "Siz uchun"} • ${PERIOD_LABELS[period].toLowerCase()}`}
            icon={ShoppingCart}
            iconClassName="bg-blue-500/10 text-blue-600"
            trend={ordersTrend !== null ? { value: ordersTrend, isPositive: totalOrders >= prevTotalOrders } : undefined}
            sparkline={last7.map((d) => d.orders)}
            sparklineColor="#3b82f6"
            onClick={() => navigate("/all-orders")}
          />
          <DashboardStatCard
            id="revenue"
            title="Jami daromad"
            value={`${totalRevenue.toLocaleString()} so'm`}
            description="O'tgan davrga nisbatan"
            icon={DollarSign}
            iconClassName="bg-emerald-500/10 text-emerald-600"
            trend={revenueTrend !== null ? { value: revenueTrend, isPositive: totalRevenue >= prevTotalRevenue } : undefined}
            sparkline={last7.map((d) => d.revenue)}
            sparklineColor="#22c55e"
          />
          <DashboardStatCard
            id="avg-order"
            title="O'rtacha zakaz"
            value={`${Math.round(averageOrder).toLocaleString()} so'm`}
            description="Har bir zakaz uchun"
            icon={TrendingUp}
            iconClassName="bg-amber-500/10 text-amber-600"
            trend={averageOrderTrend !== null ? { value: averageOrderTrend, isPositive: averageOrder >= prevAverageOrder } : undefined}
            sparkline={last7.map((d) => (d.orders > 0 ? Math.round(d.revenue / d.orders) : 0))}
            sparklineColor="#f59e0b"
          />
          {isAdminOrRop ? (
            <DashboardStatCard
              id="employees"
              title="Jami xodimlar"
              value={String(employees.length)}
              description="Faol sotuvchilar"
              icon={Users}
              iconClassName="bg-violet-500/10 text-violet-600"
              sparkline={[]}
              sparklineColor="#8b5cf6"
              onClick={() => navigate("/sellers")}
            />
          ) : (
            <DashboardStatCard
              id="pending"
              title="Kutilayotgan"
              value={String(pendingOrders)}
              description="Jarayondagi zakazlar"
              icon={ShoppingCart}
              iconClassName="bg-violet-500/10 text-violet-600"
              sparkline={[]}
              sparklineColor="#8b5cf6"
            />
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-10">
          <Card className="xl:col-span-4">
            <CardHeader>
              <CardTitle>Daromad dinamikasi</CardTitle>
              <p className="text-sm text-muted-foreground">So'nggi 7 kunlik savdo ko'rsatkichlari</p>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={last7}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="revenue" tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} />
                    <YAxis yAxisId="orders" orientation="right" tick={{ fontSize: 12 }} allowDecimals={false} width={28} />
                    <Tooltip content={<RevenueTooltip />} />
                    <Legend formatter={(v) => (v === "revenue" ? "Daromad (so'm)" : "Zakazlar soni")} />
                    <Bar yAxisId="revenue" dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="revenue" />
                    <Line yAxisId="orders" type="monotone" dataKey="orders" stroke="#22c55e" strokeWidth={2} name="orders" dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="xl:col-span-6">
            <CardHeader>
              <CardTitle>Lidlar sifati</CardTitle>
              <p className="text-sm text-muted-foreground">So'nggi 1 oy — sifatli va sifatsiz lidlar</p>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={leadQualityTrend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={3} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: number, key: string) => [`${value} ta`, key === "sifatliLeads" ? "Sifatli lidlar" : "Sifatsiz lidlar"]} />
                    <Legend formatter={(v) => (v === "sifatliLeads" ? "Sifatli lidlar" : "Sifatsiz lidlar")} />
                    <Line type="monotone" dataKey="sifatliLeads" stroke="#22c55e" strokeWidth={2} name="sifatliLeads" dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="sifatsizLeads" stroke="#ef4444" strokeWidth={2} name="sifatsizLeads" dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {isAdminOrRop && <SellerPerformanceTable rows={sellerRows} />}

        {isAdminOrRop && (
          <div className="grid gap-4 md:grid-cols-2">
            <DonutCard
              title="Zakazlar holati"
              icon={<PieChartIcon className="h-4 w-4 text-muted-foreground" />}
              unitLabel="zakaz"
              slices={orderStatusSlices}
            />
            <DonutCard
              title="Lid manbalari"
              icon={<Globe2 className="h-4 w-4 text-muted-foreground" />}
              unitLabel="lid"
              slices={leadSourceSlices}
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
