// The screen's state in the URL hash, so a link shows the same device on the same date:
//   #m=EU&v=map&d=2026-10-21&x=heartbeat-app&p=isSoftware.y_decisionImpact.serious-or-surgery&b=market&s=o.route-iia
// p: known answers as attr.value joined by "_" (booleans y/n); s: the card (o.<obligation>, r.<rule>, x = device).
// The guided run (DECISIONS U13): g = its position (0 the blank sheet, k after step k), gt = the description it walks
// towards (as p), ga = the answers given during the run (as p, "~" for "don't know"); p is then the step's answers.
// Anything unknown to the data (an attribute, a value, an id) is dropped when the hash is read.
import { type AttributeRegistry, type AttributeValue, BRANCHES, type Branch, domain, type Profile } from "@mrn/core";
import type { Lang } from "../i18n/dict.ts";
import { isIsoDate } from "./dates.ts";

export type Market = "EU" | "US";
export type View = "map" | "checklist";
export type Selection = { kind: "obligation"; id: string } | { kind: "rule"; id: string } | { kind: "device" };

/** Answers given during the guided run: a value, or null for "don't know". */
export type GivenAnswers = Record<string, AttributeValue | null>;

/** The guided run's place in a link: the description, the answers given on the way, the position. */
export interface GuidedRoute {
  target: Profile;
  answers: GivenAnswers;
  at: number;
}

export interface Route {
  market: Market;
  /** null: the default for the screen (the map, or the checklist on a narrow screen). */
  view: View | null;
  /** null: today. */
  asOf: string | null;
  example: string | null;
  profile: Profile;
  branch: Branch | null;
  selection: Selection | null;
  proposals: boolean;
  lang: Lang | null;
  guided: GuidedRoute | null;
}

export interface KnownIds {
  registry: AttributeRegistry;
  /** A link that names an example but no answers (no p=) opens the example's answers. */
  examples: readonly { id: string; profile: Profile }[];
  obligations: readonly string[];
  rules: readonly string[];
}

export const EMPTY_ROUTE: Route = {
  market: "EU",
  view: null,
  asOf: null,
  example: null,
  profile: {},
  branch: null,
  selection: null,
  proposals: false,
  lang: null,
  guided: null,
};

const encodeValue = (v: AttributeValue) => (v === true ? "y" : v === false ? "n" : v);
const UNKNOWN = "~";

export function encodeProfile(profile: Profile): string {
  return Object.entries(profile)
    .filter((e): e is [string, AttributeValue] => e[1] !== null && e[1] !== undefined)
    .map(([k, v]) => `${k}.${encodeValue(v)}`)
    .join("_");
}

/** Answers given during the guided run, "don't know" as "~". */
export function encodeAnswers(answers: GivenAnswers): string {
  return Object.entries(answers)
    .map(([k, v]) => `${k}.${v === null ? UNKNOWN : encodeValue(v)}`)
    .join("_");
}

function parsePairs(text: string, registry: AttributeRegistry, unknown: boolean): GivenAnswers {
  const byId = new Map(registry.attributes.map((a) => [a.id, a]));
  const out: GivenAnswers = {};
  for (const part of text.split("_")) {
    const dot = part.indexOf(".");
    if (dot <= 0) continue;
    const attribute = byId.get(part.slice(0, dot));
    const raw = part.slice(dot + 1);
    if (!attribute) continue;
    if (unknown && raw === UNKNOWN) {
      out[attribute.id] = null;
      continue;
    }
    const value: AttributeValue = attribute.type === "boolean" ? raw === "y" : raw;
    if (attribute.type === "boolean" && raw !== "y" && raw !== "n") continue;
    if (domain(attribute).includes(value)) out[attribute.id] = value;
  }
  return out;
}

export function parseProfile(text: string, registry: AttributeRegistry): Profile {
  return parsePairs(text, registry, false);
}

export function parseAnswers(text: string, registry: AttributeRegistry): GivenAnswers {
  return parsePairs(text, registry, true);
}

export function encodeRoute(route: Route): string {
  const params = new URLSearchParams();
  params.set("m", route.market);
  if (route.view) params.set("v", route.view);
  if (route.asOf) params.set("d", route.asOf);
  if (route.example) params.set("x", route.example);
  const profile = encodeProfile(route.profile);
  if (profile || route.example) params.set("p", profile);
  if (route.branch) params.set("b", route.branch);
  if (route.selection)
    params.set("s", route.selection.kind === "device" ? "x" : `${route.selection.kind[0]}.${route.selection.id}`);
  if (route.proposals) params.set("w", "1");
  if (route.lang) params.set("l", route.lang);
  if (route.guided) {
    params.set("g", String(route.guided.at));
    params.set("gt", encodeProfile(route.guided.target));
    const answers = encodeAnswers(route.guided.answers);
    if (answers) params.set("ga", answers);
  }
  return `#${params.toString().replaceAll("%2C", ",").replaceAll("%7E", "~")}`;
}

export function parseRoute(hash: string, known: KnownIds): Route {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const pick = <T extends string>(value: string | null, allowed: readonly T[]): T | null =>
    value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
  const d = params.get("d");
  const s = params.get("s") ?? "";
  let selection: Selection | null = null;
  if (s === "x") selection = { kind: "device" };
  else if (s.startsWith("o.") && known.obligations.includes(s.slice(2)))
    selection = { kind: "obligation", id: s.slice(2) };
  else if (s.startsWith("r.") && known.rules.includes(s.slice(2))) selection = { kind: "rule", id: s.slice(2) };
  const example = known.examples.find((e) => e.id === params.get("x")) ?? null;
  const profile = params.has("p")
    ? parseProfile(params.get("p") ?? "", known.registry)
    : example
      ? { ...example.profile }
      : {};
  const at = Number(params.get("g"));
  const guided: GuidedRoute | null =
    params.has("g") && Number.isInteger(at) && at >= 0
      ? {
          target: parseProfile(params.get("gt") ?? "", known.registry),
          answers: parseAnswers(params.get("ga") ?? "", known.registry),
          at,
        }
      : null;
  return {
    guided,
    market: pick(params.get("m"), ["EU", "US"] as const) ?? "EU",
    view: pick(params.get("v"), ["map", "checklist"] as const),
    asOf: d && isIsoDate(d) ? d : null,
    example: example?.id ?? null,
    profile,
    branch: pick(params.get("b"), BRANCHES),
    selection,
    proposals: params.get("w") === "1",
    lang: pick(params.get("l"), ["uk", "en"] as const),
  };
}
