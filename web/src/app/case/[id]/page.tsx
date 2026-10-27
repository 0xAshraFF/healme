"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { api, HoldButton, NurseNote, ObsChart, PatientHeader, TimeRail, VitalsStrip } from "@/components/ui";
import type { SessionView } from "@/server/session";

type Stage = "admission" | "investigate" | "diagnose" | "orders" | "checkpoint";
type Rec = SessionView["records"][number];
type Drug = SessionView["catalog"]["formulary"][number];
type Pending = { drugId: string; route: string; dose: number; text: string };

export default function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [v, setV] = useState<SessionView | null>(null);
  const [stage, setStage] = useState<Stage>("admission");
  const [err, setErr] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState<SessionView["transition"] | null>(null);
  const [rewindOpen, setRewindOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState<Partial<Pending> | null>(null);
  const [challenge, setChallenge] = useState<(Pending & { msg: string }) | null>(null);

  useEffect(() => {
    api<SessionView>(`/api/session/${id}`)
      .then((view) => {
        setV(view);
        // Reopen where the player left off.
        const r = view.records[view.records.length - 1];
        if (view.current !== view.checkpoints[0]) setStage("checkpoint");
        else if (r.orders.length || r.diagnosis) setStage("orders");
        else if (r.investigations.length) setStage("investigate");
      })
      .catch((e) => setErr(e.message));
  }, [id]);

  const send = useCallback(
    async (action: Record<string, unknown>) => {
      setErr(null);
      try {
        const res = await api<{ result: { ok: boolean; challenge?: string }; view: SessionView }>(`/api/session/${id}`, action);
        setV(res.view);
        return res;
      } catch (e) {
        setErr((e as Error).message);
        return null;
      }
    },
    [id],
  );

  if (!v)
    return (
      <main className="screen">
        <div className="body">
          {err ? (
            <>
              <p className="err">{err}</p>
              <Link className="btn sec" href="/">
                Back to the ward
              </Link>
            </>
          ) : (
            <p className="muted">Opening the notes…</p>
          )}
        </div>
      </main>
    );

  const rec = v.records[v.records.length - 1];
  const isT0 = v.current === v.checkpoints[0];
  const done = v.records.filter((r) => r.signed).map((r) => r.checkpoint);
  const signedCps = v.records.filter((r) => r.signed && v.checkpoints.includes(r.checkpoint)).map((r) => r.checkpoint);

  const sign = async () => {
    const res = await send({ type: "sign" });
    if (!res) return;
    setChallenge(null);
    setAdvancing(res.view.transition ?? null);
    window.setTimeout(() => {
      setAdvancing(null);
      setStage("checkpoint");
      window.scrollTo(0, 0);
    }, 1400);
  };

  const addOrder = async (p: Pending, insist = false) => {
    const res = await send({ type: "order", drugId: p.drugId, route: p.route, dose: p.dose, insist });
    if (!res) return;
    if (!res.result.ok && res.result.challenge) setChallenge({ ...p, msg: res.result.challenge });
    else setChallenge(null);
    setEntryOpen(null);
  };

  const rewind = async (checkpoint: string) => {
    const res = await send({ type: "rewind", runId: v.run.id, checkpoint });
    if (!res) return;
    setRewindOpen(false);
    setStage("orders");
  };

  if (v.retired)
    return (
      <main className="screen">
        <div className="body" style={{ paddingTop: 24 }}>
          <h1 className="h2">This case was corrected</h1>
          <div className="challenge">
            <div className="who">Safety correction</div>
            {v.retired}
          </div>
          <p className="p">Your session on the old version has ended and won&apos;t count. The corrected case is on the ward now.</p>
        </div>
        <div className="foot">
          <Link className="btn" href="/">
            Back to the ward
          </Link>
        </div>
      </main>
    );

  const header = (
    <>
      {v.preview && (
        <div className="branchbar" style={{ background: "var(--blue)", color: "var(--on-blue)" }}>
          <span>Author preview · v{v.caseVersion}</span>
          <span className="mono" style={{ fontWeight: 400 }}>
            not scored or logged
          </span>
        </div>
      )}
      {!v.run.scored && (
        <div className="branchbar">
          <span>{v.run.label} · practice</span>
          <button
            onClick={async () => {
              const scored = v.runs.find((r) => r.scored);
              if (scored) {
                await send({ type: "switch", runId: scored.id });
                setStage("checkpoint");
              }
            }}
          >
            Back to scored run
          </button>
        </div>
      )}
      <PatientHeader name={v.patient.name} bed={v.patient.bed} age={v.patient.age} sex={v.patient.sex} weightKg={v.patient.weightKg} allergy={v.patient.allergy} level={v.patient.level} />
      <TimeRail
        checkpoints={v.checkpoints}
        current={v.current}
        done={done}
        onRewind={() => setRewindOpen(true)}
        canRewind={signedCps.length > 0}
      />
    </>
  );

  if (advancing)
    return (
      <div className="advance" aria-live="polite">
        <div className="mono muted" style={{ fontSize: 12 }}>
          {advancing.clock}
        </div>
        <div className="big">{advancing.headline}</div>
        <div className="bar">
          <i />
        </div>
        <div className="muted">{advancing.scene}</div>
      </div>
    );

  // ---------- Outcome ----------
  if (v.outcome)
    return (
      <main className="screen">
        {header}
        <div className="body slide-up">
          <OutcomeDoc v={v} />
        </div>
        <div className="foot">
          <button className="btn sec" onClick={() => setRewindOpen(true)}>
            Rewind
          </button>
          <Link className="btn" href={`/case/${id}/debrief`}>
            Consultant&apos;s review
          </Link>
        </div>
        {rewindOpen && <RewindSheet v={v} onClose={() => setRewindOpen(false)} onPick={rewind} />}
      </main>
    );

  // ---------- Live checkpoint ----------
  return (
    <main className="screen">
      {header}
      <div className="body" key={`${v.run.id}-${v.current}-${stage}`}>
        {stage === "admission" && <Admission v={v} />}
        {stage === "checkpoint" && <Checkpoint v={v} rec={rec} />}
        {stage === "investigate" && <Investigate v={v} rec={rec} onOrder={(inv) => send({ type: "investigate", id: inv })} isT0={isT0} />}
        {stage === "diagnose" && <Diagnose v={v} rec={rec} onPick={(d) => send({ type: "diagnose", id: d })} />}
        {stage === "orders" && (
          <OrderSheet
            v={v}
            rec={rec}
            challenge={challenge}
            onStop={(uid) => send({ type: "stop", uid })}
            onAdd={() => setEntryOpen({})}
            onChange={() => {
              if (challenge) setEntryOpen(challenge);
              setChallenge(null);
            }}
            onInsist={() => challenge && addOrder(challenge, true)}
          />
        )}
        {err && <p className="err">{err}</p>}
      </div>

      <div className="foot">
        {stage === "admission" && (
          <button className="btn" onClick={() => setStage("investigate")}>
            Examine &amp; investigate
          </button>
        )}
        {stage === "checkpoint" && (
          <>
            <button className="btn sec" onClick={() => setStage("investigate")}>
              Investigate
            </button>
            <button className="btn" onClick={() => setStage("orders")}>
              Review orders
            </button>
          </>
        )}
        {stage === "investigate" && (
          <>
            {!isT0 && (
              <button className="btn sec" onClick={() => setStage("checkpoint")}>
                Back
              </button>
            )}
            <button className="btn" onClick={() => setStage(isT0 ? "diagnose" : "orders")}>
              {isT0 ? "Make a diagnosis" : "Review orders"}
            </button>
          </>
        )}
        {stage === "diagnose" && (
          <>
            <button className="btn sec" onClick={() => setStage("investigate")}>
              Back
            </button>
            <button className="btn" disabled={!rec.diagnosis} onClick={() => setStage("orders")}>
              Write orders
            </button>
          </>
        )}
        {stage === "orders" && <HoldButton label="Hold to sign orders" onDone={sign} disabled={!!challenge || (isT0 && !rec.diagnosis)} />}
      </div>

      {entryOpen && <DrugEntry v={v} initial={entryOpen} onClose={() => setEntryOpen(null)} onSubmit={(p) => addOrder(p)} />}
      {rewindOpen && <RewindSheet v={v} onClose={() => setRewindOpen(false)} onPick={rewind} />}
    </main>
  );
}

// ---------- Stages ----------

function Admission({ v }: { v: SessionView }) {
  const a = v.admission;
  return (
    <>
      <section className="sheet">
        <div className="sh">
          <h3>Presenting complaint</h3>
          <small>{v.patient.ward}</small>
        </div>
        <p className="pad p">{a.history}</p>
      </section>
      <section className="sheet">
        <div className="sh">
          <h3>On arrival</h3>
        </div>
        <div style={{ padding: 0 }}>
          <VitalsStrip v={a.arrival} />
        </div>
        <p className="pad p muted">{a.exam}</p>
      </section>
      <NurseNote n={v.records[0].nurseNote} />
      <p className="note-s">
        {a.source.label} ({a.source.license}). Written by {a.authors.join(", ")}; {a.reviewers.length ? `reviewed by ${a.reviewers.join(", ")}` : "not yet reviewed"}.
      </p>
    </>
  );
}

function Checkpoint({ v, rec }: { v: SessionView; rec: Rec }) {
  const points = v.records.map((r, i) => ({
    cp: r.checkpoint,
    k: r.chart.k,
    // Orders written at the previous checkpoint are what produced this column.
    orders: i === v.records.length - 1 ? ["your orders"] : r.orders.filter((o) => !o.stoppedAt && o.kind !== "monitoring").map((o) => o.short).slice(0, 4),
  }));
  const anyK = points.some((p) => p.k != null);
  return (
    <div className="slide-up" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <VitalsStrip v={rec.vitals} />
      {rec.labsBack.length + rec.monitoring.length > 0 && (
        <section className="sheet">
          <div className="sh">
            <h3>Results back</h3>
            <small>from your orders</small>
          </div>
          {[...rec.monitoring, ...rec.labsBack].map((r) => (
            <div className="ln" key={r.id + r.name}>
              <span>{r.name}</span>
              <span className={`v ${r.abnormal ? "hi" : ""}`}>{r.value}</span>
            </div>
          ))}
        </section>
      )}
      <section className="sheet">
        <div className="sh">
          <h3>Observation chart</h3>
          <small>K+ mmol/L, where measured</small>
        </div>
        <div style={{ padding: "4px 2px 6px" }}>
          {anyK ? <ObsChart points={points} /> : <p className="empty">No potassium measured yet. Order a K+ or a VBG to chart it.</p>}
        </div>
      </section>
      <NurseNote n={rec.nurseNote} />
    </div>
  );
}

function Investigate({ v, rec, onOrder, isT0 }: { v: SessionView; rec: Rec; onOrder: (id: string) => void; isT0: boolean }) {
  const bedside = v.catalog.investigations.filter((i) => i.kind === "bedside");
  const lab = v.catalog.investigations.filter((i) => i.kind === "lab");
  const result = (id: string) => rec.bedside.find((b) => b.id === id);
  return (
    <>
      {isT0 && (
        <section className="sheet">
          <div className="sh">
            <h3>Examination</h3>
          </div>
          <p className="pad p">{v.admission.exam}</p>
        </section>
      )}
      <section className="sheet">
        <div className="sh">
          <h3>Bedside · results now</h3>
          <small>{rec.investigations.length} ordered</small>
        </div>
        {bedside.map((i) => {
          const r = result(i.id);
          return r ? (
            <div className="ln" key={i.id}>
              <span>{i.name}</span>
              <span className={`v ${r.abnormal ? "hi" : ""}`}>{r.value}</span>
            </div>
          ) : (
            <button className="ln" key={i.id} onClick={() => onOrder(i.id)}>
              <span>{i.name}</span>
              <span className="tag">order</span>
            </button>
          );
        })}
      </section>
      <section className="sheet">
        <div className="sh">
          <h3>Lab · back at next checkpoint</h3>
        </div>
        {lab.map((i) => {
          const sent = rec.investigations.includes(i.id);
          return sent ? (
            <div className="ln" key={i.id}>
              <span>{i.name}</span>
              <span className="tag sent">sent</span>
            </div>
          ) : (
            <button className="ln" key={i.id} onClick={() => onOrder(i.id)}>
              <span>{i.name}</span>
              <span className="tag">order</span>
            </button>
          );
        })}
      </section>
      <p className="note-s">Ordering a lot before treating is noted. The patient is still waiting.</p>
    </>
  );
}

function Diagnose({ v, rec, onPick }: { v: SessionView; rec: Rec; onPick: (id: string) => void }) {
  return (
    <>
      <h2 className="h2" style={{ fontSize: 24 }}>
        What is going on?
      </h2>
      <section className="sheet">
        {v.catalog.diagnoses.map((d) => (
          <button key={d.id} className="opt" onClick={() => onPick(d.id)} aria-pressed={rec.diagnosis === d.id}>
            <span className={`radio ${rec.diagnosis === d.id ? "on" : ""}`} />
            {rec.diagnosis === d.id ? <b>{d.label}</b> : d.label}
          </button>
        ))}
      </section>
      <p className="note-s">Your working diagnosis is marked at the end. It doesn&apos;t change what happens to the patient; your orders do.</p>
    </>
  );
}

function OrderSheet({
  v,
  rec,
  challenge,
  onStop,
  onAdd,
  onChange,
  onInsist,
}: {
  v: SessionView;
  rec: Rec;
  challenge: (Pending & { msg: string }) | null;
  onStop: (uid: string) => void;
  onAdd: () => void;
  onChange: () => void;
  onInsist: () => void;
}) {
  return (
    <>
      <section className="sheet">
        <div className="sh">
          <h3>Orders · {rec.checkpoint}</h3>
          <small>{v.run.scored ? "you" : v.run.label.toLowerCase()}</small>
        </div>
        {rec.orders.length === 0 && <p className="empty">Nothing written yet.</p>}
        {rec.orders.map((o) => (
          <div key={o.uid} className={`order ${o.stoppedAt ? "stopped" : ""}`}>
            <span className="t">{o.writtenAt}</span>
            <span>
              <span className="txt">{o.text}</span>
              {o.calc && !o.stoppedAt && <span className="sub mono">{o.calc}</span>}
              {o.stoppedAt && <span className="sub">stopped at {o.stoppedAt}</span>}
              {o.insisted && <span className="sub" style={{ color: "var(--red)" }}>given after the nurse questioned it</span>}
            </span>
            {!o.stoppedAt && (
              <button className="x" onClick={() => onStop(o.uid)}>
                Stop
              </button>
            )}
          </div>
        ))}
      </section>
      {challenge && (
        <div className="challenge" role="alert">
          <div className="who">Staff Nurse Shirin</div>
          Sir/Madam, {challenge.text}? {challenge.msg.split("?").slice(1).join("?").trim() || "Please confirm."}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn sm" onClick={onChange}>
              Change the order
            </button>
            <button className="btn sm redline" onClick={onInsist}>
              Give as written
            </button>
          </div>
        </div>
      )}
      <button className="field" style={{ fontFamily: "var(--body)", fontSize: 14, color: "var(--ink-2)" }} onClick={onAdd} disabled={!!challenge}>
        + Add drug, fluid or monitoring
      </button>
      <p className="note-s">No hints about what is right. Signed orders carry over to the next checkpoint until you stop them.</p>
    </>
  );
}

function DrugEntry({ v, initial, onClose, onSubmit }: { v: SessionView; initial: Partial<Pending>; onClose: () => void; onSubmit: (p: Pending) => void }) {
  const [q, setQ] = useState("");
  const [drug, setDrug] = useState<Drug | null>(() => v.catalog.formulary.find((d) => d.id === initial.drugId) ?? null);
  const [route, setRoute] = useState(initial.route ?? "");
  const [dose, setDose] = useState(initial.dose != null ? String(initial.dose) : "");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return v.catalog.formulary.filter((d) => !s || d.name.toLowerCase().includes(s) || d.brands.some((b) => b.toLowerCase().includes(s)));
  }, [q, v.catalog.formulary]);
  const r = drug?.routes.find((x) => x.id === route);
  const isMon = drug?.kind === "monitoring";
  const n = Number(dose);
  const valid = drug && (isMon || (route && dose !== "" && Number.isFinite(n) && n >= 0));
  const submit = () => {
    if (!drug || !valid) return;
    const rt = isMon ? drug.routes[0].id : route;
    const unit = drug.routes.find((x) => x.id === rt)?.unit ?? "";
    const label = drug.routes.concat().find((x) => x.id === rt)?.label ?? rt;
    onSubmit({ drugId: drug.id, route: rt, dose: isMon ? 1 : n, text: isMon ? drug.name : `${drug.name} ${n} ${unit} ${label}` });
  };
  return (
    <div className="sheet-over" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add order">
        {!drug ? (
          <>
            <div className="field" style={{ fontFamily: "var(--body)", fontSize: 14 }}>
              <input autoFocus placeholder="Search drug, brand, fluid or monitoring" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="sheet" style={{ maxHeight: "55dvh", overflow: "auto" }}>
              {list.map((d) => (
                <button
                  key={d.id}
                  className="ln"
                  onClick={() => {
                    setDrug(d);
                    setRoute(d.routes.length === 1 ? d.routes[0].id : "");
                  }}
                >
                  <span>
                    <b style={{ fontWeight: 700 }}>{d.name}</b>
                    {d.brands.length > 0 && <span className="note-s"> · {d.brands.join(", ")}</span>}
                  </span>
                  <span className="tag">{d.kind}</span>
                </button>
              ))}
              {list.length === 0 && <p className="empty">Not on this ward&apos;s formulary.</p>}
            </div>
          </>
        ) : (
          <>
            <div className="sh" style={{ padding: 0, border: 0 }}>
              <h3 style={{ fontSize: 18 }}>{drug.name}</h3>
              <button className="x note-s" style={{ textDecoration: "underline" }} onClick={() => setDrug(null)}>
                change
              </button>
            </div>
            {!isMon && (
              <>
                <div className="lab">Route</div>
                <div className="sheet">
                  {drug.routes.map((x) => (
                    <button
                      key={x.id}
                      className="opt"
                      onClick={() => {
                        // A dose means something different on another route (U vs U/h), so never carry it over.
                        if (x.id !== route && x.unit !== r?.unit) setDose("");
                        setRoute(x.id);
                      }}
                      aria-pressed={route === x.id}
                    >
                      <span className={`radio ${route === x.id ? "on" : ""}`} />
                      {x.label}
                    </button>
                  ))}
                </div>
                <div className="lab">Dose{r ? ` (${r.unit})` : ""}</div>
                <div className="field">
                  <input inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" style={{ color: "var(--blue)" }} />
                  <span className="muted">{r?.unit}</span>
                </div>
                {r?.perKg && dose && Number.isFinite(n) && (
                  <div className="mono" style={{ fontSize: 13 }}>
                    {n} {r.unit} ÷ {v.patient.weightKg} kg = {(n / v.patient.weightKg).toFixed(2)} {r.unit.replace("/h", "/kg/h")}
                  </div>
                )}
              </>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn sec" onClick={onClose}>
                Cancel
              </button>
              <button className="btn" disabled={!valid} onClick={submit}>
                Add to sheet
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RewindSheet({ v, onClose, onPick }: { v: SessionView; onClose: () => void; onPick: (cp: string) => void }) {
  const options = v.records.filter((r) => r.signed && v.checkpoints.includes(r.checkpoint) && !(v.outcome && r === v.records[v.records.length - 1]));
  const [pick, setPick] = useState(options[0]?.checkpoint ?? "");
  return (
    <div className="sheet-over" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Rewind">
        <h2 className="h2" style={{ fontSize: 24 }}>
          Rewind to
        </h2>
        <p className="note-s">
          {v.run.scored ? "Your scored run stays as it is. " : ""}This becomes <b>Branch {v.runs.length + 1}</b>, for practice. Change what you wrote and replay forward.
        </p>
        <div className="sheet" style={{ background: "var(--field)" }}>
          {options.map((r) => (
            <button key={r.checkpoint} className="opt" onClick={() => setPick(r.checkpoint)} aria-pressed={pick === r.checkpoint}>
              <span className={`radio ${pick === r.checkpoint ? "on" : ""}`} />
              <span>
                <b className="mono">{r.checkpoint}</b>
                <span className="note-s" style={{ display: "block" }}>
                  {r.orders.filter((o) => !o.stoppedAt && o.kind !== "monitoring").map((o) => o.short).join(" · ") || "no treatment orders"}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sec" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={!pick} onClick={() => onPick(pick)}>
            Rewind to {pick}
          </button>
        </div>
      </div>
    </div>
  );
}

function OutcomeDoc({ v }: { v: SessionView }) {
  const o = v.outcome!;
  const title = { recovered: "Discharge summary", complication: "Discharge summary", icu: "ICU transfer note", died: "Death note" }[o.kind];
  const label = { recovered: "Recovered", complication: "Recovered with complication", icu: "Transferred to ICU", died: "Died" }[o.kind];
  return (
    <section className="sheet">
      <div style={{ padding: "14px 14px 10px", borderBottom: "2px solid var(--ink)" }}>
        <div className="mono faint" style={{ fontSize: 10.5 }}>
          {v.patient.ward} · Bed {v.patient.bed} · {v.run.label}
        </div>
        <div style={{ fontFamily: "var(--head)", fontStretch: "85%", fontWeight: 800, fontSize: 26, lineHeight: 1.05, marginTop: 4 }}>{title}</div>
        <div className="mono" style={{ fontSize: 11.5, marginTop: 4 }}>
          {v.patient.name} · {v.patient.age}
          {v.patient.sex} · {o.endedAt}
        </div>
      </div>
      <div className="ln">
        <span>Diagnosis</span>
        <span>{o.diagnosis}</span>
      </div>
      <div className="ln">
        <span>Course</span>
        <span className={o.course.length ? "hi" : ""}>{o.course.join(", ") || "Uneventful"}</span>
      </div>
      <div className="ln">
        <span>Stable by</span>
        <span className="v">{o.stableBy}</span>
      </div>
      <div className="ln">
        <span>Outcome</span>
        <b>{label}</b>
      </div>
      <p className="pad p muted" style={{ borderTop: "1px solid var(--rule-soft)" }}>
        {o.note ? `${o.note} ` : ""}
        {o.discharge}
      </p>
      <div className="mono faint" style={{ padding: "10px 14px", borderTop: "1px solid var(--rule-soft)", fontSize: 10.5 }}>
        Signed: Dr. (you), {v.patient.ward}
      </div>
    </section>
  );
}
