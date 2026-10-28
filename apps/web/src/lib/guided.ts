// The guided run on screen (DECISIONS U13): where a position of the run puts the screen, how far one can go before an
// answer is needed, the rules in the order the screen shows them, and the summary's acts — the requirements that
// apply, grouped by act and article from their own quotes. Pure; no React.
import {
  type GuidedRun,
  guidedRun,
  type ModelledMarket,
  type Navigation,
  type NavigatorModel,
  type ObligationResult,
  type Profile,
  sectionKey,
  type Text,
  type WebSnapshot,
} from "@mrn/core";
import type { GivenAnswers } from "./route.ts";

export interface GuidedState {
  /** The description the run walks towards. */
  target: Profile;
  /** Answers given during the run to the questions the description leaves open (null: "don't know"). */
  answers: GivenAnswers;
  /** 0: the blank sheet; k: step k; steps + 1: the summary. */
  at: number;
  playing: boolean;
  /** The steps for the description and the answers (derived). */
  run: GuidedRun;
}

/** How far the run can go now: up to the first step that waits for an answer, else to the summary. */
export function lastReachable(run: GuidedRun): number {
  return run.pending >= 0 ? run.pending + 1 : run.steps.length + 1;
}

/** The step at a position (null: the blank sheet or the summary). */
export const stepAt = (run: GuidedRun, at: number) => (at >= 1 ? (run.steps[at - 1] ?? null) : null);

/** The answers on screen at a position: none on the blank sheet, a waiting step's question, a step's answer, the end. */
export function profileAt(run: GuidedRun, at: number): Profile {
  if (at <= 0) return {};
  const step = run.steps[at - 1];
  if (!step) return run.final;
  return step.source === "pending" ? step.before : step.after;
}

/** The run for a description, answers and position on a date, the position kept within reach. */
export function guidedState(model: NavigatorModel, input: Omit<GuidedState, "run">, asOf: string): GuidedState {
  const run = guidedRun(model, input.target, { asOf, answers: input.answers });
  const at = Math.min(Math.max(0, input.at), lastReachable(run));
  return { ...input, at, playing: input.playing && at <= run.steps.length, run };
}

/** The rules in the order the screen shows them: the device's qualification and class, then each branch's. */
export function presentedRules(market: ModelledMarket): string[] {
  return [...new Set([market.device.qualification, market.device.ladder, ...market.branches.flatMap((b) => b.rules)])];
}

export interface ActItem {
  id: string;
  title: Text;
  from: string;
  until: string | null;
  timing: ObligationResult["timing"];
}

export interface ActArticle {
  section: string;
  /** The section's reference in the act's own words (e.g. "Article 52"). */
  ref: string;
  items: ActItem[];
}

export interface ActGroup {
  source: string;
  title: string;
  articles: ActArticle[];
}

/** Legal acts, as opposed to guidance, proposals and web pages. */
const ACT_KINDS: ReadonlySet<string> = new Set(["regulation", "decision"]);

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };
function roman(text: string): number {
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const v = ROMAN[text[i] ?? ""] ?? 0;
    const next = ROMAN[text[i + 1] ?? ""] ?? 0;
    total += v < next ? -v : v;
  }
  return total;
}

/** Reading order of references: articles by number, then annexes by their numeral, then anything else. */
function refOrder(ref: string): [number, number, string] {
  const article = /^Article (\d+)(.*)$/.exec(ref);
  if (article) return [0, Number(article[1]), article[2] ?? ""];
  const annex = /^Annex ([IVXL]+)(.*)$/.exec(ref);
  if (annex) return [1, roman(annex[1] ?? ""), annex[2] ?? ""];
  return [2, 0, ref];
}

const compareRefs = (a: string, b: string) => {
  const [x, y] = [refOrder(a), refOrder(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]);
};

/**
 * The requirements that apply, grouped by legal act and by the article (or annex section) each one quotes as its
 * legal basis; a requirement quoting two articles stands under both. Regulations first, then decisions.
 */
export function actsOf(snapshot: WebSnapshot, nav: Navigation): ActGroup[] {
  const obligations = new Map(snapshot.model.obligations.map((o) => [o.id, o]));
  const groups = new Map<string, ActGroup>();
  for (const r of nav.obligations) {
    const o = obligations.get(r.id);
    if (r.applies !== true || !o) continue;
    const seen = new Set<string>();
    for (const c of o.citations) {
      const source = snapshot.sources[c.source];
      const key = sectionKey(c.source, c.section);
      if (!source || !ACT_KINDS.has(source.kind) || seen.has(key)) continue;
      seen.add(key);
      let group = groups.get(c.source);
      if (!group) {
        group = { source: c.source, title: source.shortTitle, articles: [] };
        groups.set(c.source, group);
      }
      let article = group.articles.find((a) => a.section === c.section);
      if (!article) {
        article = { section: c.section, ref: snapshot.sections[key]?.ref ?? c.section, items: [] };
        group.articles.push(article);
      }
      article.items.push({
        id: o.id,
        title: o.title,
        from: o.effective.from,
        until: o.effective.until ?? null,
        timing: r.timing,
      });
    }
  }
  const kindRank = (g: ActGroup) => (snapshot.sources[g.source]?.kind === "regulation" ? 0 : 1);
  return [...groups.values()]
    .sort((a, b) => kindRank(a) - kindRank(b))
    .map((g) => ({ ...g, articles: [...g.articles].sort((a, b) => compareRefs(a.ref, b.ref)) }));
}
