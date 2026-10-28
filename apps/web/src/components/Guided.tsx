// The guided run (DECISIONS U13): the button beside the example picker, the step card and the summary, and the
// playback — a step every four seconds, paused at a question the description leaves open, ←/→ and space, and the
// sheen on what each step changed (the answer's chip, the branches, the rules). The card shows the question from the
// attribute registry and its answer, what changed (possible results, how many requirements apply), and the node that
// decided it with its verbatim quote (folded, checked in the browser like every other quote). The summary lists every
// rule's result, what is still unknown, and the acts to comply with: the requirements that apply, by act and article
// from their own quotes. Nothing here is new legal text.
import {
  type DeviceIr,
  type GuidedStep,
  type Navigation,
  navigate,
  type RuleResult,
  settledLeaves,
  stepChanges,
} from "@mrn/core";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type Screen, useSnapshot } from "../data.tsx";
import { formatDate } from "../lib/dates.ts";
import { actsOf, lastReachable, presentedRules, stepAt } from "../lib/guided.ts";
import { reducedMotion, sheenKeys } from "../lib/sheen.ts";
import { changedKeys, type ScreenView } from "../lib/view.ts";
import { useApp } from "../state.tsx";
import { Quote } from "./Quote.tsx";
import { AnswerControl, ruleWords, tx, valueLabel } from "./ui.tsx";

/** How long a step stays on screen while the run plays. */
export const STEP_MS = 4000;

export function GuidedButton() {
  const { state, t, dispatch } = useApp();
  return state.guided ? (
    <button
      type="button"
      className="guided-toggle"
      data-testid="guided-stop"
      onClick={() => dispatch({ type: "guided-stop" })}
    >
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <rect x="2.5" y="2.5" width="7" height="7" rx="1" />
      </svg>
      {t("guided.stop")}
    </button>
  ) : (
    <button
      type="button"
      className="guided-toggle"
      data-testid="guided-start"
      title={t("guided.start.hint")}
      onClick={() => dispatch({ type: "guided-start" })}
    >
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d="M3 1.8v8.4L10 6z" />
      </svg>
      {t("guided.start")}
    </button>
  );
}

/**
 * A rule's possible results in short words; the class ladder by its class numerals, in the law's voice. While it is
 * not known whether the rule applies at all, it says so: a step may settle just that.
 */
function Possible({ rule, result, ladder }: { rule: DeviceIr; result: RuleResult | undefined; ladder: boolean }) {
  const { t, state } = useApp();
  if (!result || result.status === "not-applicable") return <>{t("rule.notApplicable")}</>;
  const maybeNot = result.scope === null ? ` ${t("guided.maybeNot")}` : "";
  const rank = (id: string) => rule.outcomes.find((o) => o.id === id)?.rank ?? 0;
  // The class numerals as the ladder shows them, lowest first.
  if (ladder)
    return (
      <>
        <span className="guided-classes">{[...result.possible].sort((a, b) => rank(a) - rank(b)).join(" · ")}</span>
        {maybeNot}
      </>
    );
  const label = (id: string) => rule.outcomes.find((o) => o.id === id)?.label[state.lang] ?? id;
  return (
    <>
      {result.status === "determined" && !maybeNot
        ? label(result.value ?? "")
        : t("ladder.oneOf", { list: result.possible.map(label).join(", ") })}
      {maybeNot}
    </>
  );
}

/** What a step changed: the presented rules' possible results, and how many requirements apply. */
function Changes({ before, after, screen }: { before: Navigation; after: Navigation; screen: Screen }) {
  const snapshot = useSnapshot();
  const { t, state } = useApp();
  const changes = stepChanges(before, after);
  const rules = presentedRules(screen.market).filter((id) => changes.rules.includes(id));
  const counts = changes.applies[0] !== changes.applies[1] || changes.open[0] !== changes.open[1];
  if (rules.length === 0 && !counts) return <p className="guided-none">{t("guided.changes.none")}</p>;
  return (
    <ul className="guided-changes" data-testid="guided-changes">
      {rules.map((id) => {
        const rule = snapshot.model.rules.find((r) => r.id === id);
        if (!rule) return null;
        const ladder = id === screen.market.device.ladder;
        return (
          <li key={id}>
            <span className="guided-rule">{tx(rule.title, state.lang)}</span>:{" "}
            <Possible rule={rule} result={before.results[id]} ladder={ladder} /> →{" "}
            <strong>
              <Possible rule={rule} result={after.results[id]} ladder={ladder} />
            </strong>
          </li>
        );
      })}
      {changes.applies[0] !== changes.applies[1] ? (
        <li>{t("guided.change.applies", { before: changes.applies[0], after: changes.applies[1] })}</li>
      ) : null}
      {changes.open[0] !== changes.open[1] ? (
        <li>{t("guided.change.open", { before: changes.open[0], after: changes.open[1] })}</li>
      ) : null}
    </ul>
  );
}

/** The node that decided what changed, with its verbatim quote; for a change in requirements only, the requirement. */
function Decided({ before, after, screen }: { before: Navigation; after: Navigation; screen: Screen }) {
  const snapshot = useSnapshot();
  const { t, state } = useApp();
  const changes = stepChanges(before, after);
  for (const id of presentedRules(screen.market)) {
    const rule = snapshot.model.rules.find((r) => r.id === id);
    const [b, a] = [before.results[id], after.results[id]];
    if (!rule || !b || !a || !changes.rules.includes(id)) continue;
    const node = rule.nodes.find((n) => n.id === settledLeaves(rule, b, a)[0]);
    const criterion = node ? rule.criteria.find((c) => node.prov.criterionIds.includes(c.id)) : undefined;
    if (!node || !criterion) continue;
    const truth = a.nodes[node.id];
    return (
      <section className="guided-decided" data-testid="guided-decided">
        <h3>{t("guided.decided")}</h3>
        <p>
          {t("guided.decided.leaf", {
            label: tx(node.label, state.lang),
            truth: t(truth === true ? "node.true" : truth === false ? "node.false" : "node.null"),
          })}{" "}
          <span className="guided-rule-of">({tx(rule.title, state.lang)})</span>
        </p>
        <FoldedQuote>
          <Quote citation={criterion} context={120} />
        </FoldedQuote>
      </section>
    );
  }
  const obligation = snapshot.model.obligations.find((o) => changes.obligations.includes(o.id));
  const now = after.obligations.find((o) => o.id === obligation?.id)?.applies ?? null;
  const citation = obligation?.citations[0];
  if (!obligation || !citation) return null;
  return (
    <section className="guided-decided" data-testid="guided-decided">
      <h3>{t("guided.decided")}</h3>
      <p>
        {t("guided.decided.obligation", {
          title: tx(obligation.title, state.lang),
          state: t(
            now === true
              ? "guided.obligation.true"
              : now === false
                ? "guided.obligation.false"
                : "guided.obligation.null",
          ),
        })}
      </p>
      <FoldedQuote>
        <Quote citation={citation} context={120} />
      </FoldedQuote>
    </section>
  );
}

/** The verbatim quote behind a disclosure, so the card stays short; the browser checks it all the same. */
function FoldedQuote({ children }: { children: ReactNode }) {
  const { t } = useApp();
  return (
    <details className="guided-quote">
      <summary>{t("guided.quote")}</summary>
      {children}
    </details>
  );
}

function StepView({ step, screen }: { step: GuidedStep; screen: Screen }) {
  const snapshot = useSnapshot();
  const { t, state, asOf, answer } = useApp();
  const before = useMemo(
    () => navigate(snapshot.model, step.before, { asOf, proposals: state.proposals }),
    [snapshot, step.before, asOf, state.proposals],
  );
  const attribute = snapshot.model.registry.attributes.find((a) => a.id === step.attr);
  const waiting = step.source === "pending";
  const value = (v: typeof step.value) => (attribute ? valueLabel(attribute, v, state.lang, t) : "");
  return (
    <div className="guided-cols" aria-live="polite" data-testid="guided-step">
      <div className="guided-main">
        {step.source === "rest" ? (
          <>
            <h3 className="guided-question">{t("guided.rest.heading")}</h3>
            <p className="guided-note">{t("guided.rest.body")}</p>
            <ul className="guided-rest">
              {step.rest.map((id) => {
                const a = snapshot.model.registry.attributes.find((x) => x.id === id);
                return a ? (
                  <li key={id}>
                    {t("chip.text", {
                      label: tx(a.label, state.lang),
                      value: valueLabel(a, step.after[id] ?? null, state.lang, t),
                    })}
                  </li>
                ) : null;
              })}
            </ul>
          </>
        ) : attribute ? (
          <>
            <h3 className="guided-question" data-testid="guided-question">
              {tx(attribute.question, state.lang)}
            </h3>
            <p className="guided-answer" data-source={step.source} data-testid="guided-answer">
              {step.source === "target"
                ? t("guided.target", { value: value(step.value) })
                : step.source === "answer"
                  ? t("guided.given", { value: value(step.value) })
                  : step.source === "unknown"
                    ? t("guided.unknown")
                    : t("guided.ask")}
            </p>
          </>
        ) : null}
        {attribute && step.source !== "target" ? (
          <div className="guided-ask" data-testid="guided-ask">
            {waiting ? null : <p className="guided-note">{t("guided.change")}</p>}
            <AnswerControl
              attribute={attribute}
              value={waiting ? undefined : step.value}
              onChange={(next) => answer(attribute.id, next)}
              compact={attribute.type === "boolean"}
            />
            {waiting ? <p className="guided-note">{t("guided.changes.waiting")}</p> : null}
          </div>
        ) : null}
      </div>
      {waiting ? null : (
        <div className="guided-side">
          <section className="guided-section">
            <h3>{t("guided.changes")}</h3>
            <Changes before={before} after={screen.nav} screen={screen} />
          </section>
          <Decided before={before} after={screen.nav} screen={screen} />
        </div>
      )}
    </div>
  );
}

function Summary({ screen }: { screen: Screen }) {
  const snapshot = useSnapshot();
  const { t, state, asOf } = useApp();
  const g = state.guided;
  const acts = useMemo(() => actsOf(snapshot, screen.nav), [snapshot, screen.nav]);
  if (!g) return null;
  const count = (source: GuidedStep["source"]) => g.run.steps.filter((s) => s.source === source).length;
  const date = (d: string) => formatDate(d, state.lang);
  return (
    <div className="guided-cols" aria-live="polite" data-testid="guided-summary">
      <div className="guided-main">
        <p className="guided-lead">
          {t("guided.summary.lead", {
            n: g.run.steps.length,
            target: count("target"),
            given: count("answer"),
            unknown: count("unknown"),
          })}
        </p>
        <section className="guided-section">
          <h3>{t("guided.summary.results")}</h3>
          <ul className="guided-results" data-testid="guided-results">
            {presentedRules(screen.market).map((id) => {
              const rule = snapshot.model.rules.find((r) => r.id === id);
              const result = screen.nav.results[id];
              if (!rule || !result) return null;
              return (
                <li key={id}>
                  <span className="guided-rule">{tx(rule.title, state.lang)}</span>:{" "}
                  <strong>
                    {ruleWords(rule, result, screen.view.leaves.get(`r.${id}`)?.check ?? null, t, state.lang)}
                  </strong>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="guided-section">
          <h3>{t("guided.summary.unknown")}</h3>
          {screen.nav.questions.length === 0 ? (
            <p className="guided-note">{t("guided.summary.unknown.none")}</p>
          ) : (
            <ul className="guided-unknown" data-testid="guided-unknown">
              {screen.nav.questions.map((q) => {
                const a = snapshot.model.registry.attributes.find((x) => x.id === q.attr);
                return a ? <li key={q.attr}>{tx(a.question, state.lang)}</li> : null;
              })}
            </ul>
          )}
        </section>
      </div>
      <section className="guided-side guided-section">
        <h3>{t("guided.summary.acts")}</h3>
        <p className="guided-note">{t("guided.summary.acts.lead", { date: date(asOf) })}</p>
        {acts.length === 0 ? <p className="guided-note">{t("guided.summary.acts.none")}</p> : null}
        <div className="guided-acts" data-testid="guided-acts">
          {acts.map((act) => (
            <details key={act.source} className="guided-act">
              <summary>
                <span className="guided-act-title" lang="en">
                  {act.title}
                </span>{" "}
                <span className="guided-count">{t("guided.summary.articles", { n: act.articles.length })}</span>
              </summary>
              <ul>
                {act.articles.map((article) => {
                  // The article's requirements, one line per date: "in force since …: A; B".
                  const when = (item: (typeof article.items)[number]) =>
                    item.timing === "upcoming"
                      ? t("timing.upcoming", { date: date(item.from) })
                      : item.timing === "expired" && item.until
                        ? t("timing.expired", { date: date(item.until) })
                        : t("timing.in-force", { date: date(item.from) });
                  const lines = new Map<string, { timing: string; titles: string[] }>();
                  for (const item of article.items) {
                    const line = lines.get(when(item)) ?? { timing: item.timing, titles: [] };
                    line.titles.push(tx(item.title, state.lang));
                    lines.set(when(item), line);
                  }
                  return (
                    <li key={article.section}>
                      <span className="guided-ref" lang="en">
                        {article.ref}
                      </span>
                      {[...lines].map(([words, line]) => (
                        <p key={words} className="guided-items" data-timing={line.timing}>
                          <span className="guided-date">{words}:</span> {line.titles.join("; ")}
                        </p>
                      ))}
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * The run's card, between the description and the map, kept small: one row with where the run is, its track, the
 * controls (their keys in their tooltips) and a button that folds the card down to that row; under it the step in two
 * columns — the question and its answer; what changed and what decided it — or the blank sheet, or the summary. Folded,
 * the card still opens at a question that waits for an answer, and its row then says where the run is. When the run is
 * started with a press, the page brings the card to the top, so the map shows right under it; a link that opens the run
 * leaves the page at its top, with the banner.
 */
export function GuidedCard({ screen }: { screen: Screen }) {
  const { state, t, dispatch } = useApp();
  const card = useRef<HTMLElement>(null);
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    const el = card.current;
    if (!el || (navigator.userActivation && !navigator.userActivation.isActive)) return;
    el.scrollIntoView?.({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
    // The map under the card lays itself out a moment later and the page grows: once the scroll is over, bring the card
    // up the rest of the way, unless the reader has scrolled meanwhile.
    let moved = false;
    const scrolled = () => {
      moved = true;
    };
    // Keys that scroll the page (the arrows left and right and space work the run).
    const keyed = (e: KeyboardEvent) => {
      if (/^(PageUp|PageDown|Home|End|ArrowUp|ArrowDown)$/.test(e.key)) moved = true;
    };
    window.addEventListener("wheel", scrolled, { passive: true });
    window.addEventListener("touchmove", scrolled, { passive: true });
    window.addEventListener("keydown", keyed);
    const settle = window.setTimeout(() => {
      if (!moved && el.getBoundingClientRect().top > 24) el.scrollIntoView?.({ block: "start", behavior: "auto" });
    }, 700);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener("wheel", scrolled);
      window.removeEventListener("touchmove", scrolled);
      window.removeEventListener("keydown", keyed);
    };
  }, []);
  const g = state.guided;
  if (!g) return null;
  const n = g.run.steps.length;
  const reach = lastReachable(g.run);
  const step = stepAt(g.run, g.at);
  const waiting = step?.source === "pending";
  const shown = !folded || waiting;
  const position = g.at === 0 ? t("guided.begin") : g.at > n ? t("guided.end") : t("guided.step", { k: g.at, n });
  const go = (at: number) => dispatch({ type: "guided-go", at });
  return (
    <section
      ref={card}
      className="guided island"
      aria-labelledby="guided-heading"
      data-testid="guided"
      data-at={g.at}
      data-folded={shown ? undefined : true}
    >
      <div className="guided-head">
        <h2 id="guided-heading" className="guided-title">
          {t("guided.heading")}
        </h2>
        <p className="guided-position" data-testid="guided-position" aria-live={folded ? "polite" : undefined}>
          {position}
          {waiting ? <span className="guided-waiting"> · {t("guided.waiting")}</span> : null}
        </p>
        <div
          className="guided-track"
          role="progressbar"
          aria-label={t("guided.progress")}
          aria-valuemin={0}
          aria-valuemax={n + 1}
          aria-valuenow={g.at}
          aria-valuetext={position}
        >
          {Array.from({ length: n + 2 }, (_, i) => {
            const s = stepAt(g.run, i);
            const kind = i < g.at ? "done" : i === g.at ? "current" : i > reach ? "later" : "next";
            const key = i === 0 ? "start" : i > n ? "end" : s?.attr || "rest";
            return <span key={key} className="guided-seg" data-state={kind} data-source={s?.source} />;
          })}
        </div>
        <GuidedControls go={go} reach={reach} />
        <button
          type="button"
          className="guided-icon guided-fold"
          data-testid="guided-fold"
          aria-expanded={shown}
          aria-controls="guided-body"
          aria-label={t("guided.details")}
          title={t(shown ? "guided.fold" : "guided.unfold")}
          // Not `disabled`: the button may hold the focus when a question opens the card.
          aria-disabled={waiting || undefined}
          onClick={() => {
            if (!waiting) setFolded(!folded);
          }}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d={shown ? "M2.5 7.5 6 4l3.5 3.5" : "M2.5 4.5 6 8l3.5-3.5"} />
          </svg>
        </button>
      </div>
      <div id="guided-body" className="guided-body" hidden={!shown}>
        {g.at === 0 ? (
          <div className="guided-cols" aria-live="polite" data-testid="guided-blank">
            <div className="guided-main">
              <h3 className="guided-question">{t("guided.blank.heading")}</h3>
              <p className="guided-note">{t("guided.blank.body")}</p>
            </div>
          </div>
        ) : g.at > n ? (
          <Summary screen={screen} />
        ) : step ? (
          <StepView key={g.at} step={step} screen={screen} />
        ) : null}
      </div>
    </section>
  );
}

/** An icon of the controls: a stroke, or (`fill`) a solid shape. */
function Icon({ d, fill = false }: { d: string; fill?: boolean }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" data-fill={fill || undefined}>
      <path d={d} />
    </svg>
  );
}

/** Back, play or pause (start again at the end), next: icons, with their names and keys in their tooltips. */
function GuidedControls({ go, reach }: { go: (at: number) => void; reach: number }) {
  const { state, t, dispatch } = useApp();
  const g = state.guided;
  if (!g) return null;
  const n = g.run.steps.length;
  return (
    <div className="guided-controls">
      <button
        type="button"
        className="guided-icon"
        data-testid="guided-back"
        disabled={g.at === 0}
        aria-label={t("guided.back")}
        aria-keyshortcuts="ArrowLeft"
        title={`${t("guided.back")} (←)`}
        onClick={() => go(g.at - 1)}
      >
        <Icon d="M7.5 2.5 4 6l3.5 3.5" />
      </button>
      {g.at > n ? (
        <button
          type="button"
          className="guided-icon guided-primary"
          data-testid="guided-again"
          aria-label={t("guided.summary.again")}
          title={t("guided.summary.again")}
          onClick={() => {
            go(0);
            dispatch({ type: "guided-play", on: true });
          }}
        >
          <Icon d="M9.6 6.4A3.6 3.6 0 1 1 8.5 3.4M9.6 1.4v2.4H7.2" />
        </button>
      ) : (
        <button
          type="button"
          className="guided-icon guided-primary"
          data-testid="guided-play"
          aria-pressed={g.playing}
          aria-label={t("guided.play")}
          aria-keyshortcuts="Space"
          title={`${t(g.playing ? "guided.pause" : "guided.play")} (${t("guided.space")})`}
          onClick={() => dispatch({ type: "guided-play", on: !g.playing })}
        >
          {g.playing ? <Icon d="M3.4 2.4h1.9v7.2H3.4zM6.7 2.4h1.9v7.2H6.7z" fill /> : <Icon d="M3.6 2v8L10 6z" fill />}
        </button>
      )}
      <button
        type="button"
        className="guided-icon"
        data-testid="guided-next"
        disabled={g.at >= reach}
        aria-label={t("guided.next")}
        aria-keyshortcuts="ArrowRight"
        title={`${t("guided.next")} (→)`}
        onClick={() => go(g.at + 1)}
      >
        <Icon d="M4.5 2.5 8 6l-3.5 3.5" />
      </button>
    </div>
  );
}

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName));
const pressable = (el: EventTarget | null) =>
  el instanceof HTMLElement && el.closest("button, a[href], summary, label, [role='button'], [role='switch']") !== null;

/**
 * While the run is on: the next step every STEP_MS (not past a question waiting for an answer), ←/→ and space, and
 * the sheen on what a step changed.
 */
export function useGuidedPlayback(screen: Screen | null) {
  const { state, dispatch } = useApp();
  const g = state.guided;
  const n = g?.run.steps.length ?? 0;
  const at = g?.at ?? -1;
  const playing = g?.playing ?? false;
  const waiting = g ? stepAt(g.run, g.at)?.source === "pending" : false;
  useEffect(() => {
    if (!playing || waiting || at > n) return;
    const id = window.setTimeout(() => dispatch({ type: "guided-go", at: at + 1 }), STEP_MS);
    return () => window.clearTimeout(id);
  }, [playing, waiting, at, n, dispatch]);

  const latest = useRef(g);
  latest.current = g;
  const on = g !== null;
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      const run = latest.current;
      if (!run || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || typing(e.target)) return;
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const to = run.at + (e.key === "ArrowRight" ? 1 : -1);
        if (to < 0 || to > lastReachable(run.run)) return;
        e.preventDefault();
        dispatch({ type: "guided-go", at: to });
      } else if (e.key === " " && !pressable(e.target)) {
        e.preventDefault();
        if (run.at <= run.run.steps.length) dispatch({ type: "guided-play", on: !run.playing });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [on, dispatch]);

  // What a step changed shimmers once the screen shows it (two frames: the map lays itself out first).
  const previous = useRef<ScreenView | null>(null);
  const view = screen?.view ?? null;
  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    if (!on || !before || !view || before === view) return;
    const keys = changedKeys(before, view);
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => sheenKeys(keys));
    });
    return () => cancelAnimationFrame(frame);
  }, [on, view]);
}
