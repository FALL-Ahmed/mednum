import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import type { Lang } from "@/lib/site-i18n";

const LABEL = {
  fr: { home: "← Accueil", privacy: "Confidentialité", terms: "Conditions" },
  ar: { home: "الرئيسية →", privacy: "الخصوصية", terms: "الشروط" },
} as const;

/** Page légale (confidentialité ou conditions), en français ou en arabe. */
export function LegalPage({ kind, lang }: { kind: "privacy" | "terms"; lang: Lang }) {
  const doc = LEGAL[kind][lang];
  const P = lang === "ar" ? "/ar" : "";
  const L = LABEL[lang];
  const other = kind === "privacy" ? "terms" : "privacy";
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
      <Link href={P || "/"} className="text-sm font-semibold text-ink/70 transition hover:text-ink">
        {L.home}
      </Link>
      <h1 className="display mt-6 text-4xl text-ink sm:text-5xl">{doc.title}</h1>
      <p className="mt-3 text-sm text-muted">{doc.updated}</p>
      <p className="mt-6 text-lg leading-relaxed text-ink/80">{doc.intro}</p>

      <div className="mt-10 space-y-9">
        {doc.sections.map((s) => (
          <section key={s.h}>
            <h2 className="display text-2xl text-ink">{s.h}</h2>
            <div className="mt-3 space-y-3 leading-relaxed text-ink/80">
              {s.p.map((x) => (
                <p key={x}>{x}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-14 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-6 text-sm text-muted">
        <Link href={`${P}/${other === "privacy" ? "confidentialite" : "conditions"}`} className="font-semibold text-ink/80 hover:text-ink">
          {L[other]}
        </Link>
        <Link href={P || "/"} className="hover:text-ink">
          Axone
        </Link>
      </div>
    </main>
  );
}
