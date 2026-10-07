import Image from "next/image";
import { AxonTabs } from "./axon-tabs";
import { IconBook, IconCalendar, IconChat, IconFile, IconSpark, IconTimer, IconUsers } from "@/components/icons";
import { Pricing } from "./pricing";
import { HeroDemo } from "./hero-demo";
import { LiveNow } from "./live-now";
import { Clarity } from "@/components/clarity";
import { getPublicOffers } from "@/lib/offers";
import { getPublicStats } from "@/lib/stats";
import { prefix as pfx, SITE, type Lang } from "@/lib/site-i18n";
import { LangSync } from "@/components/lang-sync";

// « Essayer gratuitement » = créer son espace avec Google (pas de téléchargement).

// Même gouttière et même largeur pour toutes les sections : tout s'aligne sur la même grille.
const WRAP = "mx-auto w-full max-w-6xl px-5 sm:px-8";

// Contact WhatsApp (numéro de Loop IA / Axone).
const WHATSAPP_NUMBER = "22241513211";
const whatsappUrl = (lang: Lang) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(SITE[lang].whatsappText)}`;

// Les chiffres viennent de Supabase (fonction public_stats). On ne les affiche qu'au-dessus de ces seuils,
// pour ne jamais montrer un petit nombre qui ferait douter. Ajuste-les si besoin.
const MIN_STUDENTS_SHOWN = 50;
const MIN_QUESTIONS_SHOWN = 100;
// Aperçu visuel en développement uniquement (jamais en production).
const DEV_PREVIEW = { students: 1200, questionsWeek: 8400 };

// Avis d'étudiants : à remplir avec de VRAIS avis, avec l'accord de chaque personne.
// Cible : 3 étudiants (médecine / pharmacie, Mauritanie / Sénégal). Vide = la section n'apparaît pas en production.
// `ar` : la même citation en arabe (à ajouter avec chaque vrai avis).
type Review = { quote: string; name: string; role: string; ar?: { quote: string; name: string; role: string } };
const REVIEWS: Review[] = [];
// TEXTES FICTIFS pour visualiser la mise en page. Jamais affichés en production (voir Reviews()).
const DEV_SAMPLE_REVIEWS: Review[] = [
  {
    quote: "Avant, je passais mes soirées à refaire des fiches à la main. Maintenant je dépose mon cours et j'ai ma fiche et mes QCM en quelques minutes. Je révise enfin au lieu de recopier.",
    name: "Mariem",
    role: "Médecine · Nouakchott",
    ar: {
      quote: "كنت أقضي أمسياتي في إعادة كتابة الملخّصات بيدي. الآن أرفع درسي فأحصل على ملخّصي وأسئلة QCM في دقائق. صرت أراجع فعلًا بدل أن أنسخ.",
      name: "مريم",
      role: "الطب · نواكشوط",
    },
  },
  {
    quote: "En pharmacologie il y a énormément à retenir. Les fiches me donnent l'essentiel par chapitre, et les QCM à réponses multiples ressemblent à ceux de la fac. Je vois tout de suite ce que j'ai oublié.",
    name: "Cheikh",
    role: "Pharmacie · Nouakchott",
    ar: {
      quote: "في علم الأدوية هناك الكثير مما يجب حفظه. تعطيني الملخّصات الأساسي في كل فصل، وأسئلة QCM متعددة الإجابات تشبه أسئلة الكلية. أرى فورًا ما نسيته.",
      name: "الشيخ",
      role: "الصيدلة · نواكشوط",
    },
  },
  {
    quote: "Les flashcards sont ce qui m'a le plus servi avant les examens. Ce que je ne sais pas revient vite, et je ne perds plus de temps sur ce que je maîtrise déjà.",
    name: "Awa",
    role: "Médecine · Dakar",
    ar: {
      quote: "بطاقات المراجعة هي أكثر ما أفادني قبل الامتحانات. ما لا أعرفه يعود سريعًا، ولم أعد أضيع الوقت فيما أتقنه أصلًا.",
      name: "أوا",
      role: "الطب · داكار",
    },
  },
];

const INCLUDED_ICONS = [IconUsers, IconFile, IconChat, IconSpark, IconTimer, IconCalendar, IconBook];

function Logo({ light = false }: { light?: boolean }) {
  return (
    <span
      className={`display flex items-center gap-2 text-2xl ${light ? "text-white" : "text-ink"}`}
    >
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden>
        <circle cx="9" cy="15" r="6" fill="#07a997" />
        <path d="M15 15h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M22 9v12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      axone
    </span>
  );
}

function SocialProof({ students, lang }: { students: number | null; lang: Lang }) {
  const count = students !== null && students >= MIN_STUDENTS_SHOWN ? students : null;
  if (count === null) return null;
  const proof = SITE[lang].proof((Math.floor(count / 10) * 10).toLocaleString("fr-FR"));
  const avatars = [
    { i: "A", bg: "#ffb74d" },
    { i: "M", bg: "#9fe0d6" },
    { i: "F", bg: "#f5b5a6" },
    { i: "S", bg: "#b9c7ee" },
  ];
  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2.5" aria-hidden>
        {avatars.map((a) => (
          <span
            key={a.i}
            className="grid h-10 w-10 place-items-center rounded-full border-2 border-slide text-sm font-bold text-ink"
            style={{ background: a.bg }}
          >
            {a.i}
          </span>
        ))}
      </div>
      <p className="text-sm text-muted">
        {proof.before}{" "}
        <span className="font-bold text-ink">{proof.n}</span>{" "}
        {proof.after}
      </p>
    </div>
  );
}

function Reviews({ lang }: { lang: Lang }) {
  const t = SITE[lang].reviews;
  const list =
    REVIEWS.length > 0
      ? REVIEWS
      : process.env.NODE_ENV !== "production"
        ? DEV_SAMPLE_REVIEWS
        : [];
  if (list.length === 0) return null;
  return (
    <section className={`${WRAP} py-20 lg:py-28`}>
      <p className="label text-muted">{t.label}</p>
      <h2 className="display mt-4 max-w-2xl text-4xl leading-[1] text-ink sm:text-6xl">
        {t.title}
      </h2>
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {list.map((item) => {
          const r = lang === "ar" && item.ar ? item.ar : item;
          return (
          <figure
            key={item.role}
            className="flex flex-col justify-between rounded-3xl border border-line bg-white p-8"
          >
            <blockquote className="text-lg leading-relaxed text-ink">
              «&nbsp;{r.quote}&nbsp;»
            </blockquote>
            <figcaption className="mt-8 flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-hema-soft text-sm font-bold text-ink">
                {r.name.charAt(0)}
              </span>
              <span>
                <span className="block font-semibold text-ink">{r.name}</span>
                <span className="block text-sm text-muted">{r.role}</span>
              </span>
            </figcaption>
          </figure>
          );
        })}
      </div>
    </section>
  );
}

export async function Landing({ lang }: { lang: Lang }) {
  const t = SITE[lang];
  const P = pfx(lang);
  const WHATSAPP_URL = whatsappUrl(lang);
  const APP_URL = `${P}/connexion`;
  const live = await getPublicStats();
  const offers = await getPublicOffers();
  const stats =
    live ?? (process.env.NODE_ENV !== "production" ? DEV_PREVIEW : null);
  const questionsWeek =
    stats && stats.questionsWeek >= MIN_QUESTIONS_SHOWN ? stats.questionsWeek : null;

  return (
    <>
      {lang === "fr" && <LangSync lang="fr" onlyIf="l=fr" />}
      <header className="sticky top-3 z-50 px-3 pt-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between rounded-full border border-ink/10 bg-white/80 py-2 pl-5 pr-2 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-md sm:pl-7">
          <a href="#top" aria-label="Axone, accueil">
            <Logo />
          </a>
          <nav className="flex items-center gap-5 text-[15px] font-medium text-ink/70 sm:gap-7">
            <a href="#fonctions" className="hidden hover:text-ink sm:block">{t.nav.features}</a>
            <a href="#tarifs" className="hidden hover:text-ink sm:block">{t.nav.pricing}</a>
            <a href="#faq" className="hidden hover:text-ink sm:block">{t.nav.faq}</a>
            <a href={t.switchHref} hrefLang={lang === "fr" ? "ar" : "fr"} className="hover:text-ink">{t.switchLabel}</a>
            <a
              href={APP_URL} data-track="nav_login"
              className="rounded-full bg-ink px-4 py-2 font-semibold sm:px-5 sm:py-2.5 text-white transition hover:bg-eosin"
            >
              {t.nav.login}
            </a>
          </nav>
        </div>
      </header>

      <LiveNow lang={lang} />
      <Clarity />

      <main id="top">
        {/* Hero */}
        <section className={`${WRAP} grid items-center gap-12 pb-20 pt-10 lg:grid-cols-12 lg:gap-8 lg:pb-28 lg:pt-16`}>
          <div className="min-w-0 lg:col-span-7">
            <p className="label text-muted">{t.hero.label}</p>
            <h1 className="display mt-5 text-[2.75rem] leading-[0.95] text-ink sm:text-7xl lg:whitespace-nowrap lg:text-[5.2rem]">
              {t.hero.line1}
              <br />
              <span className="text-eosin">{t.hero.line2}</span>
            </h1>
            <p className="mt-7 max-w-lg text-xl leading-relaxed text-muted">
              {t.hero.text}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-5">
              <a
                href={APP_URL} data-track="hero_cta"
                className="rounded-full bg-ink px-8 py-4 text-base font-semibold text-white transition hover:bg-eosin"
              >
                {t.hero.cta}
              </a>
              <SocialProof students={stats ? stats.students : null} lang={lang} />
            </div>
            <p className="mt-8 text-sm text-muted">
              {t.hero.countries}
            </p>
          </div>

          {/* Dr. Ahmed */}
          <div className="min-w-0 lg:col-span-5">
            <div className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-[2rem] bg-ink lg:max-w-none">
              <Image
                src="/dr-ahmed-v2.webp"
                alt={t.hero.alt}
                fill
                priority
                sizes="(min-width: 1024px) 40vw, 90vw"
                className="object-cover"
                style={{ objectPosition: "50% 8%" }}
              />
              <div className="absolute inset-x-3 bottom-3 sm:inset-x-4 sm:bottom-4">
                <p className="label mb-2 w-fit rounded-full bg-white/90 px-3 py-1.5 text-ink">
                  {t.hero.chip}
                </p>
                <HeroDemo lang={lang} />
              </div>
            </div>
          </div>
        </section>

        {questionsWeek !== null && (
          <section className="border-t border-line bg-white">
            <div className={`${WRAP} flex flex-col items-start gap-2 py-10 sm:flex-row sm:items-baseline sm:gap-6`}>
              <p className="display text-5xl text-ink sm:text-6xl">
                {questionsWeek.toLocaleString("fr-FR")}
              </p>
              <p className="text-lg text-muted">
                {t.weekQuestions}
              </p>
            </div>
          </section>
        )}

        {/* Fonctions : l'axone */}
        <section id="fonctions" className="border-y border-line bg-white py-20 lg:py-28">
          <div className={WRAP}>
            <p className="label text-muted">{t.features.label}</p>
            <h2 className="display mt-4 max-w-2xl text-4xl leading-[1] text-ink sm:text-6xl">
              {t.features.title}
            </h2>
            <div className="mt-12">
              <AxonTabs lang={lang} />
            </div>
            <div className="mt-16 border-t border-line pt-10 sm:mt-24 sm:pt-14">
              <p className="label text-muted">{t.features.around}</p>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                {t.included.map((item, idx) => {
                  const i = { ...item, icon: INCLUDED_ICONS[idx], wide: idx === 0 };
                  return (
                  <div
                    key={i.t}
                    className={`rounded-2xl border p-4 sm:p-5 ${
                      i.wide ? "col-span-2 border-transparent bg-ink text-white" : "border-line bg-slide"
                    }`}
                  >
                    <span
                      className={`grid h-9 w-9 place-items-center rounded-full ${
                        i.wide ? "bg-eosin text-ink" : "bg-white text-ink ring-1 ring-line"
                      }`}
                    >
                      <i.icon />
                    </span>
                    <p className={`mt-3 font-semibold leading-snug ${i.wide ? "text-lg" : "text-[15px] sm:text-base"} ${i.wide ? "text-white" : "text-ink"}`}>
                      {i.t}
                    </p>
                    <p className={`mt-1 text-sm leading-snug ${i.wide ? "text-white/75" : "text-muted"}`}>{i.d}</p>
                  </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Avis */}
        <Reviews lang={lang} />

        {/* Tarifs */}
        <section id="tarifs" className="border-y border-line bg-white py-20 lg:py-28">
          <div className={WRAP}>
            <p className="label text-muted">{t.pricingSection.label}</p>
            <h2 className="display mt-4 max-w-2xl text-4xl leading-[1] text-ink sm:text-6xl">
              {t.pricingSection.title}
            </h2>
            <Pricing offers={offers} lang={lang} />
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className={`${WRAP} py-20 lg:py-28`}>
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="label text-muted">{t.faq.label}</p>
              <h2 className="display mt-4 text-4xl leading-[1] text-ink sm:text-5xl">
                {t.faq.title}
              </h2>
            </div>
            <div className="lg:col-span-8">
            <div className="divide-y divide-line border-y border-line">
              {t.faq.items.map((f) => (
                <details key={f.q} className="py-6">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 text-xl font-semibold text-ink">
                    {f.q}
                    <span
                      className="faq-plus text-3xl font-light leading-none text-eosin transition"
                      aria-hidden
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-2xl text-lg text-muted">{f.a}</p>
                </details>
              ))}
            </div>
              <p className="pt-8 text-lg text-muted">
                {t.faq.other}{" "}
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-ink underline decoration-eosin decoration-2 underline-offset-4 hover:text-eosin"
                >
                  {t.faq.whatsapp}
                </a>
                .
              </p>
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="bg-ink py-20 lg:py-24">
          <div className={`${WRAP} flex flex-col items-start justify-between gap-10 lg:flex-row lg:items-center`}>
            <h2 className="display max-w-2xl text-4xl leading-[1] text-white sm:text-6xl">
              {t.cta.title}
            </h2>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <a
                href={APP_URL} data-track="final_cta"
                className="rounded-full bg-eosin px-8 py-4 text-center font-semibold text-ink transition hover:bg-white"
              >
                {t.cta.button}
              </a>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-white/30 px-8 py-4 text-center font-semibold text-white transition hover:border-white hover:bg-white/10"
              >
                {t.cta.whatsapp} · <bdi dir="ltr">+222 41 51 32 11</bdi>
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className={`${WRAP} flex flex-col items-start justify-between gap-5 py-10 text-sm text-muted sm:flex-row sm:items-center`}>
        <Logo />
        <p>© {new Date().getFullYear()} {t.footer.rights}</p>
        <div className="flex gap-6">
          <a href={`${P}/confidentialite`} className="hover:text-ink">{t.footer.privacy}</a>
          <a href={`${P}/conditions`} className="hover:text-ink">{t.footer.terms}</a>
          <a href={WHATSAPP_URL} className="hover:text-ink" target="_blank" rel="noopener noreferrer">{t.footer.whatsapp} <bdi dir="ltr">+222 41 51 32 11</bdi></a>
        </div>
      </footer>
    </>
  );
}
