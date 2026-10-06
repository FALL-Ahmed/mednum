import Image from "next/image";

/* Aperçus produit (maquettes en code, à remplacer par de vraies captures). */

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

export function FicheDemo() {
  return (
    <Shell label="Fiche · Cardiologie · Chap. 5">
      <h4 className="display mt-3 text-3xl text-ink">L&apos;insuffisance cardiaque</h4>
      <p className="mt-3 leading-relaxed text-ink/75">
        Le cœur n&apos;assure plus un débit suffisant pour les besoins de
        l&apos;organisme. Gauche : congestion pulmonaire. Droite : congestion
        systémique.
      </p>
      <div className="mt-5 rounded-2xl bg-eosin-soft p-5">
        <p className="label" style={{ color: "var(--eosin-text)" }}>
          Ce qui tombe en compo
        </p>
        <ul className="mt-3 space-y-2 text-ink/85">
          <li>Signes cliniques : insuffisance gauche vs droite</li>
          <li>Les causes principales</li>
          <li>Traitement de base : diurétiques, IEC, bêtabloquants</li>
        </ul>
      </div>
    </Shell>
  );
}

export function QcmDemo() {
  const props = [
    { l: "A", t: "Dyspnée d'effort et orthopnée", ok: true, picked: true },
    { l: "B", t: "Crépitants pulmonaires", ok: true, picked: true },
    { l: "C", t: "Turgescence jugulaire isolée", ok: false, picked: false },
    { l: "D", t: "L'œdème aigu du poumon en est une complication", ok: true, picked: false },
    { l: "E", t: "L'hépatomégalie douloureuse est le signe cardinal", ok: false, picked: false },
  ];
  return (
    <Shell label="QCM · Question 4 sur 10">
      <p className="display mt-3 text-2xl leading-snug text-ink">
        Insuffisance cardiaque gauche : quelles propositions sont exactes ?
      </p>
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
            {o.ok && !o.picked && <span className="label shrink-0">Oubliée</span>}
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-[#fff6e6] px-4 py-3">
        <p className="font-semibold text-ink">Partiel · 5 points</p>
        <p className="text-sm text-muted">Il te manquait la D.</p>
      </div>
    </Shell>
  );
}

export function ChatDemo() {
  return (
    <Shell label="Question sur ton cours">
      <div className="ml-auto mt-4 w-fit max-w-[88%] rounded-2xl rounded-br-md bg-hema px-4 py-3 text-white">
        Pourquoi l&apos;insuffisance cardiaque gauche donne un œdème pulmonaire, et la
        droite des œdèmes des jambes ?
      </div>
      <div className="mt-3 flex items-end gap-2.5">
        <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-hema-soft">
          <Image
            src="/dr-ahmed-face.webp"
            alt="Dr. Ahmed"
            fill
            sizes="120px"
            className="object-cover"
          />
        </span>
        <div className="max-w-[calc(100%-3.25rem)] rounded-2xl rounded-bl-md bg-slide px-4 py-3 text-ink/85">
          À gauche, le sang s&apos;accumule en amont du ventricule : la pression monte
          dans les veines pulmonaires et le plasma passe dans les alvéoles. À
          droite, il s&apos;accumule dans les veines du corps : jugulaires, foie, jambes.
          <p className="mt-3 border-t border-line pt-3 text-sm">
            <span className="font-bold text-hema">À retenir · </span>
            gauche = poumons, droite = corps.
          </p>
        </div>
      </div>
      <p className="label mt-4 text-muted">Source : ton cours, page 42</p>
    </Shell>
  );
}

export function FlashcardDemo() {
  return (
    <Shell label="Flashcards · 12 à revoir aujourd'hui">
      <div className="mt-4 rounded-2xl bg-ink px-6 py-10 text-center text-white">
        <p className="label text-white/60">Question</p>
        <p className="display mt-3 text-2xl leading-snug">
          Quels sont les 3 signes de la triade de Beck ?
        </p>
      </div>
      <p className="mt-4 text-center text-sm text-muted">Tu as la réponse ? Note-toi.</p>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-sm font-semibold">
        {["À revoir", "Difficile", "Bien", "Facile"].map((r) => (
          <span key={r} className="rounded-xl border border-line py-2.5 text-ink/80">
            {r}
          </span>
        ))}
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        Ce que tu maîtrises revient plus tard. Ce qui résiste revient vite.
      </p>
    </Shell>
  );
}

export function CaseDemo() {
  const steps = ["Histoire", "Hypothèses", "Examen", "Examens complémentaires", "Diagnostic"];
  return (
    <Shell label="Cas clinique · Étape 2 sur 5">
      <div className="mt-4 flex flex-wrap gap-1.5">
        {steps.map((t, i) => (
          <span
            key={t}
            className={`label rounded-full px-3 py-1 ${
              i === 1 ? "bg-ink text-white" : i < 1 ? "bg-hema-soft text-ink" : "border border-line text-muted"
            }`}
          >
            {t}
          </span>
        ))}
      </div>
      <p className="mt-5 leading-relaxed text-ink/85">
        Femme de 27 ans. Elle consulte pour une chute de la paupière et une vision
        double qui apparaissent en fin de journée et s&apos;améliorent après le repos.
      </p>
      <p className="display mt-5 text-xl text-ink">
        Quelles hypothèses diagnostiques envisages-tu ?
      </p>
      <div className="mt-3 rounded-2xl border border-dashed border-line px-4 py-4 text-muted">
        Écris ton raisonnement…
      </div>
      <p className="mt-4 text-sm text-muted">
        Dr. Ahmed corrige ton raisonnement étape par étape, comme en stage.
      </p>
    </Shell>
  );
}
