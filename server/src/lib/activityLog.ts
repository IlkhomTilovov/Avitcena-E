import { db, schema } from "../db/index.js";

export type ActivityEntityType = "lead" | "order" | "task" | "user" | "kpi_target";

interface RecordActivityInput {
  companyId: string | null;
  actorId: string;
  subjectUserId: string | null;
  entityType: ActivityEntityType;
  entityId: string | null;
  action: string;
  metadata?: Record<string, unknown>;
}

// Best-effort audit trail write. Never throws into the caller's request path —
// a logging failure must not block the underlying lead/order/task mutation.
export const recordActivity = async (input: RecordActivityInput) => {
  try {
    await db.insert(schema.activityLog).values({
      companyId: input.companyId,
      actorId: input.actorId,
      subjectUserId: input.subjectUserId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      metadata: input.metadata ?? null,
    });
  } catch (error) {
    console.error("Failed to record activity log entry:", error);
  }
};
