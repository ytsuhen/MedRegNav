// The margin note beside the map: for a requirement, how to comply (requirement → document or evidence → standard →
// who → from when) with its legal basis quoted; for a rule result, what decided it; by default, the example the
// device came from (quoted from the guidance, with how we read it) and how to read the map.
import type { DecisiveUnknown, Example, Profile } from "@mrn/core";
import { type Screen, useScreen, useSnapshot } from "../data.tsx";
import { formatDate } from "../lib/dates.ts";
import type { LeafView } from "../lib/view.ts";
import { useApp } from "../state.tsx";
import { RuleExplanation } from "./Explain.tsx";
import { ProposalSection } from "./Proposal.tsx";
import { Quote, Quotes } from "./Quote.tsx";
import { ExternalLink, tx, valueLabel } from "./ui.tsx";

/** Opens the attribute's editor above the map and brings it into view. */
export function useAsk(): (attr: string) => void {
  const { dispatch } = useApp();
  return (attr) => {
    dispatch({ type: "edit", attr });
    requestAnimationFrame(() => {
      const editor = document.getElementById("attribute-editor");
      editor?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      editor?.querySelector<HTMLInputElement>("input:checked, input")?.focus({ preventScroll: true });
    });
  };
}

export function QuestionList({ questions }: { questions: readonly DecisiveUnknown[] }) {
  const snapshot = useSnapshot();
  const { state } = useApp();
  const ask = useAsk();
  if (questions.length === 0) return null;
  return (
    <ul className="question-list">
      {questions.map((q) => {
        const a = snapshot.model.registry.attributes.find((x) => x.id === q.attr);
        return a ? (
          <li key={q.attr}>
            <button type="button" className="question-button" onClick={() => ask(q.attr)}>
              {tx(a.question, state.lang)}
            </button>
          </li>
        ) : null;
      })}
    </ul>
  );
}

/** The attributes behind a result, as small chips linked to the map's highlighting. */
export function SupportList({ support, profile }: { support: readonly string[]; profile: Profile }) {
  const snapshot = useSnapshot();
  const { state, t, hover } = useApp();
  const ask = useAsk();
  const attributes = support.flatMap((id) => snapshot.model.registry.attributes.find((a) => a.id === id) ?? []);
  if (attributes.length === 0) return null;
  return (
    <ul className="support-list">
      {attributes.map((a) => {
        const v = profile[a.id] ?? null;
        const value = valueLabel(a, v, state.lang, t);
        return (
          <li key={a.id}>
            <button
              type="button"
              className="chip chip-small"
              data-known={v !== null || undefined}
              data-marked={(state.hover?.kind === "attr" && state.hover.id === a.id) || undefined}
              onMouseEnter={() => hover({ kind: "attr", id: a.id })}
              onMouseLeave={() => hover(null)}
              onFocus={() => hover({ kind: "attr", id: a.id })}
              onBlur={() => hover(null)}
              onClick={() => ask(a.id)}
            >
              {t("chip.text", { label: tx(a.label, state.lang), value })}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function statusLine(leaf: LeafView, t: ReturnType<typeof useApp>["t"], lang: "uk" | "en"): string {
  const date = (d: string | null) => (d ? formatDate(d, lang) : "");
  if (leaf.state === "none") return t("applies.false");
  if (leaf.state === "open") return t("applies.null");
  const when =
    leaf.state === "upcoming"
      ? t("timing.upcoming", { date: date(leaf.from) })
      : leaf.state === "expired"
        ? t("timing.expired", { date: date(leaf.until) })
        : t("timing.in-force", { date: date(leaf.from) });
  return `${t("applies.true")}, ${when}.`;
}

function ObligationCard({ screen, id }: { screen: Screen; id: string }) {
  const snapshot = useSnapshot();
  const { state, t } = useApp();
  const o = snapshot.model.obligations.find((x) => x.id === id);
  const leaf = screen.view.leaves.get(`o.${id}`);
  if (!o || !leaf) return null;
  const standards = o.how.standards.flatMap((s) => snapshot.model.standards.find((x) => x.id === s) ?? []);
  const questions = screen.nav.questions.filter((q) => leaf.support.includes(q.attr));
  return (
    <article className="card-body" data-testid="obligation-card" data-state={leaf.state}>
      <h2 className="card-title">{tx(o.title, state.lang)}</h2>
      <p className="card-status" data-state={leaf.state}>
        {statusLine(leaf, t, state.lang)}
      </p>
      {leaf.state === "open" ? <QuestionList questions={questions} /> : null}
      <p className="card-summary">{tx(o.summary, state.lang)}</p>
      <section>
        <h3>{t("card.how")}</h3>
        <dl className="how">
          <dt>{t("card.deliverable")}</dt>
          <dd>{tx(o.how.deliverable, state.lang)}</dd>
          <dt>{t("card.standards")}</dt>
          <dd>
            {standards.length === 0 ? (
              t("card.standards.none")
            ) : (
              <ul className="standards">
                {standards.map((s) => (
                  <li key={s.id}>
                    <span className="standard-number">{s.number}</span>{" "}
                    <span className="standard-edition">{t("standard.edition", { edition: s.edition })}</span>
                    <span className="standard-purpose">{tx(s.purpose, state.lang)}</span>
                    {s.note ? <span className="standard-note">{tx(s.note, state.lang)}</span> : null}
                    <ExternalLink href={s.link}>{t("standard.catalogue")}</ExternalLink>
                  </li>
                ))}
              </ul>
            )}
          </dd>
          <dt>{t("card.who")}</dt>
          <dd>{tx(o.how.who, state.lang)}</dd>
          <dt>{t("card.when")}</dt>
          <dd>
            {formatDate(o.effective.from, state.lang)}
            {o.effective.until ? `, ${t("leaf.until", { date: formatDate(o.effective.until, state.lang) })}` : ""}
            <details className="date-basis">
              <summary>{t("card.dateBasis")}</summary>
              <Quotes citations={o.effective.citations} />
            </details>
          </dd>
        </dl>
      </section>
      {leaf.support.length > 0 ? (
        <section>
          <h3>{t("card.dependsOn")}</h3>
          <SupportList support={leaf.support} profile={state.profile} />
        </section>
      ) : null}
      <section>
        <h3>{t("card.basis")}</h3>
        <Quotes citations={o.citations} />
      </section>
      {o.guidance && o.guidance.length > 0 ? (
        <section>
          <h3>{t("card.guidance")}</h3>
          <Quotes citations={o.guidance} />
        </section>
      ) : null}
      {standards.length > 0 ? <p className="card-footnote">{t("standard.metadata")}</p> : null}
    </article>
  );
}

function RuleCard({ screen, id }: { screen: Screen; id: string }) {
  const snapshot = useSnapshot();
  const { state, t } = useApp();
  const rule = snapshot.model.rules.find((r) => r.id === id);
  const result = screen.nav.results[id];
  const leaf = screen.view.leaves.get(`r.${id}`);
  if (!rule || !result) return null;
  const labels = (ids: readonly string[]) =>
    ids.map((o) => rule.outcomes.find((x) => x.id === o)?.label[state.lang] ?? o).join(", ");
  const questions = screen.nav.questions.filter((q) => q.affects.includes(id));
  const check = leaf?.check ?? null;
  const checkQuestions = check ? screen.nav.guidanceQuestions.filter((q) => result.support.includes(q.attr)) : [];
  return (
    <article className="card-body" data-testid="rule-card">
      <h2 className="card-title">{tx(rule.title, state.lang)}</h2>
      <p className="card-result" data-status={result.status}>
        {result.status === "not-applicable"
          ? t("rule.notApplicable")
          : result.status === "determined"
            ? labels([result.value ?? ""])
            : t("ladder.oneOf", { list: labels(result.possible) })}
      </p>
      {check ? (
        <p className="card-status" data-check={check.status}>
          {check.status === "consistent"
            ? t("cross.consistent", { actual: labels([check.actual ?? ""]) })
            : check.status === "inconsistent"
              ? t("cross.inconsistent", {
                  actual: labels([check.actual ?? ""]),
                  expected: labels([check.expected ?? ""]),
                })
              : check.status === "incomplete"
                ? t("cross.incomplete")
                : t("rule.notApplicable")}
        </p>
      ) : null}
      {rule.effective && !result.inForce && rule.role !== "hypothetical" ? (
        <p className="card-status" data-state="upcoming">
          {t("rule.upcoming", { date: formatDate(rule.effective.from, state.lang) })}
        </p>
      ) : null}
      {questions.length > 0 ? (
        <section>
          <h3>{t("rule.questions")}</h3>
          <QuestionList questions={questions} />
        </section>
      ) : null}
      {checkQuestions.length > 0 ? (
        <section>
          <h3>{t("cross.questions")}</h3>
          <QuestionList questions={checkQuestions} />
        </section>
      ) : null}
      <p className="card-summary">{tx(rule.summary, state.lang)}</p>
      <RuleExplanation rule={rule} result={result} />
      {state.proposals ? <ProposalSection rule={rule} screen={screen} /> : null}
      <p className="card-footnote">
        {t("rule.draft", { revision: rule.metadata.revision })}
        {rule.effective ? ` ${t("rule.from", { date: formatDate(rule.effective.from, state.lang) })}.` : ""}
      </p>
    </article>
  );
}

function sameProfile(a: Profile, b: Profile): boolean {
  const known = (p: Profile) =>
    Object.entries(p)
      .filter(([, v]) => v !== null && v !== undefined)
      .sort(([x], [y]) => x.localeCompare(y));
  return JSON.stringify(known(a)) === JSON.stringify(known(b));
}

export function deviceName(
  example: Example | undefined,
  profile: Profile,
  t: ReturnType<typeof useApp>["t"],
  lang: "uk" | "en",
) {
  if (!example) return t("device.custom");
  const name = tx(example.title, lang);
  return sameProfile(example.profile, profile) ? name : t("device.modified", { name });
}

function Legend() {
  const { t } = useApp();
  const snapshot = useSnapshot();
  const proposals = snapshot.model.rules.some((r) => r.role === "hypothetical");
  const line = (kind: string) => (
    <svg className={`legend-line legend-${kind}`} viewBox="0 0 40 10" aria-hidden="true">
      <path d="M2 5 H38" />
    </svg>
  );
  return (
    <section className="legend" aria-labelledby="legend-heading">
      <h3 id="legend-heading">{t("legend.heading")}</h3>
      <ul>
        <li>
          {line("ink")}
          {t("legend.ink")}
        </li>
        <li>
          {line("pencil")}
          {t("legend.pencil")}
        </li>
        <li>
          {line("dotted")}
          {t("legend.dotted")}
        </li>
        <li>
          <span className="legend-marker" aria-hidden="true">
            Aa
          </span>
          {t("legend.marker")}
        </li>
        {proposals ? (
          <li>
            {line("redpen")}
            {t("legend.redpen")}
          </li>
        ) : null}
      </ul>
      <p className="card-footnote">{t("help.text")}</p>
    </section>
  );
}

function DeviceCard({ screen }: { screen: Screen }) {
  const snapshot = useSnapshot();
  const { state, t } = useApp();
  const example = snapshot.examples.find((e) => e.id === state.example);
  const outcome = (rule: string, id: string) =>
    snapshot.model.rules.find((r) => r.id === rule)?.outcomes.find((o) => o.id === id)?.label[state.lang] ?? id;
  const modified = example ? !sameProfile(example.profile, state.profile) : false;
  const matches = example?.expected.every((e) => screen.nav.results[e.rule]?.value === e.outcome) ?? false;
  return (
    <article className="card-body" data-testid="device-card">
      <h2 className="card-title">{example ? t("example.heading") : t("device.custom")}</h2>
      {example ? (
        <>
          <p className="card-lead">{tx(example.title, state.lang)}</p>
          <Quote citation={example.source} context={320} />
          {example.also?.map((c) => (
            <Quote key={`${c.section}/${c.start}`} citation={c} />
          ))}
          <section>
            <h3>{t("example.reading")}</h3>
            <p>{tx(example.interpretation, state.lang)}</p>
            <p className="card-status">
              {t("example.expected", {
                list: [...new Set(example.expected.map((e) => outcome(e.rule, e.outcome)))].join(", "),
              })}{" "}
              {modified ? t("example.differs") : matches ? t("example.matches") : ""}
            </p>
          </section>
        </>
      ) : (
        <p className="card-summary">{t("app.lede")}</p>
      )}
      <Legend />
    </article>
  );
}

export function Card() {
  const screen = useScreen();
  const { state, t, select } = useApp();
  if (!screen) return null;
  const sel = state.selection;
  const sheet = sel !== null && sel.kind !== "device";
  return (
    <aside className="card" aria-label={t("card.label")} data-testid="card" data-sheet={sheet || undefined}>
      {sheet ? (
        <button type="button" className="card-close" onClick={() => select(null)}>
          {t("card.close")}
        </button>
      ) : null}
      {sel?.kind === "obligation" ? (
        <ObligationCard key={sel.id} screen={screen} id={sel.id} />
      ) : sel?.kind === "rule" ? (
        <RuleCard key={sel.id} screen={screen} id={sel.id} />
      ) : (
        <DeviceCard screen={screen} />
      )}
    </aside>
  );
}
