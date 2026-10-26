import { Router } from "express";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { isAdminOrRop, requireAuth, type AppRole, type AuthUser } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { calcAverageCheck, calcCommission, calcConversionRate, calcKpiScore, calcRevenue, calcTaskCompletion, pctChange, resolveEmployeeTargets } from "../lib/kpi.js";

const router = Router();
router.use(requireAuth);

const DAY_MS = 24 * 60 * 60 * 1000;
const toDateStr = (d: Date) => d.toISOString().slice(0, 10);

const parseRange = (req: any) => {
  const now = new Date();
  const to = req.query.to ? new Date(String(req.query.to)) : now;
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(to.getTime() - 29 * DAY_MS);
  const spanMs = Math.max(to.getTime() - from.getTime(), DAY_MS);
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - spanMs);
  return { from, to, prevFrom, prevTo };
};

// Sellers are expected to hold at most one operational role in practice, but
// roles is an array (a user can technically hold several) — pick the most
// specific one for matching KPI targets.
const ROLE_PRIORITY: AppRole[] = ["sotuvchi", "rop", "admin", "super_admin"];
const primaryRole = (roles: AppRole[]): AppRole => ROLE_PRIORITY.find((r) => roles.includes(r)) ?? "sotuvchi";

const fetchStagesForCompany = (companyId: string | null) => {
  const query = db.select().from(schema.stages);
  return companyId ? query.where(eq(schema.stages.companyId, companyId)) : query;
};

const fetchActiveKpiTargetsForCompany = (companyId: string | null) => {
  if (companyId) {
    return db
      .select()
      .from(schema.kpiTargets)
      .where(and(eq(schema.kpiTargets.isActive, true), eq(schema.kpiTargets.companyId, companyId)));
  }
  return db.select().from(schema.kpiTargets).where(eq(schema.kpiTargets.isActive, true));
};

const scopedProfileIds = async (user: AuthUser) => {
  if (isAdminOrRop(user)) {
    const rows = user.companyId
      ? await db.select({ id: schema.profiles.id }).from(schema.profiles).where(eq(schema.profiles.companyId, user.companyId))
      : await db.select({ id: schema.profiles.id }).from(schema.profiles);
    return rows.map((r) => r.id);
  }
  return [user.id];
};

interface PeriodMetrics {
  leadsCount: number;
  ordersCount: number;
  revenue: number;
  averageCheck: number | null;
  conversionRate: number | null;
  taskCompletion: ReturnType<typeof calcTaskCompletion>;
}

const computeMetrics = (orders: any[], leads: any[], tasks: any[], soldStageId: string | null | undefined): PeriodMetrics => ({
  leadsCount: leads.length,
  ordersCount: orders.length,
  revenue: calcRevenue(orders),
  averageCheck: calcAverageCheck(orders),
  conversionRate: calcConversionRate(leads, soldStageId),
  taskCompletion: calcTaskCompletion(tasks),
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (!isAdminOrRop(user)) return res.status(403).json({ error: "Ruxsat yo'q" });

    const { from, to, prevFrom, prevTo } = parseRange(req);
    const profileIds = await scopedProfileIds(user);
    if (profileIds.length === 0) return res.json([]);

    const [profiles, roleRows, stages, orders, leads, tasks, kpiTargets] = await Promise.all([
      db.select().from(schema.profiles).where(inArray(schema.profiles.id, profileIds)),
      db.select().from(schema.userRoles).where(inArray(schema.userRoles.userId, profileIds)),
      fetchStagesForCompany(user.companyId),
      db
        .select()
        .from(schema.orders)
        .where(and(inArray(schema.orders.sellerId, profileIds), gte(schema.orders.orderDate, toDateStr(prevFrom)), lte(schema.orders.orderDate, toDateStr(to)))),
      db
        .select()
        .from(schema.leads)
        .where(and(inArray(schema.leads.sellerId, profileIds), gte(schema.leads.createdAt, prevFrom), lte(schema.leads.createdAt, to))),
      db
        .select()
        .from(schema.tasks)
        .where(and(inArray(schema.tasks.sellerId, profileIds), gte(schema.tasks.dueDate, prevFrom), lte(schema.tasks.dueDate, to))),
      fetchActiveKpiTargetsForCompany(user.companyId),
    ]);

    const soldStage = stages.find((s) => s.name === "Sotildi");
    const rolesByUser = new Map<string, AppRole[]>();
    for (const r of roleRows) rolesByUser.set(r.userId, [...(rolesByUser.get(r.userId) ?? []), r.role as AppRole]);

    const result = profiles.map((profile) => {
      const roles = rolesByUser.get(profile.id) ?? [];
      const role = primaryRole(roles);

      const inCurrent = (dateVal: string | Date, field: "order" | "lead" | "task") => {
        const d = field === "order" ? dateVal : new Date(dateVal as any);
        return field === "order" ? (dateVal as string) >= toDateStr(from) && (dateVal as string) <= toDateStr(to) : d >= from && d <= to;
      };

      const ownOrders = orders.filter((o) => o.sellerId === profile.id);
      const ownLeads = leads.filter((l) => l.sellerId === profile.id);
      const ownTasks = tasks.filter((t) => t.sellerId === profile.id);

      const currentOrders = ownOrders.filter((o) => inCurrent(o.orderDate, "order"));
      const currentLeads = ownLeads.filter((l) => inCurrent(l.createdAt, "lead"));
      const currentTasks = ownTasks.filter((t) => inCurrent(t.dueDate, "task"));
      const previousOrders = ownOrders.filter((o) => !inCurrent(o.orderDate, "order"));
      const previousLeads = ownLeads.filter((l) => !inCurrent(l.createdAt, "lead"));

      const metrics = computeMetrics(currentOrders, currentLeads, currentTasks, soldStage?.id);
      const prevMetrics = computeMetrics(previousOrders, previousLeads, [], soldStage?.id);

      const roleTargets = resolveEmployeeTargets(kpiTargets, role, profile.id);
      const metricByKey: Record<string, number | null> = {
        revenue: metrics.revenue,
        average_check: metrics.averageCheck,
        conversion_rate: metrics.conversionRate,
        task_completion: metrics.taskCompletion.rate,
        orders_count: metrics.ordersCount,
      };
      const scoredTargets = roleTargets
        .map((t) => ({ score: calcKpiScore(metricByKey[t.metricKey] ?? null, Number(t.targetValue)), weight: t.weight }))
        .filter((t): t is { score: number; weight: number } => t.score !== null);
      const totalWeight = scoredTargets.reduce((sum, t) => sum + t.weight, 0);
      const kpiScore = scoredTargets.length === 0 || totalWeight === 0 ? null : scoredTargets.reduce((sum, t) => sum + t.score * t.weight, 0) / totalWeight;
      const revenueTarget = roleTargets.find((t) => t.metricKey === "revenue");
      const commission = calcCommission(metrics.revenue, revenueTarget ? revenueTarget.weight : null);

      return {
        id: profile.id,
        full_name: profile.fullName,
        phone: profile.phone,
        department: profile.department,
        role,
        roles,
        created_at: profile.createdAt,
        is_active: metrics.ordersCount > 0 || metrics.leadsCount > 0,
        metrics: {
          leads_count: metrics.leadsCount,
          orders_count: metrics.ordersCount,
          revenue: metrics.revenue,
          average_check: metrics.averageCheck,
          conversion_rate: metrics.conversionRate,
          task_completion: metrics.taskCompletion,
          kpi_score: kpiScore,
          commission,
          commission_rate: revenueTarget ? revenueTarget.weight : null,
        },
        trend: {
          revenue: pctChange(metrics.revenue, prevMetrics.revenue),
          orders_count: pctChange(metrics.ordersCount, prevMetrics.ordersCount),
        },
      };
    });

    const roleFilter = req.query.role ? String(req.query.role) : null;
    const departmentFilter = req.query.department ? String(req.query.department) : null;
    const statusFilter = req.query.status ? String(req.query.status) : null;
    const search = req.query.search ? String(req.query.search).toLowerCase() : null;

    const filtered = result.filter((e) => {
      if (roleFilter && roleFilter !== "all" && e.role !== roleFilter) return false;
      if (departmentFilter && departmentFilter !== "all" && e.department !== departmentFilter) return false;
      if (statusFilter === "active" && !e.is_active) return false;
      if (statusFilter === "inactive" && e.is_active) return false;
      if (search && !(e.full_name.toLowerCase().includes(search) || e.phone?.toLowerCase().includes(search) || e.department?.toLowerCase().includes(search))) return false;
      return true;
    });

    res.json(filtered);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const employeeId = req.params.id;
    if (employeeId !== user.id && !isAdminOrRop(user)) return res.status(403).json({ error: "Ruxsat yo'q" });

    const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.id, employeeId)).limit(1);
    if (!profile) return res.status(404).json({ error: "Topilmadi" });
    if (isAdminOrRop(user) && user.companyId && profile.companyId && profile.companyId !== user.companyId) {
      return res.status(403).json({ error: "Ruxsat yo'q" });
    }

    const { from, to, prevFrom, prevTo } = parseRange(req);
    const roleRows = await db.select().from(schema.userRoles).where(eq(schema.userRoles.userId, employeeId));
    const roles = roleRows.map((r) => r.role as AppRole);
    const role = primaryRole(roles);

    const [stages, allOrders, allLeads, allTasks, kpiTargets, activity] = await Promise.all([
      fetchStagesForCompany(profile.companyId),
      db
        .select()
        .from(schema.orders)
        .where(and(eq(schema.orders.sellerId, employeeId), gte(schema.orders.orderDate, toDateStr(prevFrom)), lte(schema.orders.orderDate, toDateStr(to))))
        .orderBy(desc(schema.orders.createdAt)),
      db
        .select()
        .from(schema.leads)
        .where(and(eq(schema.leads.sellerId, employeeId), gte(schema.leads.createdAt, prevFrom), lte(schema.leads.createdAt, to)))
        .orderBy(desc(schema.leads.createdAt)),
      db
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.sellerId, employeeId), gte(schema.tasks.dueDate, prevFrom), lte(schema.tasks.dueDate, to)))
        .orderBy(desc(schema.tasks.dueDate)),
      fetchActiveKpiTargetsForCompany(profile.companyId),
      db
        .select()
        .from(schema.activityLog)
        .where(eq(schema.activityLog.subjectUserId, employeeId))
        .orderBy(desc(schema.activityLog.createdAt))
        .limit(50),
    ]);

    const soldStage = stages.find((s) => s.name === "Sotildi");
    const currentOrders = allOrders.filter((o) => o.orderDate >= toDateStr(from) && o.orderDate <= toDateStr(to));
    const previousOrders = allOrders.filter((o) => !(o.orderDate >= toDateStr(from) && o.orderDate <= toDateStr(to)));
    const currentLeads = allLeads.filter((l) => l.createdAt >= from && l.createdAt <= to);
    const previousLeads = allLeads.filter((l) => !(l.createdAt >= from && l.createdAt <= to));
    const currentTasks = allTasks.filter((t) => t.dueDate >= from && t.dueDate <= to);

    const metrics = computeMetrics(currentOrders, currentLeads, currentTasks, soldStage?.id);
    const prevMetrics = computeMetrics(previousOrders, previousLeads, [], soldStage?.id);

    const metricByKey: Record<string, number | null> = {
      revenue: metrics.revenue,
      average_check: metrics.averageCheck,
      conversion_rate: metrics.conversionRate,
      task_completion: metrics.taskCompletion.rate,
      orders_count: metrics.ordersCount,
    };
    const resolvedTargets = resolveEmployeeTargets(kpiTargets, role, employeeId);
    const goals = resolvedTargets.map((t) => ({
      metric_key: t.metricKey,
      target_value: Number(t.targetValue),
      weight: t.weight,
      period: t.period,
      is_personal: t.userId === employeeId,
      actual: metricByKey[t.metricKey] ?? null,
      score: calcKpiScore(metricByKey[t.metricKey] ?? null, Number(t.targetValue)),
    }));
    const revenueTarget = resolvedTargets.find((t) => t.metricKey === "revenue");
    const commission = calcCommission(metrics.revenue, revenueTarget ? revenueTarget.weight : null);

    // Daily breakdown across the requested range, for charts and stat-card sparklines.
    const dailyBuckets: { date: string; revenue: number; orders: number; leads: number; tasksCompleted: number }[] = [];
    for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
      const dateStr = toDateStr(new Date(t));
      const dayOrders = currentOrders.filter((o) => o.orderDate === dateStr);
      const dayLeads = currentLeads.filter((l) => toDateStr(new Date(l.createdAt)) === dateStr);
      const dayTasksCompleted = currentTasks.filter((t2) => t2.completedAt && toDateStr(new Date(t2.completedAt)) === dateStr);
      dailyBuckets.push({
        date: dateStr,
        revenue: calcRevenue(dayOrders),
        orders: dayOrders.length,
        leads: dayLeads.length,
        tasksCompleted: dayTasksCompleted.length,
      });
    }

    res.json({
      profile: { ...profile, role, roles },
      stages,
      metrics: {
        leads_count: metrics.leadsCount,
        orders_count: metrics.ordersCount,
        revenue: metrics.revenue,
        average_check: metrics.averageCheck,
        conversion_rate: metrics.conversionRate,
        task_completion: metrics.taskCompletion,
        commission,
        commission_rate: revenueTarget ? revenueTarget.weight : null,
      },
      trend: {
        revenue: pctChange(metrics.revenue, prevMetrics.revenue),
        orders_count: pctChange(metrics.ordersCount, prevMetrics.ordersCount),
        conversion_rate:
          metrics.conversionRate !== null && prevMetrics.conversionRate !== null ? pctChange(metrics.conversionRate, prevMetrics.conversionRate) : null,
      },
      goals,
      daily: dailyBuckets,
      leads: currentLeads.slice(0, 50),
      orders: currentOrders.slice(0, 50),
      tasks: currentTasks.slice(0, 50),
      activity,
    });
  }),
);

export default router;
