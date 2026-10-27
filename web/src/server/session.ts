import { activeOrders, advance, bandFor, checkOrder, findDrug, marks, stableBy } from "@/engine/engine";
import { patientName } from "@/engine/names";
import type { CaseDef, CheckpointRecord, Order, Run, Session } from "@/engine/types";
import { caseStatus, getCase, wardCases } from "./cases";
import { logUncovered } from "./caseStore";

// Pilot mode store: in memory, lost on server restart. M3 moves this to Postgres.
const g = globalThis as unknown as { __healme?: { sessions: Map<string, Session>; uncovered: string[] } };
const store = (g.__healme ??= { sessions: new Map<string, Session>(), uncovered: [] as string[] });

const uid = () => Math.random().toString(36).slice(2, 10);

export class ActionError extends Error {}

export function listWard() {
  return wardCases().map((c) => ({
    id: c.id,
    level: c.level,
    bed: c.bed,
    age: c.age,
    sex: c.sex,
    complaint: c.complaint,
    estMinutes: c.estMinutes,
    source: c.source,
  }));
}

export function createSession(caseId: string, nameSeed?: string, previewVersion?: number): Session {
  // Preview sessions let authors play an unpublished version; they never count for anything.
  const def = getCase(caseId, previewVersion);
  const id = uid() + uid();
  const run: Run = {
    id: uid(),
    label: "Run 1",
    scored: true,
    records: [{ checkpoint: def.checkpoints[0], stateId: def.initialState, investigations: [], orders: [], signed: false }],
  };
  const s: Session = {
    id,
    caseId,
    caseVersion: def.version,
    patientName: patientName(nameSeed ?? id, def.sex, def.pinnedAncestry?.origin),
    runs: [run],
    activeRunId: run.id,
    createdAt: Date.now(),
    pilot: true,
    preview: previewVersion ? true : undefined,
  };
  store.sessions.set(id, s);
  return s;
}

export function getSession(id: string): Session {
  const s = store.sessions.get(id);
  if (!s) throw new ActionError("Session not found. Pilot sessions are cleared when the server restarts.");
  return s;
}

/** Non-null when a safety correction retired this session's case version. */
function retiredNote(s: Session): string | null {
  const st = caseStatus(s.caseId, s.caseVersion);
  return st.status === "retired" ? (st.correctionNote ?? "A safety correction was published.") : null;
}

const activeRun = (s: Session) => s.runs.find((r) => r.id === s.activeRunId)!;
const current = (run: Run) => run.records[run.records.length - 1];

function editable(def: CaseDef, run: Run): CheckpointRecord {
  if (run.outcome) throw new ActionError("This run has ended.");
  const rec = current(run);
  if (rec.signed) throw new ActionError("Orders already signed for this checkpoint.");
  return rec;
}

// ---------- Actions ----------

export type Action =
  | { type: "investigate"; id: string }
  | { type: "diagnose"; id: string }
  | { type: "order"; drugId: string; route: string; dose: number; insist?: boolean }
  | { type: "stop"; uid: string }
  | { type: "sign" }
  | { type: "rewind"; runId: string; checkpoint: string }
  | { type: "switch"; runId: string };

export type ActionResult = { ok: true; challenge?: undefined } | { ok: false; challenge: string };

export function act(sessionId: string, a: Action): ActionResult {
  const s = getSession(sessionId);
  const def = getCase(s.caseId, s.caseVersion);
  const retired = retiredNote(s);
  if (retired !== null) throw new ActionError(`This case was corrected after you started: ${retired} Start it again from the ward.`);
  const run = activeRun(s);

  switch (a.type) {
    case "investigate": {
      const rec = editable(def, run);
      if (!def.investigations.some((i) => i.id === a.id)) throw new ActionError("Unknown investigation");
      if (!rec.investigations.includes(a.id)) rec.investigations.push(a.id);
      return { ok: true };
    }
    case "diagnose": {
      const rec = editable(def, run);
      if (rec.checkpoint !== def.checkpoints[0]) throw new ActionError("Diagnosis is made at admission.");
      if (!def.diagnoses.options.some((o) => o.id === a.id)) throw new ActionError("Unknown diagnosis");
      rec.diagnosis = a.id;
      return { ok: true };
    }
    case "order": {
      const rec = editable(def, run);
      const drug = findDrug(def, a.drugId);
      if (!drug) throw new ActionError("Not in this ward's formulary");
      if (!Number.isFinite(a.dose) || a.dose < 0) throw new ActionError("Enter a dose");
      const check = checkOrder(def, a);
      if (check.challenge && !a.insist) return { ok: false, challenge: check.challenge };
      rec.orders.push({
        uid: uid(),
        drugId: a.drugId,
        route: a.route,
        dose: a.dose,
        writtenAt: rec.checkpoint,
        insisted: check.challenge ? true : undefined,
        draft: true,
      });
      return { ok: true };
    }
    case "stop": {
      const rec = editable(def, run);
      const o = rec.orders.find((x) => x.uid === a.uid && !x.stoppedAt);
      if (!o) throw new ActionError("Order not found");
      // Unsigned drafts disappear; signed orders stay on the sheet, struck through.
      if (o.draft) rec.orders = rec.orders.filter((x) => x.uid !== a.uid);
      else o.stoppedAt = rec.checkpoint;
      return { ok: true };
    }
    case "sign": {
      const rec = editable(def, run);
      if (rec.checkpoint === def.checkpoints[0] && !rec.diagnosis) throw new ActionError("Pick a working diagnosis first.");
      rec.signed = true;
      for (const o of rec.orders) delete o.draft;
      const result = advance(def, run, rec);
      rec.ruleHit = result.ruleHit;
      if (result.ruleHit === "default" && !s.preview)
        logUncovered(def.id, def.version, rec.checkpoint, activeOrders(rec.orders).map((o) => `${o.drugId}@${o.route}:${bandFor(def, o)}`));
      const t = def.transitions.find((x) => x.from === rec.checkpoint)!;
      const next = def.states[result.stateId];
      // Active orders carry over to the next sheet; stopped ones stay on the record only.
      const carried: Order[] = activeOrders(rec.orders).map((o) => ({ ...o }));
      run.records.push({ checkpoint: t.to, stateId: next.id, investigations: [], orders: carried, signed: false });
      const isLast = t.to === def.checkpoints[def.checkpoints.length - 1];
      if (next.outcome) {
        run.outcome = next.outcome;
        current(run).signed = true;
      } else if (isLast) {
        run.outcome = "complication";
        current(run).signed = true;
      }
      return { ok: true };
    }
    case "rewind": {
      const src = s.runs.find((r) => r.id === a.runId);
      if (!src) throw new ActionError("Run not found");
      const idx = src.records.findIndex((r) => r.checkpoint === a.checkpoint && r.signed);
      if (idx < 0) throw new ActionError("You can only rewind to a checkpoint you have reached.");
      const copy = structuredClone(src.records.slice(0, idx + 1));
      const at = copy[idx];
      at.signed = false;
      at.ruleHit = undefined;
      const branch: Run = {
        id: uid(),
        label: `Branch ${s.runs.length + 1}`,
        scored: false,
        branchedFrom: { runId: src.id, checkpoint: a.checkpoint },
        records: copy,
      };
      s.runs.push(branch);
      s.activeRunId = branch.id;
      return { ok: true };
    }
    case "switch": {
      if (!s.runs.some((r) => r.id === a.runId)) throw new ActionError("Run not found");
      s.activeRunId = a.runId;
      return { ok: true };
    }
  }
}

// ---------- Views (what the client is allowed to see) ----------

function fill(text: string, s: Session) {
  return text.replaceAll("{first}", s.patientName.first).replaceAll("{name}", s.patientName.full);
}

function orderView(def: CaseDef, o: Order) {
  const drug = findDrug(def, o.drugId)!;
  const route = drug.routes.find((r) => r.id === o.route) ?? drug.dangerousRoutes?.find((r) => r.id === o.route);
  const unit = drug.routes.find((r) => r.id === o.route)?.unit ?? "";
  const kind = drug.kind ?? "drug";
  const text =
    kind === "monitoring"
      ? drug.name
      : `${drug.name} ${o.dose} ${unit} ${route?.label ?? o.route}`.replace(/\s+/g, " ").trim();
  const perKg = drug.routes.find((r) => r.id === o.route)?.perKg;
  return {
    uid: o.uid,
    drugId: o.drugId,
    text,
    short: kind === "monitoring" ? "" : `${drug.short ?? drug.name} ${o.dose}${unit ? ` ${unit}` : ""}`,
    calc: perKg ? `${o.dose} ${unit} ÷ ${def.weightKg} kg = ${(o.dose / def.weightKg).toFixed(2)} ${unit.replace("/h", "/kg/h")}` : undefined,
    writtenAt: o.writtenAt,
    stoppedAt: o.stoppedAt,
    insisted: !!o.insisted,
    kind,
  };
}

function recordView(def: CaseDef, run: Run, i: number) {
  const rec = run.records[i];
  const state = def.states[rec.stateId];
  const prev = i > 0 ? run.records[i - 1] : undefined;
  const prevState = prev ? def.states[prev.stateId] : undefined;

  const bedside = rec.investigations
    .map((id) => def.investigations.find((x) => x.id === id)!)
    .filter((x) => x.kind === "bedside")
    .map((x) => ({ id: x.id, name: x.name, ...state.results[x.id] }));
  const pending = rec.investigations
    .map((id) => def.investigations.find((x) => x.id === id)!)
    .filter((x) => x.kind === "lab")
    .map((x) => ({ id: x.id, name: x.name }));
  // Lab results sent at the previous checkpoint arrive now, showing the sample from then.
  const labsBack =
    prev && prevState
      ? prev.investigations
          .map((id) => def.investigations.find((x) => x.id === id)!)
          .filter((x) => x.kind === "lab")
          .map((x) => ({ id: x.id, name: x.name, sentAt: prev.checkpoint, ...prevState.results[x.id] }))
      : [];
  // Standing monitoring orders produce results at each new checkpoint.
  const monitoring: { id: string; name: string; value: string; abnormal?: boolean }[] = [];
  if (prev && activeOrders(prev.orders).some((o) => o.drugId === "mon_vbg")) {
    monitoring.push({ id: "vbg", name: "VBG (2-hourly)", ...state.results.vbg }, { id: "k_vbg", name: "K+ (on VBG)", ...state.results.k_vbg });
  }
  if (prev && activeOrders(prev.orders).some((o) => o.drugId === "mon_ketones")) {
    monitoring.push({ id: "ketones_blood", name: "Blood ketones (hourly)", ...state.results.ketones_blood });
  }

  // K+ is only charted where the player measured it.
  const kKnown =
    rec.investigations.includes("k_vbg") ||
    monitoring.some((m) => m.id === "k_vbg") ||
    (i + 1 < run.records.length && run.records[i].investigations.includes("lytes"));

  return {
    checkpoint: rec.checkpoint,
    signed: rec.signed,
    vitals: state.vitals,
    nurseNote: state.nurseNote,
    event: state.event,
    bedside,
    pending,
    labsBack,
    monitoring,
    investigations: rec.investigations,
    diagnosis: rec.diagnosis,
    orders: rec.orders.map((o) => orderView(def, o)),
    chart: { grbs: typeof state.vitals.grbs === "number" ? state.vitals.grbs : state.vitals.grbs ? 34 : null, k: kKnown ? (state.facts.k as number) : null },
  };
}

export function view(sessionId: string) {
  const s = getSession(sessionId);
  const def = getCase(s.caseId, s.caseVersion);
  const run = activeRun(s);
  const records = run.records.map((_, i) => recordView(def, run, i));
  const last = run.records[run.records.length - 1];
  const prev = run.records[run.records.length - 2];
  const t = prev ? def.transitions.find((x) => x.from === prev.checkpoint) : undefined;
  const outcomeState = run.outcome ? def.states[last.stateId] : undefined;
  return {
    sessionId: s.id,
    pilot: s.pilot,
    preview: !!s.preview,
    caseVersion: s.caseVersion,
    retired: retiredNote(s),
    patient: {
      name: s.patientName.full,
      first: s.patientName.first,
      age: def.age,
      sex: def.sex,
      weightKg: def.weightKg,
      allergy: def.allergy,
      bed: def.bed,
      ward: def.ward,
      level: def.level,
    },
    admission: {
      complaint: def.complaint,
      history: fill(def.history, s),
      exam: def.exam,
      source: def.source,
      authors: def.authors,
      reviewers: def.reviewers,
      arrival: def.states[def.initialState].vitals,
    },
    checkpoints: def.checkpoints,
    run: { id: run.id, label: run.label, scored: run.scored, outcome: run.outcome, branchedFrom: run.branchedFrom },
    runs: s.runs.map((r) => ({ id: r.id, label: r.label, scored: r.scored, outcome: r.outcome, at: current(r).checkpoint })),
    records,
    current: last.checkpoint,
    transition: t ? { clock: t.clock, headline: t.headline, scene: t.scene, from: t.from, to: t.to } : undefined,
    outcome: outcomeState
      ? {
          kind: run.outcome!,
          note: outcomeState.outcomeNote,
          event: outcomeState.event,
          endedAt: last.checkpoint,
          diagnosis: def.diagnosisLabel,
          discharge: def.discharge[run.outcome!],
          stableBy: stableBy(def, run),
          course: run.records.map((r) => def.states[r.stateId].event).filter(Boolean) as string[],
        }
      : undefined,
    catalog: {
      investigations: def.investigations,
      diagnoses: def.diagnoses.options,
      // Dose bands are rules, so they stay on the server. The client only gets names, routes and units.
      formulary: def.drugs.map((d) => ({
        id: d.id,
        name: d.name,
        brands: d.brands ?? [],
        kind: d.kind ?? "drug",
        routes: [...d.routes.map((r) => ({ id: r.id, label: r.label, unit: r.unit, perKg: !!r.perKg })), ...(d.dangerousRoutes ?? []).map((r) => ({ id: r.id, label: r.label, unit: d.routes[0]?.unit ?? "", perKg: false }))],
      })),
    },
  };
}

export type SessionView = ReturnType<typeof view>;

export function debrief(sessionId: string) {
  const s = getSession(sessionId);
  const def = getCase(s.caseId, s.caseVersion);
  const finished = s.runs.filter((r) => r.outcome);
  if (!finished.length) throw new ActionError("Finish the case to see the debrief.");
  const runs = finished.map((r) => {
    const m = marks(def, r);
    const k = (cp: string) => {
      const rec = r.records.find((x) => x.checkpoint === cp);
      return rec ? (def.states[rec.stateId].facts.k as number | undefined) : undefined;
    };
    return {
      id: r.id,
      label: r.label,
      scored: r.scored,
      outcome: r.outcome!,
      stableBy: stableBy(def, r),
      events: r.records.map((x) => def.states[x.stateId].event).filter(Boolean) as string[],
      kByCheckpoint: Object.fromEntries(def.checkpoints.map((cp) => [cp, k(cp) ?? null])),
      marks: m.byCategory,
      total: m.total,
      t0Orders: r.records[0].orders.map((o) => orderView(def, o)),
      debrief: m.debrief.map((p) => ({ id: p.id, checkpoint: p.checkpoint, verdict: p.verdict, about: p.about, text: p.text, cite: p.cite, category: p.category, points: p.points })),
      insisted: r.records.flatMap((x) => x.orders).filter((o) => o.insisted).map((o) => orderView(def, o).text),
    };
  });
  return {
    patient: s.patientName.full,
    diagnosis: def.diagnosisLabel,
    level: def.level,
    passMark: def.passMark,
    viva: def.vivaQuestion,
    // Pilot mode: peer stats need ≥30 consented scored runs per case version.
    peer: null as null | { text: string; n: number },
    runs,
  };
}

export type DebriefView = ReturnType<typeof debrief>;
