export type DeliveryStatus = "ready" | "delivered" | "rejected";

export const DELIVERY_STATUS_META: Record<DeliveryStatus, { label: string; headerClassName: string; badgeClassName: string; dotClassName: string }> = {
  ready: {
    label: "Jarayonda",
    headerClassName: "bg-slate-500",
    badgeClassName: "border-slate-300 bg-slate-50 text-slate-700",
    dotClassName: "bg-slate-500",
  },
  delivered: {
    label: "Yetkazildi",
    headerClassName: "bg-emerald-500",
    badgeClassName: "border-emerald-300 bg-emerald-50 text-emerald-700",
    dotClassName: "bg-emerald-500",
  },
  rejected: {
    label: "Rad etildi",
    headerClassName: "bg-red-500",
    badgeClassName: "border-red-300 bg-red-50 text-red-700",
    dotClassName: "bg-red-500",
  },
};

export const getDeliveryStatusMeta = (status: string) => DELIVERY_STATUS_META[status as DeliveryStatus] ?? DELIVERY_STATUS_META.ready;

// Simple status derived straight from orders.status now that the Dastavka
// Kanban (and its separate per-order delivery row) has been removed.
export const deriveDeliveryStatus = (orderStatus: string): DeliveryStatus => {
  if (orderStatus === "delivered") return "delivered";
  if (orderStatus === "cancelled") return "rejected";
  return "ready";
};
