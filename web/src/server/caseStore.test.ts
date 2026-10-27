import { describe, expect, it } from "vitest";
import { dkaSevere } from "@/cases/dka-severe";
import {
  checksFor,
  createDraft,
  getRecord,
  importCase,
  listCases,
  newVersion,
  publish,
  saveDraft,
  sendBack,
  submitForReview,
  uncoveredFor,
} from "./caseStore";
import { act, createSession, listWard, view } from "./session";

const A = "Dr. Anika Rahman";
const R = "Dr. Samir Karim";

describe("case lifecycle", () => {
  it("seeds the built-in DKA case as published v1", () => {
    const c = listCases().find((x) => x.id === "dka-severe");
    expect(c?.liveVersion).toBe(1);
    expect(listWard().map((b) => b.id)).toContain("dka-severe");
  });

  it("a blank draft can't go to review until the checks pass", () => {
    const rec = createDraft("Acute severe asthma", A);
    expect(rec.status).toBe("draft");
    expect(checksFor(rec.def).length).toBeGreaterThan(0);
    expect(() => submitForReview(rec.id, 1, A)).toThrow(/Fix these first/);
  });

  it("saves a half-built draft and lists what is still blank", () => {
    const rec = createDraft("Snakebite", A);
    const def = structuredClone(rec.def);
    def.drugs.push({ id: "asv", name: "", classTags: [], routes: [{ id: "iv", label: "", unit: "vials", bands: [] }] });
    def.transitions[0].rules.push({ id: "r1", priority: 1, kind: "response", when: { all: [] }, then: "" });
    saveDraft(rec.id, 1, def, A);
    const checks = checksFor(getRecord(rec.id, 1).def);
    expect(checks).toContain("drug asv has no name");
    expect(checks).toContain("rule r1 has no THEN state");
  });

  it("edit, review, two-clinician sign-off, publish", () => {
    const d = newVersion("dka-severe", A);
    expect(d.version).toBe(2);
    expect(() => newVersion("dka-severe", A)).toThrow(/already a draft/);

    // Only the author edits, and only well-formed data is saved.
    expect(() => saveDraft("dka-severe", 2, d.def, R)).toThrow(/Only the author/);
    expect(() => saveDraft("dka-severe", 2, { ...d.def, age: "old" }, A)).toThrow(/Not saved/);
    saveDraft("dka-severe", 2, { ...d.def, estMinutes: 30 }, A);
    expect(getRecord("dka-severe", 2).def.estMinutes).toBe(30);

    submitForReview("dka-severe", 2, A);
    expect(() => saveDraft("dka-severe", 2, d.def, A)).toThrow(/only drafts/);
    expect(() => publish("dka-severe", 2, A, {})).toThrow(/second clinician/);

    sendBack("dka-severe", 2, R, "Mention U waves in the D2 nurse note.");
    expect(getRecord("dka-severe", 2).status).toBe("draft");
    submitForReview("dka-severe", 2, A);
    publish("dka-severe", 2, R, { note: "Thresholds match JBDS." });

    expect(getRecord("dka-severe", 2).status).toBe("published");
    expect(getRecord("dka-severe", 2).def.reviewers).toEqual([R]);
    expect(getRecord("dka-severe", 1).status).toBe("superseded");
  });

  it("a safety fix retires the old version and ends open sessions on it", () => {
    const s = createSession("dka-severe");
    expect(s.caseVersion).toBe(2);

    newVersion("dka-severe", A);
    submitForReview("dka-severe", 3, A);
    expect(() => publish("dka-severe", 3, R, { safetyFix: true })).toThrow(/Describe the safety correction/);
    publish("dka-severe", 3, R, { safetyFix: true, correctionNote: "Day 2 potassium value was wrong." });

    expect(getRecord("dka-severe", 2).status).toBe("retired");
    expect(view(s.id).retired).toMatch(/potassium value was wrong/);
    expect(() => act(s.id, { type: "investigate", id: "grbs" })).toThrow(/corrected after you started/);
    expect(createSession("dka-severe").caseVersion).toBe(3);
  });

  it("imports well-formed case JSON as a new draft and rejects bad JSON", () => {
    const rec = importCase(JSON.parse(JSON.stringify(dkaSevere)), A);
    expect(rec.id).not.toBe("dka-severe");
    expect(rec.status).toBe("draft");
    expect(rec.def.authors).toEqual([A]);
    expect(() => importCase({ id: "Bad Id!" }, A)).toThrow(/Import rejected/);
  });

  it("preview sessions play a draft and never feed the uncovered queue", () => {
    const d = createDraft("Preview test", A);
    const imported = importCase({ ...JSON.parse(JSON.stringify(dkaSevere)), id: "preview-dka" }, A);
    const s = createSession(imported.id, "x", 1);
    expect(s.preview).toBe(true);
    act(s.id, { type: "diagnose", id: "dka_severe" });
    act(s.id, { type: "sign" });
    expect(uncoveredFor(imported.id)).toEqual([]);
    expect(d.status).toBe("draft");
  });
});
