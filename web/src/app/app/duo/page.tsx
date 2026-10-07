"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-context";
import { IconBook, IconChat, IconCheck, IconSpark } from "@/components/icons";
import { duoKindLabel } from "@/components/duo/duo-shell";
import { roomPayload } from "@/components/duo/start-duo-button";
import {
  cleanCode,
  createDuo,
  createDuoV2,
  duoError,
  joinDuo,
  listDuo,
  PENDING_KEY,
  type DuoCard,
  type DuoCase,
  type DuoKind,
  type DuoListItem,
} from "@/lib/duo";
import { listQcmSets, type QcmSetRow } from "@/lib/qcm-store";
import { getSupabase } from "@/lib/supabase";
import { formatDate, useT } from "@/lib/app-i18n";

const btnDark =
  "rounded-full bg-ink px-6 py-3 font-semibold text-white transition hover:bg-eosin hover:text-ink disabled:opacity-40";

const dateShort = (iso: string) =>
  formatDate(new Date(iso), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type FullDoc = {
  name: string;
  content: string;
  chunks: { title: string; content: string }[];
  cards: DuoCard[];
  cases: DuoCase[];
  sets: QcmSetRow[];
};

function parseList<T>(raw: string | null, ok: (x: unknown) => boolean): T[] {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? (v.filter(ok) as T[]) : [];
  } catch {
    return [];
  }
}

const ACTIVITIES: { id: DuoKind; title: string; text: string; Icon: (p: { className?: string }) => React.JSX.Element }[] = [
  { id: "room", title: "Salle avec Dr. Ahmed", text: "Posez vos questions à Dr. Ahmed ensemble, il répond devant vous deux.", Icon: IconChat },
  { id: "qcm", title: "QCM", text: "La même série, chacun son rythme, puis vous comparez.", Icon: IconCheck },
  { id: "flashcards", title: "Flashcards", text: "Le même jeu de cartes : qui sait quoi ?", Icon: IconBook },
  { id: "case", title: "Cas clinique", text: "Raisonnez chacun de votre côté, puis comparez avec Dr. Ahmed.", Icon: IconSpark },
];

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-7 first:mt-5">
      <p className="flex items-center gap-3 font-semibold text-ink">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-sm text-white">{n}</span>
        {title}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function DuoHome() {
  const t = useT();
  const { profile, quota, docs } = useApp();
  const router = useRouter();
  const isPremium = quota?.plan === "premium";

  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [list, setList] = useState<DuoListItem[] | null>(null);

  const [docId, setDocId] = useState<string | null>(null);
  const [full, setFull] = useState<FullDoc | null>(null);
  const [kind, setKind] = useState<DuoKind | null>(null);
  const [pick, setPick] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const join = useCallback(
    async (raw: string) => {
      const c = cleanCode(raw);
      if (c.length !== 6) {
        setJoinError(t("Le code a 6 caractères (lettres et chiffres)."));
        return;
      }
      setJoining(true);
      setJoinError(null);
      const r = await joinDuo(c, profile.name);
      if (r.error || !r.data) {
        setJoinError(r.error ?? duoError(null));
        setJoining(false);
        return;
      }
      router.push(`/app/duo/${r.data}`);
    },
    [profile.name, router, t],
  );

  useEffect(() => {
    // Invitation ouverte avant la connexion : on la rejoint maintenant. Cours choisi depuis la page d'un cours : on le présélectionne.
    const timer = window.setTimeout(() => {
      let pending: string | null = null;
      try {
        pending = localStorage.getItem(PENDING_KEY);
        if (pending) localStorage.removeItem(PENDING_KEY);
      } catch {
        /* stockage indisponible */
      }
      if (pending) join(pending);
      const wanted = new URLSearchParams(window.location.search).get("cours");
      if (wanted) setDocId(wanted);
      listDuo().then((r) => setList(r.data ?? []));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [join]);

  // Contenu du cours choisi : cartes, cas et séries de QCM déjà générés.
  useEffect(() => {
    if (!docId) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const sb = getSupabase();
      if (!sb) return;
      const { data } = await sb.from("documents").select("id,name,content,chunks,flashcards,clinical_case").eq("id", docId).maybeSingle();
      if (cancelled || !data) return;
      const sets = (await listQcmSets(docId)).rows;
      if (cancelled) return;
      setFull({
        name: data.name as string,
        content: (data.content as string) ?? "",
        chunks: ((data.chunks as { title: string; content: string }[] | null) ?? []).filter((c) => c && c.content),
        cards: parseList<DuoCard>(data.flashcards as string | null, (x) => !!x && typeof (x as DuoCard).front === "string" && typeof (x as DuoCard).back === "string"),
        cases: parseList<DuoCase>(data.clinical_case as string | null, (x) => !!x && typeof (x as DuoCase).title === "string" && Array.isArray((x as DuoCase).stages) && (x as DuoCase).stages.length === 4),
        sets,
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [docId]);

  function chooseDoc(id: string) {
    setDocId(id);
    setFull(null);
    setKind(null);
    setPick(0);
    setCreateError(null);
  }

  const ready =
    !!full &&
    (kind === "room" ||
      (kind === "qcm" && full.sets.length > 0) ||
      (kind === "flashcards" && full.cards.length > 0) ||
      (kind === "case" && full.cases.length > 0));

  async function create() {
    if (!full || !kind || creating) return;
    setCreating(true);
    setCreateError(null);
    let r: { data: string | null; error: string | null };
    if (kind === "qcm") r = await createDuo(full.sets[pick].chapter_title, full.sets[pick].questions, profile.name);
    else if (kind === "flashcards") r = await createDuoV2("flashcards", full.name, full.cards.slice(0, 30), profile.name);
    else if (kind === "case") r = await createDuoV2("case", full.cases[pick].title, full.cases[pick], profile.name);
    else r = await createDuoV2("room", full.name, roomPayload(full), profile.name);
    if (r.error || !r.data) {
      setCreateError(r.error);
      setCreating(false);
      return;
    }
    router.push(`/app/duo/${r.data}`);
  }

  const status = (id: DuoKind) => {
    if (!full) return "";
    if (id === "room") return t("Toujours disponible");
    if (id === "qcm") return full.sets.length ? t(full.sets.length > 1 ? "{n} séries prêtes" : "{n} série prête", { n: full.sets.length }) : t("À générer d'abord");
    if (id === "flashcards") return full.cards.length ? t(full.cards.length > 1 ? "{n} cartes prêtes" : "{n} carte prête", { n: full.cards.length }) : t("À générer d'abord");
    return full.cases.length ? t(full.cases.length > 1 ? "{n} cas prêts" : "{n} cas prêt", { n: full.cases.length }) : t("À générer d'abord");
  };

  return (
    <div className="max-w-3xl">
      <p className="display text-3xl text-ink sm:text-4xl">{t("Révision à deux")}</p>
      <p className="mt-3 max-w-2xl text-lg text-muted">{t("Révise avec un ami : même contenu, chacun à son rythme, puis vous comparez vos réponses.")}</p>

      {/* Rejoindre : une ligne, pour celui qui a reçu un code */}
      <form
        className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-white p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          join(code);
        }}
      >
        <div className="min-w-[13rem] flex-1">
          <label htmlFor="duo-code" className="text-sm font-semibold text-ink">{t("Tu as reçu un code d'invitation ?")}</label>
          <input
            id="duo-code"
            value={code}
            onChange={(e) => setCode(cleanCode(e.target.value))}
            inputMode="text"
            autoComplete="off"
            placeholder={t("K7M4QX")}
            className="mt-2 w-full rounded-xl border border-line bg-slide px-4 py-3 text-center font-mono text-lg tracking-[0.3em] text-ink placeholder:text-ink/25 focus:border-ink focus:outline-none"
          />
        </div>
        <button type="submit" disabled={joining || code.length !== 6} className={btnDark}>
          {joining ? t("Connexion…") : t("Rejoindre")}
        </button>
        {joinError && (
          <p role="alert" className="w-full rounded-2xl bg-[#fff1f0] px-4 py-3 text-sm text-[#a3271c]">
            {t(joinError)}
          </p>
        )}
      </form>

      {/* Lancer une session */}
      <section className="mt-6 rounded-3xl border border-line bg-white p-6 sm:p-8">
        <p className="display text-2xl text-ink">{t("Lancer une session")}</p>
        <p className="mt-1 text-muted">{t("Ton ami participe gratuitement : il reçoit un lien ou un code.")}</p>

        {!isPremium ? (
          <div className="mt-5 rounded-2xl bg-eosin-soft p-5">
            <p className="font-semibold text-ink">{t("Lancer une session est réservé au plan Premium.")}</p>
            <Link href="/app/abonnement" className={`mt-3 inline-block ${btnDark}`}>{t("Voir le plan Premium")}</Link>
          </div>
        ) : (docs ?? []).length === 0 ? (
          <div className="mt-5 rounded-2xl bg-slide p-5">
            <p className="font-semibold text-ink">{t("Ajoute d'abord un cours.")}</p>
            <Link href="/app/cours" className={`mt-3 inline-block ${btnDark}`}>{t("Ajouter un cours")}</Link>
          </div>
        ) : (
          <>
            <Step n={1} title={t("Choisis le cours")}>
              <ul className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
                {(docs ?? []).map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => chooseDoc(d.id)}
                      aria-pressed={docId === d.id}
                      className={`w-full rounded-2xl border px-4 py-3 text-start transition ${
                        docId === d.id ? "border-eosin bg-eosin-soft" : "border-line hover:border-ink"
                      }`}
                    >
                      <span dir="auto" className="block truncate font-semibold text-ink">
                        {d.name}
                      </span>
                      <span className="text-sm text-muted">{t(d.pages > 1 ? "{n} pages" : "{n} page", { n: d.pages })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Step>

            {docId && (
              <Step n={2} title={t("Choisis l'activité")}>
                {!full ? (
                  <p className="text-muted">{t("Chargement du cours…")}</p>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {ACTIVITIES.map(({ id, title, text, Icon }) => (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => {
                            setKind(id);
                            setPick(0);
                            setCreateError(null);
                          }}
                          aria-pressed={kind === id}
                          className={`flex h-full w-full flex-col rounded-2xl border p-4 text-start transition ${
                            kind === id ? "border-eosin bg-eosin-soft" : "border-line hover:border-ink"
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-ink ring-1 ring-line">
                              <Icon />
                            </span>
                            <span className="font-semibold text-ink">{t(title)}</span>
                          </span>
                          <span className="mt-2 text-sm text-muted">{t(text)}</span>
                          <span className="mt-2 text-xs font-semibold" style={{ color: "var(--eosin-text)" }}>
                            {status(id)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Step>
            )}

            {full && kind && (
              <Step n={3} title={t("Lance la session")}>
                {kind === "qcm" && full.sets.length > 0 && (
                  <ul className="space-y-2">
                    {full.sets.map((s, i) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => setPick(i)}
                          aria-pressed={pick === i}
                          className={`w-full rounded-2xl border px-4 py-3 text-start transition ${
                            pick === i ? "border-eosin bg-eosin-soft" : "border-line hover:border-ink"
                          }`}
                        >
                          <span dir="auto" className="block font-semibold text-ink">
                            {s.chapter_title}
                          </span>
                          <span className="text-sm text-muted">
                            {dateShort(s.created_at)} · {t("{n} questions", { n: s.questions.length })}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {kind === "case" && full.cases.length > 1 && (
                  <ul className="space-y-2">
                    {full.cases.map((c, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => setPick(i)}
                          aria-pressed={pick === i}
                          className={`w-full rounded-2xl border px-4 py-3 text-start font-semibold text-ink transition ${
                            pick === i ? "border-eosin bg-eosin-soft" : "border-line hover:border-ink"
                          }`}
                        >
                          <span dir="auto">{`${i + 1}. ${c.title}`}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {kind === "flashcards" && full.cards.length > 0 && (
                  <p className="text-ink/80">{t(Math.min(full.cards.length, 30) > 1 ? "Vous réviserez les {n} cartes du jeu." : "Vous réviserez la carte du jeu.", { n: Math.min(full.cards.length, 30) })}</p>
                )}
                {kind === "room" && (
                  <p className="text-ink/80">{t("Le cours est partagé dans la salle ; le reste de tes documents reste privé.")}</p>
                )}
                {!ready && (
                  <div className="rounded-2xl bg-slide p-4">
                    <p className="text-ink">{t("Il faut d'abord générer ce contenu dans le cours.")}</p>
                    <Link href={`/app/cours/${encodeURIComponent(docId ?? "")}`} className="mt-2 inline-block font-semibold text-ink underline">{t("Ouvrir le cours")}</Link>
                  </div>
                )}
                {createError && (
                  <p role="alert" className="mt-3 rounded-2xl bg-[#fff1f0] px-4 py-3 text-sm text-[#a3271c]">
                    {t(createError)}
                  </p>
                )}
                <button type="button" onClick={create} disabled={!ready || creating} className={`mt-4 ${btnDark}`}>
                  {creating ? t("Création de la session…") : t("Créer la session et inviter")}
                </button>
              </Step>
            )}
          </>
        )}
      </section>

      <h2 className="display mt-10 text-2xl text-ink">{t("Tes sessions")}</h2>
      {list === null ? (
        <p className="mt-3 text-muted">{t("Chargement…")}</p>
      ) : list.length === 0 ? (
        <p className="mt-3 text-muted">{t("Aucune session pour l'instant. Elles apparaîtront ici pendant 48 heures.")}</p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {list.map((s) => {
            const over = new Date(s.expires_at) < new Date();
            return (
              <li key={s.code} className="flex flex-col rounded-2xl border border-line bg-white p-5">
                <p className="label text-muted">
                  {dateShort(s.created_at)} · {s.is_host ? t("Tu as invité") : t("Tu as rejoint")}
                </p>
                <p dir="auto" className="mt-1.5 font-semibold leading-snug text-ink">
                  {s.title || t(duoKindLabel(s.kind))}
                </p>
                <p className="mt-1 text-sm text-muted">{t(duoKindLabel(s.kind))}</p>
                <p className="mt-2 text-sm text-muted">
                  {s.partner ? t("Avec {a}", { a: s.partner }) : t("En attente d'un partenaire")}
                  {s.total > 0 ? ` · ${t("{a}/{b} répondues · {c} pts", { a: s.answered, b: s.total, c: s.points })}` : ""}
                </p>
                <Link
                  href={`/app/duo/${s.code}`}
                  className="mt-4 rounded-full border border-ink/25 px-6 py-3 text-center font-semibold text-ink transition hover:border-ink"
                >
                  {over ? t("Voir le résultat") : t("Ouvrir")}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
