// "If the proposal were adopted", in red pen, on the card of a rule that a proposed revision would replace (and under
// that rule's result in the checklist): the device's result under the proposal and what decided it (the proposal's
// own words quoted), what would change in its requirements, and the comparison precomputed at build time — the
// synthetic cohort's transition matrix with its coherence conditions, and the MDCG examples. Also the words for what
// the proposal would make of one leaf, shared by the map and the checklist.
import { type DeviceIr, NO_OUTCOME, type RuleResult } from "@mrn/core";
import { useId } from "react";
import { type Screen, useSnapshot } from "../data.tsx";
import { formatDate } from "../lib/dates.ts";
import type { LeafState, LeafView } from "../lib/view.ts";
import { useApp } from "../state.tsx";
import { Heading, type HeadingLevel, RuleExplanation } from "./Explain.tsx";
import { QuestionList } from "./Questions.tsx";
import { Quotes } from "./Quote.tsx";
import { tx } from "./ui.tsx";

const show = (id: string) => (id === NO_OUTCOME ? "—" : id);

/** What the proposal would make of a leaf, in words ("under the proposal: Class IIa", "… would not apply"). */
export function proposalWords(leaf: LeafView, t: ReturnType<typeof useApp>["t"], lang: "uk" | "en"): string | null {
  const p = leaf.proposal;
  if (!p) return null;
  const what =
    leaf.kind === "rule" && p.state !== "none" && p.outcomes.length > 0
      ? p.outcomes.map((o) => tx(o, lang)).join(", ")
      : p.state === "upcoming" && leaf.from
        ? t("proposal.state.upcoming", { date: formatDate(leaf.from, lang) })
        : t(`proposal.state.${p.state === "upcoming" ? "in-force" : p.state}`);
  return t("proposal.leaf", { what });
}

export function ProposalSection({
  rule,
  screen,
  level = 3,
  fold = false,
}: {
  rule: DeviceIr;
  screen: Screen;
  /** The level of the section's heading; its parts are one level below. */
  level?: Exclude<HeadingLevel, 6>;
  /** Fold "what decided it" away (the checklist, where the rule's own explanation is folded too). */
  fold?: boolean;
}) {
  const snapshot = useSnapshot();
  const { t, state } = useApp();
  const headingId = useId();
  const revision = snapshot.model.rules.find((r) => r.revises === rule.id);
  const result: RuleResult | undefined = screen.nav.proposal?.results[rule.id];
  if (!revision || !result) return null;
  const sub = (level + 1) as HeadingLevel;
  const labels = (ids: readonly string[]) =>
    ids.map((o) => revision.outcomes.find((x) => x.id === o)?.label[state.lang] ?? o).join(", ");
  const nowWords = (s: LeafState) => t(`proposal.now.${s}`);
  const thenWords = (s: LeafState, from: string | null) =>
    s === "upcoming" && from
      ? t("proposal.state.upcoming", { date: formatDate(from, state.lang) })
      : t(`proposal.state.${s === "upcoming" ? "in-force" : s}`);
  const changed = [...screen.view.leaves.values()].filter((l) => l.kind === "obligation" && l.proposal);
  const questions = screen.nav.proposal?.questions.filter((q) => q.affects.includes(rule.id)) ?? [];
  const comparison = snapshot.whatIf.results.find((w) => w.revises === rule.id);
  const config = snapshot.whatIf.file.proposals.find((p) => p.revision === revision.id);
  return (
    <section className="proposal" data-testid="proposal" aria-labelledby={headingId}>
      <Heading level={level} id={headingId}>
        {t("proposal.heading")}
      </Heading>
      <p className="card-footnote">{t("proposal.title", { title: tx(revision.title, state.lang) })}</p>
      <p className="card-result">
        {result.status === "not-applicable"
          ? t("rule.notApplicable")
          : result.status === "determined"
            ? labels([result.value ?? ""])
            : t("ladder.oneOf", { list: labels(result.possible) })}
      </p>
      {questions.length > 0 ? (
        <>
          <Heading level={sub}>{t("proposal.questions")}</Heading>
          <QuestionList questions={questions} />
        </>
      ) : null}
      {fold ? (
        result.status !== "undetermined" ? (
          <details className="check-quotes">
            <summary>{t("rule.decided")}</summary>
            <RuleExplanation rule={revision} result={result} level={sub} />
          </details>
        ) : null
      ) : (
        <RuleExplanation rule={revision} result={result} level={sub} />
      )}
      <Heading level={sub}>{t("proposal.changes")}</Heading>
      {changed.length === 0 ? (
        <p>{t("proposal.changes.none")}</p>
      ) : (
        <ul className="proposal-changes">
          {changed.map((l) => (
            <li key={l.key}>
              <span>{tx(l.title, state.lang)}</span>{" "}
              <span className="proposal-change">
                {t("proposal.change", {
                  before: nowWords(l.state),
                  after: l.proposal ? thenWords(l.proposal.state, l.from) : "",
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {comparison ? (
        <>
          <Heading level={sub}>{t("proposal.cohort")}</Heading>
          <p>
            {t("proposal.cohort.summary", {
              n: comparison.matrix.cohort,
              changed: comparison.matrix.changed,
              up: comparison.matrix.up,
              down: comparison.matrix.down,
            })}
          </p>
          <table className="matrix" data-testid="transition-matrix">
            <caption>{t("proposal.matrix.caption")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("proposal.matrix.corner")}</th>
                {comparison.matrix.outcomes.map((o) => (
                  <th key={o} scope="col">
                    {show(o)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.matrix.outcomes
                .filter((from) => Object.keys(comparison.matrix.cells[from] ?? {}).length > 0)
                .map((from) => (
                  <tr key={from}>
                    <th scope="row">{show(from)}</th>
                    {comparison.matrix.outcomes.map((to) => {
                      const n = comparison.matrix.cells[from]?.[to];
                      return (
                        <td
                          key={to}
                          data-diagonal={from === to || undefined}
                          data-changed={(from !== to && n !== undefined) || undefined}
                          data-empty={!n || undefined}
                        >
                          {n ?? "·"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="card-footnote">{t("proposal.cohort.note")}</p>
          {config && config.constraints.length > 0 ? (
            <details className="more-quotes">
              <summary>{t("proposal.constraints", { n: config.constraints.length })}</summary>
              {config.constraints.map((c) => (
                <div key={JSON.stringify(c.when)} className="constraint">
                  <p>{tx(c.why, state.lang)}</p>
                  <Quotes citations={c.citations} />
                </div>
              ))}
            </details>
          ) : null}
          <Heading level={sub}>{t("proposal.examples")}</Heading>
          <ul className="proposal-examples">
            {comparison.examples
              .filter((e) => !(e.from.length === 1 && e.from[0] === NO_OUTCOME))
              .map((e) => {
                const example = snapshot.examples.find((x) => x.id === e.example);
                const fmt = (s: string[]) => (s.length === 1 ? show(s[0] ?? "") : `{${s.map(show).join(", ")}}`);
                return (
                  <li key={e.example} data-changed={fmt(e.from) !== fmt(e.to) || undefined}>
                    <span>{example ? tx(example.title, state.lang) : e.example}</span>{" "}
                    <span className="proposal-change">
                      {fmt(e.from)} → {fmt(e.to)}
                    </span>
                    {e.implied.length > 0 ? (
                      <span className="proposal-implied">
                        {t("proposal.examples.implied", {
                          list: e.implied
                            .map(
                              (a) => snapshot.model.registry.attributes.find((x) => x.id === a)?.label[state.lang] ?? a,
                            )
                            .join(", "),
                        })}
                      </span>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
