import type {
  Band,
  CaseDef,
  CheckpointRecord,
  Condition,
  DebriefPoint,
  DrugDef,
  HarmEntry,
  Order,
  PatientState,
  Run,
  ScoreCategory,
} from "./types";

export type Facts = Record<string, number | string | boolean | undefined>;

// ---------- Conditions ----------

export function evalCondition(c: Condition, facts: Facts): boolean {
  if ("all" in c) return c.all.every((x) => evalCondition(x, facts));
  if ("any" in c) return c.any.some((x) => evalCondition(x, facts));
  if ("not" in c) return !evalCondition(c.not, facts);
  const v = facts[c.fact];
  if (c.op === "in") return v !== undefined && c.value.includes(v);
  if (v === undefined) return c.op === "!=" ? true : false;
  switch (c.op) {
    case "==":
      return v === c.value;
    case "!=":
      return v !== c.value;
    case "<":
      return typeof v === "number" && v < (c.value as number);
    case "<=":
      return typeof v === "number" && v <= (c.value as number);
    case ">":
      return typeof v === "number" && v > (c.value as number);
    case ">=":
      return typeof v === "number" && v >= (c.value as number);
  }
}

// ---------- Orders and dose bands ----------

export function findDrug(def: CaseDef, drugId: string): DrugDef | undefined {
  return def.drugs.find((d) => d.id === drugId);
}

/** Normalizes a typed dose into a band. A dangerous route is always "dangerous". */
export function bandFor(def: CaseDef, order: Pick<Order, "drugId" | "route" | "dose">): Band {
  const drug = findDrug(def, order.drugId);
  if (!drug) return "none";
  if (drug.dangerousRoutes?.some((r) => r.id === order.route)) return "dangerous";
  const route = drug.routes.find((r) => r.id === order.route);
  if (!route) return "dangerous"; // route not allowed for this drug
  const value = route.perKg ? order.dose / def.weightKg : order.dose;
  const rounded = Math.round(value * 1000) / 1000;
  const hit = route.bands.find((b) => rounded >= b.min && rounded <= b.max);
  if (hit) return hit.band;
  // Above every authored range is dangerous; below is none.
  const maxBand = Math.max(...route.bands.map((b) => b.max));
  return rounded > maxBand ? "dangerous" : "none";
}

export interface OrderCheck {
  band: Band;
  challenge?: string;
}

/** The nurse/pharmacist challenge fires once for dangerous bands or wrong routes. */
export function checkOrder(def: CaseDef, order: Pick<Order, "drugId" | "route" | "dose">): OrderCheck {
  const band = bandFor(def, order);
  if (band !== "dangerous") return { band };
  const drug = findDrug(def, order.drugId);
  const route =
    drug?.routes.find((r) => r.id === order.route) ?? drug?.dangerousRoutes?.find((r) => r.id === order.route);
  const unit = drug?.routes.find((r) => r.id === order.route)?.unit ?? "";
  const doseText = unit ? `${order.dose} ${unit}` : `${order.dose}`;
  return {
    band,
    challenge: `${drug?.name ?? "This drug"} ${doseText} ${route?.label ?? order.route}? That is outside what we give on this ward. Please confirm.`,
  };
}

export function activeOrders(orders: Order[]): Order[] {
  return orders.filter((o) => !o.stoppedAt);
}

/** Flattens orders into facts rules can read: "<drug>.given", "<drug>.band", "<drug>.route", "class.<tag>". */
export function orderFacts(def: CaseDef, orders: Order[]): Facts {
  const facts: Facts = {};
  for (const d of def.drugs) {
    facts[`${d.id}.given`] = false;
    facts[`${d.id}.band`] = "none";
  }
  const rank: Record<Band, number> = { none: 0, low: 1, therapeutic: 2, high: 3, dangerous: 4 };
  for (const o of activeOrders(orders)) {
    const drug = findDrug(def, o.drugId);
    if (!drug) continue;
    const band = bandFor(def, o);
    const prev = facts[`${o.drugId}.band`] as Band;
    if (band !== "none") facts[`${o.drugId}.given`] = true;
    // Per-route facts, e.g. "insulin@sc.given", so rules can tell IV from SC insulin.
    const rk = `${o.drugId}@${o.route}`;
    const prevRoute = (facts[`${rk}.band`] as Band | undefined) ?? "none";
    if (band !== "none") facts[`${rk}.given`] = true;
    if (rank[band] >= rank[prevRoute]) facts[`${rk}.band`] = band;
    if (rank[band] >= rank[prev]) {
      facts[`${o.drugId}.band`] = band;
      facts[`${o.drugId}.route`] = o.route;
    }
    for (const tag of drug.classTags) facts[`class.${tag}`] = true;
  }
  return facts;
}

// ---------- Harm lists ----------

/** Global entries apply to every case; the case maps each one it can trigger to its own harm state. */
export const GLOBAL_HARMS: Omit<HarmEntry, "state">[] = [
  {
    id: "global-kcl-push",
    drug: "kcl",
    route: "iv_push",
    reason: "Undiluted potassium given as an IV push causes cardiac arrest.",
    cite: [{ source: "WHO Model Formulary", section: "Potassium chloride: concentrate must be diluted" }],
  },
  {
    id: "global-dangerous-dose",
    band: "dangerous",
    reason: "A dose in the dangerous range was given after the nurse challenged it.",
    cite: [{ source: "Case protocol", section: "Dose bands" }],
  },
];

export function harmFor(def: CaseDef, orders: Order[]): HarmEntry | null {
  const active = activeOrders(orders);
  const match = (h: Omit<HarmEntry, "state">) =>
    active.find((o) => {
      const drug = findDrug(def, o.drugId);
      if (!drug) return false;
      if (h.drug && h.drug !== o.drugId) return false;
      if (h.classTag && !drug.classTags.includes(h.classTag)) return false;
      if (h.route && h.route !== o.route) return false;
      if (h.band && bandFor(def, o) !== h.band) return false;
      return true;
    });
  for (const g of GLOBAL_HARMS) {
    const hit = match(g);
    if (!hit) continue;
    // A dangerous dose maps to the harm that drug causes (insulin -> hypo, fluid -> overload).
    const state = (g.band && def.dangerousDoseStates?.[hit.drugId]) || def.globalHarmStates[g.id];
    if (state) return { ...g, state };
  }
  for (const h of def.caseHarmList) if (match(h)) return h;
  return null;
}

// ---------- Transitions ----------

export function factsAt(def: CaseDef, rec: CheckpointRecord, state: PatientState, run: Run): Facts {
  const treated = run.records.some((r) => activeOrders(r.orders).some((o) => findDrug(def, o.drugId)?.kind !== "monitoring"));
  const t0 = run.records[0];
  const delayed = t0 ? t0.investigations.length > def.investigationBudget : false;
  return {
    ...state.facts,
    ...orderFacts(def, rec.orders),
    treatment_delayed: delayed && !!treated,
    "diagnosis.correct": t0?.diagnosis ? def.diagnoses.correct.includes(t0.diagnosis) : false,
  };
}

export interface AdvanceResult {
  stateId: string;
  ruleHit: string;
  harm?: HarmEntry;
}

/** First matching rule wins: harm list first, then authored rules by priority, then the default state. */
export function advance(def: CaseDef, run: Run, rec: CheckpointRecord): AdvanceResult {
  const transition = def.transitions.find((t) => t.from === rec.checkpoint);
  if (!transition) throw new Error(`No transition from ${rec.checkpoint}`);
  const harm = harmFor(def, rec.orders);
  if (harm) return { stateId: harm.state, ruleHit: `harm:${harm.id}`, harm };
  const state = def.states[rec.stateId];
  const facts = factsAt(def, rec, state, run);
  const rules = [...transition.rules].sort(
    (a, b) => (a.kind === "harm" ? 0 : 1) - (b.kind === "harm" ? 0 : 1) || a.priority - b.priority,
  );
  for (const r of rules) if (evalCondition(r.when, facts)) return { stateId: r.then, ruleHit: r.id };
  return { stateId: transition.defaultState, ruleHit: "default" };
}

export function isStable(def: CaseDef, state: PatientState): boolean {
  return evalCondition(def.stability, state.facts);
}

/** First checkpoint whose state meets the case's stability criteria. */
export function stableBy(def: CaseDef, run: Run): string {
  for (const r of run.records) if (isStable(def, def.states[r.stateId])) return r.checkpoint;
  return "not stabilized";
}

// ---------- Marks ----------

export interface MarkedPoint {
  point: DebriefPoint;
  matched: boolean;
}

export interface Marks {
  byCategory: Record<ScoreCategory, number>;
  total: number;
  debrief: DebriefPoint[];
}

export function marks(def: CaseDef, run: Run): Marks {
  const by: Record<ScoreCategory, number> = { assessment: 0, diagnosis: 0, management: 0, monitoring: 0, safety: 10 };
  const t0 = run.records[0];

  // Assessment: essential investigations at T0, minus 2 for ordering past the budget before treating.
  if (t0) {
    const got = def.essentialInvestigations.filter((i) => t0.investigations.includes(i)).length;
    by.assessment = Math.round((got / Math.max(1, def.essentialInvestigations.length)) * 10);
    if (t0.investigations.length > def.investigationBudget) by.assessment = Math.max(0, by.assessment - 2);
  }
  // Diagnosis.
  if (t0?.diagnosis) {
    if (def.diagnoses.correct.includes(t0.diagnosis)) by.diagnosis = 10;
    else if (def.diagnoses.acceptable.includes(t0.diagnosis)) by.diagnosis = 6;
  }
  // Safety: lose 4 per order given after a challenge, 5 for reaching a harm state,
  // 3 for each complication the patient went through on the way.
  const insisted = run.records.flatMap((r) => r.orders).filter((o) => o.insisted);
  const uniqueInsisted = new Set(insisted.map((o) => o.uid)).size;
  const harmed = run.records.some((r) => r.ruleHit?.startsWith("harm:"));
  const complications = run.records.filter((r) => {
    const s = def.states[r.stateId];
    return s.event && s.checkpoint !== "harm" && !s.outcome;
  }).length;
  by.safety = 10 - 4 * uniqueInsisted - (harmed ? 5 : 0) - 3 * complications;

  // Authored debrief points: each matched point is shown; good ones add marks, critical misses take some away.
  const shown: DebriefPoint[] = [];
  for (const p of def.debrief) {
    const rec = run.records.find((r) => r.checkpoint === p.checkpoint && r.signed);
    if (!rec) continue;
    const facts = factsAt(def, rec, def.states[rec.stateId], run);
    if (!evalCondition(p.when, facts)) continue;
    shown.push(p);
    if (p.verdict === "good" && p.category !== "safety") by[p.category] += p.points;
    if (p.verdict === "miss" && p.penalty) by[p.category] -= p.penalty;
  }

  for (const k of Object.keys(by) as ScoreCategory[]) by[k] = Math.min(10, Math.max(0, by[k]));
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  return { byCategory: by, total, debrief: shown };
}
