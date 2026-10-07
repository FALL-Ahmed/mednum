"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Rendu des réponses de Dr. Ahmed (listes, gras, tableaux, titres, code). */
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: (p) => <p className="leading-relaxed [&:not(:first-child)]:mt-3" {...p} />,
        ul: (p) => <ul className="mt-3 list-disc space-y-1.5 ps-6 marker:text-muted" {...p} />,
        ol: (p) => <ol className="mt-3 list-decimal space-y-1.5 ps-6 marker:text-muted" {...p} />,
        li: (p) => <li className="leading-relaxed" {...p} />,
        strong: (p) => <strong className="font-bold text-ink" {...p} />,
        h1: (p) => <h3 className="display mt-5 text-xl text-ink" {...p} />,
        h2: (p) => <h3 className="display mt-5 text-xl text-ink" {...p} />,
        h3: (p) => <h4 className="mt-4 text-lg font-bold text-ink" {...p} />,
        h4: (p) => <h4 className="mt-4 font-bold text-ink" {...p} />,
        blockquote: (p) => <blockquote className="mt-3 border-s-4 border-eosin ps-4 text-ink/80" {...p} />,
        hr: () => <hr className="my-4 border-line" />,
        a: (p) => <a className="font-semibold underline decoration-eosin decoration-2 underline-offset-2" target="_blank" rel="noopener noreferrer" {...p} />,
        code: (p) => <code className="rounded bg-slide px-1.5 py-0.5 font-mono text-[0.9em]" {...p} />,
        pre: (p) => <pre className="mt-3 overflow-x-auto rounded-xl bg-ink p-4 text-sm text-white" {...p} />,
        table: (p) => (
          <div className="mt-3 overflow-x-auto rounded-xl border border-line">
            <table className="w-full border-collapse text-start text-[15px]" {...p} />
          </div>
        ),
        thead: (p) => <thead className="bg-slide" {...p} />,
        th: (p) => <th className="border-b border-line px-3 py-2 font-bold text-ink" {...p} />,
        td: (p) => <td className="border-b border-line px-3 py-2 align-top" {...p} />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
