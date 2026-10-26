import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  AlignmentType,
  ShadingType,
  BorderStyle,
  VerticalAlign,
} from "docx";

const REJECTION_REASON_LABELS: Record<string, string> = {
  customer_rejected: "Mijoz buyurtmani rad etdi",
  customer_changed_mind: "Mijoz fikridan qaytdi",
  unreachable: "Telefon orqali bog'lanib bo'lmadi",
  wrong_address: "Manzil noto'g'ri",
  time_mismatch: "Yetkazish vaqti mos kelmadi",
  other: "Boshqa sabab",
};

const fmtMoney = (n: number) => Math.round(n).toLocaleString("uz-UZ").replace(/,/g, " ");
const fmtHours = (from: Date, to: Date) => Math.max(0, Math.round((to.getTime() - from.getTime()) / 3_600_000));

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" };
const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

function headerCell(text: string) {
  return new TableCell({
    borders: cellBorders,
    shading: { type: ShadingType.CLEAR, fill: "F1F5F9" },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18 })] })],
  });
}

function cell(text: string, opts: { bold?: boolean; color?: string; strike?: boolean } = {}) {
  return new TableCell({
    borders: cellBorders,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: opts.bold, color: opts.color, strike: opts.strike, size: 18 })],
      }),
    ],
  });
}

/**
 * Builds the "Bugun tugatilgan zakazlar" delivery report (today's orders that
 * reached a terminal Dastavka status — delivered or rejected) as a .docx
 * buffer, ready to hand straight to Telegram's sendDocument.
 */
export async function generateDeliveryReportDocx(forDate: Date = new Date()): Promise<Buffer> {
  const uzbekistanTime = new Date(forDate.toLocaleString("en-US", { timeZone: "Asia/Tashkent" }));
  const dayStart = new Date(uzbekistanTime.getFullYear(), uzbekistanTime.getMonth(), uzbekistanTime.getDate());
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const rows = await db
    .select({ delivery: schema.deliveries, order: schema.orders })
    .from(schema.deliveries)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.deliveries.orderId))
    .where(
      and(
        inArray(schema.deliveries.status, ["delivered", "rejected"]),
        gte(schema.deliveries.statusUpdatedAt, dayStart),
        lt(schema.deliveries.statusUpdatedAt, dayEnd),
      ),
    );

  const delivered = rows.filter((r) => r.delivery.status === "delivered");
  const rejected = rows.filter((r) => r.delivery.status === "rejected");

  const deliveredTotal = delivered.reduce((s, r) => s + Number(r.order.totalAmount || 0), 0);
  const deliveredRemaining = delivered.reduce(
    (s, r) => s + (Number(r.order.totalAmount || 0) - Number(r.order.advancePayment || 0)),
    0,
  );
  const rejectedTotal = rejected.reduce((s, r) => s + Number(r.order.totalAmount || 0), 0);
  const rejectedAdvance = rejected.reduce((s, r) => s + Number(r.order.advancePayment || 0), 0);
  const rejectionRate = rows.length > 0 ? Math.round((rejected.length / rows.length) * 100) : 0;

  const headerRow = new TableRow({
    tableHeader: true,
    children: ["№", "Ism", "Telefon", "Manzil", "Summa", "Avans", "Qoldiq", "Yo'lda", "Holat"].map(headerCell),
  });

  const dataRows = rows.map((r, i) => {
    const { order, delivery } = r;
    const total = Number(order.totalAmount || 0);
    const advance = Number(order.advancePayment || 0);
    const remaining = total - advance;
    const isRejected = delivery.status === "rejected";
    const address = [order.region, order.district].filter(Boolean).join(", ") || "—";
    const hours = delivery.statusUpdatedAt ? fmtHours(order.createdAt, delivery.statusUpdatedAt) : 0;
    const statusText = isRejected ? "Otkaz" : "Yetkazildi";
    const reasonText = isRejected ? REJECTION_REASON_LABELS[delivery.rejectionReason || ""] || delivery.rejectionReason || "" : "";

    return new TableRow({
      children: [
        cell(String(i + 1)),
        cell(order.customerName || "—"),
        cell(order.customerPhone || "—"),
        cell(address),
        cell(`${fmtMoney(total)}`),
        cell(`${fmtMoney(advance)}`),
        cell(`${fmtMoney(remaining)}`, { strike: isRejected }),
        cell(`${hours} soat`),
        cell(reasonText ? `${statusText}\n${reasonText}` : statusText, { color: isRejected ? "C0392B" : "1E7E34", bold: true }),
      ],
    });
  });

  const summaryRows = [
    new TableRow({
      children: [
        new TableCell({ columnSpan: 4, borders: cellBorders, children: [new Paragraph({ children: [new TextRun({ text: `Yetkazildi: ${delivered.length} ta`, bold: true, color: "1E7E34" })] })] }),
        cell(fmtMoney(deliveredTotal), { bold: true }),
        cell(""),
        cell(fmtMoney(deliveredRemaining), { bold: true }),
        new TableCell({ columnSpan: 2, borders: cellBorders, children: [new Paragraph({ children: [new TextRun({ text: "kuryer/BTS yig'adi", italics: true, size: 16 })] })] }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({ columnSpan: 4, borders: cellBorders, children: [new Paragraph({ children: [new TextRun({ text: `Otkaz: ${rejected.length} ta`, bold: true, color: "C0392B" })] })] }),
        cell(fmtMoney(rejectedTotal), { bold: true }),
        cell(fmtMoney(rejectedAdvance), { bold: true }),
        cell("—"),
        new TableCell({ columnSpan: 2, borders: cellBorders, children: [new Paragraph({ children: [new TextRun({ text: "avans qaytariladimi?", italics: true, size: 16 })] })] }),
      ],
    }),
  ];

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows, ...summaryRows],
  });

  const dateLabel = dayStart.toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeLabel = uzbekistanTime.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun({ text: "Bugun tugatilgan zakazlar", bold: true, size: 32 })],
          }),
          new Paragraph({
            spacing: { after: 100 },
            children: [new TextRun({ text: `${dateLabel} · ${timeLabel} holatiga`, size: 20, color: "666666" })],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({ text: `Yetkazildi ${delivered.length} ta · ${fmtMoney(deliveredTotal)} so'm`, bold: true, color: "1E7E34" }),
              new TextRun({ text: "    " }),
              new TextRun({ text: `Otkaz ${rejected.length} ta · ${fmtMoney(rejectedTotal)} so'm`, bold: true, color: "C0392B" }),
              new TextRun({ text: "    " }),
              new TextRun({ text: `Otkaz ulushi ${rejectionRate}%`, bold: true }),
            ],
          }),
          rows.length > 0
            ? table
            : new Paragraph({ children: [new TextRun({ text: "Bugun yakunlangan (yetkazilgan yoki otkaz qilingan) buyurtma yo'q.", italics: true })] }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
