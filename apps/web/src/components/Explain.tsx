// "What decided it": the nodes of a rule that explain its result (core `witnesses`), indented as the rule nests them,
// each with its truth value in words and, the first time a criterion appears, its verbatim quote. Shared by the card
// and the checklist.
import { type Criterion, type DeviceIr, type RuleResult, witnesses } from "@mrn/core";
import { useApp } from "../state.tsx";
import { Quote } from "./Quote.tsx";
import { tx } from "./ui.tsx";

export interface WitnessRow {
  id: string;
  depth: number;
  label: DeviceIr["nodes"][number]["label"];
  truth: boolean | null;
  /** Criteria not quoted earlier in the same explanation. */
  quotes: Criterion[];
}

/** Witness rows under `rootId` with their depth; criteria already in `shown` are not repeated (and `shown` grows). */
export function witnessRows(rule: DeviceIr, result: RuleResult, rootId: string, shown: Set<string>): WitnessRow[] {
  const ids = witnesses(rule, result.nodes, rootId);
  const byId = new Map(rule.nodes.map((n) => [n.id, n]));
  const criteria = new Map(rule.criteria.map((c) => [c.id, c]));
  const depth = new Map<string, number>([[rootId, 0]]);
  for (const id of ids) {
    const n = byId.get(id);
    if (n && "childIds" in n)
      for (const c of n.childIds) if (!depth.has(c) && ids.includes(c)) depth.set(c, (depth.get(id) ?? 0) + 1);
  }
  return ids.flatMap((id) => {
    const node = byId.get(id);
    if (!node) return [];
    const quotes: Criterion[] = [];
    // The root gate only gathers its children's reasons (e.g. "the strictest rule applies"): quote the reasons.
    const gathers = id === rootId && "childIds" in node && ids.length > 1;
    for (const cid of gathers ? [] : node.prov.criterionIds) {
      const c = criteria.get(cid);
      if (c && !shown.has(cid)) {
        shown.add(cid);
        quotes.push(c);
      }
    }
    return [{ id, depth: depth.get(id) ?? 0, label: node.label, truth: result.nodes[id] ?? null, quotes }];
  });
}

export const rootOf = (rule: DeviceIr, outcome: string): string | null =>
  rule.outcomes.find((o) => o.id === outcome)?.rootId ?? null;

export function WitnessList({ rows, quotes = true }: { rows: WitnessRow[]; quotes?: boolean }) {
  const { t, state } = useApp();
  return (
    <ol className="witnesses">
      {rows.map((row) => (
        <li
          key={row.id}
          className="witness"
          data-truth={String(row.truth)}
          style={{ marginInlineStart: `${row.depth * 1.1}rem` }}
        >
          <span className="witness-line">
            <span className="witness-truth">
              {t(row.truth === true ? "node.true" : row.truth === false ? "node.false" : "node.null")}
            </span>
            <span className="witness-label">{tx(row.label, state.lang)}</span>
          </span>
          {quotes ? row.quotes.map((c) => <Quote key={c.id} citation={c} context={70} />) : null}
        </li>
      ))}
    </ol>
  );
}

/** The whole explanation of a rule result: what decided it and, for a "strictest wins" rule, why not stricter. */
export function RuleExplanation({
  rule,
  result,
  quotes = true,
}: {
  rule: DeviceIr;
  result: RuleResult;
  quotes?: boolean;
}) {
  const { t, state } = useApp();
  const shown = new Set<string>();
  const decidedRoot =
    result.status === "not-applicable" ? (rule.scopeId ?? null) : result.value ? rootOf(rule, result.value) : null;
  const decided = decidedRoot ? witnessRows(rule, result, decidedRoot, shown) : [];
  const ties = rule.resolution === "highest-rank" ? Object.values(result.outcomes).filter((v) => v === true).length : 0;
  const resolution =
    ties > 1 ? rule.criteria.filter((c) => rule.resolutionCriterionIds.includes(c.id) && !shown.has(c.id)) : [];
  for (const c of resolution) shown.add(c.id);
  const valueRank = rule.outcomes.find((o) => o.id === result.value)?.rank;
  const stricter =
    rule.resolution === "highest-rank" && valueRank !== undefined && result.status === "determined"
      ? [...rule.outcomes]
          .filter((o) => o.rank > valueRank && result.outcomes[o.id] === false)
          .sort((a, b) => b.rank - a.rank)
          .map((o) => ({ outcome: o, rows: witnessRows(rule, result, o.rootId, shown) }))
      : [];
  return (
    <div className="explain">
      {decided.length > 0 ? (
        <section>
          <h3>{t("rule.decided")}</h3>
          <WitnessList rows={decided} quotes={quotes} />
          {quotes ? resolution.map((c) => <Quote key={c.id} citation={c} context={70} />) : null}
        </section>
      ) : null}
      {stricter.length > 0 ? (
        <section>
          <h3>{t("rule.stricter")}</h3>
          {stricter.map(({ outcome, rows }) => (
            <div key={outcome.id} className="stricter">
              <p className="stricter-label">{tx(outcome.label, state.lang)}</p>
              <WitnessList rows={rows} quotes={quotes} />
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
