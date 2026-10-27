// HealMe case format, v1. Cases are plain JSON-compatible data authored by clinicians.
// Outcomes come only from these rules; nothing here is generated at runtime.

export type Band = "none" | "low" | "therapeutic" | "high" | "dangerous";
export type Level = "intern" | "mbbs" | "fcps1" | "fcps2";
export type CheckpointId = string; // e.g. "T0", "6h", "D2", "D5"
export type Sex = "F" | "M";
export type Outcome = "recovered" | "complication" | "icu" | "died";
export type ScoreCategory = "assessment" | "diagnosis" | "management" | "monitoring" | "safety";

export interface Citation {
  source: string; // e.g. "JBDS-IP: Management of DKA in adults"
  section: string; // e.g. "Potassium replacement"
  year?: number;
  url?: string;
}

/** A condition over facts. Facts are flat keys like "kcl.band", "k", "insulin.given". */
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { fact: string; op: "==" | "!=" | "<" | "<=" | ">" | ">="; value: number | string | boolean }
  | { fact: string; op: "in"; value: (number | string | boolean)[] };

export interface DoseBandRange {
  band: Band;
  min: number; // inclusive
  max: number; // inclusive
}

export interface RouteDef {
  id: string; // "iv_infusion", "iv_bolus", "sc", "in_fluid", "iv_push", "oral", "iv"
  label: string;
  unit: string; // unit the player types, e.g. "U/h", "mmol/L", "mL/h", "mg"
  /** When set, the typed dose is divided by weight before banding (e.g. U/h -> U/kg/h). */
  perKg?: boolean;
  bands: DoseBandRange[];
}

export interface DrugDef {
  id: string;
  name: string; // generic name
  /** Short label for charts, e.g. "NaCl 0.9%". */
  short?: string;
  brands?: string[]; // local brand names shown in search
  classTags: string[]; // used by harm lists
  routes: RouteDef[];
  /** Routes that are always dangerous for this drug (e.g. KCl IV push). */
  dangerousRoutes?: { id: string; label: string }[];
  kind?: "drug" | "fluid" | "monitoring";
}

export interface HarmEntry {
  id: string;
  /** Match by drug id or class tag; optionally only for a route or band. */
  drug?: string;
  classTag?: string;
  route?: string;
  band?: Band;
  /** State the patient moves to at the next checkpoint. */
  state: string;
  reason: string;
  cite: Citation[];
}

export interface Vitals {
  hr: number;
  sbp: number;
  dbp: number;
  rr: number;
  spo2: number;
  gcs?: number;
  temp?: number;
  grbs?: number | string;
}

export interface Investigation {
  id: string;
  name: string;
  kind: "bedside" | "lab";
}

export interface PatientState {
  id: string;
  checkpoint: CheckpointId;
  /** Hidden facts used by rules and labs (e.g. k: 3.1, ph: 7.21). Never sent to the client wholesale. */
  facts: Record<string, number | string | boolean>;
  vitals: Vitals;
  /** Result text per investigation id, as it would read if sampled now. */
  results: Record<string, { value: string; abnormal?: boolean }>;
  nurseNote: { who: string; time: string; text: string; highlight?: string };
  /** Set when this state ends the case early or at the last checkpoint. */
  outcome?: Outcome;
  outcomeNote?: string;
  /** Short label used in run comparisons, e.g. "Palpitations, U waves". */
  event?: string;
}

export interface Rule {
  id: string;
  priority: number; // lower runs first
  kind: "harm" | "response";
  when: Condition;
  then: string; // state id
  note?: string;
}

export interface Transition {
  from: CheckpointId;
  to: CheckpointId;
  rules: Rule[];
  /** Mandatory: where unmatched order sets go. Every hit is logged for authors. */
  defaultState: string;
  /** Clock label for the transition screen, e.g. "02:29 → 08:29". */
  clock: string;
  headline: string; // "6 hours later"
  scene: string; // "Ward round. Night nurse handing over."
}

export interface DebriefPoint {
  id: string;
  checkpoint: CheckpointId;
  when: Condition;
  verdict: "good" | "miss";
  /** Which order line this comment attaches to (drug id), or "general". */
  about: string;
  text: string;
  cite: Citation[];
  category: ScoreCategory;
  points: number; // marks awarded when verdict is good and condition matches
  /** Marks taken off the category when a critical miss matches (e.g. no potassium in DKA). */
  penalty?: number;
}

export interface CaseDef {
  id: string;
  version: number;
  level: Level;
  /** Hidden until debrief. */
  diagnosisLabel: string;
  sex: Sex;
  age: number;
  weightKg: number;
  allergy: string;
  ward: string;
  bed: string;
  estMinutes: number;
  /** Text shown on the bed board: what the patient walked in with. Never the diagnosis. */
  complaint: string;
  /** May contain {first} and {name} placeholders. */
  history: string;
  exam: string;
  source: { label: string; license: string; url?: string };
  authors: string[];
  reviewers: string[];
  /** Set only where ancestry is clinically relevant; otherwise the name is random. */
  pinnedAncestry?: { origin: string; why: string };
  investigations: Investigation[];
  /** Investigations a careful doctor orders at T0 (used for the Assessment mark). */
  essentialInvestigations: string[];
  investigationBudget: number;
  diagnoses: { options: { id: string; label: string }[]; correct: string[]; acceptable: string[] };
  drugs: DrugDef[];
  caseHarmList: HarmEntry[];
  /** Maps each global harm entry id this case can trigger to the case's own harm state. */
  globalHarmStates: Record<string, string>;
  /** Per-drug harm state for a dangerous dose; falls back to globalHarmStates["global-dangerous-dose"]. */
  dangerousDoseStates?: Record<string, string>;
  checkpoints: CheckpointId[];
  initialState: string;
  states: Record<string, PatientState>;
  transitions: Transition[];
  stability: Condition;
  debrief: DebriefPoint[];
  vivaQuestion: { q: string; a: string; cite: Citation[] };
  passMark: number; // out of 50
  discharge: Record<Outcome, string>;
}

// ---------- Session (server-side) ----------

export interface Order {
  uid: string;
  drugId: string;
  route: string;
  dose: number;
  note?: string;
  /** Set when the player insisted after a nurse challenge. */
  insisted?: boolean;
  writtenAt: CheckpointId;
  stoppedAt?: CheckpointId;
  /** Unsigned order written on the current sheet; removing it leaves no trace. */
  draft?: boolean;
}

export interface CheckpointRecord {
  checkpoint: CheckpointId;
  stateId: string;
  investigations: string[]; // ordered at this checkpoint
  orders: Order[]; // orders active when signed at this checkpoint
  signed: boolean;
  diagnosis?: string;
  ruleHit?: string; // rule id or "default"
}

export interface Run {
  id: string;
  label: string; // "Run 1" or "Branch 2"
  scored: boolean;
  branchedFrom?: { runId: string; checkpoint: CheckpointId };
  records: CheckpointRecord[];
  outcome?: Outcome;
}

export interface Session {
  id: string;
  caseId: string;
  caseVersion: number;
  patientName: { first: string; last: string; full: string; origin: string };
  runs: Run[];
  activeRunId: string;
  createdAt: number;
  pilot: true;
  /** An author playing an unpublished version. Never logged or counted. */
  preview?: boolean;
}
