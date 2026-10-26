import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardStatCard from "@/components/dashboard/DashboardStatCard";
import DashboardPeriodControl, { DashboardPeriod } from "@/components/dashboard/DashboardPeriodControl";
import KpiTargetsDialog from "@/components/employees/KpiTargetsDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Users, Search, Download, DollarSign, Target, TrendingUp, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useNavigate } from "react-router-dom";
import { format, subDays, subMonths, subWeeks, subYears, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import * as XLSX from "xlsx";
import { formatKpiValue, getRoleLabel, NO_DATA_LABEL } from "@/lib/kpiDisplay";
import { getAvatarColor, getInitials } from "@/lib/leadDisplay";

interface EmployeeRow {
  id: string;
  full_name: string;
  phone: string | null;
  department: string | null;
  role: string;
  roles: string[];
  created_at: string;
  is_active: boolean;
  metrics: {
    leads_count: number;
    orders_count: number;
    revenue: number;
    average_check: number | null;
    conversion_rate: number | null;
    task_completion: { total: number; completed: number; overdue: number; rate: number | null };
    kpi_score: number | null;
    commission: number | null;
    commission_rate: number | null;
  };
}

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

const Sellers = () => {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    role: "sotuvchi" as "admin" | "rop" | "sotuvchi",
  });
  const [period, setPeriod] = useState<DashboardPeriod>("month");
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  const [roleFilter, setRoleFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const { isAdminOrRop, loading: rolesLoading } = useUserRoles();
  const navigate = useNavigate();

  useEffect(() => {
    if (!rolesLoading && !isAdminOrRop) {
      navigate("/");
      toast.error("Ruxsat yo'q");
    }
  }, [rolesLoading, isAdminOrRop, navigate]);

  const { start: periodStart, end: periodEnd } = useMemo(() => getPeriodRange(period, customRange), [period, customRange]);

  useEffect(() => {
    if (!rolesLoading && isAdminOrRop) {
      fetchEmployees();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesLoading, isAdminOrRop, periodStart, periodEnd]);

  const fetchEmployees = async () => {
    try {
      const data = await api.employees.list({ from: periodStart.toISOString(), to: periodEnd.toISOString() });
      setEmployees(data);
    } catch (error) {
      toast.error("Xatolik: " + (error instanceof ApiError ? error.message : ""));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await api.admin.createUser(formData);

      toast.success("Hodim muvaffaqiyatli qo'shildi!");
      setDialogOpen(false);
      setFormData({ full_name: "", email: "", password: "", phone: "", role: "sotuvchi" });
      fetchEmployees();
    } catch (error) {
      toast.error("Xatolik: " + (error instanceof ApiError ? error.message : ""));
    }
  };

  const handleDelete = async (sellerId: string) => {
    if (!confirm("Haqiqatan ham bu hodimni o'chirmoqchimisiz?")) return;

    try {
      await api.admin.deleteUser(sellerId);
      toast.success("Hodim muvaffaqiyatli o'chirildi!");
      fetchEmployees();
    } catch (error) {
      toast.error("Xatolik: " + (error instanceof ApiError ? error.message : ""));
    }
  };

  const departments = useMemo(
    () => Array.from(new Set(employees.map((e) => e.department).filter((d): d is string => !!d))),
    [employees],
  );

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees
      .filter((e) => roleFilter === "all" || e.role === roleFilter)
      .filter((e) => departmentFilter === "all" || e.department === departmentFilter)
      .filter((e) => statusFilter === "all" || (statusFilter === "active" ? e.is_active : !e.is_active))
      .filter((e) => !q || e.full_name.toLowerCase().includes(q) || e.phone?.toLowerCase().includes(q))
      .sort((a, b) => (b.metrics.kpi_score ?? -1) - (a.metrics.kpi_score ?? -1));
  }, [employees, roleFilter, departmentFilter, statusFilter, search]);

  const totalEmployees = employees.length;
  const activeEmployees = employees.filter((e) => e.is_active).length;
  const teamRevenue = employees.reduce((sum, e) => sum + e.metrics.revenue, 0);
  const scoredEmployees = employees.filter((e) => e.metrics.kpi_score !== null);
  const planCompletion = scoredEmployees.length
    ? scoredEmployees.reduce((sum, e) => sum + (e.metrics.kpi_score ?? 0), 0) / scoredEmployees.length
    : null;
  const conversionEmployees = employees.filter((e) => e.metrics.conversion_rate !== null);
  const avgConversion = conversionEmployees.length
    ? conversionEmployees.reduce((sum, e) => sum + (e.metrics.conversion_rate ?? 0), 0) / conversionEmployees.length
    : null;
  const tasksCompleted = employees.reduce((sum, e) => sum + e.metrics.task_completion.completed, 0);
  const tasksOverdue = employees.reduce((sum, e) => sum + e.metrics.task_completion.overdue, 0);

  const handleExport = () => {
    const exportData = filteredEmployees.map((e, i) => ({
      "#": i + 1,
      Ism: e.full_name,
      Lavozim: getRoleLabel(e.role),
      Telefon: e.phone || "",
      Lidlar: e.metrics.leads_count,
      Buyurtmalar: e.metrics.orders_count,
      "Savdo tushumi": e.metrics.revenue,
      Komissiya: e.metrics.commission !== null ? Math.round(e.metrics.commission) : NO_DATA_LABEL,
      Konversiya: e.metrics.conversion_rate !== null ? `${e.metrics.conversion_rate.toFixed(1)}%` : NO_DATA_LABEL,
      "KPI foizi": e.metrics.kpi_score !== null ? `${e.metrics.kpi_score.toFixed(0)}%` : NO_DATA_LABEL,
      Holat: e.is_active ? "Faol" : "Nofaol",
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Xodimlar");
    XLSX.writeFile(wb, `Xodimlar_${format(new Date(), "yyyy-MM-dd_HH-mm")}.xlsx`);
  };

  const dateRangeLabel =
    format(periodStart, "yyyy-MM-dd") === format(periodEnd, "yyyy-MM-dd")
      ? format(periodStart, "dd MMM yyyy")
      : `${format(periodStart, "dd MMM yyyy")} - ${format(periodEnd, "dd MMM yyyy")}`;

  if (rolesLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Yuklanmoqda...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Hodimlar</h1>
              <p className="text-muted-foreground">Jami {totalEmployees} ta hodim, {activeEmployees} ta faol</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <KpiTargetsDialog onUpdate={fetchEmployees} />

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Yangi hodim
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Yangi hodim qo'shish</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="full_name">To'liq ism</Label>
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Parol</Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefon</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+998901234567"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Lavozim</Label>
                    <select
                      id="role"
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="sotuvchi">Sotuvchi</option>
                      <option value="rop">ROP</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <Button type="submit" className="w-full">Saqlash</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <DashboardStatCard
            id="emp-total"
            title="Jami / faol xodimlar"
            value={`${totalEmployees} / ${activeEmployees}`}
            description="Joriy davrda faol"
            icon={Users}
            iconClassName="bg-blue-500/10 text-blue-600"
            sparkline={[]}
            sparklineColor="#3b82f6"
          />
          <DashboardStatCard
            id="emp-revenue"
            title="Jamoa savdo tushumi"
            value={`${teamRevenue.toLocaleString()} so'm`}
            description="Tanlangan davr bo'yicha"
            icon={DollarSign}
            iconClassName="bg-emerald-500/10 text-emerald-600"
            sparkline={[]}
            sparklineColor="#22c55e"
          />
          <DashboardStatCard
            id="emp-plan"
            title="Reja bajarilishi"
            value={planCompletion !== null ? `${planCompletion.toFixed(0)}%` : NO_DATA_LABEL}
            description="KPI maqsadlariga nisbatan, o'rtacha"
            icon={Target}
            iconClassName="bg-amber-500/10 text-amber-600"
            sparkline={[]}
            sparklineColor="#f59e0b"
          />
          <DashboardStatCard
            id="emp-conversion"
            title="O'rtacha konversiya"
            value={avgConversion !== null ? `${avgConversion.toFixed(1)}%` : NO_DATA_LABEL}
            description="Liddan buyurtmaga"
            icon={TrendingUp}
            iconClassName="bg-violet-500/10 text-violet-600"
            sparkline={[]}
            sparklineColor="#8b5cf6"
          />
          <DashboardStatCard
            id="emp-tasks"
            title="Vazifalar"
            value={`${tasksCompleted} bajarildi`}
            description={`${tasksOverdue} ta muddati o'tgan`}
            icon={CheckSquare}
            iconClassName="bg-rose-500/10 text-rose-600"
            sparkline={[]}
            sparklineColor="#f43f5e"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DashboardPeriodControl period={period} onPeriodChange={setPeriod} dateRangeLabel={dateRangeLabel} customRange={customRange} onCustomRangeChange={setCustomRange} />

          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="Lavozim" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha lavozimlar</SelectItem>
              <SelectItem value="sotuvchi">Sotuvchi</SelectItem>
              <SelectItem value="rop">ROP</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="Holat" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha holatlar</SelectItem>
              <SelectItem value="active">Faol</SelectItem>
              <SelectItem value="inactive">Nofaol</SelectItem>
            </SelectContent>
          </Select>

          {departments.length > 0 && (
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Jamoa / bo'lim" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha bo'limlar</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Xodim qidirish..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-[200px] pl-9" />
          </div>

          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
            Eksport
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Ism</TableHead>
                    <TableHead>Lavozim</TableHead>
                    <TableHead>Lidlar</TableHead>
                    <TableHead>Buyurtmalar</TableHead>
                    <TableHead>Savdo tushumi</TableHead>
                    <TableHead>Komissiya</TableHead>
                    <TableHead>Konversiya</TableHead>
                    <TableHead>KPI foizi</TableHead>
                    <TableHead>Vazifalar</TableHead>
                    <TableHead className="text-right">Amallar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                        Hodimlar topilmadi
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEmployees.map((employee, index) => (
                      <TableRow key={employee.id} className="cursor-pointer" onClick={() => navigate(`/sellers/${employee.id}`)}>
                        <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className={`text-xs font-semibold ${getAvatarColor(employee.full_name)}`}>
                                {getInitials(employee.full_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{employee.full_name}</p>
                              {employee.department && <p className="text-xs text-muted-foreground">{employee.department}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{getRoleLabel(employee.role)}</Badge>
                        </TableCell>
                        <TableCell>{employee.metrics.leads_count}</TableCell>
                        <TableCell>{employee.metrics.orders_count}</TableCell>
                        <TableCell>{employee.metrics.revenue.toLocaleString()} so'm</TableCell>
                        <TableCell>
                          {employee.metrics.commission !== null ? `${Math.round(employee.metrics.commission).toLocaleString()} so'm` : NO_DATA_LABEL}
                        </TableCell>
                        <TableCell>
                          {employee.metrics.conversion_rate !== null ? `${employee.metrics.conversion_rate.toFixed(1)}%` : NO_DATA_LABEL}
                        </TableCell>
                        <TableCell>
                          {employee.metrics.kpi_score !== null ? (
                            <div className="flex w-28 items-center gap-2">
                              <Progress value={Math.min(employee.metrics.kpi_score, 100)} className="h-2" />
                              <span className="text-xs font-medium">{employee.metrics.kpi_score.toFixed(0)}%</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">{NO_DATA_LABEL}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {employee.metrics.task_completion.completed}/{employee.metrics.task_completion.total}
                          </span>
                          {employee.metrics.task_completion.overdue > 0 && (
                            <Badge variant="destructive" className="ml-1.5 text-[10px]">
                              {employee.metrics.task_completion.overdue} kechikkan
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(employee.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Sellers;
