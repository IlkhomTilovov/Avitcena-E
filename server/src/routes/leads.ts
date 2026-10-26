import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { isAdminOrRop, requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { recordActivity } from "../lib/activityLog.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const base = db.select().from(schema.leads).orderBy(desc(schema.leads.createdAt));
    let rows;
    if (isAdminOrRop(user)) {
      rows = user.companyId
        ? await base.where(eq(schema.leads.companyId, user.companyId))
        : await base;
    } else {
      rows = await base.where(eq(schema.leads.sellerId, user.id));
    }
    res.json(rows);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const [row] = await db.select().from(schema.leads).where(eq(schema.leads.id, req.params.id)).limit(1);
    if (!row) return res.status(404).json({ error: "Topilmadi" });
    if (!isAdminOrRop(user) && row.sellerId !== user.id) {
      return res.status(403).json({ error: "Ruxsat yo'q" });
    }
    res.json(row);
  }),
);

const leadSchema = z.object({
  sellerId: z.string().uuid(),
  customerName: z.string().min(1),
  customerPhone: z.string().nullable().optional(),
  customerEmail: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  status: z.string().optional(),
  stage: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  activity: z.string().nullable().optional(),
  employee: z.string().nullable().optional(),
  leadType: z.string().nullable().optional(),
  leadQuality: z.string().nullable().optional(),
  productNames: z.array(z.string()).nullable().optional(),
  price: z.number().nullable().optional(),
  deliveryStatus: z.string().nullable().optional(),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (!isAdminOrRop(user)) return res.status(403).json({ error: "Ruxsat yo'q" });
    const parsed = leadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Noto'g'ri ma'lumot", details: parsed.error.flatten() });

    const { price, ...rest } = parsed.data;
    const [row] = await db
      .insert(schema.leads)
      .values({ ...rest, price: price != null ? String(price) : undefined, companyId: user.companyId })
      .returning();
    res.status(201).json(row);
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const [existing] = await db.select().from(schema.leads).where(eq(schema.leads.id, req.params.id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Topilmadi" });
    if (!isAdminOrRop(user) && existing.sellerId !== user.id) {
      return res.status(403).json({ error: "Ruxsat yo'q" });
    }

    const parsed = leadSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Noto'g'ri ma'lumot" });

    const { price, ...rest } = parsed.data;
    const isReassignment = rest.sellerId !== undefined && rest.sellerId !== existing.sellerId;
    const [row] = await db
      .update(schema.leads)
      .set({
        ...rest,
        ...(price !== undefined ? { price: price != null ? String(price) : null } : {}),
        // "How many leads did seller X get today" counts from this, not
        // createdAt — bump it every time the lead actually changes hands.
        ...(isReassignment ? { sellerAssignedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.leads.id, req.params.id))
      .returning();

    if (rest.stage && rest.stage !== existing.stage) {
      recordActivity({
        companyId: existing.companyId,
        actorId: user.id,
        subjectUserId: existing.sellerId,
        entityType: "lead",
        entityId: existing.id,
        action: "stage_changed",
        metadata: { from: existing.stage, to: rest.stage },
      });

      // Moving a lead into the "Sotildi" stage drops it straight onto the
      // Dastavka board: create the order (if one doesn't already exist for
      // this lead) so it shows up there as "Yetkazishga tayyor", with no
      // separate "convert to order" step for the seller/admin to remember.
      const [newStage] = await db.select().from(schema.stages).where(eq(schema.stages.id, rest.stage)).limit(1);
      if (newStage?.name === "Sotildi") {
        const [existingOrder] = await db.select({ id: schema.orders.id }).from(schema.orders).where(eq(schema.orders.leadId, row.id)).limit(1);
        if (!existingOrder) {
          const [order] = await db
            .insert(schema.orders)
            .values({
              companyId: existing.companyId,
              sellerId: row.sellerId,
              leadId: row.id,
              customerName: existing.customerName,
              customerPhone: existing.customerPhone,
              notes: existing.notes,
              totalAmount: row.price ?? "0",
            })
            .returning();
          recordActivity({
            companyId: existing.companyId,
            actorId: user.id,
            subjectUserId: row.sellerId,
            entityType: "order",
            entityId: order.id,
            action: "created_from_lead",
            metadata: { leadId: row.id },
          });
        }
      }
    }

    // Keep a sold lead's order amount in sync with later price edits — the
    // order's totalAmount was otherwise only ever set once at creation time,
    // so Dastavka kept showing a stale (often zero) amount after the seller
    // adjusted the price afterward.
    if (price !== undefined) {
      const [linkedOrder] = await db
        .select({ id: schema.orders.id })
        .from(schema.orders)
        .where(eq(schema.orders.leadId, row.id))
        .limit(1);
      if (linkedOrder) {
        await db
          .update(schema.orders)
          .set({ totalAmount: String(price), updatedAt: new Date() })
          .where(eq(schema.orders.id, linkedOrder.id));
      }
    }

    // Reassigning a lead to a different seller should carry its order along
    // too, otherwise the order (and its "Barcha zakazlar" / Dastavka entry)
    // keeps showing up for whoever the lead was assigned to when it was sold,
    // not the seller it was just handed to.
    if (isReassignment) {
      const [orderToReassign] = await db
        .select({ id: schema.orders.id })
        .from(schema.orders)
        .where(eq(schema.orders.leadId, row.id))
        .limit(1);
      if (orderToReassign) {
        await db
          .update(schema.orders)
          .set({ sellerId: rest.sellerId, updatedAt: new Date() })
          .where(eq(schema.orders.id, orderToReassign.id));
      }
    }

    res.json(row);
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!isAdminOrRop(req.user)) return res.status(403).json({ error: "Ruxsat yo'q" });
    await db.delete(schema.leads).where(eq(schema.leads.id, req.params.id));
    res.status(204).end();
  }),
);

// Comments
router.get(
  "/:leadId/comments",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, req.params.leadId)).limit(1);
    if (!lead) return res.status(404).json({ error: "Topilmadi" });
    if (!isAdminOrRop(user) && lead.sellerId !== user.id) return res.status(403).json({ error: "Ruxsat yo'q" });

    const rows = await db
      .select()
      .from(schema.leadComments)
      .where(eq(schema.leadComments.leadId, req.params.leadId))
      .orderBy(desc(schema.leadComments.createdAt));
    res.json(rows);
  }),
);

router.post(
  "/:leadId/comments",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, req.params.leadId)).limit(1);
    if (!lead) return res.status(404).json({ error: "Topilmadi" });
    if (!isAdminOrRop(user) && lead.sellerId !== user.id) return res.status(403).json({ error: "Ruxsat yo'q" });

    const parsed = z.object({ comment: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Noto'g'ri ma'lumot" });

    const [row] = await db
      .insert(schema.leadComments)
      .values({ leadId: req.params.leadId, userId: user.id, comment: parsed.data.comment })
      .returning();
    res.status(201).json(row);
  }),
);

export default router;
