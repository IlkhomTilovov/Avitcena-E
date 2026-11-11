const UPDATED_AT = "11.11.2026";
const CONTACT_EMAIL = "ilkhomtilovov@gmail.com";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
    <div className="space-y-3 text-slate-700 leading-relaxed">{children}</div>
  </section>
);

/**
 * Ommaviy sahifa - autentifikatsiya talab qilmaydi.
 * Meta ilovasini nashr qilish uchun Privacy Policy URL majburiy.
 */
const Privacy = () => (
  <main className="min-h-screen bg-slate-50 py-12 px-4">
    <article className="mx-auto max-w-3xl space-y-10 rounded-2xl bg-white p-8 shadow-sm sm:p-12">
      <header className="space-y-2 border-b border-slate-200 pb-6">
        <h1 className="text-3xl font-bold text-slate-900">Maxfiylik siyosati</h1>
        <p className="text-sm text-slate-500">Avitcena CRM · Oxirgi yangilanish: {UPDATED_AT}</p>
      </header>

      <Section title="1. Umumiy ma'lumot">
        <p>
          Avitcena CRM - bu Avitcena kompaniyasining ichki savdo boshqaruv tizimi. Tizim mijozlar bilan
          ishlash, lidlarni kuzatish va buyurtmalarni boshqarish uchun ishlatiladi. Ushbu siyosat tizim qanday
          ma'lumotlarni to'plashini va ularni qanday himoya qilishini tushuntiradi.
        </p>
      </Section>

      <Section title="2. Qaysi ma'lumotlar to'planadi">
        <p>Tizimda quyidagi ma'lumotlar saqlanadi:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Mijozning ismi, telefon raqami va elektron pochta manzili</li>
          <li>Lid manbasi (Facebook, Instagram, Telegram, sayt yoki forma) va lid holati</li>
          <li>Buyurtma tarixi, yetkazib berish holati va to'lov summasi</li>
          <li>Xodimlarning tizimdagi hisob ma'lumotlari va faoliyat qaydlari</li>
        </ul>
      </Section>

      <Section title="3. Facebook va Instagram orqali kelgan ma'lumotlar">
        <p>
          Facebook yoki Instagram'dagi reklama formasini (Lead Ads) to'ldirgan foydalanuvchining o'zi kiritgan
          ma'lumotlari - odatda ism, telefon raqami va elektron pochta - Meta platformasidan bevosita tizimga
          uzatiladi. Bu ma'lumotlar faqat foydalanuvchi forma orqali ixtiyoriy ravishda yuborgan taqdirdagina
          olinadi.
        </p>
        <p>
          Bu ma'lumotlar faqat foydalanuvchi so'ragan mahsulot yoki xizmat bo'yicha u bilan bog'lanish uchun
          ishlatiladi. Tizim foydalanuvchining Facebook do'stlari ro'yxati, shaxsiy yozishmalari yoki boshqa
          profil ma'lumotlarini olmaydi.
        </p>
      </Section>

      <Section title="4. Ma'lumotlardan foydalanish maqsadi">
        <ul className="list-disc space-y-1 pl-6">
          <li>Mijoz bilan bog'lanish va uning so'roviga javob berish</li>
          <li>Buyurtmani rasmiylashtirish va yetkazib berish</li>
          <li>Savdo ko'rsatkichlarini ichki tahlil qilish</li>
        </ul>
        <p>
          Ma'lumotlar reklama maqsadida uchinchi shaxslarga sotilmaydi va ijaraga berilmaydi.
        </p>
      </Section>

      <Section title="5. Ma'lumotlarni uzatish">
        <p>
          Ma'lumotlar faqat tizimdan foydalanuvchi xodimlarga va xizmat ko'rsatish uchun zarur bo'lgan
          provayderlarga (server hosting, xabar yuborish xizmatlari) ochiq. Qonun talab qilgan hollarda
          vakolatli organlarga taqdim etilishi mumkin.
        </p>
      </Section>

      <Section title="6. Saqlash muddati va xavfsizlik">
        <p>
          Ma'lumotlar mijoz bilan ish munosabati davom etgunicha va undan keyin buxgalteriya talablariga muvofiq
          saqlanadi. Ma'lumotlar himoyalangan serverda saqlanadi, tizimga kirish parol bilan cheklangan va
          barcha ulanishlar HTTPS orqali shifrlanadi.
        </p>
      </Section>

      <Section title="7. Ma'lumotlarni o'chirish huquqi">
        <p>
          Har bir foydalanuvchi o'zi haqidagi ma'lumotlarni ko'rish, tuzatish yoki butunlay o'chirishni talab
          qilish huquqiga ega. Buning uchun quyidagi manzilga xat yuborish kifoya:
        </p>
        <p>
          <a className="font-medium text-blue-600 underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </p>
        <p>So'rov 30 kun ichida ko'rib chiqiladi va ma'lumotlar tizimdan o'chiriladi.</p>
      </Section>

      <Section title="8. Siyosatga o'zgartirishlar">
        <p>
          Ushbu siyosat vaqti-vaqti bilan yangilanishi mumkin. Oxirgi yangilanish sanasi sahifaning yuqorisida
          ko'rsatilgan.
        </p>
      </Section>

      <footer className="border-t border-slate-200 pt-6 text-sm text-slate-500">
        Savollar uchun:{" "}
        <a className="text-blue-600 underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
      </footer>
    </article>
  </main>
);

export default Privacy;
