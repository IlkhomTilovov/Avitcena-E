import { Router } from "express";
import crypto from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

const router = Router();

const VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN || "lovable_crm_verify_token_2024";
const APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";
const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v21.0";

/**
 * Page access tokenlar. Ikki xil berish mumkin:
 *   FACEBOOK_PAGE_ACCESS_TOKEN=EAAG...            (bitta sahifa)
 *   FACEBOOK_PAGE_TOKENS={"123456":"EAAG...","789":"EAAG..."}   (bir nechta sahifa)
 */
function resolvePageToken(pageId?: string): string {
  const raw = process.env.FACEBOOK_PAGE_TOKENS;
  if (raw && pageId) {
    try {
      const map = JSON.parse(raw) as Record<string, string>;
      if (map[pageId]) return map[pageId];
    } catch {
      console.error("[facebook] FACEBOOK_PAGE_TOKENS noto'g'ri JSON");
    }
  }
  return process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "";
}

// ---------------------------------------------------------------- verification

router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    res.status(200).type("text/plain").send(challenge);
  } else {
    res.status(403).send("Forbidden");
  }
});

/** Meta so'rovi haqiqatan ham Meta'dan kelganini tekshiradi (X-Hub-Signature-256). */
function verifySignature(req: { headers: Record<string, unknown>; rawBody?: Buffer }): boolean {
  if (!APP_SECRET) {
    console.error("[facebook] FACEBOOK_APP_SECRET sozlanmagan — so'rov rad etildi");
    return false;
  }
  const header = req.headers["x-hub-signature-256"];
  if (typeof header !== "string" || !header.startsWith("sha256=")) return false;
  if (!req.rawBody) return false;

  const expected = crypto.createHmac("sha256", APP_SECRET).update(req.rawBody).digest("hex");
  const received = header.slice("sha256=".length);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------- lead olish

type FieldDatum = { name: string; values?: string[] };

/**
 * MUHIM: Meta webhook'i lid ma'lumotlarini (ism, telefon) YUBORMAYDI.
 * U faqat leadgen_id yuboradi — qolganini Graph API'dan o'qib olish kerak.
 */
async function fetchLeadDetails(leadgenId: string, pageToken: string) {
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(leadgenId)}` +
    `?fields=id,created_time,field_data,form_id,ad_id,campaign_id,platform` +
    `&access_token=${encodeURIComponent(pageToken)}`;

  const res = await fetch(url);
  const json = (await res.json()) as {
    error?: { message?: string };
    field_data?: FieldDatum[];
    created_time?: string;
    form_id?: string;
    ad_id?: string;
    campaign_id?: string;
    platform?: string;
  };

  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `Graph API ${res.status}`);
  }
  return json;
}

const normalizePhone = (raw?: string | null) => (raw ? raw.replace(/\D/g, "") || null : null);

/**
 * Maxsus savollar uchun Meta ko'pincha savol matnini (va ba'zan tanlangan
 * javobni ham) pastki chiziqlar bilan "slug" ko'rinishida yuboradi, masalan
 * "qanday_lavozimda_ishlaysiz?". Buni o'qish mumkin matnga aylantiramiz.
 */
const humanize = (raw: string) => {
  const text = raw.replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
};

const phoneDigits = (s: string) => s.replace(/\D/g, "");
// A plausible local or international phone number, loosely — long enough to
// not be a stray numeric answer, short enough to not be, say, an order ID.
const looksLikePhone = (s: string) => {
  const d = phoneDigits(s);
  return d.length >= 9 && d.length <= 13;
};

function pickFields(fieldData: FieldDatum[]) {
  const get = (...names: string[]) => {
    for (const n of names) {
      const hit = fieldData.find((f) => f.name?.toLowerCase() === n);
      const v = hit?.values?.[0]?.trim();
      if (v) return v;
    }
    return "";
  };

  const full = get("full_name", "full name", "name");
  const first = get("first_name", "first name");
  const last = get("last_name", "last name");
  const name = full || [first, last].filter(Boolean).join(" ").trim();

  const known = new Set([
    "full_name", "full name", "name", "first_name", "first name", "last_name", "last name",
    "phone_number", "phone number", "phone", "email",
  ]);

  let phone = get("phone_number", "phone number", "phone") || null;

  // Forms with a custom (non-built-in) phone question — e.g. advertiser wrote
  // their own "Telefon raqamingiz?" / "Номер телефона" field instead of using
  // Meta's built-in phone field type — don't match any of the names above, so
  // the number above never gets found and the lead is saved with no phone at
  // all even though it's sitting right there in the raw answers. Fall back to
  // whichever custom answer actually looks like a phone number, preferring
  // one that already carries the country code (+998...).
  const usedAsPhone = new Set<string>();
  if (!phone) {
    const candidates = fieldData
      .map((f) => ({ fieldName: f.name?.toLowerCase(), value: f.values?.[0]?.trim() || "" }))
      .filter((f) => !known.has(f.fieldName) && f.value && looksLikePhone(f.value));
    const best = candidates.find((c) => phoneDigits(c.value).startsWith("998")) || candidates[0];
    if (best) {
      phone = best.value;
      usedAsPhone.add(best.fieldName);
    }
  }

  const formAnswers = fieldData
    .filter((f) => !known.has(f.name?.toLowerCase()) && !usedAsPhone.has(f.name?.toLowerCase()))
    .map((f) => ({
      question: humanize(f.name),
      answer: (f.values || []).map(humanize).join(", "),
    }));

  return {
    name,
    phone,
    email: get("email") || null,
    formAnswers,
  };
}

/** Shu leadgen_id avval saqlanganmi? (Meta webhook'ni bir necha marta yuboradi) */
async function alreadySaved(leadgenId: string) {
  const rows = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(eq(schema.leads.facebookLeadId, leadgenId))
    .limit(1);
  return rows.length > 0;
}

async function resolveSellerId(): Promise<string | null> {
  const rows = await db
    .select({ userId: schema.userRoles.userId })
    .from(schema.userRoles)
    .where(inArray(schema.userRoles.role, ["admin", "rop"]))
    .limit(1);
  return rows[0]?.userId ?? null;
}

/**
 * Kanban lidlarni leads.stage (stages.id UUID) bo'yicha guruhlaydi. Schema'dagi
 * matnli standart qiymat ("yengi_mijoz") hech qaysi stage UUID'iga mos kelmaydi,
 * shuning uchun birinchi bosqich aniq belgilanadi — aks holda lid bazada bor,
 * lekin kanban ustunlarining birortasida ko'rinmaydi.
 */
async function resolveFirstStageId(): Promise<string | null> {
  const rows = await db
    .select({ id: schema.stages.id })
    .from(schema.stages)
    .orderBy(asc(schema.stages.displayOrder))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function handleLeadgen(value: { leadgen_id: string; page_id?: string; form_id?: string; ad_id?: string }) {
  const leadgenId = String(value.leadgen_id);

  if (await alreadySaved(leadgenId)) {
    console.log(`[facebook] ${leadgenId} allaqachon saqlangan, o'tkazib yuborildi`);
    return;
  }

  const sellerId = await resolveSellerId();
  if (!sellerId) {
    console.error("[facebook] admin/rop roli topilmadi — lid biriktirib bo'lmadi");
    return;
  }

  const pageToken = resolvePageToken(value.page_id);
  const stageId = await resolveFirstStageId();
  if (!stageId) {
    console.error("[facebook] birorta stage topilmadi — lid kanbanda ko'rinmasligi mumkin");
  }

  let name = "Facebook Lead";
  let phone: string | null = null;
  let email: string | null = null;
  let source = "Facebook";
  // Izoh faqat tizim ogohlantirishlari uchun - mijozning o'zi yozgan javoblar
  // formAnswers'ga (key/value) tushadi va Facebook Ads kartochkasida ko'rsatiladi.
  const noteLines: string[] = [];
  let formAnswers: { question: string; answer: string }[] = [];

  if (!pageToken) {
    noteLines.push("⚠️ Page access token sozlanmagan — ism/telefon olinmadi");
    console.error("[facebook] page token yo'q, lid bo'sh saqlanadi");
  } else {
    try {
      const details = await fetchLeadDetails(leadgenId, pageToken);
      const picked = pickFields(details.field_data || []);
      if (picked.name) name = picked.name;
      phone = picked.phone;
      email = picked.email;
      formAnswers = picked.formAnswers;
      if (/instagram|^ig$/i.test(details.platform || "")) source = "Instagram";
    } catch (err) {
      noteLines.push(`⚠️ Graph API xatosi: ${(err as Error).message}`);
      console.error("[facebook] lid ma'lumotini olishda xato:", err);
    }
  }

  await db.insert(schema.leads).values({
    sellerId,
    customerName: name,
    customerPhone: phone,
    customerPhoneNorm: normalizePhone(phone),
    customerEmail: email,
    leadType: "Yangi lid",
    activity: "new",
    source,
    facebookLeadId: leadgenId,
    facebookFormAnswers: formAnswers.length ? formAnswers : null,
    notes: noteLines.length ? noteLines.join("\n") : null,
    status: "new",
    ...(stageId ? { stage: stageId } : {}),
  });

  console.log(`[facebook] yangi lid saqlandi: ${leadgenId} (${name})`);
}

// ---------------------------------------------------------------- webhook

router.post("/webhook", (req, res) => {
  if (!verifySignature(req as never)) {
    console.error("[facebook] imzo (signature) noto'g'ri — so'rov rad etildi");
    return res.sendStatus(403);
  }

  // Meta javobni ~20 soniya kutadi, aks holda qayta yuboradi.
  // Shuning uchun darhol 200 qaytaramiz, qolganini fonda bajaramiz.
  res.json({ success: true });

  const body = req.body;
  if (body?.object !== "page") return;

  void (async () => {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === "leadgen" && change.value?.leadgen_id) {
          try {
            await handleLeadgen(change.value);
          } catch (err) {
            console.error("[facebook] leadgen xatosi:", err);
          }
        }
      }
    }
  })();
});

export default router;
