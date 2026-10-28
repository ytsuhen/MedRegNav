// The checklist: everything the map shows, as a plain document for phones and screen readers. Rule results with what
// decided them, the open questions with their answers inline, then each branch's requirements with how to comply and
// their quotes; with proposals on, what the proposal would change, in red pen, and the proposal's section under the
// result of the rule it would replace. Built from the same screen view as the map.
import type { AttributeValue } from "@mrn/core";
import type { Screen } from "../data.tsx";
import { useSnapshot } from "../data.tsx";
import { formatDate } from "../lib/dates.ts";
import type { BranchView, LeafView } from "../lib/view.ts";
import { useApp } from "../state.tsx";
import { RuleExplanation } from "./Explain.tsx";
import { ProposalSection, proposalWords } from "./Proposal.tsx";
import { Quotes } from "./Quote.tsx";
import { AnswerControl, ruleWords, tx } from "./ui.tsx";

function ProposalLine({ leaf }: { leaf: LeafView }) {
  const { t, state } = useApp();
  const words = proposalWords(leaf, t, state.lang);
  return words ? (
    <p className="check-proposal" data-testid={`proposal-${leaf.key}`}>
      {words}
    </p>
  ) : null;
}

function statusWords(leaf: LeafView, t: ReturnType<typeof useApp>["t"], lang: "uk" | "en"): string {
  const date = (d: string | null) => (d ? formatDate(d, lang) : "");
  if (leaf.state === "open") return t("applies.null");
  if (leaf.state === "none") return t("applies.false");
  if (leaf.state === "upcoming") return `${t("applies.true")}, ${t("timing.upcoming", { date: date(leaf.from) })}`;
  if (leaf.state === "expired") return `${t("applies.true")}, ${t("timing.expired", { date: date(leaf.until) })}`;
  return `${t("applies.true")}, ${t("timing.in-force", { date: date(leaf.from) })}`;
}

function ObligationItem({ leaf }: { leaf: LeafView }) {
  const snapshot = useSnapshot();
  const { t, state } = useApp();
  const o = snapshot.model.obligations.find((x) => x.id === leaf.id);
  if (!o) return null;
  const standards = o.how.standards.flatMap((s) => snapshot.model.standards.find((x) => x.id === s) ?? []);
  return (
    <li
      className="check-item"
      data-state={leaf.state}
      data-proposal={leaf.proposal ? "changed" : undefined}
      data-testid={`check-${leaf.key}`}
    >
      <span className="leaf-mark" aria-hidden="true" />
      <div className="check-body">
        <h4 className="check-title">{tx(o.title, state.lang)}</h4>
        <p className="check-status">{statusWords(leaf, t, state.lang)}</p>
        <ProposalLine leaf={leaf} />
        <p>{tx(o.summary, state.lang)}</p>
        <dl className="how how-compact">
          <dt>{t("card.deliverable")}</dt>
          <dd>{tx(o.how.deliverable, state.lang)}</dd>
          <dt>{t("card.standards")}</dt>
          <dd>
            {standards.length === 0
              ? t("card.standards.none")
              : standards.map((s) => `${s.number} (${t("standard.edition", { edition: s.edition })})`).join("; ")}
          </dd>
          <dt>{t("card.who")}</dt>
          <dd>{tx(o.how.who, state.lang)}</dd>
          <dt>{t("card.when")}</dt>
          <dd>{formatDate(o.effective.from, state.lang)}</dd>
        </dl>
        <details className="check-quotes">
          <summary>{t("checklist.quotes", { n: o.citations.length + (o.guidance?.length ?? 0) })}</summary>
          <Quotes citations={[...o.citations, ...(o.guidance ?? [])]} />
        </details>
      </div>
    </li>
  );
}

function BranchSection({ branch }: { branch: BranchView }) {
  const { t, state } = useApp();
  const obligations = branch.leaves.filter((l) => l.kind === "obligation");
  const hidden = branch.hidden.filter((l) => l.kind === "obligation");
  return (
    <section className="check-branch" data-state={branch.state} aria-labelledby={`check-${branch.id}`}>
      <h3 id={`check-${branch.id}`} data-flash={`branch:${branch.id}`}>
        {t(`branch.${branch.id}`)}
      </h3>
      {obligations.length === 0 ? <p className="check-empty">{t("checklist.empty")}</p> : null}
      <ul className="check-list">
        {obligations.map((l) => (
          <ObligationItem key={l.key} leaf={l} />
        ))}
      </ul>
      {hidden.length > 0 ? (
        <details className="check-hidden">
          <summary>{t("checklist.notApplicable", { n: hidden.length })}</summary>
          <ul>
            {hidden.map((l) => (
              <li key={l.key}>{tx(l.title, state.lang)}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

export function Checklist({ screen }: { screen: Screen }) {
  const snapshot = useSnapshot();
  const { t, state, answer } = useApp();
  const ruleLeaves = screen.view.branches.flatMap((b) => [...b.leaves, ...b.hidden].filter((l) => l.kind === "rule"));
  const questions = screen.nav.questions;
  return (
    <section className="checklist" aria-label={t("checklist.label")} data-testid="checklist">
      <section className="check-results" aria-labelledby="check-results">
        <h3 id="check-results">{t("checklist.results")}</h3>
        <ul className="check-list">
          {ruleLeaves.map((l) => {
            const rule = snapshot.model.rules.find((r) => r.id === l.id);
            const result = screen.nav.results[l.id];
            if (!rule || !result) return null;
            const words = ruleWords(rule, result, l.check, t, state.lang);
            return (
              <li
                key={l.key}
                className="check-item"
                data-state={l.state}
                data-proposal={l.proposal ? "changed" : undefined}
                data-testid={`check-${l.key}`}
              >
                <span className="leaf-mark" aria-hidden="true" />
                <div className="check-body">
                  <h4 className="check-title">{tx(rule.title, state.lang)}</h4>
                  <p className="check-status" data-flash={`rule:${l.id}`}>
                    {words}
                    {l.state === "upcoming" && rule.effective
                      ? `. ${t("rule.upcoming", { date: formatDate(rule.effective.from, state.lang) })}`
                      : ""}
                  </p>
                  <ProposalLine leaf={l} />
                  {result.status !== "undetermined" ? (
                    <details className="check-quotes">
                      <summary>{t("rule.decided")}</summary>
                      <RuleExplanation rule={rule} result={result} level={5} />
                    </details>
                  ) : null}
                  {state.proposals ? <ProposalSection rule={rule} screen={screen} level={5} fold /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="check-questions" aria-labelledby="check-questions">
        <h3 id="check-questions">{t("checklist.questions")}</h3>
        {questions.length === 0 ? <p>{t("checklist.questions.none")}</p> : null}
        <ul className="check-list">
          {questions.map((q) => {
            const a = snapshot.model.registry.attributes.find((x) => x.id === q.attr);
            if (!a) return null;
            const v = state.profile[a.id];
            const value: AttributeValue | null = v === undefined ? null : v;
            return (
              <li key={q.attr} className="check-question">
                <p className="check-title">{tx(a.question, state.lang)}</p>
                <p className="editor-help">{tx(a.help, state.lang)}</p>
                <AnswerControl attribute={a} value={value} onChange={(next) => answer(a.id, next)} />
              </li>
            );
          })}
        </ul>
      </section>
      {screen.view.branches.map((b) => (
        <BranchSection key={b.id} branch={b} />
      ))}
    </section>
  );
}
