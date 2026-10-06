"use client";

import type { ReactNode } from "react";

/*
  Affichage d'une fiche de révision. Lit le format de la génération web ("# titre", "## section", "- point",
  "★ ⚠️ ❌ ✅" pour les encadrés, "|" pour les tableaux) et reste lisible pour les anciennes fiches de
  l'application mobile (lignes ═══ et titres en majuscules). Les **gras** que l'IA ajoute parfois sont
  interprétés, jamais affichés tels quels.
*/

type Block =
  | { kind: "p"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "row"; label: string; text: string }
  | { kind: "sub"; text: string }
  | { kind: "call"; tone: "star" | "warn" | "err" | "ok"; text: string }
  | { kind: "chain"; label: string; steps: string[] }
  | { kind: "q"; text: string }
  | { kind: "r"; text: string }
  | { kind: "qa"; n: number; q: string; answers: string[] }
  | { kind: "table"; rows: string[][] };

type Section = { title: string; blocks: Block[] };

const CALL: Record<string, "star" | "warn" | "err" | "ok"> = { "★": "star", "⚠": "warn", "❌": "err", "✅": "ok" };

const isRule = (t: string) => /^[═─=\-_*\s]{4,}$/.test(t);
const isUpperHeading = (t: string) =>
  t.length < 90 && t === t.toUpperCase() && /[A-ZÀ-Ý]/.test(t) && !/^[-★⚠❌✅|*]/.test(t);
const plain = (s: string) => s.replace(/\*\*/g, "").trim();

/** « **Étiquette** : texte » ou « Étiquette : texte » -> { label, text }. */
function splitLabel(s: string): { label: string; text: string } | null {
  const bold = s.match(/^\*\*(.{2,70}?)\*\*\s*:?\s*(.*)$/);
  if (bold && !/^Q\d*\s*[:.)]/i.test(bold[1])) {
    const label = bold[1].replace(/\s*:\s*$/, "");
    return { label, text: bold[2].replace(/^:\s*/, "") };
  }
  const m = s.match(/^([^:.!?*|]{2,45}?)\s*:\s+(.+)$/);
  return m ? { label: m[1], text: m[2] } : null;
}

function parse(text: string): { title: string; meta: string; sections: Section[] } {
  const lines = text.split("\n").map((l) => l.trim());
  const modern = lines.some((l) => l.startsWith("## "));
  let title = "";
  let meta = "";
  const sections: Section[] = [];
  let cur: Section | null = null;
  const push = (b: Block) => {
    if (!cur) {
      cur = { title: "", blocks: [] };
      sections.push(cur);
    }
    cur.blocks.push(b);
  };
  const lastKind = () => cur?.blocks[cur.blocks.length - 1]?.kind;

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i];
    if (!t || isRule(t)) continue;

    if (t.startsWith("# ")) {
      title = plain(t.slice(2));
      continue;
    }
    if (!title && !modern && /^FICHE DE R[ÉE]VISION/i.test(t)) {
      title = t;
      continue;
    }
    if (!meta && /^\**Discipline\s*:/i.test(t)) {
      meta = plain(t);
      continue;
    }
    if (t.startsWith("## ") || (!modern && isUpperHeading(t) && !/^FICHE DE R[ÉE]VISION/i.test(t))) {
      cur = { title: plain(t.replace(/^##\s*/, "")), blocks: [] };
      sections.push(cur);
      continue;
    }

    if (t.startsWith("|")) {
      const rows: string[][] = [];
      let j = i;
      while (j < lines.length && lines[j].startsWith("|")) {
        const cells = lines[j].replace(/^\||\|$/g, "").split("|").map((c) => plain(c));
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        j++;
      }
      i = j - 1;
      if (rows.length > 0) push({ kind: "table", rows });
      continue;
    }

    const first = t.charAt(0);
    const tone = CALL[first];
    if (tone) {
      push({ kind: "call", tone, text: t.replace(/^[★⚠❌✅]️?\s*/, "") });
      continue;
    }

    const body = t.replace(/^[-•]\s+/, "");
    const isBullet = body !== t;

    // Question / réponse (avec ou sans ** autour)
    const qm = body.match(/^\**Q\d*\s*[:.)]\s*(.+?)\**$/i);
    if (qm) {
      push({ kind: "q", text: plain(qm[1]) });
      continue;
    }
    const rm = body.match(/^\**R(?:éponse(?:\s+attendue)?)?\s*:\s*\**\s*(.+)$/i);
    if (rm) {
      push({ kind: "r", text: rm[1].trim() });
      continue;
    }
    if (!isBullet && lastKind() === "q") {
      push({ kind: "r", text: plain(body) });
      continue;
    }

    // Enchaînement (cause → mécanisme → ...), avec ou sans étiquette
    if ((body.match(/→/g) ?? []).length >= 2) {
      const sp = splitLabel(body);
      const chainText = sp && (sp.text.match(/→/g) ?? []).length >= 2 ? sp.text : body;
      const label = sp && chainText === sp.text ? sp.label : "";
      push({
        kind: "chain",
        label: plain(label),
        steps: chainText.split("→").map((x) => plain(x).replace(/[.;]$/, "")).filter(Boolean),
      });
      continue;
    }

    const sp = splitLabel(body);
    if (sp && sp.text) {
      push({ kind: "row", label: plain(sp.label), text: sp.text });
      continue;
    }
    if (sp && !sp.text) {
      push({ kind: "sub", text: plain(sp.label) });
      continue;
    }
    if (/^[^|]{3,60}:$/.test(plain(body))) {
      push({ kind: "sub", text: plain(body).replace(/:$/, "") });
      continue;
    }
    push(isBullet ? { kind: "bullet", text: body } : { kind: "p", text: body });
  }
  return { title, meta, sections };
}

/** Texte avec **gras** interprété. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <strong key={i} className="font-semibold text-ink">
            {p}
          </strong>
        ) : (
          <span key={i}>{p.replace(/\*\*/g, "")}</span>
        ),
      )}
    </>
  );
}

const TONE = {
  star: { box: "bg-[#fff8e6] border-[#f0c96a]", mark: "★", color: "#9a6b00" },
  warn: { box: "bg-[#fff4ec] border-[#f3b48a]", mark: "⚠", color: "#b3500f" },
  err: { box: "bg-[#fff1f0] border-[#eaa39b]", mark: "✕", color: "#a3271c" },
  ok: { box: "bg-eosin-soft border-[#9fd9d1]", mark: "✓", color: "var(--eosin-text)" },
} as const;

function Callout({ tone, text }: { tone: keyof typeof TONE; text: string }) {
  const t = TONE[tone];
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3.5 ${t.box}`}>
      <span aria-hidden className="mt-0.5 text-lg font-bold leading-none" style={{ color: t.color }}>
        {t.mark}
      </span>
      <p className="leading-relaxed text-ink/90">
        <Inline text={text} />
      </p>
    </div>
  );
}

function Table({ rows }: { rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[32rem] border-collapse text-left text-[15px]">
        <thead>
          <tr className="bg-ink text-white">
            {rows[0].map((c, k) => (
              <th key={k} className="px-4 py-3 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((r, k) => (
            <tr key={k} className={k % 2 ? "bg-slide" : "bg-white"}>
              {r.map((c, m) => (
                <td key={m} className={`px-4 py-3 align-top ${m === 0 ? "font-semibold text-ink" : "text-ink/85"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Suite d'étapes : frise verticale numérotée (une étape par ligne, reliées par un trait). */
function Steps({ steps }: { steps: string[] }) {
  return (
    <ol aria-label="Étapes">
      {steps.map((st, k) => (
        <li key={k} className="relative flex gap-4 pb-4 last:pb-0">
          {k < steps.length - 1 && (
            <span aria-hidden className="absolute left-[13px] top-7 bottom-0 w-0.5 bg-eosin/40" />
          )}
          <span className="relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-eosin text-sm font-bold text-ink">
            {k + 1}
          </span>
          <p className="min-w-0 flex-1 pt-0.5 leading-relaxed text-ink/90">{st}</p>
        </li>
      ))}
    </ol>
  );
}

type AnswerItem = { text: string; n?: number };

/** Découpe une réponse en points lisibles : (1) … (2) …, sinon une phrase par ligne. */
function splitAnswer(raw: string): AnswerItem[] {
  const text = plain(raw);
  const sentences = (t: string) => t.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý(])/).map((x) => x.trim()).filter(Boolean);
  const first = text.search(/\(\d{1,2}\)/);
  if (first >= 0 && (text.match(/\(\d{1,2}\)/g) ?? []).length >= 2) {
    const items: AnswerItem[] = [];
    const intro = text.slice(0, first).trim();
    if (intro) items.push({ text: intro });
    const parts = text.slice(first).split(/\(\d{1,2}\)\s*/).map((x) => x.trim()).filter(Boolean);
    parts.forEach((part, i) => {
      const [head, ...tail] = sentences(part.replace(/\s*[;]\s*$/, ""));
      items.push({ text: (head ?? part).replace(/[;.]$/, ""), n: i + 1 });
      tail.forEach((t) => items.push({ text: t }));
    });
    return items;
  }
  const sents = sentences(text);
  return (sents.length > 1 ? sents : [text]).map((t) => ({ text: t }));
}

function AnswerLine({ item }: { item: AnswerItem }) {
  const arrows = (item.text.match(/→/g) ?? []).length;
  let body: ReactNode;
  if (arrows >= 2) {
    const sp = splitLabel(item.text);
    const chainText = sp && (sp.text.match(/→/g) ?? []).length >= 2 ? sp.text : item.text;
    const label = sp && chainText === sp.text ? sp.label : "";
    const steps = chainText.split("→").map((x) => plain(x).replace(/[.;]$/, "")).filter(Boolean);
    body = (
      <div>
        {label && <p className="mb-3 font-semibold text-ink">{label}</p>}
        <Steps steps={steps} />
      </div>
    );
  } else {
    const sp = splitLabel(item.text);
    body = sp ? (
      <p className="leading-relaxed text-ink/85">
        <strong className="font-semibold text-ink">{sp.label}</strong>
        <span className="text-ink/60"> : </span>
        {sp.text}
      </p>
    ) : (
      <p className="leading-relaxed text-ink/85">{item.text}</p>
    );
  }
  return (
    <li className="flex gap-3">
      {item.n !== undefined ? (
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-eosin text-xs font-bold text-ink">
          {item.n}
        </span>
      ) : (
        <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-eosin" />
      )}
      <div className="min-w-0 flex-1">{body}</div>
    </li>
  );
}

function QaCard({ n, q, answers }: { n: number; q: string; answers: string[] }) {
  const items = answers.flatMap(splitAnswer);
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="flex gap-3 bg-ink px-5 py-4 text-white">
        <span className="label shrink-0 pt-0.5 text-white/60">Q{n}</span>
        <p className="font-semibold leading-snug">{q}</p>
      </div>
      {items.length > 0 && (
        <div className="bg-slide px-5 py-4">
          <p className="label mb-3 text-muted">Réponse attendue</p>
          <ul className="space-y-2.5">
            {items.map((it, i) => (
              <AnswerLine key={i} item={it} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function groupQa(blocks: Block[]): Block[] {
  const out: Block[] = [];
  let n = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === "q") {
      const answers: string[] = [];
      while (i + 1 < blocks.length && blocks[i + 1].kind === "r") {
        i++;
        answers.push((blocks[i] as { text: string }).text);
      }
      out.push({ kind: "qa", n: ++n, q: b.text, answers });
    } else if (b.kind === "r") {
      out.push({ kind: "p", text: b.text });
    } else out.push(b);
  }
  return out;
}

/** Découpe en sous-parties : une ligne « Titre : » seule ouvre un encadré qui regroupe les lignes suivantes. */
function renderBlocks(input: Block[]): ReactNode[] {
  const blocks = groupQa(input);
  const groups: { title?: string; items: Block[] }[] = [{ items: [] }];
  for (const b of blocks) {
    if (b.kind === "sub") groups.push({ title: b.text, items: [] });
    else groups[groups.length - 1].items.push(b);
  }
  return groups
    .filter((g) => g.title || g.items.length > 0)
    .map((g, i) =>
      g.title ? (
        <div key={i} className="rounded-xl bg-slide p-4 sm:p-5">
          <p className="mb-3 flex items-center gap-2.5 font-semibold text-ink">
            <span aria-hidden className="h-4 w-1 rounded-full bg-eosin" />
            {g.title}
          </p>
          <div className="space-y-3">{renderFlat(g.items)}</div>
        </div>
      ) : (
        <div key={i} className="space-y-4">
          {renderFlat(g.items)}
        </div>
      ),
    );
}

function renderFlat(blocks: Block[]): ReactNode[] {
  const out: ReactNode[] = [];
  let bullets: string[] = [];
  let rows: { label: string; text: string }[] = [];

  const flush = (key: string) => {
    if (bullets.length > 0) {
      out.push(
        <ul key={`ul${key}`} className="space-y-2.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-3 leading-relaxed">
              <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-eosin" />
              <span className="text-ink/85">
                <Inline text={b} />
              </span>
            </li>
          ))}
        </ul>,
      );
      bullets = [];
    }
    if (rows.length > 0) {
      out.push(
        <dl key={`dl${key}`} className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {rows.map((r, i) => (
            <div key={i} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr] sm:gap-5">
              <dt className="font-semibold text-ink">{r.label}</dt>
              <dd className="leading-relaxed text-ink/85">
                <Inline text={r.text} />
              </dd>
            </div>
          ))}
        </dl>,
      );
      rows = [];
    }
  };

  blocks.forEach((b, i) => {
    if (b.kind === "bullet") {
      if (rows.length) flush(`a${i}`);
      bullets.push(b.text);
      return;
    }
    if (b.kind === "row") {
      if (bullets.length) flush(`b${i}`);
      rows.push({ label: b.label, text: b.text });
      return;
    }
    flush(`c${i}`);
    switch (b.kind) {
      case "p":
        out.push(
          <p key={i} className="leading-relaxed text-ink/85">
            <Inline text={b.text} />
          </p>,
        );
        break;
      case "sub":
        out.push(
          <p key={i} className="label mt-2 text-muted">
            {b.text}
          </p>,
        );
        break;
      case "call":
        out.push(<Callout key={i} tone={b.tone} text={b.text} />);
        break;
      case "chain":
        out.push(
          <div key={i} className="rounded-xl border border-line bg-white p-5">
            {b.label && <p className="mb-4 font-semibold text-ink">{b.label}</p>}
            <Steps steps={b.steps} />
          </div>,
        );
        break;
      case "qa":
        out.push(<QaCard key={i} n={b.n} q={b.q} answers={b.answers} />);
        break;
      case "table":
        out.push(<Table key={i} rows={b.rows} />);
        break;
    }
  });
  flush("end");
  return out;
}

const slug = (s: string, i: number) => `fiche-${i}-${s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`;
const NUM = /^((?:[IVX]+|\d+)\.)\s*/;

export function FicheView({ text }: { text: string }) {
  const { title, meta, sections } = parse(text);
  const toc = sections.filter((s) => s.title);

  return (
    <article>
      <header className="rounded-2xl bg-ink px-6 py-7 text-white sm:px-10 sm:py-9">
        <p className="label text-white/60">Fiche de révision</p>
        <h3 className="display mt-2 text-3xl leading-tight sm:text-4xl">
          {title.replace(/^FICHE DE R[ÉE]VISION\s*[—-]\s*/i, "") || "Fiche de révision"}
        </h3>
        {meta && <p className="mt-3 text-white/70">{meta}</p>}
        {toc.length > 1 && (
          <nav aria-label="Sommaire" className="mt-6 flex flex-wrap gap-2">
            {toc.map((s, i) => (
              <button
                key={i}
                onClick={() => document.getElementById(slug(s.title, i))?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white/90 transition hover:bg-white hover:text-ink"
              >
                {s.title.replace(NUM, "").replace(/^(.{26}).+$/, "$1…")}
              </button>
            ))}
          </nav>
        )}
      </header>

      <div className="mt-6 space-y-6">
        {sections.map((s, i) => {
          const upper = s.title.toUpperCase();
          const key = slug(s.title, toc.indexOf(s));
          const must = upper.includes("À SAVOIR") || upper.includes("A SAVOIR");
          const essence = upper.includes("ESSENTIEL");
          const ultra = upper.includes("ULTRA");
          const num = s.title.match(NUM)?.[1];
          const name = s.title.replace(NUM, "");

          if (essence) {
            const [first, ...rest] = s.blocks;
            const lead = first && (first.kind === "p" || first.kind === "bullet") ? first.text : null;
            return (
              <section key={i} id={key} className="scroll-mt-24 rounded-2xl border border-line bg-white p-6 sm:p-8">
                <p className="label text-muted">{name}</p>
                {lead && (
                  <p className="display mt-3 text-2xl leading-snug text-ink sm:text-3xl">
                    <Inline text={lead} />
                  </p>
                )}
                <div className="mt-5 space-y-3">{renderBlocks(lead ? rest : s.blocks)}</div>
              </section>
            );
          }

          if (must) {
            return (
              <section key={i} id={key} className="scroll-mt-24 rounded-2xl border-2 border-[#f0c96a] bg-[#fff8e6] p-6 sm:p-8">
                <h4 className="flex items-center gap-2 text-xl font-bold text-ink">
                  <span aria-hidden style={{ color: "#9a6b00" }}>
                    ★
                  </span>
                  {name}
                </h4>
                <div className="mt-5 space-y-3">{renderBlocks(s.blocks)}</div>
              </section>
            );
          }

          if (ultra) {
            return (
              <section key={i} id={key} className="scroll-mt-24 rounded-2xl bg-eosin-soft p-6 sm:p-8">
                <h4 className="text-xl font-bold text-ink">{name}</h4>
                <div className="mt-5 space-y-3">{renderBlocks(s.blocks)}</div>
              </section>
            );
          }

          return (
            <section key={i} id={s.title ? key : undefined} className="scroll-mt-24 rounded-2xl border border-line bg-white p-6 sm:p-8">
              {s.title && (
                <h4 className="flex items-center gap-3 border-b border-line pb-4 text-xl font-bold text-ink">
                  {num && (
                    <span className="grid h-8 min-w-8 place-items-center rounded-full bg-ink px-2 text-sm font-bold text-white">
                      {num.replace(".", "")}
                    </span>
                  )}
                  {name}
                </h4>
              )}
              <div className={`${s.title ? "mt-5" : ""} space-y-4`}>{renderBlocks(s.blocks)}</div>
            </section>
          );
        })}
      </div>
    </article>
  );
}
