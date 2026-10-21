// Shared by the web tests: the real snapshot (built from data/ as the web build does) and a screen view for a
// profile on a date.
import { buildSnapshot } from "@mrn/cli/snapshot";
import { modelledMarket, navigate, type Profile } from "@mrn/core";
import { buildView } from "../src/lib/view.ts";

export const built = buildSnapshot();
export const snapshot = built.snapshot;
export const sections = built.sections;

const eu = modelledMarket(snapshot.presentation, "EU");
if (!eu) throw new Error("EU is not modelled");
export const market = eu;

export function example(id: string): Profile {
  const e = snapshot.examples.find((x) => x.id === id);
  if (!e) throw new Error(`no example ${id}`);
  return e.profile;
}

export function screen(profile: Profile, asOf = "2026-10-21", proposals = false) {
  const nav = navigate(snapshot.model, profile, { asOf, proposals });
  return { nav, view: buildView(snapshot, market, nav, profile) };
}
