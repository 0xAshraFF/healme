import { GLOBAL_HARMS } from "@/engine/engine";
import type { CaseDef } from "@/engine/types";
import { checksFor, getRecord, uncoveredFor, type CaseRecord } from "./caseStore";

/** Every fact a rule or debrief condition can read, grouped for the condition builder. */
export function factCatalog(def: CaseDef) {
  const orders: { key: string; label: string; kind: "bool" | "band" }[] = [];
  for (const d of def.drugs) {
    orders.push({ key: `${d.id}.given`, label: `${d.short ?? d.name} given (any route)`, kind: "bool" });
    if (d.kind !== "monitoring") orders.push({ key: `${d.id}.band`, label: `${d.short ?? d.name} dose band (highest)`, kind: "band" });
    if (d.routes.length > 1 && d.kind !== "monitoring")
      for (const r of d.routes) {
        orders.push({ key: `${d.id}@${r.id}.given`, label: `${d.short ?? d.name} ${r.label} given`, kind: "bool" });
        orders.push({ key: `${d.id}@${r.id}.band`, label: `${d.short ?? d.name} ${r.label} band`, kind: "band" });
      }
  }
  const stateKeys = new Map<string, "number" | "string" | "bool">();
  for (const s of Object.values(def.states))
    for (const [k, v] of Object.entries(s.facts)) stateKeys.set(k, typeof v === "number" ? "number" : typeof v === "boolean" ? "bool" : "string");
  const tags = [...new Set(def.drugs.flatMap((d) => d.classTags))];
  return {
    orders,
    patient: [...stateKeys].map(([key, kind]) => ({ key, label: `Patient: ${key}`, kind })),
    other: [
      { key: "treatment_delayed", label: "Treatment delayed by too many tests", kind: "bool" as const },
      { key: "diagnosis.correct", label: "Working diagnosis correct", kind: "bool" as const },
      ...tags.map((t) => ({ key: `class.${t}`, label: `Any ${t} given`, kind: "bool" as const })),
    ],
  };
}

export function editorView(rec: CaseRecord) {
  return {
    record: { id: rec.id, version: rec.version, status: rec.status, author: rec.author, reviewer: rec.reviewer, reviewNote: rec.reviewNote, history: rec.history, updatedAt: rec.updatedAt },
    def: rec.def,
    checks: checksFor(rec.def),
    facts: factCatalog(rec.def),
    globalHarms: GLOBAL_HARMS.map((g) => ({ id: g.id, reason: g.reason, drug: g.drug, route: g.route, band: g.band })),
    uncovered: uncoveredFor(rec.id),
  };
}

export type EditorView = ReturnType<typeof editorView>;

export function editorViewFor(id: string, version: number) {
  return editorView(getRecord(id, version));
}
