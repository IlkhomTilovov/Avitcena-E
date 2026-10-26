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
  PageOrientation,
} from "docx";

const REJECTION_REASON_LABELS: Record<string, string> = {
  customer_rejected: "Mijoz buyurtmani rad etdi",
  customer_changed_mind: "Mijoz fikridan qaytdi",
  unreachable: "Telefon orqali bog'lanib bo'lmadi",
  wrong_address: "Manzil noto'g'ri",
  time_mismatch: "Yetkazish vaqti mos kelmadi",
  other: "Boshqa sabab",
};

const COLORS = {
  green: "1E7E34",
  greenBg: "E8F8EE",
  red: "C0392B",
  redBg: "FDECEA",
  gray: "64748B",
  grayBg: "F1F5F9",
  ink: "1E293B",
};

const fmtMoney = (n: number) => Math.round(n).toLocaleString("uz-UZ").replace(/,/g, " ");
const fmtHours = (from: Date, to: Date) => Math.max(0, Math.round((to.getTime() - from.getTime()) / 3_600_000));

// Portrait, not landscape: Telegram's in-app docx viewer fits the whole page
// to the phone's (portrait) screen width, so a landscape page — wider than
// it is tall — renders noticeably smaller and needs pinch-zooming to read.
// Portrait Letter (12240 x 15840 twips) with tight margins and narrow
// columns keeps the 9-column table legible without that zoomed-out look.
const PAGE_MARGIN = 450;
// +20% over the original fit, then -7% — the page itself is sized to match
// (below), since this is a digital-only report, not something printed on paper.
const COLUMN_WIDTHS = [446, 1674, 1451, 1897, 1317, 1317, 1317, 893, 2344];
const TOTAL_WIDTH = COLUMN_WIDTHS.reduce((a, b) => a + b, 0);

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE };
const rowLine = { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" };
const headerLine = { style: BorderStyle.SINGLE, size: 10, color: COLORS.ink };
const dataCellBorders = { top: NONE, bottom: rowLine, left: NONE, right: NONE };
const headerCellBorders = { top: NONE, bottom: headerLine, left: NONE, right: NONE };

function headerCell(text: string, align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT) {
  return new TableCell({
    borders: headerCellBorders,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 120, bottom: 120, left: 100, right: 100 },
    children: [new Paragraph({ alignment: align, children: [new TextRun({ text, bold: true, size: 19, color: COLORS.ink })] })],
  });
}

function textCell(
  text: string,
  opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean; color?: string; strike?: boolean; shadeFill?: string } = {},
) {
  return new TableCell({
    borders: dataCellBorders,
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.shadeFill ? { type: ShadingType.CLEAR, fill: opts.shadeFill } : undefined,
    margins: { top: 90, bottom: 90, left: 100, right: 100 },
    children: [
      new Paragraph({
        alignment: opts.align ?? AlignmentType.LEFT,
        children: [new TextRun({ text, bold: opts.bold, color: opts.color, strike: opts.strike, size: 19 })],
      }),
    ],
  });
}

function addressCell(region: string | null, district: string | null, shadeFill?: string) {
  const lines: Paragraph[] = [];
  if (region) lines.push(new Paragraph({ children: [new TextRun({ text: region, bold: true, size: 19, color: COLORS.ink })] }));
  if (district) lines.push(new Paragraph({ children: [new TextRun({ text: district, size: 17, color: COLORS.gray })] }));
  if (lines.length === 0) lines.push(new Paragraph({ children: [new TextRun({ text: "—", size: 19, color: COLORS.gray })] }));
  return new TableCell({
    borders: dataCellBorders,
    verticalAlign: VerticalAlign.CENTER,
    shading: shadeFill ? { type: ShadingType.CLEAR, fill: shadeFill } : undefined,
    margins: { top: 90, bottom: 90, left: 100, right: 100 },
    children: lines,
  });
}

function statusCell(isRejected: boolean, reasonText: string, shadeFill?: string) {
  const paragraphs = [
    new Paragraph({
      children: [new TextRun({ text: isRejected ? "✕ Otkaz" : "✓ Yetkazildi", bold: true, size: 19, color: isRejected ? COLORS.red : COLORS.green })],
    }),
  ];
  if (reasonText) {
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: reasonText, size: 16, color: COLORS.gray })] }));
  }
  return new TableCell({
    borders: dataCellBorders,
    verticalAlign: VerticalAlign.CENTER,
    shading: shadeFill ? { type: ShadingType.CLEAR, fill: shadeFill } : undefined,
    margins: { top: 90, bottom: 90, left: 100, right: 100 },
    children: paragraphs,
  });
}

// A borderless, lightly-tinted "pill" used for the summary line under the
// title — the closest a .docx table cell can get to the rounded status
// chips this report is modeled on (OOXML has no border-radius).
function pill(text: string, bg: string, color: string) {
  return new TableCell({
    borders: NO_BORDERS,
    shading: { type: ShadingType.CLEAR, fill: bg },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 140, bottom: 140, left: 220, right: 220 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 19, color })] })],
  });
}

function spacer() {
  return new TableCell({ borders: NO_BORDERS, width: { size: 150, type: WidthType.DXA }, children: [new Paragraph({})] });
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
    )
    .orderBy(schema.deliveries.statusUpdatedAt);

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
    children: [
      headerCell("№", AlignmentType.CENTER),
      headerCell("Ism"),
      headerCell("Telefon"),
      headerCell("Manzil"),
      headerCell("Summa", AlignmentType.RIGHT),
      headerCell("Avans", AlignmentType.RIGHT),
      headerCell("Qoldiq", AlignmentType.RIGHT),
      headerCell("Yo'lda", AlignmentType.RIGHT),
      headerCell("Holat"),
    ],
  });

  const dataRows = rows.map((r, i) => {
    const { order, delivery } = r;
    const total = Number(order.totalAmount || 0);
    const advance = Number(order.advancePayment || 0);
    const remaining = total - advance;
    const isRejected = delivery.status === "rejected";
    const hours = delivery.statusUpdatedAt ? fmtHours(order.createdAt, delivery.statusUpdatedAt) : 0;
    const reasonText = isRejected ? REJECTION_REASON_LABELS[delivery.rejectionReason || ""] || delivery.rejectionReason || "" : "";
    // A faint zebra tint on alternating rows — subtle enough to still read
    // as a clean report, not a spreadsheet.
    const zebra = i % 2 === 1 ? "FAFBFC" : undefined;

    return new TableRow({
      children: [
        textCell(String(i + 1), { align: AlignmentType.CENTER, shadeFill: zebra }),
        textCell(order.customerName || "—", { bold: true, shadeFill: zebra }),
        textCell(order.customerPhone || "—", { shadeFill: zebra }),
        addressCell(order.region, order.district, zebra),
        textCell(fmtMoney(total), { align: AlignmentType.RIGHT, bold: true, shadeFill: zebra }),
        textCell(fmtMoney(advance), { align: AlignmentType.RIGHT, shadeFill: zebra }),
        textCell(fmtMoney(remaining), { align: AlignmentType.RIGHT, bold: true, strike: isRejected, shadeFill: zebra }),
        textCell(`${hours} soat`, { align: AlignmentType.RIGHT, color: COLORS.gray, shadeFill: zebra }),
        statusCell(isRejected, reasonText, zebra),
      ],
    });
  });

  const summaryRows = [
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 4,
          borders: dataCellBorders,
          shading: { type: ShadingType.CLEAR, fill: COLORS.greenBg },
          margins: { top: 120, bottom: 120, left: 100, right: 100 },
          children: [new Paragraph({ children: [new TextRun({ text: `Yetkazildi: ${delivered.length} ta`, bold: true, color: COLORS.green })] })],
        }),
        textCell(fmtMoney(deliveredTotal), { align: AlignmentType.RIGHT, bold: true, shadeFill: COLORS.greenBg }),
        textCell("", { shadeFill: COLORS.greenBg }),
        textCell(fmtMoney(deliveredRemaining), { align: AlignmentType.RIGHT, bold: true, shadeFill: COLORS.greenBg }),
        new TableCell({
          columnSpan: 2,
          borders: dataCellBorders,
          shading: { type: ShadingType.CLEAR, fill: COLORS.greenBg },
          margins: { top: 120, bottom: 120, left: 100, right: 100 },
          children: [new Paragraph({ children: [new TextRun({ text: "kuryer/BTS yig'adi", italics: true, size: 16, color: COLORS.gray })] })],
        }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 4,
          borders: dataCellBorders,
          shading: { type: ShadingType.CLEAR, fill: COLORS.redBg },
          margins: { top: 120, bottom: 120, left: 100, right: 100 },
          children: [new Paragraph({ children: [new TextRun({ text: `Otkaz: ${rejected.length} ta`, bold: true, color: COLORS.red })] })],
        }),
        textCell(fmtMoney(rejectedTotal), { align: AlignmentType.RIGHT, bold: true, shadeFill: COLORS.redBg }),
        textCell(fmtMoney(rejectedAdvance), { align: AlignmentType.RIGHT, bold: true, shadeFill: COLORS.redBg }),
        textCell("—", { align: AlignmentType.RIGHT, shadeFill: COLORS.redBg }),
        new TableCell({
          columnSpan: 2,
          borders: dataCellBorders,
          shading: { type: ShadingType.CLEAR, fill: COLORS.redBg },
          margins: { top: 120, bottom: 120, left: 100, right: 100 },
          children: [new Paragraph({ children: [new TextRun({ text: "avans qaytariladimi?", italics: true, size: 16, color: COLORS.gray })] })],
        }),
      ],
    }),
  ];

  const table = new Table({
    width: { size: TOTAL_WIDTH, type: WidthType.DXA },
    columnWidths: COLUMN_WIDTHS,
    rows: [headerRow, ...dataRows, ...summaryRows],
  });

  const dateLabel = dayStart.toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeLabel = uzbekistanTime.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });

  const summaryPillsTable = new Table({
    width: { size: TOTAL_WIDTH, type: WidthType.DXA },
    borders: { ...NO_BORDERS, insideHorizontal: NONE, insideVertical: NONE },
    rows: [
      new TableRow({
        children: [
          pill(`✓ Yetkazildi ${delivered.length} ta · ${fmtMoney(deliveredTotal)} so'm`, COLORS.greenBg, COLORS.green),
          spacer(),
          pill(`✕ Otkaz ${rejected.length} ta · ${fmtMoney(rejectedTotal)} so'm`, COLORS.redBg, COLORS.red),
          spacer(),
          pill(`Otkaz ulushi ${rejectionRate}%`, COLORS.grayBg, COLORS.gray),
        ],
      }),
    ],
  });

  // Telegram's in-app docx preview renders the page fit-to-width and shows
  // the whole page — including every inch of trailing blank space below the
  // content. A fixed full Letter height (11in) made this short report look
  // tiny, stranded at the top of an otherwise-empty page. Sizing the page to
  // roughly match the actual content keeps it filling the screen instead.
  const PAGE_HEIGHT_MIN = 4200;
  const PAGE_HEIGHT_MAX = 15840; // standard Letter height — content beyond this just paginates normally
  const estimatedContentHeight = 2600 + 350 + 500 * 2 + 480 * rows.length + PAGE_MARGIN * 2;
  const pageHeight = Math.min(PAGE_HEIGHT_MAX, Math.max(PAGE_HEIGHT_MIN, estimatedContentHeight));

  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri" } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: TOTAL_WIDTH + PAGE_MARGIN * 2, height: pageHeight, orientation: PageOrientation.PORTRAIT },
            margin: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
          },
        },
        children: [
          new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: "Bugun tugatilgan zakazlar", bold: true, size: 34, color: COLORS.ink })],
          }),
          new Paragraph({
            spacing: { after: 220 },
            children: [new TextRun({ text: `${dateLabel} · ${timeLabel} holatiga`, size: 19, color: COLORS.gray })],
          }),
          summaryPillsTable,
          new Paragraph({ spacing: { after: 200 }, children: [] }),
          rows.length > 0
            ? table
            : new Paragraph({ children: [new TextRun({ text: "Bugun yakunlangan (yetkazilgan yoki otkaz qilingan) buyurtma yo'q.", italics: true, color: COLORS.gray })] }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
