import { z } from "zod";
import type { CaseDef, Condition } from "./types";

// Shape check for case JSON coming from the authoring tool or the import API.
// Clinical/publish checks live in validate.ts; this only guarantees the data is well formed.

const band = z.enum(["none", "low", "therapeutic", "high", "dangerous"]);
// Drafts may hold blanks while a doctor is still writing; publish checks catch them.
const citation = z.object({ source: z.string(), section: z.string(), year: z.number().int().optional(), url: z.string().url().optional() });

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(conditionSchema) }),
    z.object({ any: z.array(conditionSchema) }),
    z.object({ not: conditionSchema }),
    z.object({ fact: z.string().min(1), op: z.literal("in"), value: z.array(z.union([z.number(), z.string(), z.boolean()])) }),
    z.object({ fact: z.string().min(1), op: z.enum(["==", "!=", "<", "<=", ">", ">="]), value: z.union([z.number(), z.string(), z.boolean()]) }),
  ]),
);

const factValue = z.union([z.number(), z.string(), z.boolean()]);
const vitals = z.object({
  hr: z.number(),
  sbp: z.number(),
  dbp: z.number(),
  rr: z.number(),
  spo2: z.number(),
  gcs: z.number().optional(),
  temp: z.number().optional(),
  grbs: z.union([z.number(), z.string()]).optional(),
});

const state = z.object({
  id: z.string().min(1),
  checkpoint: z.string().min(1),
  facts: z.record(factValue),
  vitals,
  results: z.record(z.object({ value: z.string(), abnormal: z.boolean().optional() })),
  nurseNote: z.object({ who: z.string(), time: z.string(), text: z.string(), highlight: z.string().optional() }),
  outcome: z.enum(["recovered", "complication", "icu", "died"]).optional(),
  outcomeNote: z.string().optional(),
  event: z.string().optional(),
});

const route = z.object({
  id: z.string().min(1),
  label: z.string(),
  unit: z.string(),
  perKg: z.boolean().optional(),
  bands: z.array(z.object({ band, min: z.number(), max: z.number() })),
});

const drug = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/, "lowercase letters, digits and _ only"),
  name: z.string(),
  short: z.string().optional(),
  brands: z.array(z.string()).optional(),
  classTags: z.array(z.string()),
  routes: z.array(route).min(1),
  dangerousRoutes: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
  kind: z.enum(["drug", "fluid", "monitoring"]).optional(),
});

const harm = z.object({
  id: z.string().min(1),
  drug: z.string().optional(),
  classTag: z.string().optional(),
  route: z.string().optional(),
  band: band.optional(),
  state: z.string(),
  reason: z.string(),
  cite: z.array(citation),
});

const rule = z.object({
  id: z.string().min(1),
  priority: z.number(),
  kind: z.enum(["harm", "response"]),
  when: conditionSchema,
  then: z.string(),
  note: z.string().optional(),
});

export const caseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "lowercase letters, digits and - only"),
  version: z.number().int().positive(),
  level: z.enum(["intern", "mbbs", "fcps1", "fcps2"]),
  diagnosisLabel: z.string(),
  sex: z.enum(["F", "M"]),
  age: z.number().int().min(0).max(120),
  weightKg: z.number().positive(),
  allergy: z.string(),
  ward: z.string(),
  bed: z.string(),
  estMinutes: z.number().int().positive(),
  complaint: z.string(),
  history: z.string(),
  exam: z.string(),
  source: z.object({ label: z.string(), license: z.string(), url: z.string().optional() }),
  authors: z.array(z.string()),
  reviewers: z.array(z.string()),
  pinnedAncestry: z.object({ origin: z.string(), why: z.string() }).optional(),
  investigations: z.array(z.object({ id: z.string().min(1), name: z.string(), kind: z.enum(["bedside", "lab"]) })),
  essentialInvestigations: z.array(z.string()),
  investigationBudget: z.number().int().min(0),
  diagnoses: z.object({
    options: z.array(z.object({ id: z.string().min(1), label: z.string() })),
    correct: z.array(z.string()),
    acceptable: z.array(z.string()),
  }),
  drugs: z.array(drug),
  caseHarmList: z.array(harm),
  globalHarmStates: z.record(z.string()),
  dangerousDoseStates: z.record(z.string()).optional(),
  checkpoints: z.array(z.string().min(1)).min(2),
  initialState: z.string(),
  states: z.record(state),
  transitions: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      rules: z.array(rule),
      defaultState: z.string(),
      clock: z.string(),
      headline: z.string(),
      scene: z.string(),
    }),
  ),
  stability: conditionSchema,
  debrief: z.array(
    z.object({
      id: z.string().min(1),
      checkpoint: z.string(),
      when: conditionSchema,
      verdict: z.enum(["good", "miss"]),
      about: z.string(),
      text: z.string(),
      cite: z.array(citation),
      category: z.enum(["assessment", "diagnosis", "management", "monitoring", "safety"]),
      points: z.number(),
      penalty: z.number().optional(),
    }),
  ),
  vivaQuestion: z.object({ q: z.string(), a: z.string(), cite: z.array(citation) }),
  passMark: z.number().int().min(0).max(50),
  discharge: z.object({ recovered: z.string(), complication: z.string(), icu: z.string(), died: z.string() }),
});

export function parseCase(input: unknown): { ok: true; def: CaseDef } | { ok: false; errors: string[] } {
  const r = caseSchema.safeParse(input);
  if (r.success) return { ok: true, def: r.data as CaseDef };
  return { ok: false, errors: r.error.issues.slice(0, 30).map((i) => `${i.path.join(".") || "case"}: ${i.message}`) };
}
