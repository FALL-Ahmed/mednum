import Image from "next/image";
import { AxonTabs } from "./axon-tabs";
import { Pricing } from "./pricing";
import { HeroDemo } from "./hero-demo";
import { getPublicOffers } from "@/lib/offers";
import { getPublicStats } from "@/lib/stats";

// « Essayer gratuitement » = créer son espace avec Google (pas de téléchargement).
const APP_URL = "/connexion";

// Même gouttière et même largeur pour toutes les sections : tout s'aligne sur la même grille.
const WRAP = "mx-auto w-full max-w-6xl px-5 sm:px-8";

// Contact WhatsApp (numéro de Loop IA / Axone).
const WHATSAPP_NUMBER = "22241513211";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Bonjour, j'ai une question sur Axone.")}`;

// Les chiffres viennent de Supabase (fonction public_stats). On ne les affiche qu'au-dessus de ces seuils,
// pour ne jamais montrer un petit nombre qui ferait douter. Ajuste-les si besoin.
const MIN_STUDENTS_SHOWN = 50;
const MIN_QUESTIONS_SHOWN = 100;
// Aperçu visuel en développement uniquement (jamais en production).
const DEV_PREVIEW = { students: 1200, questionsWeek: 8400 };

// Avis d'étudiants : à remplir avec de VRAIS avis, avec l'accord de chaque personne.
// Cible : 3 étudiants (médecine / pharmacie, Mauritanie / Sénégal). Vide = la section n'apparaît pas en production.
type Review = { quote: string; name: string; role: string };
const REVIEWS: Review[] = [];
// TEXTES FICTIFS pour visualiser la mise en page. Jamais affichés en production (voir Reviews()).
const DEV_SAMPLE_REVIEWS: Review[] = [
  {
    quote: "Avant, je passais mes soirées à refaire des fiches à la main. Maintenant je dépose mon cours et j'ai ma fiche et mes QCM en quelques minutes. Je révise enfin au lieu de recopier.",
    name: "Mariem",
    role: "Médecine · Nouakchott",
  },
  {
    quote: "En pharmacologie il y a énormément à retenir. Les fiches me donnent l'essentiel par chapitre, et les QCM à réponses multiples ressemblent à ceux de la fac. Je vois tout de suite ce que j'ai oublié.",
    name: "Cheikh",
    role: "Pharmacie · Nouakchott",
  },
  {
    quote: "Les flashcards sont ce qui m'a le plus servi avant les partiels. Ce que je ne sais pas revient vite, et je ne perds plus de temps sur ce que je maîtrise déjà.",
    name: "Awa",
    role: "Médecine · Dakar",
  },
];

const faqs = [
  {
    q: "Axone remplace-t-il mes cours ?",
    a: "Non. Il part de tes cours pour t'aider à les apprendre. Pour les points importants, vérifie toujours avec tes enseignants.",
  },
  {
    q: "D'où viennent les réponses ?",
    a: "De tes documents. Si ta question sort du programme, Axone te le dit au lieu d'inventer.",
  },
  {
    q: "Comment je paie ?",
    a: "En Mauritanie, avec Bankily, Masrivi, Sedad ou Click : ton plan est activé automatiquement. Au Sénégal, par mobile money (Wave, Orange Money…) ou carte bancaire, et au Maroc par carte bancaire : ces moyens arrivent bientôt, et en attendant tu peux nous écrire sur WhatsApp.",
  },
  {
    q: "Quels fichiers puis-je ajouter ?",
    a: "Des PDF dont le texte est sélectionnable, ou des fichiers .txt. Un PDF scanné (une image) ne peut pas être lu pour l'instant.",
  },
];

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

function SocialProof({ students }: { students: number | null }) {
  const count = students !== null && students >= MIN_STUDENTS_SHOWN ? students : null;
  if (count === null) return null;
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
        Utilisé par plus de{" "}
        <span className="font-bold text-ink">{(Math.floor(count / 10) * 10).toLocaleString("fr-FR")}</span>{" "}
        étudiants
      </p>
    </div>
  );
}

function Reviews() {
  const list =
    REVIEWS.length > 0
      ? REVIEWS
      : process.env.NODE_ENV !== "production"
        ? DEV_SAMPLE_REVIEWS
        : [];
  if (list.length === 0) return null;
  return (
    <section className={`${WRAP} py-20 lg:py-28`}>
      <p className="label text-muted">Ce que disent les étudiants</p>
      <h2 className="display mt-4 max-w-2xl text-4xl leading-[1] text-ink sm:text-6xl">
        Ils révisent déjà avec Axone.
      </h2>
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {list.map((r) => (
          <figure
            key={r.role}
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
        ))}
      </div>
    </section>
  );
}

export default async function Home() {
  const live = await getPublicStats();
  const offers = await getPublicOffers();
  const stats =
    live ?? (process.env.NODE_ENV !== "production" ? DEV_PREVIEW : null);
  const questionsWeek =
    stats && stats.questionsWeek >= MIN_QUESTIONS_SHOWN ? stats.questionsWeek : null;

  return (
    <>
      <header className={`${WRAP} flex items-center justify-between py-5`}>
        <a href="#top" aria-label="Axone, accueil">
          <Logo />
        </a>
        <nav className="flex items-center gap-7 text-[15px] font-medium text-ink/70">
          <a href="#fonctions" className="hidden hover:text-ink sm:block">Fonctions</a>
          <a href="#tarifs" className="hidden hover:text-ink sm:block">Tarifs</a>
          <a href="#faq" className="hidden hover:text-ink sm:block">FAQ</a>
          <a
            href="/connexion"
            className="rounded-full bg-ink px-5 py-2.5 font-semibold text-white transition hover:bg-eosin"
          >
            Se connecter
          </a>
        </nav>
      </header>

      <main id="top">
        {/* Hero */}
        <section className={`${WRAP} grid items-center gap-12 pb-20 pt-10 lg:grid-cols-12 lg:gap-8 lg:pb-28 lg:pt-16`}>
          <div className="min-w-0 lg:col-span-7">
            <p className="label text-muted">Révision · Médecine et pharmacie</p>
            <h1 className="display mt-5 text-[2.75rem] leading-[0.95] text-ink sm:text-7xl lg:whitespace-nowrap lg:text-[5.2rem]">
              Dépose ton cours.
              <br />
              <span className="text-eosin">Retiens-le.</span>
            </h1>
            <p className="mt-7 max-w-lg text-xl leading-relaxed text-muted">
              Axone transforme tes cours en fiches, QCM, flashcards et cas
              cliniques, et Dr. Ahmed répond à tes questions d&apos;après ton cours.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-5">
              <a
                href={APP_URL}
                className="rounded-full bg-ink px-8 py-4 text-base font-semibold text-white transition hover:bg-eosin"
              >
                Essayer gratuitement
              </a>
              <SocialProof students={stats ? stats.students : null} />
            </div>
            <p className="mt-8 text-sm text-muted">
              Pour les étudiants de Mauritanie, du Sénégal et du Maroc
            </p>
          </div>

          {/* Dr. Ahmed */}
          <div className="min-w-0 lg:col-span-5">
            <div className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-[2rem] bg-ink lg:max-w-none">
              <Image
                src="/dr-ahmed-v2.webp"
                alt="Dr. Ahmed, ton prof virtuel"
                fill
                priority
                sizes="(min-width: 1024px) 40vw, 90vw"
                className="object-cover"
                style={{ objectPosition: "50% 8%" }}
              />
              <div className="absolute inset-x-3 bottom-3 sm:inset-x-4 sm:bottom-4">
                <p className="label mb-2 w-fit rounded-full bg-white/90 px-3 py-1.5 text-ink">
                  Dr. Ahmed · ton prof virtuel
                </p>
                <HeroDemo />
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
                questions posées à Dr. Ahmed cette semaine par des étudiants en santé.
              </p>
            </div>
          </section>
        )}

        {/* Fonctions : l'axone */}
        <section id="fonctions" className="border-y border-line bg-white py-20 lg:py-28">
          <div className={WRAP}>
            <p className="label text-muted">Ce que fait Axone</p>
            <h2 className="display mt-4 max-w-2xl text-4xl leading-[1] text-ink sm:text-6xl">
              Du cours à l&apos;examen, sans perdre le signal.
            </h2>
            <div className="mt-12">
              <AxonTabs />
            </div>
          </div>
        </section>

        {/* Avis */}
        <Reviews />

        {/* Tarifs */}
        <section id="tarifs" className="border-y border-line bg-white py-20 lg:py-28">
          <div className={WRAP}>
            <p className="label text-muted">Tarifs</p>
            <h2 className="display mt-4 max-w-2xl text-4xl leading-[1] text-ink sm:text-6xl">
              Commence gratuit. Passe au payant quand tu veux.
            </h2>
            <Pricing offers={offers} />
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className={`${WRAP} py-20 lg:py-28`}>
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="label text-muted">FAQ</p>
              <h2 className="display mt-4 text-4xl leading-[1] text-ink sm:text-5xl">
                Des questions ?
              </h2>
            </div>
            <div className="lg:col-span-8">
            <div className="divide-y divide-line border-y border-line">
              {faqs.map((f) => (
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
                Une autre question ?{" "}
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-ink underline decoration-eosin decoration-2 underline-offset-4 hover:text-eosin"
                >
                  Écris-nous sur WhatsApp
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
              La rentrée est là. Révise dès la première semaine.
            </h2>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <a
                href={APP_URL}
                className="rounded-full bg-eosin px-8 py-4 text-center font-semibold text-ink transition hover:bg-white"
              >
                Essayer gratuitement
              </a>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-white/30 px-8 py-4 text-center font-semibold text-white transition hover:border-white hover:bg-white/10"
              >
                WhatsApp · +222 41 51 32 11
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className={`${WRAP} flex flex-col items-start justify-between gap-5 py-10 text-sm text-muted sm:flex-row sm:items-center`}>
        <Logo />
        <p>© {new Date().getFullYear()} Axone · Mauritanie, Sénégal, Maroc</p>
        <div className="flex gap-6">
          <a href="#" className="hover:text-ink">Confidentialité</a>
          <a href="#" className="hover:text-ink">Conditions</a>
          <a href={WHATSAPP_URL} className="hover:text-ink" target="_blank" rel="noopener noreferrer">WhatsApp +222 41 51 32 11</a>
        </div>
      </footer>
    </>
  );
}
