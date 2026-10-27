"use client";

import { useState } from "react";
import type { Band, CaseDef, DebriefPoint, DrugDef, HarmEntry, PatientState, Rule } from "@/engine/types";
import type { EditorView } from "@/server/author";
import { ConditionEditor } from "./ConditionEditor";
import { Area, CitationEditor, Num, Sel, Txt } from "./fields";

export type Up = (fn: (d: CaseDef) => void) => void;
type P = { def: CaseDef; up: Up; view: EditorView };

const BANDS: Band[] = ["none", "low", "therapeutic", "high", "dangerous"];
const csv = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
const move = <T,>(xs: T[], i: number, d: number) => {
  const j = i + d;
  if (j < 0 || j >= xs.length) return xs;
  const c = [...xs];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
};

export function stateOptions(def: CaseDef, checkpoint?: string) {
  return Object.values(def.states)
    .filter((s) => !checkpoint || s.checkpoint === checkpoint || s.checkpoint === "harm")
    .map((s) => ({ value: s.id, label: `${s.id} (${s.checkpoint}${s.outcome ? ` · ${s.outcome}` : ""})` }));
}

/** Rename a state and every reference to it. */
export function renameState(d: CaseDef, from: string, to: string) {
  if (!to || from === to || d.states[to]) return;
  const s = d.states[from];
  delete d.states[from];
  d.states[to] = { ...s, id: to };
  const fix = (x: string) => (x === from ? to : x);
  d.initialState = fix(d.initialState);
  for (const t of d.transitions) {
    t.defaultState = fix(t.defaultState);
    for (const r of t.rules) r.then = fix(r.then);
  }
  for (const h of d.caseHarmList) h.state = fix(h.state);
  for (const k of Object.keys(d.globalHarmStates)) d.globalHarmStates[k] = fix(d.globalHarmStates[k]);
  for (const k of Object.keys(d.dangerousDoseStates ?? {})) d.dangerousDoseStates![k] = fix(d.dangerousDoseStates![k]);
}

// ---------- Overview ----------

export function Overview({ def, up }: P) {
  return (
    <>
      <p className="help">What the trainee sees first. The diagnosis stays hidden until the debrief; the bed-board line is only what the patient walked in with.</p>
      <div className="fg">
        <Txt label="Diagnosis (hidden until debrief)" value={def.diagnosisLabel} onChange={(v) => up((d) => void (d.diagnosisLabel = v))} />
        <Sel label="Level" value={def.level} options={[{ value: "intern", label: "Intern" }, { value: "mbbs", label: "MBBS Final" }, { value: "fcps1", label: "FCPS Part 1" }, { value: "fcps2", label: "FCPS Part 2" }]} onChange={(v) => up((d) => void (d.level = v))} />
        <Sel label="Sex" value={def.sex} options={["F", "M"]} onChange={(v) => up((d) => void (d.sex = v))} />
        <Num label="Age" value={def.age} onChange={(v) => up((d) => void (d.age = v))} />
        <Num label="Weight (kg)" value={def.weightKg} onChange={(v) => up((d) => void (d.weightKg = v))} />
        <Txt label="Allergy" value={def.allergy} onChange={(v) => up((d) => void (d.allergy = v))} />
        <Txt label="Ward" value={def.ward} onChange={(v) => up((d) => void (d.ward = v))} />
        <Txt label="Bed" value={def.bed} onChange={(v) => up((d) => void (d.bed = v))} />
        <Num label="Minutes to play" value={def.estMinutes} onChange={(v) => up((d) => void (d.estMinutes = v))} />
        <Num label="Pass mark (of 50)" value={def.passMark} onChange={(v) => up((d) => void (d.passMark = v))} />
      </div>
      <div className="fg wide">
        <Txt label="Bed-board line (what they came in with, never the diagnosis)" value={def.complaint} onChange={(v) => up((d) => void (d.complaint = v))} />
        <Area label="History" rows={5} value={def.history} onChange={(v) => up((d) => void (d.history = v))} help="Use {first} for the patient's first name. Names are random per session and must not hint at the diagnosis." />
        <Area label="Examination" rows={4} value={def.exam} onChange={(v) => up((d) => void (d.exam = v))} />
      </div>
      <h4>Source</h4>
      <div className="fg">
        <Txt label="Based on" value={def.source.label} onChange={(v) => up((d) => void (d.source.label = v))} placeholder="Open-access case report, journal, year" />
        <Txt label="Licence" value={def.source.license} onChange={(v) => up((d) => void (d.source.license = v))} placeholder="CC-BY 4.0" />
        <Txt label="Link" value={def.source.url} onChange={(v) => up((d) => void (d.source.url = v || undefined))} mono />
      </div>
      <p className="help">Only adapt openly licensed material (e.g. PubMed Central open-access, Cureus, Journal of Medical Case Reports). Never copy from paid question banks or textbooks.</p>
      <h4>Ancestry</h4>
      <label className="chk">
        <input
          type="checkbox"
          checked={!!def.pinnedAncestry}
          onChange={(e) => up((d) => void (d.pinnedAncestry = e.target.checked ? { origin: "", why: "" } : undefined))}
        />
        Pin the patient&apos;s ancestry (only when clinically relevant, e.g. G6PD deficiency or sickle cell)
      </label>
      {def.pinnedAncestry && (
        <div className="fg">
          <Txt label="Origin (name pool)" value={def.pinnedAncestry.origin} onChange={(v) => up((d) => void (d.pinnedAncestry!.origin = v))} />
          <Txt label="Why it matters clinically" value={def.pinnedAncestry.why} onChange={(v) => up((d) => void (d.pinnedAncestry!.why = v))} />
        </div>
      )}
    </>
  );
}

// ---------- Investigations ----------

export function Tests({ def, up }: P) {
  return (
    <>
      <p className="help">Bedside tests answer immediately. Lab tests come back at the next checkpoint, showing the patient as they were when sampled. Results are written per state.</p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Id</th>
            <th>Name</th>
            <th>Kind</th>
            <th>Essential at T0</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {def.investigations.map((t, i) => (
            <tr key={i}>
              <td>
                <input className="in mono" value={t.id} onChange={(e) => up((d) => void (d.investigations[i].id = slug(e.target.value)))} />
              </td>
              <td>
                <input className="in" value={t.name} onChange={(e) => up((d) => void (d.investigations[i].name = e.target.value))} />
              </td>
              <td>
                <select className="in" value={t.kind} onChange={(e) => up((d) => void (d.investigations[i].kind = e.target.value as "bedside" | "lab"))}>
                  <option value="bedside">bedside (now)</option>
                  <option value="lab">lab (next checkpoint)</option>
                </select>
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={def.essentialInvestigations.includes(t.id)}
                  onChange={(e) =>
                    up((d) => {
                      d.essentialInvestigations = e.target.checked ? [...d.essentialInvestigations, t.id] : d.essentialInvestigations.filter((x) => x !== t.id);
                    })
                  }
                />
              </td>
              <td>
                <button className="lnk red" onClick={() => up((d) => void d.investigations.splice(i, 1))}>
                  remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button className="bt" onClick={() => up((d) => void d.investigations.push({ id: `test_${d.investigations.length + 1}`, name: "", kind: "bedside" }))}>
          + Investigation
        </button>
        <div style={{ width: 200 }}>
          <Num label="Tests allowed before first treatment" value={def.investigationBudget} onChange={(v) => up((d) => void (d.investigationBudget = v))} />
        </div>
      </div>
    </>
  );
}

// ---------- Diagnoses ----------

export function Diagnoses({ def, up }: P) {
  const mark = (id: string) => (def.diagnoses.correct.includes(id) ? "correct" : def.diagnoses.acceptable.includes(id) ? "acceptable" : "wrong");
  return (
    <>
      <p className="help">The pick list at admission. Correct earns 10 marks, acceptable 6. The diagnosis never changes what happens to the patient; orders do.</p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Id</th>
            <th>Label</th>
            <th>Marked as</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {def.diagnoses.options.map((o, i) => (
            <tr key={i}>
              <td>
                <input className="in mono" value={o.id} onChange={(e) => up((d) => void (d.diagnoses.options[i].id = slug(e.target.value)))} />
              </td>
              <td>
                <input className="in" value={o.label} onChange={(e) => up((d) => void (d.diagnoses.options[i].label = e.target.value))} />
              </td>
              <td>
                <select
                  className="in"
                  value={mark(o.id)}
                  onChange={(e) =>
                    up((d) => {
                      d.diagnoses.correct = d.diagnoses.correct.filter((x) => x !== o.id);
                      d.diagnoses.acceptable = d.diagnoses.acceptable.filter((x) => x !== o.id);
                      if (e.target.value === "correct") d.diagnoses.correct.push(o.id);
                      if (e.target.value === "acceptable") d.diagnoses.acceptable.push(o.id);
                    })
                  }
                >
                  <option value="correct">correct (10)</option>
                  <option value="acceptable">acceptable (6)</option>
                  <option value="wrong">wrong (0)</option>
                </select>
              </td>
              <td>
                <button className="lnk red" onClick={() => up((d) => void d.diagnoses.options.splice(i, 1))}>
                  remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="bt" style={{ alignSelf: "flex-start" }} onClick={() => up((d) => void d.diagnoses.options.push({ id: `dx_${d.diagnoses.options.length + 1}`, label: "" }))}>
        + Diagnosis option
      </button>
    </>
  );
}

// ---------- Formulary & dose bands ----------

const blankDrug = (n: number, kind: DrugDef["kind"]): DrugDef =>
  kind === "monitoring"
    ? { id: `mon_${n}`, name: "", classTags: [], kind, routes: [{ id: "order", label: "order", unit: "", bands: [{ band: "therapeutic", min: 1, max: 1 }] }] }
    : { id: `drug_${n}`, name: "", classTags: [], kind, routes: [{ id: "iv", label: "IV", unit: "mg", bands: [{ band: "low", min: 0.1, max: 1 }, { band: "therapeutic", min: 1.1, max: 2 }, { band: "high", min: 2.1, max: 4 }] }] };

export function Formulary({ def, up }: P) {
  const [sel, setSel] = useState(0);
  const drug = def.drugs[sel];
  const u = (fn: (x: DrugDef) => void) => up((d) => fn(d.drugs[sel]));
  return (
    <>
      <p className="help">
        Rules read dose <b>bands</b>, never raw numbers. Anything above your highest band is <b>dangerous</b> and triggers the nurse&apos;s challenge; a route not listed here is also dangerous. Doses below every
        band count as none.
      </p>
      <div className="row">
        {def.drugs.map((x, i) => (
          <button key={i} className={`bt ${i === sel ? "pri" : ""}`} onClick={() => setSel(i)}>
            {x.short || x.name || x.id}
          </button>
        ))}
        <button className="lnk" onClick={() => up((d) => void d.drugs.push(blankDrug(d.drugs.length + 1, "drug")))}>
          + drug
        </button>
        <button className="lnk" onClick={() => up((d) => void d.drugs.push(blankDrug(d.drugs.length + 1, "fluid")))}>
          + fluid
        </button>
        <button className="lnk" onClick={() => up((d) => void d.drugs.push(blankDrug(d.drugs.length + 1, "monitoring")))}>
          + monitoring order
        </button>
      </div>
      {drug && (
        <div className="card">
          <div className="fg">
            <Txt label="Id (used in rules)" mono value={drug.id} onChange={(v) => u((x) => void (x.id = slug(v)))} />
            <Txt label="Generic name" value={drug.name} onChange={(v) => u((x) => void (x.name = v))} />
            <Txt label="Short label (chart)" value={drug.short} onChange={(v) => u((x) => void (x.short = v || undefined))} />
            <Sel label="Kind" value={drug.kind ?? "drug"} options={["drug", "fluid", "monitoring"]} onChange={(v) => u((x) => void (x.kind = v))} />
            <Txt label="Local brands (comma separated)" value={(drug.brands ?? []).join(", ")} onChange={(v) => u((x) => void (x.brands = csv(v)))} />
            <Txt label="Class tags (for harm lists)" value={drug.classTags.join(", ")} onChange={(v) => u((x) => void (x.classTags = csv(v)))} />
          </div>
          {drug.kind !== "monitoring" &&
            drug.routes.map((r, ri) => (
              <div key={ri} className="card" style={{ background: "var(--ground)" }}>
                <div className="card-h">
                  <b>Route</b>
                  <button className="lnk red" onClick={() => u((x) => void x.routes.splice(ri, 1))}>
                    remove route
                  </button>
                </div>
                <div className="fg">
                  <Txt label="Id" mono value={r.id} onChange={(v) => u((x) => void (x.routes[ri].id = slug(v)))} />
                  <Txt label="Label" value={r.label} onChange={(v) => u((x) => void (x.routes[ri].label = v))} />
                  <Txt label="Unit the doctor types" mono value={r.unit} onChange={(v) => u((x) => void (x.routes[ri].unit = v))} />
                  <label className="chk" style={{ alignSelf: "end" }}>
                    <input type="checkbox" checked={!!r.perKg} onChange={(e) => u((x) => void (x.routes[ri].perKg = e.target.checked || undefined))} />
                    Band per kg (dose ÷ {def.weightKg} kg)
                  </label>
                </div>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Band</th>
                      <th>From {r.perKg ? `(${r.unit}/kg)` : `(${r.unit})`}</th>
                      <th>To</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {r.bands.map((b, bi) => (
                      <tr key={bi}>
                        <td>
                          <select className="in" value={b.band} onChange={(e) => u((x) => void (x.routes[ri].bands[bi].band = e.target.value as Band))}>
                            {BANDS.filter((x) => x !== "dangerous").map((x) => (
                              <option key={x}>{x}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input className="in mono" value={b.min} onChange={(e) => u((x) => void (x.routes[ri].bands[bi].min = Number(e.target.value) || 0))} />
                        </td>
                        <td>
                          <input className="in mono" value={b.max} onChange={(e) => u((x) => void (x.routes[ri].bands[bi].max = Number(e.target.value) || 0))} />
                        </td>
                        <td>
                          <button className="lnk red" onClick={() => u((x) => void x.routes[ri].bands.splice(bi, 1))}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} className="help">
                        Above {Math.max(0, ...r.bands.map((b) => b.max))} {r.unit}
                        {r.perKg ? "/kg" : ""} → <b style={{ color: "var(--red)" }}>dangerous</b> (nurse challenge)
                      </td>
                    </tr>
                  </tbody>
                </table>
                <button className="lnk" style={{ alignSelf: "flex-start" }} onClick={() => u((x) => void x.routes[ri].bands.push({ band: "therapeutic", min: 0, max: 0 }))}>
                  + band
                </button>
              </div>
            ))}
          {drug.kind !== "monitoring" && (
            <div className="row">
              <button className="bt" onClick={() => u((x) => void x.routes.push({ id: "route", label: "", unit: "", bands: [] }))}>
                + Route
              </button>
              <span className="help">Always-dangerous routes:</span>
              {(drug.dangerousRoutes ?? []).map((r, i) => (
                <span key={i} className="pill harm">
                  {r.label || r.id}{" "}
                  <button className="lnk red" onClick={() => u((x) => void x.dangerousRoutes!.splice(i, 1))}>
                    ✕
                  </button>
                </span>
              ))}
              <button
                className="lnk"
                onClick={() => {
                  const label = prompt("Dangerous route label, e.g. IV push (undiluted)");
                  if (label) u((x) => void (x.dangerousRoutes = [...(x.dangerousRoutes ?? []), { id: slug(label), label }]));
                }}
              >
                + dangerous route
              </button>
            </div>
          )}
          <button className="lnk red" style={{ alignSelf: "flex-start" }} onClick={() => {
              up((d) => void d.drugs.splice(sel, 1));
              setSel(0);
            }}>
            remove {drug.name || drug.id} from this case
          </button>
        </div>
      )}
    </>
  );
}

// ---------- Harm ----------

export function Harm({ def, up, view }: P) {
  const harmStates = stateOptions(def).filter((o) => def.states[o.value]?.checkpoint === "harm");
  return (
    <>
      <p className="help">Harm is checked before any other rule. A hit sends the patient straight to the harm state you choose. Every harm state needs an outcome.</p>
      <h4>Global harms (apply to every case)</h4>
      <table className="tbl">
        <tbody>
          {view.globalHarms.map((g) => (
            <tr key={g.id}>
              <td style={{ width: "45%" }}>
                <b className="mono">{g.id}</b>
                <div className="help">{g.reason}</div>
              </td>
              <td>
                <select className="in" value={def.globalHarmStates[g.id] ?? ""} onChange={(e) => up((d) => void (d.globalHarmStates[g.id] = e.target.value))}>
                  <option value="">Choose harm state…</option>
                  {harmStates.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>Dangerous dose, per drug</h4>
      <p className="help">When a doctor insists on a dangerous dose, which harm follows? Unset drugs fall back to the global dangerous-dose state.</p>
      <table className="tbl">
        <tbody>
          {def.drugs
            .filter((x) => x.kind !== "monitoring")
            .map((x) => (
              <tr key={x.id}>
                <td>{x.short || x.name}</td>
                <td>
                  <select
                    className="in"
                    value={def.dangerousDoseStates?.[x.id] ?? ""}
                    onChange={(e) =>
                      up((d) => {
                        d.dangerousDoseStates = { ...(d.dangerousDoseStates ?? {}) };
                        if (e.target.value) d.dangerousDoseStates[x.id] = e.target.value;
                        else delete d.dangerousDoseStates[x.id];
                      })
                    }
                  >
                    <option value="">(global fallback)</option>
                    {harmStates.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      <h4>Case harm list (contraindicated for this patient)</h4>
      {def.caseHarmList.map((h, i) => (
        <HarmCard key={i} h={h} def={def} harmStates={harmStates} onChange={(fn) => up((d) => fn(d.caseHarmList[i]))} onRemove={() => up((d) => void d.caseHarmList.splice(i, 1))} />
      ))}
      <button className="bt" style={{ alignSelf: "flex-start" }} onClick={() => up((d) => void d.caseHarmList.push({ id: `harm_${d.caseHarmList.length + 1}`, classTag: "", state: "", reason: "", cite: [] }))}>
        + Contraindicated drug or class
      </button>
    </>
  );
}

function HarmCard({ h, def, harmStates, onChange, onRemove }: { h: HarmEntry; def: CaseDef; harmStates: { value: string; label: string }[]; onChange: (fn: (h: HarmEntry) => void) => void; onRemove: () => void }) {
  const byDrug = h.drug !== undefined;
  const tags = [...new Set(def.drugs.flatMap((d) => d.classTags))];
  return (
    <div className="card">
      <div className="card-h">
        <input className="in mono" style={{ maxWidth: 220 }} value={h.id} onChange={(e) => onChange((x) => void (x.id = e.target.value))} />
        <button className="lnk red" onClick={onRemove}>
          remove
        </button>
      </div>
      <div className="fg">
        <Sel
          label="Match by"
          value={byDrug ? "drug" : "class"}
          options={[{ value: "class", label: "drug class" }, { value: "drug", label: "specific drug" }]}
          onChange={(v) =>
            onChange((x) => {
              if (v === "drug") {
                x.drug = def.drugs[0]?.id ?? "";
                delete x.classTag;
              } else {
                x.classTag = "";
                delete x.drug;
              }
            })
          }
        />
        {byDrug ? (
          <Sel label="Drug" value={h.drug} options={def.drugs.map((d) => ({ value: d.id, label: d.name || d.id }))} onChange={(v) => onChange((x) => void (x.drug = v))} />
        ) : (
          <label className="f">
            <span>Class tag</span>
            <input className="mono" list="tag-list" value={h.classTag ?? ""} onChange={(e) => onChange((x) => void (x.classTag = e.target.value))} />
            <datalist id="tag-list">
              {tags.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
        )}
        <Sel label="Then the patient goes to" value={h.state} options={harmStates} onChange={(v) => onChange((x) => void (x.state = v))} />
      </div>
      <Area label="Why it's harmful (shown in the debrief)" value={h.reason} onChange={(v) => onChange((x) => void (x.reason = v))} rows={2} />
      <CitationEditor value={h.cite} onChange={(c) => onChange((x) => void (x.cite = c))} />
    </div>
  );
}

// ---------- States ----------

export function States({ def, up }: P) {
  const ids = Object.keys(def.states);
  const [sel, setSel] = useState(ids[0]);
  const s = def.states[sel] ?? def.states[ids[0]];
  const groups = [...def.checkpoints, "harm"];
  const u = (fn: (x: PatientState) => void) => up((d) => fn(d.states[s.id]));
  const add = (checkpoint: string) => {
    let n = 1;
    while (def.states[`${checkpoint}_${n}`]) n++;
    const id = `${checkpoint}_${n}`;
    const base = def.states[def.initialState];
    up((d) => {
      d.states[id] = { ...structuredClone(base ?? d.states[Object.keys(d.states)[0]]), id, checkpoint, outcome: checkpoint === "harm" || checkpoint === def.checkpoints.at(-1) ? "recovered" : undefined, event: undefined };
    });
    setSel(id);
  };
  if (!s) return <p className="help">No states yet.</p>;
  return (
    <>
      <p className="help">A state is the patient at one checkpoint: vitals, hidden facts the rules read, test results and the nurse&apos;s note. States at the last checkpoint and harm states end the case and need an outcome.</p>
      <div style={{ display: "grid", gridTemplateColumns: "200px minmax(0,1fr)", gap: 12 }}>
        <div className="card" style={{ padding: 0, gap: 0, alignSelf: "start" }}>
          {groups.map((g) => (
            <div key={g}>
              <div className="row" style={{ justifyContent: "space-between", padding: "6px 8px", background: "var(--ground)" }}>
                <b className="mono" style={{ fontSize: 12 }}>
                  {g}
                </b>
                <button className="lnk" onClick={() => add(g)}>
                  + state
                </button>
              </div>
              <div className="au-nav">
                {Object.values(def.states)
                  .filter((x) => x.checkpoint === g)
                  .map((x) => (
                    <button key={x.id} className={x.id === s.id ? "on" : ""} onClick={() => setSel(x.id)}>
                      <span className="mono" style={{ fontSize: 12 }}>
                        {x.id}
                      </span>
                      {x.outcome && <span className={`pill ${x.outcome === "recovered" ? "good" : "harm"}`}>{x.outcome}</span>}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="fg">
            <label className="f">
              <span>State id (renaming updates every rule)</span>
              <input
                className="mono"
                defaultValue={s.id}
                key={s.id}
                onBlur={(e) => {
                  const to = e.target.value.trim().replace(/[^A-Za-z0-9_]/g, "_");
                  if (to && to !== s.id && !def.states[to]) {
                    up((d) => renameState(d, s.id, to));
                    setSel(to);
                  } else e.target.value = s.id;
                }}
              />
            </label>
            <Sel label="Checkpoint" value={s.checkpoint} options={groups} onChange={(v) => u((x) => void (x.checkpoint = v))} />
            <Sel label="Outcome (ends the case)" value={(s.outcome ?? "") as never} options={[{ value: "" as never, label: "— continues —" }, ...(["recovered", "complication", "icu", "died"] as never[])]} onChange={(v) => u((x) => void (x.outcome = (v || undefined) as PatientState["outcome"]))} />
            <Txt label="Event label (for run comparison)" value={s.event} onChange={(v) => u((x) => void (x.event = v || undefined))} placeholder="e.g. Palpitations, U waves" />
          </div>
          {s.outcome && <Txt label="Outcome note (shown on the outcome document)" value={s.outcomeNote} onChange={(v) => u((x) => void (x.outcomeNote = v || undefined))} />}
          <h4>Vitals</h4>
          <div className="fg">
            {(["hr", "sbp", "dbp", "rr", "spo2", "gcs", "temp"] as const).map((k) => (
              <Num key={k} label={k.toUpperCase()} value={s.vitals[k]} onChange={(v) => u((x) => void (x.vitals[k] = v))} />
            ))}
            <Txt label="GRBS (number or HI)" value={s.vitals.grbs === undefined ? "" : String(s.vitals.grbs)} onChange={(v) => u((x) => void (x.vitals.grbs = v === "" ? undefined : Number.isFinite(Number(v)) ? Number(v) : v))} />
          </div>
          <h4>Hidden facts (rules read these)</h4>
          <FactsTable facts={s.facts} onChange={(f) => u((x) => void (x.facts = f))} />
          <h4>Nurse&apos;s note</h4>
          <div className="fg">
            <Txt label="Who" value={s.nurseNote.who} onChange={(v) => u((x) => void (x.nurseNote.who = v))} />
            <Txt label="Time" value={s.nurseNote.time} onChange={(v) => u((x) => void (x.nurseNote.time = v))} />
            <Txt label="Highlighted phrase (must appear in the note)" value={s.nurseNote.highlight} onChange={(v) => u((x) => void (x.nurseNote.highlight = v || undefined))} />
          </div>
          <Area label="Note" value={s.nurseNote.text} onChange={(v) => u((x) => void (x.nurseNote.text = v))} rows={2} />
          <h4>Test results in this state</h4>
          <table className="tbl">
            <tbody>
              {def.investigations.map((t) => (
                <tr key={t.id}>
                  <td style={{ width: "35%" }}>
                    {t.name || t.id} <span className="pill">{t.kind}</span>
                  </td>
                  <td>
                    <input className="in mono" value={s.results[t.id]?.value ?? ""} onChange={(e) => u((x) => void (x.results[t.id] = { ...(x.results[t.id] ?? {}), value: e.target.value }))} />
                  </td>
                  <td style={{ width: 90 }}>
                    <label className="chk">
                      <input type="checkbox" checked={!!s.results[t.id]?.abnormal} onChange={(e) => u((x) => void (x.results[t.id] = { value: x.results[t.id]?.value ?? "", abnormal: e.target.checked || undefined }))} />
                      abnormal
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <button
              className="lnk red"
              onClick={() => {
                const used = def.transitions.some((t) => t.defaultState === s.id || t.rules.some((r) => r.then === s.id)) || def.initialState === s.id;
                if (used && !confirm(`${s.id} is used by rules. Delete anyway?`)) return;
                up((d) => void delete d.states[s.id]);
                setSel(def.initialState);
              }}
            >
              delete state
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function FactsTable({ facts, onChange }: { facts: PatientState["facts"]; onChange: (f: PatientState["facts"]) => void }) {
  const rows = Object.entries(facts);
  const parse = (v: string) => (v === "true" ? true : v === "false" ? false : v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v);
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Fact</th>
          <th>Value</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={i}>
            <td>
              <input
                className="in mono"
                defaultValue={k}
                onBlur={(e) => {
                  const nk = e.target.value.trim();
                  if (!nk || nk === k || nk in facts) return void (e.target.value = k);
                  onChange(Object.fromEntries(rows.map(([a, b]) => (a === k ? [nk, b] : [a, b]))));
                }}
              />
            </td>
            <td>
              <input className="in mono" value={String(v)} onChange={(e) => onChange({ ...facts, [k]: parse(e.target.value) })} />
            </td>
            <td>
              <button
                className="lnk red"
                onClick={() => {
                  const c = { ...facts };
                  delete c[k];
                  onChange(c);
                }}
              >
                ✕
              </button>
            </td>
          </tr>
        ))}
        <tr>
          <td colSpan={3}>
            <button
              className="lnk"
              onClick={() => {
                let n = 1;
                while (`fact_${n}` in facts) n++;
                onChange({ ...facts, [`fact_${n}`]: 0 });
              }}
            >
              + fact
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// ---------- Rules ----------

export function Rules({ def, up, view }: P) {
  const [ti, setTi] = useState(0);
  const t = def.transitions[ti];
  if (!t) return <p className="help">No transitions.</p>;
  const ut = (fn: (x: typeof t) => void) => up((d) => fn(d.transitions[ti]));
  const opts = stateOptions(def, t.to);
  const setRules = (rules: Rule[]) => ut((x) => void (x.rules = rules.map((r, i) => ({ ...r, priority: i + 1 }))));
  const ordered = [...t.rules].sort((a, b) => (a.kind === "harm" ? 0 : 1) - (b.kind === "harm" ? 0 : 1) || a.priority - b.priority);
  return (
    <>
      <div className="row">
        {def.transitions.map((x, i) => (
          <button key={i} className={`bt ${i === ti ? "pri" : ""}`} onClick={() => setTi(i)}>
            {x.from} → {x.to}
          </button>
        ))}
      </div>
      <p className="help">
        When orders are signed at <b>{t.from}</b>, the harm lists are checked first, then these rules from top to bottom. <b>The first match wins.</b> If nothing matches, the patient goes to the default state and
        the order set is logged in the uncovered queue for you.
      </p>
      <div className="fg">
        <Txt label="Clock" value={t.clock} onChange={(v) => ut((x) => void (x.clock = v))} placeholder="02:29 → 08:29" />
        <Txt label="Headline" value={t.headline} onChange={(v) => ut((x) => void (x.headline = v))} />
        <Txt label="Scene" value={t.scene} onChange={(v) => ut((x) => void (x.scene = v))} />
      </div>
      {ordered.map((r) => {
        const i = t.rules.indexOf(r);
        const ur = (fn: (x: Rule) => void) => ut((x) => fn(x.rules[i]));
        return (
          <div key={i} className="card">
            <div className="card-h">
              <div className="row">
                <span className="pill">{r.kind === "harm" ? "harm" : `#${ordered.indexOf(r) + 1}`}</span>
                <input className="in mono" style={{ width: 200 }} value={r.id} onChange={(e) => ur((x) => void (x.id = e.target.value))} />
                <select className="in" style={{ width: "auto" }} value={r.kind} onChange={(e) => ur((x) => void (x.kind = e.target.value as Rule["kind"]))}>
                  <option value="response">response</option>
                  <option value="harm">harm (checked first)</option>
                </select>
              </div>
              <div className="row">
                <button className="lnk" onClick={() => setRules(move(ordered, ordered.indexOf(r), -1))}>
                  ↑
                </button>
                <button className="lnk" onClick={() => setRules(move(ordered, ordered.indexOf(r), 1))}>
                  ↓
                </button>
                <button className="lnk red" onClick={() => setRules(ordered.filter((x) => x !== r))}>
                  delete
                </button>
              </div>
            </div>
            <ConditionEditor value={r.when} onChange={(c) => ur((x) => void (x.when = c))} facts={view.facts} />
            <div className="row">
              <span className="kw">THEN →</span>
              <select className="in" style={{ width: "auto", minWidth: 240 }} value={r.then} onChange={(e) => ur((x) => void (x.then = e.target.value))}>
                <option value="">Choose state…</option>
                {opts.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input className="in" style={{ flex: 1 }} placeholder="Note for reviewers (optional)" value={r.note ?? ""} onChange={(e) => ur((x) => void (x.note = e.target.value || undefined))} />
            </div>
          </div>
        );
      })}
      <button className="bt" style={{ alignSelf: "flex-start" }} onClick={() => setRules([...ordered, { id: `${t.from}-rule-${t.rules.length + 1}`.toLowerCase(), priority: 0, kind: "response", when: { all: [] }, then: "" }])}>
        + Rule
      </button>
      <div className="card" style={{ borderStyle: "dashed" }}>
        <div className="row">
          <span className="kw">OTHERWISE →</span>
          <select className="in" style={{ width: "auto", minWidth: 240 }} value={t.defaultState} onChange={(e) => ut((x) => void (x.defaultState = e.target.value))}>
            <option value="">Choose default state (required)…</option>
            {opts
              .filter((o) => def.states[o.value]?.checkpoint === t.to)
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </select>
          <span className="help">logged for review</span>
        </div>
      </div>
    </>
  );
}

// ---------- Debrief ----------

export function Debrief({ def, up, view }: P) {
  const blank = (): DebriefPoint => ({ id: `point_${def.debrief.length + 1}`, checkpoint: def.checkpoints[0], when: { all: [] }, verdict: "good", about: "general", text: "", cite: [], category: "management", points: 1 });
  return (
    <>
      <p className="help">
        Each point appears in the debrief when its condition matches the orders signed at that checkpoint. <b>Good</b> points add marks; <b>misses</b> can take marks away (penalty) for critical errors. Every point
        needs a citation.
      </p>
      {def.debrief.map((p, i) => {
        const u = (fn: (x: DebriefPoint) => void) => up((d) => fn(d.debrief[i]));
        return (
          <div key={i} className="card">
            <div className="card-h">
              <div className="row">
                <span className={`pill ${p.verdict === "good" ? "good" : "harm"}`}>{p.verdict === "good" ? "✓ good" : "✗ miss"}</span>
                <input className="in mono" style={{ width: 200 }} value={p.id} onChange={(e) => u((x) => void (x.id = e.target.value))} />
              </div>
              <div className="row">
                <button className="lnk" onClick={() => up((d) => void (d.debrief = move(d.debrief, i, -1)))}>
                  ↑
                </button>
                <button className="lnk" onClick={() => up((d) => void (d.debrief = move(d.debrief, i, 1)))}>
                  ↓
                </button>
                <button className="lnk red" onClick={() => up((d) => void d.debrief.splice(i, 1))}>
                  delete
                </button>
              </div>
            </div>
            <div className="fg">
              <Sel label="Checkpoint" value={p.checkpoint} options={def.checkpoints} onChange={(v) => u((x) => void (x.checkpoint = v))} />
              <Sel label="Verdict" value={p.verdict} options={["good", "miss"]} onChange={(v) => u((x) => void (x.verdict = v))} />
              <Sel label="About (red pen goes on this order)" value={p.about} options={[{ value: "general", label: "general" }, ...def.drugs.map((d) => ({ value: d.id, label: d.short || d.name || d.id }))]} onChange={(v) => u((x) => void (x.about = v))} />
              <Sel label="Marks category" value={p.category} options={["assessment", "diagnosis", "management", "monitoring", "safety"]} onChange={(v) => u((x) => void (x.category = v))} />
              {p.verdict === "good" ? (
                <Num label="Marks if matched" value={p.points} onChange={(v) => u((x) => void (x.points = v))} />
              ) : (
                <Num label="Penalty (critical miss)" value={p.penalty ?? 0} onChange={(v) => u((x) => void (x.penalty = v || undefined))} />
              )}
            </div>
            <ConditionEditor value={p.when} onChange={(c) => u((x) => void (x.when = c))} facts={view.facts} emptyMeans="always shown" />
            <Area label="What the consultant writes (your words)" value={p.text} onChange={(v) => u((x) => void (x.text = v))} rows={2} />
            <CitationEditor value={p.cite} onChange={(c) => u((x) => void (x.cite = c))} />
          </div>
        );
      })}
      <button className="bt" style={{ alignSelf: "flex-start" }} onClick={() => up((d) => void d.debrief.push(blank()))}>
        + Debrief point
      </button>
    </>
  );
}

// ---------- Ending ----------

export function Ending({ def, up, view }: P) {
  return (
    <>
      <h4>Stability criteria</h4>
      <p className="help">&quot;Stable by&quot; is the first checkpoint whose state meets these. Uses the state&apos;s hidden facts (e.g. ph ≥ 7.3 AND hco3 ≥ 15).</p>
      <ConditionEditor value={def.stability} onChange={(c) => up((d) => void (d.stability = c))} facts={{ ...view.facts, orders: [] }} emptyMeans="always counts as stable" />
      <h4>Viva question</h4>
      <Area label="Question (FCPS style)" value={def.vivaQuestion.q} onChange={(v) => up((d) => void (d.vivaQuestion.q = v))} rows={2} />
      <Area label="Model answer" value={def.vivaQuestion.a} onChange={(v) => up((d) => void (d.vivaQuestion.a = v))} rows={4} />
      <CitationEditor value={def.vivaQuestion.cite} onChange={(c) => up((d) => void (d.vivaQuestion.cite = c))} />
      <h4>Outcome documents</h4>
      <div className="fg wide">
        {(["recovered", "complication", "icu", "died"] as const).map((k) => (
          <Area key={k} label={k} value={def.discharge[k]} onChange={(v) => up((d) => void (d.discharge[k] = v))} rows={2} />
        ))}
      </div>
    </>
  );
}

// ---------- JSON ----------

export function Json({ def, up }: P) {
  const [text, setText] = useState(() => JSON.stringify(def, null, 2));
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <p className="help">The whole case as JSON, in the same format the import API accepts. Apply checks the JSON parses; saving checks the shape.</p>
      <textarea className="json" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <div className="row">
        <button
          className="bt"
          onClick={() => {
            try {
              const next = JSON.parse(text) as CaseDef;
              up((d) => Object.assign(d, next));
              setErr(null);
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          Apply JSON
        </button>
        <button className="lnk" onClick={() => setText(JSON.stringify(def, null, 2))}>
          reset to current
        </button>
        {err && <span style={{ color: "var(--red)" }}>{err}</span>}
      </div>
    </>
  );
}
