import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";

import authRoutes from "./routes/auth.js";
import uploadsRoutes from "./routes/uploads.js";
import { toCamelCase, toSnakeCase } from "./lib/caseConvert.js";
import profilesRoutes from "./routes/profiles.js";
import productsRoutes from "./routes/products.js";
import stagesRoutes from "./routes/stages.js";
import leadsRoutes from "./routes/leads.js";
import ordersRoutes from "./routes/orders.js";
import tasksRoutes from "./routes/tasks.js";
import adminRoutes from "./routes/admin.js";
import employeesRoutes from "./routes/employees.js";
import kpiTargetsRoutes from "./routes/kpiTargets.js";
import deliveriesRoutes from "./routes/deliveries.js";
import deliveryStatusesRoutes from "./routes/deliveryStatuses.js";
import couriersRoutes from "./routes/couriers.js";
import telegramRoutes from "./routes/integrations/telegram.js";
import telegramWebhookRoutes from "./routes/integrations/telegramWebhook.js";
import sheetsRoutes from "./routes/integrations/sheets.js";
import sheetsWebhookRoutes from "./routes/integrations/sheetsWebhook.js";
import facebookWebhookRoutes from "./routes/integrations/facebookWebhook.js";
import { scheduleDailySalesReport } from "./jobs/dailySalesReport.js";
import { scheduleDailyDeliveryReport } from "./jobs/dailyDeliveryReport.js";

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:8080" }));
app.use(
  express.json({
    // Facebook webhook imzosini (X-Hub-Signature-256) tekshirish uchun xom body kerak.
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// The frontend was originally written against Supabase's snake_case column names.
// Our own CRUD API keeps camelCase internally (idiomatic Drizzle/TS) but talks
// snake_case on the wire, so most pages barely changed when Supabase was removed.
// Integration/webhook routes deal with external payload shapes (Telegram, Facebook,
// Google Sheets) and must NOT be rewritten, so they're excluded here.
app.use((req, res, next) => {
  if (req.path.startsWith("/api/integrations") || req.path.startsWith("/api/uploads")) {
    return next();
  }
  if (req.body && typeof req.body === "object") {
    req.body = toCamelCase(req.body);
  }
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => originalJson(toSnakeCase(body))) as typeof res.json;
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/uploads", uploadsRoutes);
app.use("/api/profiles", profilesRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/stages", stagesRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/employees", employeesRoutes);
app.use("/api/kpi-targets", kpiTargetsRoutes);
app.use("/api/deliveries", deliveriesRoutes);
app.use("/api/delivery-statuses", deliveryStatusesRoutes);
app.use("/api/couriers", couriersRoutes);
// telegramWebhookRoutes (public, no auth — Telegram itself calls /webhook) must be
// mounted BEFORE telegramRoutes: both share this exact path prefix, and
// telegramRoutes' blanket requireAuth middleware would otherwise intercept and
// reject every request under the prefix, including /webhook, before Express ever
// tries telegramWebhookRoutes' own (unauthenticated) route for it.
app.use("/api/integrations/telegram", telegramWebhookRoutes);
app.use("/api/integrations/telegram", telegramRoutes);
app.use("/api/integrations/sheets", sheetsRoutes);
app.use("/api/integrations/sheets", sheetsWebhookRoutes);
app.use("/api/integrations/facebook", facebookWebhookRoutes);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Daraja ERP backend listening on http://localhost:${port}`);
  scheduleDailySalesReport();
  scheduleDailyDeliveryReport();
});
