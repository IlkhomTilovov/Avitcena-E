import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  bigint,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "seller"]);
export const appRoleEnum = pgEnum("app_role", ["admin", "rop", "sotuvchi", "super_admin"]);

// Replaces Supabase's auth.users
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  maxUsers: integer("max_users"),
  subscriptionStatus: text("subscription_status").notNull().default("active"),
  subscriptionEndsAt: timestamp("subscription_ends_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  role: userRoleEnum("role").notNull().default("seller"),
  department: text("department"),
  telegramUserId: text("telegram_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    role: appRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userRoleUnique: uniqueIndex("user_roles_user_id_role_key").on(table.userId, table.role),
  }),
);

export const stages = pgTable("stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  displayOrder: integer("display_order").notNull(),
  color: text("color").notNull().default("bg-blue-500"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  sellerId: uuid("seller_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  customerPhoneNorm: text("customer_phone_norm"),
  customerEmail: text("customer_email"),
  source: text("source"),
  status: text("status").notNull().default("new"),
  stage: text("stage").default("yengi_mijoz"),
  notes: text("notes"),
  facebookLeadId: text("facebook_lead_id").unique(),
  facebookFormAnswers: jsonb("facebook_form_answers"),
  // Ad attribution, read off the leadgen object alongside field_data (see
  // routes/integrations/facebookWebhook.ts). Null for leads that didn't come
  // from a Meta Lead Ad (manually created, Telegram, etc.) or whose ad was
  // deleted/inaccessible by the time the lead was fetched.
  adId: text("ad_id"),
  adName: text("ad_name"),
  adsetId: text("adset_id"),
  adsetName: text("adset_name"),
  campaignId: text("campaign_id"),
  campaignName: text("campaign_name"),
  formId: text("form_id"),
  platform: text("platform"), // 'fb' | 'ig', raw from Meta — see `source` for the display label
  isOrganic: boolean("is_organic").notNull().default(false),
  // Meta's Lead Ads Testing Tool leads (dummy placeholder field values) —
  // kept in the CRM like any other lead but excluded from ad reporting.
  isTest: boolean("is_test").notNull().default(false),
  // Dedup key for a Telegram-captured lead: "<chat_id>:<message_id>" of the
  // group message it was parsed from — mirrors facebookLeadId's role.
  telegramLeadId: text("telegram_lead_id").unique(),
  telegramFormAnswers: jsonb("telegram_form_answers"),
  activity: text("activity"),
  employee: text("employee"),
  leadType: text("lead_type"),
  leadQuality: text("lead_quality"),
  productNames: text("product_names").array(),
  price: numeric("price"),
  deliveryStatus: text("delivery_status"),
  actionStatus: text("action_status"),
  callId: text("call_id"),
  callStatus: text("call_status"),
  callDuration: integer("call_duration"),
  // When this lead most recently got its seller — set at creation and bumped
  // on every reassignment (see routes/leads.ts). Separate from createdAt
  // because a lead can sit around (e.g. from a Facebook webhook) before an
  // admin actually hands it to a seller, or get reassigned later — "how many
  // leads did seller X get today" has to count from this, not createdAt.
  sellerAssignedAt: timestamp("seller_assigned_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leadComments = pgTable("lead_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  sellerId: uuid("seller_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  orderNumber: integer("order_number")
    .notNull()
    .generatedByDefaultAsIdentity({ name: "orders_order_number_seq" }),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  customerPhone2: text("customer_phone2"),
  region: text("region"),
  district: text("district"),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
  orderDate: date("order_date").notNull().defaultNow(),
  advancePayment: numeric("advance_payment").default("0"),
  totalAmount: numeric("total_amount").notNull(),
  telegramMessageId: bigint("telegram_message_id", { mode: "number" }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  price: numeric("price").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  sellerId: uuid("seller_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Admin-configurable KPI goals per role/metric. metricKey is a free-form slug
// (e.g. "revenue", "conversion_rate") interpreted by server/src/lib/kpi.ts.
// userId is null for a role-wide default (applies to everyone with that role),
// or set to target one specific employee, overriding the role-wide default
// for that metric (see resolveEmployeeTargets in lib/kpi.ts).
export const kpiTargets = pgTable(
  "kpi_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    role: appRoleEnum("role").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    metricKey: text("metric_key").notNull(),
    targetValue: numeric("target_value").notNull(),
    weight: integer("weight").notNull().default(100),
    period: text("period").notNull().default("monthly"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    kpiTargetUnique: uniqueIndex("kpi_targets_company_role_user_metric_period_key").on(
      table.companyId,
      table.role,
      table.userId,
      table.metricKey,
      table.period,
    ),
  }),
);

// General-purpose audit/activity trail. subjectUserId is the employee the
// event is about (for per-employee history); actorId is who performed it.
export const activityLog = pgTable("activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  subjectUserId: uuid("subject_user_id").references(() => users.id, { onDelete: "set null" }),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  action: text("action").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

