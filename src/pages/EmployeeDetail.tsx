import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardStatCard from "@/components/dashboard/DashboardStatCard";
import DashboardPeriodControl, { DashboardPeriod } from "@/components/dashboard/DashboardPeriodControl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  CheckSquare,
  UserPlus,
  RefreshCcw,
  CheckCircle2,
  UserCog,
  Target,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { format, subMonths, subWeeks, subYears, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatKpiValue, getKpiMetricMeta, getRoleLabel, NO_DATA_LABEL } from "@/lib/kpiDisplay";
import { getAvatarColor, getInitials } from "@/lib/leadDisplay";

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
      if (customRange?.from && customRange?.to) return { start: startOfDay(customRange.from), end: customRange.to };
      return { start: subWeeks(now, 1), end: now };
    default:
      return { start: subWeeks(now, 1), end: now };
  }
};

const ORDER_STATUS_LABELS: Record<string, string> = { pending: "Jarayonda", delivered: "Tugallandi", cancelled: "Bekor qilindi" };
const TASK_STATUS_LABELS: Record<string, string> = { pending: "Kutilmoqda", completed: "Bajarildi" };

const timeAgoUz = (date: Date) => {
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMinutes < 1) return "hozir";
  if (diffMinutes < 60) return `${diffMinutes} daqiqa oldin`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours} soat oldin`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} kun oldin`;
  return `${Math.floor(days / 30)} oy oldin`;
};

const ACTIVITY_ICON: Record<string, any> = {
  lead: UserPlus,
  order: RefreshCcw,
  task: CheckCircle2,
  user: UserCog,
  kpi_target: Target,
};

const describeActivity = (entry: any, stageNameById: Map<string, string>) => {
  const meta = entry.metadata || {};
  const key = `${entry.entity_type}:${entry.action}`;
  switch (key) {
    case "lead:stage_changed":
      return `Lid bosqichi: ${stageNameById.get(meta.from) ?? meta.from ?? "—"} → ${stageNameById.get(meta.to) ?? meta.to ?? "—"}`;
    case "order:status_changed":
      return `Zakaz holati: ${ORDER_STATUS_LABELS[meta.from] ?? meta.from ?? "—"} → ${ORDER_STATUS_LABELS[meta.to] ?? meta.to ?? "—"}`;
    case "task:completed":
      return `Vazifa bajarildi: ${meta.title ?? ""}`;
    case "user:created":
      return `Foydalanuvchi yaratildi (${getRoleLabel(meta.role)})`;
    case "user:deleted":
      return "Foydalanuvchi o'chirildi";
    case "kpi_target:created":
      return `KPI maqsadi qo'shildi: ${getKpiMetricMeta(meta.metric_key).label}`;
    case "kpi_target:updated":
      return `KPI maqsadi yangilandi: ${getKpiMetricMeta(meta.metric_key).label}`;
    case "kpi_target:deleted":
      return "KPI maqsadi o'chirildi";
    default:
      return `${entry.entity_type} — ${entry.action}`;
  }
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

const EmployeeDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdminOrRop, loading: rolesLoading } = useUserRoles();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<DashboardPeriod>("month");
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);

  const canView = !!id && (id === user?.id || isAdminOrRop);

  useEffect(() => {
    if (!rolesLoading && !canView) {
      navigate("/sellers");
      toast.error("Ruxsat yo'q");
    }
  }, [rolesLoading, canView, navigate]);

  const { start: periodStart, end: periodEnd } = useMemo(() => getPeriodRange(period, customRange), [period, customRange]);

  useEffect(() => {
    if (!id || !canView) return;
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, canView, periodStart, periodEnd]);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      const result = await api.employees.get(id!, { from: periodStart.toISOString(), to: periodEnd.toISOString() });
      setData(result);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Ma'lumotlarni yuklashda xato");
    } finally {
      setLoading(false);
    }
  };

  const dateRangeLabel =
    format(periodStart, "yyyy-MM-dd") === format(periodEnd, "yyyy-MM-dd")
      ? format(periodStart, "dd MMM yyyy")
      : `${format(periodStart, "dd MMM yyyy")} - ${format(periodEnd, "dd MMM yyyy")}`;

  const stageNameById = useMemo(() => new Map<string, string>((data?.stages ?? []).map((s: any) => [s.id, s.name])), [data?.stages]);
  const stageById = useMemo(() => new Map<string, any>((data?.stages ?? []).map((s: any) => [s.id, s])), [data?.stages]);

  if (rolesLoading || loading || !data) {
    return (
      <DashboardLayout>
        <div className="flex h-64 items-center justify-center text-muted-foreground">Yuklanmoqda...</div>
      </DashboardLayout>
    );
  }

  const { profile, metrics, trend, goals, daily, leads, orders, tasks, activity } = data;

  return (
    <DashboardLayout
      headerExtra={<DashboardPeriodControl period={period} onPeriodChange={setPeriod} dateRangeLabel={dateRangeLabel} customRange={customRange} onCustomRangeChange={setCustomRange} />}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate("/sellers")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-14 w-14">
            <AvatarFallback className={`text-lg font-semibold ${getAvatarColor(profile.full_name)}`}>{getInitials(profile.full_name)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{profile.full_name}</h1>
              <Badge variant="outline">{getRoleLabel(profile.role)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {profile.phone || "Telefon kiritilmagan"}
              {profile.department ? ` · ${profile.department}` : ""}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <DashboardStatCard
            id="emp-detail-revenue"
            title="Savdo tushumi"
            value={`${metrics.revenue.toLocaleString()} so'm`}
            description="Tanlangan davr"
            icon={DollarSign}
            iconClassName="bg-emerald-500/10 text-emerald-600"
            trend={trend.revenue !== null ? { value: trend.revenue, isPositive: trend.revenue >= 0 } : undefined}
            sparkline={daily.map((d: any) => d.revenue)}
            sparklineColor="#22c55e"
          />
          <DashboardStatCard
            id="emp-detail-orders"
            title="Buyurtmalar"
            value={String(metrics.orders_count)}
            description="Tanlangan davr"
            icon={ShoppingCart}
            iconClassName="bg-blue-500/10 text-blue-600"
            trend={trend.orders_count !== null ? { value: trend.orders_count, isPositive: trend.orders_count >= 0 } : undefined}
            sparkline={daily.map((d: any) => d.orders)}
            sparklineColor="#3b82f6"
          />
          <DashboardStatCard
            id="emp-detail-conversion"
            title="Konversiya"
            value={metrics.conversion_rate !== null ? `${metrics.conversion_rate.toFixed(1)}%` : NO_DATA_LABEL}
            description="Liddan buyurtmaga"
            icon={TrendingUp}
            iconClassName="bg-violet-500/10 text-violet-600"
            trend={trend.conversion_rate !== null ? { value: trend.conversion_rate, isPositive: trend.conversion_rate >= 0 } : undefined}
            sparkline={daily.map((d: any) => d.leads)}
            sparklineColor="#8b5cf6"
          />
          <DashboardStatCard
            id="emp-detail-tasks"
            title="Vazifalar bajarilishi"
            value={metrics.task_completion.rate !== null ? `${metrics.task_completion.rate.toFixed(0)}%` : NO_DATA_LABEL}
            description={`${metrics.task_completion.completed}/${metrics.task_completion.total} bajarildi, ${metrics.task_completion.overdue} kechikkan`}
            icon={CheckSquare}
            iconClassName="bg-amber-500/10 text-amber-600"
            sparkline={daily.map((d: any) => d.tasks_completed)}
            sparklineColor="#f59e0b"
          />
          <DashboardStatCard
            id="emp-detail-commission"
            title="Hisoblangan komissiya"
            value={metrics.commission !== null ? `${Math.round(metrics.commission).toLocaleString()} so'm` : NO_DATA_LABEL}
            description={
              metrics.commission_rate !== null
                ? `Savdo tushumidan ${metrics.commission_rate}%`
                : "Savdo tushumi rejasida foiz sozlanmagan"
            }
            icon={Wallet}
            iconClassName="bg-rose-500/10 text-rose-600"
            sparkline={metrics.commission_rate !== null ? daily.map((d: any) => d.revenue * (metrics.commission_rate / 100)) : []}
            sparklineColor="#f43f5e"
          />
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">Umumiy natijalar</TabsTrigger>
            <TabsTrigger value="kpi">KPI va maqsadlar</TabsTrigger>
            <TabsTrigger value="leads">Lidlar tarixi</TabsTrigger>
            <TabsTrigger value="orders">Buyurtmalar tarixi</TabsTrigger>
            <TabsTrigger value="tasks">Vazifalar</TabsTrigger>
            <TabsTrigger value="activity">Faoliyat va audit</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Card>
              <CardHeader>
                <CardTitle>Daromad va zakazlar dinamikasi</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={daily}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="revenue" tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} />
                      <YAxis yAxisId="orders" orientation="right" tick={{ fontSize: 12 }} allowDecimals={false} width={28} />
                      <Tooltip content={<RevenueTooltip />} />
                      <Legend formatter={(v) => (v === "revenue" ? "Daromad (so'm)" : "Zakazlar soni")} />
                      <Bar yAxisId="revenue" dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="revenue" />
                      <Line yAxisId="orders" type="monotone" dataKey="orders" stroke="#22c55e" strokeWidth={2} name="orders" dot={{ r: 2 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="kpi">
            <Card>
              <CardHeader>
                <CardTitle>KPI maqsadlari</CardTitle>
                <p className="text-sm text-muted-foreground">{getRoleLabel(profile.role)} lavozimi uchun sozlangan maqsadlar</p>
              </CardHeader>
              <CardContent className="space-y-5">
                {goals.length === 0 && <p className="text-sm text-muted-foreground">Bu lavozim uchun hali KPI maqsadi sozlanmagan.</p>}
                {goals.map((goal: any) => {
                  const meta = getKpiMetricMeta(goal.metric_key);
                  return (
                    <div key={goal.metric_key}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 font-medium">
                          {meta.label}
                          <Badge variant={goal.is_personal ? "default" : "secondary"} className="text-[10px]">
                            {goal.is_personal ? "Shaxsiy" : "Umumiy"}
                          </Badge>
                        </span>
                        <span className="text-muted-foreground">
                          {formatKpiValue(goal.actual, meta.unit)} / {formatKpiValue(goal.target_value, meta.unit)}
                        </span>
                      </div>
                      {goal.score !== null ? (
                        <Progress value={Math.min(goal.score, 100)} className="h-2.5" />
                      ) : (
                        <Progress value={0} className="h-2.5 opacity-40" />
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leads">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mijoz</TableHead>
                      <TableHead>Bosqich</TableHead>
                      <TableHead>Manba</TableHead>
                      <TableHead>Sana</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          Lidlar topilmadi
                        </TableCell>
                      </TableRow>
                    ) : (
                      leads.map((lead: any) => {
                        const stage = stageById.get(lead.stage);
                        return (
                          <TableRow key={lead.id} className="cursor-pointer" onClick={() => navigate(`/leads?openLead=${lead.id}`)}>
                            <TableCell className="font-medium">{lead.customer_name}</TableCell>
                            <TableCell>{stage ? <Badge className={`border-0 text-white ${stage.color}`}>{stage.name}</Badge> : "—"}</TableCell>
                            <TableCell>{lead.source || "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{format(new Date(lead.created_at), "dd.MM.yyyy")}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mijoz</TableHead>
                      <TableHead>Holat</TableHead>
                      <TableHead>Summasi</TableHead>
                      <TableHead>Sana</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          Buyurtmalar topilmadi
                        </TableCell>
                      </TableRow>
                    ) : (
                      orders.map((order: any) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.customer_name}</TableCell>
                          <TableCell>
                            <Badge variant={order.status === "delivered" ? "success" : order.status === "cancelled" ? "destructive" : "secondary"}>
                              {ORDER_STATUS_LABELS[order.status] || order.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{Number(order.total_amount).toLocaleString()} so'm</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{order.order_date}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vazifa</TableHead>
                      <TableHead>Holat</TableHead>
                      <TableHead>Muddat</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                          Vazifalar topilmadi
                        </TableCell>
                      </TableRow>
                    ) : (
                      tasks.map((task: any) => (
                        <TableRow key={task.id}>
                          <TableCell className="font-medium">{task.title}</TableCell>
                          <TableCell>
                            <Badge variant={task.status === "completed" ? "success" : "secondary"}>{TASK_STATUS_LABELS[task.status] || task.status}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{format(new Date(task.due_date), "dd.MM.yyyy HH:mm")}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardContent className="space-y-4 pt-6">
                {activity.length === 0 && <p className="text-sm text-muted-foreground">Faoliyat tarixi topilmadi</p>}
                {activity.map((entry: any) => {
                  const Icon = ACTIVITY_ICON[entry.entity_type] || UserCog;
                  return (
                    <div key={entry.id} className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{describeActivity(entry, stageNameById)}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{timeAgoUz(new Date(entry.created_at))}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default EmployeeDetail;
