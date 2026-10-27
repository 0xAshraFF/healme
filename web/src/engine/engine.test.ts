import { describe, expect, it } from "vitest";
import { dkaSevere } from "@/cases/dka-severe";
import { bandFor } from "./engine";
import { NAME_POOLS, patientName } from "./names";
import { validateCase } from "./validate";
import { act, createSession, debrief, getSession, view } from "@/server/session";

const ESSENTIALS = ["grbs", "vbg", "k_vbg", "ketones_blood", "ecg", "lytes"];

function admit() {
  const s = createSession("dka-severe");
  for (const id of ESSENTIALS) act(s.id, { type: "investigate", id });
  act(s.id, { type: "diagnose", id: "dka_severe" });
  return s.id;
}
const order = (id: string, drugId: string, route: string, dose: number, insist = false) =>
  act(id, { type: "order", drugId, route, dose, insist });
const sign = (id: string) => act(id, { type: "sign" });
const stateOf = (id: string) => {
  const s = getSession(id);
  const run = s.runs.find((r) => r.id === s.activeRunId)!;
  return run.records[run.records.length - 1].stateId;
};

describe("DKA case content", () => {
  it("passes every publish check", () => {
    expect(validateCase(dkaSevere)).toEqual([]);
  });

  it("bands insulin by U/kg/h", () => {
    expect(bandFor(dkaSevere, { drugId: "insulin", route: "iv_infusion", dose: 5.2 })).toBe("therapeutic");
    expect(bandFor(dkaSevere, { drugId: "insulin", route: "iv_infusion", dose: 10 })).toBe("high");
    expect(bandFor(dkaSevere, { drugId: "insulin", route: "iv_infusion", dose: 30 })).toBe("dangerous");
    expect(bandFor(dkaSevere, { drugId: "insulin", route: "iv_bolus", dose: 100 })).toBe("dangerous");
    expect(bandFor(dkaSevere, { drugId: "kcl", route: "iv_push", dose: 10 })).toBe("dangerous");
  });
});

describe("treatment paths", () => {
  it("protocol care recovers by day 5 with high marks", () => {
    const id = admit();
    order(id, "nacl", "iv", 1000);
    order(id, "insulin", "iv_infusion", 5.2);
    order(id, "kcl", "in_fluid", 40);
    order(id, "glargine", "sc", 14);
    order(id, "mon_grbs", "order", 1);
    order(id, "mon_vbg", "order", 1);
    sign(id);
    expect(stateOf(id)).toBe("S6_good");
    order(id, "dex10", "iv", 125);
    sign(id);
    expect(stateOf(id)).toBe("D2_good");
    order(id, "insulin", "sc", 6);
    sign(id);
    expect(stateOf(id)).toBe("D5_recovered");
    const d = debrief(id);
    expect(d.runs[0].outcome).toBe("recovered");
    expect(d.runs[0].total).toBeGreaterThanOrEqual(40);
    expect(d.runs[0].debrief.every((p) => p.cite.length > 0)).toBe(true);
  });

  it("forgetting potassium leads to hypokalaemia on day 2", () => {
    const id = admit();
    order(id, "nacl", "iv", 1000);
    order(id, "insulin", "iv_infusion", 5.2);
    order(id, "mon_grbs", "order", 1);
    sign(id);
    expect(stateOf(id)).toBe("S6_lowK");
    order(id, "dex10", "iv", 125);
    sign(id);
    expect(stateOf(id)).toBe("D2_hypoK");
    order(id, "kcl", "in_fluid", 40);
    sign(id);
    expect(stateOf(id)).toBe("D5_complication");
    const d = debrief(id);
    expect(d.runs[0].debrief.map((p) => p.id)).toContain("kcl-miss");
    // A missed-potassium run must score well below a protocol run.
    expect(d.runs[0].total).toBeLessThan(40);
    expect(d.runs[0].marks.safety).toBeLessThanOrEqual(7);
  });

  it("no insulin infusion means acidosis does not improve, then ICU", () => {
    const id = admit();
    order(id, "nacl", "iv", 1000);
    order(id, "insulin", "sc", 10);
    sign(id);
    expect(stateOf(id)).toBe("S6_ketotic");
    sign(id);
    expect(stateOf(id)).toBe("D2_icu");
    expect(getSession(id).runs[0].outcome).toBe("icu");
  });

  it("the nurse challenges a 100 U bolus; insisting causes harm", () => {
    const id = admit();
    const r = order(id, "insulin", "iv_bolus", 100);
    expect(r.ok).toBe(false);
    expect(r.challenge).toMatch(/confirm/i);
    order(id, "insulin", "iv_bolus", 100, true);
    order(id, "nacl", "iv", 1000);
    sign(id);
    expect(stateOf(id)).toBe("H_hypo");
    const d = debrief(id);
    expect(d.runs[0].marks.safety).toBeLessThanOrEqual(1);
  });

  it("IV push potassium kills", () => {
    const id = admit();
    order(id, "kcl", "iv_push", 20, true);
    sign(id);
    expect(stateOf(id)).toBe("H_arrest");
    expect(getSession(id).runs[0].outcome).toBe("died");
  });

  it("a diuretic in a dry patient triggers the case harm list", () => {
    const id = admit();
    order(id, "nacl", "iv", 1000);
    order(id, "insulin", "iv_infusion", 5.2);
    order(id, "furosemide", "iv", 40);
    sign(id);
    expect(stateOf(id)).toBe("H_shock");
  });
});

describe("rewind", () => {
  it("creates a practice branch and keeps the scored run", () => {
    const id = admit();
    order(id, "nacl", "iv", 1000);
    order(id, "insulin", "iv_infusion", 5.2);
    sign(id);
    sign(id);
    sign(id);
    const s = getSession(id);
    const run1 = s.runs[0];
    expect(run1.outcome).toBeDefined();
    act(id, { type: "rewind", runId: run1.id, checkpoint: "T0" });
    expect(s.runs).toHaveLength(2);
    expect(s.runs[1].scored).toBe(false);
    order(id, "kcl", "in_fluid", 40);
    sign(id);
    expect(stateOf(id)).toBe("S6_good");
    // The scored run is untouched.
    expect(s.runs[0].records[1].stateId).toBe("S6_lowK");
  });
});

describe("what the client sees", () => {
  it("never receives hidden states, rules or bands before the outcome", () => {
    const id = admit();
    const json = JSON.stringify(view(id));
    for (const secret of ["S6_good", "t0-good", "therapeutic", "dangerous", "D2_hypoK", "facts"]) expect(json).not.toContain(secret);
  });
});

describe("patient names", () => {
  it("are stable per session and drawn from many origins", () => {
    expect(patientName("abc", "F")).toEqual(patientName("abc", "F"));
    const origins = new Set(Array.from({ length: 400 }, (_, i) => patientName(`s${i}`, i % 2 ? "F" : "M").origin));
    expect(origins.size).toBeGreaterThanOrEqual(Math.min(20, NAME_POOLS.length));
  });
});
