import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardStatCard from "@/components/dashboard/DashboardStatCard";
import DonutCard, { DonutSlice } from "@/components/dashboard/DonutCard";
import StageBreakdownCard from "@/components/statistics/StageBreakdownCard";
import SellerRankingTable from "@/components/statistics/SellerRankingTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ComposedChart,
  Bar,
  Line,
  BarChart as RBarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRoles } from "@/hooks/useUserRoles";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, startOfWeek, startOfMonth, startOfYear, subDays } from "date-fns";
import {
  ShoppingCart,
  TrendingUp,
  DollarSign,
  Users2,
  SlidersHorizontal,
  Calendar as CalendarIcon,
  PieChart as PieChartIcon,
  BarChart3,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import * as XLSX from "xlsx";

type StatsPeriod = "week" | "month" | "year" | "all";
const PERIOD_LABELS: Record<StatsPeriod, string> = {
  week: "Joriy hafta",
  month: "Joriy oy",
  year: "Joriy yil",
  all: "Barcha davr",
};
type Granularity = "daily" | "weekly" | "monthly";

const DAY_MS = 24 * 60 * 60 * 1000;
const ORDER_STATUS_LABELS: Record<string, string> = { pending: "Jarayonda", delivered: "Yetkazildi", cancelled: "Bekor qilindi" };
const CHART_PALETTE = ["#3b82f6", "#22c55e", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#64748b"];

const pctChange = (current: number, previous: number): number | null => {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
};

const getPeriodRange = (period: StatsPeriod) => {
  const now = new Date();
  switch (period) {
    case "week":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: now };
    case "year":
      return { start: startOfYear(now), end: now };
    case "all":
      return { start: new Date(2015, 0, 1), end: now };
    default:
      return { start: startOfMonth(now), end: now };
  }
};

const Statistics = () => {
  const { user } = useAuth();
  const { isAdmin, isRop, isAdminOrRop } = useUserRoles();

  const [orders, setOrders] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [period, setPeriod] = useState<StatsPeriod>("month");
  const [customStart, setCustomStart] = useState<Date | undefined>(undefined);
  const [customEnd, setCustomEnd] = useState<Date | undefined>(undefined);
  const [filterSeller, setFilterSeller] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [filterStage, setFilterStage] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [granularity, setGranularity] = useState<Granularity>("daily");

  const [ordersDialogOpen, setOrdersDialogOpen] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<any[]>([]);
  const [dialogTitle, setDialogTitle] = useState("");
  const [leadsDialogOpen, setLeadsDialogOpen] = useState(false);
  const [selectedStageLeads, setSelectedStageLeads] = useState<any[]>([]);
  const [leadsDialogTitle, setLeadsDialogTitle] = useState("");

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [ordersData, leadsData, profilesData, stagesData] = await Promise.all([
        api.orders.list(),
        api.leads.list(),
        api.profiles.list(),
        api.stages.list(),
      ]);
      setOrders(ordersData);
      setLeads(leadsData);
      setSellers(profilesData.filter((p: any) => p.role === "seller").sort((a: any, b: any) => a.full_name.localeCompare(b.full_name)));
      setStages(stagesData.sort((a: any, b: any) => a.display_order - b.display_order));
    } catch (error) {
      console.error(error);
      toast.error("Statistikani yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };

  const { start: periodStart, end: periodEnd } = useMemo(() => {
    if (customStart || customEnd) return { start: customStart ?? new Date(2015, 0, 1), end: customEnd ?? new Date() };
    return getPeriodRange(period);
  }, [period, customStart, customEnd]);

  const { start: prevStart, end: prevEnd } = useMemo(() => {
    const spanMs = Math.max(periodEnd.getTime() - periodStart.getTime(), DAY_MS);
    const prevEndDate = new Date(periodStart.getTime() - 1);
    return { start: new Date(prevEndDate.getTime() - spanMs), end: prevEndDate };
  }, [periodStart, periodEnd]);

  const sellerNameById = useMemo(() => new Map(sellers.map((s) => [s.id, s.full_name])), [sellers]);
  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  const ownOrders = useMemo(() => (isAdminOrRop ? orders : orders.filter((o) => o.seller_id === user?.id)), [orders, isAdminOrRop, user?.id]);
  const ownLeads = useMemo(() => (isAdminOrRop ? leads : leads.filter((l) => l.seller_id === user?.id)), [leads, isAdminOrRop, user?.id]);

  const inRange = (dateStr: string, start: Date, end: Date) => {
    const d = new Date(dateStr);
    return d >= start && d <= new Date(end.getTime() + DAY_MS - 1);
  };

  const matchesSearch = (o: any) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      o.customer_name?.toLowerCase().includes(q) ||
      o.customer_phone?.toLowerCase().includes(q) ||
      o.region?.toLowerCase().includes(q) ||
      o.district?.toLowerCase().includes(q)
    );
  };

  const filterByPeriodAndSeller = (rows: any[], start: Date, end: Date, dateField: "order_date" | "created_at") =>
    rows.filter((r) => inRange(r[dateField], start, end) && (filterSeller === "all" || r.seller_id === filterSeller));

  // Orders are filtered by order_date (the actual sale date, same field the
  // revenue chart buckets by) — not created_at (when the DB row happened to be
  // inserted), which previously let an order's created_at and order_date fall
  // in different months and inflate/deflate the period totals.
  const currentOrders = useMemo(
    () => filterByPeriodAndSeller(ownOrders, periodStart, periodEnd, "order_date").filter(matchesSearch),
    [ownOrders, periodStart, periodEnd, filterSeller, searchTerm],
  );
  const previousOrders = useMemo(
    () => filterByPeriodAndSeller(ownOrders, prevStart, prevEnd, "order_date"),
    [ownOrders, prevStart, prevEnd, filterSeller],
  );

  const currentLeadsBase = useMemo(
    () => filterByPeriodAndSeller(ownLeads, periodStart, periodEnd, "created_at"),
    [ownLeads, periodStart, periodEnd, filterSeller],
  );
  const previousLeads = useMemo(
    () => filterByPeriodAndSeller(ownLeads, prevStart, prevEnd, "created_at"),
    [ownLeads, prevStart, prevEnd, filterSeller],
  );
  const currentLeads = useMemo(
    () =>
      currentLeadsBase
        .filter((l) => filterSource === "all" || l.source === filterSource)
        .filter((l) => filterStage === "all" || l.stage === filterStage)
        .filter((l) => !searchTerm || l.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) || l.customer_phone?.toLowerCase().includes(searchTerm.toLowerCase())),
    [currentLeadsBase, filterSource, filterStage, searchTerm],
  );

  // --- Summary stats -------------------------------------------------
  const totalOrders = currentOrders.length;
  const totalSales = currentOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const averageCheck = totalOrders > 0 ? totalSales / totalOrders : 0;
  const prevTotalOrders = previousOrders.length;
  const prevTotalSales = previousOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const prevAverageCheck = prevTotalOrders > 0 ? prevTotalSales / prevTotalOrders : 0;

  // Only count real sellers (profiles.role === "seller") as "active" — an
  // admin/ROP account can technically own orders/leads (e.g. test data, or
  // leads imported before being reassigned) but isn't part of the sales team.
  const sellerIdSet = useMemo(() => new Set(sellers.map((s) => s.id)), [sellers]);
  const activeSellerIds = new Set(
    [...currentOrders.map((o) => o.seller_id), ...currentLeads.map((l) => l.seller_id)].filter((id) => sellerIdSet.has(id)),
  );
  const prevActiveSellerIds = new Set(
    [...previousOrders.map((o) => o.seller_id), ...previousLeads.map((l) => l.seller_id)].filter((id) => sellerIdSet.has(id)),
  );

  const ordersTrend = pctChange(totalOrders, prevTotalOrders);
  const salesTrend = pctChange(totalSales, prevTotalSales);
  const avgCheckTrend = pctChange(averageCheck, prevAverageCheck);
  const activeSellersTrend = pctChange(activeSellerIds.size, prevActiveSellerIds.size);

  // --- Revenue dynamics chart -----------------------------------------
  const dynamicsData = useMemo(() => {
    const daily: { key: string; label: string; revenue: number; orders: number }[] = [];
    for (let t = periodStart.getTime(); t <= periodEnd.getTime(); t += DAY_MS) {
      const d = new Date(t);
      const dateStr = format(d, "yyyy-MM-dd");
      const dayOrders = currentOrders.filter((o) => o.order_date === dateStr);
      daily.push({
        key: dateStr,
        label: format(d, "dd MMM"),
        revenue: dayOrders.reduce((sum, o) => sum + Number(o.total_amount), 0),
        orders: dayOrders.length,
      });
    }
    if (granularity === "daily" || daily.length === 0) return daily;

    const groupKey = (dateStr: string) =>
      granularity === "weekly" ? format(startOfWeek(parseISO(dateStr), { weekStartsOn: 1 }), "yyyy-MM-dd") : dateStr.slice(0, 7);
    const map = new Map<string, { label: string; revenue: number; orders: number }>();
    daily.forEach((d) => {
      const key = groupKey(d.key);
      const label = granularity === "weekly" ? `${format(parseISO(key), "dd MMM")} haftasi` : format(parseISO(`${key}-01`), "MMM yyyy");
      const existing = map.get(key) ?? { label, revenue: 0, orders: 0 };
      existing.revenue += d.revenue;
      existing.orders += d.orders;
      map.set(key, existing);
    });
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([, v]) => v);
  }, [currentOrders, periodStart, periodEnd, granularity]);

  // --- Order status donut ---------------------------------------------
  const orderStatusSlices: DonutSlice[] = useMemo(
    () => [
      { label: "Jarayonda", value: currentOrders.filter((o) => o.status === "pending").length, color: "#3b82f6" },
      { label: "Yetkazildi", value: currentOrders.filter((o) => o.status === "delivered").length, color: "#22c55e" },
      { label: "Bekor qilindi", value: currentOrders.filter((o) => o.status === "cancelled").length, color: "#ef4444" },
    ],
    [currentOrders],
  );

  // --- Lead sources bar chart ------------------------------------------
  const sourceChartData = useMemo(() => {
    const counts = new Map<string, number>();
    currentLeads.forEach((l) => {
      const key = l.source || "Noma'lum";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([source, count], i) => ({ source: source.toUpperCase(), count, fill: CHART_PALETTE[i % CHART_PALETTE.length] }));
  }, [currentLeads]);

  // --- Stage breakdown ---------------------------------------------------
  const stageBreakdown = useMemo(() => {
    const totalForStages = currentLeadsBase.length;
    return stages.map((s) => {
      const count = currentLeadsBase.filter((l) => l.stage === s.id).length;
      return { id: s.id, name: s.name, color: s.color, count, percent: totalForStages > 0 ? Math.round((count / totalForStages) * 100) : 0 };
    });
  }, [stages, currentLeadsBase]);

  // --- Seller ranking ------------------------------------------------
  const sellerRanking = useMemo(() => {
    const bySeller = new Map<string, { totalOrders: number; totalSales: number }>();
    currentOrders.forEach((o) => {
      const entry = bySeller.get(o.seller_id) ?? { totalOrders: 0, totalSales: 0 };
      entry.totalOrders += 1;
      entry.totalSales += Number(o.total_amount);
      bySeller.set(o.seller_id, entry);
    });
    const leadsCountBySeller = new Map<string, number>();
    currentLeadsBase.forEach((l) => leadsCountBySeller.set(l.seller_id, (leadsCountBySeller.get(l.seller_id) ?? 0) + 1));

    return Array.from(bySeller.entries())
      .map(([sellerId, v]) => {
        const sellerLeads = leadsCountBySeller.get(sellerId) ?? 0;
        return {
          sellerId,
          sellerName: sellerNameById.get(sellerId) || "Noma'lum",
          totalOrders: v.totalOrders,
          totalSales: v.totalSales,
          averageCheck: v.totalOrders > 0 ? v.totalSales / v.totalOrders : 0,
          conversionRate: sellerLeads > 0 ? (v.totalOrders / sellerLeads) * 100 : 0,
        };
      })
      .sort((a, b) => b.totalSales - a.totalSales);
  }, [currentOrders, currentLeadsBase, sellerNameById]);

  const handleViewOrdersByStatus = (status: string) => {
    const matching = currentOrders.filter((o) => o.status === status).sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1));
    setSelectedOrders(matching);
    setDialogTitle(`${ORDER_STATUS_LABELS[status] || status} zakazlar`);
    setOrdersDialogOpen(true);
  };

  const handleViewStageLeads = (stageId: string) => {
    const matching = currentLeadsBase.filter((l) => l.stage === stageId);
    const stage = stageById.get(stageId);
    setSelectedStageLeads(matching);
    setLeadsDialogTitle(`${stage?.name || "Bosqich"} lidlari`);
    setLeadsDialogOpen(true);
  };

  const handleViewSellerOrders = (sellerId: string) => {
    const matching = currentOrders.filter((o) => o.seller_id === sellerId).sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1));
    setSelectedOrders(matching);
    setDialogTitle(`${sellerNameById.get(sellerId) || "Sotuvchi"} - zakazlar`);
    setOrdersDialogOpen(true);
  };

  const handleExport = () => {
    const exportData = sellerRanking.map((r, i) => ({
      "#": i + 1,
      Sotuvchi: r.sellerName,
      "Jami zakazlar": r.totalOrders,
      "Jami savdo": r.totalSales,
      "O'rtacha chek": Math.round(r.averageCheck),
      "Konversiya (%)": r.conversionRate.toFixed(1),
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statistika");
    XLSX.writeFile(wb, `Statistika_${format(new Date(), "yyyy-MM-dd_HH-mm")}.xlsx`);
  };

  const availableSources = useMemo(() => Array.from(new Set(leads.map((l) => l.source).filter(Boolean))), [leads]);
  const hasCustomDate = !!customStart || !!customEnd;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="text-center text-muted-foreground">Yuklanmoqda...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Statistika</h2>
            <p className="mt-2 text-muted-foreground">
              {isAdmin || isRop ? "Savdo jarayoni, jamoa natijalari va lidlar tahlili" : "Mening zakaz va lidlar statistikam"}
            </p>
          </div>
          <Button variant="outline" className="gap-1.5" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Eksport
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={hasCustomDate ? "" : period}
            onValueChange={(v) => {
              setPeriod(v as StatsPeriod);
              setCustomStart(undefined);
              setCustomEnd(undefined);
            }}
          >
            <TabsList className="h-9">
              {(Object.keys(PERIOD_LABELS) as StatsPeriod[]).map((key) => (
                <TabsTrigger key={key} value={key} className="px-3 text-sm">
                  {PERIOD_LABELS[key]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {isAdminOrRop && (
            <Select value={filterSeller} onValueChange={setFilterSeller}>
              <SelectTrigger className="h-9 w-[170px]">
                <SelectValue placeholder="Barcha sotuvchilar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha sotuvchilar</SelectItem>
                {sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="Barcha manbalar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha manbalar</SelectItem>
              {availableSources.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterStage} onValueChange={setFilterStage}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue placeholder="Barcha bosqichlar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha bosqichlar</SelectItem>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={`h-9 gap-1.5 ${hasCustomDate ? "border-primary text-primary" : ""}`}>
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filtrlar
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3 p-4" align="start">
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">Boshlanish sanasi</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-start gap-2 font-normal">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {customStart ? format(customStart, "dd.MM.yyyy") : "Tanlash"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customStart} onSelect={setCustomStart} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">Tugash sanasi</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-start gap-2 font-normal">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {customEnd ? format(customEnd, "dd.MM.yyyy") : "Tanlash"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customEnd} onSelect={setCustomEnd} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">Qidiruv</Label>
                <Input placeholder="Mijoz, telefon, manzil..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              {hasCustomDate && (
                <Button variant="ghost" size="sm" className="w-full" onClick={() => { setCustomStart(undefined); setCustomEnd(undefined); }}>
                  Tozalash
                </Button>
              )}
            </PopoverContent>
          </Popover>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DashboardStatCard
            id="stats-orders"
            title="Jami zakazlar"
            value={String(totalOrders)}
            description="Oldingi davrga nisbatan"
            icon={ShoppingCart}
            iconClassName="bg-blue-500/10 text-blue-600"
            trend={ordersTrend !== null ? { value: ordersTrend, isPositive: ordersTrend >= 0 } : undefined}
            sparkline={dynamicsData.map((d) => d.orders)}
            sparklineColor="#3b82f6"
          />
          <DashboardStatCard
            id="stats-sales"
            title="Jami savdo"
            value={`${totalSales.toLocaleString()} so'm`}
            description="Oldingi davrga nisbatan"
            icon={DollarSign}
            iconClassName="bg-emerald-500/10 text-emerald-600"
            trend={salesTrend !== null ? { value: salesTrend, isPositive: salesTrend >= 0 } : undefined}
            sparkline={dynamicsData.map((d) => d.revenue)}
            sparklineColor="#22c55e"
          />
          <DashboardStatCard
            id="stats-avg-check"
            title="O'rtacha chek"
            value={`${Math.round(averageCheck).toLocaleString()} so'm`}
            description="Oldingi davrga nisbatan"
            icon={TrendingUp}
            iconClassName="bg-amber-500/10 text-amber-600"
            trend={avgCheckTrend !== null ? { value: avgCheckTrend, isPositive: avgCheckTrend >= 0 } : undefined}
            sparkline={[]}
            sparklineColor="#f59e0b"
          />
          <DashboardStatCard
            id="stats-active-sellers"
            title="Faol sotuvchilar"
            value={String(activeSellerIds.size)}
            description="Jami jamoa bo'yicha"
            icon={Users2}
            iconClassName="bg-violet-500/10 text-violet-600"
            trend={activeSellersTrend !== null ? { value: activeSellersTrend, isPositive: activeSellersTrend >= 0 } : undefined}
            sparkline={[]}
            sparklineColor="#8b5cf6"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-10">
          <Card className="xl:col-span-6">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-muted-foreground" />
                  Savdo dinamikasi
                </CardTitle>
                <p className="text-sm text-muted-foreground">Tanlangan davr bo'yicha savdo va zakazlar</p>
              </div>
              <Select value={granularity} onValueChange={(v) => setGranularity(v as Granularity)}>
                <SelectTrigger className="h-9 w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Kunlik</SelectItem>
                  <SelectItem value="weekly">Haftalik</SelectItem>
                  <SelectItem value="monthly">Oylik</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dynamicsData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="revenue" tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} />
                    <YAxis yAxisId="orders" orientation="right" tick={{ fontSize: 12 }} allowDecimals={false} width={28} />
                    <Tooltip formatter={(value: number, name: string) => [name === "revenue" ? `${value.toLocaleString()} so'm` : `${value} ta`, name === "revenue" ? "Daromad" : "Zakazlar"]} />
                    <Legend formatter={(v) => (v === "revenue" ? "Daromad (so'm)" : "Zakazlar soni")} />
                    <Bar yAxisId="revenue" dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="revenue" />
                    <Line yAxisId="orders" type="monotone" dataKey="orders" stroke="#22c55e" strokeWidth={2} name="orders" dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="xl:col-span-4">
            <DonutCard title="Zakazlar holati" icon={<PieChartIcon className="h-4 w-4 text-muted-foreground" />} unitLabel="zakaz" slices={orderStatusSlices} />
          </div>
        </div>

        {isAdminOrRop && (
          <div className="grid gap-4 xl:grid-cols-10">
            <Card className="xl:col-span-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-muted-foreground" />
                  Lidlar manbalari
                </CardTitle>
                <p className="text-sm text-muted-foreground">Qaysi manbalardan ko'proq lidlar kelmoqda?</p>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RBarChart data={sourceChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="source" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value: number) => [`${value} ta`, "Lidlar"]} />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {sourceChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                    </RBarChart>
                  </ResponsiveContainer>
                  {sourceChartData.length === 0 && <p className="pt-10 text-center text-sm text-muted-foreground">Lidlar topilmadi</p>}
                </div>
              </CardContent>
            </Card>

            <div className="xl:col-span-4">
              <StageBreakdownCard rows={stageBreakdown} onRowClick={handleViewStageLeads} />
            </div>
          </div>
        )}

        {isAdminOrRop && <SellerRankingTable rows={sellerRanking} onRowClick={handleViewSellerOrders} />}

        <Dialog open={leadsDialogOpen} onOpenChange={setLeadsDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{leadsDialogTitle}</DialogTitle>
            </DialogHeader>
            <div className="mt-4">
              {selectedStageLeads.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Lidlar topilmadi</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mijoz nomi</TableHead>
                      <TableHead>Telefon</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedStageLeads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell className="font-medium">{lead.customer_name}</TableCell>
                        <TableCell>{lead.customer_phone || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={ordersDialogOpen} onOpenChange={setOrdersDialogOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{dialogTitle}</DialogTitle>
            </DialogHeader>
            <div className="mt-4">
              {selectedOrders.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Zakazlar topilmadi</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Zakaz №</TableHead>
                      <TableHead>Mijoz</TableHead>
                      <TableHead>Telefon</TableHead>
                      <TableHead>Manzil</TableHead>
                      <TableHead>Summa</TableHead>
                      <TableHead>Holat</TableHead>
                      <TableHead>Sana</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">#{order.order_number}</TableCell>
                        <TableCell>{order.customer_name}</TableCell>
                        <TableCell>{order.customer_phone || "—"}</TableCell>
                        <TableCell>{order.region && order.district ? `${order.region}, ${order.district}` : "—"}</TableCell>
                        <TableCell className="font-semibold">{Number(order.total_amount).toLocaleString()} so'm</TableCell>
                        <TableCell>
                          <Badge variant={order.status === "delivered" ? "success" : order.status === "cancelled" ? "destructive" : "secondary"}>
                            {ORDER_STATUS_LABELS[order.status] || order.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{format(new Date(order.order_date), "dd.MM.yyyy")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Statistics;
