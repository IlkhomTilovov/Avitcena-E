import cron from "node-cron";
import { generateDeliveryReportDocx } from "../lib/deliveryReport.js";

async function sendDailyDeliveryReport() {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_DELIVERY_REPORT_CHAT_ID;
  if (!BOT_TOKEN || !CHAT_ID) return;

  try {
    const buffer = await generateDeliveryReportDocx();
    const dateStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });

    const form = new FormData();
    form.append("chat_id", CHAT_ID);
    form.append("caption", "📦 Bugungi yetkazib berish hisoboti");
    form.append("document", new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), `dastavka-hisobot-${dateStr}.docx`);

    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, { method: "POST", body: form });
    const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    if (!res.ok || !data?.ok) {
      console.error("[dastavka-hisobot] Telegram sendDocument xatosi:", data);
    }
  } catch (err) {
    console.error("[dastavka-hisobot] hisobot yuborishda xato:", err);
  }
}

// Every day at 17:00 Tashkent time
export const scheduleDailyDeliveryReport = () => {
  cron.schedule("0 17 * * *", sendDailyDeliveryReport, { timezone: "Asia/Tashkent" });
};
