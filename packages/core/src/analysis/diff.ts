// What a revision changes in a rule: nodes, outcomes and criteria added, removed or changed (by id), and the
// attributes the rule reads. Used for the "what if" of a proposed revision.
import { canonicalJson } from "../hash.ts";
import type { DeviceIr } from "../ir/schema.ts";
import { directAttributes } from "./space.ts";

export interface Changes {
  added: string[];
  removed: string[];
  changed: string[];
}

export interface IrDiff {
  from: { id: string; revision: number };
  to: { id: string; revision: number };
  nodes: Changes;
  outcomes: Changes;
  criteria: Changes;
  attributes: { added: string[]; removed: string[] };
}

function changes<T extends { id: string }>(a: readonly T[], b: readonly T[]): Changes {
  const before = new Map(a.map((x) => [x.id, canonicalJson(x)]));
  const after = new Map(b.map((x) => [x.id, canonicalJson(x)]));
  return {
    added: [...after.keys()].filter((id) => !before.has(id)),
    removed: [...before.keys()].filter((id) => !after.has(id)),
    changed: [...after.keys()].filter((id) => before.has(id) && before.get(id) !== after.get(id)),
  };
}

export function diffRules(from: DeviceIr, to: DeviceIr): IrDiff {
  const a = directAttributes(from);
  const b = directAttributes(to);
  return {
    from: { id: from.id, revision: from.metadata.revision },
    to: { id: to.id, revision: to.metadata.revision },
    nodes: changes(from.nodes, to.nodes),
    outcomes: changes(from.outcomes, to.outcomes),
    criteria: changes(from.criteria, to.criteria),
    attributes: { added: b.filter((x) => !a.includes(x)), removed: a.filter((x) => !b.includes(x)) },
  };
}
