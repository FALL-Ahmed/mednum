import Image from "next/image";
import { SITE, type Lang } from "@/lib/site-i18n";

/* Aperçus produit (maquettes en code, à remplacer par de vraies captures). */

type P = { lang?: Lang };

function Shell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-line bg-white p-6 shadow-[0_1px_0_var(--line),0_24px_48px_-28px_rgba(36,27,99,0.35)] sm:p-8">
      <p className="label text-muted">{label}</p>
      {children}
    </div>
  );
}

export function FicheDemo({ lang = "fr" }: P) {
  const t = SITE[lang].demo.fiche;
  return (
    <Shell label={t.label}>
      <h4 className="display mt-3 text-3xl text-ink">{t.title}</h4>
      <p className="mt-3 leading-relaxed text-ink/75">{t.text}</p>
      <div className="mt-5 rounded-2xl bg-eosin-soft p-5">
        <p className="label" style={{ color: "var(--eosin-text)" }}>
          {t.boxLabel}
        </p>
        <ul className="mt-3 space-y-2 text-ink/85">
          {t.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}

export function QcmDemo({ lang = "fr" }: P) {
  const t = SITE[lang].demo.qcm;
  const flags = [
    { ok: true, picked: true },
    { ok: true, picked: true },
    { ok: false, picked: false },
    { ok: true, picked: false },
    { ok: false, picked: false },
  ];
  const props = flags.map((f, i) => ({ ...f, l: "ABCDE"[i], t: t.props[i] }));
  return (
    <Shell label={t.label}>
      <p className="display mt-3 text-2xl leading-snug text-ink">{t.question}</p>
      <div className="mt-5 space-y-2">
        {props.map((o) => (
          <div
            key={o.l}
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-[15px] ${
              o.ok && !o.picked
                ? "border-[#ffb74d] bg-[#fff6e6] text-ink"
                : o.picked
                  ? "border-hema bg-hema-soft font-semibold text-hema-deep"
                  : "border-line text-ink/70"
            }`}
          >
            <span className="label w-4 shrink-0">{o.l}</span>
            <span className="flex-1">{o.t}</span>
            {o.ok && !o.picked && <span className="label shrink-0">{t.forgot}</span>}
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-[#fff6e6] px-4 py-3">
        <p className="font-semibold text-ink">{t.partial}</p>
        <p className="text-sm text-muted">{t.missing}</p>
      </div>
    </Shell>
  );
}

export function ChatDemo({ lang = "fr" }: P) {
  const t = SITE[lang].demo.chat;
  return (
    <Shell label={t.label}>
      <div className="ms-auto mt-4 w-fit max-w-[88%] rounded-2xl rounded-ee-md bg-hema px-4 py-3 text-white">
        {t.q}
      </div>
      <div className="mt-3 flex items-end gap-2.5">
        <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-hema-soft">
          <Image
            src="/dr-ahmed-face.webp"
            alt={SITE[lang].hero.alt}
            fill
            sizes="120px"
            className="object-cover"
          />
        </span>
        <div className="max-w-[calc(100%-3.25rem)] rounded-2xl rounded-es-md bg-slide px-4 py-3 text-ink/85">
          {t.a}
          <p className="mt-3 border-t border-line pt-3 text-sm">
            <span className="font-bold text-hema">{SITE[lang].demo.hero.keep}</span>
            {t.keep}
          </p>
        </div>
      </div>
      <p className="label mt-4 text-muted">{t.source}</p>
    </Shell>
  );
}

export function FlashcardDemo({ lang = "fr" }: P) {
  const t = SITE[lang].demo.flash;
  return (
    <Shell label={t.label}>
      <div className="mt-4 rounded-2xl bg-ink px-6 py-10 text-center text-white">
        <p className="label text-white/60">{t.question}</p>
        <p className="display mt-3 text-2xl leading-snug">{t.q}</p>
      </div>
      <p className="mt-4 text-center text-sm text-muted">{t.hint}</p>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-sm font-semibold">
        {t.grades.map((r) => (
          <span key={r} className="rounded-xl border border-line py-2.5 text-ink/80">
            {r}
          </span>
        ))}
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted">{t.note}</p>
    </Shell>
  );
}

export function CaseDemo({ lang = "fr" }: P) {
  const t = SITE[lang].demo.caseDemo;
  return (
    <Shell label={t.label}>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {t.steps.map((s, i) => (
          <span
            key={s}
            className={`label rounded-full px-3 py-1 ${
              i === 1 ? "bg-ink text-white" : i < 1 ? "bg-hema-soft text-ink" : "border border-line text-muted"
            }`}
          >
            {s}
          </span>
        ))}
      </div>
      <p className="mt-5 leading-relaxed text-ink/85">{t.story}</p>
      <p className="display mt-5 text-xl text-ink">{t.q}</p>
      <div className="mt-3 rounded-2xl border border-dashed border-line px-4 py-4 text-muted">{t.placeholder}</div>
      <p className="mt-4 text-sm text-muted">{t.note}</p>
    </Shell>
  );
}
