// What the main screen shows for one navigation, computed once and shared by the map and the checklist: the device
// node (qualification line and class ladder), the six branches with their leaves (rule results and obligations), the
// attribute chips, and which unanswered questions would settle what is still open. Pure; no React.
import {
  ATTRIBUTE_GROUPS,
  type Attribute,
  type AttributeValue,
  type Branch,
  type CrossCheckResult,
  type DecisiveUnknown,
  type DeviceIr,
  type ModelledMarket,
  type Navigation,
  NO_OUTCOME,
  type Profile,
  possibleWithScope,
  type RuleResult,
  type Text,
  type WebSnapshot,
} from "@mrn/core";

/** in-force / upcoming / expired: applies (relative to the as-of date); open: depends on an answer; none: does not apply. */
export type LeafState = "in-force" | "upcoming" | "expired" | "open" | "none";

export interface LeafView {
  /** "o.<obligation id>" or "r.<rule id>". */
  key: string;
  kind: "obligation" | "rule";
  id: string;
  title: Text;
  /** A rule leaf: the outcomes still possible, in words. */
  outcomes: Text[];
  state: LeafState;
  /** A guidance cross-check: waiting for its answers does not make the branch depend on them. */
  optional: boolean;
  from: string | null;
  until: string | null;
  support: string[];
  check: CrossCheckResult | null;
  /** Under the proposed revisions, when they change this leaf: a rule's outcomes, an obligation's state. */
  proposal: { outcomes: Text[]; state: LeafState } | null;
}

export type BranchState = "open" | "in-force" | "upcoming" | "none";

export interface BranchView {
  id: Branch;
  side: "left" | "right";
  state: BranchState;
  /** Leaves that apply or may apply, and with proposals on those that would apply under the proposal. */
  leaves: LeafView[];
  /** Leaves that do not apply (nor would under the proposal). */
  hidden: LeafView[];
  /** Obligations that apply, and those that depend on an answer. */
  counts: { applies: number; open: number };
  /** An upcoming branch: the first date one of its leaves starts to apply. */
  from: string | null;
  support: string[];
  /**
   * Unanswered questions that would settle an open leaf, in reading order, without those the device node asks or an
   * earlier branch shows; the map shows the first.
   */
  questions: DecisiveUnknown[];
  /** Leaves the proposed revisions would change (0 with proposals off). */
  proposalChanges: number;
}

export type StepState = "value" | "possible" | "excluded";

export interface LadderStep {
  id: string;
  label: Text;
  state: StepState;
  /** The same step under the proposed revisions (null: proposals off). */
  proposal: StepState | null;
}

export interface DeviceView {
  qualification: { rule: DeviceIr; result: RuleResult; labels: Text[] };
  ladder: { rule: DeviceIr; result: RuleResult; steps: LadderStep[]; maybeNone: boolean };
  support: string[];
  /** Questions that would change the qualification or the class. */
  questions: DecisiveUnknown[];
  /** With proposals on: questions only the proposed class needs. */
  proposalQuestions: DecisiveUnknown[];
}

export interface ChipView {
  attribute: Attribute;
  value: AttributeValue | null;
  /** Unanswered, and the answer would change a result or an obligation. */
  decisive: boolean;
  /** Unanswered, and only a guidance cross-check needs it. */
  forCheck: boolean;
  /** Unanswered, and only the proposed revisions need it. */
  forProposal: boolean;
}

export interface ScreenView {
  device: DeviceView;
  branches: BranchView[];
  chips: { groups: { group: Attribute["group"]; chips: ChipView[] }[]; rest: ChipView[] };
  /** Every leaf by key (hidden ones included). */
  leaves: Map<string, LeafView>;
}

export const leafKey = (kind: LeafView["kind"], id: string) => `${kind === "rule" ? "r" : "o"}.${id}`;

function timing(effective: { from: string; until?: string } | undefined, asOf: string): LeafState {
  if (!effective) return "in-force";
  if (asOf < effective.from) return "upcoming";
  return effective.until !== undefined && asOf >= effective.until ? "expired" : "in-force";
}

const labelsOf = (rule: DeviceIr, ids: readonly string[]): Text[] =>
  ids.flatMap((id) => rule.outcomes.find((o) => o.id === id)?.label ?? []);

function ruleLeaf(rule: DeviceIr, result: RuleResult, check: CrossCheckResult | null, asOf: string): LeafView {
  const optional = rule.role === "cross-check";
  const settled = optional
    ? check?.status === "consistent" || check?.status === "inconsistent"
    : result.status === "determined";
  const state: LeafState =
    result.status === "not-applicable" ? "none" : settled ? timing(rule.effective, asOf) : "open";
  return {
    key: leafKey("rule", rule.id),
    kind: "rule",
    id: rule.id,
    title: rule.title,
    outcomes: labelsOf(rule, result.possible),
    state,
    optional,
    from: rule.effective?.from ?? null,
    until: rule.effective?.until ?? null,
    support: result.support,
    check,
    proposal: null,
  };
}

const sameLeaf = (a: { outcomes: Text[]; state: LeafState }, b: { outcomes: Text[]; state: LeafState }) =>
  a.state === b.state && a.outcomes.map((o) => o.en).join("|") === b.outcomes.map((o) => o.en).join("|");

function ladderStep(id: string, result: RuleResult | undefined): StepState {
  if (!result || result.status === "not-applicable") return "excluded";
  if (result.value === id) return "value";
  return result.possible.includes(id) ? "possible" : "excluded";
}

export function buildView(
  snapshot: WebSnapshot,
  market: ModelledMarket,
  nav: Navigation,
  profile: Profile,
): ScreenView {
  const { model } = snapshot;
  const ruleById = new Map(model.rules.map((r) => [r.id, r]));
  const rule = (id: string): DeviceIr => {
    const r = ruleById.get(id);
    if (!r) throw new Error(`unknown rule ${id}`);
    return r;
  };
  const result = (id: string): RuleResult => {
    const r = nav.results[id];
    if (!r) throw new Error(`no result for ${id}`);
    return r;
  };
  const decisive = new Map(nav.questions.map((q) => [q.attr, q]));
  const leaves = new Map<string, LeafView>();
  // Each question is shown once on the map: the device node asks what settles the qualification and the class; a
  // branch asks the first of its questions that no node before it (the device, an earlier branch) shows.
  const deviceRules = new Set([market.device.qualification, market.device.ladder]);
  const deviceQuestions = nav.questions.filter((q) => q.affects.some((k) => deviceRules.has(k)));
  const shownQuestions = new Set(deviceQuestions.slice(0, 1).map((q) => q.attr));
  const askedAtDevice = new Set(deviceQuestions.map((q) => q.attr));

  const branches = market.branches.map((b, i): BranchView => {
    const ruleLeaves = b.rules.map((id) => {
      const check = nav.crossChecks.find((c) => c.ruleId === id) ?? null;
      const leaf = ruleLeaf(rule(id), result(id), check, nav.asOf);
      const proposed = nav.proposal?.results[id];
      if (proposed) {
        const revision = model.rules.find((r) => r.revises === id) ?? rule(id);
        const pCheck = nav.proposal?.crossChecks.find((c) => c.ruleId === id) ?? null;
        const p = ruleLeaf(revision, proposed, pCheck, nav.asOf);
        const shown = { outcomes: p.outcomes, state: p.state };
        if (!sameLeaf(leaf, shown)) leaf.proposal = shown;
      }
      return leaf;
    });
    const obligationLeaves = model.obligations
      .filter((o) => o.branch === b.id)
      .map((o): LeafView => {
        const r = nav.obligations.find((x) => x.id === o.id);
        const state: LeafState = !r || r.applies === false ? "none" : r.applies === null ? "open" : r.timing;
        const leaf: LeafView = {
          key: leafKey("obligation", o.id),
          kind: "obligation",
          id: o.id,
          title: o.title,
          outcomes: [],
          state,
          optional: false,
          from: o.effective.from,
          until: o.effective.until ?? null,
          support: r?.support ?? [],
          check: null,
          proposal: null,
        };
        const p = nav.proposal?.obligations.find((x) => x.id === o.id);
        if (p) {
          const pState: LeafState = p.applies === false ? "none" : p.applies === null ? "open" : p.timing;
          if (pState !== state) leaf.proposal = { outcomes: [], state: pState };
        }
        return leaf;
      });
    const all = [...ruleLeaves, ...obligationLeaves];
    for (const l of all) leaves.set(l.key, l);
    // Shown: what applies or may apply, and (proposals on) what would apply under the proposal.
    const current = all.filter((l) => l.state !== "none");
    const shown = all.filter((l) => l.state !== "none" || (l.proposal !== null && l.proposal.state !== "none"));
    const required = current.filter((l) => !l.optional);
    const has = (state: LeafState) => current.some((l) => l.state === state);
    const state: BranchState = required.some((l) => l.state === "open")
      ? "open"
      : has("in-force")
        ? "in-force"
        : has("upcoming")
          ? "upcoming"
          : "none";
    const openSupport = new Set(required.filter((l) => l.state === "open").flatMap((l) => l.support));
    const upcoming = current.filter((l) => l.state === "upcoming").map((l) => l.from ?? "");
    const questions = nav.questions.filter(
      (q) => openSupport.has(q.attr) && !askedAtDevice.has(q.attr) && !shownQuestions.has(q.attr),
    );
    if (questions[0]) shownQuestions.add(questions[0].attr);
    return {
      id: b.id,
      side: i < Math.ceil(market.branches.length / 2) ? "left" : "right",
      state,
      leaves: shown,
      hidden: all.filter((l) => !shown.includes(l)),
      counts: {
        applies: obligationLeaves.filter((l) => l.state === "in-force" || l.state === "upcoming").length,
        open: obligationLeaves.filter((l) => l.state === "open").length,
      },
      from: state === "upcoming" ? ([...upcoming].sort()[0] ?? null) : null,
      support: [...new Set(current.flatMap((l) => l.support))],
      questions,
      proposalChanges: all.filter((l) => l.proposal !== null).length,
    };
  });

  const qualRule = rule(market.device.qualification);
  const qualResult = result(qualRule.id);
  const ladderRule = rule(market.device.ladder);
  const ladderResult = result(ladderRule.id);
  const proposed = nav.proposal?.results[ladderRule.id];
  const steps = [...ladderRule.outcomes]
    .sort((a, b) => a.rank - b.rank)
    .map(
      (o): LadderStep => ({
        id: o.id,
        label: o.label,
        state: ladderStep(o.id, ladderResult),
        proposal: nav.proposal ? ladderStep(o.id, proposed) : null,
      }),
    );
  const device: DeviceView = {
    qualification: { rule: qualRule, result: qualResult, labels: labelsOf(qualRule, qualResult.possible) },
    ladder: {
      rule: ladderRule,
      result: ladderResult,
      steps,
      maybeNone: ladderResult.status !== "not-applicable" && possibleWithScope(ladderResult).includes(NO_OUTCOME),
    },
    support: [...new Set([...qualResult.support, ...ladderResult.support])],
    questions: deviceQuestions,
    proposalQuestions: (nav.proposal?.questions ?? []).filter(
      (q) => q.affects.includes(ladderRule.id) && !askedAtDevice.has(q.attr),
    ),
  };

  const forCheck = new Set(nav.guidanceQuestions.map((q) => q.attr));
  const forProposal = new Set((nav.proposal?.questions ?? []).map((q) => q.attr));
  const chips: ChipView[] = model.registry.attributes.map((attribute) => {
    const v = profile[attribute.id];
    const value = v === undefined ? null : v;
    return {
      attribute,
      value,
      decisive: value === null && decisive.has(attribute.id),
      forCheck: value === null && forCheck.has(attribute.id),
      forProposal: value === null && !decisive.has(attribute.id) && forProposal.has(attribute.id),
    };
  });
  const shownChip = (c: ChipView) => c.value !== null || c.decisive || c.forCheck || c.forProposal;
  return {
    device,
    branches,
    chips: {
      groups: ATTRIBUTE_GROUPS.map((group) => ({
        group,
        chips: chips.filter((c) => c.attribute.group === group && shownChip(c)),
      })).filter((g) => g.chips.length > 0),
      rest: chips.filter((c) => !shownChip(c)),
    },
    leaves,
  };
}
