// A verbatim quote in its context. The law speaks in Literata (English, as published); the quoted words are marked
// with the highlighter, the context around them stays plain. Under it: where it is from, a link to the source, and
// the browser's own check of the citation (the section's sha256 and the quote at its offsets).
import { type Citation, sectionKey } from "@mrn/core";
import { useState } from "react";
import { useSections, useSnapshot } from "../data.tsx";
import { hostOf, quoteView } from "../lib/quotes.ts";
import { useApp } from "../state.tsx";
import { ExternalLink } from "./ui.tsx";

export function Quote({ citation, context = 240 }: { citation: Citation; context?: number }) {
  const { t } = useApp();
  const snapshot = useSnapshot();
  const { sections, error } = useSections();
  const [whole, setWhole] = useState(false);
  const key = sectionKey(citation.source, citation.section);
  const source = snapshot.sources[citation.source];
  const info = snapshot.sections[key];
  const section = sections?.[key];
  const view = section ? quoteView(citation, section, whole ? null : context, source?.format ?? "html") : null;
  return (
    <figure className="quote" data-testid="quote" data-verified={view ? String(view.verified) : undefined}>
      <blockquote lang="en" className={whole ? "quote-text quote-whole" : "quote-text"}>
        {view ? (
          <>
            {view.cutBefore ? "… " : ""}
            {view.before}
            <mark>{view.mark}</mark>
            {view.after}
            {view.cutAfter ? " …" : ""}
          </>
        ) : (
          <mark>{citation.quote}</mark>
        )}
      </blockquote>
      <figcaption className="quote-meta">
        <span className="quote-ref" lang="en">
          {source?.shortTitle ?? citation.source}, {info?.ref ?? citation.section}
        </span>
        <span className="quote-actions">
          {source ? (
            <ExternalLink href={source.link}>
              {t("quote.source", { title: source.shortTitle, host: hostOf(source.link) })}
            </ExternalLink>
          ) : null}
          {view && (view.cutBefore || view.cutAfter || whole) ? (
            <button type="button" className="text-button" onClick={() => setWhole(!whole)}>
              {whole ? t("quote.less") : t("quote.whole")}
            </button>
          ) : null}
        </span>
        {view ? (
          <span className={view.verified ? "quote-check" : "quote-check quote-fail"}>
            {view.verified
              ? t("quote.verified", {
                  hash: citation.sha256.slice(0, 12),
                  start: citation.start,
                  end: citation.end,
                })
              : t("quote.failed")}
          </span>
        ) : (
          <span className="quote-check">{error ? t("quote.error", { message: error }) : t("quote.loading")}</span>
        )}
      </figcaption>
    </figure>
  );
}

/** Quotes, each section once: the first quote shown in full, the rest behind a disclosure when `fold` is set. */
export function Quotes({ citations, fold = false }: { citations: readonly Citation[]; fold?: boolean }) {
  const { t } = useApp();
  if (citations.length === 0) return null;
  const [first, ...rest] = citations;
  if (!fold || rest.length === 0) {
    return (
      <div className="quotes">
        {citations.map((c) => (
          <Quote key={`${c.source}/${c.section}/${c.start}`} citation={c} />
        ))}
      </div>
    );
  }
  return (
    <div className="quotes">
      {first ? <Quote citation={first} /> : null}
      <details className="more-quotes">
        <summary>{t("checklist.quotes", { n: rest.length })}</summary>
        {rest.map((c) => (
          <Quote key={`${c.source}/${c.section}/${c.start}`} citation={c} />
        ))}
      </details>
    </div>
  );
}
