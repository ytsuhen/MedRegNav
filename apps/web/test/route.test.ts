// The URL hash: a link reproduces the screen; what the data does not know is dropped.
import { describe, expect, it } from "vitest";
import { EMPTY_ROUTE, encodeRoute, parseRoute } from "../src/lib/route.ts";
import { knownIds } from "../src/state.tsx";
import { example, snapshot } from "./fixtures.ts";

const known = knownIds(snapshot);

describe("route", () => {
  it("round-trips a full screen state", () => {
    const route = {
      ...EMPTY_ROUTE,
      view: "checklist" as const,
      asOf: "2028-08-02",
      example: "heartbeat-app",
      profile: { isSoftware: true, decisionImpact: "serious-or-surgery", monitorsPhysiological: false },
      branch: "market" as const,
      selection: { kind: "obligation" as const, id: "route-iib" },
      proposals: true,
    };
    const hash = encodeRoute(route);
    expect(hash).toContain("p=isSoftware.y_decisionImpact.serious-or-surgery_monitorsPhysiological.n");
    expect(parseRoute(hash, known)).toEqual(route);
  });

  it("drops unknown attributes, values, ids and malformed dates", () => {
    const r = parseRoute(
      "#m=XX&d=2026-02-30&p=isSoftware.maybe_nope.y_decisionImpact.lethal_medicalPurpose.y&b=zzz&s=o.nope&x=nope",
      known,
    );
    expect(r).toMatchObject({ market: "EU", asOf: null, branch: null, selection: null, example: null });
    expect(r.profile).toEqual({ medicalPurpose: true });
  });

  it("opens an example's answers when a link names the example but no answers", () => {
    expect(parseRoute("#x=heartbeat-app", known).profile).toEqual(example("heartbeat-app"));
    expect(parseRoute("#x=heartbeat-app&p=", known).profile).toEqual({});
    expect(encodeRoute({ ...EMPTY_ROUTE, example: "heartbeat-app" })).toContain("p=");
  });
});
